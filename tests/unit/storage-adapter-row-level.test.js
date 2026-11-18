import { describe, expect, it } from 'vitest';
import { StorageFactory } from '../../functions/storage-adapter.js';

function createD1Mock({
    subscriptions = [],
    profiles = [],
    settings = [],
    queryCounts = null,
} = {}) {
    const subMap = new Map(subscriptions.map((item) => [item.id, JSON.stringify(item)]));
    const profileMap = new Map(profiles.map((item) => [item.id, JSON.stringify(item)]));
    const settingsMap = new Map(settings.map((item) => [item.key, JSON.stringify(item.value)]));

    return {
        prepare(sql) {
            const runUnboundAll = async () => {
                if (sql.includes('SELECT data FROM subscriptions')) {
                    if (queryCounts)
                        queryCounts.subscriptions = (queryCounts.subscriptions || 0) + 1;
                    return { results: Array.from(subMap.values()).map((data) => ({ data })) };
                }
                if (sql.includes('SELECT data FROM profiles')) {
                    if (queryCounts) queryCounts.profiles = (queryCounts.profiles || 0) + 1;
                    return { results: Array.from(profileMap.values()).map((data) => ({ data })) };
                }
                return { results: [] };
            };

            return {
                all: runUnboundAll,
                async run() {
                    return { success: true };
                },
                bind(...args) {
                    return {
                        async first() {
                            if (sql.includes('FROM subscriptions WHERE id = ?')) {
                                const data = subMap.get(args[0]);
                                return data ? { data } : null;
                            }
                            if (sql.includes('FROM profiles WHERE id = ?')) {
                                const data = profileMap.get(args[0]);
                                return data ? { data } : null;
                            }
                            if (sql.includes('FROM settings WHERE key = ?')) {
                                const data = settingsMap.get(args[0]);
                                return data ? { data } : null;
                            }
                            return null;
                        },
                        async all() {
                            if (sql.includes('FROM subscriptions WHERE id IN')) {
                                return {
                                    results: args
                                        .filter((id) => subMap.has(id))
                                        .map((id) => ({ data: subMap.get(id) })),
                                };
                            }
                            return { results: [] };
                        },
                        async run() {
                            if (sql.includes('INSERT OR REPLACE INTO subscriptions')) {
                                subMap.set(args[0], args[1]);
                            }
                            if (sql.includes('INSERT OR REPLACE INTO profiles')) {
                                profileMap.set(args[0], args[1]);
                            }
                            if (sql.includes('INSERT OR REPLACE INTO settings')) {
                                settingsMap.set(args[0], args[1]);
                            }
                            if (sql.includes('DELETE FROM subscriptions WHERE id = ?')) {
                                subMap.delete(args[0]);
                            }
                            if (sql.includes('DELETE FROM profiles WHERE id = ?')) {
                                profileMap.delete(args[0]);
                            }
                            return { success: true };
                        },
                    };
                },
            };
        },
    };
}

describe('Storage adapter row-level APIs', () => {
    it('supports row-level subscription/profile lookup and update on D1 adapter', async () => {
        const d1 = createD1Mock({
            subscriptions: [
                { id: 'sub-1', name: 'Sub One', url: 'https://a.example.com', nodeCount: 1 },
                { id: 'sub-2', name: 'Sub Two', url: 'https://b.example.com', nodeCount: 2 },
            ],
            profiles: [{ id: 'profile-1', customId: 'custom-1', name: 'Profile One' }],
        });

        const adapter = StorageFactory.createAdapter({ MISUB_DB: d1 });

        expect(await adapter.getSubscriptionById('sub-1')).toMatchObject({
            id: 'sub-1',
            nodeCount: 1,
        });
        expect(await adapter.getProfileById('profile-1')).toMatchObject({
            id: 'profile-1',
            name: 'Profile One',
        });
        expect(await adapter.getProfileById('custom-1')).toMatchObject({
            id: 'profile-1',
            name: 'Profile One',
        });
        expect(await adapter.getAllSubscriptions()).toHaveLength(2);
        expect(await adapter.getAllProfiles()).toHaveLength(1);

        const related = await adapter.getSubscriptionsByIds(['sub-2', 'sub-1']);
        expect(related.map((item) => item.id).sort()).toEqual(['sub-1', 'sub-2']);

        await adapter.updateSubscriptionById('sub-2', (current) => ({ ...current, nodeCount: 9 }));
        expect(await adapter.getSubscriptionById('sub-2')).toMatchObject({
            id: 'sub-2',
            nodeCount: 9,
        });

        await adapter.putSubscription({
            id: 'sub-3',
            name: 'Sub Three',
            url: 'https://c.example.com',
            nodeCount: 0,
        });
        expect(await adapter.getSubscriptionById('sub-3')).toMatchObject({
            id: 'sub-3',
            name: 'Sub Three',
        });

        await adapter.putProfile({ id: 'profile-2', customId: 'custom-2', name: 'Profile Two' });
        expect(await adapter.getProfileById('profile-2')).toMatchObject({
            id: 'profile-2',
            name: 'Profile Two',
        });

        expect(await adapter.deleteSubscriptionById('sub-1')).toBe(true);
        expect(await adapter.getSubscriptionById('sub-1')).toBeNull();

        expect(await adapter.deleteProfileById('profile-1')).toBe(true);
        expect(await adapter.getProfileById('profile-1')).toBeNull();
    });

    it('caches D1 collection reads and invalidates them after writes', async () => {
        const queryCounts = {};
        const d1 = createD1Mock({
            subscriptions: [{ id: 'sub-1', name: 'Sub One' }],
            profiles: [{ id: 'profile-1', name: 'Profile One' }],
            queryCounts,
        });
        const firstAdapter = StorageFactory.createAdapter({ MISUB_DB: d1 });
        const secondAdapter = StorageFactory.createAdapter({ MISUB_DB: d1 });

        const [firstSubs, secondSubs] = await Promise.all([
            firstAdapter.getAllSubscriptions(),
            secondAdapter.getAllSubscriptions(),
        ]);
        expect(firstSubs).toHaveLength(1);
        expect(secondSubs).toHaveLength(1);
        expect(queryCounts.subscriptions).toBe(1);

        await firstAdapter.getAllProfiles();
        await secondAdapter.getAllProfiles();
        expect(queryCounts.profiles).toBe(1);

        await firstAdapter.putSubscription({ id: 'sub-2', name: 'Sub Two' });
        expect(await secondAdapter.getAllSubscriptions()).toHaveLength(2);
        expect(queryCounts.subscriptions).toBe(2);

        await firstAdapter.putProfile({ id: 'profile-2', name: 'Profile Two' });
        expect(await secondAdapter.getAllProfiles()).toHaveLength(2);
        expect(queryCounts.profiles).toBe(2);
    });

    it('syncs full collection put/get calls into row-level D1 records without main rows', async () => {
        const d1 = createD1Mock({
            subscriptions: [{ id: 'old-sub', name: 'Old Sub' }],
        });
        const adapter = StorageFactory.createAdapter({ MISUB_DB: d1 });

        await adapter.put('misub_subscriptions_v1', [{ id: 'new-sub', name: 'New Sub' }]);
        expect(await adapter.getSubscriptionById('old-sub')).toBeNull();
        expect(await adapter.getSubscriptionById('new-sub')).toMatchObject({
            id: 'new-sub',
            name: 'New Sub',
        });
        expect(await adapter.get('misub_subscriptions_v1')).toEqual([
            { id: 'new-sub', name: 'New Sub' },
        ]);
    });
});
