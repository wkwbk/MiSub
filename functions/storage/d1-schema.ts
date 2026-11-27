/**
 * D1 存储层 Schema、表常量、键路由规则与线性版本迁移状态机（基于 schema_versions 表）
 */

export const STORAGE_TYPES = {
  D1: 'd1',
};

export const SETTINGS_KEYS = {
  MAIN: 'main',
  RULE_TEMPLATES: 'rule_templates',
  CLIENTS: 'clients',
  PUBLIC_CORES: 'public_cores',
  PUBLIC_LINKS: 'public_links',
};

export const DATA_KEYS = {
  SUBSCRIPTIONS: 'subscriptions',
  PROFILES: 'profiles',
  SETTINGS: SETTINGS_KEYS.MAIN,
};

export const KEY_VALUE_TABLES = new Set(['settings', 'cache']);
export const ID_DATA_TABLES = new Set(['subscriptions', 'nodes', 'profiles', 'guestbook']);

const GITHUB_RELEASE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const NODE_CACHE_CLEANUP_AGE_MS = 24 * 60 * 60 * 1000;
export const ACCESS_LOG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const SCHEMA_VERSIONS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS schema_versions (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`;

export interface SchemaMigration {
  version: number;
  name: string;
  statements?: readonly string[];
  addColumnStatements?: readonly string[];
  postStatements?: readonly string[];
}

export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  {
    version: 1,
    name: '0000_initial_schema',
    statements: [
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
        link_id TEXT,
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
    ],
    addColumnStatements: [
      `ALTER TABLE profiles ADD COLUMN custom_id TEXT;`,
      `ALTER TABLE profiles ADD COLUMN link_id TEXT;`,
      `ALTER TABLE cache ADD COLUMN expires_at INTEGER;`,
    ],
    postStatements: [
      `UPDATE profiles
       SET custom_id = NULLIF(TRIM(json_extract(data, '$.customId')), '')
       WHERE custom_id IS NULL AND json_valid(data) = 1 AND json_extract(data, '$.customId') IS NOT NULL`,
      `UPDATE profiles
       SET link_id = NULLIF(TRIM(json_extract(data, '$.linkId')), '')
       WHERE link_id IS NULL AND json_valid(data) = 1 AND json_extract(data, '$.linkId') IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_subscriptions_updated_at ON subscriptions(updated_at);`,
      `CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(updated_at);`,
      `CREATE INDEX IF NOT EXISTS idx_profiles_custom_id ON profiles(custom_id);`,
      `CREATE INDEX IF NOT EXISTS idx_profiles_link_id ON profiles(link_id);`,
      `CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);`,
      `CREATE INDEX IF NOT EXISTS idx_guestbook_updated_at ON guestbook(updated_at);`,
      `CREATE INDEX IF NOT EXISTS idx_settings_updated_at ON settings(updated_at);`,
      `CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);`,
      `CREATE INDEX IF NOT EXISTS idx_cache_updated_at ON cache(updated_at);`,
      `CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON access_logs(timestamp DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_error_reports_timestamp ON error_reports(timestamp DESC);`,
    ],
  },
  {
    version: 2,
    name: '0001_add_config_version',
    addColumnStatements: [
      `ALTER TABLE subscriptions ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1;`,
      `ALTER TABLE nodes ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1;`,
      `ALTER TABLE profiles ADD COLUMN config_version INTEGER NOT NULL DEFAULT 1;`,
    ],
    postStatements: [
      `UPDATE subscriptions
       SET config_version = MAX(
         COALESCE(config_version, 1),
         CASE
           WHEN json_valid(data) = 1 THEN COALESCE(CAST(json_extract(data, '$.configVersion') AS INTEGER), CAST(json_extract(data, '$.version') AS INTEGER), 1)
           ELSE 1
         END
       )
       WHERE (json_valid(data) = 1 AND (json_extract(data, '$.configVersion') IS NOT NULL OR json_extract(data, '$.version') IS NOT NULL))
          OR config_version IS NULL
          OR config_version < 1`,
      `UPDATE nodes
       SET config_version = MAX(
         COALESCE(config_version, 1),
         CASE
           WHEN json_valid(data) = 1 THEN COALESCE(CAST(json_extract(data, '$.configVersion') AS INTEGER), CAST(json_extract(data, '$.version') AS INTEGER), 1)
           ELSE 1
         END
       )
       WHERE (json_valid(data) = 1 AND (json_extract(data, '$.configVersion') IS NOT NULL OR json_extract(data, '$.version') IS NOT NULL))
          OR config_version IS NULL
          OR config_version < 1`,
      `UPDATE profiles
       SET config_version = MAX(
         COALESCE(config_version, 1),
         CASE
           WHEN json_valid(data) = 1 THEN COALESCE(CAST(json_extract(data, '$.configVersion') AS INTEGER), CAST(json_extract(data, '$.version') AS INTEGER), 1)
           ELSE 1
         END
       )
       WHERE (json_valid(data) = 1 AND (json_extract(data, '$.configVersion') IS NOT NULL OR json_extract(data, '$.version') IS NOT NULL))
          OR config_version IS NULL
          OR config_version < 1`,
    ],
  },
];

export const LATEST_SCHEMA_VERSION = SCHEMA_MIGRATIONS.length;

const migratedDatabases = new WeakSet<object>();
const migrationPromises = new WeakMap<object, Promise<void>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isManualNodeRecord(item: unknown): boolean {
  if (!isRecord(item)) return false;
  const url = typeof item.url === 'string' ? item.url.trim() : '';
  if (!url) return false;
  return !/^https?:\/\//i.test(url);
}

const D1_CACHE_KEYS = new Set([
  'misub_webdav_backup_lock',
  'misub_webdav_backup_last_checked',
  'misub_last_maintenance_at',
  'misub_maintenance_lock',
  'misub_restore_snapshot_latest',
  'cron_last_execution',
  'sub_edge_cache_version',
]);

const D1_CACHE_PREFIXES = [
  'node_cache_',
  'node_inspect_',
  'transform_template_',
  'github_release_',
  'appstore_release_',
  'tg_push_rate:',
  'auth_login_rate:',
  'misub_test_',
];

export const D1_KNOWN_SETTINGS_KEYS = new Set(Object.values(SETTINGS_KEYS));

export function isCacheKey(keyStr: string): boolean {
  return D1_CACHE_KEYS.has(keyStr) || D1_CACHE_PREFIXES.some((prefix) => keyStr.startsWith(prefix));
}

function getFullErrorMessage(error: unknown, depth = 0): string {
  if (!error || depth > 4) return '';
  if (typeof error === 'string') return error;
  const parts: string[] = [];
  if (error instanceof Error) {
    if (error.message) parts.push(error.message);
    const causeMsg = getFullErrorMessage((error as Error & { cause?: unknown }).cause, depth + 1);
    if (causeMsg) parts.push(causeMsg);
  } else if (isRecord(error)) {
    if (typeof error.message === 'string' && error.message) parts.push(error.message);
    const causeMsg = getFullErrorMessage(error.cause, depth + 1);
    if (causeMsg) parts.push(causeMsg);
  }
  return parts.join(' | ');
}

export function parseTimestampMs(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    const num = Number(val);
    if (Number.isFinite(num)) return num;
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function computeCacheExpiresAt(keyStr: string, rawValue: unknown, now = Date.now()): number | null {
  let parsed: unknown = rawValue;
  if (typeof rawValue === 'string') {
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      parsed = null;
    }
  }
  const parsedRecord = isRecord(parsed) ? parsed : null;

  if (
    keyStr.startsWith('tg_push_rate:') ||
    keyStr === 'misub_webdav_backup_lock' ||
    keyStr === 'misub_maintenance_lock'
  ) {
    const exp = parseTimestampMs(parsedRecord?.expiresAt);
    return exp > 0 ? exp : now + 60 * 60 * 1000;
  }
  if (keyStr === 'misub_last_maintenance_at') {
    const exp = parseTimestampMs(parsedRecord?.expiresAt);
    return exp > 0 ? exp : now + 6 * 60 * 60 * 1000;
  }
  if (keyStr === 'misub_webdav_backup_last_checked') {
    const exp = parseTimestampMs(parsedRecord?.expiresAt);
    return exp > 0 ? exp : now + 7 * 24 * 60 * 60 * 1000;
  }
  if (keyStr.startsWith('auth_login_rate:')) {
    const exp = parseTimestampMs(parsedRecord?.expiresAt);
    return exp > 0 ? exp : now + 15 * 60 * 1000;
  }
  if (keyStr.startsWith('github_release_') || keyStr.startsWith('appstore_release_')) {
    const ts = parseTimestampMs(parsedRecord?.timestamp) || now;
    return ts + GITHUB_RELEASE_MAX_AGE_MS;
  }
  if (keyStr.startsWith('node_cache_subscription_')) {
    // 单机场保护性回退缓存：不过期自动清除，仅随订阅删除或孤儿清理移除
    return null;
  }
  if (keyStr.startsWith('node_cache_')) {
    const ts = parseTimestampMs(parsedRecord?.timestamp) || now;
    return ts + NODE_CACHE_CLEANUP_AGE_MS;
  }
  if (keyStr.startsWith('node_inspect_')) {
    const exp = parseTimestampMs(parsedRecord?.expiresAt);
    return exp > 0 ? exp : now + 6 * 60 * 60 * 1000;
  }
  if (keyStr.startsWith('transform_template_')) {
    const ts = parseTimestampMs(parsedRecord?.timestamp) || now;
    return ts + NODE_CACHE_CLEANUP_AGE_MS;
  }
  if (keyStr.startsWith('misub_test_')) {
    return now + 5 * 60 * 1000;
  }
  return null;
}

async function runStatementsBatchOrSequential(d1Db: D1Database, statements: readonly string[]): Promise<void> {
  if (statements.length === 0) return;
  if (typeof d1Db.batch === 'function') {
    await d1Db.batch(statements.map((sql) => d1Db.prepare(sql)));
    return;
  }
  for (const sql of statements) {
    await d1Db.prepare(sql).run();
  }
}

async function readCurrentSchemaVersion(d1Db: D1Database): Promise<number> {
  try {
    const row = await d1Db
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_versions')
      .first<{ version?: number | string | null }>();
    const rawVersion = Number(row?.version);
    return Number.isInteger(rawVersion) && rawVersion > 0 ? rawVersion : 0;
  } catch (error) {
    if (/no such table/i.test(getFullErrorMessage(error))) {
      await d1Db.prepare(SCHEMA_VERSIONS_TABLE_SQL).run();
      return 0;
    }
    throw error;
  }
}

export async function runD1Migrations(d1Db: D1Database): Promise<void> {
  if (!d1Db || typeof d1Db !== 'object') return;
  if (migratedDatabases.has(d1Db)) return;

  const existingPromise = migrationPromises.get(d1Db);
  if (existingPromise) {
    return existingPromise;
  }

  const migrationPromise = (async () => {
    const currentVersion = await readCurrentSchemaVersion(d1Db);

    if (currentVersion >= LATEST_SCHEMA_VERSION) {
      migratedDatabases.add(d1Db);
      return;
    }

    for (const migration of SCHEMA_MIGRATIONS) {
      if (migration.version <= currentVersion) continue;

      if (migration.statements?.length) {
        await runStatementsBatchOrSequential(d1Db, migration.statements);
      }

      if (migration.addColumnStatements?.length) {
        for (const alterSql of migration.addColumnStatements) {
          try {
            await d1Db.prepare(alterSql).run();
          } catch (error) {
            if (!/duplicate column name/i.test(getFullErrorMessage(error))) {
              throw error;
            }
          }
        }
      }

      if (migration.postStatements?.length) {
        await runStatementsBatchOrSequential(d1Db, migration.postStatements);
      }

      await d1Db
        .prepare('INSERT OR REPLACE INTO schema_versions (version, name) VALUES (?, ?)')
        .bind(migration.version, migration.name)
        .run();
    }

    migratedDatabases.add(d1Db);
  })().finally(() => {
    migrationPromises.delete(d1Db);
  });

  migrationPromises.set(d1Db, migrationPromise);
  return migrationPromise;
}

export async function ensureD1Schema(d1Db: D1Database): Promise<void> {
  return runD1Migrations(d1Db);
}
