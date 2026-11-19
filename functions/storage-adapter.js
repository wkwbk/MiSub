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

export const STORAGE_TYPES = {
    D1: 'd1',
};

const DATA_KEYS = {
    SUBSCRIPTIONS: 'misub_subscriptions_v1',
    PROFILES: 'misub_profiles_v1',
    SETTINGS: 'worker_settings_v1',
    LEGACY_PROFILE_DOWNLOAD_COUNT_PREFIX: 'misub_profile_download_count_',
    LEGACY_GUESTBOOK_KEY: 'misub_guestbook_v1',
    LEGACY_GUESTBOOK_INDEX_KEY: 'misub_guestbook_v1_index',
    LEGACY_GUESTBOOK_ITEM_PREFIX: 'misub_guestbook_v1:item:',
};

const KEY_VALUE_TABLES = new Set(['settings', 'cache']);
const ID_DATA_TABLES = new Set(['subscriptions', 'nodes', 'profiles', 'guestbook']);

const D1_COLLECTION_CACHE_TTL_MS = 30 * 1000;
const d1CollectionCaches = new WeakMap();
const initializedSchemas = new WeakSet();

function getD1CollectionCache(database) {
    let cache = d1CollectionCaches.get(database);
    if (!cache) {
        cache = new Map();
        d1CollectionCaches.set(database, cache);
    }
    return cache;
}

function invalidateD1CollectionCache(database, table) {
    getD1CollectionCache(database).delete(table);
}

async function readCachedD1Collection(database, table, loader) {
    const cache = getD1CollectionCache(database);
    const now = Date.now();
    const existing = cache.get(table);
    if (existing && now - existing.timestamp < D1_COLLECTION_CACHE_TTL_MS) {
        return structuredClone(await existing.promise);
    }

    const promise = Promise.resolve().then(loader);
    cache.set(table, { timestamp: now, promise });
    try {
        return structuredClone(await promise);
    } catch (error) {
        if (cache.get(table)?.promise === promise) cache.delete(table);
        throw error;
    }
}

export function isManualNodeRecord(item) {
    if (!item || typeof item !== 'object') return false;
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!url) return false;
    return !/^https?:\/\//i.test(url);
}

const D1_TABLE_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        custom_id TEXT,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS guestbook (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS access_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS error_reports (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
];

const D1_COLUMN_MIGRATIONS = [
    `ALTER TABLE profiles ADD COLUMN custom_id TEXT;`,
    `ALTER TABLE cache ADD COLUMN expires_at INTEGER;`,
];

const D1_INDEX_STATEMENTS = [
    `CREATE INDEX IF NOT EXISTS idx_subscriptions_updated_at ON subscriptions(updated_at);`,
    `CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(updated_at);`,
    `CREATE INDEX IF NOT EXISTS idx_profiles_custom_id ON profiles(custom_id);`,
    `CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);`,
    `CREATE INDEX IF NOT EXISTS idx_guestbook_updated_at ON guestbook(updated_at);`,
    `CREATE INDEX IF NOT EXISTS idx_settings_updated_at ON settings(updated_at);`,
    `CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);`,
    `CREATE INDEX IF NOT EXISTS idx_cache_updated_at ON cache(updated_at);`,
    `CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON access_logs(timestamp DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_error_reports_timestamp ON error_reports(timestamp DESC);`,
];

const D1_CACHE_KEYS = new Set([
    'misub_webdav_backup_lock',
    'misub_restore_snapshot_latest',
    'cron_last_execution',
]);

const D1_CACHE_PREFIXES = [
    'node_cache_',
    'github_release_',
    'tmp_external_nodes:',
    'tg_push_rate:',
    'misub_test_',
];

const D1_LEGACY_LOG_KEYS = new Set([
    'misub_error_reports',
    'misub_system_logs',
    'misub_system_logs_index',
    'misub_system_logs:index',
]);

const D1_LEGACY_LOG_PREFIXES = ['misub_system_logs:'];

const D1_KNOWN_SETTINGS_KEYS = new Set([
    'misub_dns_templates_v1',
    'misub_rule_templates_v1',
    'misub_clients_v1',
    'misub_settings_v1',
    'SYSTEM_ADMIN_PASSWORD',
    'SYSTEM_COOKIE_SECRET',
    'SYSTEM_AUTH_INITIALIZED',
]);

function isCacheKey(keyStr) {
    return (
        D1_CACHE_KEYS.has(keyStr) ||
        D1_CACHE_PREFIXES.some((prefix) => keyStr.startsWith(prefix))
    );
}

function isLegacyLogKey(keyStr) {
    return (
        D1_LEGACY_LOG_KEYS.has(keyStr) ||
        D1_LEGACY_LOG_PREFIXES.some((prefix) => keyStr.startsWith(prefix))
    );
}

function isNoSuchTableError(error) {
    return Boolean(error?.message && String(error.message).toLowerCase().includes('no such table'));
}

function isSchemaMismatchError(error) {
    const msg = String(error?.message || '').toLowerCase();
    return (
        msg.includes('no such table') ||
        msg.includes('no such column') ||
        msg.includes('has no column named')
    );
}

function parseTimestampMs(val) {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (typeof val === 'string' && val.trim()) {
        const num = Number(val);
        if (Number.isFinite(num)) return num;
        const parsed = Date.parse(val);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

const GITHUB_RELEASE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const NODE_CACHE_CLEANUP_AGE_MS = 24 * 60 * 60 * 1000;
const ACCESS_LOG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function computeCacheExpiresAt(keyStr, rawValue, now = Date.now()) {
    let parsed = rawValue;
    if (typeof rawValue === 'string') {
        try {
            parsed = JSON.parse(rawValue);
        } catch {
            parsed = null;
        }
    }

    if (
        keyStr.startsWith('tmp_external_nodes:') ||
        keyStr.startsWith('tg_push_rate:') ||
        keyStr === 'misub_webdav_backup_lock'
    ) {
        const exp = parseTimestampMs(parsed?.expiresAt);
        return exp > 0 ? exp : now + 60 * 60 * 1000;
    }
    if (keyStr.startsWith('github_release_')) {
        const ts = parseTimestampMs(parsed?.timestamp) || now;
        return ts + GITHUB_RELEASE_MAX_AGE_MS;
    }
    if (keyStr.startsWith('node_cache_subscription_')) {
        // 单机场保护性回退缓存：不过期自动清除，仅随订阅删除或孤儿清理移除
        return null;
    }
    if (keyStr.startsWith('node_cache_')) {
        const ts = parseTimestampMs(parsed?.timestamp) || now;
        return ts + NODE_CACHE_CLEANUP_AGE_MS;
    }
    if (keyStr.startsWith('misub_test_')) {
        return now + 5 * 60 * 1000;
    }
    return null;
}

export async function ensureD1Schema(d1Db) {
    for (const statement of D1_TABLE_STATEMENTS) {
        await d1Db.prepare(statement).run();
    }

    // 针对已存在的旧表平滑补齐新增索引列（若列已存在则忽略 duplicate column 错误）
    for (const alterSql of D1_COLUMN_MIGRATIONS) {
        try {
            await d1Db.prepare(alterSql).run();
        } catch {
            // Column already exists
        }
    }

    // 为存量 profiles 行一次性回填 custom_id 索引列
    try {
        await d1Db
            .prepare(
                `UPDATE profiles
                 SET custom_id = NULLIF(TRIM(json_extract(data, '$.customId')), '')
                 WHERE custom_id IS NULL AND json_extract(data, '$.customId') IS NOT NULL`
            )
            .run();
    } catch {
        // Ignore on lightweight test mocks without json_extract
    }

    for (const indexSql of D1_INDEX_STATEMENTS) {
        try {
            await d1Db.prepare(indexSql).run();
        } catch {
            // Ignore index creation error on non-SQLite mocks
        }
    }

    if (d1Db && typeof d1Db === 'object') {
        initializedSchemas.add(d1Db);
    }
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

    async _runBatchOrSequential(statements) {
        if (!Array.isArray(statements) || statements.length === 0) return;
        if (typeof this.db.batch === 'function') {
            await this.db.batch(statements);
            return;
        }
        for (const stmt of statements) {
            await stmt.run();
        }
    }

    async get(key, type = 'json') {
        if (key === DATA_KEYS.SUBSCRIPTIONS) {
            return await this.getAllSubscriptions();
        }
        if (key === DATA_KEYS.PROFILES) {
            return await this.getAllProfiles();
        }

        try {
            const { table, queryField, queryValue } = this._parseKey(key);
            const isKvTable = KEY_VALUE_TABLES.has(table);

            const result = await this.db
                .prepare(
                    `SELECT ${isKvTable ? 'value as data' : 'data'} FROM ${table} WHERE ${queryField} = ?`
                )
                .bind(queryValue)
                .first();

            if (!result) return null;

            if (type !== 'json') {
                return result.data;
            }
            try {
                return JSON.parse(result.data);
            } catch {
                return result.data;
            }
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
                    `
                        )
                        .bind(queryValue, data, expiresAt)
                        .run();
                } else if (isKvTable) {
                    await this.db
                        .prepare(
                            `
                        INSERT OR REPLACE INTO ${table} (key, value, updated_at)
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                    `
                        )
                        .bind(queryValue, data)
                        .run();
                } else {
                    await this.db
                        .prepare(
                            `
                        INSERT OR REPLACE INTO ${table} (id, data, updated_at)
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                    `
                        )
                        .bind(queryValue, data)
                        .run();
                }
            });

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

            await this.db
                .prepare(`DELETE FROM ${table} WHERE ${queryField} = ?`)
                .bind(queryValue)
                .run();

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
                    { name: 'cache', keyField: 'key' }
                );
            } else if (isCacheKey(effectivePrefix)) {
                targetTables.push({ name: 'cache', keyField: 'key' });
            } else if (effectivePrefix.startsWith(DATA_KEYS.SUBSCRIPTIONS)) {
                targetTables.push(
                    { name: 'subscriptions', keyField: 'id' },
                    { name: 'nodes', keyField: 'id' }
                );
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
                            .prepare(
                                `SELECT ${table.keyField} FROM ${table.name} WHERE ${table.keyField} LIKE ?`
                            )
                            .bind(`${effectivePrefix}%`)
                            .all();
                    } else {
                        results = await this.db
                            .prepare(`SELECT ${table.keyField} FROM ${table.name}`)
                            .all();
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
                return Array.from(deduped.values()).sort(
                    (a, b) => (a.sortIndex || 0) - (b.sortIndex || 0)
                );
            } catch (error) {
                invalidateD1CollectionCache(this.db, table);
                if (isNoSuchTableError(error)) return [];
                console.error(`[D1] Failed to read ${table}:`, error);
                return [];
            }
        });
    }

    /**
     * 仅读取远程机场订阅（subscriptions 表，不扫描 nodes 表）
     */
    async getRemoteSubscriptions() {
        const rows = await this._readTableRows('subscriptions');
        return rows.filter((item) => !isManualNodeRecord(item));
    }

    /**
     * 仅读取手动节点（nodes 表；若历史未迁移完则兼容读取 subscriptions 表中的节点）
     */
    async getManualNodes() {
        const [nodeRows, subRows] = await Promise.all([
            this._readTableRows('nodes'),
            this._readTableRows('subscriptions'),
        ]);
        const deduped = new Map();
        subRows.filter(isManualNodeRecord).forEach((item) => deduped.set(item.id, item));
        nodeRows.forEach((item) => deduped.set(item.id, item));
        return Array.from(deduped.values()).sort(
            (a, b) => (a.sortIndex || 0) - (b.sortIndex || 0)
        );
    }

    async getSubscriptionById(id) {
        for (const table of ['subscriptions', 'nodes']) {
            try {
                const result = await this.db
                    .prepare(`SELECT data FROM ${table} WHERE id = ?`)
                    .bind(id)
                    .first();
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
        const [subs, nodes] = await Promise.all([
            this._readTableRows('subscriptions'),
            this._readTableRows('nodes'),
        ]);
        const deduped = new Map();
        subs.forEach((item) => {
            if (item?.id) deduped.set(item.id, item);
        });
        nodes.forEach((item) => {
            if (item?.id) deduped.set(item.id, item);
        });
        return Array.from(deduped.values()).sort(
            (a, b) => (a.sortIndex || 0) - (b.sortIndex || 0)
        );
    }

    /**
     * 通过主键 id 或索引列 custom_id 单行精准查询订阅组（避免全表扫描）
     */
    async getProfileById(idOrCustomId) {
        if (!idOrCustomId) return null;
        const target = String(idOrCustomId).trim();
        if (!target) return null;

        try {
            const result = await this._withSchemaRetry(() =>
                this.db
                    .prepare('SELECT data FROM profiles WHERE id = ? OR custom_id = ? LIMIT 1')
                    .bind(target, target)
                    .first()
            );
            if (result?.data) {
                return JSON.parse(result.data);
            }

            // 兼容尚未回填 custom_id 列的极少数存量行（仅检查 custom_id IS NULL 的行）
            const unindexed = await this.db
                .prepare('SELECT id, data FROM profiles WHERE custom_id IS NULL')
                .all();
            for (const row of unindexed?.results || []) {
                if (!row?.data) continue;
                const parsed = JSON.parse(row.data);
                const normalizedId = parsed?.id?.startsWith('profile_')
                    ? parsed.id.slice('profile_'.length)
                    : parsed?.id;
                if (normalizedId === target || parsed?.customId === target) {
                    if (parsed?.customId) {
                        await this.putProfile({ ...parsed, id: normalizedId });
                    }
                    return { ...parsed, id: normalizedId };
                }
            }
            return null;
        } catch (error) {
            if (isSchemaMismatchError(error)) return null;
            console.error(`[D1] Failed to get profile ${idOrCustomId}:`, error);
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
                         RETURNING json_extract(data, '$.downloadCount') AS downloadCount`
                    )
                    .bind(target, target)
                    .first()
            );

            if (updatedRow && updatedRow.downloadCount !== undefined) {
                invalidateD1CollectionCache(this.db, 'profiles');
                return Number(updatedRow.downloadCount);
            }
        } catch {
            // Fallback for lightweight mocks or un-migrated rows
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

    // ========== 留言板专用表操作 (guestbook) ==========

    async getAllGuestbookMessages() {
        const rows = await this._readTableRows('guestbook');
        return rows.sort(
            (a, b) => Date.parse(b?.createdAt || '') - Date.parse(a?.createdAt || '')
        );
    }

    async getGuestbookMessageById(id) {
        try {
            const result = await this.db
                .prepare('SELECT data FROM guestbook WHERE id = ?')
                .bind(id)
                .first();
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
            `
                )
                .bind(message.id, JSON.stringify(message))
                .run();
        });
        invalidateD1CollectionCache(this.db, 'guestbook');
        return message;
    }

    async deleteGuestbookMessageById(id) {
        try {
            const result = await this.db
                .prepare('DELETE FROM guestbook WHERE id = ?')
                .bind(id)
                .run();
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
                         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
                    )
                    .bind(id, ts, payload);
            });

            if (maxAgeMs > 0) {
                statements.push(
                    this.db
                        .prepare('DELETE FROM access_logs WHERE timestamp < ?')
                        .bind(now - maxAgeMs)
                );
            }
            if (maxEntries > 0) {
                statements.push(
                    this.db
                        .prepare(
                            `DELETE FROM access_logs
                             WHERE id NOT IN (
                                 SELECT id FROM access_logs ORDER BY timestamp DESC LIMIT ?
                             )`
                        )
                        .bind(maxEntries)
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
                     LIMIT ?`
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

    async clearAccessLogs({ profileName = '' } = {}) {
        const targetProfileName = typeof profileName === 'string' ? profileName : '';
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
        // 顺手清理可能尚未移除的旧版 logs 表访问日志行
        try {
            await this.db
                .prepare("DELETE FROM logs WHERE key LIKE 'misub_system_logs%'")
                .run();
        } catch {
            // Ignore when legacy logs table does not exist
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
                         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
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
                             )`
                        )
                        .bind(maxEntries)
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
        const existing = await this.getSubscriptionById(id);
        if (!existing) return null;
        const updated = updater({ ...existing });
        await this.putSubscription(updated);
        return updated;
    }

    async putSubscription(item) {
        const isManual = isManualNodeRecord(item);
        const targetTable = isManual ? 'nodes' : 'subscriptions';
        const otherTable = isManual ? 'subscriptions' : 'nodes';

        await this._withSchemaRetry(async () => {
            await this.db
                .prepare(
                    `
                INSERT OR REPLACE INTO ${targetTable} (id, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `
                )
                .bind(item.id, JSON.stringify(item))
                .run();
        });
        invalidateD1CollectionCache(this.db, targetTable);

        try {
            await this.db.prepare(`DELETE FROM ${otherTable} WHERE id = ?`).bind(item.id).run();
            invalidateD1CollectionCache(this.db, otherTable);
        } catch {
            // Ignore when otherTable is not initialized yet
        }

        return item;
    }

    async deleteSubscriptionById(id) {
        let deleted = false;
        for (const table of ['subscriptions', 'nodes']) {
            try {
                const result = await this.db
                    .prepare(`DELETE FROM ${table} WHERE id = ?`)
                    .bind(id)
                    .run();
                invalidateD1CollectionCache(this.db, table);
                if (result?.success) deleted = true;
            } catch (error) {
                if (!isNoSuchTableError(error)) throw error;
            }
        }

        if (id) {
            await this.delete(`node_cache_subscription_${encodeURIComponent(id)}`).catch(
                () => undefined
            );
        }

        return deleted;
    }

    async putProfile(item) {
        const customId =
            typeof item?.customId === 'string' && item.customId.trim()
                ? item.customId.trim()
                : null;

        await this._withSchemaRetry(async () => {
            await this.db
                .prepare(
                    `
                INSERT OR REPLACE INTO profiles (id, custom_id, data, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `
                )
                .bind(item.id, customId, JSON.stringify(item))
                .run();
        });
        invalidateD1CollectionCache(this.db, 'profiles');
        return item;
    }

    async deleteProfileById(id) {
        let customId = '';
        try {
            const existingRow = await this.db
                .prepare('SELECT data FROM profiles WHERE id = ?')
                .bind(id)
                .first();
            if (existingRow?.data) {
                const parsed = JSON.parse(existingRow.data);
                customId = typeof parsed?.customId === 'string' ? parsed.customId.trim() : '';
            }
        } catch {
            // Best-effort lookup for customId before deletion
        }

        const result = await this.db.prepare('DELETE FROM profiles WHERE id = ?').bind(id).run();
        invalidateD1CollectionCache(this.db, 'profiles');

        const idsToClean = new Set([id, customId].filter(Boolean));
        await Promise.all(
            Array.from(idsToClean).flatMap((pid) => [
                this.delete(`node_cache_profile_${pid}`).catch(() => undefined),
                this.delete(`${DATA_KEYS.LEGACY_PROFILE_DOWNLOAD_COUNT_PREFIX}${pid}`).catch(
                    () => undefined
                ),
            ])
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
                uniqueSubIds.length > 0
                    ? this._queryByIdsChunked('subscriptions', uniqueSubIds)
                    : Promise.resolve([]),
                uniqueNodeIds.length > 0
                    ? this._queryByIdsChunked('nodes', uniqueNodeIds)
                    : Promise.resolve([]),
            ]);

            const foundMap = new Map();
            subHits.forEach((item) => {
                if (item?.id) foundMap.set(item.id, item);
            });
            nodeHits.forEach((item) => {
                if (item?.id) foundMap.set(item.id, item);
            });

            // 兼容尚未迁移完的历史手动节点（仍留在 subscriptions 表中的情况）
            const missingNodeIds = uniqueNodeIds.filter((id) => !foundMap.has(id));
            if (missingNodeIds.length > 0) {
                const legacyNodeHits = await this._queryByIdsChunked(
                    'subscriptions',
                    missingNodeIds
                );
                legacyNodeHits.forEach((item) => {
                    if (item?.id) foundMap.set(item.id, item);
                });
            }

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
        await Promise.all(items.filter((item) => item?.id).map((item) => this.putSubscription(item)));
        return true;
    }

    async putAllProfiles(items) {
        if (!Array.isArray(items)) return false;
        await Promise.all(items.filter((item) => item?.id).map((item) => this.putProfile(item)));
        return true;
    }

    async syncAllSubscriptions(items) {
        if (!Array.isArray(items)) return false;
        const current = await this.getAllSubscriptions();
        const nextIds = new Set(items.map((item) => item?.id).filter(Boolean));
        const toDelete = current.filter((item) => item?.id && !nextIds.has(item.id));
        await Promise.all([
            ...items.filter((item) => item?.id).map((item) => this.putSubscription(item)),
            ...toDelete.map((item) => this.deleteSubscriptionById(item.id)),
        ]);
        invalidateD1CollectionCache(this.db, 'subscriptions');
        invalidateD1CollectionCache(this.db, 'nodes');
        return true;
    }

    async syncAllProfiles(items) {
        if (!Array.isArray(items)) return false;
        const current = await this.getAllProfiles();
        const nextIds = new Set(items.map((item) => item?.id).filter(Boolean));
        const toDelete = current.filter((item) => item?.id && !nextIds.has(item.id));
        await Promise.all([
            ...items.filter((item) => item?.id).map((item) => this.putProfile(item)),
            ...toDelete.map((item) => this.deleteProfileById(item.id)),
        ]);
        invalidateD1CollectionCache(this.db, 'profiles');
        return true;
    }

    async _migrateLegacyLogRow(key, rawValue, now, stats) {
        if (
            key === 'misub_system_logs:index' ||
            key === 'misub_system_logs_index'
        ) {
            return;
        }
        try {
            const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
            if (!Array.isArray(parsed)) return;

            if (key === 'misub_error_reports') {
                for (const report of parsed) {
                    if (report && typeof report === 'object') {
                        await this.insertErrorReport(report, 100);
                        stats.migratedErrorReports += 1;
                    }
                }
            } else if (key === 'misub_system_logs' || key.startsWith('misub_system_logs:')) {
                const fresh = parsed.filter(
                    (entry) =>
                        entry &&
                        typeof entry === 'object' &&
                        now - (parseTimestampMs(entry.timestamp) || 0) <= ACCESS_LOG_MAX_AGE_MS
                );
                if (fresh.length > 0) {
                    await this.insertAccessLogs(fresh, {
                        maxAgeMs: ACCESS_LOG_MAX_AGE_MS,
                        maxEntries: 200,
                    });
                    stats.migratedLogs += fresh.length;
                }
            }
        } catch {
            // Ignore malformed legacy log payload
        }
    }

    /**
     * 定期维护与自动归位任务：
     * 1. 确保八张表结构及索引列（profiles.custom_id / cache.expires_at）均已就绪；
     * 2. 将历史留在 subscriptions 表中的手动节点自动搬入 nodes 表；
     * 3. 将历史留在 settings / logs 表中的留言、下载计数、访问日志、错误上报自动归位并移除旧 logs 表；
     * 4. 利用 cache.expires_at 索引零大字段读取清理过期缓存，并仅按 key 清理孤儿节点缓存。
     */
    async cleanupMaintenance({ now = Date.now() } = {}) {
        const stats = {
            migratedNodes: 0,
            migratedGuestbook: 0,
            mergedDownloadCounts: 0,
            migratedLogs: 0,
            migratedErrorReports: 0,
            removedSettingsClutter: 0,
            removedOrphanCounts: 0,
            removedExpiredCache: 0,
        };

        try {
            await ensureD1Schema(this.db);
        } catch {
            return stats;
        }

        // 1. 将 subscriptions 表里的手动节点自动归位到 nodes 表
        try {
            const subRows = await this.db.prepare('SELECT id, data FROM subscriptions').all();
            for (const row of subRows?.results || []) {
                if (!row?.data) continue;
                let parsed = null;
                try {
                    parsed = JSON.parse(row.data);
                } catch {
                    continue;
                }
                if (parsed?.id && isManualNodeRecord(parsed)) {
                    await this.db
                        .prepare(
                            'INSERT OR REPLACE INTO nodes (id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
                        )
                        .bind(parsed.id, row.data)
                        .run();
                    await this.db
                        .prepare('DELETE FROM subscriptions WHERE id = ?')
                        .bind(row.id ?? parsed.id)
                        .run();
                    stats.migratedNodes += 1;
                }
            }
            if (stats.migratedNodes > 0) {
                invalidateD1CollectionCache(this.db, 'subscriptions');
                invalidateD1CollectionCache(this.db, 'nodes');
            }
        } catch (error) {
            if (!isNoSuchTableError(error)) {
                console.warn('[D1 Maintenance] Failed to migrate manual nodes:', error?.message);
            }
        }

        const [profiles, allSubAndNodes] = await Promise.all([
            this.getAllProfiles().catch(() => []),
            this.getAllSubscriptions().catch(() => []),
        ]);
        const profileByIdentifier = new Map();
        profiles.forEach((p) => {
            if (p?.id) profileByIdentifier.set(String(p.id), p);
            if (p?.customId) profileByIdentifier.set(String(p.customId).trim(), p);
        });
        const validSubIds = new Set(allSubAndNodes.map((s) => s?.id).filter(Boolean));

        // 2. 整理 settings 表中的历史留言、下载计数、日志与旧缓存
        try {
            const settingsRows = await this.db.prepare('SELECT key, value FROM settings').all();
            for (const row of settingsRows?.results || []) {
                const key = String(row?.key || '');
                if (!key) continue;

                if (key.startsWith(DATA_KEYS.LEGACY_GUESTBOOK_ITEM_PREFIX)) {
                    try {
                        const msg = JSON.parse(row.value);
                        if (msg?.id) {
                            await this.db
                                .prepare(
                                    'INSERT OR IGNORE INTO guestbook (id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
                                )
                                .bind(msg.id, JSON.stringify(msg))
                                .run();
                            stats.migratedGuestbook += 1;
                        }
                    } catch {}
                    await this.db.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
                    invalidateD1CollectionCache(this.db, 'guestbook');
                    continue;
                }

                if (key === DATA_KEYS.LEGACY_GUESTBOOK_KEY) {
                    try {
                        const list = JSON.parse(row.value);
                        if (Array.isArray(list)) {
                            for (const msg of list) {
                                if (msg?.id) {
                                    await this.db
                                        .prepare(
                                            'INSERT OR IGNORE INTO guestbook (id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
                                        )
                                        .bind(msg.id, JSON.stringify(msg))
                                        .run();
                                    stats.migratedGuestbook += 1;
                                }
                            }
                        }
                    } catch {}
                    await this.db.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
                    invalidateD1CollectionCache(this.db, 'guestbook');
                    continue;
                }

                if (key === DATA_KEYS.LEGACY_GUESTBOOK_INDEX_KEY) {
                    await this.db.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
                    stats.removedSettingsClutter += 1;
                    continue;
                }

                if (key.startsWith(DATA_KEYS.LEGACY_PROFILE_DOWNLOAD_COUNT_PREFIX)) {
                    const targetId = key.slice(
                        DATA_KEYS.LEGACY_PROFILE_DOWNLOAD_COUNT_PREFIX.length
                    );
                    const matchedProfile = targetId ? profileByIdentifier.get(targetId) : null;
                    if (matchedProfile) {
                        const countVal = Number(row.value) || 0;
                        if (countVal > (Number(matchedProfile.downloadCount) || 0)) {
                            matchedProfile.downloadCount = countVal;
                            await this.putProfile(matchedProfile);
                        }
                        stats.mergedDownloadCounts += 1;
                    } else {
                        stats.removedOrphanCounts += 1;
                    }
                    await this.db.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
                    continue;
                }

                if (isLegacyLogKey(key)) {
                    await this._migrateLegacyLogRow(key, row.value, now, stats);
                    await this.db.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
                    continue;
                }

                if (isCacheKey(key)) {
                    await this.db.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
                    stats.removedSettingsClutter += 1;
                    continue;
                }
            }
        } catch (error) {
            if (!isNoSuchTableError(error)) {
                console.warn('[D1 Maintenance] Failed to clean settings clutter:', error?.message);
            }
        }

        // 3. 将过渡期遗留的旧版 logs 键值表迁移到 access_logs / error_reports 行级表并销毁旧表
        try {
            const legacyLogRows = await this.db.prepare('SELECT key, value FROM logs').all();
            for (const row of legacyLogRows?.results || []) {
                const key = String(row?.key || '');
                if (!key) continue;
                await this._migrateLegacyLogRow(key, row.value, now, stats);
            }
            await this.db.prepare('DROP TABLE IF EXISTS logs').run();
        } catch (error) {
            if (!isNoSuchTableError(error)) {
                console.warn('[D1 Maintenance] Failed to migrate legacy logs table:', error?.message);
            }
        }

        // 4. 清理 cache 表：先用 expires_at 索引直接批量删除过期行（无需读取大体积 value）
        try {
            const expiredResult = await this.db
                .prepare('DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at <= ?')
                .bind(now)
                .run();
            stats.removedExpiredCache +=
                expiredResult?.meta?.changes ?? expiredResult?.changes ?? 0;

            // 仅读取 expires_at IS NULL 的缓存键名（零 value 读取），检查孤儿节点缓存并回填旧行过期时间
            const nullExpRows = await this.db
                .prepare('SELECT key FROM cache WHERE expires_at IS NULL')
                .all();
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
                    await this.db.prepare('DELETE FROM cache WHERE key = ?').bind(key).run();
                    stats.removedExpiredCache += 1;
                    continue;
                }

                // 若属于应带过期时间的旧版历史行（expires_at 尚未写入），按需读取单行回填或清理
                const needsBackfill =
                    key.startsWith('tmp_external_nodes:') ||
                    key.startsWith('tg_push_rate:') ||
                    key === 'misub_webdav_backup_lock' ||
                    key.startsWith('github_release_') ||
                    (key.startsWith('node_cache_') && !key.startsWith('node_cache_subscription_'));

                if (needsBackfill) {
                    const fullRow = await this.db
                        .prepare('SELECT value FROM cache WHERE key = ?')
                        .bind(key)
                        .first();
                    const computedExp = computeCacheExpiresAt(key, fullRow?.value, now);
                    if (computedExp && computedExp <= now) {
                        await this.db.prepare('DELETE FROM cache WHERE key = ?').bind(key).run();
                        stats.removedExpiredCache += 1;
                    } else if (computedExp) {
                        await this.db
                            .prepare('UPDATE cache SET expires_at = ? WHERE key = ?')
                            .bind(computedExp, key)
                            .run();
                    }
                }
            }
        } catch (error) {
            if (!isNoSuchTableError(error)) {
                console.warn('[D1 Maintenance] Failed to clean expired cache:', error?.message);
            }
        }

        // 5. 定期修剪 access_logs 与 error_reports 过期/超量数据
        try {
            await this.db
                .prepare('DELETE FROM access_logs WHERE timestamp < ?')
                .bind(now - ACCESS_LOG_MAX_AGE_MS)
                .run();
        } catch {
            // Ignore when table is empty or mock doesn't support it
        }

        return stats;
    }

    _parseKey(key) {
        if (key === DATA_KEYS.SETTINGS) {
            return { table: 'settings', queryField: 'key', queryValue: 'main' };
        }
        const keyStr = String(key);
        if (isCacheKey(keyStr)) {
            return { table: 'cache', queryField: 'key', queryValue: keyStr };
        }
        if (
            D1_KNOWN_SETTINGS_KEYS.has(keyStr) ||
            keyStr.startsWith(DATA_KEYS.LEGACY_PROFILE_DOWNLOAD_COUNT_PREFIX) ||
            isLegacyLogKey(keyStr)
        ) {
            return { table: 'settings', queryField: 'key', queryValue: keyStr };
        }
        console.warn(`[D1 Storage] Unknown key format: ${key}, treating as settings key`);
        return { table: 'settings', queryField: 'key', queryValue: keyStr };
    }

    _buildKey(table, keyValue) {
        if (table === 'settings' && keyValue === 'main') {
            return DATA_KEYS.SETTINGS;
        }
        return keyValue;
    }
}

/**
 * 无存储降级适配器（未绑定 D1 时降级为空操作）
 */
class NoopStorageAdapter {
    constructor() {
        this.type = 'noop';
    }
    async get() {
        return null;
    }
    async put() {
        return true;
    }
    async delete() {
        return true;
    }
    async list() {
        return [];
    }
    async getSubscriptionById() {
        return null;
    }
    async getRemoteSubscriptions() {
        return [];
    }
    async getManualNodes() {
        return [];
    }
    async getAllSubscriptions() {
        return [];
    }
    async getProfileById() {
        return null;
    }
    async getAllProfiles() {
        return [];
    }
    async incrementProfileDownloadCount() {
        return null;
    }
    async getAllGuestbookMessages() {
        return [];
    }
    async getGuestbookMessageById() {
        return null;
    }
    async putGuestbookMessage(msg) {
        return msg;
    }
    async deleteGuestbookMessageById() {
        return false;
    }
    async insertAccessLogs() {
        return 0;
    }
    async getAccessLogs() {
        return [];
    }
    async clearAccessLogs() {
        return true;
    }
    async insertErrorReport() {
        return true;
    }
    async getErrorReports() {
        return [];
    }
    async clearErrorReports() {
        return true;
    }
    async getProfileSources() {
        return [];
    }
    async getSubscriptionsByIds() {
        return [];
    }
    async updateSubscriptionById() {
        return null;
    }
    async putSubscription(item) {
        return item;
    }
    async deleteSubscriptionById() {
        return false;
    }
    async putProfile(item) {
        return item;
    }
    async deleteProfileById() {
        return false;
    }
    async putAllSubscriptions() {
        return true;
    }
    async putAllProfiles() {
        return true;
    }
    async cleanupMaintenance() {
        return {
            migratedNodes: 0,
            migratedGuestbook: 0,
            mergedDownloadCounts: 0,
            migratedLogs: 0,
            migratedErrorReports: 0,
            removedSettingsClutter: 0,
            removedOrphanCounts: 0,
            removedExpiredCache: 0,
        };
    }
}

let settingsCaches = new WeakMap();
const SETTINGS_CACHE_TTL_MS = 10 * 1000;

export class SettingsCache {
    static async get(env) {
        const db = env?.MISUB_DB;
        if (!db) {
            return null;
        }

        const now = Date.now();
        const cached = settingsCaches.get(db);
        if (cached && now - cached.timestamp < SETTINGS_CACHE_TTL_MS) {
            return cached.data;
        }

        try {
            const d1Adapter = new D1StorageAdapter(db);
            const settings = await d1Adapter.get(DATA_KEYS.SETTINGS);
            if (settings) {
                settingsCaches.set(db, { data: settings, timestamp: now });
                return settings;
            }
        } catch (error) {
            console.error('[Storage Cache] Failed to read settings from D1:', error);
        }

        return null;
    }

    static clear() {
        settingsCaches = new WeakMap();
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

    static async getStorageType() {
        return STORAGE_TYPES.D1;
    }
}
