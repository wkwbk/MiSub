import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEdgeCacheRequest,
  resetStrictCooldownMemoryForTests,
  resolveFetchGuardPolicy,
} from '../../functions/modules/subscription/security/fetch-guard.js';
import { clearAllNodeCaches, getCache } from '../../functions/services/node-cache-service.js';
import { handleMisubRequest } from '../../functions/modules/subscription/core/main-handler.js';

const createAdapter = vi.fn();

vi.mock('../../functions/storage-adapter.js', () => ({
  StorageFactory: {
    createAdapter: (...args) => createAdapter(...args),
    resolveKV: (env) => env?.MISUB_KV || null,
  },
  STORAGE_TYPES: { KV: 'kv', D1: 'd1' },
}));

function createMockEdgeCache() {
  const entries = new Map();
  return {
    entries,
    match: vi.fn(async (req) => {
      const key = typeof req === 'string' ? req : req.url;
      const saved = entries.get(key);
      return saved ? saved.clone() : undefined;
    }),
    put: vi.fn(async (req, res) => {
      const key = typeof req === 'string' ? req : req.url;
      entries.set(key, res.clone());
    }),
  };
}

function createStorageAdapter({ settings = {}, subscriptions = [], profiles = [] } = {}) {
  const store = new Map([['main', settings]]);
  return {
    store,
    get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    put: vi.fn(async (key, value) => {
      store.set(key, value);
      return true;
    }),
    delete: vi.fn(async (key) => {
      store.delete(key);
      return true;
    }),
    list: vi.fn(async (prefix = '') =>
      Array.from(store.keys())
        .filter((k) => k.startsWith(prefix))
        .map((name) => ({ name })),
    ),
    getAllSubscriptions: vi.fn(async () => subscriptions),
    getAllProfiles: vi.fn(async () => profiles),
    getProfileById: vi.fn(async (id) => profiles.find((p) => p.id === id || p.customId === id) || null),
    getProfileSources: vi.fn(async (subIds, nodeIds) =>
      subscriptions.filter((item) => subIds.includes(item.id) || nodeIds.includes(item.id)),
    ),
    getSubscriptionsByIds: vi.fn(async (ids) => subscriptions.filter((item) => ids.includes(item.id))),
    incrementProfileDownloadCount: vi.fn(async () => true),
  };
}

describe('fetch-guard policy & integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStrictCooldownMemoryForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves fetch guard policy with profile > global > default precedence', () => {
    expect(resolveFetchGuardPolicy(null, null)).toMatchObject({
      enabled: true,
      minIntervalMinutes: 15,
      mode: 'cache',
    });

    expect(resolveFetchGuardPolicy(null, { subFetchMinInterval: 30, subFetchLimitMode: 'strict' })).toMatchObject({
      enabled: true,
      minIntervalMinutes: 30,
      mode: 'strict',
    });

    expect(
      resolveFetchGuardPolicy(
        { fetchMinInterval: 60, fetchLimitMode: 'cache' },
        { subFetchMinInterval: 30, subFetchLimitMode: 'strict' },
      ),
    ).toMatchObject({
      enabled: true,
      minIntervalMinutes: 60,
      mode: 'cache',
    });

    expect(
      resolveFetchGuardPolicy({ fetchMinInterval: 0 }, { subFetchMinInterval: 30, subFetchLimitMode: 'strict' }),
    ).toMatchObject({
      enabled: false,
      minIntervalMinutes: 0,
    });
  });

  it('normalizes edge cache keys across refresh params and separates formats/versions', () => {
    const req1 = buildEdgeCacheRequest({
      requestUrl: 'https://misub.example/sub/p1?b=2&a=1&refresh=1',
      targetFormat: 'clash',
      isMeta: true,
      cacheVersion: '100',
    });
    const req2 = buildEdgeCacheRequest({
      requestUrl: 'https://misub.example/sub/p1?a=1&b=2&nocache=1',
      targetFormat: 'clash',
      isMeta: true,
      cacheVersion: '100',
    });
    const req3 = buildEdgeCacheRequest({
      requestUrl: 'https://misub.example/sub/p1?a=1&b=2',
      targetFormat: 'base64',
      isMeta: false,
      cacheVersion: '100',
    });
    const req4 = buildEdgeCacheRequest({
      requestUrl: 'https://misub.example/sub/p1?a=1&b=2',
      targetFormat: 'clash',
      isMeta: true,
      cacheVersion: '101',
    });

    expect(req1.url).toBe(req2.url);
    expect(req1.url).not.toBe(req3.url);
    expect(req1.url).not.toBe(req4.url);
  });

  it('respects custom freshTtlMs in node-cache-service getCache', async () => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const storage = createStorageAdapter();
    await storage.put('node_cache_test', {
      nodes: 'trojan://pass@1.2.3.4:443#HK',
      timestamp: tenMinutesAgo,
      nodeCount: 1,
      sources: ['airport'],
    });

    // Default FRESH_TTL is 3 min -> stale
    const defaultRes = await getCache(storage, 'node_cache_test');
    expect(defaultRes.status).toBe('stale');

    // Custom 30 min freshTtlMs -> fresh
    const extendedRes = await getCache(storage, 'node_cache_test', { freshTtlMs: 30 * 60 * 1000 });
    expect(extendedRes.status).toBe('fresh');
  });

  it('serves edge-cached response within min interval and invalidates on clearAllNodeCaches', async () => {
    const mockEdgeCache = createMockEdgeCache();
    vi.stubGlobal('caches', { default: mockEdgeCache });

    const fetchMock = vi.fn(async () => new Response('trojan://pass@example.com:443#Node-1', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createStorageAdapter({
      settings: {
        profileToken: 'sub',
        subFetchMinInterval: 30,
        subFetchLimitMode: 'cache',
        enableAccessLog: true,
        enableFlagEmoji: false,
        enableTrafficNode: false,
      },
      subscriptions: [{ id: 's1', name: 'Airport', url: 'https://airport.example/sub', enabled: true }],
      profiles: [{ id: 'p1', customId: 'vip', name: 'VIP', enabled: true, subscriptions: ['s1'], manualNodes: [] }],
    });
    createAdapter.mockReturnValue(adapter);

    const pending = [];
    const waitUntil = vi.fn((promise) => pending.push(promise));

    // 1st request -> MISS, writes edge cache, fetches upstream, increments downloadCount
    const res1 = await handleMisubRequest({
      request: new Request('https://misub.example/sub/vip?target=base64', {
        headers: { 'User-Agent': 'v2rayN/7.0', 'CF-Connecting-IP': '1.2.3.4' },
      }),
      env: {},
      waitUntil,
    });
    await Promise.all(pending.splice(0));

    expect(res1.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(adapter.incrementProfileDownloadCount).toHaveBeenCalledTimes(1);
    expect(mockEdgeCache.put).toHaveBeenCalledTimes(1);

    // 2nd request within 30 min -> EDGE-HIT, 0 upstream fetch, 0 downloadCount write
    const res2 = await handleMisubRequest({
      request: new Request('https://misub.example/sub/vip?target=base64', {
        headers: { 'User-Agent': 'v2rayN/7.0', 'CF-Connecting-IP': '1.2.3.4' },
      }),
      env: {},
      waitUntil,
    });
    await Promise.all(pending.splice(0));

    expect(res2.status).toBe(200);
    expect(res2.headers.get('X-MiSub-Edge-Cache')).toBe('HIT');
    expect(res2.headers.get('X-Cache-Status')).toBe('EDGE-HIT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(adapter.incrementProfileDownloadCount).toHaveBeenCalledTimes(1);

    // Admin updates subscriptions -> clearAllNodeCaches bumps edge cache version -> next request refreshes
    await clearAllNodeCaches(adapter);

    const res3 = await handleMisubRequest({
      request: new Request('https://misub.example/sub/vip?target=base64', {
        headers: { 'User-Agent': 'v2rayN/7.0', 'CF-Connecting-IP': '1.2.3.4' },
      }),
      env: {},
      waitUntil,
    });
    await Promise.all(pending.splice(0));

    expect(res3.status).toBe(200);
    expect(res3.headers.get('X-MiSub-Edge-Cache')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(adapter.incrementProfileDownloadCount).toHaveBeenCalledTimes(2);
  });

  it('falls back to isolate memory response cache when caches.default is unavailable (e.g. workers.dev)', async () => {
    const fetchMock = vi.fn(async () => new Response('trojan://pass@example.com:443#Node-1', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createStorageAdapter({
      settings: {
        profileToken: 'sub',
        subFetchMinInterval: 15,
        subFetchLimitMode: 'cache',
        enableAccessLog: true,
        enableFlagEmoji: false,
        enableTrafficNode: false,
      },
      subscriptions: [{ id: 's1', name: 'Airport', url: 'https://airport.example/sub', enabled: true }],
      profiles: [{ id: 'p1', customId: 'vip', name: 'VIP', enabled: true, subscriptions: ['s1'], manualNodes: [] }],
    });
    createAdapter.mockReturnValue(adapter);

    const pending = [];
    const waitUntil = vi.fn((promise) => pending.push(promise));

    const res1 = await handleMisubRequest({
      request: new Request('https://misub.workers.dev/sub/vip?target=base64', {
        headers: { 'User-Agent': 'v2rayN/7.0' },
      }),
      env: {},
      waitUntil,
    });
    await Promise.all(pending.splice(0));

    expect(res1.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const res2 = await handleMisubRequest({
      request: new Request('https://misub.workers.dev/sub/vip?target=base64', {
        headers: { 'User-Agent': 'v2rayN/7.0' },
      }),
      env: {},
      waitUntil,
    });
    await Promise.all(pending.splice(0));

    expect(res2.status).toBe(200);
    expect(res2.headers.get('X-MiSub-Edge-Cache')).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(adapter.incrementProfileDownloadCount).toHaveBeenCalledTimes(1);
  });

  it('blocks repeated fetches per IP with 429 in strict mode while allowing refresh=1 and other IPs', async () => {
    const fetchMock = vi.fn(async () => new Response('trojan://pass@example.com:443#Node-1', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createStorageAdapter({
      settings: {
        profileToken: 'sub',
        subFetchMinInterval: 15,
        subFetchLimitMode: 'cache',
        enableAccessLog: true,
        enableFlagEmoji: false,
        enableTrafficNode: false,
      },
      subscriptions: [{ id: 's1', name: 'Airport', url: 'https://airport.example/sub', enabled: true }],
      profiles: [
        {
          id: 'p1',
          customId: 'strict-vip',
          name: 'StrictVIP',
          enabled: true,
          subscriptions: ['s1'],
          manualNodes: [],
          fetchMinInterval: 10,
          fetchLimitMode: 'strict',
        },
      ],
    });
    createAdapter.mockReturnValue(adapter);

    const waitUntil = vi.fn();

    // 1st request from IP A -> 200
    const res1 = await handleMisubRequest({
      request: new Request('https://misub.example/sub/strict-vip?target=base64', {
        headers: { 'User-Agent': 'v2rayN/7.0', 'CF-Connecting-IP': '10.0.0.1' },
      }),
      env: {},
      waitUntil,
    });
    expect(res1.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 2nd request from same IP A -> 429
    const res2 = await handleMisubRequest({
      request: new Request('https://misub.example/sub/strict-vip?target=base64', {
        headers: { 'User-Agent': 'v2rayN/7.0', 'CF-Connecting-IP': '10.0.0.1' },
      }),
      env: {},
      waitUntil,
    });
    expect(res2.status).toBe(429);
    expect(res2.headers.get('X-MiSub-Rate-Limit')).toBe('strict');
    expect(Number(res2.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Request from IP B -> 200 (per-IP isolation)
    const res3 = await handleMisubRequest({
      request: new Request('https://misub.example/sub/strict-vip?target=base64', {
        headers: { 'User-Agent': 'v2rayN/7.0', 'CF-Connecting-IP': '10.0.0.2' },
      }),
      env: {},
      waitUntil,
    });
    expect(res3.status).toBe(200);

    // Explicit ?refresh=1 from IP A -> bypasses strict cooldown
    const res4 = await handleMisubRequest({
      request: new Request('https://misub.example/sub/strict-vip?target=base64&refresh=1', {
        headers: { 'User-Agent': 'v2rayN/7.0', 'CF-Connecting-IP': '10.0.0.1' },
      }),
      env: {},
      waitUntil,
    });
    expect(res4.status).toBe(200);
  });
});
