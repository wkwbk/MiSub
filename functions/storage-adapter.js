/**
 * 数据存储抽象层（纯 D1 八表职责分离与索引行级存储）
 * - subscriptions: 远程机场订阅（http/https，按 id 行级存储）
 * - nodes:         手动节点（代理协议 URI，纯 UUID 按 id 行级存储）
 * - profiles:      订阅组（按 id 行级存储，带 custom_id 索引列与原子 downloadCount）
 * - guestbook:     访客留言（按 id 行级存储）
 * - settings:      纯系统设置、认证密钥与模板/客户端配置
 * - cache:         节点缓存、GitHub Release 缓存、限流、任务锁与运行快照（带 expires_at 索引列）
 * - access_logs:   订阅访问日志（按 id 行级追加存储，带 timestamp 降序索引）
 * - error_reports: 前端异常上报（按 id 行级追加存储，带 timestamp 降序索引）
 */

import {
  ACCESS_LOG_MAX_AGE_MS,
  computeCacheExpiresAt,
  D1_KNOWN_SETTINGS_KEYS,
  DATA_KEYS,
  ensureD1Schema,
  ID_DATA_TABLES,
  isCacheKey,
  isManualNodeRecord,
  isNoSuchTableError,
  isSchemaMismatchError,
  KEY_VALUE_TABLES,
  parseTimestampMs,
  STORAGE_TYPES,
} from './storage/d1-schema.js';
import { invalidateD1CollectionCache, readCachedD1Collection } from './storage/d1-collection-cache.js';
import { NoopStorageAdapter } from './storage/noop-adapter.js';
import { resolvePublicProfile } from '../shared/profile-link.js';

export { ensureD1Schema, isManualNodeRecord, STORAGE_TYPES };

let settingsCaches = new WeakMap();
const SETTINGS_CACHE_TTL_MS = 10 * 1000;

export function clearSettingsCache() {
  settingsCaches = new WeakMap();
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

/**
 * D1 存储适配器（八表职责分离与索引行级存储）
 */
class D1StorageAdapter {
  constructor(d1Database) {
    this.db = d1Database;
    this.type = STORAGE_TYPES.D1;
  }

  async _withSchemaRetry(operation) {
    try {
      return await operation();
    } catch (error) {
      if (isSchemaMismatchError(error)) {
        await ensureD1Schema(this.db);
        return await operation();
      }
      throw error;
    }
  }

  async _runBatchOrSequential(statements, chunkSize = 80) {
    if (!Array.isArray(statements) || statements.length === 0) return;
    if (typeof this.db.batch === 'function') {
      const safeChunkSize = Math.max(1, Number(chunkSize) || 80);
      for (let i = 0; i < statements.length; i += safeChunkSize) {
        await this.db.batch(statements.slice(i, i + safeChunkSize));
      }
      return;
    }
    for (const stmt of statements) {
      await stmt.run();
    }
  }

  async get(key, type = 'json', options = {}) {
    if (key === DATA_KEYS.SUBSCRIPTIONS) {
      return await this.getAllSubscriptions();
    }
    if (key === DATA_KEYS.PROFILES) {
      return await this.getAllProfiles();
    }

    const useSettingsCache = key === DATA_KEYS.SETTINGS && type === 'json' && !options?.fresh;
    if (useSettingsCache) {
      const cached = settingsCaches.get(this.db);
      if (cached && Date.now() - cached.timestamp < SETTINGS_CACHE_TTL_MS) {
        return structuredClone(cached.data);
      }
    }

    try {
      const { table, queryField, queryValue } = this._parseKey(key);
      const isKvTable = KEY_VALUE_TABLES.has(table);

      const result = await this.db
        .prepare(`SELECT ${isKvTable ? 'value as data' : 'data'} FROM ${table} WHERE ${queryField} = ?`)
        .bind(queryValue)
        .first();

      if (!result) return null;

      if (type !== 'json') {
        return result.data;
      }
      let parsed;
      try {
        parsed = JSON.parse(result.data);
      } catch {
        parsed = result.data;
      }
      if (useSettingsCache && parsed && typeof parsed === 'object') {
        settingsCaches.set(this.db, { data: parsed, timestamp: Date.now() });
        return structuredClone(parsed);
      }
      return parsed;
    } catch (error) {
      if (isSchemaMismatchError(error)) {
        return null;
      }
      console.error(`[D1] Failed to get key ${key}:`, error);
      return null;
    }
  }

  async put(key, value) {
    if (key === DATA_KEYS.SUBSCRIPTIONS) {
      return await this.syncAllSubscriptions(value);
    }
    if (key === DATA_KEYS.PROFILES) {
      return await this.syncAllProfiles(value);
    }

    try {
      const { table, queryValue } = this._parseKey(key);
      const isKvTable = KEY_VALUE_TABLES.has(table);
      const data = typeof value === 'string' ? value : JSON.stringify(value);

      await this._withSchemaRetry(async () => {
        if (table === 'cache') {
          const expiresAt = computeCacheExpiresAt(queryValue, value);
          await this.db
            .prepare(
              `
                        INSERT OR REPLACE INTO cache (key, value, expires_at, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    `,
            )
            .bind(queryValue, data, expiresAt)
            .run();
        } else if (isKvTable) {
          await this.db
            .prepare(
              `
                        INSERT OR REPLACE INTO ${table} (key, value, updated_at)
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                    `,
            )
            .bind(queryValue, data)
            .run();
        } else {
          await this.db
            .prepare(
              `
                        INSERT OR REPLACE INTO ${table} (id, data, updated_at)
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                    `,
            )
            .bind(queryValue, data)
            .run();
        }
      });

      if (key === DATA_KEYS.SETTINGS) {
        settingsCaches.delete(this.db);
      }
      if (ID_DATA_TABLES.has(table)) {
        invalidateD1CollectionCache(this.db, table);
      }
      return true;
    } catch (error) {
      console.error(`[D1] Failed to put key ${key}:`, error);
      throw error;
    }
  }

  async delete(key) {
    if (key === DATA_KEYS.SUBSCRIPTIONS) {
      for (const tbl of ['subscriptions', 'nodes']) {
        try {
          await this.db.prepare(`DELETE FROM ${tbl}`).run();
        } catch (error) {
          if (!isNoSuchTableError(error)) throw error;
        }
        invalidateD1CollectionCache(this.db, tbl);
      }
      return true;
    }
    if (key === DATA_KEYS.PROFILES) {
      try {
        await this.db.prepare('DELETE FROM profiles').run();
      } catch (error) {
        if (!isNoSuchTableError(error)) throw error;
      }
      invalidateD1CollectionCache(this.db, 'profiles');
      return true;
    }

    try {
      const { table, queryField, queryValue } = this._parseKey(key);

      await this.db.prepare(`DELETE FROM ${table} WHERE ${queryField} = ?`).bind(queryValue).run();

      if (key === DATA_KEYS.SETTINGS) {
        settingsCaches.delete(this.db);
      }
      if (ID_DATA_TABLES.has(table)) {
        invalidateD1CollectionCache(this.db, table);
      }
      return true;
    } catch (error) {
      if (isSchemaMismatchError(error)) {
        return true;
      }
      console.error(`[D1] Failed to delete key ${key}:`, error);
      throw error;
    }
  }

  async list(prefix) {
    try {
      const effectivePrefix = prefix || '';
      const keys = [];

      const targetTables = [];
      if (!effectivePrefix) {
        targetTables.push(
          { name: 'subscriptions', keyField: 'id' },
          { name: 'nodes', keyField: 'id' },
          { name: 'profiles', keyField: 'id' },
          { name: 'guestbook', keyField: 'id' },
          { name: 'settings', keyField: 'key' },
          { name: 'cache', keyField: 'key' },
        );
      } else if (isCacheKey(effectivePrefix)) {
        targetTables.push({ name: 'cache', keyField: 'key' });
      } else if (effectivePrefix.startsWith(DATA_KEYS.SUBSCRIPTIONS)) {
        targetTables.push({ name: 'subscriptions', keyField: 'id' }, { name: 'nodes', keyField: 'id' });
      } else if (effectivePrefix.startsWith(DATA_KEYS.PROFILES)) {
        targetTables.push({ name: 'profiles', keyField: 'id' });
      } else {
        targetTables.push({ name: 'settings', keyField: 'key' });
      }

      for (const table of targetTables) {
        try {
          let results;
          if (KEY_VALUE_TABLES.has(table.name) && effectivePrefix) {
            results = await this.db
              .prepare(`SELECT ${table.keyField} FROM ${table.name} WHERE ${table.keyField} LIKE ?`)
              .bind(`${effectivePrefix}%`)
              .all();
          } else {
            results = await this.db.prepare(`SELECT ${table.keyField} FROM ${table.name}`).all();
          }

          (results?.results || []).forEach((row) => {
            const key = this._buildKey(table.name, row[table.keyField]);
            if (key.startsWith(effectivePrefix)) {
              keys.push({ name: key });
            }
          });
        } catch (tableError) {
          if (!isNoSuchTableError(tableError)) {
            throw tableError;
          }
        }
      }

      return keys;
    } catch (error) {
      if (isNoSuchTableError(error)) {
        return [];
      }
      console.error(`[D1] Failed to list keys with prefix ${prefix}:`, error);
      return [];
    }
  }

  async _readTableRows(table) {
    return readCachedD1Collection(this.db, table, async () => {
      try {
        const results = await this.db.prepare(`SELECT data FROM ${table}`).all();
        if (!Array.isArray(results?.results)) return [];

        const deduped = new Map();
        results.results.forEach((row) => {
          const parsed = JSON.parse(row.data);
          if (Array.isArray(parsed)) {
            parsed.forEach((item) => {
              if (item?.id) deduped.set(item.id, item);
            });
          } else if (parsed?.id) {
            deduped.set(parsed.id, parsed);
          }
        });
        return Array.from(deduped.values()).sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
      } catch (error) {
        invalidateD1CollectionCache(this.db, table);
        if (isNoSuchTableError(error)) return [];
        console.error(`[D1] Failed to read ${table}:`, error);
        return [];
      }
    });
  }

  /**
   * 仅读取远程机场订阅（subscriptions 表）
   */
  async getRemoteSubscriptions() {
    return this._readTableRows('subscriptions');
  }

  /**
   * 仅读取手动节点（nodes 表，不扫描 subscriptions 表）
   */
  async getManualNodes() {
    return this._readTableRows('nodes');
  }

  async getSubscriptionById(id) {
    for (const table of ['subscriptions', 'nodes']) {
      try {
        const result = await this.db.prepare(`SELECT data FROM ${table} WHERE id = ?`).bind(id).first();
        if (result) return JSON.parse(result.data);
      } catch (error) {
        if (!isNoSuchTableError(error)) {
          console.error(`[D1] Failed to get ${table} item ${id}:`, error);
        }
      }
    }
    return null;
  }

  /**
   * 读取合并集合（供 /api/data、全局订阅、备份等统一接口使用）
   */
  async getAllSubscriptions() {
    const [subs, nodes] = await Promise.all([this._readTableRows('subscriptions'), this._readTableRows('nodes')]);
    const deduped = new Map();
    subs.forEach((item) => {
      if (item?.id) deduped.set(item.id, item);
    });
    nodes.forEach((item) => {
      if (item?.id) deduped.set(item.id, item);
    });
    return Array.from(deduped.values()).sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
  }

  /**
   * 通过主键 id 或索引列 custom_id / link_id 单行精准查询订阅组（供内部引用/管理使用）
   */
  async getProfileById(idOrCustomId) {
    if (!idOrCustomId) return null;
    const target = String(idOrCustomId).trim();
    if (!target) return null;

    try {
      const result = await this._withSchemaRetry(() =>
        this.db
          .prepare('SELECT data FROM profiles WHERE id = ? OR custom_id = ? OR link_id = ? LIMIT 1')
          .bind(target, target, target)
          .first(),
      );
      return result?.data ? JSON.parse(result.data) : null;
    } catch (error) {
      if (isSchemaMismatchError(error)) return null;
      console.error(`[D1] Failed to get profile ${idOrCustomId}:`, error);
      return null;
    }
  }

  /**
   * 通过公开订阅路径标识查找订阅组（严格执行 customId > linkId > 历史未迁移 id 的降级失效规则）
   */
  async getPublicProfileByIdentifier(identifier) {
    if (!identifier) return null;
    const target = String(identifier).trim();
    if (!target) return null;

    try {
      const rows = await this._withSchemaRetry(() =>
        this.db
          .prepare(
            'SELECT data FROM profiles WHERE id = ? OR custom_id = ? OR link_id = ? OR LOWER(custom_id) = LOWER(?) OR LOWER(link_id) = LOWER(?)',
          )
          .bind(target, target, target, target, target)
          .all(),
      );
      const candidates = (rows?.results || [])
        .map((row) => {
          try {
            return JSON.parse(row.data);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return resolvePublicProfile(candidates, target);
    } catch (error) {
      if (isSchemaMismatchError(error)) return null;
      console.error(`[D1] Failed to resolve public profile ${identifier}:`, error);
      return null;
    }
  }

  async getAllProfiles() {
    return this._readTableRows('profiles');
  }

  /**
   * 使用 SQLite json_set 单条语句原子自增订阅组下载计数（零预读、无并发丢数）
   */
  async incrementProfileDownloadCount(idOrCustomId) {
    if (!idOrCustomId) return null;
    const target = String(idOrCustomId).trim();
    if (!target) return null;

    try {
      const updatedRow = await this._withSchemaRetry(() =>
        this.db
          .prepare(
            `UPDATE profiles
                         SET data = json_set(
                                 data,
                                 '$.downloadCount',
                                 COALESCE(CAST(json_extract(data, '$.downloadCount') AS INTEGER), 0) + 1
                             ),
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = ? OR custom_id = ?
                         RETURNING json_extract(data, '$.downloadCount') AS downloadCount`,
          )
          .bind(target, target)
          .first(),
      );

      if (updatedRow && updatedRow.downloadCount !== undefined) {
        invalidateD1CollectionCache(this.db, 'profiles');
        return Number(updatedRow.downloadCount);
      }
    } catch {
    }

    const existing = await this.getProfileById(target);
    if (!existing?.id) return null;
    const nextProfile = {
      ...existing,
      downloadCount: (Number(existing.downloadCount) || 0) + 1,
    };
    await this.putProfile(nextProfile);
    return nextProfile.downloadCount;
  }

  /**
   * 重置订阅组下载计数（传入 profileId 时仅重置该订阅组，否则重置全部订阅组）
   */
  async resetProfileDownloadCounts({ profileId = '' } = {}) {
    const trimmedId = typeof profileId === 'string' ? profileId.trim() : '';
    try {
      await this._withSchemaRetry(async () => {
        if (trimmedId) {
          await this.db
            .prepare(
              `UPDATE profiles
               SET data = json_set(data, '$.downloadCount', 0),
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
            )
            .bind(trimmedId)
            .run();
        } else {
          await this.db
            .prepare(
              `UPDATE profiles
               SET data = json_set(data, '$.downloadCount', 0),
                   updated_at = CURRENT_TIMESTAMP`,
            )
            .run();
        }
      });
      invalidateD1CollectionCache(this.db, 'profiles');
      return true;
    } catch (error) {
      if (isSchemaMismatchError(error)) return false;
      console.error('[D1] Failed to reset profile download counts:', error);
      return false;
    }
  }

  // ========== 留言板专用表操作 (guestbook) ==========

  async getAllGuestbookMessages() {
    const rows = await this._readTableRows('guestbook');
    return rows.sort((a, b) => Date.parse(b?.createdAt || '') - Date.parse(a?.createdAt || ''));
  }

  async getGuestbookMessageById(id) {
    try {
      const result = await this.db.prepare('SELECT data FROM guestbook WHERE id = ?').bind(id).first();
      return result ? JSON.parse(result.data) : null;
    } catch (error) {
      if (isNoSuchTableError(error)) return null;
      console.error(`[D1] Failed to get guestbook message ${id}:`, error);
      return null;
    }
  }

  async putGuestbookMessage(message) {
    await this._withSchemaRetry(async () => {
      await this.db
        .prepare(
          `
                INSERT OR REPLACE INTO guestbook (id, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `,
        )
        .bind(message.id, JSON.stringify(message))
        .run();
    });
    invalidateD1CollectionCache(this.db, 'guestbook');
    return message;
  }

  async deleteGuestbookMessageById(id) {
    try {
      const result = await this.db.prepare('DELETE FROM guestbook WHERE id = ?').bind(id).run();
      invalidateD1CollectionCache(this.db, 'guestbook');
      return Boolean(result?.success);
    } catch (error) {
      if (isNoSuchTableError(error)) return false;
      throw error;
    }
  }

  // ========== 访问日志专用行级表操作 (access_logs) ==========

  async insertAccessLogs(entries = [], { maxAgeMs = ACCESS_LOG_MAX_AGE_MS, maxEntries = 200 } = {}) {
    if (!Array.isArray(entries) || entries.length === 0) return 0;

    const now = Date.now();
    const validEntries = entries.filter((item) => item && typeof item === 'object');
    if (validEntries.length === 0) return 0;

    await this._withSchemaRetry(async () => {
      const statements = validEntries.map((item) => {
        const id = item.id || crypto.randomUUID();
        const ts = parseTimestampMs(item.timestamp) || now;
        const payload = JSON.stringify({ ...item, id, timestamp: ts });
        return this.db
          .prepare(
            `INSERT OR REPLACE INTO access_logs (id, timestamp, data, created_at)
                         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          )
          .bind(id, ts, payload);
      });

      if (maxAgeMs > 0) {
        statements.push(this.db.prepare('DELETE FROM access_logs WHERE timestamp < ?').bind(now - maxAgeMs));
      }
      if (maxEntries > 0) {
        statements.push(
          this.db
            .prepare(
              `DELETE FROM access_logs
                             WHERE id NOT IN (
                                 SELECT id FROM access_logs ORDER BY timestamp DESC LIMIT ?
                             )`,
            )
            .bind(maxEntries),
        );
      }

      await this._runBatchOrSequential(statements);
    });

    return validEntries.length;
  }

  async getAccessLogs({ limit = 200, minTimestamp = 0 } = {}) {
    try {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
      const safeMinTs = Math.max(0, Number(minTimestamp) || 0);
      const result = await this.db
        .prepare(
          `SELECT data FROM access_logs
                     WHERE timestamp >= ?
                     ORDER BY timestamp DESC
                     LIMIT ?`,
        )
        .bind(safeMinTs, safeLimit)
        .all();

      return (result?.results || [])
        .map((row) => {
          try {
            return JSON.parse(row.data);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch (error) {
      if (isSchemaMismatchError(error)) return [];
      console.error('[D1] Failed to read access_logs:', error);
      return [];
    }
  }

  async clearAccessLogs({ profileId = '', profileName = '' } = {}) {
    const targetProfileId = typeof profileId === 'string' ? profileId.trim() : '';
    const targetProfileName = typeof profileName === 'string' ? profileName.trim() : '';
    if (targetProfileId) {
      try {
        await this.db
          .prepare(
            `DELETE FROM access_logs
             WHERE json_extract(data, '$.profileId') = ?
                OR (json_extract(data, '$.profileId') IS NULL AND ? != '' AND json_extract(data, '$.profileName') = ?)`,
          )
          .bind(targetProfileId, targetProfileName, targetProfileName)
          .run();
      } catch (error) {
        if (!isSchemaMismatchError(error)) throw error;
      }
      return true;
    }

    if (targetProfileName) {
      try {
        await this.db
          .prepare("DELETE FROM access_logs WHERE json_extract(data, '$.profileName') = ?")
          .bind(targetProfileName)
          .run();
      } catch (error) {
        if (!isSchemaMismatchError(error)) throw error;
      }
      return true;
    }

    try {
      await this.db.prepare('DELETE FROM access_logs').run();
    } catch (error) {
      if (!isSchemaMismatchError(error)) throw error;
    }
    return true;
  }

  // ========== 前端异常上报专用行级表操作 (error_reports) ==========

  async insertErrorReport(report, maxEntries = 100) {
    if (!report || typeof report !== 'object') return false;
    const id = report.id || crypto.randomUUID();
    const ts = parseTimestampMs(report.receivedAt) || Date.now();
    const payload = JSON.stringify({ ...report, id });

    await this._withSchemaRetry(async () => {
      const statements = [
        this.db
          .prepare(
            `INSERT OR REPLACE INTO error_reports (id, timestamp, data, created_at)
                         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          )
          .bind(id, ts, payload),
      ];
      if (maxEntries > 0) {
        statements.push(
          this.db
            .prepare(
              `DELETE FROM error_reports
                             WHERE id NOT IN (
                                 SELECT id FROM error_reports ORDER BY timestamp DESC LIMIT ?
                             )`,
            )
            .bind(maxEntries),
        );
      }
      await this._runBatchOrSequential(statements);
    });

    return true;
  }

  async getErrorReports(limit = 100) {
    try {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
      const result = await this.db
        .prepare('SELECT data FROM error_reports ORDER BY timestamp DESC LIMIT ?')
        .bind(safeLimit)
        .all();
      return (result?.results || [])
        .map((row) => {
          try {
            return JSON.parse(row.data);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch (error) {
      if (isSchemaMismatchError(error)) return [];
      console.error('[D1] Failed to read error_reports:', error);
      return [];
    }
  }

  async clearErrorReports() {
    try {
      await this.db.prepare('DELETE FROM error_reports').run();
    } catch (error) {
      if (!isSchemaMismatchError(error)) throw error;
    }
    return true;
  }

  // ========== 订阅源与手动节点分表读写 ==========

  async updateSubscriptionById(id, updater) {
    let existing = null;
    let sourceTable = null;
    for (const table of ['subscriptions', 'nodes']) {
      try {
        const result = await this.db.prepare(`SELECT data FROM ${table} WHERE id = ?`).bind(id).first();
        if (result) {
          existing = JSON.parse(result.data);
          sourceTable = table;
          break;
        }
      } catch (error) {
        if (!isNoSuchTableError(error)) {
          console.error(`[D1] Failed to get ${table} item ${id}:`, error);
        }
      }
    }
    if (!existing) return null;
    const updated = updater({ ...existing });
    const targetTable = isManualNodeRecord(updated) ? 'nodes' : 'subscriptions';
    await this.putSubscription(updated, { skipOtherTableDelete: sourceTable === targetTable });
    return updated;
  }

  async putSubscription(item, { skipOtherTableDelete = false } = {}) {
    const isManual = isManualNodeRecord(item);
    const targetTable = isManual ? 'nodes' : 'subscriptions';
    const otherTable = isManual ? 'subscriptions' : 'nodes';

    await this._withSchemaRetry(async () => {
      await this.db
        .prepare(
          `
                INSERT OR REPLACE INTO ${targetTable} (id, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `,
        )
        .bind(item.id, JSON.stringify(item))
        .run();
    });
    invalidateD1CollectionCache(this.db, targetTable);

    if (!skipOtherTableDelete) {
      try {
        await this.db.prepare(`DELETE FROM ${otherTable} WHERE id = ?`).bind(item.id).run();
        invalidateD1CollectionCache(this.db, otherTable);
      } catch {
      }
    }

    return item;
  }

  async deleteSubscriptionById(id) {
    let deleted = false;
    for (const table of ['subscriptions', 'nodes']) {
      try {
        const result = await this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
        invalidateD1CollectionCache(this.db, table);
        if (result?.success) deleted = true;
      } catch (error) {
        if (!isNoSuchTableError(error)) throw error;
      }
    }

    if (id) {
      await this.delete(`node_cache_subscription_${encodeURIComponent(id)}`).catch(() => undefined);
    }

    return deleted;
  }

  async putProfile(item) {
    const customId = typeof item?.customId === 'string' && item.customId.trim() ? item.customId.trim() : null;
    const linkId = typeof item?.linkId === 'string' && item.linkId.trim() ? item.linkId.trim() : null;

    await this._withSchemaRetry(async () => {
      await this.db
        .prepare(
          `
                INSERT OR REPLACE INTO profiles (id, custom_id, link_id, data, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `,
        )
        .bind(item.id, customId, linkId, JSON.stringify(item))
        .run();
    });
    invalidateD1CollectionCache(this.db, 'profiles');
    return item;
  }

  async deleteProfileById(id) {
    let customId = '';
    let linkId = '';
    try {
      const existingRow = await this.db.prepare('SELECT data FROM profiles WHERE id = ?').bind(id).first();
      if (existingRow?.data) {
        const parsed = JSON.parse(existingRow.data);
        customId = typeof parsed?.customId === 'string' ? parsed.customId.trim() : '';
        linkId = typeof parsed?.linkId === 'string' ? parsed.linkId.trim() : '';
      }
    } catch {
    }

    const result = await this.db.prepare('DELETE FROM profiles WHERE id = ?').bind(id).run();
    invalidateD1CollectionCache(this.db, 'profiles');

    const idsToClean = new Set([id, customId, linkId].filter(Boolean));
    await Promise.all(
      Array.from(idsToClean).map((pid) => this.delete(`node_cache_profile_${pid}`).catch(() => undefined)),
    );

    return Boolean(result?.success);
  }

  async _queryByIdsChunked(table, ids) {
    const CHUNK_SIZE = 90;
    const hits = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      try {
        const results = await this.db
          .prepare(`SELECT data FROM ${table} WHERE id IN (${placeholders})`)
          .bind(...chunk)
          .all();
        if (Array.isArray(results?.results)) {
          hits.push(...results.results.map((row) => JSON.parse(row.data)));
        }
      } catch (error) {
        if (!isNoSuchTableError(error)) throw error;
      }
    }
    return hits;
  }

  /**
   * 按订阅源 ID 与手动节点 ID 分别直查对应表（消除跨表无效查询）
   */
  async getProfileSources(subscriptionIds = [], manualNodeIds = []) {
    const uniqueSubIds = Array.from(new Set(subscriptionIds.filter(Boolean)));
    const uniqueNodeIds = Array.from(new Set(manualNodeIds.filter(Boolean)));
    if (uniqueSubIds.length === 0 && uniqueNodeIds.length === 0) return [];

    try {
      const [subHits, nodeHits] = await Promise.all([
        uniqueSubIds.length > 0 ? this._queryByIdsChunked('subscriptions', uniqueSubIds) : Promise.resolve([]),
        uniqueNodeIds.length > 0 ? this._queryByIdsChunked('nodes', uniqueNodeIds) : Promise.resolve([]),
      ]);

      const foundMap = new Map();
      subHits.forEach((item) => {
        if (item?.id) foundMap.set(item.id, item);
      });
      nodeHits.forEach((item) => {
        if (item?.id) foundMap.set(item.id, item);
      });

      return Array.from(foundMap.values());
    } catch (error) {
      if (isNoSuchTableError(error)) return [];
      console.error('[D1] Failed to get profile sources:', error);
      return [];
    }
  }

  async getSubscriptionsByIds(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const uniqueIds = Array.from(new Set(ids));
    try {
      const foundMap = new Map();
      const subHits = await this._queryByIdsChunked('subscriptions', uniqueIds);
      subHits.forEach((item) => {
        if (item?.id) foundMap.set(item.id, item);
      });

      const missingIds = uniqueIds.filter((id) => !foundMap.has(id));
      if (missingIds.length > 0) {
        const nodeHits = await this._queryByIdsChunked('nodes', missingIds);
        nodeHits.forEach((item) => {
          if (item?.id) foundMap.set(item.id, item);
        });
      }

      return Array.from(foundMap.values());
    } catch (error) {
      if (isNoSuchTableError(error)) return [];
      console.error('[D1] Failed to get subscriptions/nodes by ids:', error);
      return [];
    }
  }

  async putAllSubscriptions(items) {
    if (!Array.isArray(items)) return false;
    const validItems = items.filter((item) => item?.id);
    if (validItems.length === 0) return true;

    const statements = [];
    for (const item of validItems) {
      const isManual = isManualNodeRecord(item);
      const targetTable = isManual ? 'nodes' : 'subscriptions';
      const otherTable = isManual ? 'subscriptions' : 'nodes';
      statements.push(
        this.db
          .prepare(
            `INSERT OR REPLACE INTO ${targetTable} (id, data, updated_at)
                         VALUES (?, ?, CURRENT_TIMESTAMP)`,
          )
          .bind(item.id, JSON.stringify(item)),
      );
      statements.push(this.db.prepare(`DELETE FROM ${otherTable} WHERE id = ?`).bind(item.id));
    }

    await this._withSchemaRetry(() => this._runBatchOrSequential(statements));
    invalidateD1CollectionCache(this.db, 'subscriptions');
    invalidateD1CollectionCache(this.db, 'nodes');
    return true;
  }

  async putAllProfiles(items) {
    if (!Array.isArray(items)) return false;
    const validItems = items.filter((item) => item?.id);
    if (validItems.length === 0) return true;

    const statements = validItems.map((item) => {
      const customId = typeof item?.customId === 'string' && item.customId.trim() ? item.customId.trim() : null;
      const linkId = typeof item?.linkId === 'string' && item.linkId.trim() ? item.linkId.trim() : null;
      return this.db
        .prepare(
          `INSERT OR REPLACE INTO profiles (id, custom_id, link_id, data, updated_at)
                     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        )
        .bind(item.id, customId, linkId, JSON.stringify(item));
    });

    await this._withSchemaRetry(() => this._runBatchOrSequential(statements));
    invalidateD1CollectionCache(this.db, 'profiles');
    return true;
  }

  async syncAllSubscriptions(items) {
    if (!Array.isArray(items)) return false;
    const [subRows, nodeRows] = await Promise.all([
      this._readTableRows('subscriptions'),
      this._readTableRows('nodes'),
    ]);
    const inSubscriptions = new Set();
    const inNodes = new Set();
    const currentMap = new Map();

    for (const item of subRows) {
      if (!item?.id) continue;
      inSubscriptions.add(item.id);
      currentMap.set(item.id, item);
    }
    for (const item of nodeRows) {
      if (!item?.id) continue;
      inNodes.add(item.id);
      currentMap.set(item.id, item);
    }

    const nextIds = new Set();
    const toUpsert = [];

    for (const item of items) {
      if (!item?.id) continue;
      nextIds.add(item.id);
      const existing = currentMap.get(item.id);
      const isManual = isManualNodeRecord(item);
      const needsMigration = isManual ? inSubscriptions.has(item.id) : inNodes.has(item.id);
      if (!existing || needsMigration || stableStringify(existing) !== stableStringify(item)) {
        toUpsert.push({ item, isManual, needsMigration });
      }
    }

    const toDelete = Array.from(currentMap.values()).filter((item) => item?.id && !nextIds.has(item.id));
    if (toUpsert.length === 0 && toDelete.length === 0) {
      return true;
    }

    const statements = [];
    for (const { item, isManual, needsMigration } of toUpsert) {
      const targetTable = isManual ? 'nodes' : 'subscriptions';
      const otherTable = isManual ? 'subscriptions' : 'nodes';
      statements.push(
        this.db
          .prepare(
            `INSERT OR REPLACE INTO ${targetTable} (id, data, updated_at)
                         VALUES (?, ?, CURRENT_TIMESTAMP)`,
          )
          .bind(item.id, JSON.stringify(item)),
      );
      if (needsMigration) {
        statements.push(this.db.prepare(`DELETE FROM ${otherTable} WHERE id = ?`).bind(item.id));
      }
    }

    for (const item of toDelete) {
      if (inSubscriptions.has(item.id)) {
        statements.push(this.db.prepare('DELETE FROM subscriptions WHERE id = ?').bind(item.id));
      }
      if (inNodes.has(item.id)) {
        statements.push(this.db.prepare('DELETE FROM nodes WHERE id = ?').bind(item.id));
      }
      if (!isManualNodeRecord(item)) {
        statements.push(
          this.db
            .prepare('DELETE FROM cache WHERE key = ?')
            .bind(`node_cache_subscription_${encodeURIComponent(item.id)}`),
        );
      }
    }

    await this._withSchemaRetry(() => this._runBatchOrSequential(statements));
    invalidateD1CollectionCache(this.db, 'subscriptions');
    invalidateD1CollectionCache(this.db, 'nodes');
    return true;
  }

  async syncAllProfiles(items) {
    if (!Array.isArray(items)) return false;
    const current = await this.getAllProfiles();
    const currentMap = new Map(current.filter((item) => item?.id).map((item) => [item.id, item]));
    const nextIds = new Set();
    const toUpsert = [];

    for (const item of items) {
      if (!item?.id) continue;
      nextIds.add(item.id);
      const existing = currentMap.get(item.id);
      const nextItem = existing
        ? {
            ...item,
            downloadCount: Math.max(Number(existing.downloadCount) || 0, Number(item.downloadCount) || 0),
          }
        : item;
      if (!existing || stableStringify(existing) !== stableStringify(nextItem)) {
        toUpsert.push(nextItem);
      }
    }

    const toDelete = current.filter((item) => item?.id && !nextIds.has(item.id));
    if (toUpsert.length === 0 && toDelete.length === 0) {
      return true;
    }

    const statements = [];
    for (const item of toUpsert) {
      const customId = typeof item?.customId === 'string' && item.customId.trim() ? item.customId.trim() : null;
      const linkId = typeof item?.linkId === 'string' && item.linkId.trim() ? item.linkId.trim() : null;
      statements.push(
        this.db
          .prepare(
            `INSERT OR REPLACE INTO profiles (id, custom_id, link_id, data, updated_at)
                         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          )
          .bind(item.id, customId, linkId, JSON.stringify(item)),
      );
    }

    for (const item of toDelete) {
      statements.push(this.db.prepare('DELETE FROM profiles WHERE id = ?').bind(item.id));
      const customId = typeof item?.customId === 'string' ? item.customId.trim() : '';
      const linkId = typeof item?.linkId === 'string' ? item.linkId.trim() : '';
      const idsToClean = new Set([item.id, customId, linkId].filter(Boolean));
      for (const pid of idsToClean) {
        statements.push(this.db.prepare('DELETE FROM cache WHERE key = ?').bind(`node_cache_profile_${pid}`));
      }
    }

    await this._withSchemaRetry(() => this._runBatchOrSequential(statements));
    invalidateD1CollectionCache(this.db, 'profiles');
    return true;
  }

  /**
   * 定期维护任务：
   * 1. 确保八张表结构及索引就绪；
   * 2. 利用 cache.expires_at 索引批量清理过期缓存，并仅按 key 清理孤儿节点缓存；
   * 3. 修剪过期的访问日志。
   */
  async cleanupMaintenance({ now = Date.now() } = {}) {
    const stats = {
      removedExpiredCache: 0,
    };

    try {
      await ensureD1Schema(this.db);
    } catch {
      return stats;
    }

    const [profiles, allSubAndNodes] = await Promise.all([
      this.getAllProfiles().catch(() => []),
      this.getAllSubscriptions().catch(() => []),
    ]);
    const profileByIdentifier = new Map();
    profiles.forEach((p) => {
      if (p?.id) profileByIdentifier.set(String(p.id), p);
      if (p?.customId) profileByIdentifier.set(String(p.customId).trim(), p);
      if (p?.linkId) profileByIdentifier.set(String(p.linkId).trim(), p);
    });
    const validSubIds = new Set(allSubAndNodes.map((s) => s?.id).filter(Boolean));

    // 清理 cache 表：先用 expires_at 索引直接批量删除过期行（无需读取大体积 value）
    try {
      const expiredResult = await this.db
        .prepare('DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at <= ?')
        .bind(now)
        .run();
      stats.removedExpiredCache += expiredResult?.meta?.changes ?? expiredResult?.changes ?? 0;

      // 仅读取 expires_at IS NULL 的缓存键名（零 value 读取），检查孤儿节点缓存并回填过期时间
      const nullExpRows = await this.db.prepare('SELECT key FROM cache WHERE expires_at IS NULL').all();
      const cacheCleanupStatements = [];
      for (const row of nullExpRows?.results || []) {
        const key = String(row?.key || '');
        if (!key) continue;

        let shouldDelete = false;
        if (key.startsWith('node_cache_profile_')) {
          const pid = key.slice('node_cache_profile_'.length);
          if (pid && profileByIdentifier.size > 0 && !profileByIdentifier.has(pid)) {
            shouldDelete = true;
          }
        } else if (key.startsWith('node_cache_subscription_') && !key.startsWith('node_cache_subscription_url_')) {
          const subId = decodeURIComponent(key.slice('node_cache_subscription_'.length));
          if (subId && validSubIds.size > 0 && !validSubIds.has(subId)) {
            shouldDelete = true;
          }
        } else if (key.startsWith('misub_test_')) {
          shouldDelete = true;
        }

        if (shouldDelete) {
          cacheCleanupStatements.push(this.db.prepare('DELETE FROM cache WHERE key = ?').bind(key));
          stats.removedExpiredCache += 1;
          continue;
        }

        const needsBackfill =
          key.startsWith('tg_push_rate:') ||
          key === 'misub_webdav_backup_lock' ||
          key.startsWith('github_release_') ||
          key.startsWith('appstore_release_') ||
          (key.startsWith('node_cache_') && !key.startsWith('node_cache_subscription_'));

        if (needsBackfill) {
          const fullRow = await this.db.prepare('SELECT value FROM cache WHERE key = ?').bind(key).first();
          const computedExp = computeCacheExpiresAt(key, fullRow?.value, now);
          if (computedExp && computedExp <= now) {
            cacheCleanupStatements.push(this.db.prepare('DELETE FROM cache WHERE key = ?').bind(key));
            stats.removedExpiredCache += 1;
          } else if (computedExp) {
            cacheCleanupStatements.push(
              this.db.prepare('UPDATE cache SET expires_at = ? WHERE key = ?').bind(computedExp, key),
            );
          }
        }
      }
      if (cacheCleanupStatements.length > 0) {
        await this._runBatchOrSequential(cacheCleanupStatements);
      }
    } catch (error) {
      if (!isNoSuchTableError(error)) {
        console.warn('[D1 Maintenance] Failed to clean expired cache:', error?.message);
      }
    }

    // 定期修剪 access_logs 过期数据
    try {
      await this.db
        .prepare('DELETE FROM access_logs WHERE timestamp < ?')
        .bind(now - ACCESS_LOG_MAX_AGE_MS)
        .run();
    } catch {
    }

    return stats;
  }

  async resetAllSettings() {
    try {
      await this.db.prepare('DELETE FROM settings').run();
      settingsCaches.delete(this.db);
      return true;
    } catch (error) {
      if (isNoSuchTableError(error)) {
        settingsCaches.delete(this.db);
        return true;
      }
      console.error('[D1] Failed to reset settings:', error);
      throw error;
    }
  }

  _parseKey(key) {
    const keyStr = String(key);
    if (isCacheKey(keyStr)) {
      return { table: 'cache', queryField: 'key', queryValue: keyStr };
    }
    if (D1_KNOWN_SETTINGS_KEYS.has(keyStr)) {
      return { table: 'settings', queryField: 'key', queryValue: keyStr };
    }
    console.warn(`[D1 Storage] Unknown key format: ${key}, treating as settings key`);
    return { table: 'settings', queryField: 'key', queryValue: keyStr };
  }

  _buildKey(_table, keyValue) {
    return keyValue;
  }
}

export class StorageFactory {
  static createAdapter(env) {
    if (!env?.MISUB_DB) {
      console.warn('[Storage] D1 database not available, using noop adapter');
      return new NoopStorageAdapter();
    }
    return new D1StorageAdapter(env.MISUB_DB);
  }
}
