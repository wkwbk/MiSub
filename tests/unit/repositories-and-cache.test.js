import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryD1 } from '../helpers/memory-d1.js';
import { clearSettingsCache, StorageFactory } from '../../functions/storage-adapter.js';
import { createRepositories, MultiTierCache } from '../../functions/repositories/index.js';
import { inspectNodes } from '../../functions/services/node-inspect-service.js';
import { clearAllNodeCaches } from '../../functions/services/node-cache-service.js';
import { scheduleSubscriptionRuntimeInfoUpdate } from '../../functions/services/subscription/runtime-cache.js';

function createMockEdgeCache() {
  const store = new Map();
  return {
    store,
    match: vi.fn(async (req) => {
      const url = typeof req === 'string' ? req : req.url;
      const entry = store.get(url);
      return entry ? entry.clone() : undefined;
    }),
    put: vi.fn(async (req, res) => {
      const url = typeof req === 'string' ? req : req.url;
      store.set(url, res.clone());
    }),
    delete: vi.fn(async (req) => {
      const url = typeof req === 'string' ? req : req.url;
      return store.delete(url);
    }),
  };
}

describe('Repositories, 3-Tier Cache & D1 db.batch Coalescing', () => {
  beforeEach(() => {
    clearSettingsCache();
  });

  it('reads through Memory -> Cloudflare Cache API -> D1 and promotes Tier 2 hits', async () => {
    const db = createMemoryD1({
      profiles: [
        {
          id: 'prof-1',
          name: '测试订阅组',
          customId: 'test-prof',
          isPublic: true,
          enabled: true,
          subscriptions: [],
          manualNodes: [],
        },
      ],
    });
    const edgeCache = createMockEdgeCache();
    const cache = new MultiTierCache({ edgeCache });
    const storage = StorageFactory.createAdapter({ MISUB_DB: db });
    const repos = createRepositories({ MISUB_DB: db }, null, { storage, cache, edgeCache });

    const storageReadSpy = vi.spyOn(storage, 'getProfileById');

    // 1. Cold read hits D1 and warms Tier 2 + Tier 1
    const first = await repos.profiles.getById('prof-1');
    expect(first?.name).toBe('测试订阅组');
    expect(storageReadSpy).toHaveBeenCalledTimes(1);
    expect(edgeCache.put).toHaveBeenCalledTimes(1);

    // Mutate returned object and ensure cached object is isolated
    first.name = 'mutated-externally';

    // 2. Warm Tier 1 Memory hit (no edge.match, no D1 read)
    const second = await repos.profiles.getById('prof-1');
    expect(second?.name).toBe('测试订阅组');
    expect(storageReadSpy).toHaveBeenCalledTimes(1);
    expect(edgeCache.match).toHaveBeenCalledTimes(1); // Only from initial cold miss

    // 3. Clear Tier 1 memory only -> Tier 2 Cloudflare Cache API hit promotes back to Tier 1 with 0 D1 reads
    cache.clearMemory(db);
    const third = await repos.profiles.getById('prof-1');
    expect(third?.name).toBe('测试订阅组');
    expect(storageReadSpy).toHaveBeenCalledTimes(1);
    expect(edgeCache.match).toHaveBeenCalledTimes(2);
  });

  it('prevents cache stampede with single-flight coalescing', async () => {
    const db = createMemoryD1({
      profiles: [{ id: 'hot-prof', name: 'Hot', isPublic: true, enabled: true }],
    });
    const storage = StorageFactory.createAdapter({ MISUB_DB: db });
    const cache = new MultiTierCache({ edgeCache: null });
    const repos = createRepositories({ MISUB_DB: db }, null, { storage, cache, edgeCache: null });

    let resolveSlowRead;
    const origGetProfileById = storage.getProfileById.bind(storage);
    const spy = vi.spyOn(storage, 'getProfileById').mockImplementation(
      (id) =>
        new Promise((resolve) => {
          resolveSlowRead = () => resolve(origGetProfileById(id));
        }),
    );

    const pendingCalls = Array.from({ length: 12 }, () => repos.profiles.getById('hot-prof'));
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledTimes(1);

    resolveSlowRead();
    const results = await Promise.all(pendingCalls);
    expect(results).toHaveLength(12);
    expect(results.every((r) => r?.id === 'hot-prof')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('prevents cache penetration via negative sentinel and clears on write', async () => {
    const db = createMemoryD1();
    const edgeCache = createMockEdgeCache();
    const storage = StorageFactory.createAdapter({ MISUB_DB: db });
    const cache = new MultiTierCache({ edgeCache });
    const repos = createRepositories({ MISUB_DB: db }, null, { storage, cache, edgeCache });

    const lookupSpy = vi.spyOn(storage, 'getPublicProfileByIdentifier');

    for (let i = 0; i < 5; i++) {
      const found = await repos.profiles.getPublicByIdentifier('non-existent-slug');
      expect(found).toBeNull();
    }
    expect(lookupSpy).toHaveBeenCalledTimes(1);

    // Saving matching profile immediately invalidates namespace + negative sentinel
    await repos.profiles.save({
      id: 'p-recovered',
      name: 'Recovered Profile',
      customId: 'non-existent-slug',
      isPublic: true,
      enabled: true,
    });

    const recovered = await repos.profiles.getPublicByIdentifier('non-existent-slug');
    expect(recovered?.name).toBe('Recovered Profile');
    expect(lookupSpy).toHaveBeenCalledTimes(2);
  });

  it('invalidates repository cache when underlying D1 storage mutates directly', async () => {
    const db = createMemoryD1({
      subscriptions: [{ id: 'sub-1', name: 'Airport 1', url: 'https://example.com/sub1', enabled: true }],
    });
    const env = { MISUB_DB: db };
    const repos = createRepositories(env);
    const storage = repos.storage;

    const initial = await repos.subscriptions.getAll();
    expect(initial).toHaveLength(1);

    // Direct storage mutation triggers D1 collection cache invalidation -> notifies MultiTierCache
    await storage.putSubscription({
      id: 'sub-2',
      name: 'Airport 2',
      url: 'https://example.com/sub2',
      enabled: true,
    });

    const refreshed = await repos.subscriptions.getAll();
    expect(refreshed.map((s) => s.id)).toEqual(['sub-1', 'sub-2']);
  });

  it('coalesces manual node latency status updates into a single db.batch call', async () => {
    const seedNodes = Array.from({ length: 15 }, (_, index) => ({
      id: `node-${index + 1}`,
      name: `Node ${index + 1}`,
      url: `vless://11111111-1111-1111-1111-111111111111@1.1.1.${index + 1}:443#Node${index + 1}`,
      enabled: true,
      sortIndex: index,
    }));
    const db = createMemoryD1({ subscriptions: seedNodes });
    const batchSpy = vi.spyOn(db, 'batch');
    const repos = createRepositories({ MISUB_DB: db });

    const updates = seedNodes.map((node, index) => ({
      id: node.id,
      status: 'ok',
      latency: 20 + index,
      mode: 'tcping',
    }));

    const updated = await repos.nodes.batchUpdateLatencyStatus(updates);
    expect(updated).toHaveLength(15);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy.mock.calls[0][0]).toHaveLength(15);

    const storedNode10 = JSON.parse(db.tables.nodes.get('node-10'));
    expect(storedNode10.latency).toBe(29);
    expect(storedNode10.status).toBe('ok');
  });

  it('coalesces concurrent subscription runtime updates via microtask queue into 1 db.batch', async () => {
    const seedSubs = Array.from({ length: 5 }, (_, idx) => ({
      id: `sub-${idx + 1}`,
      name: `Sub ${idx + 1}`,
      url: `https://example.com/${idx + 1}`,
      enabled: true,
      sortIndex: idx,
    }));
    const db = createMemoryD1({ subscriptions: seedSubs });
    const batchSpy = vi.spyOn(db, 'batch');
    const storage = StorageFactory.createAdapter({ MISUB_DB: db });

    const waitPromises = [];
    const context = {
      waitUntil: (p) => waitPromises.push(p),
    };

    for (let i = 0; i < seedSubs.length; i++) {
      scheduleSubscriptionRuntimeInfoUpdate(context, storage, seedSubs[i], {
        nodeCount: 10 + i,
        lastGoodNodeCount: 10 + i,
        detectedName: `Detected ${i + 1}`,
      });
    }

    expect(waitPromises).toHaveLength(5);
    await Promise.all(waitPromises);

    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy.mock.calls[0][0]).toHaveLength(5);

    const stored3 = JSON.parse(db.tables.subscriptions.get('sub-3'));
    expect(stored3.nodeCount).toBe(12);
    expect(stored3.detectedName).toBe('Detected 3');
  });

  it('batches inspectNodes DNS & IP geo cache reads/writes into db.batch', async () => {
    const db = createMemoryD1();
    const batchSpy = vi.spyOn(db, 'batch');

    const nodes = Array.from({ length: 4 }, (_, i) => ({
      id: `n-${i + 1}`,
      url: `vless://11111111-1111-1111-1111-111111111111@edge${i + 1}.example.com:443#N${i + 1}`,
    }));

    const fetchFn = vi.fn(async (url) => {
      const targetUrl = String(url);
      if (targetUrl.startsWith('https://cloudflare-dns.com/dns-query')) {
        const domain = new URL(targetUrl).searchParams.get('name');
        const idx = Number(domain.match(/\d+/)?.[0] || 1);
        return new Response(
          JSON.stringify({
            Status: 0,
            Answer: [{ type: 1, data: `8.8.8.${idx}` }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (targetUrl.startsWith('http://ip-api.com/batch')) {
        return new Response(
          JSON.stringify(
            [1, 2, 3, 4].map((idx) => ({
              status: 'success',
              query: `8.8.8.${idx}`,
              countryCode: 'US',
              country: 'United States',
              as: 'AS15169 Google LLC',
              org: 'Google LLC',
              isp: 'Google LLC',
            })),
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });

    const firstResults = await inspectNodes(nodes, { MISUB_DB: db }, { fetchFn });
    expect(Object.keys(firstResults)).toHaveLength(4);
    expect(firstResults['n-1'].countryCode).toBe('US');
    // 1 batch for DNS cache writes + 1 batch for IP geo cache writes
    expect(batchSpy).toHaveBeenCalledTimes(2);
    expect(batchSpy.mock.calls[0][0]).toHaveLength(4);
    expect(batchSpy.mock.calls[1][0]).toHaveLength(4);

    // Clear L1 memory to verify batch D1 SELECT ... WHERE key IN (...) path + 0 external fetches
    clearSettingsCache();
    fetchFn.mockClear();
    const secondResults = await inspectNodes(nodes, { MISUB_DB: db }, { fetchFn });
    expect(secondResults['n-2'].ip).toBe('8.8.8.2');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('batches node cache deletions via db.batch in clearAllNodeCaches', async () => {
    const cacheSeed = {};
    for (let i = 1; i <= 6; i++) {
      cacheSeed[`node_cache_profile_p${i}`] = { nodes: 'a', timestamp: Date.now(), nodeCount: 1 };
    }
    cacheSeed['node_cache_subscription_keep-1'] = { nodes: 'b', timestamp: Date.now(), nodeCount: 1 };
    cacheSeed['node_cache_profile_keep-prof'] = { nodes: 'c', timestamp: Date.now(), nodeCount: 1 };

    const db = createMemoryD1(cacheSeed);
    const storage = StorageFactory.createAdapter({ MISUB_DB: db });
    const batchSpy = vi.spyOn(db, 'batch');

    const res = await clearAllNodeCaches(storage, {
      preserveKeys: ['node_cache_subscription_keep-1'],
      preserveProfileKeys: ['node_cache_profile_keep-prof'],
    });

    expect(res.cleared).toBe(6);
    expect(res.skipped).toBe(2);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy.mock.calls[0][0]).toHaveLength(6);
    expect(db.tables.cache.has('node_cache_subscription_keep-1')).toBe(true);
    expect(db.tables.cache.has('node_cache_profile_keep-prof')).toBe(true);
  });
});
