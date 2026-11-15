import { describe, it, expect, vi } from 'vitest';
import {
    AdminPasswordMissingError,
    getAdminPassword,
    isUsingDefaultPassword,
    setAdminPassword,
} from '../../functions/modules/utils.js';
import { handleLogin } from '../../functions/modules/auth-middleware.js';

function createKv({ get } = {}) {
    const values = new Map();
    return {
        async get(key) {
            if (get) return get(key);
            return values.get(key) ?? null;
        },
        async put(key, value) {
            values.set(key, value);
        },
        async delete(key) {
            values.delete(key);
        },
    };
}

describe('admin password fails closed when KV is unavailable', () => {
    it('does not fall back to the default password when KV read is paused', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const password = await getAdminPassword({
                MISUB_KV: createKv({
                    get: async () => {
                        throw new Error('KV storage is paused');
                    },
                }),
            }).catch((error) => error.message);
            expect(password).toBe('KV storage is paused');
        } finally {
            warn.mockRestore();
        }
    });

    it('rejects login while KV password storage is unavailable', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const env = {
            MISUB_KV: createKv({
                get: async () => {
                    throw new Error('KV storage is paused');
                },
            }),
            COOKIE_SECRET: 'test-cookie-secret',
        };
        const request = new Request('https://example.com/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'admin' }),
        });
        try {
            const response = await handleLogin(request, env);
            expect(response.status).toBe(500);
            expect(await response.json()).toMatchObject({ error: expect.any(String) });
        } finally {
            warn.mockRestore();
        }
    });

    it('rejects password changes controlled by ADMIN_PASSWORD env var', async () => {
        const kv = createKv();
        const result = await setAdminPassword(
            { ADMIN_PASSWORD: 'env-password', MISUB_KV: kv },
            'new-password'
        ).catch((error) => error.message);
        expect(result).toMatch(/环境变量 ADMIN_PASSWORD/);
        await expect(kv.get('SYSTEM_ADMIN_PASSWORD')).resolves.toBeNull();
    });

    it('still uses the default password when the KV key is genuinely absent', async () => {
        await expect(getAdminPassword({ MISUB_KV: createKv() })).resolves.toBe('admin');
    });

    it('fails closed instead of falling back to admin when KV already has business data', async () => {
        const kv = createKv();
        await kv.put('misub_subscriptions_v1', JSON.stringify([{ id: 'sub-1' }]));

        await expect(getAdminPassword({ MISUB_KV: kv })).rejects.toBeInstanceOf(
            AdminPasswordMissingError
        );
        await expect(isUsingDefaultPassword({ MISUB_KV: kv })).resolves.toBe(false);

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const response = await handleLogin(
                new Request('https://example.com/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: 'admin' }),
                }),
                { MISUB_KV: kv, COOKIE_SECRET: 'test-cookie-secret' }
            );
            expect(response.status).toBe(503);
            expect(await response.json()).toMatchObject({
                code: 'ADMIN_PASSWORD_MISSING',
                error: expect.stringContaining('ADMIN_PASSWORD'),
            });
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('fails closed if ADMIN_PASSWORD is removed after a prior non-default login', async () => {
        const kv = createKv();
        const firstLogin = await handleLogin(
            new Request('https://example.com/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'strong-secret-password' }),
            }),
            {
                MISUB_KV: kv,
                ADMIN_PASSWORD: 'strong-secret-password',
                COOKIE_SECRET: 'test-cookie-secret',
            }
        );
        expect(firstLogin.status).toBe(200);
        await expect(kv.get('SYSTEM_AUTH_INITIALIZED')).resolves.toBe('1');

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const secondLogin = await handleLogin(
                new Request('https://example.com/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: 'admin' }),
                }),
                { MISUB_KV: kv, COOKIE_SECRET: 'test-cookie-secret' }
            );
            expect(secondLogin.status).toBe(503);
            expect(await secondLogin.json()).toMatchObject({
                code: 'ADMIN_PASSWORD_MISSING',
            });
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('fails closed when D1 already has rows and ADMIN_PASSWORD is missing', async () => {
        const db = {
            prepare(sql) {
                return {
                    async first() {
                        if (sql.includes('subscriptions')) {
                            return { ok: 1 };
                        }
                        return null;
                    },
                };
            },
        };
        await expect(getAdminPassword({ MISUB_DB: db })).rejects.toBeInstanceOf(
            AdminPasswordMissingError
        );
    });
});
