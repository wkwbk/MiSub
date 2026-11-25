/**
 * 节点缓存服务
 * 解决订阅拉取超时问题：缓存节点数据，快速响应客户端请求
 * @author MiSub Team
 */

import type { BoundRequestContext, StorageAdapter } from '../types.js';

export interface NodeCacheEntry {
  nodes: string;
  timestamp: number;
  nodeCount: number;
  sources: string[];
}

export type CacheStatus = 'fresh' | 'stale' | 'expired' | 'miss';

export interface NodeCacheStorageAdapter {
  db?: unknown;
  get: <T = unknown>(key: string, type?: string, options?: { fresh?: boolean }) => Promise<T | null>;
  put: (key: string, value: unknown) => Promise<unknown>;
  delete: (key: string) => Promise<unknown>;
  list?: (
    prefix?: string,
  ) => Promise<Array<string | { name: string }> | { keys?: Array<string | { name: string }> }>;
  deleteManyKeys?: (keys?: string[]) => Promise<number>;
}

export interface GetCacheOptions {
  freshTtlMs?: number;
}

export interface ClearNodeCachesOptions {
  preserveKeys?: string[];
  preserveProfileKeys?: string[];
  skipTokenCaches?: boolean;
}

/**
 * 缓存配置
 * 策略：仅首次缓存 - 首次同步获取，后续返回缓存+后台刷新
 */
const CACHE_CONFIG = {
  KEY_PREFIX: 'node_cache_', // 缓存键前缀
  FRESH_TTL: 3 * 60 * 1000, // 新鲜期：3 分钟（命中时不触发后台刷新）
  STALE_TTL: 60 * 60 * 1000, // 可用期：1 小时（超过后同步获取）
  MAX_AGE: 12 * 60 * 60 * 1000, // 最大缓存时间：12 小时
  BACKGROUND_REFRESH_TIMEOUT: 25000, // 后台刷新超时：25 秒
};

const SHRINK_PROTECTION_MIN_CACHED_NODES = 10;
const SHRINK_PROTECTION_MAX_RATIO = 0.3;

const EDGE_CACHE_VERSION_KEY = 'sub_edge_cache_version';
const EDGE_VERSION_MEMORY_TTL_MS = 10 * 1000;
let edgeVersionCaches = new WeakMap<object, { version: string; timestamp: number }>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getAdapterCacheTarget(storageAdapter?: NodeCacheStorageAdapter | StorageAdapter | null): object | null {
  if (!storageAdapter || typeof storageAdapter !== 'object') return null;
  return storageAdapter.db && typeof storageAdapter.db === 'object' ? storageAdapter.db : storageAdapter;
}

export async function getEdgeCacheVersion(
  storageAdapter?: NodeCacheStorageAdapter | StorageAdapter | null,
): Promise<string> {
  try {
    const cacheTarget = getAdapterCacheTarget(storageAdapter);
    const now = Date.now();
    if (cacheTarget) {
      const cached = edgeVersionCaches.get(cacheTarget);
      if (cached && now - cached.timestamp < EDGE_VERSION_MEMORY_TTL_MS) {
        return cached.version;
      }
    }
    if (typeof storageAdapter?.get !== 'function') return '0';
    const val = await storageAdapter.get(EDGE_CACHE_VERSION_KEY);
    let version = '0';
    if (typeof val === 'string' || typeof val === 'number') {
      version = String(val);
    } else if (isRecord(val) && val.version !== undefined) {
      version = String(val.version);
    }
    if (cacheTarget) {
      edgeVersionCaches.set(cacheTarget, { version, timestamp: now });
    }
    return version;
  } catch {
    return '0';
  }
}

async function bumpEdgeCacheVersion(
  storageAdapter?: NodeCacheStorageAdapter | StorageAdapter | null,
): Promise<string | null> {
  try {
    if (typeof storageAdapter?.put === 'function') {
      const now = Date.now();
      const version = String(now);
      await storageAdapter.put(EDGE_CACHE_VERSION_KEY, { version, updatedAt: now });
      const cacheTarget = getAdapterCacheTarget(storageAdapter);
      if (cacheTarget) {
        edgeVersionCaches.set(cacheTarget, { version, timestamp: now });
      }
      return version;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : error;
    console.warn('[Cache] Failed to bump edge cache version:', msg);
  }
  return null;
}

export function isSuspiciousNodeCountDrop(previousCount: unknown, nextCount: unknown): boolean {
  const previous = Number(previousCount);
  const next = Number(nextCount);
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return false;
  if (previous < SHRINK_PROTECTION_MIN_CACHED_NODES || next >= previous) return false;
  return next / previous < SHRINK_PROTECTION_MAX_RATIO;
}

export function isLikelyPartialAggregateNodeList(nodes: unknown): boolean {
  const lines = String(nodes || '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2 || lines.length > 3) return false;
  const hasTrafficNode = lines.some((line) => /@127\.0\.0\.1(?::443)?(?:[/?#]|$)/i.test(line));
  const hasUuidNamedNode = lines.some((line) =>
    /^(?:vless|vmess|trojan):\/\/.*#[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:$|[?&])/i.test(line),
  );
  return hasTrafficNode && hasUuidNamedNode;
}

/**
 * 生成缓存键
 */
export function generateCacheKey(type: string, identifier: string): string {
  return `${CACHE_CONFIG.KEY_PREFIX}${type}_${identifier}`;
}

function isSubscriptionNodeCacheKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    (key.startsWith(`${CACHE_CONFIG.KEY_PREFIX}subscription_`) ||
      key.startsWith(`${CACHE_CONFIG.KEY_PREFIX}subscription_url_`))
  );
}

/**
 * 获取缓存
 */
export async function getCache(
  storageAdapter: NodeCacheStorageAdapter | StorageAdapter,
  cacheKey: string,
  options: GetCacheOptions = {},
): Promise<{ data: NodeCacheEntry | null; status: CacheStatus }> {
  try {
    const cached = await storageAdapter.get<NodeCacheEntry>(cacheKey);
    if (!cached) {
      return { data: null, status: 'miss' };
    }

    const now = Date.now();
    const age = now - cached.timestamp;
    const customFreshTtl = Number(options?.freshTtlMs);
    const effectiveFreshTtl =
      Number.isFinite(customFreshTtl) && customFreshTtl > 0 ? customFreshTtl : CACHE_CONFIG.FRESH_TTL;
    const effectiveStaleTtl = Math.max(CACHE_CONFIG.STALE_TTL, effectiveFreshTtl);
    const effectiveMaxAge = Math.max(CACHE_CONFIG.MAX_AGE, effectiveFreshTtl * 2);

    if (age < effectiveFreshTtl) {
      return { data: cached, status: 'fresh' };
    } else if (age < effectiveStaleTtl) {
      return { data: cached, status: 'stale' };
    } else if (age < effectiveMaxAge) {
      return { data: cached, status: 'expired' };
    } else {
      return { data: null, status: 'miss' };
    }
  } catch (error) {
    console.error('[Cache] Failed to get cache:', error);
    return { data: null, status: 'miss' };
  }
}

/**
 * 设置缓存
 */
export async function setCache(
  storageAdapter: NodeCacheStorageAdapter | StorageAdapter,
  cacheKey: string,
  nodes: string,
  sources: string[] = [],
): Promise<boolean> {
  try {
    const nodeCount = nodes.split('\n').filter((line) => line.trim()).length;
    if (isLikelyPartialAggregateNodeList(nodes)) {
      console.warn(`[Cache] Refusing to cache a likely partial aggregate node list for ${cacheKey}`);
      return false;
    }
    const existing = await storageAdapter.get<Partial<NodeCacheEntry>>(cacheKey);
    const existingNodeCount =
      existing?.nodeCount ||
      String(existing?.nodes || '')
        .split('\n')
        .filter((line) => line.trim()).length;
    if (nodeCount === 0) {
      if (existingNodeCount > 0) {
        console.warn(`[Cache] Refusing to overwrite non-empty cache ${cacheKey} with empty node list`);
        return false;
      }
    }
    if (isSuspiciousNodeCountDrop(existingNodeCount, nodeCount)) {
      console.warn(
        `[Cache] Refusing to overwrite cache ${cacheKey} after suspicious node-count drop (${existingNodeCount} -> ${nodeCount})`,
      );
      return false;
    }

    const cacheEntry: NodeCacheEntry = {
      nodes,
      timestamp: Date.now(),
      nodeCount,
      sources,
    };

    await storageAdapter.put(cacheKey, cacheEntry);

    return true;
  } catch (error) {
    console.error('[Cache] Failed to set cache:', error);
    return false;
  }
}

/**
 * 触发后台刷新（使用 waitUntil）
 */
export function triggerBackgroundRefresh(
  context: Pick<BoundRequestContext, 'waitUntil'> | null | undefined,
  refreshFn: () => Promise<unknown>,
): void {
  if (context && typeof context.waitUntil === 'function') {
    // 使用 waitUntil 在响应后继续执行
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const refreshPromise = Promise.race([
      refreshFn(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Background refresh timeout')),
          CACHE_CONFIG.BACKGROUND_REFRESH_TIMEOUT,
        );
      }),
    ])
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn('[Cache] Background refresh failed:', msg);
      })
      .finally(() => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      });

    context.waitUntil(refreshPromise);
  } else {
    // 降级：不等待刷新完成
    console.warn('[Cache] waitUntil not available, skipping background refresh');
  }
}

/**
 * 创建缓存响应头
 */
export function createCacheHeaders(status: string, nodeCount: number): Record<string, string> {
  return {
    'X-Cache-Status': status,
    'X-Node-Count': String(nodeCount),
    'X-Cache-Time': new Date().toISOString(),
  };
}

/**
 * 获取缓存配置（供外部使用）
 */
export function getCacheConfig(): typeof CACHE_CONFIG {
  return { ...CACHE_CONFIG };
}

/**
 * 清除所有节点缓存
 */
export async function clearAllNodeCaches(
  storageAdapter: NodeCacheStorageAdapter | StorageAdapter,
  options: ClearNodeCachesOptions = {},
): Promise<{ cleared: number; failed: number; skipped: number }> {
  try {
    let cleared = 0;
    let failed = 0;
    let skipped = 0;
    const preserveKeys = new Set<string>([
      ...(Array.isArray(options?.preserveKeys) ? options.preserveKeys.filter(isSubscriptionNodeCacheKey) : []),
      ...(Array.isArray(options?.preserveProfileKeys)
        ? options.preserveProfileKeys.filter(
            (key): key is string => typeof key === 'string' && key.startsWith(`${CACHE_CONFIG.KEY_PREFIX}profile_`),
          )
        : []),
    ]);
    const skipTokenCaches = Boolean(options?.skipTokenCaches);

    if (typeof storageAdapter.list !== 'function') {
      console.warn('[Cache] Storage adapter does not support list operation');
      await bumpEdgeCacheVersion(storageAdapter);

      return { cleared, failed, skipped };
    }

    const result = await storageAdapter.list(CACHE_CONFIG.KEY_PREFIX);
    const keys = Array.isArray(result) ? result : result?.keys || [];
    const keysToDelete: string[] = [];

    for (const keyInfo of keys) {
      const key = typeof keyInfo === 'string' ? keyInfo : keyInfo.name || '';
      if (!key) continue;
      if (preserveKeys.has(key) || (skipTokenCaches && key.startsWith(`${CACHE_CONFIG.KEY_PREFIX}token_`))) {
        skipped++;
        continue;
      }
      keysToDelete.push(key);
    }

    if (keysToDelete.length > 0) {
      if (typeof storageAdapter.deleteManyKeys === 'function') {
        try {
          cleared = await storageAdapter.deleteManyKeys(keysToDelete);
        } catch {
          for (const key of keysToDelete) {
            try {
              await storageAdapter.delete(key);
              cleared++;
            } catch {
              failed++;
            }
          }
        }
      } else {
        for (const key of keysToDelete) {
          try {
            await storageAdapter.delete(key);
            cleared++;
          } catch {
            failed++;
          }
        }
      }
    }

    await bumpEdgeCacheVersion(storageAdapter);

    return { cleared, failed, skipped };
  } catch (error) {
    console.error('[Cache] Failed to clear all caches:', error);
    return { cleared: 0, failed: 0, skipped: 0 };
  }
}
