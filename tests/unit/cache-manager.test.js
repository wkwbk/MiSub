import { describe, expect, it, vi } from 'vitest';
import { resolveNodeListWithCache } from '../../functions/modules/subscription/cache/cache-manager.js';

function createStorage(cachedData) {
  return {
    get: vi.fn().mockResolvedValue(cachedData),
  };
}

describe('resolveNodeListWithCache', () => {
  it('returns a fresh non-empty cache without refreshing', async () => {
    const refreshNodes = vi.fn().mockResolvedValue('trojan://password@1.2.3.5:443#JP-01');
    const context = {};

    const result = await resolveNodeListWithCache({
      storageAdapter: createStorage({
        nodes: 'trojan://password@1.2.3.4:443#HK-01',
        timestamp: Date.now(),
        nodeCount: 1,
        sources: ['airport'],
      }),
      cacheKey: 'node_cache_token_test',
      forceRefresh: false,
      refreshNodes,
      context,
      targetMisubsCount: 1,
    });

    expect(result.combinedNodeList).toBe('trojan://password@1.2.3.4:443#HK-01');
    expect(result.cacheHeaders['X-Cache-Status']).toBe('HIT');
    expect(result.cacheHeaders['X-Node-Count']).toBe('1');
    expect(refreshNodes).not.toHaveBeenCalled();
    expect(context.generationStats.totalNodes).toBe(1);
  });

  it('refreshes synchronously when a fresh cache contains zero nodes', async () => {
    const refreshNodes = vi.fn().mockResolvedValue('trojan://password@1.2.3.4:443#HK-01');

    const result = await resolveNodeListWithCache({
      storageAdapter: createStorage({
        nodes: '',
        timestamp: Date.now(),
        nodeCount: 0,
        sources: ['airport'],
      }),
      cacheKey: 'node_cache_token_test',
      forceRefresh: false,
      refreshNodes,
      context: {},
      targetMisubsCount: 1,
    });

    expect(result.combinedNodeList).toBe('trojan://password@1.2.3.4:443#HK-01');
    expect(result.cacheHeaders['X-Cache-Status']).toBe('MISS');
    expect(result.cacheHeaders['X-Node-Count']).toBe('1');
    expect(refreshNodes).toHaveBeenCalledTimes(1);
    expect(refreshNodes).toHaveBeenCalledWith(false);
  });

  it('ignores a fresh aggregate cache that is far below the known subscription node count', async () => {
    const refreshNodes = vi.fn().mockResolvedValue('trojan://fresh@example.com:443#Fresh');

    const result = await resolveNodeListWithCache({
      storageAdapter: createStorage({
        nodes: 'trojan://cached@example.com:443#Cached\n',
        timestamp: Date.now(),
        nodeCount: 2,
        sources: ['airport'],
      }),
      cacheKey: 'node_cache_token_test',
      forceRefresh: false,
      refreshNodes,
      context: {},
      targetMisubsCount: 1,
      expectedNodeCount: 156,
    });

    expect(result.combinedNodeList).toBe('trojan://fresh@example.com:443#Fresh');
    expect(result.cacheHeaders['X-Cache-Status']).toBe('MISS');
    expect(refreshNodes).toHaveBeenCalledWith(false);
  });

  it('ignores the known partial-result signature even when no expected node count is available', async () => {
    const refreshNodes = vi.fn().mockResolvedValue('trojan://fresh@example.com:443#Fresh');
    const partialNodes =
      [
        'trojan://00000000-0000-0000-0000-000000000000@127.0.0.1:443#%E6%B5%81%E9%87%8F%E5%89%A9%E4%BD%99',
        'vless://11111111-1111-1111-1111-111111111111@example.com:443#11111111-1111-1111-1111-111111111111',
      ].join('\n') + '\n';

    const result = await resolveNodeListWithCache({
      storageAdapter: createStorage({
        nodes: partialNodes,
        timestamp: Date.now(),
        nodeCount: 2,
        sources: ['airport'],
      }),
      cacheKey: 'node_cache_token_test',
      forceRefresh: false,
      refreshNodes,
      context: {},
      targetMisubsCount: 1,
    });

    expect(result.combinedNodeList).toBe('trojan://fresh@example.com:443#Fresh');
    expect(result.cacheHeaders['X-Cache-Status']).toBe('MISS');
    expect(refreshNodes).toHaveBeenCalledWith(false);
  });

  it('coalesces concurrent miss refreshes via Single-Flight and populates stats for all callers', async () => {
    let resolveRefresh;
    const refreshNodes = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const storageAdapter = createStorage(null);
    const contextA = {};
    const contextB = {};

    const p1 = resolveNodeListWithCache({
      storageAdapter,
      cacheKey: 'node_cache_token_single_flight',
      forceRefresh: false,
      refreshNodes,
      context: contextA,
      targetMisubsCount: 2,
    });
    const p2 = resolveNodeListWithCache({
      storageAdapter,
      cacheKey: 'node_cache_token_single_flight',
      forceRefresh: false,
      refreshNodes,
      context: contextB,
      targetMisubsCount: 2,
    });

    await vi.waitFor(() => expect(refreshNodes).toHaveBeenCalledTimes(1));
    resolveRefresh('trojan://a@example.com:443#HK-01\ntrojan://b@example.com:443#JP-01');

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1.combinedNodeList).toBe(res2.combinedNodeList);
    expect(res1.cacheHeaders['X-Cache-Status']).toBe('MISS');
    expect(res2.cacheHeaders['X-Cache-Status']).toBe('MISS');
    expect(contextA.generationStats.totalNodes).toBe(2);
    expect(contextB.generationStats.totalNodes).toBe(2);
  });

  it('cleans up Single-Flight inflight state after a failed refresh so subsequent requests retry', async () => {
    const refreshNodes = vi
      .fn()
      .mockRejectedValueOnce(new Error('upstream failed'))
      .mockResolvedValueOnce('trojan://recovered@example.com:443#Recovered');
    const storageAdapter = createStorage(null);

    await expect(
      resolveNodeListWithCache({
        storageAdapter,
        cacheKey: 'node_cache_token_retry',
        forceRefresh: false,
        refreshNodes,
        context: {},
        targetMisubsCount: 1,
      }),
    ).rejects.toThrow('upstream failed');

    const recovered = await resolveNodeListWithCache({
      storageAdapter,
      cacheKey: 'node_cache_token_retry',
      forceRefresh: false,
      refreshNodes,
      context: {},
      targetMisubsCount: 1,
    });

    expect(refreshNodes).toHaveBeenCalledTimes(2);
    expect(recovered.combinedNodeList).toBe('trojan://recovered@example.com:443#Recovered');
  });

  it('coalesces concurrent forceRefresh requests for the same cache key', async () => {
    let resolveRefresh;
    const refreshNodes = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const storageAdapter = createStorage({
      nodes: 'trojan://stale@example.com:443#Stale',
      timestamp: Date.now(),
      nodeCount: 1,
    });

    const p1 = resolveNodeListWithCache({
      storageAdapter,
      cacheKey: 'node_cache_token_force',
      forceRefresh: true,
      refreshNodes,
      context: {},
      targetMisubsCount: 1,
    });
    const p2 = resolveNodeListWithCache({
      storageAdapter,
      cacheKey: 'node_cache_token_force',
      forceRefresh: true,
      refreshNodes,
      context: {},
      targetMisubsCount: 1,
    });

    await vi.waitFor(() => expect(refreshNodes).toHaveBeenCalledTimes(1));
    resolveRefresh('trojan://forced@example.com:443#Forced');

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1.combinedNodeList).toBe('trojan://forced@example.com:443#Forced');
    expect(res2.combinedNodeList).toBe('trojan://forced@example.com:443#Forced');
  });
});
