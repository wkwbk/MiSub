import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleTelegramSetupRequest,
  syncTelegramPushBot,
  TELEGRAM_BOT_COMMANDS,
} from '../../functions/modules/handlers/telegram/client.js';

const createAdapter = vi.fn();

vi.mock('../../functions/storage-adapter.js', () => ({
  STORAGE_TYPES: { D1: 'd1' },
  StorageFactory: {
    createAdapter: (...args) => createAdapter(...args),
  },
}));

describe('Telegram Push Bot setup & menu registration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('registers both commands and webhook on HTTPS origin with valid secret', async () => {
    globalThis.fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const result = await syncTelegramPushBot(
      {
        enabled: true,
        botToken: '123456:TEST_TOKEN',
        webhookSecret: 'valid_secret-123',
      },
      'https://misub.example.com',
    );

    expect(result.attempted).toBe(true);
    expect(result.success).toBe(true);
    expect(result.commands.ok).toBe(true);
    expect(result.webhook.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const calls = globalThis.fetch.mock.calls.map(([url, init]) => ({
      url,
      body: JSON.parse(init.body),
    }));

    const cmdCall = calls.find((c) => c.url.endsWith('/setMyCommands'));
    const webhookCall = calls.find((c) => c.url.endsWith('/setWebhook'));

    expect(cmdCall).toBeTruthy();
    expect(cmdCall.body.commands).toEqual(TELEGRAM_BOT_COMMANDS);
    expect(webhookCall).toBeTruthy();
    expect(webhookCall.body).toEqual({
      url: 'https://misub.example.com/api/telegram/webhook',
      secret_token: 'valid_secret-123',
    });
  });

  it('registers commands and skips webhook on non-HTTPS origin', async () => {
    globalThis.fetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await syncTelegramPushBot(
      {
        enabled: true,
        botToken: '123456:TEST_TOKEN',
        webhookSecret: 'valid_secret-123',
      },
      'http://localhost:8787',
    );

    expect(result.attempted).toBe(true);
    expect(result.success).toBe(true);
    expect(result.commands.ok).toBe(true);
    expect(result.webhook.skipped).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/setMyCommands');
  });

  it('returns failure cleanly without throwing when Telegram API fails', async () => {
    globalThis.fetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await syncTelegramPushBot(
      {
        enabled: true,
        botToken: 'bad-token',
        webhookSecret: 'valid_secret-123',
      },
      'https://misub.example.com',
    );

    expect(result.attempted).toBe(true);
    expect(result.success).toBe(false);
    expect(result.commands.ok).toBe(false);
    expect(result.commands.error).toBe('Unauthorized');
  });

  it('skips sync when disabled or token is empty', async () => {
    const result = await syncTelegramPushBot({ enabled: false, botToken: '123:ABC' }, 'https://misub.example.com');
    expect(result.attempted).toBe(false);
    expect(result.skipped).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('handles POST /api/telegram/setup and rejects non-POST or missing token', async () => {
    const getRes = await handleTelegramSetupRequest(
      new Request('https://misub.example.com/api/telegram/setup', { method: 'GET' }),
      {},
    );
    expect(getRes.status).toBe(405);

    createAdapter.mockResolvedValue({
      get: vi.fn(async () => ({})),
    });

    const missingTokenRes = await handleTelegramSetupRequest(
      new Request('https://misub.example.com/api/telegram/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      {},
    );
    expect(missingTokenRes.status).toBe(400);

    globalThis.fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const okRes = await handleTelegramSetupRequest(
      new Request('https://misub.example.com/api/telegram/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: '123456:TEST_TOKEN',
          webhookSecret: 'valid_secret-123',
        }),
      }),
      {},
    );
    expect(okRes.status).toBe(200);
    const payload = await okRes.json();
    expect(payload.success).toBe(true);
    expect(payload.commands.ok).toBe(true);
    expect(payload.webhook.ok).toBe(true);
  });
});
