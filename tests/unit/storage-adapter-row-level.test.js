import { describe, expect, it } from 'vitest';
import { StorageFactory } from '../../functions/storage-adapter.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

describe('Storage adapter multi-table D1 APIs', () => {
    it('routes remote subscriptions to subscriptions table and manual nodes to nodes table', async () => {
        const db = createMemoryD1({
            misub_subscriptions_v1: [
                { id: 'sub-1', name: 'Sub One', url: 'https://a.example.com/sub', nodeCount: 1 },
                { id: 'node-1', name: 'Node One', url: 'vless://uuid@example.com:443#Node1' },
            ],
            misub_profiles_v1: [{ id: 'profile-1', customId: 'custom-1', name: 'Profile One' }],
        });

        const adapter = StorageFactory.createAdapter({ MISUB_DB: db });

        expect(db.tables.subscriptions.has('sub-1')).toBe(true);
        expect(db.tables.subscriptions.has('node-1')).toBe(false);
        expect(db.tables.nodes.has('node-1')).toBe(true);

        expect(await adapter.getRemoteSubscriptions()).toHaveLength(1);
        expect(await adapter.getManualNodes()).toHaveLength(1);
        expect(await adapter.getAllSubscriptions()).toHaveLength(2);

        expect(await adapter.getSubscriptionById('sub-1')).toMatchObject({ id: 'sub-1' });
        expect(await adapter.getSubscriptionById('node-1')).toMatchObject({ id: 'node-1' });
        expect(await adapter.getProfileById('custom-1')).toMatchObject({ id: 'profile-1' });

        const related = await adapter.getSubscriptionsByIds(['node-1', 'sub-1']);
        expect(related.map((item) => item.id).sort()).toEqual(['node-1', 'sub-1']);

        await adapter.putSubscription({
            id: 'node-2',
            name: 'Node Two',
            url: 'ss://method:pass@1.1.1.1:8388#Node2',
        });
        expect(db.tables.nodes.has('node-2')).toBe(true);
        expect(db.tables.subscriptions.has('node-2')).toBe(false);

        expect(await adapter.deleteSubscriptionById('node-1')).toBe(true);
        expect(await adapter.getSubscriptionById('node-1')).toBeNull();
    });

    it('stores guestbook messages in dedicated guestbook table and increments profile downloadCount in profiles table', async () => {
        const db = createMemoryD1({
            misub_profiles_v1: [{ id: 'p-1', customId: 'vip', name: 'VIP', downloadCount: 3 }],
        });
        const adapter = StorageFactory.createAdapter({ MISUB_DB: db });

        await adapter.putGuestbookMessage({
            id: 'msg-1',
            nickname: 'Alice',
            content: 'Hello',
            createdAt: '2026-11-18T10:00:00.000Z',
        });
        expect(db.tables.guestbook.has('msg-1')).toBe(true);
        expect(db.tables.settings.size).toBe(0);
        expect(await adapter.getAllGuestbookMessages()).toHaveLength(1);

        const nextCount = await adapter.incrementProfileDownloadCount('vip');
        expect(nextCount).toBe(4);
        expect((await adapter.getProfileById('p-1')).downloadCount).toBe(4);
        expect(db.tables.settings.size).toBe(0);
    });

    it('separates settings, cache, and logs into dedicated D1 tables', async () => {
        const db = createMemoryD1();
        const adapter = StorageFactory.createAdapter({ MISUB_DB: db });

        await adapter.put('worker_settings_v1', { FileName: 'MiSub' });
        await adapter.put('node_cache_profile_p1', { nodes: 'ss://a', timestamp: Date.now() });
        await adapter.put('cron_last_execution', { timestamp: new Date().toISOString() });
        await adapter.put('misub_restore_snapshot_latest', { version: 1 });
        await adapter.put('misub_system_logs:2026-11-18', [{ id: 'log-1' }]);

        expect(Array.from(db.tables.settings.keys())).toEqual(['main']);
        expect(db.tables.cache.has('node_cache_profile_p1')).toBe(true);
        expect(db.tables.cache.has('cron_last_execution')).toBe(true);
        expect(db.tables.cache.has('misub_restore_snapshot_latest')).toBe(true);
        expect(db.tables.logs.has('misub_system_logs:2026-11-18')).toBe(true);
    });

    it('cascades cleanup of node caches when deleting profiles or subscriptions', async () => {
        const db = createMemoryD1({
            misub_profiles_v1: [{ id: 'p-1', customId: 'vip', name: 'VIP' }],
            misub_subscriptions_v1: [
                { id: 'sub-1', name: 'Sub 1', url: 'https://a.example.com/sub' },
            ],
            node_cache_profile_vip: { nodes: 'a', timestamp: Date.now() },
            'node_cache_profile_p-1': { nodes: 'b', timestamp: Date.now() },
            'node_cache_subscription_sub-1': { nodes: ['ss://1'], sourceId: 'sub-1' },
        });
        const adapter = StorageFactory.createAdapter({ MISUB_DB: db });

        await adapter.deleteProfileById('p-1');
        expect(db.tables.cache.has('node_cache_profile_vip')).toBe(false);
        expect(db.tables.cache.has('node_cache_profile_p-1')).toBe(false);

        await adapter.deleteSubscriptionById('sub-1');
        expect(db.tables.cache.has('node_cache_subscription_sub-1')).toBe(false);
    });

    it('cleanupMaintenance migrates manual nodes, guestbook, download counts, and logs into their dedicated tables', async () => {
        const now = 1_800_000_000_000;
        const db = createMemoryD1({
            misub_profiles_v1: [{ id: 'active-profile', name: 'Active', downloadCount: 1 }],
            worker_settings_v1: { FileName: 'MiSub' },
        });

        // 模拟历史混放在 subscriptions 表中的手动节点
        db.tables.subscriptions.set(
            'legacy-node-1',
            JSON.stringify({
                id: 'legacy-node-1',
                name: 'Legacy Node',
                url: 'tuic://token@example.com:443#Legacy',
            })
        );
        db.tables.subscriptions.set(
            'remote-sub-1',
            JSON.stringify({
                id: 'remote-sub-1',
                name: 'Airport',
                url: 'https://airport.example.com/sub',
            })
        );

        // 模拟历史混放在 settings 表中的留言、下载计数、日志、旧缓存
        db.tables.settings.set('misub_guestbook_v1_index', JSON.stringify(['g-1']));
        db.tables.settings.set(
            'misub_guestbook_v1:item:g-1',
            JSON.stringify({ id: 'g-1', nickname: 'Bob', content: 'Hi' })
        );
        db.tables.settings.set('misub_profile_download_count_active-profile', '12');
        db.tables.settings.set('misub_profile_download_count_deleted-profile', '2');
        db.tables.settings.set('node_cache_profile_legacy', JSON.stringify({ nodes: 'old' }));
        db.tables.settings.set('misub_system_logs:2026-11-15', JSON.stringify([{ id: 'l1' }]));

        // 模拟 cache 表里的过期条目
        db.tables.cache.set(
            'tg_push_rate:u1:min',
            JSON.stringify({ count: 1, expiresAt: now - 1000 })
        );
        db.tables.cache.set(
            'github_release_fresh/repo',
            JSON.stringify({ data: {}, timestamp: now - 1000 })
        );

        const adapter = StorageFactory.createAdapter({ MISUB_DB: db });
        const stats = await adapter.cleanupMaintenance({ now });

        expect(stats).toEqual({
            migratedNodes: 1,
            migratedGuestbook: 1,
            mergedDownloadCounts: 1,
            migratedLogs: 1,
            removedSettingsClutter: 2,
            removedOrphanCounts: 1,
            removedExpiredCache: 1,
        });

        // subscriptions 仅剩远程订阅，手动节点已归入 nodes 表
        expect(Array.from(db.tables.subscriptions.keys())).toEqual(['remote-sub-1']);
        expect(Array.from(db.tables.nodes.keys())).toEqual(['legacy-node-1']);

        // 留言已归入 guestbook 表，下载计数已合并进 profiles 表，日志已归入 logs 表
        expect(Array.from(db.tables.guestbook.keys())).toEqual(['g-1']);
        expect((await adapter.getProfileById('active-profile')).downloadCount).toBe(12);
        expect(db.tables.logs.has('misub_system_logs:2026-11-15')).toBe(true);

        // settings 表彻底干净，只剩 main
        expect(Array.from(db.tables.settings.keys())).toEqual(['main']);
        expect(Array.from(db.tables.cache.keys())).toEqual(['github_release_fresh/repo']);
    });
});
