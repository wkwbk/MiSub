import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { onRequest } from '../../functions/[[path]].js';
import { handleDataRequest, handleSettingsGet, handleSettingsSave } from '../../functions/modules/api-handler.js';
import { handleExternalFetchRequest, handleSubconverterTestRequest } from '../../functions/modules/api-router.js';
import { handleLogin, LOGIN_RATE_LIMIT_MAX_ATTEMPTS } from '../../functions/modules/auth-middleware.js';
import { authenticateExternalApiRequest } from '../../functions/modules/external-api/external-api-auth.js';
import { handleTelegramSetupRequest } from '../../functions/modules/handlers/telegram/client.js';
import { handleTestNotificationRequest } from '../../functions/modules/notifications.js';
import { isSafeUserRegexPattern } from '../../functions/modules/security-utils.js';
import { readJsonWithLimit, RequestBodyTooLargeError } from '../../functions/modules/utils.js';
import { clearSettingsCache } from '../../functions/storage-adapter.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

function createAssets() {
  return {
    async fetch() {
      return new Response('<html>ok</html>', { headers: { 'Content-Type': 'text/html' } });
    },
  };
}

describe('Batch 1 security and contract hardening', () => {
  beforeEach(() => {
    clearSettingsCache();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves object-format profile.subscriptions entries during store pruning and removal', () => {
    setActivePinia(createPinia());
    const dataStore = useDataStore();

    const subObj = {
      id: 'sub-1',
      exclude: '官网',
      operators: [{ type: 'filter', enabled: true }],
    };

    dataStore.hydrateFromData({
      misubs: [
        { id: 'sub-1', name: 'Airport 1', url: 'https://example.com/1' },
        { id: 'sub-2', name: 'Airport 2', url: 'https://example.com/2' },
      ],
      profiles: [
        {
          id: 'profile-1',
          name: 'Mixed Profile',
          subscriptions: [subObj, 'sub-stale', 'sub-2'],
          manualNodes: [],
        },
      ],
      ruleTemplates: [],
      config: {},
    });

    // Trigger prune via hydrate + removeSubscriptionFromProfiles
    dataStore.removeSubscriptionFromProfiles('sub-2');
    expect(dataStore.profiles[0].subscriptions).toEqual([subObj, 'sub-stale']);

    // Force-fetch path triggers pruneInvalidReferences() while keeping object entries
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            misubs: [{ id: 'sub-1', name: 'Airport 1', url: 'https://example.com/1' }],
            profiles: [
              {
                id: 'profile-1',
                name: 'Mixed Profile',
                subscriptions: [subObj, 'sub-stale'],
                manualNodes: [],
              },
            ],
            ruleTemplates: [],
            config: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    return dataStore.fetchData(true).then((ok) => {
      expect(ok).toBe(true);
      expect(dataStore.profiles[0].subscriptions).toEqual([subObj]);
    });
  });

  it('authenticates /cron/* via env.CRON_SECRET fallback and external API via timing-safe comparison', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const env = {
      ASSETS: createAssets(),
      MISUB_DB: createMemoryD1({
        main: {
          externalApi: {
            enabled: true,
            tokens: [
              { name: 'primary', token: 'ext-secret-123' },
              { name: 'secondary', token: 'ext-secret-456' },
            ],
          },
        },
      }),
      CRON_SECRET: 'env-cron-secret',
    };

    try {
      const okRes = await onRequest({
        request: new Request('https://example.com/cron/subscriptions', {
          headers: { Authorization: 'Bearer env-cron-secret' },
        }),
        env,
      });
      const badRes = await onRequest({
        request: new Request('https://example.com/cron/subscriptions', {
          headers: { Authorization: 'Bearer wrong-secret' },
        }),
        env,
      });
      expect(okRes.status).toBe(200);
      expect(badRes.status).toBe(401);

      const extOk = await authenticateExternalApiRequest(
        new Request('https://example.com/api/ext/v1/profiles', {
          headers: { Authorization: 'Bearer ext-secret-456' },
        }),
        env,
      );
      const extBad = await authenticateExternalApiRequest(
        new Request('https://example.com/api/ext/v1/profiles', {
          headers: { Authorization: 'Bearer ext-secret-nope' },
        }),
        env,
      );
      expect(extOk).toEqual({ ok: true, tokenName: 'secondary' });
      expect(extBad.ok).toBe(false);
      expect(extBad.response.status).toBe(401);
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('rate limits /api/login after repeated failures and resets on success', async () => {
    const db = createMemoryD1();
    const env = {
      MISUB_DB: db,
      ADMIN_PASSWORD: 'correct-password',
      COOKIE_SECRET: 'cookie-secret',
    };

    const makeLoginReq = (password, ip = '203.0.113.10') =>
      new Request('https://example.com/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': ip,
        },
        body: JSON.stringify({ password }),
      });

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS; i++) {
      const res = await handleLogin(makeLoginReq('wrong-password'), env);
      expect(res.status).toBe(401);
    }

    const lockedRes = await handleLogin(makeLoginReq('correct-password'), env);
    expect(lockedRes.status).toBe(429);
    expect(Number(lockedRes.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await lockedRes.json()).toMatchObject({ code: 'LOGIN_RATE_LIMITED' });

    // Different IP can still log in and resets its own counter on success
    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS - 1; i++) {
      const failRes = await handleLogin(makeLoginReq('wrong-password', '203.0.113.11'), env);
      expect(failRes.status).toBe(401);
    }
    const successRes = await handleLogin(makeLoginReq('correct-password', '203.0.113.11'), env);
    expect(successRes.status).toBe(200);
    const nextFail = await handleLogin(makeLoginReq('wrong-password', '203.0.113.11'), env);
    expect(nextFail.status).toBe(401);
  });

  it('redacts sensitive secrets across /api/settings, /api/data, and browser sessionStorage, and preserves on blank save', async () => {
    const db = createMemoryD1({
      main: {
        botToken: 'notify-bot-secret',
        chatId: '10086',
        cronSecret: 'cron-secret-val',
        webdavBackup: { enabled: true, endpoint: 'https://dav.example.com', password: 'dav-password' },
        shortLink: { enabled: true, apiUrl: 'https://s.example.com', apiToken: 'sink-token' },
        turnstile: { enabled: false, siteKey: 'site-k', secretKey: 'turnstile-secret' },
        telegramPushConfig: {
          enabled: true,
          botToken: 'push-bot-secret',
          webhookSecret: 'push-webhook-secret',
          allowedUserIds: ['123'],
        },
        externalApi: {
          enabled: true,
          tokens: [{ name: 'cli', token: 'ext-api-token' }],
        },
      },
    });
    const env = { MISUB_DB: db };

    const settingsRes = await handleSettingsGet(env);
    const settingsBody = await settingsRes.json();
    expect(settingsBody.botToken).toBe('');
    expect(settingsBody.hasBotToken).toBe(true);
    expect(settingsBody.telegramPushConfig.botToken).toBe('');
    expect(settingsBody.telegramPushConfig.hasBotToken).toBe(true);
    expect(settingsBody.telegramPushConfig.webhookSecret).toBe('');
    expect(settingsBody.telegramPushConfig.hasWebhookSecret).toBe(true);
    expect(settingsBody.webdavBackup.password).toBe('');
    expect(settingsBody.webdavBackup.hasPassword).toBe(true);
    expect(settingsBody.cronSecret).toBe('cron-secret-val');
    expect(settingsBody.externalApi.tokens[0].token).toBe('ext-api-token');

    // Blank save preserves existing server-side secrets
    const saveRes = await handleSettingsSave(
      new Request('https://example.com/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MiSub-Save-Scope': 'preferences',
        },
        body: JSON.stringify({
          botToken: '',
          hasBotToken: true,
          telegramPushConfig: {
            enabled: true,
            botToken: '',
            hasBotToken: true,
            webhookSecret: '',
            hasWebhookSecret: true,
          },
          webdavBackup: {
            enabled: true,
            endpoint: 'https://dav.example.com',
            password: '',
            hasPassword: true,
          },
        }),
      }),
      env,
    );
    expect(saveRes.status).toBe(200);

    const dataRes = await handleDataRequest(env);
    const dataBody = await dataRes.json();
    expect(dataBody.ruleTemplates).toBeUndefined();
    expect(dataBody.config.botToken).toBeUndefined();
    expect(dataBody.config.cronSecret).toBeUndefined();
    expect(dataBody.config.hasCronSecret).toBeUndefined();
    expect(dataBody.config.telegramPushConfig).toBeUndefined();
    expect(dataBody.config.externalApi).toBeUndefined();
    expect(dataBody.config.webdavBackup).toBeUndefined();
    expect(dataBody.config.turnstile).toBeUndefined();
    expect(dataBody.config.customPage).toBeUndefined();
    expect(dataBody.config.portalCustomPage).toBeUndefined();
    expect(dataBody.config.announcement).toBeUndefined();
    expect(dataBody.config.shortLink).toEqual({
      enabled: true,
      provider: 'sink',
      apiUrl: 'https://s.example.com',
      apiToken: '',
      hasToken: true,
    });

    // Verify stored settings were preserved on blank save
    const persistedRaw = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('main').first();
    const persisted = JSON.parse(persistedRaw.value);
    expect(persisted.botToken).toBe('notify-bot-secret');
    expect(persisted.telegramPushConfig.botToken).toBe('push-bot-secret');
    expect(persisted.telegramPushConfig.webhookSecret).toBe('push-webhook-secret');
    expect(persisted.webdavBackup.password).toBe('dav-password');

    // Client cache strips any residual secrets before writing to sessionStorage
    setActivePinia(createPinia());
    const dataStore = useDataStore();
    dataStore.hydrateFromData({
      misubs: [],
      profiles: [],
      ruleTemplates: [],
      config: {
        siteName: 'MiSub',
        botToken: 'leak-1',
        cronSecret: 'leak-2',
        webdavBackup: { endpoint: 'https://dav.example.com', password: 'leak-3' },
        shortLink: { apiUrl: 'https://s.example.com', apiToken: 'leak-4' },
        turnstile: { siteKey: 'site-k', secretKey: 'leak-5' },
        telegramPushConfig: { botToken: 'leak-6', webhookSecret: 'leak-7' },
        externalApi: { enabled: true, tokens: [{ name: 'cli', token: 'leak-8' }] },
      },
    });
    const cached = JSON.parse(sessionStorage.getItem('misub_data_cache'));
    expect(cached.config.botToken).toBeUndefined();
    expect(cached.config.cronSecret).toBeUndefined();
    expect(cached.config.webdavBackup.password).toBeUndefined();
    expect(cached.config.shortLink.apiToken).toBeUndefined();
    expect(cached.config.turnstile.secretKey).toBeUndefined();
    expect(cached.config.telegramPushConfig.botToken).toBeUndefined();
    expect(cached.config.telegramPushConfig.webhookSecret).toBeUndefined();
    expect(cached.config.externalApi.tokens).toEqual([{ name: 'cli' }]);
  });

  it('falls back to stored Telegram tokens when UI sends empty redacted fields', async () => {
    const db = createMemoryD1({
      main: {
        botToken: 'saved-notify-token',
        chatId: '999999',
        telegramPushConfig: {
          enabled: true,
          botToken: 'saved-push-token',
          webhookSecret: 'saved_webhook_secret',
        },
      },
    });
    const env = { MISUB_DB: db };

    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const notifyRes = await handleTestNotificationRequest(
      new Request('https://example.com/api/test_notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: '', chatId: '' }),
      }),
      env,
    );
    expect(notifyRes.status).toBe(200);
    expect(fetchSpy.mock.calls[0][0]).toContain('botsaved-notify-token/sendMessage');

    const setupRes = await handleTelegramSetupRequest(
      new Request('https://example.com/api/telegram/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: '', webhookSecret: '' }),
      }),
      env,
    );
    expect(setupRes.status).toBe(200);
    const setupUrls = fetchSpy.mock.calls.slice(1).map((call) => call[0]);
    expect(setupUrls.some((u) => u.includes('botsaved-push-token/setMyCommands'))).toBe(true);
    expect(setupUrls.some((u) => u.includes('botsaved-push-token/setWebhook'))).toBe(true);
  });

  it('aborts streaming JSON reads without Content-Length as soon as byte limit is exceeded', async () => {
    let pulledChunks = 0;
    const stream = new ReadableStream({
      pull(controller) {
        pulledChunks++;
        controller.enqueue(new Uint8Array(64).fill(97)); // 64 bytes per chunk
      },
    });

    const mockRequest = {
      headers: new Headers(),
      body: stream,
    };

    await expect(readJsonWithLimit(mockRequest, 100)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(pulledChunks).toBeLessThanOrEqual(3);
  });

  it('blocks subconverter redirects to private addresses and clamps external fetch timeout', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', {
        status: 302,
        headers: { Location: 'http://127.0.0.1/admin' },
      }),
    );

    const redirectRes = await handleSubconverterTestRequest(
      new Request('https://example.com/api/subconverter/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'api.v1.mk' }),
      }),
      {},
    );
    expect(redirectRes.status).toBe(400);
    const redirectBody = await redirectRes.json();
    expect(redirectBody.errorType).toBe('blocked');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchSpy.mockImplementationOnce(
      (_req) =>
        new Promise((_resolve, reject) => {
          const req = _req;
          req.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const extPromise = handleExternalFetchRequest(
      new Request('https://example.com/api/fetch_external_url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://raw.githubusercontent.com/example/repo/main/sub.txt',
          timeout: 9999999,
        }),
      }),
      {},
    );
    await vi.advanceTimersByTimeAsync(30000);
    const extRes = await extPromise;
    expect(extRes.status).toBe(500);
    const extBody = await extRes.json();
    expect(extBody.error).toContain('30000ms');
    errorSpy.mockRestore();
  });

  it('rejects ReDoS and oversized patterns while permitting standard node filter regexes', () => {
    expect(isSafeUserRegexPattern('HK|香港|JP|日本')).toBe(true);
    expect(isSafeUserRegexPattern('^(?!.*免费).*$')).toBe(true);
    expect(isSafeUserRegexPattern('\\d+x')).toBe(true);
    expect(isSafeUserRegexPattern('v\\d+(\\.\\d+)?')).toBe(true);

    expect(isSafeUserRegexPattern('(a+)+$')).toBe(false);
    expect(isSafeUserRegexPattern('(a|aa)+$')).toBe(false);
    expect(isSafeUserRegexPattern('([a-z]+)*')).toBe(false);
    expect(isSafeUserRegexPattern('a'.repeat(300), 256)).toBe(false);
  });
});
