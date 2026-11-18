import { describe, expect, it, vi } from 'vitest';
import { getAuthDebugInfo, getCookieSecret } from '../../functions/modules/utils.js';
import { handleLogin } from '../../functions/modules/auth-middleware.js';

function createWriteFailingD1() {
    return {
        prepare() {
            return {
                async first() {
                    return null;
                },
                async all() {
                    return { results: [] };
                },
                async run() {
                    throw new Error('D1 write limit exceeded for the day.');
                },
                bind() {
                    return {
                        async first() {
                            return null;
                        },
                        async all() {
                            return { results: [] };
                        },
                        async run() {
                            throw new Error('D1 write limit exceeded for the day.');
                        },
                    };
                },
            };
        },
    };
}

describe('auth gracefully handles exhausted D1 write quota', () => {
    it('uses COOKIE_SECRET without failing when D1 cannot persist it', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const env = {
            MISUB_DB: createWriteFailingD1(),
            COOKIE_SECRET: 'stable-cookie-secret',
            ADMIN_PASSWORD: 'secret-password',
        };

        try {
            await expect(getCookieSecret(env)).resolves.toBe('stable-cookie-secret');
            expect(warnSpy).toHaveBeenCalledWith(
                '[Auth Storage] D1 put skipped for SYSTEM_COOKIE_SECRET: D1 write limit exceeded for the day.'
            );
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('still logs in when D1 write quota is exceeded but COOKIE_SECRET is configured', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const env = {
            MISUB_DB: createWriteFailingD1(),
            COOKIE_SECRET: 'stable-cookie-secret',
            ADMIN_PASSWORD: 'secret-password',
        };
        const request = new Request('https://example.com/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'secret-password' }),
        });

        try {
            const response = await handleLogin(request, env);
            const body = await response.json();

            expect(response.status).toBe(200);
            expect(body).toEqual({ success: true });
            expect(warnSpy).toHaveBeenCalledWith(
                '[Auth Storage] D1 put skipped for SYSTEM_COOKIE_SECRET: D1 write limit exceeded for the day.'
            );
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('auth_debug reports env COOKIE_SECRET without failing when D1 is read-only', async () => {
        const env = {
            MISUB_DB: createWriteFailingD1(),
            COOKIE_SECRET: 'stable-cookie-secret',
            ADMIN_PASSWORD: 'secret-password',
        };

        await expect(getAuthDebugInfo(env)).resolves.toMatchObject({
            hasD1: true,
            cookieSecret: {
                source: 'env',
                hasRuntime: true,
                hasD1Value: false,
            },
        });
    });

    it('reuses the same in-memory fallback secret when D1 and COOKIE_SECRET are both unavailable', async () => {
        const first = await getCookieSecret({});
        const second = await getCookieSecret({});

        expect(first).toBeTruthy();
        expect(second).toBe(first);
    });

    it('reuses the same in-memory fallback secret when D1 put fails and COOKIE_SECRET is unset', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const env = {
            MISUB_DB: createWriteFailingD1(),
        };

        try {
            const first = await getCookieSecret(env);
            const second = await getCookieSecret(env);

            expect(first).toBeTruthy();
            expect(second).toBe(first);
        } finally {
            warnSpy.mockRestore();
        }
    });
});
