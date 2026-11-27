import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../functions/[[path]].js';
import { handleSettingsGet } from '../../functions/modules/api-handler.js';
import { createSignedToken, getSessionSigningSecret } from '../../functions/modules/auth-middleware.js';
import {
  handleCronMaintenanceTrigger,
  MAINTENANCE_LAST_RUN_CACHE_KEY,
  MAINTENANCE_LOCK_KEY,
  MAINTENANCE_THROTTLE_MS,
  maybeRunScheduledTasks,
  WEBDAV_LAST_CHECKED_CACHE_KEY,
} from '../../functions/modules/scheduled-task-runner.js';
import { base64EncodeUtf8 } from '../../functions/modules/utils.js';
import { clearSettingsCache } from '../../functions/storage-adapter.js';
import { base64ToUtf8, utf8ToBase64 } from '@misub/core/utils/base64.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

function createMockRequest(url, { method = 'GET', headers = {} } = {}) {
  const normalized = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    url,
    method,
    headers: {
      get: (name) => normalized.get(String(name).toLowerCase()) ?? null,
    },
  };
}

function wrapWithQueryCounter(d1) {
  const settingsSelects = [];
  const settingsWrites = [];
  const cacheWrites = [];
  const executedSqls = [];

  return {
    settingsSelects,
    settingsWrites,
    cacheWrites,
    executedSqls,
    prepare(sql) {
      const stmt = d1.prepare(sql);
      const record = (args) => {
        executedSqls.push(sql.replace(/\s+/g, ' ').trim());
        if (/SELECT .* FROM settings WHERE key = \?/i.test(sql)) {
          settingsSelects.push(args[0]);
        }
        if (/INSERT OR REPLACE INTO settings/i.test(sql)) {
          settingsWrites.push(args[0]);
        }
        if (/INSERT OR REPLACE INTO cache/i.test(sql)) {
          cacheWrites.push(args[0]);
        }
      };

      const wrapBound = (boundStmt, args) => ({
        first: async () => {
          record(args);
          return boundStmt.first();
        },
        all: async () => {
          record(args);
          return boundStmt.all();
        },
        run: async () => {
          record(args);
          return boundStmt.run();
        },
      });

      return {
        bind(...args) {
          return wrapBound(stmt.bind(...args), args);
        },
        first: async () => {
          record([]);
          return stmt.first();
        },
        all: async () => {
          record([]);
          return stmt.all();
        },
        run: async () => {
          record([]);
          return stmt.run();
        },
      };
    },
    batch: typeof d1.batch === 'function' ? (stmts) => d1.batch(stmts) : undefined,
  };
}

describe('Batch 2 hotpath, cache isolation, and Base64 optimizations', () => {
  beforeEach(() => {
    clearSettingsCache();
    vi.restoreAllMocks();
  });

  it('stores WebDAV lastCheckedAt in D1 cache without rewriting settings and throttles repeat checks', async () => {
    const rawDb = createMemoryD1({
      main: {
        webdavBackup: {
          enabled: true,
          autoBackup: true,
          interval: 'daily',
          lastBackupAt: new Date().toISOString(),
        },
      },
    });
    const db = wrapWithQueryCounter(rawDb);
    const env = { MISUB_DB: db };

    const first = await maybeRunScheduledTasks({ env }, { source: 'admin-api' });
    expect(first).toEqual({ skipped: true, reason: 'not-due' });
    expect(db.settingsWrites).toHaveLength(0);
    expect(db.cacheWrites).toContain(WEBDAV_LAST_CHECKED_CACHE_KEY);

    const second = await maybeRunScheduledTasks({ env }, { source: 'admin-api' });
    expect(second).toEqual({ skipped: true, reason: 'throttled' });
    expect(db.settingsWrites).toHaveLength(0);
  });

  it('hydrates webdavBackup.lastCheckedAt in handleSettingsGet from D1 cache', async () => {
    const expectedTs = '2026-11-24T12:34:56.000Z';
    const db = createMemoryD1({
      main: {
        webdavBackup: {
          enabled: true,
          endpoint: 'https://dav.example.com',
          lastCheckedAt: null,
        },
      },
      [WEBDAV_LAST_CHECKED_CACHE_KEY]: {
        checkedAt: expectedTs,
        expiresAt: Date.now() + 60000,
      },
    });

    const response = await handleSettingsGet({ MISUB_DB: db });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.webdavBackup.lastCheckedAt).toBe(expectedTs);
  });

  it('reuses context.storage and context.settings across onRequest -> /api/public_config, /api/data, and /api/settings', async () => {
    const rawDb = createMemoryD1({
      main: {
        fileName: 'MiSub-Cached',
        enablePublicPage: true,
      },
    });
    const db = wrapWithQueryCounter(rawDb);
    const env = {
      MISUB_DB: db,
      ADMIN_PASSWORD: 'admin-password',
      COOKIE_SECRET: 'cookie-secret',
    };

    const publicRes = await onRequest({
      request: new Request('https://example.com/api/public_config'),
      env,
      waitUntil: vi.fn(),
    });
    expect(publicRes.status).toBe(200);
    expect(db.settingsSelects.filter((k) => k === 'main')).toHaveLength(1);

    clearSettingsCache();
    db.settingsSelects.length = 0;

    const token = await createSignedToken(await getSessionSigningSecret(env), String(Date.now()));
    const dataRes = await onRequest({
      request: createMockRequest('https://example.com/api/data', {
        headers: { Cookie: `auth_session=${token}` },
      }),
      env,
      waitUntil: vi.fn(),
    });
    expect(dataRes.status).toBe(200);
    const dataBody = await dataRes.json();
    expect(dataBody.config.fileName).toBe('MiSub-Cached');
    expect(db.settingsSelects).toEqual(['main']);

    clearSettingsCache();
    db.settingsSelects.length = 0;

    const settingsRes = await onRequest({
      request: createMockRequest('https://example.com/api/settings', {
        headers: { Cookie: `auth_session=${token}` },
      }),
      env,
      waitUntil: vi.fn(),
    });
    expect(settingsRes.status).toBe(200);
    const settingsBody = await settingsRes.json();
    expect(settingsBody.fileName).toBe('MiSub-Cached');
    expect(db.settingsSelects).toEqual(['main']);
  });

  it('decouples GET /api/data from background scheduled tasks and storage maintenance', async () => {
    const rawDb = createMemoryD1({
      main: {
        fileName: 'MiSub-Decoupled',
        webdavBackup: {
          enabled: true,
          autoBackup: true,
          interval: 'daily',
          lastBackupAt: null,
        },
      },
    });
    rawDb.tables.cache.set('tg_push_rate:u1:min', JSON.stringify({ count: 1, expiresAt: 1000 }));
    rawDb.cacheExpiresAt.set('tg_push_rate:u1:min', 1000);

    const db = wrapWithQueryCounter(rawDb);
    const env = {
      MISUB_DB: db,
      ADMIN_PASSWORD: 'admin-password',
      COOKIE_SECRET: 'cookie-secret',
    };
    const token = await createSignedToken(await getSessionSigningSecret(env), String(Date.now()));
    const waitUntil = vi.fn();

    const response = await onRequest({
      request: createMockRequest('https://example.com/api/data', {
        headers: { Cookie: `auth_session=${token}` },
      }),
      env,
      waitUntil,
    });

    expect(response.status).toBe(200);
    expect(waitUntil).not.toHaveBeenCalled();
    expect(db.cacheWrites).toHaveLength(0);
    expect(
      db.executedSqls.some((sql) =>
        /CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX|DELETE\s+FROM\s+(cache|access_logs)/i.test(sql),
      ),
    ).toBe(false);
    expect(rawDb.tables.cache.has('tg_push_rate:u1:min')).toBe(true);
  });

  it('persists maintenance throttle and lock in D1 cache across worker isolates for 6 hours', async () => {
    const baseNow = 1_800_000_000_000;
    const rawDb = createMemoryD1({
      main: { fileName: 'MiSub' },
    });
    rawDb.tables.cache.set('tg_push_rate:u1:min', JSON.stringify({ count: 1, expiresAt: baseNow - 1000 }));
    rawDb.cacheExpiresAt.set('tg_push_rate:u1:min', baseNow - 1000);

    // Isolate 1: first run executes cleanupMaintenance and persists last run timestamp in D1 cache
    const db1 = wrapWithQueryCounter(rawDb);
    const firstRes = await handleCronMaintenanceTrigger({ MISUB_DB: db1 }, { now: baseNow, source: 'cron' });
    const firstBody = await firstRes.json();
    expect(firstBody).toEqual({
      success: true,
      task: 'maintenance',
      skipped: false,
      stats: { removedExpiredCache: 1 },
    });
    expect(rawDb.tables.cache.has('tg_push_rate:u1:min')).toBe(false);
    expect(rawDb.tables.cache.has(MAINTENANCE_LAST_RUN_CACHE_KEY)).toBe(true);
    expect(rawDb.cacheExpiresAt.get(MAINTENANCE_LAST_RUN_CACHE_KEY)).toBe(baseNow + MAINTENANCE_THROTTLE_MS);
    expect(rawDb.tables.cache.has(MAINTENANCE_LOCK_KEY)).toBe(false);

    // Isolate 2: simulate cold start / another worker instance within 6 hours -> strictly throttled by D1
    clearSettingsCache();
    const db2 = wrapWithQueryCounter(rawDb);
    const throttledRes = await handleCronMaintenanceTrigger(
      { MISUB_DB: db2 },
      { now: baseNow + 5 * 60 * 1000, source: 'cron' },
    );
    const throttledBody = await throttledRes.json();
    expect(throttledBody).toEqual({
      success: true,
      task: 'maintenance',
      skipped: true,
      reason: 'throttled',
      lastRunAt: new Date(baseNow).toISOString(),
    });
    expect(db2.executedSqls.some((sql) => /DELETE\s+FROM\s+(cache|access_logs)/i.test(sql))).toBe(false);

    // Isolate 3: active lock blocks execution even with force=true
    rawDb.tables.cache.set(
      MAINTENANCE_LOCK_KEY,
      JSON.stringify({
        lockedAt: new Date(baseNow).toISOString(),
        expiresAt: new Date(baseNow + 60_000).toISOString(),
        source: 'other-worker',
      }),
    );
    const lockedRes = await handleCronMaintenanceTrigger(
      { MISUB_DB: wrapWithQueryCounter(rawDb) },
      { now: baseNow + 10_000, force: true, source: 'http-cron' },
    );
    expect(await lockedRes.json()).toEqual({
      success: true,
      task: 'maintenance',
      skipped: true,
      reason: 'locked',
    });

    // Clear lock and verify force=true bypasses 6h throttle, and post-6h window runs normally
    rawDb.tables.cache.delete(MAINTENANCE_LOCK_KEY);
    rawDb.tables.cache.set('tg_push_rate:u2:min', JSON.stringify({ count: 1, expiresAt: baseNow - 1000 }));
    rawDb.cacheExpiresAt.set('tg_push_rate:u2:min', baseNow - 1000);
    const forcedRes = await handleCronMaintenanceTrigger(
      { MISUB_DB: wrapWithQueryCounter(rawDb) },
      { now: baseNow + 20_000, force: true, source: 'http-cron' },
    );
    expect(await forcedRes.json()).toEqual({
      success: true,
      task: 'maintenance',
      skipped: false,
      stats: { removedExpiredCache: 1 },
    });

    const afterWindowNow = baseNow + 20_000 + MAINTENANCE_THROTTLE_MS + 1000;
    rawDb.tables.cache.set('tg_push_rate:u3:min', JSON.stringify({ count: 1, expiresAt: afterWindowNow - 500 }));
    rawDb.cacheExpiresAt.set('tg_push_rate:u3:min', afterWindowNow - 500);
    // After 6h window: previous misub_last_maintenance_at has expired too, so both it and tg_push_rate:u3:min are cleaned up (2)
    const afterWindowRes = await handleCronMaintenanceTrigger(
      { MISUB_DB: wrapWithQueryCounter(rawDb) },
      { now: afterWindowNow, source: 'cron' },
    );
    expect(await afterWindowRes.json()).toEqual({
      success: true,
      task: 'maintenance',
      skipped: false,
      stats: { removedExpiredCache: 2 },
    });
    expect(rawDb.cacheExpiresAt.get(MAINTENANCE_LAST_RUN_CACHE_KEY)).toBe(afterWindowNow + MAINTENANCE_THROTTLE_MS);
  });

  it('encodes large UTF-8 and emoji payloads consistently via shared utf8ToBase64', () => {
    const unit = 'trojan://pass@example.com:443#🇭🇰 香港节点 01 | 🇸🇬 新加坡\n';
    const largePayload = unit.repeat(2500); // > 120 KB
    expect(new TextEncoder().encode(largePayload).byteLength).toBeGreaterThan(100 * 1024);

    const encodedViaUtils = base64EncodeUtf8(largePayload);
    const encodedViaShared = utf8ToBase64(largePayload);

    expect(encodedViaUtils).toBe(encodedViaShared);
    expect(base64ToUtf8(encodedViaUtils)).toBe(largePayload);
  });
});
