import { describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../functions/[[path]].js';
import {
  authMiddleware,
  createSignedToken,
  getAuthSessionDiagnostic,
  getSessionSigningSecret,
  renewAuthSession,
} from '../../functions/modules/auth-middleware.js';
import { SESSION_RENEW_THRESHOLD, STORAGE_KEY_SETTINGS } from '../../functions/modules/config.js';
import { clearSettingsCache, StorageFactory } from '../../functions/storage-adapter.js';

function createCountingD1(initialSettings = {}) {
  const settingsMap = new Map(Object.entries(initialSettings));
  const queries = [];

  const db = {
    queries,
    prepare(sql) {
      queries.push(sql);
      const executeFirst = async (args) => {
        if (/SELECT value as data FROM settings WHERE key = \?/i.test(sql)) {
          const key = args[0];
          if (!settingsMap.has(key)) return null;
          const val = settingsMap.get(key);
          return { data: typeof val === 'string' ? val : JSON.stringify(val) };
        }
        return null;
      };
      return {
        bind(...args) {
          return {
            first: () => executeFirst(args),
            all: async () => ({ results: [] }),
            run: async () => {
              if (/INSERT OR REPLACE INTO settings/i.test(sql)) {
                settingsMap.set(args[0], args[1]);
              }
              return { success: true };
            },
          };
        },
        first: () => executeFirst([]),
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      };
    },
  };

  return db;
}

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

describe('worker hot-path D1 and auth performance guards', () => {
  it('skips D1 and session renewal completely for static public assets even with mature auth cookie', async () => {
    clearSettingsCache();

    const secret = 'test-static-secret';
    const db = createCountingD1();
    const matureIssuedAt = Date.now() - SESSION_RENEW_THRESHOLD - 5000;
    const token = await createSignedToken(secret, String(matureIssuedAt));

    const request = createMockRequest('https://example.com/assets/js/index-abc123.js', {
      method: 'GET',
      headers: {
        Cookie: `auth_session=${token}`,
      },
    });

    const response = await onRequest({
      request,
      env: {
        MISUB_DB: db,
        ADMIN_PASSWORD: 'test-admin-password',
        COOKIE_SECRET: secret,
        ASSETS: {
          fetch: vi.fn(
            async () =>
              new Response('console.log("ok")', {
                status: 200,
                headers: { 'Content-Type': 'application/javascript' },
              }),
          ),
        },
      },
      waitUntil: vi.fn(),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('immutable');
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(db.queries).toHaveLength(0);
  });

  it('short-circuits getAuthSessionDiagnostic without touching D1 when auth cookie is absent', async () => {
    const db = createCountingD1();
    const request = createMockRequest('https://example.com/api/public_config', {
      headers: { Cookie: 'other_cookie=1' },
    });

    const diagnostic = await getAuthSessionDiagnostic(request, {
      MISUB_DB: db,
      ADMIN_PASSWORD: 'test-admin-password',
      COOKIE_SECRET: 'secret-1',
    });

    expect(diagnostic.isAuthenticated).toBe(false);
    expect(diagnostic.reason).toBe('no_cookie');
    expect(db.queries).toHaveLength(0);
  });

  it('reuses per-request auth diagnostic between authMiddleware and renewAuthSession with zero D1 queries', async () => {
    const secret = 'reuse-diagnostic-secret';
    const db = createCountingD1();
    const env = { MISUB_DB: db, ADMIN_PASSWORD: 'test-admin-password', COOKIE_SECRET: secret };
    const token = await createSignedToken(await getSessionSigningSecret(env), String(Date.now() - 1000));
    const request = createMockRequest('https://example.com/api/data', {
      headers: { Cookie: `auth_session=${token}` },
    });

    const verifySpy = vi.spyOn(crypto.subtle, 'verify');
    try {
      const authed = await authMiddleware(request, env);
      expect(authed).toBe(true);

      const response = await renewAuthSession(request, env, new Response('ok'));
      expect(response.headers.has('Set-Cookie')).toBe(false);
      expect(verifySpy).toHaveBeenCalledTimes(1);
      expect(db.queries).toHaveLength(0);
    } finally {
      verifySpy.mockRestore();
    }
  });

  it('caches settings inside D1StorageAdapter, supports fresh bypass, and auto-invalidates on put', async () => {
    clearSettingsCache();
    const db = createCountingD1({ main: { FileName: 'MiSub-V1' } });
    const adapter = StorageFactory.createAdapter({ MISUB_DB: db });

    const first = await adapter.get(STORAGE_KEY_SETTINGS);
    const second = await adapter.get(STORAGE_KEY_SETTINGS);
    expect(first).toEqual({ FileName: 'MiSub-V1' });
    expect(second).toEqual({ FileName: 'MiSub-V1' });
    expect(db.queries).toHaveLength(1);

    // Mutating returned object must not pollute cache
    first.FileName = 'Mutated';
    const third = await adapter.get(STORAGE_KEY_SETTINGS);
    expect(third.FileName).toBe('MiSub-V1');
    expect(db.queries).toHaveLength(1);

    // Explicit fresh read bypasses cache
    await adapter.get(STORAGE_KEY_SETTINGS, 'json', { fresh: true });
    expect(db.queries).toHaveLength(2);

    // Writing settings automatically invalidates cache
    await adapter.put(STORAGE_KEY_SETTINGS, { FileName: 'MiSub-V2' });
    const afterPut = await adapter.get(STORAGE_KEY_SETTINGS);
    expect(afterPut).toEqual({ FileName: 'MiSub-V2' });
  });
});
