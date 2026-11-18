/**
 * 内存版 D1 数据库测试桩，兼容七表结构（subscriptions / nodes / profiles / guestbook / settings / cache / logs）与认证 SQL。
 */
export function createMemoryD1(initial = {}) {
    const tables = {
        subscriptions: new Map(),
        nodes: new Map(),
        profiles: new Map(),
        guestbook: new Map(),
        settings: new Map(),
        cache: new Map(),
        logs: new Map(),
    };

    const isManualNode = (item) => {
        const url = typeof item?.url === 'string' ? item.url.trim() : '';
        return Boolean(url && !/^https?:\/\//i.test(url));
    };

    const isCacheKey = (k) =>
        k === 'misub_webdav_backup_lock' ||
        k === 'misub_restore_snapshot_latest' ||
        k === 'cron_last_execution' ||
        k.startsWith('node_cache_') ||
        k.startsWith('github_release_') ||
        k.startsWith('tmp_external_nodes:') ||
        k.startsWith('tg_push_rate:') ||
        k.startsWith('misub_test_');

    const isLogKey = (k) =>
        k === 'misub_error_reports' ||
        k === 'misub_system_logs' ||
        k === 'misub_system_logs_index' ||
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
        if (key === 'subscriptions' || key === 'misub_subscriptions_v1') {
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
        } else if (key === 'profiles' || key === 'misub_profiles_v1') {
            const arr = parseIfJson(rawVal);
            if (Array.isArray(arr)) {
                arr.forEach((item, idx) => {
                    if (item) {
                        const id = item.id || `profile-${idx + 1}`;
                        tables.profiles.set(id, JSON.stringify({ ...item, id }));
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
        } else if (key === 'worker_settings_v1') {
            tables.settings.set('main', serialize(rawVal));
        } else if (isCacheKey(key)) {
            tables.cache.set(key, serialize(rawVal));
        } else if (isLogKey(key)) {
            tables.logs.set(key, serialize(rawVal));
        } else {
            tables.settings.set(key, serialize(rawVal));
        }
    }

    const executeStatement = (sql, args = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();

        return {
            async first() {
                if (/SELECT 1 AS ok FROM (\w+) LIMIT 1/i.test(normalized)) {
                    const table = normalized.match(/FROM (\w+)/i)[1];
                    return tables[table] && tables[table].size > 0 ? { ok: 1 } : null;
                }
                const idMatch = normalized.match(
                    /FROM (subscriptions|nodes|profiles|guestbook) WHERE id = \?/i
                );
                if (idMatch) {
                    const tbl = tables[idMatch[1].toLowerCase()];
                    const data = tbl.get(args[0]);
                    return data === undefined ? null : { data };
                }
                const kvMatch = normalized.match(/FROM (settings|cache|logs) WHERE key = \?/i);
                if (kvMatch) {
                    const tbl = tables[kvMatch[1].toLowerCase()];
                    const data = tbl.get(args[0]);
                    return data === undefined ? null : { data, value: data };
                }
                return null;
            },
            async all() {
                const idInMatch = normalized.match(
                    /SELECT data FROM (subscriptions|nodes|profiles|guestbook) WHERE id IN/i
                );
                if (idInMatch) {
                    const tbl = tables[idInMatch[1].toLowerCase()];
                    return {
                        results: args
                            .filter((id) => tbl.has(id))
                            .map((id) => ({ data: tbl.get(id) })),
                    };
                }
                const idDataBothAll = normalized.match(
                    /SELECT id,\s*data FROM (subscriptions|nodes|profiles|guestbook)/i
                );
                if (idDataBothAll) {
                    const tbl = tables[idDataBothAll[1].toLowerCase()];
                    return {
                        results: Array.from(tbl.entries()).map(([id, data]) => ({ id, data })),
                    };
                }
                const idDataAll = normalized.match(
                    /SELECT data FROM (subscriptions|nodes|profiles|guestbook)/i
                );
                if (idDataAll) {
                    const tbl = tables[idDataAll[1].toLowerCase()];
                    return {
                        results: Array.from(tbl.values()).map((data) => ({ data })),
                    };
                }
                const idOnlyAll = normalized.match(
                    /SELECT id FROM (subscriptions|nodes|profiles|guestbook)/i
                );
                if (idOnlyAll) {
                    const tbl = tables[idOnlyAll[1].toLowerCase()];
                    return {
                        results: Array.from(tbl.keys()).map((id) => ({ id })),
                    };
                }
                const kvKeyValueAll = normalized.match(
                    /SELECT key,\s*value FROM (settings|cache|logs)/i
                );
                if (kvKeyValueAll) {
                    const tbl = tables[kvKeyValueAll[1].toLowerCase()];
                    return {
                        results: Array.from(tbl.entries()).map(([key, value]) => ({ key, value })),
                    };
                }
                const kvKeyLike = normalized.match(
                    /SELECT key FROM (settings|cache|logs) WHERE key LIKE \?/i
                );
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
                if (/^\s*CREATE /i.test(normalized)) {
                    return { success: true };
                }
                const idInsertIgnore = normalized.match(
                    /INSERT OR IGNORE INTO (subscriptions|nodes|profiles|guestbook)/i
                );
                if (idInsertIgnore) {
                    const tbl = tables[idInsertIgnore[1].toLowerCase()];
                    if (!tbl.has(args[0])) tbl.set(args[0], args[1]);
                    return { success: true };
                }
                const idInsert = normalized.match(
                    /INSERT OR REPLACE INTO (subscriptions|nodes|profiles|guestbook)/i
                );
                if (idInsert) {
                    tables[idInsert[1].toLowerCase()].set(args[0], args[1]);
                    return { success: true };
                }
                const kvInsertIgnore = normalized.match(
                    /INSERT OR IGNORE INTO (settings|cache|logs)/i
                );
                if (kvInsertIgnore) {
                    const tbl = tables[kvInsertIgnore[1].toLowerCase()];
                    if (!tbl.has(args[0])) tbl.set(args[0], args[1]);
                    return { success: true };
                }
                const kvInsert = normalized.match(
                    /INSERT OR REPLACE INTO (settings|cache|logs)/i
                );
                if (kvInsert) {
                    tables[kvInsert[1].toLowerCase()].set(args[0], args[1]);
                    return { success: true };
                }
                const kvDelete = normalized.match(
                    /DELETE FROM (settings|cache|logs) WHERE key = \?/i
                );
                if (kvDelete) {
                    tables[kvDelete[1].toLowerCase()].delete(args[0]);
                    return { success: true };
                }
                const idDelete = normalized.match(
                    /DELETE FROM (subscriptions|nodes|profiles|guestbook) WHERE id = \?/i
                );
                if (idDelete) {
                    tables[idDelete[1].toLowerCase()].delete(args[0]);
                    return { success: true };
                }
                const clearMatch = normalized.match(
                    /^DELETE FROM (subscriptions|nodes|profiles|guestbook|settings|cache|logs)$/i
                );
                if (clearMatch) {
                    tables[clearMatch[1].toLowerCase()].clear();
                    return { success: true };
                }
                return { success: true };
            },
        };
    };

    return {
        tables,
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
            out.misub_subscriptions_v1 = JSON.stringify(allSubsAndNodes);
            out.misub_profiles_v1 = JSON.stringify(
                Array.from(tables.profiles.values()).map((v) => JSON.parse(v))
            );
            for (const [k, v] of tables.settings.entries()) {
                if (k === 'main') {
                    out.worker_settings_v1 = v;
                } else {
                    out[k] = v;
                }
            }
            for (const [k, v] of tables.cache.entries()) {
                out[k] = v;
            }
            for (const [k, v] of tables.logs.entries()) {
                out[k] = v;
            }
            return out;
        },
    };
}
