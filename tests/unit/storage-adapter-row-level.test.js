import { describe, expect, it, vi } from 'vitest';
import { StorageFactory } from '../../functions/storage-adapter.js';
import { LATEST_SCHEMA_VERSION, runD1Migrations } from '../../functions/storage/d1-schema.js';
import { handleMisubRequest } from '../../functions/modules/subscription/core/main-handler.js';
import { handleErrorReportRequest } from '../../functions/modules/handlers/error-report-handler.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

describe('Storage adapter 8-table D1 architecture & query optimizations', () => {
  it('routes remote subscriptions to subscriptions table, manual nodes to nodes table, and resolves getProfileSources directly', async () => {
    const db = createMemoryD1({
      subscriptions: [
        { id: 'sub-1', name: 'Sub One', url: 'https://a.example.com/sub', nodeCount: 1 },
        { id: 'node-1', name: 'Node One', url: 'vless://uuid@example.com:443#Node1' },
      ],
      profiles: [{ id: 'profile-1', customId: 'custom-1', name: 'Profile One' }],
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
      profiles: [{ id: 'p-1', customId: 'vip', name: 'VIP', downloadCount: 3 }],
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

    await adapter.put('main', { fileName: 'MiSub' });
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
      profiles: [{ id: 'p-1', customId: 'vip', name: 'VIP' }],
      subscriptions: [{ id: 'sub-1', name: 'Sub 1', url: 'https://a.example.com/sub' }],
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

  it('cleanupMaintenance removes expired and orphan cache entries and backfills missing expires_at', async () => {
    const now = 1_800_000_000_000;
    const db = createMemoryD1({
      profiles: [{ id: 'active-profile', name: 'Active', downloadCount: 1 }],
      main: { fileName: 'MiSub' },
    });

    const adapter = StorageFactory.createAdapter({ MISUB_DB: db });
    await adapter.put('tg_push_rate:u1:min', { count: 1, expiresAt: now - 1000 });
    db.tables.cache.set('node_cache_profile_deleted-profile', JSON.stringify({ nodes: 'orphan' }));
    db.cacheExpiresAt.set('node_cache_profile_deleted-profile', null);
    db.tables.cache.set('github_release_fresh/repo', JSON.stringify({ data: {}, timestamp: now - 1000 }));
    db.cacheExpiresAt.set('github_release_fresh/repo', null);

    const prepareSpy = vi.spyOn(db, 'prepare');
    const batchSpy = vi.spyOn(db, 'batch');
    const stats = await adapter.cleanupMaintenance({ now });

    expect(stats).toEqual({
      removedExpiredCache: 2,
    });
    expect(Array.from(db.tables.cache.keys())).toEqual(['github_release_fresh/repo']);
    expect(db.cacheExpiresAt.get('github_release_fresh/repo')).toBeGreaterThan(now);

    const executedSqls = prepareSpy.mock.calls.map((c) => c[0]);
    expect(executedSqls.some((sql) => /^\s*(CREATE|ALTER)\s+/i.test(sql))).toBe(false);
    expect(batchSpy.mock.calls.flatMap((c) => c[0]).length).toBeGreaterThan(0);
  });

  it('initializes an empty D1 database from v0 -> v1 -> v2 on first storage access', async () => {
    const emptyDb = createMemoryD1({}, { userVersion: 0 });
    expect(emptyDb.existingTables.size).toBe(0);
    expect(emptyDb.getUserVersion()).toBe(0);

    const adapter = StorageFactory.createAdapter({ MISUB_DB: emptyDb });
    const created = await adapter.putSubscription({
      id: 'sub-init-1',
      name: 'Init Sub',
      url: 'https://init.example.com/sub',
    });

    expect(emptyDb.getUserVersion()).toBe(LATEST_SCHEMA_VERSION);
    for (const tbl of ['subscriptions', 'nodes', 'profiles', 'guestbook', 'settings', 'cache', 'access_logs', 'error_reports']) {
      expect(emptyDb.existingTables.has(tbl)).toBe(true);
    }
    expect(emptyDb.existingColumns.has('subscriptions.config_version')).toBe(true);
    expect(emptyDb.existingColumns.has('nodes.config_version')).toBe(true);
    expect(emptyDb.existingColumns.has('profiles.config_version')).toBe(true);
    expect(created.configVersion).toBe(1);

    const casRes = await adapter.compareAndSwapSubscription({ ...created, name: 'Init Sub Updated' }, 1);
    expect(casRes.updated).toBe(true);
    expect(casRes.current).toMatchObject({ id: 'sub-init-1', name: 'Init Sub Updated', configVersion: 2 });
  });

  it('migrates legacy v1 D1 database to v2 and backfills historical config_version without running v1 DDL', async () => {
    const legacyV1Db = createMemoryD1(
      {
        subscriptions: [
          { id: 's-ver', name: 'Legacy V4', url: 'https://a.example.com/sub', version: 4 },
          { id: 's-cv', name: 'Legacy CV3', url: 'https://b.example.com/sub', configVersion: 3 },
          { id: 'n-def', name: 'Default Node', url: 'trojan://pw@1.2.3.4:443#N' },
        ],
        profiles: [{ id: 'p-ver', name: 'Legacy Prof V5', version: 5 }],
      },
      { userVersion: 1 },
    );
    expect(legacyV1Db.getUserVersion()).toBe(1);
    expect(legacyV1Db.existingColumns.has('subscriptions.config_version')).toBe(false);

    const prepareSpy = vi.spyOn(legacyV1Db, 'prepare');
    const adapter = StorageFactory.createAdapter({ MISUB_DB: legacyV1Db });

    const subs = await adapter.getAllSubscriptions({ fresh: true });
    const profs = await adapter.getAllProfiles({ fresh: true });

    expect(legacyV1Db.getUserVersion()).toBe(2);
    expect(subs.find((s) => s.id === 's-ver')?.configVersion).toBe(4);
    expect(subs.find((s) => s.id === 's-cv')?.configVersion).toBe(3);
    expect(subs.find((s) => s.id === 'n-def')?.configVersion).toBe(1);
    expect(profs[0]?.configVersion).toBe(5);

    const executedSqls = prepareSpy.mock.calls.map((c) => c[0].replace(/\s+/g, ' ').trim());
    expect(executedSqls.some((sql) => /^CREATE TABLE/i.test(sql))).toBe(false);
    expect(executedSqls.some((sql) => /^ALTER TABLE subscriptions ADD COLUMN config_version/i.test(sql))).toBe(true);
    expect(executedSqls.some((sql) => /^PRAGMA user_version = 2/i.test(sql))).toBe(true);
  });

  it('skips duplicate column errors when Wrangler already applied migrations, yet rethrows real DDL errors', async () => {
    const wranglerMigratedDb = createMemoryD1(
      {
        subscriptions: [{ id: 's-w1', name: 'Wrangler Sub', url: 'https://w.example.com/sub', version: 3 }],
      },
      {
        userVersion: 0,
        existingTables: [
          'subscriptions',
          'nodes',
          'profiles',
          'guestbook',
          'settings',
          'cache',
          'access_logs',
          'error_reports',
        ],
        hasConfigVersionColumns: true,
      },
    );
    wranglerMigratedDb.existingColumns.add('profiles.custom_id');
    wranglerMigratedDb.existingColumns.add('profiles.link_id');
    wranglerMigratedDb.existingColumns.add('cache.expires_at');

    await runD1Migrations(wranglerMigratedDb);
    expect(wranglerMigratedDb.getUserVersion()).toBe(LATEST_SCHEMA_VERSION);
    const adapter = StorageFactory.createAdapter({ MISUB_DB: wranglerMigratedDb });
    expect((await adapter.getSubscriptionById('s-w1'))?.configVersion).toBe(3);

    const brokenAlterDb = {
      prepare(sql) {
        return {
          async first() {
            if (/^PRAGMA\s+user_version/i.test(sql)) return { user_version: 1 };
            return null;
          },
          async run() {
            if (/^ALTER TABLE/i.test(sql)) {
              throw new Error('SQLITE_AUTH: disk I/O error');
            }
            return { success: true };
          },
        };
      },
    };
    await expect(runD1Migrations(brokenAlterDb)).rejects.toThrow('SQLITE_AUTH: disk I/O error');
  });

  it('runs zero DDL on v2 databases, caches migration state per isolate, deduplicates concurrent calls, and does not cache failures', async () => {
    // 1. Up-to-date v2 DB: first access checks PRAGMA user_version once with zero DDL, second access does zero queries
    const freshV2Db = createMemoryD1({}, { userVersion: 2 });
    const prepareSpy = vi.spyOn(freshV2Db, 'prepare');

    await runD1Migrations(freshV2Db);
    expect(prepareSpy.mock.calls.map((c) => c[0])).toEqual(['PRAGMA user_version']);

    prepareSpy.mockClear();
    await runD1Migrations(freshV2Db);
    expect(prepareSpy).not.toHaveBeenCalled();

    // 2. Concurrent cold-start callers share one in-flight migration promise
    const concurrentDb = createMemoryD1({}, { userVersion: 2 });
    const concurrentPrepareSpy = vi.spyOn(concurrentDb, 'prepare');
    await Promise.all([runD1Migrations(concurrentDb), runD1Migrations(concurrentDb), runD1Migrations(concurrentDb)]);
    expect(concurrentPrepareSpy).toHaveBeenCalledTimes(1);

    // 3. Failure must not poison migratedDatabases cache
    let shouldFail = true;
    let fakeVersion = 0;
    const flakyDb = {
      prepare(sql) {
        return {
          async first() {
            if (shouldFail) throw new Error('D1 transient failure');
            if (/^PRAGMA\s+user_version/i.test(sql)) return { user_version: fakeVersion };
            return null;
          },
          async run() {
            if (shouldFail) throw new Error('D1 transient failure');
            const m = sql.match(/^PRAGMA\s+user_version\s*=\s*(\d+)/i);
            if (m) fakeVersion = Number(m[1]);
            return { success: true };
          },
        };
      },
      async batch(statements) {
        if (shouldFail) throw new Error('D1 transient failure');
        for (const stmt of statements) {
          await stmt.run();
        }
        return statements.map(() => ({ success: true }));
      },
    };

    await expect(runD1Migrations(flakyDb)).rejects.toThrow('D1 transient failure');

    shouldFail = false;
    await runD1Migrations(flakyDb);
    expect(fakeVersion).toBe(LATEST_SCHEMA_VERSION);
  });

  it('avoids full-table scans on subscription group pull and invalid-token / disguise requests', async () => {
    const db = createMemoryD1({
      main: {
        myToken: 'admin-token',
        profileToken: 'profiles',
        enableFlagEmoji: false,
        enableTrafficNode: false,
        allowBrowserSubAccess: false,
        disguise: { pageType: 'default' },
      },
      subscriptions: [
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
      profiles: [
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
      subscriptions: [
        { id: 'sub-1', name: 'Sub 1', url: 'https://a.example.com/sub' },
        { id: 'node-1', name: 'Node 1', url: 'vless://u@1.1.1.1:443#N1' },
      ],
      profiles: [{ id: 'p-1', customId: 'c1', name: 'Profile 1' }],
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
