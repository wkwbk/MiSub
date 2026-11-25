/**
 * D1 表级内存短缓存（按 D1 实例隔离，带并发请求合并）
 */

export type CacheInvalidationListener = (database: object | null, namespace: string, key: string | null) => void;
export type CacheResetListener = () => void;

interface CollectionCacheEntry<T = unknown> {
  timestamp: number;
  promise: Promise<T>;
}

const D1_COLLECTION_CACHE_TTL_MS = 30 * 1000;
let d1CollectionCaches = new WeakMap<object, Map<string, CollectionCacheEntry>>();
const cacheInvalidationListeners = new Set<CacheInvalidationListener>();
const cacheResetListeners = new Set<CacheResetListener>();

export function registerCacheInvalidationListener(listener: CacheInvalidationListener): () => void {
  if (typeof listener !== 'function') return () => {};
  cacheInvalidationListeners.add(listener);
  return () => cacheInvalidationListeners.delete(listener);
}

export function registerCacheResetListener(listener: CacheResetListener): () => void {
  if (typeof listener !== 'function') return () => {};
  cacheResetListeners.add(listener);
  return () => cacheResetListeners.delete(listener);
}

export function notifyCacheInvalidation(database: object | null, namespace: string, key: string | null = null): void {
  for (const listener of cacheInvalidationListeners) {
    try {
      listener(database, namespace, key);
    } catch {}
  }
}

export function resetD1CollectionCaches(): void {
  d1CollectionCaches = new WeakMap();
  for (const listener of cacheResetListeners) {
    try {
      listener();
    } catch {}
  }
}

function getD1CollectionCache(database: object): Map<string, CollectionCacheEntry> {
  let cache = d1CollectionCaches.get(database);
  if (!cache) {
    cache = new Map();
    d1CollectionCaches.set(database, cache);
  }
  return cache;
}

export function invalidateD1CollectionCache(database: object, table: string): void {
  getD1CollectionCache(database).delete(table);
  notifyCacheInvalidation(database, table, null);
}

export async function readCachedD1Collection<T>(
  database: object,
  table: string,
  loader: () => Promise<T>,
): Promise<T> {
  const cache = getD1CollectionCache(database);
  const now = Date.now();
  const existing = cache.get(table) as CollectionCacheEntry<T> | undefined;
  if (existing && now - existing.timestamp < D1_COLLECTION_CACHE_TTL_MS) {
    return structuredClone(await existing.promise);
  }

  const promise = Promise.resolve().then(loader);
  cache.set(table, { timestamp: now, promise });
  try {
    return structuredClone(await promise);
  } catch (error) {
    if (cache.get(table)?.promise === promise) cache.delete(table);
    throw error;
  }
}
