/**
 * D1 存储层 Schema、表常量、键路由规则与迁移工具
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

const initializedSchemas = new WeakSet<object>();
const schemaInitPromises = new WeakMap<object, Promise<void>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isManualNodeRecord(item: unknown): boolean {
  if (!isRecord(item)) return false;
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
];

const D1_COLUMN_MIGRATIONS = [
  `ALTER TABLE profiles ADD COLUMN custom_id TEXT;`,
  `ALTER TABLE profiles ADD COLUMN link_id TEXT;`,
  `ALTER TABLE cache ADD COLUMN expires_at INTEGER;`,
];

const D1_INDEX_STATEMENTS = [
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
];

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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return '';
}

export function isNoSuchTableError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return Boolean(message && message.toLowerCase().includes('no such table'));
}

export function isSchemaMismatchError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();
  return msg.includes('no such table') || msg.includes('no such column') || msg.includes('has no column named');
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

const D1_BACKFILL_STATEMENTS = [
  `UPDATE profiles
   SET custom_id = NULLIF(TRIM(json_extract(data, '$.customId')), '')
   WHERE custom_id IS NULL AND json_extract(data, '$.customId') IS NOT NULL`,
  `UPDATE profiles
   SET link_id = NULLIF(TRIM(json_extract(data, '$.linkId')), '')
   WHERE link_id IS NULL AND json_extract(data, '$.linkId') IS NOT NULL`,
];

async function runStatementsBatchOrSequential(d1Db: D1Database, statements: string[]): Promise<void> {
  if (statements.length === 0) return;
  if (typeof d1Db.batch === 'function') {
    await d1Db.batch(statements.map((sql) => d1Db.prepare(sql)));
    return;
  }
  for (const sql of statements) {
    await d1Db.prepare(sql).run();
  }
}

export async function ensureD1Schema(d1Db: D1Database): Promise<void> {
  if (!d1Db || typeof d1Db !== 'object') return;
  if (initializedSchemas.has(d1Db)) return;

  const existingPromise = schemaInitPromises.get(d1Db);
  if (existingPromise) {
    return existingPromise;
  }

  const initPromise = (async () => {
    try {
      // 快路径：在表与列均已是最新结构时，单次 db.batch() 完成全部 DDL、回填与索引幂等确认
      await runStatementsBatchOrSequential(d1Db, [
        ...D1_TABLE_STATEMENTS,
        ...D1_BACKFILL_STATEMENTS,
        ...D1_INDEX_STATEMENTS,
      ]);
    } catch {
      // 兼容旧表结构：先建缺失表，再逐条执行 ALTER TABLE ADD COLUMN（避免 duplicate column 中断 batch 事务）
      await runStatementsBatchOrSequential(d1Db, D1_TABLE_STATEMENTS);

      for (const alterSql of D1_COLUMN_MIGRATIONS) {
        try {
          await d1Db.prepare(alterSql).run();
        } catch {}
      }

      try {
        await runStatementsBatchOrSequential(d1Db, [...D1_BACKFILL_STATEMENTS, ...D1_INDEX_STATEMENTS]);
      } catch {
        for (const sql of [...D1_BACKFILL_STATEMENTS, ...D1_INDEX_STATEMENTS]) {
          try {
            await d1Db.prepare(sql).run();
          } catch {}
        }
      }
    }

    initializedSchemas.add(d1Db);
  })().finally(() => {
    schemaInitPromises.delete(d1Db);
  });

  schemaInitPromises.set(d1Db, initPromise);
  return initPromise;
}
