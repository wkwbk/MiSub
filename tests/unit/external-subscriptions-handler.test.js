import { describe, expect, it } from 'vitest';
import { handleApiRequest } from '../../functions/modules/api-router.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

function createEnv({ settings = {}, subscriptions = [], profiles = [] } = {}) {
    return {
        MISUB_DB: createMemoryD1({
            worker_settings_v1: {
                externalApi: { enabled: true, tokens: [{ name: 'default', token: 'misub_ok' }] },
                ...settings,
            },
            misub_subscriptions_v1: subscriptions,
            misub_profiles_v1: profiles,
        }),
        COOKIE_SECRET: 'stable-cookie-secret',
        ADMIN_PASSWORD: 'secret-password',
    };
}

function createRequest(path, { method = 'GET', body } = {}) {
    return new Request(`https://example.com/api/ext/v1${path}`, {
        method,
        headers: {
            Authorization: 'Bearer misub_ok',
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}

describe('external subscriptions handler', () => {
    it('lists only remote subscriptions on /subscriptions', async () => {
        const env = createEnv({
            subscriptions: [
                {
                    id: 'sub-1',
                    name: 'Airport A',
                    url: 'https://example.com/sub-a',
                    enabled: true,
                    tags: ['A'],
                },
                {
                    id: 'node-1',
                    name: 'HK 01',
                    url: 'vless://uuid@example.com:443#HK01',
                    enabled: true,
                    tags: ['HK'],
                },
            ],
        });

        const response = await handleApiRequest(createRequest('/subscriptions?tag=A'), env);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toMatchObject({ id: 'sub-1', type: 'subscription', tags: ['A'] });
        expect(body.data[0]).not.toHaveProperty('protocol');
        expect(body.data[0]).not.toHaveProperty('group');
    });

    it('creates a remote subscription and rejects node protocols on subscription endpoints', async () => {
        const env = createEnv();

        const created = await handleApiRequest(
            createRequest('/subscriptions', {
                method: 'POST',
                body: { name: 'Airport B', url: 'https://example.com/sub-b' },
            }),
            env
        );
        const createdBody = await created.json();

        expect(created.status).toBe(201);
        expect(createdBody.data).toMatchObject({
            type: 'subscription',
            name: 'Airport B',
            url: 'https://example.com/sub-b',
        });

        const invalid = await handleApiRequest(
            createRequest('/subscriptions', {
                method: 'POST',
                body: { name: 'Bad Node', url: 'vless://uuid@example.com:443#Bad' },
            }),
            env
        );
        const invalidBody = await invalid.json();

        expect(invalid.status).toBe(400);
        expect(invalidBody.error.code).toBe('invalid_subscription_url');
    });

    it('deletes subscriptions and removes them from profile subscription references', async () => {
        const env = createEnv({
            subscriptions: [
                { id: 'sub-1', name: 'Airport A', url: 'https://example.com/sub-a', enabled: true },
                { id: 'sub-2', name: 'Airport B', url: 'https://example.com/sub-b', enabled: true },
            ],
            profiles: [
                { id: 'profile-1', name: 'Main', subscriptions: ['sub-1'], manualNodes: [] },
                {
                    id: 'profile-2',
                    name: 'Backup',
                    subscriptions: ['sub-1', 'sub-2'],
                    manualNodes: [],
                },
            ],
        });

        const response = await handleApiRequest(
            createRequest('/subscriptions/sub-1', { method: 'DELETE' }),
            env
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.data.deleted).toBe(true);
        expect(body.data.removedFromProfiles).toEqual(['profile-1', 'profile-2']);

        const profilesResponse = await handleApiRequest(createRequest('/profiles'), env);
        const profilesBody = await profilesResponse.json();
        expect(profilesBody.data).toEqual([
            expect.objectContaining({ id: 'profile-1', subscriptionIds: [], manualNodeIds: [] }),
            expect.objectContaining({
                id: 'profile-2',
                subscriptionIds: ['sub-2'],
                manualNodeIds: [],
            }),
        ]);
    });
});
