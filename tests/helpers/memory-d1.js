/**
 * 内存版 D1 数据库测试桩，兼容八表结构
 * （subscriptions / nodes / profiles / guestbook / settings / cache / access_logs / error_reports）
 * 及历史 logs 表自动迁移销毁与认证 SQL。
 */
export function createMemoryD1(initial = {}) {
  const tables = {
    subscriptions: new Map(),
    nodes: new Map(),
    profiles: new Map(),
    guestbook: new Map(),
    settings: new Map(),
    cache: new Map(),
    access_logs: new Map(),
    error_reports: new Map(),
    logs: new Map(),
  };
  const profileCustomIds = new Map();
  const profileLinkIds = new Map();
  const cacheExpiresAt = new Map();
  let legacyLogsDropped = false;

  const isManualNode = (item) => {
    const url = typeof item?.url === 'string' ? item.url.trim() : '';
    return Boolean(url && !/^https?:\/\//i.test(url));
  };

  const isCacheKey = (k) =>
    k === 'misub_webdav_backup_lock' ||
    k === 'misub_webdav_backup_last_checked' ||
    k === 'misub_restore_snapshot_latest' ||
    k === 'cron_last_execution' ||
    k.startsWith('node_cache_') ||
    k.startsWith('github_release_') ||
    k.startsWith('tmp_external_nodes:') ||
    k.startsWith('tg_push_rate:') ||
    k.startsWith('auth_login_rate:') ||
    k.startsWith('misub_test_');

  const isLegacyLogKey = (k) =>
    k === 'misub_error_reports' ||
    k === 'misub_system_logs' ||
    k === 'misub_system_logs_index' ||
    k === 'misub_system_logs:index' ||
    k.startsWith('misub_system_logs:');

  const parseIfJson = (val) => {
    if (typeof val !== 'string') return val;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  };

  const serialize = (val) => (typeof val === 'string' ? val : JSON.stringify(val));

  for (const [key, rawVal] of Object.entries(initial)) {
    if (rawVal === undefined || rawVal === null) continue;
    if (key === 'subscriptions') {
      const arr = parseIfJson(rawVal);
      if (Array.isArray(arr)) {
        arr.forEach((item, idx) => {
          if (item) {
            const id = item.id || `sub-${idx + 1}`;
            const target = isManualNode(item) ? tables.nodes : tables.subscriptions;
            target.set(id, JSON.stringify({ ...item, id }));
          }
        });
      }
    } else if (key === 'nodes') {
      const arr = parseIfJson(rawVal);
      if (Array.isArray(arr)) {
        arr.forEach((item, idx) => {
          if (item) {
            const id = item.id || `node-${idx + 1}`;
            tables.nodes.set(id, JSON.stringify({ ...item, id }));
          }
        });
      }
    } else if (key === 'profiles') {
      const arr = parseIfJson(rawVal);
      if (Array.isArray(arr)) {
        arr.forEach((item, idx) => {
          if (item) {
            const id = item.id || `profile-${idx + 1}`;
            const customId = typeof item.customId === 'string' && item.customId.trim() ? item.customId.trim() : null;
            const linkId = typeof item.linkId === 'string' && item.linkId.trim() ? item.linkId.trim() : null;
            tables.profiles.set(id, JSON.stringify({ ...item, id }));
            profileCustomIds.set(id, customId);
            profileLinkIds.set(id, linkId);
          }
        });
      }
    } else if (key === 'guestbook') {
      const arr = parseIfJson(rawVal);
      if (Array.isArray(arr)) {
        arr.forEach((item, idx) => {
          if (item) {
            const id = item.id || `msg-${idx + 1}`;
            tables.guestbook.set(id, JSON.stringify({ ...item, id }));
          }
        });
      }
    } else if (isCacheKey(key)) {
      tables.cache.set(key, serialize(rawVal));
      cacheExpiresAt.set(key, null);
    } else if (isLegacyLogKey(key)) {
      tables.logs.set(key, serialize(rawVal));
    } else {
      tables.settings.set(key, serialize(rawVal));
    }
  }

  const findProfileIdByIdOrCustomId = (target) => {
    if (tables.profiles.has(target)) return target;
    for (const [id, cid] of profileCustomIds.entries()) {
      if (cid && cid === target && tables.profiles.has(id)) {
        return id;
      }
    }
    for (const [id, lid] of profileLinkIds.entries()) {
      if (lid && lid === target && tables.profiles.has(id)) {
        return id;
      }
    }
    return null;
  };

  const executeStatement = (sql, args = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    return {
      async first() {
        if (/SELECT 1 AS ok FROM (\w+) LIMIT 1/i.test(normalized)) {
          const table = normalized.match(/FROM (\w+)/i)[1];
          return tables[table] && tables[table].size > 0 ? { ok: 1 } : null;
        }
        if (/UPDATE profiles SET data = json_set\(/i.test(normalized) && /RETURNING/i.test(normalized)) {
          const matchedId = findProfileIdByIdOrCustomId(args[0]);
          if (!matchedId) return null;
          const parsed = JSON.parse(tables.profiles.get(matchedId));
          const nextCount = (Number(parsed.downloadCount) || 0) + 1;
          parsed.downloadCount = nextCount;
          tables.profiles.set(matchedId, JSON.stringify(parsed));
          return { downloadCount: nextCount };
        }
        if (/FROM profiles WHERE id = \? OR custom_id = \?(?: OR link_id = \?)?/i.test(normalized)) {
          const matchedId = findProfileIdByIdOrCustomId(args[0]);
          if (!matchedId) return null;
          return { data: tables.profiles.get(matchedId) };
        }
        const idMatch = normalized.match(/FROM (subscriptions|nodes|profiles|guestbook) WHERE id = \?/i);
        if (idMatch) {
          const tbl = tables[idMatch[1].toLowerCase()];
          const data = tbl.get(args[0]);
          return data === undefined ? null : { data };
        }
        const kvMatch = normalized.match(/FROM (settings|cache|logs) WHERE key = \?/i);
        if (kvMatch) {
          const tblName = kvMatch[1].toLowerCase();
          if (tblName === 'logs' && legacyLogsDropped) {
            throw new Error('D1_ERROR: no such table: logs');
          }
          const tbl = tables[tblName];
          const data = tbl.get(args[0]);
          return data === undefined ? null : { data, value: data };
        }
        return null;
      },
      async all() {
        if (/FROM logs\b/i.test(normalized) && legacyLogsDropped) {
          throw new Error('D1_ERROR: no such table: logs');
        }
        if (/SELECT data FROM profiles WHERE id = \? OR custom_id = \? OR link_id = \?/i.test(normalized)) {
          const targetLower = String(args[0] ?? '')
            .trim()
            .toLowerCase();
          const rows = [];
          for (const [id, data] of tables.profiles.entries()) {
            const cid = String(profileCustomIds.get(id) || '').toLowerCase();
            const lid = String(profileLinkIds.get(id) || '').toLowerCase();
            if (targetLower && (id.toLowerCase() === targetLower || cid === targetLower || lid === targetLower)) {
              rows.push({ data });
            }
          }
          return { results: rows };
        }
        if (/SELECT id,\s*data FROM profiles WHERE custom_id IS NULL/i.test(normalized)) {
          const rows = [];
          for (const [id, data] of tables.profiles.entries()) {
            if (!profileCustomIds.get(id)) {
              rows.push({ id, data });
            }
          }
          return { results: rows };
        }
        if (/SELECT data FROM access_logs/i.test(normalized)) {
          const minTs = Number(args[0]) || 0;
          const limit = Number(args[1]) || 200;
          const rows = Array.from(tables.access_logs.values())
            .filter((entry) => entry.timestamp >= minTs)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map((entry) => ({ data: entry.data }));
          return { results: rows };
        }
        if (/SELECT data FROM error_reports/i.test(normalized)) {
          const limit = Number(args[0]) || 100;
          const rows = Array.from(tables.error_reports.values())
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .map((entry) => ({ data: entry.data }));
          return { results: rows };
        }
        if (/SELECT key FROM cache WHERE expires_at IS NULL/i.test(normalized)) {
          const rows = [];
          for (const key of tables.cache.keys()) {
            const exp = cacheExpiresAt.get(key);
            if (exp === null || exp === undefined) {
              rows.push({ key });
            }
          }
          return { results: rows };
        }
        if (/SELECT key,\s*value,\s*expires_at FROM cache WHERE key IN/i.test(normalized)) {
          return {
            results: args
              .filter((key) => tables.cache.has(key))
              .map((key) => ({
                key,
                value: tables.cache.get(key),
                expires_at: cacheExpiresAt.get(key) ?? null,
              })),
          };
        }
        const idInMatch = normalized.match(/SELECT data FROM (subscriptions|nodes|profiles|guestbook) WHERE id IN/i);
        if (idInMatch) {
          const tbl = tables[idInMatch[1].toLowerCase()];
          return {
            results: args.filter((id) => tbl.has(id)).map((id) => ({ data: tbl.get(id) })),
          };
        }
        const idDataBothAll = normalized.match(/SELECT id,\s*data FROM (subscriptions|nodes|profiles|guestbook)/i);
        if (idDataBothAll) {
          const tbl = tables[idDataBothAll[1].toLowerCase()];
          return {
            results: Array.from(tbl.entries()).map(([id, data]) => ({ id, data })),
          };
        }
        const idDataAll = normalized.match(/SELECT data FROM (subscriptions|nodes|profiles|guestbook)/i);
        if (idDataAll) {
          const tbl = tables[idDataAll[1].toLowerCase()];
          return {
            results: Array.from(tbl.values()).map((data) => ({ data })),
          };
        }
        const idOnlyAll = normalized.match(/SELECT id FROM (subscriptions|nodes|profiles|guestbook)/i);
        if (idOnlyAll) {
          const tbl = tables[idOnlyAll[1].toLowerCase()];
          return {
            results: Array.from(tbl.keys()).map((id) => ({ id })),
          };
        }
        const kvKeyValueAll = normalized.match(/SELECT key,\s*value FROM (settings|cache|logs)/i);
        if (kvKeyValueAll) {
          const tbl = tables[kvKeyValueAll[1].toLowerCase()];
          return {
            results: Array.from(tbl.entries()).map(([key, value]) => ({ key, value })),
          };
        }
        const kvKeyLike = normalized.match(/SELECT key FROM (settings|cache|logs) WHERE key LIKE \?/i);
        if (kvKeyLike) {
          const tbl = tables[kvKeyLike[1].toLowerCase()];
          const prefix = String(args[0] || '').replace(/%$/, '');
          return {
            results: Array.from(tbl.keys())
              .filter((k) => k.startsWith(prefix))
              .map((key) => ({ key })),
          };
        }
        const kvKeyAll = normalized.match(/SELECT key FROM (settings|cache|logs)/i);
        if (kvKeyAll) {
          const tbl = tables[kvKeyAll[1].toLowerCase()];
          return {
            results: Array.from(tbl.keys()).map((key) => ({ key })),
          };
        }
        return { results: [] };
      },
      async run() {
        if (/^\s*(CREATE|ALTER)\s+/i.test(normalized)) {
          return { success: true, meta: { changes: 0 } };
        }
        if (/DROP TABLE IF EXISTS logs/i.test(normalized)) {
          tables.logs.clear();
          legacyLogsDropped = true;
          return { success: true, meta: { changes: 0 } };
        }
        if (/UPDATE profiles SET custom_id =/i.test(normalized)) {
          for (const [id, data] of tables.profiles.entries()) {
            if (!profileCustomIds.get(id)) {
              try {
                const parsed = JSON.parse(data);
                if (typeof parsed?.customId === 'string' && parsed.customId.trim()) {
                  profileCustomIds.set(id, parsed.customId.trim());
                }
              } catch {}
            }
          }
          return { success: true, meta: { changes: 0 } };
        }
        if (/UPDATE profiles SET link_id =/i.test(normalized)) {
          for (const [id, data] of tables.profiles.entries()) {
            if (!profileLinkIds.get(id)) {
              try {
                const parsed = JSON.parse(data);
                if (typeof parsed?.linkId === 'string' && parsed.linkId.trim()) {
                  profileLinkIds.set(id, parsed.linkId.trim());
                }
              } catch {}
            }
          }
          return { success: true, meta: { changes: 0 } };
        }
        if (/INSERT OR REPLACE INTO profiles \(id, custom_id, link_id, data/i.test(normalized)) {
          tables.profiles.set(args[0], args[3]);
          profileCustomIds.set(args[0], args[1] || null);
          profileLinkIds.set(args[0], args[2] || null);
          return { success: true, meta: { changes: 1 } };
        }
        if (/INSERT OR REPLACE INTO profiles \(id, custom_id, data/i.test(normalized)) {
          tables.profiles.set(args[0], args[2]);
          profileCustomIds.set(args[0], args[1] || null);
          return { success: true, meta: { changes: 1 } };
        }
        if (/UPDATE profiles SET data = json_set\(data,\s*'\$\.downloadCount',\s*0\)/i.test(normalized)) {
          let changes = 0;
          const targetId = /WHERE id = \?/i.test(normalized) ? args[0] : null;
          for (const [id, data] of Array.from(tables.profiles.entries())) {
            if (targetId && id !== targetId) continue;
            try {
              const parsed = JSON.parse(data);
              parsed.downloadCount = 0;
              tables.profiles.set(id, JSON.stringify(parsed));
              changes += 1;
            } catch {}
          }
          return { success: true, meta: { changes } };
        }
        if (/INSERT OR REPLACE INTO cache \(key, value, expires_at/i.test(normalized)) {
          tables.cache.set(args[0], args[1]);
          cacheExpiresAt.set(args[0], args[2] ?? null);
          return { success: true, meta: { changes: 1 } };
        }
        if (/UPDATE cache SET expires_at = \? WHERE key = \?/i.test(normalized)) {
          if (tables.cache.has(args[1])) {
            cacheExpiresAt.set(args[1], args[0]);
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (/DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at <= \?/i.test(normalized)) {
          const now = Number(args[0]) || 0;
          let changes = 0;
          for (const [key, exp] of Array.from(cacheExpiresAt.entries())) {
            if (exp !== null && exp !== undefined && exp <= now) {
              tables.cache.delete(key);
              cacheExpiresAt.delete(key);
              changes += 1;
            }
          }
          return { success: true, meta: { changes } };
        }
        const logInsert = normalized.match(/INSERT OR REPLACE INTO (access_logs|error_reports)/i);
        if (logInsert) {
          const tbl = tables[logInsert[1].toLowerCase()];
          tbl.set(args[0], { timestamp: Number(args[1]) || 0, data: args[2] });
          return { success: true, meta: { changes: 1 } };
        }
        if (/DELETE FROM access_logs WHERE timestamp < \?/i.test(normalized)) {
          const cutoff = Number(args[0]) || 0;
          let changes = 0;
          for (const [id, entry] of Array.from(tables.access_logs.entries())) {
            if (entry.timestamp < cutoff) {
              tables.access_logs.delete(id);
              changes += 1;
            }
          }
          return { success: true, meta: { changes } };
        }
        if (/DELETE FROM access_logs WHERE json_extract\(data,\s*'\$\.profileId'\)\s*=\s*\?/i.test(normalized)) {
          const targetProfileId = String(args[0] ?? '');
          const targetProfileName = String(args[2] ?? '');
          let changes = 0;
          for (const [id, entry] of Array.from(tables.access_logs.entries())) {
            try {
              const parsed = JSON.parse(entry.data);
              if (
                parsed?.profileId === targetProfileId ||
                (!parsed?.profileId && targetProfileName && parsed?.profileName === targetProfileName)
              ) {
                tables.access_logs.delete(id);
                changes += 1;
              }
            } catch {
              // Ignore malformed JSON
            }
          }
          return { success: true, meta: { changes } };
        }
        if (/DELETE FROM access_logs WHERE json_extract\(data,\s*'\$\.profileName'\)\s*=\s*\?/i.test(normalized)) {
          const targetProfileName = String(args[0] ?? '');
          let changes = 0;
          for (const [id, entry] of Array.from(tables.access_logs.entries())) {
            try {
              const parsed = JSON.parse(entry.data);
              if (parsed?.profileName === targetProfileName) {
                tables.access_logs.delete(id);
                changes += 1;
              }
            } catch {
              // Ignore malformed JSON
            }
          }
          return { success: true, meta: { changes } };
        }
        const logTrimMatch = normalized.match(/DELETE FROM (access_logs|error_reports) WHERE id NOT IN/i);
        if (logTrimMatch) {
          const tbl = tables[logTrimMatch[1].toLowerCase()];
          const limit = Number(args[0]) || 200;
          const keepIds = new Set(
            Array.from(tbl.entries())
              .sort((a, b) => b[1].timestamp - a[1].timestamp)
              .slice(0, limit)
              .map(([id]) => id),
          );
          let changes = 0;
          for (const id of Array.from(tbl.keys())) {
            if (!keepIds.has(id)) {
              tbl.delete(id);
              changes += 1;
            }
          }
          return { success: true, meta: { changes } };
        }
        const idInsertIgnore = normalized.match(/INSERT OR IGNORE INTO (subscriptions|nodes|profiles|guestbook)/i);
        if (idInsertIgnore) {
          const tbl = tables[idInsertIgnore[1].toLowerCase()];
          if (!tbl.has(args[0])) tbl.set(args[0], args[1]);
          return { success: true, meta: { changes: 1 } };
        }
        const idInsert = normalized.match(/INSERT OR REPLACE INTO (subscriptions|nodes|profiles|guestbook)/i);
        if (idInsert) {
          tables[idInsert[1].toLowerCase()].set(args[0], args[1]);
          return { success: true, meta: { changes: 1 } };
        }
        const kvInsertIgnore = normalized.match(/INSERT OR IGNORE INTO (settings|cache|logs)/i);
        if (kvInsertIgnore) {
          const tbl = tables[kvInsertIgnore[1].toLowerCase()];
          if (!tbl.has(args[0])) tbl.set(args[0], args[1]);
          return { success: true, meta: { changes: 1 } };
        }
        const kvInsert = normalized.match(/INSERT OR REPLACE INTO (settings|cache|logs)/i);
        if (kvInsert) {
          tables[kvInsert[1].toLowerCase()].set(args[0], args[1]);
          return { success: true, meta: { changes: 1 } };
        }
        const kvDelete = normalized.match(/DELETE FROM (settings|cache|logs) WHERE key = \?/i);
        if (kvDelete) {
          const tblName = kvDelete[1].toLowerCase();
          tables[tblName].delete(args[0]);
          if (tblName === 'cache') cacheExpiresAt.delete(args[0]);
          return { success: true, meta: { changes: 1 } };
        }
        const idDelete = normalized.match(/DELETE FROM (subscriptions|nodes|profiles|guestbook) WHERE id = \?/i);
        if (idDelete) {
          const tblName = idDelete[1].toLowerCase();
          tables[tblName].delete(args[0]);
          if (tblName === 'profiles') {
            profileCustomIds.delete(args[0]);
            profileLinkIds.delete(args[0]);
          }
          return { success: true, meta: { changes: 1 } };
        }
        const clearMatch = normalized.match(
          /^DELETE FROM (subscriptions|nodes|profiles|guestbook|settings|cache|access_logs|error_reports|logs)$/i,
        );
        if (clearMatch) {
          const tblName = clearMatch[1].toLowerCase();
          tables[tblName].clear();
          if (tblName === 'profiles') {
            profileCustomIds.clear();
            profileLinkIds.clear();
          }
          if (tblName === 'cache') cacheExpiresAt.clear();
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
  };

  return {
    tables,
    profileCustomIds,
    cacheExpiresAt,
    async batch(statements = []) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
    prepare(sql) {
      const unbound = executeStatement(sql, []);
      return {
        ...unbound,
        bind(...args) {
          return executeStatement(sql, args);
        },
      };
    },
    dump() {
      const out = {};
      const allSubsAndNodes = [
        ...Array.from(tables.subscriptions.values()).map((v) => JSON.parse(v)),
        ...Array.from(tables.nodes.values()).map((v) => JSON.parse(v)),
      ].sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
      out.subscriptions = JSON.stringify(allSubsAndNodes);
      out.profiles = JSON.stringify(Array.from(tables.profiles.values()).map((v) => JSON.parse(v)));
      for (const [k, v] of tables.settings.entries()) {
        out[k] = v;
      }
      for (const [k, v] of tables.cache.entries()) {
        out[k] = v;
      }
      return out;
    },
  };
}
