import { describe, expect, it, vi } from 'vitest';
import { AdminPasswordMissingError, getAdminPassword, getAuthDebugInfo } from '../../functions/modules/utils.js';
import {
  getAuthSessionDiagnostic,
  handleLogin,
  timingSafeStringEqual,
} from '../../functions/modules/auth-middleware.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

function createFailingD1(errorMessage = 'D1 storage is paused') {
  return {
    prepare() {
      const fail = async () => {
        throw new Error(errorMessage);
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

describe('pure ADMIN_PASSWORD secret authentication', () => {
  it('returns trimmed ADMIN_PASSWORD from env', async () => {
    await expect(getAdminPassword({ ADMIN_PASSWORD: '  my-strong-secret  ' })).resolves.toBe('my-strong-secret');
  });

  it('fails closed with AdminPasswordMissingError when ADMIN_PASSWORD is unset', async () => {
    await expect(getAdminPassword({ MISUB_DB: createMemoryD1() })).rejects.toBeInstanceOf(AdminPasswordMissingError);
    await expect(getAdminPassword({})).rejects.toBeInstanceOf(AdminPasswordMissingError);
  });

  it('ignores legacy D1 SYSTEM_ADMIN_PASSWORD and still fails closed when ADMIN_PASSWORD is unset', async () => {
    const db = createMemoryD1({
      SYSTEM_ADMIN_PASSWORD: 'legacy-d1-password',
    });
    await expect(getAdminPassword({ MISUB_DB: db })).rejects.toBeInstanceOf(AdminPasswordMissingError);
    await expect(getAuthDebugInfo({ MISUB_DB: db })).resolves.toMatchObject({
      adminPassword: {
        source: 'missing',
        configured: false,
      },
    });
  });

  it('rejects login with 503 ADMIN_PASSWORD_MISSING when ADMIN_PASSWORD is unset', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const request = new Request('https://example.com/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin' }),
    });
    try {
      const response = await handleLogin(request, {
        MISUB_DB: createMemoryD1(),
        COOKIE_SECRET: 'test-cookie-secret',
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        code: 'ADMIN_PASSWORD_MISSING',
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('authenticates with ADMIN_PASSWORD even when D1 is unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = {
      MISUB_DB: createFailingD1('D1 storage is paused'),
      ADMIN_PASSWORD: 'env-only-password',
      COOKIE_SECRET: 'test-cookie-secret',
    };
    const request = new Request('https://example.com/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'env-only-password' }),
    });
    try {
      const response = await handleLogin(request, env);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('immediately invalidates existing sessions when ADMIN_PASSWORD changes', async () => {
    const db = createMemoryD1();
    const initialEnv = {
      MISUB_DB: db,
      ADMIN_PASSWORD: 'old-password-123',
      COOKIE_SECRET: 'stable-cookie-secret',
    };

    const loginResponse = await handleLogin(
      new Request('https://example.com/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'old-password-123' }),
      }),
      initialEnv,
    );
    expect(loginResponse.status).toBe(200);
    const cookieHeader = loginResponse.headers.get('Set-Cookie').split(';')[0];

    const validDiag = await getAuthSessionDiagnostic(
      { headers: { get: (name) => (name.toLowerCase() === 'cookie' ? cookieHeader : '') } },
      initialEnv,
    );
    expect(validDiag.isAuthenticated).toBe(true);

    const rotatedEnv = {
      ...initialEnv,
      ADMIN_PASSWORD: 'new-password-456',
    };
    const invalidatedDiag = await getAuthSessionDiagnostic(
      { headers: { get: (name) => (name.toLowerCase() === 'cookie' ? cookieHeader : '') } },
      rotatedEnv,
    );
    expect(invalidatedDiag.isAuthenticated).toBe(false);
    expect(invalidatedDiag.reason).toBe('invalid_signature_or_secret');
  });

  it('compares passwords in constant time across equal and unequal inputs', async () => {
    await expect(timingSafeStringEqual('secret-abc', 'secret-abc')).resolves.toBe(true);
    await expect(timingSafeStringEqual('secret-abc', 'secret-abd')).resolves.toBe(false);
    await expect(timingSafeStringEqual('short', 'much-longer-secret')).resolves.toBe(false);
  });
});
