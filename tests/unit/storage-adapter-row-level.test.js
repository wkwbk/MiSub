import { describe, expect, it, vi } from 'vitest';
import { StorageFactory } from '../../functions/storage-adapter.js';
import { handleMisubRequest } from '../../functions/modules/subscription/main-handler.js';
import { handleErrorReportRequest } from '../../functions/modules/handlers/error-report-handler.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

describe('Storage adapter 8-table D1 architecture & query optimizations', () => {
  it('routes remote subscriptions to subscriptions table, manual nodes to nodes table, and resolves getProfileSources directly', async () => {
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

    expect(await adapter.getProfileById('custom-1')).toMatchObject({ id: 'profile-1' });

    const sources = await adapter.getProfileSources(['sub-1'], ['node-1']);
    expect(sources.map((item) => item.id).sort()).toEqual(['node-1', 'sub-1']);

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

  it('stores guestbook in dedicated table and atomically increments profile downloadCount via custom_id', async () => {
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

  it('stores access_logs and error_reports as dedicated row-level tables and populates cache.expires_at', async () => {
    const now = Date.now();
    const db = createMemoryD1();
    const adapter = StorageFactory.createAdapter({ MISUB_DB: db });

    await adapter.put('worker_settings_v1', { FileName: 'MiSub' });
    await adapter.put('node_cache_profile_p1', { nodes: 'ss://a', timestamp: now });
    await adapter.put('node_cache_subscription_s1', { nodes: ['ss://b'], sourceId: 's1' });
    await adapter.put('cron_last_execution', { timestamp: new Date(now).toISOString() });

    await adapter.insertAccessLogs([
      { id: 'log-1', timestamp: now - 1000, status: 'success', domain: 'a.example.com' },
      { id: 'log-2', timestamp: now, status: 'error', domain: 'b.example.com' },
    ]);

    const errResp = await handleErrorReportRequest(
      new Request('https://example.com/api/error_report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Boom', context: 'unit-test' }),
      }),
      { MISUB_DB: db },
    );
    expect(errResp.status).toBe(200);

    expect(Array.from(db.tables.settings.keys())).toEqual(['main']);
    expect(db.cacheExpiresAt.get('node_cache_profile_p1')).toBeGreaterThan(now);
    expect(db.cacheExpiresAt.get('node_cache_subscription_s1')).toBeNull();
    expect(db.tables.access_logs.size).toBe(2);
    expect(db.tables.error_reports.size).toBe(1);

    const logs = await adapter.getAccessLogs({ limit: 10 });
    expect(logs.map((l) => l.id)).toEqual(['log-2', 'log-1']);

    const reports = await adapter.getErrorReports(10);
    expect(reports[0]).toMatchObject({ message: 'Boom', context: 'unit-test' });
  });

  it('clears only access_logs matching profileName when specified', async () => {
    const now = Date.now();
    const db = createMemoryD1();
    const adapter = StorageFactory.createAdapter({ MISUB_DB: db });

    await adapter.insertAccessLogs([
      { id: 'log-a1', timestamp: now - 2000, profileName: 'Share A', status: 'success' },
      { id: 'log-b1', timestamp: now - 1000, profileName: 'Share B', status: 'success' },
      { id: 'log-a2', timestamp: now, profileName: 'Share A', status: 'error' },
    ]);

    await adapter.clearAccessLogs({ profileName: 'Share A' });

    const remaining = await adapter.getAccessLogs({ limit: 10 });
    expect(remaining.map((l) => l.id)).toEqual(['log-b1']);

    await adapter.clearAccessLogs();
    expect(await adapter.getAccessLogs({ limit: 10 })).toEqual([]);
  });

  it('cascades cleanup of node caches when deleting profiles or subscriptions', async () => {
    const db = createMemoryD1({
      misub_profiles_v1: [{ id: 'p-1', customId: 'vip', name: 'VIP' }],
      misub_subscriptions_v1: [{ id: 'sub-1', name: 'Sub 1', url: 'https://a.example.com/sub' }],
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

  it('cleanupMaintenance migrates manual nodes, guestbook, download counts, and legacy logs into 8-table schema', async () => {
    const now = 1_800_000_000_000;
    const db = createMemoryD1({
      misub_profiles_v1: [{ id: 'active-profile', name: 'Active', downloadCount: 1 }],
      worker_settings_v1: { FileName: 'MiSub' },
    });

    db.tables.subscriptions.set(
      'legacy-node-1',
      JSON.stringify({
        id: 'legacy-node-1',
        name: 'Legacy Node',
        url: 'tuic://token@example.com:443#Legacy',
      }),
    );
    db.tables.subscriptions.set(
      'remote-sub-1',
      JSON.stringify({
        id: 'remote-sub-1',
        name: 'Airport',
        url: 'https://airport.example.com/sub',
      }),
    );

    db.tables.settings.set('misub_guestbook_v1_index', JSON.stringify(['g-1']));
    db.tables.settings.set(
      'misub_guestbook_v1:item:g-1',
      JSON.stringify({ id: 'g-1', nickname: 'Bob', content: 'Hi' }),
    );
    db.tables.settings.set('misub_profile_download_count_active-profile', '12');
    db.tables.settings.set('misub_profile_download_count_deleted-profile', '2');
    db.tables.settings.set('node_cache_profile_legacy', JSON.stringify({ nodes: 'old' }));
    db.tables.settings.set('misub_system_logs:2026-11-15', JSON.stringify([{ id: 'l1', timestamp: now - 5000 }]));

    // 模拟过渡期遗留的旧 logs 键值表
    db.tables.logs.set(
      'misub_error_reports',
      JSON.stringify([{ id: 'err-1', message: 'Legacy crash', receivedAt: now - 3000 }]),
    );

    // 模拟已带 expires_at 的过期缓存行 + 未回填 expires_at 的新鲜缓存行
    const adapter = StorageFactory.createAdapter({ MISUB_DB: db });
    await adapter.put('tg_push_rate:u1:min', { count: 1, expiresAt: now - 1000 });
    db.tables.cache.set('github_release_fresh/repo', JSON.stringify({ data: {}, timestamp: now - 1000 }));
    db.cacheExpiresAt.set('github_release_fresh/repo', null);

    const stats = await adapter.cleanupMaintenance({ now });

    expect(stats).toEqual({
      migratedNodes: 1,
      migratedGuestbook: 1,
      mergedDownloadCounts: 1,
      migratedLogs: 1,
      migratedErrorReports: 1,
      removedSettingsClutter: 2,
      removedOrphanCounts: 1,
      removedExpiredCache: 1,
    });

    expect(Array.from(db.tables.subscriptions.keys())).toEqual(['remote-sub-1']);
    expect(Array.from(db.tables.nodes.keys())).toEqual(['legacy-node-1']);
    expect(Array.from(db.tables.guestbook.keys())).toEqual(['g-1']);
    expect((await adapter.getProfileById('active-profile')).downloadCount).toBe(12);
    expect(db.tables.access_logs.has('l1')).toBe(true);
    expect(db.tables.error_reports.has('err-1')).toBe(true);
    expect(db.tables.logs.size).toBe(0);

    expect(Array.from(db.tables.settings.keys())).toEqual(['main']);
    expect(Array.from(db.tables.cache.keys())).toEqual(['github_release_fresh/repo']);
    expect(db.cacheExpiresAt.get('github_release_fresh/repo')).toBeGreaterThan(now);
  });

  it('avoids full-table scans on subscription group pull and invalid-token / disguise requests', async () => {
    const db = createMemoryD1({
      worker_settings_v1: {
        mytoken: 'admin-token',
        profileToken: 'profiles',
        enableFlagEmoji: false,
        enableTrafficNode: false,
        disguise: { enabled: true, pageType: 'default' },
      },
      misub_subscriptions_v1: [
        {
          id: 'node-target',
          name: 'TargetNode',
          url: 'ss://YWVzLTI1Ni1nY206cGFzcw@1.1.1.1:8388#Target',
          enabled: true,
        },
        {
          id: 'node-unused',
          name: 'UnusedNode',
          url: 'ss://YWVzLTI1Ni1nY206cGFzcw@2.2.2.2:8388#Unused',
          enabled: true,
        },
      ],
      misub_profiles_v1: [
        {
          id: 'prof-1',
          customId: 'my-vip',
          name: 'My VIP',
          enabled: true,
          subscriptions: [],
          manualNodes: ['node-target'],
        },
        {
          id: 'prof-2',
          customId: 'other',
          name: 'Other',
          enabled: true,
          subscriptions: [],
          manualNodes: ['node-unused'],
        },
      ],
    });

    const prepareSpy = vi.spyOn(db, 'prepare');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      // 1. 浏览器伪装页请求：仅读 settings，绝不扫描 profiles / subscriptions / nodes
      const disguiseResp = await handleMisubRequest({
        request: new Request('https://example.com/profiles/my-vip', {
          headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' },
        }),
        env: { MISUB_DB: db },
        waitUntil: vi.fn(),
      });
      expect(disguiseResp.status).toBe(404);
      const disguiseSqls = prepareSpy.mock.calls.map((c) => c[0]);
      expect(disguiseSqls.some((sql) => /FROM (profiles|subscriptions|nodes)/i.test(sql))).toBe(false);

      prepareSpy.mockClear();

      // 2. 单订阅组拉取请求：通过 custom_id 精准单行读取 profile 与关联的 manualNodes，不触发全表 SELECT data FROM profiles/subscriptions/nodes
      const subResp = await handleMisubRequest({
        request: new Request('https://example.com/profiles/my-vip?target=nodes', {
          headers: { 'User-Agent': 'ClashMeta' },
        }),
        env: { MISUB_DB: db },
        waitUntil: vi.fn(),
      });
      expect(subResp.status).toBe(200);
      const subSqls = prepareSpy.mock.calls.map((c) => c[0].replace(/\s+/g, ' ').trim());
      expect(subSqls.some((sql) => /^SELECT data FROM (profiles|subscriptions|nodes)$/i.test(sql))).toBe(false);
      expect(subSqls.some((sql) => /FROM profiles WHERE id = \? OR custom_id = \?/i.test(sql))).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('batches putAllSubscriptions/putAllProfiles via db.batch and diffs unchanged rows in syncAllSubscriptions', async () => {
    const db = createMemoryD1({
      misub_subscriptions_v1: [
        { id: 'sub-1', name: 'Sub 1', url: 'https://a.example.com/sub' },
        { id: 'node-1', name: 'Node 1', url: 'vless://u@1.1.1.1:443#N1' },
      ],
      misub_profiles_v1: [{ id: 'p-1', customId: 'c1', name: 'Profile 1' }],
    });

    const adapter = StorageFactory.createAdapter({ MISUB_DB: db });
    const batchSpy = vi.spyOn(db, 'batch');

    await adapter.putAllSubscriptions([
      { id: 'sub-2', name: 'Sub 2', url: 'https://b.example.com/sub' },
      { id: 'node-2', name: 'Node 2', url: 'ss://YWVz@2.2.2.2:8388#N2' },
    ]);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(db.tables.subscriptions.has('sub-2')).toBe(true);
    expect(db.tables.nodes.has('node-2')).toBe(true);

    batchSpy.mockClear();
    const currentSubs = await adapter.getAllSubscriptions();
    // Syncing identical items should skip all writes
    await adapter.syncAllSubscriptions(currentSubs);
    expect(batchSpy).not.toHaveBeenCalled();

    // Changing 1 item and removing 1 item should execute in a single batch without redundant cross-table deletes
    const nextSubs = currentSubs
      .filter((item) => item.id !== 'node-2')
      .map((item) => (item.id === 'sub-1' ? { ...item, name: 'Sub 1 Renamed' } : item));
    await adapter.syncAllSubscriptions(nextSubs);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    // 1 upsert for sub-1 + 1 delete from nodes for node-2 (no cross-table delete for sub-1 or subscriptions/cache for node-2)
    expect(batchSpy.mock.calls[0][0]).toHaveLength(2);
    expect(db.tables.nodes.has('node-2')).toBe(false);
    expect((await adapter.getSubscriptionById('sub-1')).name).toBe('Sub 1 Renamed');

    // Syncing items with identical content but different JSON key order should skip all writes
    batchSpy.mockClear();
    const reorderedSubs = (await adapter.getAllSubscriptions()).map((item) => ({
      url: item.url,
      name: item.name,
      id: item.id,
    }));
    await adapter.syncAllSubscriptions(reorderedSubs);
    expect(batchSpy).not.toHaveBeenCalled();
  });
});
