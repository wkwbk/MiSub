import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublicTurnstileConfig, resolveTurnstileConfig, verifyTurnstileToken } from '../../functions/modules/turnstile.js';
import { handleGuestbookPost } from '../../functions/modules/handlers/guestbook-handler.js';
import { handleLogin } from '../../functions/modules/auth-middleware.js';
import { handlePublicConfig, handleSettingsGet, handleSettingsSave } from '../../functions/modules/api-handler.js';
import { securityHeadersMiddleware } from '../../functions/middleware/cors.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';
import { StorageFactory } from '../../functions/storage-adapter.js';
import { STORAGE_KEY_SETTINGS } from '../../functions/modules/config.js';

describe('Cloudflare Turnstile integration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('resolveTurnstileConfig & getPublicTurnstileConfig', () => {
    it('prefers DB settings keys over env vars and falls back to env vars when blank', () => {
      const env = {
        TURNSTILE_SITE_KEY: 'env-site',
        TURNSTILE_SECRET_KEY: 'env-secret',
      };

      const fromSettings = resolveTurnstileConfig(
        {
          turnstile: {
            enabled: true,
            siteKey: 'db-site',
            secretKey: 'db-secret',
            enableForGuestbook: true,
            enableForLogin: true,
          },
        },
        env,
      );
      expect(fromSettings.siteKey).toBe('db-site');
      expect(fromSettings.secretKey).toBe('db-secret');
      expect(fromSettings.enableForGuestbook).toBe(true);
      expect(fromSettings.enableForLogin).toBe(true);

      const fromEnv = resolveTurnstileConfig(
        {
          turnstile: {
            enabled: true,
            siteKey: '',
            secretKey: '',
            enableForGuestbook: true,
            enableForLogin: false,
          },
        },
        env,
      );
      expect(fromEnv.siteKey).toBe('env-site');
      expect(fromEnv.secretKey).toBe('env-secret');
      expect(fromEnv.enableForGuestbook).toBe(true);
      expect(fromEnv.enableForLogin).toBe(false);
    });

    it('never exposes secretKey in public config and respects DISABLE_LOGIN_TURNSTILE', () => {
      const publicConfig = getPublicTurnstileConfig(
        {
          turnstile: {
            enabled: true,
            siteKey: 'site-123',
            secretKey: 'top-secret',
            enableForGuestbook: true,
            enableForLogin: true,
          },
        },
        { DISABLE_LOGIN_TURNSTILE: 'true' },
      );

      expect(publicConfig).toEqual({
        siteKey: 'site-123',
        enableForGuestbook: true,
        enableForLogin: false,
      });
      expect('secretKey' in publicConfig).toBe(false);
    });
  });

  describe('verifyTurnstileToken', () => {
    it('rejects missing token without calling Cloudflare', async () => {
      const mockFetch = vi.fn();
      const result = await verifyTurnstileToken('', new Request('https://example.com/api/login'), {
        secretKey: 'secret-key',
        fetchImpl: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('turnstile_missing');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('posts secret, response, and CF-Connecting-IP to siteverify and handles success/expired', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const req = new Request('https://example.com/api/public/guestbook', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '203.0.113.10' },
      });

      const ok = await verifyTurnstileToken('valid-token', req, {
        secretKey: 'my-secret',
        fetchImpl: mockFetch,
      });
      expect(ok.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
      expect(calledInit.body).toContain('secret=my-secret');
      expect(calledInit.body).toContain('response=valid-token');
      expect(calledInit.body).toContain('remoteip=203.0.113.10');

      const expired = await verifyTurnstileToken('stale-token', req, {
        secretKey: 'my-secret',
        fetchImpl: mockFetch,
      });
      expect(expired.success).toBe(false);
      expect(expired.code).toBe('turnstile_expired');
    });
  });

  describe('Guestbook, Login, Settings, and CSP integration', () => {
    it('enforces Turnstile on POST /api/public/guestbook when enabled', async () => {
      const db = createMemoryD1();
      const env = { MISUB_DB: db };
      const adapter = StorageFactory.createAdapter(env);
      await adapter.put(STORAGE_KEY_SETTINGS, {
        enablePublicPage: true,
        guestbook: { enabled: true, allowAnonymous: true },
        turnstile: {
          enabled: true,
          siteKey: 'site-gb',
          secretKey: 'secret-gb',
          enableForGuestbook: true,
          enableForLogin: false,
        },
      });

      const missingResp = await handleGuestbookPost(
        new Request('https://example.com/api/public/guestbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nickname: 'Alice', content: 'Hello', type: 'general' }),
        }),
        env,
      );
      expect(missingResp.status).toBe(400);

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const okResp = await handleGuestbookPost(
        new Request('https://example.com/api/public/guestbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nickname: 'Alice',
            content: 'Hello',
            type: 'general',
            turnstileToken: 'good-token',
          }),
        }),
        env,
      );
      expect(okResp.status).toBe(200);
      const okJson = await okResp.json();
      expect(okJson.success).toBe(true);
    });

    it('enforces Turnstile on POST /api/login and supports DISABLE_LOGIN_TURNSTILE emergency bypass', async () => {
      const db = createMemoryD1();
      const env = {
        MISUB_DB: db,
        ADMIN_PASSWORD: 'correct-password',
      };
      const adapter = StorageFactory.createAdapter(env);
      await adapter.put(STORAGE_KEY_SETTINGS, {
        turnstile: {
          enabled: true,
          siteKey: 'site-login',
          secretKey: 'secret-login',
          enableForGuestbook: true,
          enableForLogin: true,
        },
      });

      const blockedResp = await handleLogin(
        new Request('https://example.com/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: 'correct-password' }),
        }),
        env,
      );
      expect(blockedResp.status).toBe(400);
      const blockedJson = await blockedResp.json();
      expect(blockedJson.code).toBe('turnstile_missing');

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const okResp = await handleLogin(
        new Request('https://example.com/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: 'correct-password', turnstileToken: 'login-token' }),
        }),
        env,
      );
      expect(okResp.status).toBe(200);

      const bypassResp = await handleLogin(
        new Request('https://example.com/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: 'correct-password' }),
        }),
        { ...env, DISABLE_LOGIN_TURNSTILE: 'true' },
      );
      expect(bypassResp.status).toBe(200);
    });

    it('redacts secretKey in settings responses, preserves secretKey when omitted, and validates required keys', async () => {
      const db = createMemoryD1();
      const env = { MISUB_DB: db };

      // Enabling without keys should fail with 400
      const invalidSave = await handleSettingsSave(
        new Request('https://example.com/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turnstile: { enabled: true, siteKey: '', secretKey: '' },
          }),
        }),
        env,
      );
      expect(invalidSave.status).toBe(400);

      // Save with valid keys
      const saveResp = await handleSettingsSave(
        new Request('https://example.com/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turnstile: {
              enabled: true,
              siteKey: 'site-abc',
              secretKey: 'secret-xyz',
              enableForGuestbook: true,
              enableForLogin: true,
            },
          }),
        }),
        env,
      );
      expect(saveResp.status).toBe(200);
      const savedJson = await saveResp.json();
      expect(savedJson.data.turnstile.secretKey).toBe('');
      expect(savedJson.data.turnstile.hasSecretKey).toBe(true);

      // Subsequent save with empty secretKey should preserve stored secretKey
      const updateResp = await handleSettingsSave(
        new Request('https://example.com/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            turnstile: {
              enabled: true,
              siteKey: 'site-abc',
              secretKey: '',
              enableForGuestbook: true,
              enableForLogin: false,
            },
          }),
        }),
        env,
      );
      expect(updateResp.status).toBe(200);

      const getResp = await handleSettingsGet(env);
      const getJson = await getResp.json();
      expect(getJson.turnstile.secretKey).toBe('');
      expect(getJson.turnstile.hasSecretKey).toBe(true);
      expect(getJson.turnstile.enableForLogin).toBe(false);

      const publicResp = await handlePublicConfig(new Request('https://example.com/api/public_config'), env);
      const publicJson = await publicResp.json();
      expect(publicJson.turnstile).toEqual({
        siteKey: 'site-abc',
        enableForGuestbook: true,
        enableForLogin: false,
      });
    });

    it('allows Cloudflare Turnstile script origin in CSP header', async () => {
      const response = await securityHeadersMiddleware(
        new Request('https://example.com/'),
        async () => new Response('ok'),
      );
      const csp = response.headers.get('Content-Security-Policy') || '';
      expect(csp).toContain('https://challenges.cloudflare.com');
    });
  });
});
