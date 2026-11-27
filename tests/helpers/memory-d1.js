/**
 * 内存版 D1 数据库测试桩，兼容八表结构与 schema_versions 线性迁移表
 * （subscriptions / nodes / profiles / guestbook / settings / cache / access_logs / error_reports）
 * 严格禁止 PRAGMA user_version（模拟 Cloudflare D1 鉴权限制）并校验 DDL/列/DML 状态。
 */
export function createMemoryD1(initial = {}, options = {}) {
  const ALL_BASE_TABLES = [
    'subscriptions',
    'nodes',
    'profiles',
    'guestbook',
    'settings',
    'cache',
    'access_logs',
    'error_reports',
  ];
  const TRACKED_COLUMNS = {
    subscriptions: ['config_version'],
    nodes: ['config_version'],
    profiles: ['custom_id', 'link_id', 'config_version'],
    cache: ['expires_at'],
  };

  const rawSchemaOption = options.schemaVersion ?? options.userVersion;
  const initialVersion = Number.isInteger(rawSchemaOption) ? rawSchemaOption : 2;
  const explicitExistingTables = Array.isArray(options.existingTables);
  const existingTables = new Set(
    explicitExistingTables
      ? options.existingTables
      : initialVersion >= 1
        ? [...ALL_BASE_TABLES, 'logs', 'schema_versions']
        : [],
  );
  const existingColumns = new Set();
  if (initialVersion >= 1) {
    existingColumns.add('profiles.custom_id');
    existingColumns.add('profiles.link_id');
    existingColumns.add('cache.expires_at');
  }
  if (initialVersion >= 2 || options.hasConfigVersionColumns === true) {
    existingColumns.add('subscriptions.config_version');
    existingColumns.add('nodes.config_version');
    existingColumns.add('profiles.config_version');
  }

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
    schema_versions: new Map(),
  };

  if (existingTables.has('schema_versions') && initialVersion >= 1) {
    tables.schema_versions.set(1, { version: 1, name: '0000_initial_schema' });
    if (initialVersion >= 2) {
      tables.schema_versions.set(2, { version: 2, name: '0001_add_config_version' });
    }
  }

  const configVersions = {
    subscriptions: new Map(),
    nodes: new Map(),
    profiles: new Map(),
  };
  const profileCustomIds = new Map();
  const profileLinkIds = new Map();
  const cacheExpiresAt = new Map();
  let legacyLogsDropped = false;

  const resolveInitialVersion = (item) => Math.max(1, Number(item?.configVersion ?? item?.version) || 1);

  const isManualNode = (item) => {
    const url = typeof item?.url === 'string' ? item.url.trim() : '';
    return Boolean(url && !/^https?:\/\//i.test(url));
  };

  const isCacheKey = (k) =>
    k === 'misub_webdav_backup_lock' ||
    k === 'misub_webdav_backup_last_checked' ||
    k === 'misub_last_maintenance_at' ||
    k === 'misub_maintenance_lock' ||
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

  const markSeededTableIfUnconstrained = (tblName) => {
    if (!explicitExistingTables && initialVersion === 0) {
      existingTables.add(tblName);
    }
  };

  for (const [key, rawVal] of Object.entries(initial)) {
    if (rawVal === undefined || rawVal === null) continue;
    if (key === 'subscriptions') {
      const arr = parseIfJson(rawVal);
      if (Array.isArray(arr)) {
        arr.forEach((item, idx) => {
          if (item) {
            const id = item.id || `sub-${idx + 1}`;
            const tblName = isManualNode(item) ? 'nodes' : 'subscriptions';
            markSeededTableIfUnconstrained(tblName);
            const clean = { ...item, id };
            if (existingColumns.has(`${tblName}.config_version`)) {
              const ver = resolveInitialVersion(item);
              delete clean.version;
              delete clean.configVersion;
              configVersions[tblName].set(id, ver);
            }
            tables[tblName].set(id, JSON.stringify(clean));
          }
        });
      }
    } else if (key === 'nodes') {
      const arr = parseIfJson(rawVal);
      if (Array.isArray(arr)) {
        arr.forEach((item, idx) => {
          if (item) {
            const id = item.id || `node-${idx + 1}`;
            markSeededTableIfUnconstrained('nodes');
            const clean = { ...item, id };
            if (existingColumns.has('nodes.config_version')) {
              const ver = resolveInitialVersion(item);
              delete clean.version;
              delete clean.configVersion;
              configVersions.nodes.set(id, ver);
            }
            tables.nodes.set(id, JSON.stringify(clean));
          }
        });
      }
    } else if (key === 'profiles') {
      const arr = parseIfJson(rawVal);
      if (Array.isArray(arr)) {
        arr.forEach((item, idx) => {
          if (item) {
            const id = item.id || `profile-${idx + 1}`;
            markSeededTableIfUnconstrained('profiles');
            const customId = typeof item.customId === 'string' && item.customId.trim() ? item.customId.trim() : null;
            const linkId = typeof item.linkId === 'string' && item.linkId.trim() ? item.linkId.trim() : null;
            const clean = { ...item, id };
            if (existingColumns.has('profiles.config_version')) {
              const ver = resolveInitialVersion(item);
              delete clean.version;
              delete clean.configVersion;
              configVersions.profiles.set(id, ver);
            }
            tables.profiles.set(id, JSON.stringify(clean));
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
            markSeededTableIfUnconstrained('guestbook');
            const id = item.id || `msg-${idx + 1}`;
            tables.guestbook.set(id, JSON.stringify({ ...item, id }));
          }
        });
      }
    } else if (isCacheKey(key)) {
      markSeededTableIfUnconstrained('cache');
      tables.cache.set(key, serialize(rawVal));
      cacheExpiresAt.set(key, null);
    } else if (isLegacyLogKey(key)) {
      markSeededTableIfUnconstrained('logs');
      tables.logs.set(key, serialize(rawVal));
    } else {
      markSeededTableIfUnconstrained('settings');
      tables.settings.set(key, serialize(rawVal));
    }
  }

  const assertTableAndCols = (tblName, sqlStr) => {
    if (!tblName) return;
    if (tblName === 'logs') {
      if (legacyLogsDropped || !existingTables.has('logs')) {
        throw new Error('D1_ERROR: no such table: logs');
      }
      return;
    }
    if (!existingTables.has(tblName)) {
      throw new Error(`D1_ERROR: no such table: ${tblName}`);
    }
    for (const col of TRACKED_COLUMNS[tblName] || []) {
      if (new RegExp(`\\b${col}\\b`, 'i').test(sqlStr) && !existingColumns.has(`${tblName}.${col}`)) {
        throw new Error(`D1_ERROR: no such column: ${col}`);
      }
    }
  };

  const assertDmlTarget = (normalizedSql) => {
    const tblMatch = normalizedSql.match(
      /^(?:SELECT\b.*?\bFROM|INSERT\s+(?:OR\s+(?:REPLACE|IGNORE)\s+)?INTO|UPDATE|DELETE\s+FROM)\s+(subscriptions|nodes|profiles|guestbook|settings|cache|access_logs|error_reports|logs|schema_versions)\b/i,
    );
    if (tblMatch) {
      assertTableAndCols(tblMatch[1].toLowerCase(), normalizedSql);
    }
  };

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

  const getSchemaVersion = () =>
    Array.from(tables.schema_versions.keys()).reduce((max, ver) => Math.max(max, Number(ver) || 0), 0);

  const executeStatement = (sql, args = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    return {
      async first() {
        if (/^PRAGMA\s+user_version/i.test(normalized)) {
          throw new Error('D1_ERROR: not authorized');
        }
        assertDmlTarget(normalized);

        if (/^SELECT\s+COALESCE\(MAX\(version\),\s*0\)\s+AS\s+version\s+FROM\s+schema_versions/i.test(normalized)) {
          return { version: getSchemaVersion() };
        }
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
        if (/SELECT id,\s*data(?:,\s*config_version)? FROM profiles WHERE id = \? OR custom_id = \?(?: OR link_id = \?)?/i.test(normalized)) {
          const matchedId = findProfileIdByIdOrCustomId(args[0]);
          if (!matchedId) return null;
          return {
            id: matchedId,
            data: tables.profiles.get(matchedId),
            config_version: configVersions.profiles.get(matchedId) ?? 1,
          };
        }
        if (/FROM profiles WHERE id = \? OR custom_id = \?(?: OR link_id = \?)?/i.test(normalized)) {
          const matchedId = findProfileIdByIdOrCustomId(args[0]);
          if (!matchedId) return null;
          return {
            data: tables.profiles.get(matchedId),
            config_version: configVersions.profiles.get(matchedId) ?? 1,
          };
        }
        const idMatch = normalized.match(/FROM (subscriptions|nodes|profiles|guestbook) WHERE id = \?/i);
        if (idMatch) {
          const tblName = idMatch[1].toLowerCase();
          const tbl = tables[tblName];
          const data = tbl.get(args[0]);
          if (data === undefined) return null;
          if (tblName === 'guestbook') return { data };
          return { data, config_version: configVersions[tblName].get(args[0]) ?? 1 };
        }
        const kvMatch = normalized.match(/FROM (settings|cache|logs) WHERE key = \?/i);
        if (kvMatch) {
          const tblName = kvMatch[1].toLowerCase();
          const tbl = tables[tblName];
          const data = tbl.get(args[0]);
          return data === undefined ? null : { data, value: data };
        }
        return null;
      },
      async all() {
        if (/^PRAGMA\s+user_version/i.test(normalized)) {
          throw new Error('D1_ERROR: not authorized');
        }
        assertDmlTarget(normalized);

        if (/FROM schema_versions/i.test(normalized)) {
          return {
            results: Array.from(tables.schema_versions.values()).sort((a, b) => a.version - b.version),
          };
        }
        if (/SELECT data(?:,\s*config_version)? FROM profiles WHERE id = \? OR custom_id = \? OR link_id = \?/i.test(normalized)) {
          const targetLower = String(args[0] ?? '')
            .trim()
            .toLowerCase();
          const rows = [];
          for (const [id, data] of tables.profiles.entries()) {
            const cid = String(profileCustomIds.get(id) || '').toLowerCase();
            const lid = String(profileLinkIds.get(id) || '').toLowerCase();
            if (targetLower && (id.toLowerCase() === targetLower || cid === targetLower || lid === targetLower)) {
              rows.push({ data, config_version: configVersions.profiles.get(id) ?? 1 });
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
        const idInMatch = normalized.match(/SELECT data(?:,\s*config_version)? FROM (subscriptions|nodes|profiles|guestbook) WHERE id IN/i);
        if (idInMatch) {
          const tblName = idInMatch[1].toLowerCase();
          const tbl = tables[tblName];
          return {
            results: args
              .filter((id) => tbl.has(id))
              .map((id) =>
                tblName === 'guestbook'
                  ? { data: tbl.get(id) }
                  : { data: tbl.get(id), config_version: configVersions[tblName].get(id) ?? 1 },
              ),
          };
        }
        const idDataBothAll = normalized.match(/SELECT id,\s*data FROM (subscriptions|nodes|profiles|guestbook)/i);
        if (idDataBothAll) {
          const tbl = tables[idDataBothAll[1].toLowerCase()];
          return {
            results: Array.from(tbl.entries()).map(([id, data]) => ({ id, data })),
          };
        }
        const idDataAll = normalized.match(/SELECT data(?:,\s*config_version)? FROM (subscriptions|nodes|profiles|guestbook)/i);
        if (idDataAll) {
          const tblName = idDataAll[1].toLowerCase();
          const tbl = tables[tblName];
          return {
            results: Array.from(tbl.entries()).map(([id, data]) =>
              tblName === 'guestbook'
                ? { data }
                : { data, config_version: configVersions[tblName].get(id) ?? 1 },
            ),
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
        if (/^PRAGMA\s+user_version/i.test(normalized)) {
          throw new Error('D1_ERROR: not authorized');
        }
        const createTableMatch = normalized.match(
          /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\((.+)\)\s*;?$/i,
        );
        if (createTableMatch) {
          const tblName = createTableMatch[1].toLowerCase();
          const colsSql = createTableMatch[2];
          existingTables.add(tblName);
          for (const col of TRACKED_COLUMNS[tblName] || []) {
            if (new RegExp(`\\b${col}\\b`, 'i').test(colsSql)) {
              existingColumns.add(`${tblName}.${col}`);
            }
          }
          return { success: true, meta: { changes: 0 } };
        }
        const alterColMatch = normalized.match(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\b/i);
        if (alterColMatch) {
          const tblName = alterColMatch[1].toLowerCase();
          const colName = alterColMatch[2].toLowerCase();
          if (!existingTables.has(tblName)) {
            throw new Error(`D1_ERROR: no such table: ${tblName}`);
          }
          const colKey = `${tblName}.${colName}`;
          if (existingColumns.has(colKey)) {
            throw new Error(`D1_EXEC_ERROR: Error in line 1: ${normalized}: sql error: duplicate column name: ${colName}`);
          }
          existingColumns.add(colKey);
          if (colName === 'config_version' && configVersions[tblName]) {
            for (const id of tables[tblName].keys()) {
              if (!configVersions[tblName].has(id)) {
                configVersions[tblName].set(id, 1);
              }
            }
          }
          return { success: true, meta: { changes: 0 } };
        }
        const createIndexMatch = normalized.match(
          /^CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?\w+\s+ON\s+(\w+)\s*\(([^)]+)\)/i,
        );
        if (createIndexMatch) {
          assertTableAndCols(createIndexMatch[1].toLowerCase(), createIndexMatch[2]);
          return { success: true, meta: { changes: 0 } };
        }
        if (/DROP TABLE IF EXISTS logs/i.test(normalized)) {
          tables.logs.clear();
          existingTables.delete('logs');
          legacyLogsDropped = true;
          return { success: true, meta: { changes: 0 } };
        }

        assertDmlTarget(normalized);

        if (/^INSERT\s+OR\s+REPLACE\s+INTO\s+schema_versions\s*\(version,\s*name\)/i.test(normalized)) {
          const ver = Number(args[0]);
          const name = String(args[1] || '');
          tables.schema_versions.set(ver, { version: ver, name });
          return { success: true, meta: { changes: 1 } };
        }
        if (/^UPDATE (subscriptions|nodes) SET data = \?, config_version = COALESCE\(config_version, 1\) \+ 1, updated_at = CURRENT_TIMESTAMP WHERE id = \? AND COALESCE\(config_version, 1\) = \?/i.test(normalized)) {
          const match = normalized.match(/^UPDATE (subscriptions|nodes) SET/i);
          const tblName = match[1].toLowerCase();
          const tbl = tables[tblName];
          const [nextData, targetId, expectedVer] = args;
          if (!tbl.has(targetId)) {
            return { success: true, meta: { changes: 0 } };
          }
          const currentVer = configVersions[tblName].get(targetId) ?? 1;
          if (currentVer !== Math.max(1, Number(expectedVer) || 1)) {
            return { success: true, meta: { changes: 0 } };
          }
          const nextVer = currentVer + 1;
          tbl.set(targetId, nextData);
          configVersions[tblName].set(targetId, nextVer);
          return { success: true, meta: { changes: 1 } };
        }
        if (/^UPDATE (subscriptions|nodes) SET data = \?, updated_at = CURRENT_TIMESTAMP WHERE id = \?$/i.test(normalized)) {
          const match = normalized.match(/^UPDATE (subscriptions|nodes) SET/i);
          const tblName = match[1].toLowerCase();
          const tbl = tables[tblName];
          const [nextData, targetId] = args;
          if (!tbl.has(targetId)) {
            return { success: true, meta: { changes: 0 } };
          }
          tbl.set(targetId, nextData);
          return { success: true, meta: { changes: 1 } };
        }
        const jsonSetMatch = normalized.match(
          /^UPDATE (subscriptions|nodes|profiles) SET data = json_set\(data,\s*(.+?)\),\s*updated_at = CURRENT_TIMESTAMP WHERE id = \?$/i,
        );
        if (jsonSetMatch) {
          const tblName = jsonSetMatch[1].toLowerCase();
          const clausesStr = jsonSetMatch[2];
          const pairRegex = /'\$\.([A-Za-z0-9_]+)'\s*,\s*(json\(\?\)|\?)/gi;
          const pairs = [];
          let m;
          while ((m = pairRegex.exec(clausesStr)) !== null) {
            pairs.push({ key: m[1], isJson: m[2].toLowerCase() === 'json(?)' });
          }
          const targetId = args[pairs.length];
          const tbl = tables[tblName];
          const existingRaw = tbl.get(targetId);
          if (!existingRaw) {
            return { success: true, meta: { changes: 0 } };
          }
          const parsed = JSON.parse(existingRaw);
          pairs.forEach((pair, idx) => {
            const rawArg = args[idx];
            parsed[pair.key] = pair.isJson && typeof rawArg === 'string' ? JSON.parse(rawArg) : rawArg;
          });
          tbl.set(targetId, JSON.stringify(parsed));
          return { success: true, meta: { changes: 1 } };
        }
        if (/^UPDATE profiles SET custom_id = \?, link_id = \?, data = \?, config_version = COALESCE\(config_version, 1\) \+ 1, updated_at = CURRENT_TIMESTAMP WHERE id = \? AND COALESCE\(config_version, 1\) = \?/i.test(normalized)) {
          const [customId, linkId, nextData, targetId, expectedVer] = args;
          if (!tables.profiles.has(targetId)) {
            return { success: true, meta: { changes: 0 } };
          }
          const currentVer = configVersions.profiles.get(targetId) ?? 1;
          if (currentVer !== Math.max(1, Number(expectedVer) || 1)) {
            return { success: true, meta: { changes: 0 } };
          }
          const nextVer = currentVer + 1;
          tables.profiles.set(targetId, nextData);
          configVersions.profiles.set(targetId, nextVer);
          profileCustomIds.set(targetId, customId || null);
          profileLinkIds.set(targetId, linkId || null);
          return { success: true, meta: { changes: 1 } };
        }
        const verBackfillMatch = normalized.match(/^UPDATE (subscriptions|nodes|profiles) SET config_version = MAX\(/i);
        if (verBackfillMatch) {
          const tblName = verBackfillMatch[1].toLowerCase();
          let changes = 0;
          for (const [id, data] of tables[tblName].entries()) {
            const existingVer = configVersions[tblName].get(id) ?? 1;
            try {
              const jsonVer = resolveInitialVersion(JSON.parse(data));
              const nextVer = Math.max(existingVer, jsonVer);
              configVersions[tblName].set(id, nextVer);
              changes += 1;
            } catch {
              configVersions[tblName].set(id, existingVer);
            }
          }
          return { success: true, meta: { changes } };
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
        if (/INSERT OR REPLACE INTO profiles \(id, custom_id, link_id, data, config_version/i.test(normalized)) {
          tables.profiles.set(args[0], args[3]);
          configVersions.profiles.set(args[0], Math.max(1, Number(args[4]) || 1));
          profileCustomIds.set(args[0], args[1] || null);
          profileLinkIds.set(args[0], args[2] || null);
          return { success: true, meta: { changes: 1 } };
        }
        if (/INSERT OR REPLACE INTO profiles \(id, custom_id, link_id, data/i.test(normalized)) {
          tables.profiles.set(args[0], args[3]);
          configVersions.profiles.set(args[0], resolveInitialVersion(parseIfJson(args[3])));
          profileCustomIds.set(args[0], args[1] || null);
          profileLinkIds.set(args[0], args[2] || null);
          return { success: true, meta: { changes: 1 } };
        }
        if (/INSERT OR REPLACE INTO profiles \(id, custom_id, data/i.test(normalized)) {
          tables.profiles.set(args[0], args[2]);
          configVersions.profiles.set(args[0], resolveInitialVersion(parseIfJson(args[2])));
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
        const idInsertVer = normalized.match(/INSERT OR REPLACE INTO (subscriptions|nodes) \(id, data, config_version/i);
        if (idInsertVer) {
          const tblName = idInsertVer[1].toLowerCase();
          tables[tblName].set(args[0], args[1]);
          configVersions[tblName].set(args[0], Math.max(1, Number(args[2]) || 1));
          return { success: true, meta: { changes: 1 } };
        }
        const idInsertIgnore = normalized.match(/INSERT OR IGNORE INTO (subscriptions|nodes|profiles|guestbook)/i);
        if (idInsertIgnore) {
          const tblName = idInsertIgnore[1].toLowerCase();
          const tbl = tables[tblName];
          if (!tbl.has(args[0])) {
            tbl.set(args[0], args[1]);
            if (configVersions[tblName]) {
              configVersions[tblName].set(args[0], resolveInitialVersion(parseIfJson(args[1])));
            }
          }
          return { success: true, meta: { changes: 1 } };
        }
        const idInsert = normalized.match(/INSERT OR REPLACE INTO (subscriptions|nodes|profiles|guestbook)/i);
        if (idInsert) {
          const tblName = idInsert[1].toLowerCase();
          tables[tblName].set(args[0], args[1]);
          if (configVersions[tblName]) {
            configVersions[tblName].set(args[0], resolveInitialVersion(parseIfJson(args[1])));
          }
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
          if (configVersions[tblName]) configVersions[tblName].delete(args[0]);
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
          if (configVersions[tblName]) configVersions[tblName].clear();
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
    configVersions,
    profileCustomIds,
    profileLinkIds,
    cacheExpiresAt,
    existingTables,
    existingColumns,
    getSchemaVersion,
    getUserVersion: getSchemaVersion,
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
