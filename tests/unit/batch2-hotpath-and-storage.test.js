import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../functions/[[path]].js';
import { handleSettingsGet } from '../../functions/modules/api-handler.js';
import { createSignedToken, getSessionSigningSecret } from '../../functions/modules/auth-middleware.js';
import {
  maybeRunScheduledTasks,
  WEBDAV_LAST_CHECKED_CACHE_KEY,
} from '../../functions/modules/scheduled-task-runner.js';
import { base64EncodeUtf8 } from '../../functions/modules/utils.js';
import { clearSettingsCache } from '../../functions/storage-adapter.js';
import { base64ToUtf8, utf8ToBase64 } from '../../shared/base64.js';
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

  return {
    settingsSelects,
    settingsWrites,
    cacheWrites,
    prepare(sql) {
      const stmt = d1.prepare(sql);
      const record = (args) => {
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
        first: () => stmt.first(),
        all: () => stmt.all(),
        run: () => stmt.run(),
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
    expect(db.settingsSelects).toEqual(['main', 'rule_templates']);

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
