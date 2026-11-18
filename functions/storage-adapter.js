/**
 * 数据存储抽象层（纯 D1 行级存储）
 */

export const STORAGE_TYPES = {
    D1: 'd1',
};

const DATA_KEYS = {
    SUBSCRIPTIONS: 'misub_subscriptions_v1',
    PROFILES: 'misub_profiles_v1',
    SETTINGS: 'worker_settings_v1',
    PROFILE_DOWNLOAD_COUNT_PREFIX: 'misub_profile_download_count_',
};

const D1_COLLECTION_CACHE_TTL_MS = 30 * 1000;
const d1CollectionCaches = new WeakMap();

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

const D1_SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS profiles (
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
    `CREATE INDEX IF NOT EXISTS idx_subscriptions_updated_at ON subscriptions(updated_at);`,
    `CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);`,
    `CREATE INDEX IF NOT EXISTS idx_settings_updated_at ON settings(updated_at);`,
];

const D1_KNOWN_SETTINGS_KEYS = new Set([
    'misub_dns_templates_v1',
    'misub_rule_templates_v1',
    'misub_clients_v1',
    'misub_guestbook_v1',
    'misub_settings_v1',
    'misub_restore_snapshot_latest',
    'misub_error_reports',
    'misub_system_logs',
    'misub_system_logs_index',
    'misub_webdav_backup_lock',
    'cron_last_execution',
    'SYSTEM_ADMIN_PASSWORD',
    'SYSTEM_COOKIE_SECRET',
    'SYSTEM_AUTH_INITIALIZED',
]);

const D1_KNOWN_SETTINGS_PREFIXES = [
    DATA_KEYS.PROFILE_DOWNLOAD_COUNT_PREFIX,
    'tmp_external_nodes:',
    'misub_guestbook_v1',
    'github_release_',
    'node_cache_',
    'misub_system_logs:',
    'tg_push_rate:',
    'misub_test_',
];

export async function ensureD1Schema(d1Db) {
    for (const statement of D1_SCHEMA_STATEMENTS) {
        await d1Db.prepare(statement).run();
    }
}

function isNoSuchTableError(error) {
    return Boolean(error?.message && String(error.message).toLowerCase().includes('no such table'));
}

/**
 * D1 存储适配器（行级存储）
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
            if (isNoSuchTableError(error)) {
                await ensureD1Schema(this.db);
                return await operation();
            }
            throw error;
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

            const result = await this.db
                .prepare(
                    `SELECT ${table === 'settings' ? 'value as data' : 'data'} FROM ${table} WHERE ${queryField} = ?`
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
            if (isNoSuchTableError(error)) {
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
            const data = typeof value === 'string' ? value : JSON.stringify(value);

            await this._withSchemaRetry(async () => {
                if (table === 'settings') {
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

            if (table === 'subscriptions' || table === 'profiles') {
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
            try {
                await this.db.prepare('DELETE FROM subscriptions').run();
            } catch (error) {
                if (!isNoSuchTableError(error)) throw error;
            }
            invalidateD1CollectionCache(this.db, 'subscriptions');
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

            if (table === 'subscriptions' || table === 'profiles') {
                invalidateD1CollectionCache(this.db, table);
            }
            return true;
        } catch (error) {
            if (isNoSuchTableError(error)) {
                return true;
            }
            console.error(`[D1] Failed to delete key ${key}:`, error);
            throw error;
        }
    }

    async list(prefix) {
        try {
            const tables = [
                { name: 'subscriptions', keyField: 'id' },
                { name: 'profiles', keyField: 'id' },
                { name: 'settings', keyField: 'key' },
            ];
            const keys = [];
            const effectivePrefix = prefix || '';
            const matchesKnownKey =
                DATA_KEYS.SUBSCRIPTIONS.startsWith(effectivePrefix) ||
                DATA_KEYS.PROFILES.startsWith(effectivePrefix) ||
                DATA_KEYS.SETTINGS.startsWith(effectivePrefix) ||
                effectivePrefix.startsWith(DATA_KEYS.SUBSCRIPTIONS) ||
                effectivePrefix.startsWith(DATA_KEYS.PROFILES) ||
                effectivePrefix.startsWith(DATA_KEYS.SETTINGS);

            const shouldQuerySubscriptions =
                !effectivePrefix || effectivePrefix.startsWith(DATA_KEYS.SUBSCRIPTIONS);
            const shouldQueryProfiles =
                !effectivePrefix || effectivePrefix.startsWith(DATA_KEYS.PROFILES);
            const shouldQuerySettings =
                !effectivePrefix ||
                !matchesKnownKey ||
                effectivePrefix.startsWith(DATA_KEYS.SETTINGS);

            for (const table of tables) {
                if (table.name === 'subscriptions' && !shouldQuerySubscriptions) continue;
                if (table.name === 'profiles' && !shouldQueryProfiles) continue;
                if (table.name === 'settings' && !shouldQuerySettings) continue;

                let results;
                if (table.name === 'settings' && effectivePrefix) {
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

    async getSubscriptionById(id) {
        try {
            const result = await this.db
                .prepare('SELECT data FROM subscriptions WHERE id = ?')
                .bind(id)
                .first();
            return result ? JSON.parse(result.data) : null;
        } catch (error) {
            if (isNoSuchTableError(error)) return null;
            console.error(`[D1] Failed to get subscription ${id}:`, error);
            return null;
        }
    }

    async getAllSubscriptions() {
        return readCachedD1Collection(this.db, 'subscriptions', async () => {
            try {
                const results = await this.db.prepare('SELECT data FROM subscriptions').all();
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
                invalidateD1CollectionCache(this.db, 'subscriptions');
                if (isNoSuchTableError(error)) return [];
                console.error('[D1] Failed to get all subscriptions:', error);
                return [];
            }
        });
    }

    async getProfileById(id) {
        try {
            const result = await this.db
                .prepare('SELECT data FROM profiles WHERE id = ?')
                .bind(id)
                .first();
            if (result) return JSON.parse(result.data);

            const allProfiles = await this.getAllProfiles();
            return allProfiles.find((item) => item.id === id || item.customId === id) || null;
        } catch (error) {
            if (isNoSuchTableError(error)) return null;
            console.error(`[D1] Failed to get profile ${id}:`, error);
            return null;
        }
    }

    async getAllProfiles() {
        return readCachedD1Collection(this.db, 'profiles', async () => {
            try {
                const results = await this.db.prepare('SELECT data FROM profiles').all();
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
                invalidateD1CollectionCache(this.db, 'profiles');
                if (isNoSuchTableError(error)) return [];
                console.error('[D1] Failed to get all profiles:', error);
                return [];
            }
        });
    }

    async updateSubscriptionById(id, updater) {
        const existing = await this.getSubscriptionById(id);
        if (!existing) return null;
        const updated = updater({ ...existing });
        await this._withSchemaRetry(async () => {
            await this.db
                .prepare(
                    `
                INSERT OR REPLACE INTO subscriptions (id, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `
                )
                .bind(id, JSON.stringify(updated))
                .run();
        });
        invalidateD1CollectionCache(this.db, 'subscriptions');
        return updated;
    }

    async putSubscription(item) {
        await this._withSchemaRetry(async () => {
            await this.db
                .prepare(
                    `
                INSERT OR REPLACE INTO subscriptions (id, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `
                )
                .bind(item.id, JSON.stringify(item))
                .run();
        });
        invalidateD1CollectionCache(this.db, 'subscriptions');
        return item;
    }

    async deleteSubscriptionById(id) {
        const result = await this.db
            .prepare('DELETE FROM subscriptions WHERE id = ?')
            .bind(id)
            .run();
        invalidateD1CollectionCache(this.db, 'subscriptions');
        return Boolean(result?.success);
    }

    async putProfile(item) {
        await this._withSchemaRetry(async () => {
            await this.db
                .prepare(
                    `
                INSERT OR REPLACE INTO profiles (id, data, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `
                )
                .bind(item.id, JSON.stringify(item))
                .run();
        });
        invalidateD1CollectionCache(this.db, 'profiles');
        return item;
    }

    async deleteProfileById(id) {
        const result = await this.db.prepare('DELETE FROM profiles WHERE id = ?').bind(id).run();
        invalidateD1CollectionCache(this.db, 'profiles');
        return Boolean(result?.success);
    }

    async getSubscriptionsByIds(ids = []) {
        if (!Array.isArray(ids) || ids.length === 0) return [];
        const CHUNK_SIZE = 90;
        const uniqueIds = Array.from(new Set(ids));
        try {
            const directHits = [];
            for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
                const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
                const placeholders = chunk.map(() => '?').join(',');
                const results = await this.db
                    .prepare(`SELECT data FROM subscriptions WHERE id IN (${placeholders})`)
                    .bind(...chunk)
                    .all();
                if (Array.isArray(results?.results)) {
                    directHits.push(...results.results.map((row) => JSON.parse(row.data)));
                }
            }
            return directHits;
        } catch (error) {
            if (isNoSuchTableError(error)) return [];
            console.error('[D1] Failed to get subscriptions by ids:', error);
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

    _parseKey(key) {
        if (key === DATA_KEYS.SETTINGS) {
            return { table: 'settings', queryField: 'key', queryValue: 'main' };
        }
        const keyStr = String(key);
        if (
            D1_KNOWN_SETTINGS_KEYS.has(keyStr) ||
            D1_KNOWN_SETTINGS_PREFIXES.some((prefix) => keyStr.startsWith(prefix))
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
    async getAllSubscriptions() {
        return [];
    }
    async getProfileById() {
        return null;
    }
    async getAllProfiles() {
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
