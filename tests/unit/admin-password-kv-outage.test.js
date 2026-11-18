import { describe, expect, it, vi } from 'vitest';
import {
    AdminPasswordMissingError,
    getAdminPassword,
    isUsingDefaultPassword,
    setAdminPassword,
} from '../../functions/modules/utils.js';
import { handleLogin } from '../../functions/modules/auth-middleware.js';
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

describe('admin password fails closed when D1 is unavailable', () => {
    it('does not fall back to the default password when D1 read fails', async () => {
        const password = await getAdminPassword({
            MISUB_DB: createFailingD1('D1 storage is paused'),
        }).catch((error) => error.message);
        expect(password).toBe('D1 storage is paused');
    });

    it('rejects login while D1 password storage is unavailable', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const env = {
            MISUB_DB: createFailingD1('D1 storage is paused'),
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
            errorSpy.mockRestore();
        }
    });

    it('rejects password changes controlled by ADMIN_PASSWORD env var', async () => {
        const db = createMemoryD1();
        const result = await setAdminPassword(
            { ADMIN_PASSWORD: 'env-password', MISUB_DB: db },
            'new-password'
        ).catch((error) => error.message);
        expect(result).toMatch(/环境变量 ADMIN_PASSWORD/);
        expect(db.tables.settings.has('SYSTEM_ADMIN_PASSWORD')).toBe(false);
    });

    it('still uses the default password when D1 is genuinely empty', async () => {
        await expect(getAdminPassword({ MISUB_DB: createMemoryD1() })).resolves.toBe('admin');
    });

    it('persists updated admin password in D1 settings table when ADMIN_PASSWORD is unset', async () => {
        const db = createMemoryD1();
        await setAdminPassword({ MISUB_DB: db }, 'custom-d1-password');
        await expect(getAdminPassword({ MISUB_DB: db })).resolves.toBe('custom-d1-password');
        expect(db.tables.settings.get('SYSTEM_AUTH_INITIALIZED')).toBe('1');
    });

    it('fails closed if ADMIN_PASSWORD is removed after a prior non-default login', async () => {
        const db = createMemoryD1();
        const firstLogin = await handleLogin(
            new Request('https://example.com/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'strong-secret-password' }),
            }),
            {
                MISUB_DB: db,
                ADMIN_PASSWORD: 'strong-secret-password',
                COOKIE_SECRET: 'test-cookie-secret',
            }
        );
        expect(firstLogin.status).toBe(200);
        expect(db.tables.settings.get('SYSTEM_AUTH_INITIALIZED')).toBe('1');

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const secondLogin = await handleLogin(
                new Request('https://example.com/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: 'admin' }),
                }),
                { MISUB_DB: db, COOKIE_SECRET: 'test-cookie-secret' }
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
        const db = createMemoryD1({
            misub_subscriptions_v1: [{ id: 'sub-1', name: 'Sub 1' }],
        });
        await expect(getAdminPassword({ MISUB_DB: db })).rejects.toBeInstanceOf(
            AdminPasswordMissingError
        );
        await expect(isUsingDefaultPassword({ MISUB_DB: db })).resolves.toBe(false);
    });
});
