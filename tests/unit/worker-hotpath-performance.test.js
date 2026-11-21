import { describe, expect, it, vi } from 'vitest';
import { onRequest } from '../../functions/[[path]].js';
import {
  authMiddleware,
  createSignedToken,
  getAuthSessionDiagnostic,
  renewAuthSession,
} from '../../functions/modules/auth-middleware.js';
import { clearCookieSecretCache, getCookieSecret } from '../../functions/modules/utils.js';
import { SESSION_RENEW_THRESHOLD } from '../../functions/modules/config.js';
import { SettingsCache } from '../../functions/storage-adapter.js';

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
    clearCookieSecretCache();
    SettingsCache.clear();

    const secret = 'test-static-secret';
    const db = createCountingD1({ SYSTEM_COOKIE_SECRET: secret });
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
    clearCookieSecretCache();
    const db = createCountingD1({ SYSTEM_COOKIE_SECRET: 'secret-1' });
    const request = createMockRequest('https://example.com/api/public_config', {
      headers: { Cookie: 'other_cookie=1' },
    });

    const diagnostic = await getAuthSessionDiagnostic(request, { MISUB_DB: db });

    expect(diagnostic.isAuthenticated).toBe(false);
    expect(diagnostic.reason).toBe('no_cookie');
    expect(db.queries).toHaveLength(0);
  });

  it('caches getCookieSecret per D1 instance across repeated lookups', async () => {
    clearCookieSecretCache();
    const db = createCountingD1({ SYSTEM_COOKIE_SECRET: 'cached-secret-value' });
    const env = { MISUB_DB: db };

    const first = await getCookieSecret(env);
    const second = await getCookieSecret(env);
    const third = await getCookieSecret(env);

    expect(first).toBe('cached-secret-value');
    expect(second).toBe('cached-secret-value');
    expect(third).toBe('cached-secret-value');
    expect(db.queries).toHaveLength(1);
  });

  it('reuses per-request auth diagnostic between authMiddleware and renewAuthSession', async () => {
    clearCookieSecretCache();
    const secret = 'reuse-diagnostic-secret';
    const db = createCountingD1({ SYSTEM_COOKIE_SECRET: secret });
    const env = { MISUB_DB: db };
    const token = await createSignedToken(secret, String(Date.now() - 1000));
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
      expect(db.queries).toHaveLength(1);
    } finally {
      verifySpy.mockRestore();
    }
  });
});
