/**
 * 内存版 D1 数据库测试桩，兼容 D1StorageAdapter 与认证查询 SQL。
 */
export function createMemoryD1(initial = {}) {
    const tables = {
        subscriptions: new Map(),
        profiles: new Map(),
        settings: new Map(),
    };

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
                        tables.subscriptions.set(id, JSON.stringify({ ...item, id }));
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
        } else if (key === 'worker_settings_v1') {
            tables.settings.set('main', serialize(rawVal));
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
                if (/FROM subscriptions WHERE id = \?/i.test(normalized)) {
                    const data = tables.subscriptions.get(args[0]);
                    return data === undefined ? null : { data };
                }
                if (/FROM profiles WHERE id = \?/i.test(normalized)) {
                    const data = tables.profiles.get(args[0]);
                    return data === undefined ? null : { data };
                }
                if (/FROM settings WHERE key = \?/i.test(normalized)) {
                    const data = tables.settings.get(args[0]);
                    return data === undefined ? null : { data, value: data };
                }
                return null;
            },
            async all() {
                if (/SELECT data FROM subscriptions WHERE id IN/i.test(normalized)) {
                    return {
                        results: args
                            .filter((id) => tables.subscriptions.has(id))
                            .map((id) => ({ data: tables.subscriptions.get(id) })),
                    };
                }
                if (/SELECT data FROM subscriptions/i.test(normalized)) {
                    return {
                        results: Array.from(tables.subscriptions.values()).map((data) => ({
                            data,
                        })),
                    };
                }
                if (/SELECT data FROM profiles/i.test(normalized)) {
                    return {
                        results: Array.from(tables.profiles.values()).map((data) => ({ data })),
                    };
                }
                if (/SELECT id FROM subscriptions/i.test(normalized)) {
                    return {
                        results: Array.from(tables.subscriptions.keys()).map((id) => ({ id })),
                    };
                }
                if (/SELECT id FROM profiles/i.test(normalized)) {
                    return {
                        results: Array.from(tables.profiles.keys()).map((id) => ({ id })),
                    };
                }
                if (/SELECT key FROM settings WHERE key LIKE \?/i.test(normalized)) {
                    const prefix = String(args[0] || '').replace(/%$/, '');
                    return {
                        results: Array.from(tables.settings.keys())
                            .filter((k) => k.startsWith(prefix))
                            .map((key) => ({ key })),
                    };
                }
                if (/SELECT key FROM settings/i.test(normalized)) {
                    return {
                        results: Array.from(tables.settings.keys()).map((key) => ({ key })),
                    };
                }
                return { results: [] };
            },
            async run() {
                if (/^\s*CREATE /i.test(normalized)) {
                    return { success: true };
                }
                if (/INSERT OR REPLACE INTO subscriptions/i.test(normalized)) {
                    tables.subscriptions.set(args[0], args[1]);
                } else if (/INSERT OR REPLACE INTO profiles/i.test(normalized)) {
                    tables.profiles.set(args[0], args[1]);
                } else if (/INSERT OR REPLACE INTO settings/i.test(normalized)) {
                    tables.settings.set(args[0], args[1]);
                } else if (/DELETE FROM subscriptions WHERE id = \?/i.test(normalized)) {
                    tables.subscriptions.delete(args[0]);
                } else if (/DELETE FROM profiles WHERE id = \?/i.test(normalized)) {
                    tables.profiles.delete(args[0]);
                } else if (/DELETE FROM settings WHERE key = \?/i.test(normalized)) {
                    tables.settings.delete(args[0]);
                } else if (/^DELETE FROM subscriptions$/i.test(normalized)) {
                    tables.subscriptions.clear();
                } else if (/^DELETE FROM profiles$/i.test(normalized)) {
                    tables.profiles.clear();
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
            out.misub_subscriptions_v1 = JSON.stringify(
                Array.from(tables.subscriptions.values()).map((v) => JSON.parse(v))
            );
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
            return out;
        },
    };
}
