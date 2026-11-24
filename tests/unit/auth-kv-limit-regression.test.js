import { describe, expect, it } from 'vitest';
import { getAuthDebugInfo, getCookieSecret } from '../../functions/modules/utils.js';
import {
  getAuthSessionDiagnostic,
  getSessionSigningSecret,
  handleLogin,
} from '../../functions/modules/auth-middleware.js';
import { getTelegramPushConfig } from '../../functions/modules/handlers/telegram/storage.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

function createFailingD1() {
  return {
    prepare() {
      const fail = async () => {
        throw new Error('D1 should not be touched by env-only auth');
      };
      return {
        first: fail,
        all: fail,
        run: fail,
        bind() {
          return { first: fail, all: fail, run: fail };
        },
      };
    },
  };
}

describe('single source of truth for env secrets and D1 settings', () => {
  it('reads COOKIE_SECRET strictly from env without reading or writing D1', async () => {
    const env = {
      MISUB_DB: createFailingD1(),
      COOKIE_SECRET: '  stable-cookie-secret  ',
      ADMIN_PASSWORD: 'secret-password',
    };

    await expect(getCookieSecret(env)).resolves.toBe('stable-cookie-secret');
    await expect(
      getCookieSecret({ MISUB_DB: createMemoryD1({ SYSTEM_COOKIE_SECRET: 'stale-d1-secret' }) }),
    ).resolves.toBe(null);
  });

  it('logs in without touching D1 even when D1 is completely unavailable', async () => {
    const env = {
      MISUB_DB: createFailingD1(),
      COOKIE_SECRET: 'stable-cookie-secret',
      ADMIN_PASSWORD: 'secret-password',
    };
    const request = new Request('https://example.com/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'secret-password' }),
    });

    const response = await handleLogin(request, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it('immediately invalidates existing sessions when COOKIE_SECRET is rotated', async () => {
    const initialEnv = {
      MISUB_DB: createFailingD1(),
      ADMIN_PASSWORD: 'secret-password',
      COOKIE_SECRET: 'cookie-secret-v1',
    };
    const loginResponse = await handleLogin(
      new Request('https://example.com/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'secret-password' }),
      }),
      initialEnv,
    );
    const cookieHeader = loginResponse.headers.get('Set-Cookie').split(';')[0];

    const rotatedEnv = {
      ...initialEnv,
      COOKIE_SECRET: 'cookie-secret-v2',
    };
    const diag = await getAuthSessionDiagnostic(
      { headers: { get: (name) => (name.toLowerCase() === 'cookie' ? cookieHeader : '') } },
      rotatedEnv,
    );
    expect(diag.isAuthenticated).toBe(false);
    expect(diag.reason).toBe('invalid_signature_or_secret');
  });

  it('derives a stable signing key from ADMIN_PASSWORD when COOKIE_SECRET is omitted', async () => {
    const env = { ADMIN_PASSWORD: 'secret-password' };
    const first = await getSessionSigningSecret(env);
    const second = await getSessionSigningSecret({ ADMIN_PASSWORD: 'secret-password' });
    const withCookieSecret = await getSessionSigningSecret({
      ADMIN_PASSWORD: 'secret-password',
      COOKIE_SECRET: 'extra-secret',
    });

    expect(first).toBeTruthy();
    expect(second).toBe(first);
    expect(withCookieSecret).not.toBe(first);
  });

  it('auth_debug reports pure env and derived sources without touching D1', async () => {
    await expect(
      getAuthDebugInfo({
        MISUB_DB: createFailingD1(),
        COOKIE_SECRET: 'stable-cookie-secret',
        ADMIN_PASSWORD: 'secret-password',
      }),
    ).resolves.toMatchObject({
      hasD1: true,
      adminPassword: { source: 'env', configured: true },
      cookieSecret: { source: 'env', configured: true },
    });

    await expect(
      getAuthDebugInfo({
        MISUB_DB: createFailingD1(),
        ADMIN_PASSWORD: 'secret-password',
      }),
    ).resolves.toMatchObject({
      hasD1: true,
      adminPassword: { source: 'env', configured: true },
      cookieSecret: { source: 'derived', configured: false },
    });
  });

  it('reads telegramPushConfig strictly from D1 settings and ignores TELEGRAM_PUSH_* env vars', async () => {
    const db = createMemoryD1({
      main: {
        telegramPushConfig: {
          enabled: true,
          botToken: '',
          webhookSecret: '',
          allowedUserIds: [],
        },
      },
    });
    const config = await getTelegramPushConfig({
      MISUB_DB: db,
      TELEGRAM_PUSH_BOT_TOKEN: 'stale-env-bot-token',
      TELEGRAM_PUSH_WEBHOOK_SECRET: 'stale-env-webhook-secret',
      TELEGRAM_PUSH_ALLOWED_USERS: '12345,67890',
    });

    expect(config.botToken).toBe('');
    expect(config.webhookSecret).toBe('');
    expect(config.allowedUserIds).toEqual([]);
  });
});
