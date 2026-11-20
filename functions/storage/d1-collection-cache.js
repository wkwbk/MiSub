/**
 * D1 表级内存短缓存（按 D1 实例隔离，带并发请求合并）
 */

const D1_COLLECTION_CACHE_TTL_MS = 30 * 1000;
const d1CollectionCaches = new WeakMap();

export function getD1CollectionCache(database) {
  let cache = d1CollectionCaches.get(database);
  if (!cache) {
    cache = new Map();
    d1CollectionCaches.set(database, cache);
  }
  return cache;
}

export function invalidateD1CollectionCache(database, table) {
  getD1CollectionCache(database).delete(table);
}

export async function readCachedD1Collection(database, table, loader) {
  const cache = getD1CollectionCache(database);
  const now = Date.now();
  const existing = cache.get(table);
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
