import type { BoundRequestContext, StorageAdapter } from '../../../types.js';
import {
  createCacheHeaders,
  getCache,
  isLikelyPartialAggregateNodeList,
  triggerBackgroundRefresh,
} from '../../../services/node-cache-service.js';

export interface CachedNodeEntry {
  nodes: string;
  timestamp?: number;
  nodeCount?: number;
  sources?: string[];
}

export type CacheStatus = 'fresh' | 'stale' | 'expired' | 'miss';

export interface ResolveNodeListWithCacheOptions {
  storageAdapter: StorageAdapter;
  cacheKey: string;
  forceRefresh: boolean;
  refreshNodes: (isBackground: boolean) => Promise<string>;
  context?: BoundRequestContext | null;
  targetMisubsCount: number;
  expectedNodeCount?: number;
  freshTtlMs?: number;
}

export interface ResolveNodeListWithCacheResult {
  combinedNodeList: string;
  cacheHeaders: Record<string, string>;
  cacheStatus: CacheStatus;
}

const refreshDebounce = new Map<string, number>();
const DEBOUNCE_TIME = 10000;

function countCachedNodes(cachedData: CachedNodeEntry | null | undefined): number {
  const declaredCount = Number(cachedData?.nodeCount);
  if (Number.isFinite(declaredCount)) return declaredCount;
  return String(cachedData?.nodes || '')
    .split('\n')
    .filter((line) => line.trim()).length;
}

function hasUsableCachedNodes(cachedData: CachedNodeEntry | null | undefined): cachedData is CachedNodeEntry {
  return Boolean(String(cachedData?.nodes || '').trim()) && countCachedNodes(cachedData) > 0;
}

function isCacheFarBelowExpected(cachedData: CachedNodeEntry | null | undefined, expectedNodeCount: number): boolean {
  const expected = Number(expectedNodeCount);
  if (!Number.isFinite(expected) || expected < 10) return false;
  const cached = countCachedNodes(cachedData);
  return cached / expected < 0.3;
}

function populateCachedStats(
  context: BoundRequestContext | null | undefined,
  cachedNodeCount: number,
  targetMisubsCount: number,
): void {
  if (!context) return;
  context.generationStats = {
    totalNodes: cachedNodeCount,
    sourceCount: targetMisubsCount,
    successCount: cachedNodeCount,
    failCount: 0,
    duration: 0,
  };
}

export async function resolveNodeListWithCache({
  storageAdapter,
  cacheKey,
  forceRefresh,
  refreshNodes,
  context,
  targetMisubsCount,
  expectedNodeCount = 0,
  freshTtlMs,
}: ResolveNodeListWithCacheOptions): Promise<ResolveNodeListWithCacheResult> {
  const rawResult = forceRefresh
    ? { data: null, status: 'miss' as const }
    : ((await getCache(storageAdapter, cacheKey, { freshTtlMs })) as {
        data: CachedNodeEntry | null;
        status: CacheStatus;
      });
  const cachedData = rawResult.data;
  const cacheStatus = rawResult.status;

  let combinedNodeList: string;
  let cacheHeaders: Record<string, string> = {};
  const cacheLooksIncomplete =
    Boolean(cachedData) &&
    (isCacheFarBelowExpected(cachedData, expectedNodeCount) || isLikelyPartialAggregateNodeList(cachedData?.nodes));
  const canUseCachedData = hasUsableCachedNodes(cachedData) && !cacheLooksIncomplete;

  if (cacheLooksIncomplete) {
    console.warn(
      `[Cache] Ignoring incomplete cache ${cacheKey} (${countCachedNodes(cachedData)} cached vs ${expectedNodeCount} expected nodes)`,
    );
  }

  if (cacheStatus === 'fresh' && canUseCachedData) {
    const cachedNodeCount = countCachedNodes(cachedData);
    combinedNodeList = cachedData.nodes;
    cacheHeaders = createCacheHeaders('HIT', cachedNodeCount) as Record<string, string>;
    populateCachedStats(context, cachedNodeCount, targetMisubsCount);
  } else if ((cacheStatus === 'stale' || cacheStatus === 'expired') && canUseCachedData) {
    const cachedNodeCount = countCachedNodes(cachedData);
    combinedNodeList = cachedData.nodes;
    cacheHeaders = createCacheHeaders('REFRESHING', cachedNodeCount) as Record<string, string>;

    const lastRun = refreshDebounce.get(cacheKey);
    if (!lastRun || Date.now() - lastRun > DEBOUNCE_TIME) {
      refreshDebounce.set(cacheKey, Date.now());
      triggerBackgroundRefresh(context, () => refreshNodes(true));
    }

    populateCachedStats(context, cachedNodeCount, targetMisubsCount);
  } else {
    combinedNodeList = await refreshNodes(false);
    cacheHeaders = createCacheHeaders(
      'MISS',
      combinedNodeList.split('\n').filter((line) => line.trim()).length,
    ) as Record<string, string>;
  }

  return { combinedNodeList, cacheHeaders, cacheStatus };
}
