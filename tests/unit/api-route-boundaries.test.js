import { beforeEach, describe, expect, it } from 'vitest';
import { handleApiRequest } from '../../functions/modules/api-router.js';
import { clearSettingsCache } from '../../functions/storage-adapter.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

describe('API route access boundaries', () => {
  beforeEach(() => {
    clearSettingsCache();
  });

  it('keeps documented public read endpoints reachable without an admin session', async () => {
    const env = { MISUB_DB: createMemoryD1() };

    const publicConfig = await handleApiRequest(new Request('https://example.com/api/public_config'), env);
    const publicProfiles = await handleApiRequest(new Request('https://example.com/api/public/profiles'), env);
    const publicClients = await handleApiRequest(new Request('https://example.com/api/clients'), env);

    expect(publicConfig.status).toBe(200);
    expect(publicProfiles.status).toBe(200);
    expect(publicClients.status).toBe(200);
  });

  it('does not expose the custom login path through public configuration', async () => {
    const env = {
      MISUB_DB: createMemoryD1({
        worker_settings_v1: JSON.stringify({ customLoginPath: 'admin-login' }),
      }),
    };

    const response = await handleApiRequest(new Request('https://example.com/api/public_config'), env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty('customLoginPath');
    expect(body.isLoginPath).toBe(false);
  });

  it('marks the current configured login path without returning the path', async () => {
    const env = {
      MISUB_DB: createMemoryD1({
        worker_settings_v1: JSON.stringify({ customLoginPath: 'admin-login' }),
      }),
    };

    clearSettingsCache();
    const response = await handleApiRequest(
      new Request('https://example.com/api/public_config', {
        headers: { 'X-MiSub-Path': '/admin-login' },
      }),
      env,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isLoginPath).toBe(true);
    expect(body).not.toHaveProperty('customLoginPath');
  });

  it('exposes the configured default locale on the public profiles endpoint', async () => {
    const env = {
      MISUB_DB: createMemoryD1({
        worker_settings_v1: JSON.stringify({ defaultLocale: 'en-US' }),
      }),
    };

    const response = await handleApiRequest(new Request('https://example.com/api/public/profiles'), env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.config.defaultLocale).toBe('en-US');
  });

  it('falls back to the default locale when the setting is absent', async () => {
    const env = { MISUB_DB: createMemoryD1() };

    const response = await handleApiRequest(new Request('https://example.com/api/public/profiles'), env);
    const body = await response.json();

    expect(body.config.defaultLocale).toBe('zh-CN');
  });

  it('returns unauthenticated metadata for /api/data without exposing management data', async () => {
    const env = {
      MISUB_DB: createMemoryD1({
        misub_subscriptions_v1: JSON.stringify([
          { id: 'secret-sub', name: 'Private Sub', url: 'https://airport.example/sub' },
        ]),
        misub_profiles_v1: JSON.stringify([{ id: 'secret-profile', name: 'Private Profile' }]),
      }),
      COOKIE_SECRET: 'stable-cookie-secret',
      ADMIN_PASSWORD: 'secret-password',
    };

    const response = await handleApiRequest(new Request('https://example.com/api/data'), env);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ authenticated: false, message: 'Not logged in' });
    expect(JSON.stringify(body)).not.toContain('secret-sub');
    expect(JSON.stringify(body)).not.toContain('Private Profile');
    expect(JSON.stringify(body)).not.toContain('airport.example');
  });

  it('requires an admin session for management routes before dispatching handlers', async () => {
    const env = {
      MISUB_DB: createMemoryD1(),
      COOKIE_SECRET: 'stable-cookie-secret',
      ADMIN_PASSWORD: 'secret-password',
    };

    const protectedRequests = [
      new Request('https://example.com/api/settings'),
      new Request('https://example.com/api/misubs', {
        method: 'POST',
        body: JSON.stringify({ misubs: [], profiles: [] }),
      }),
      new Request('https://example.com/api/backup/export', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    ];

    for (const request of protectedRequests) {
      const response = await handleApiRequest(request, env);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body).toEqual({ error: 'Unauthorized' });
    }
  });
});
