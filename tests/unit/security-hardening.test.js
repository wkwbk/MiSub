import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleApiRequest,
  handleExternalFetchRequest,
  handleSubconverterTestRequest,
} from '../../functions/modules/api-router.js';
import {
  createSignedToken,
  getAuthSessionDiagnostic,
  getSessionSigningSecret,
  handleLogin,
  renewAuthSession,
} from '../../functions/modules/auth-middleware.js';
import { SESSION_DURATION, SESSION_RENEW_THRESHOLD } from '../../functions/modules/config.js';
import { handleMisubRequest } from '../../functions/modules/subscription/main-handler.js';
import { logAccessSuccess } from '../../functions/modules/subscription/access-logger.js';
import { LogService } from '../../functions/services/log-service.js';
import { onRequest } from '../../functions/[[path]].js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

function createD1(settings = null) {
  return {
    prepare(sql) {
      return {
        queryValue: undefined,
        bind(...args) {
          this.queryValue = args[0];
          return this;
        },
        async first() {
          if (/FROM settings/i.test(sql) && this.queryValue === 'main' && settings) {
            return { data: JSON.stringify(settings) };
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          return { success: true };
        },
      };
    },
  };
}

function createAssets() {
  return {
    async fetch() {
      return new Response('<html>ok</html>', { headers: { 'Content-Type': 'text/html' } });
    },
  };
}

describe('security hardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects oversized login JSON bodies before parsing', async () => {
    const env = { MISUB_DB: createMemoryD1(), COOKIE_SECRET: 'stable-cookie-secret' };
    const response = await handleLogin(
      new Request('https://example.com/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'admin', padding: 'x'.repeat(32 * 1024) }),
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/too large|过大/i);
  });

  it('rejects oversized external fetch JSON bodies before outbound fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('should-not-fetch'));
    const response = await handleExternalFetchRequest(
      new Request('https://example.com/api/fetch_external_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://raw.githubusercontent.com/example/repo/main/sub.txt',
          padding: 'x'.repeat(2 * 1024 * 1024),
        }),
      }),
      {},
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/too large|过大/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed when ADMIN_PASSWORD is not configured', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = { MISUB_DB: createMemoryD1(), COOKIE_SECRET: 'stable-cookie-secret' };
    try {
      const response = await handleLogin(
        new Request('https://example.com/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: 'admin' }),
        }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        code: 'ADMIN_PASSWORD_MISSING',
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('keeps browser login sessions valid for thirty days', async () => {
    const env = {
      MISUB_DB: createMemoryD1(),
      COOKIE_SECRET: 'stable-cookie-secret',
      ADMIN_PASSWORD: 'strong-secret-password',
    };
    const issuedAt = Date.now() - (29 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000);
    const token = await createSignedToken(await getSessionSigningSecret(env), String(issuedAt));
    const diagnostic = await getAuthSessionDiagnostic(
      {
        headers: {
          get: (name) => (name.toLowerCase() === 'cookie' ? `auth_session=${token}` : ''),
        },
      },
      env,
    );

    expect(SESSION_DURATION).toBe(30 * 24 * 60 * 60 * 1000);
    expect(diagnostic.isAuthenticated).toBe(true);
    expect(diagnostic.reason).toBe('ok');
  });

  it('marks browser login sessions expired after thirty days', async () => {
    const env = {
      MISUB_DB: createMemoryD1(),
      COOKIE_SECRET: 'stable-cookie-secret',
      ADMIN_PASSWORD: 'strong-secret-password',
    };
    const issuedAt = Date.now() - (30 * 24 * 60 * 60 * 1000 + 1000);
    const token = await createSignedToken(await getSessionSigningSecret(env), String(issuedAt));
    const diagnostic = await getAuthSessionDiagnostic(
      {
        headers: {
          get: (name) => (name.toLowerCase() === 'cookie' ? `auth_session=${token}` : ''),
        },
      },
      env,
    );

    expect(diagnostic.isAuthenticated).toBe(false);
    expect(diagnostic.reason).toBe('expired');
  });

  it('marks sessions for renewal after seven days without renewing earlier sessions', async () => {
    const env = {
      MISUB_DB: createMemoryD1(),
      COOKIE_SECRET: 'stable-cookie-secret',
      ADMIN_PASSWORD: 'strong-secret-password',
    };
    const signingSecret = await getSessionSigningSecret(env);
    const recentToken = await createSignedToken(signingSecret, String(Date.now() - SESSION_RENEW_THRESHOLD + 1000));
    const matureToken = await createSignedToken(signingSecret, String(Date.now() - SESSION_RENEW_THRESHOLD - 1000));

    const recent = await getAuthSessionDiagnostic(
      {
        headers: {
          get: (name) => (name.toLowerCase() === 'cookie' ? `auth_session=${recentToken}` : ''),
        },
      },
      env,
    );
    const mature = await getAuthSessionDiagnostic(
      {
        headers: {
          get: (name) => (name.toLowerCase() === 'cookie' ? `auth_session=${matureToken}` : ''),
        },
      },
      env,
    );

    expect(recent.shouldRenew).toBe(false);
    expect(mature.shouldRenew).toBe(true);
  });

  it('renews mature sessions with a fresh thirty-day cookie', async () => {
    const env = {
      MISUB_DB: createMemoryD1(),
      COOKIE_SECRET: 'stable-cookie-secret',
      ADMIN_PASSWORD: 'strong-secret-password',
    };
    const issuedAt = Date.now() - SESSION_RENEW_THRESHOLD - 1000;
    const token = await createSignedToken(await getSessionSigningSecret(env), String(issuedAt));
    const request = {
      url: 'https://example.com/api/data',
      headers: {
        get: (name) => (name.toLowerCase() === 'cookie' ? `auth_session=${token}` : ''),
      },
    };
    const diagnostic = await getAuthSessionDiagnostic(request, env);
    expect(diagnostic.isAuthenticated).toBe(true);
    expect(diagnostic.shouldRenew).toBe(true);
    const response = await renewAuthSession(request, env, new Response('ok'));
    const setCookie = response.headers.get('Set-Cookie');

    expect(setCookie).toContain('auth_session=');
    expect(setCookie).toContain(`Max-Age=${SESSION_DURATION / 1000}`);
    expect(setCookie).toContain('Secure;');

    const renewedToken = setCookie.split(';')[0].slice('auth_session='.length);
    const renewedTimestamp = Number(renewedToken.split('.')[0]);
    expect(renewedTimestamp).toBeGreaterThan(issuedAt);
  });

  it('does not renew sessions before the threshold or after expiry', async () => {
    const env = {
      MISUB_DB: createMemoryD1(),
      COOKIE_SECRET: 'stable-cookie-secret',
      ADMIN_PASSWORD: 'strong-secret-password',
    };
    const signingSecret = await getSessionSigningSecret(env);
    const recentToken = await createSignedToken(signingSecret, String(Date.now() - 1000));
    const expiredToken = await createSignedToken(signingSecret, String(Date.now() - SESSION_DURATION - 1000));

    const recentResponse = await renewAuthSession(
      {
        url: 'http://example.com/api/data',
        headers: {
          get: (name) => (name.toLowerCase() === 'cookie' ? `auth_session=${recentToken}` : ''),
        },
      },
      env,
      new Response('ok'),
    );
    const expiredResponse = await renewAuthSession(
      {
        url: 'http://example.com/api/data',
        headers: {
          get: (name) => (name.toLowerCase() === 'cookie' ? `auth_session=${expiredToken}` : ''),
        },
      },
      env,
      new Response('ok'),
    );

    expect(recentResponse.headers.has('Set-Cookie')).toBe(false);
    expect(expiredResponse.headers.has('Set-Cookie')).toBe(false);
  });

  it('does not expose public auth debug endpoints in production', async () => {
    const env = {
      MISUB_DB: createMemoryD1(),
      COOKIE_SECRET: 'stable-cookie-secret',
      ADMIN_PASSWORD: 'secret-password',
    };

    const debugResponse = await handleApiRequest(new Request('https://example.com/api/auth_debug'), env);
    const checkResponse = await handleApiRequest(
      new Request('https://example.com/api/auth_check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'secret-password' }),
      }),
      env,
    );

    expect(debugResponse.status).toBe(404);
    expect(checkResponse.status).toBe(404);
  });

  it('allows auth debug endpoints only when explicitly enabled for diagnostics', async () => {
    const env = {
      MISUB_DB: createMemoryD1(),
      COOKIE_SECRET: 'stable-cookie-secret',
      ADMIN_PASSWORD: 'secret-password',
      ENABLE_AUTH_DIAGNOSTICS: 'true',
    };

    const response = await handleApiRequest(new Request('https://example.com/api/auth_debug'), env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('supports per-business cron endpoints with query secret and Authorization bearer', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const env = {
      ASSETS: createAssets(),
      MISUB_DB: createD1({ cronSecret: 'cron-secret' }),
    };
    const next = vi.fn(async () => new Response('next'));

    try {
      const bareCronResponse = await onRequest({
        request: new Request('https://example.com/cron?secret=cron-secret'),
        env,
        next,
      });
      const queryResponse = await onRequest({
        request: new Request('https://example.com/cron/subscriptions?secret=cron-secret'),
        env,
        next,
      });
      const bearerBackupResponse = await onRequest({
        request: new Request('https://example.com/cron/backup', {
          headers: { Authorization: 'Bearer cron-secret' },
        }),
        env,
        next,
      });
      const maintenanceResponse = await onRequest({
        request: new Request('https://example.com/cron/maintenance', {
          headers: { Authorization: 'Bearer cron-secret' },
        }),
        env,
        next,
      });
      const wrongQueryResponse = await onRequest({
        request: new Request('https://example.com/cron/subscriptions?secret=wrong'),
        env,
        next,
      });

      expect(bareCronResponse.status).toBe(400);
      expect(queryResponse.status).toBe(200);
      expect(bearerBackupResponse.status).toBe(200);
      expect(await bearerBackupResponse.json()).toMatchObject({ success: true, task: 'backup', skipped: true });
      expect(maintenanceResponse.status).toBe(200);
      expect(await maintenanceResponse.json()).toMatchObject({ success: true, task: 'maintenance' });
      expect(wrongQueryResponse.status).toBe(401);
      expect(infoSpy).toHaveBeenCalledWith('[Cron] Starting parallel update for 0 subscriptions');
    } finally {
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    }
  });

  it('tests subconverter backends with a synthetic node without exposing user subscriptions', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('proxies:\n  - name: MiSub-Test-Node\n', { status: 200 }));

    const response = await handleSubconverterTestRequest(
      new Request('https://example.com/api/subconverter/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'api.v1.mk' }),
      }),
      {},
    );
    const body = await response.json();
    const requestArg = fetchSpy.mock.calls[0][0];
    const testUrl = new URL(requestArg.url);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.endpoint).toBe('https://api.v1.mk/sub');
    expect(testUrl.origin + testUrl.pathname).toBe('https://api.v1.mk/sub');
    expect(testUrl.searchParams.get('target')).toBe('clash');
    expect(testUrl.searchParams.get('url')).toContain('MiSub-Test-Node');
    expect(testUrl.searchParams.get('url')).not.toContain('airport.example');
  });

  it('reports backend test failure when converter output is not usable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('No nodes were found!', { status: 200 }));

    const response = await handleSubconverterTestRequest(
      new Request('https://example.com/api/subconverter/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'subapi.cmliussss.net' }),
      }),
      {},
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(false);
    expect(body.available).toBe(false);
    expect(body.message).toContain('未返回有效转换结果');
  });

  it('does not pass insecureSkipVerify when fetching external content', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('dm1lc3M6Ly9leGFtcGxl', { status: 200 }));

    const response = await handleExternalFetchRequest(
      new Request('https://example.com/api/fetch_external_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://raw.githubusercontent.com/example/repo/main/sub.txt',
        }),
      }),
      {},
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
    const requestArg = fetchSpy.mock.calls[0][0];
    expect(requestArg.cf?.insecureSkipVerify).not.toBe(true);
  });

  it('masks subscription token in parse logs', async () => {
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = {
      MISUB_DB: createMemoryD1({
        misub_settings_v1: JSON.stringify({
          myToken: 'super-secret-token',
          subConverter: 'backend',
          selectedRules: [],
          customRules: [],
        }),
        subscriptions: JSON.stringify([]),
        profiles: JSON.stringify([]),
      }),
    };

    await handleMisubRequest({
      request: new Request('https://example.com/sub/super-secret-token'),
      env,
    });

    const logs = infoSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logs).not.toContain('super-secret-token');
    expect(logs).toMatch(/Token:/);
  });

  it('redacts access-log token and profile identifiers before payload storage and dedupe fingerprinting', async () => {
    const rawProfileIdentifier = 'private-profile-slug-secret';
    const addLogSpy = vi.spyOn(LogService, 'addLog').mockResolvedValue(null);

    try {
      logAccessSuccess({
        context: {
          generationStats: { totalNodes: 1, successCount: 1 },
          accessLogPersistenceMode: 'light',
          waitUntil(promise) {
            return promise;
          },
        },
        env: {},
        request: new Request('https://example.com/profile-share-token/private-profile-slug-secret', {
          headers: { 'User-Agent': 'ClashMeta', 'CF-Connecting-IP': '203.0.113.8' },
        }),
        userAgentHeader: 'ClashMeta',
        targetFormat: 'clash',
        token: 'profile-share-token',
        profileIdentifier: rawProfileIdentifier,
        subName: 'Private profile',
        domain: 'example.com',
      });

      expect(addLogSpy).toHaveBeenCalledTimes(1);
      const payload = addLogSpy.mock.calls[0][1];
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain(rawProfileIdentifier);
      expect(serialized).not.toContain('profile-share-token');
      expect(payload.token).toMatch(/^profile:[a-f0-9]{12}$/);
    } finally {
      addLogSpy.mockRestore();
    }
  });

  it('redacts raw log tokens before persistence so stored logs and fingerprints do not contain secrets', async () => {
    const rawToken = 'access-log-token-secret';
    const env = { MISUB_DB: createMemoryD1() };

    await LogService.addLog(env, {
      profileName: 'Main subscription',
      clientIp: '203.0.113.8',
      userAgent: 'ClashMeta',
      status: 'success',
      format: 'clash',
      token: rawToken,
      type: 'token',
      domain: 'example.com',
      persistenceMode: 'full',
      details: { totalNodes: 1 },
      summary: 'ok',
    });

    const logs = await LogService.getLogs(env);
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(rawToken);
    expect(logs[0].token).toMatch(/^token:[a-f0-9]{12}$/);
  });

  it('blocks private and loopback addresses in external fetch and preview APIs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('should-not-fetch'));

    const externalResponse = await handleExternalFetchRequest(
      new Request('https://example.com/api/fetch_external_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://127.0.0.1:8787/internal' }),
      }),
      {},
    );
    const metadataResponse = await handleExternalFetchRequest(
      new Request('https://example.com/api/fetch_external_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data' }),
      }),
      {},
    );

    expect(externalResponse.status).toBe(400);
    expect(metadataResponse.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows only explicit trusted external hostnames for public fetch APIs', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('dm1lc3M6Ly9leGFtcGxl', { status: 200 }));

    const rejected = await handleExternalFetchRequest(
      new Request('https://example.com/api/fetch_external_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://sub.example/test' }),
      }),
      {},
    );
    const accepted = await handleExternalFetchRequest(
      new Request('https://example.com/api/fetch_external_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://raw.githubusercontent.com/example/repo/main/sub.txt',
        }),
      }),
      {},
    );

    expect(rejected.status).toBe(400);
    expect(accepted.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('blocks non-global IPv6 and embedded IPv4 bypass ranges', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('should-not-fetch'));
    const blockedUrls = [
      'http://[::ffff:c0a8:101]/sub',
      'http://[::ffff:a9fe:a9fe]/sub',
      'http://[fe81::1]/sub',
      'http://[febf::1]/sub',
      'http://[fed0::1]/sub',
      'http://[::7f00:1]/sub',
      'http://[64:ff9b::7f00:1]/sub',
      'http://[2002:7f00:1::]/sub',
      'http://[2001::1]/sub',
    ];

    for (const url of blockedUrls) {
      const response = await handleExternalFetchRequest(
        new Request('https://example.com/api/fetch_external_url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        }),
        {},
      );
      expect(response.status, url).toBe(400);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks redirects from allowed hosts to private addresses', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', {
        status: 302,
        headers: { Location: 'http://localhost/admin' },
      }),
    );

    const response = await handleExternalFetchRequest(
      new Request('https://example.com/api/fetch_external_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://raw.githubusercontent.com/example/repo/main/sub.txt',
        }),
      }),
      {},
    );

    expect(response.status).toBe(400);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('serves /logo.png to unauthenticated requests even when disguise is enabled', async () => {
    const env = {
      MISUB_DB: createMemoryD1({
        misub_settings_v1: JSON.stringify({
          disguise: { enabled: true, pageType: 'default' },
        }),
      }),
      ASSETS: {
        async fetch(req) {
          const pathname = new URL(req.url).pathname;
          if (pathname === '/logo.png') {
            return new Response('png-bytes', {
              status: 200,
              headers: { 'Content-Type': 'image/png' },
            });
          }
          return new Response('Not Found', { status: 404 });
        },
      },
    };

    const response = await onRequest({
      request: new Request('https://example.com/logo.png'),
      env,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
  });
});
