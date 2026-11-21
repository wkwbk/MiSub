/**
 * 节点缓存服务
 * 解决订阅拉取超时问题：缓存节点数据，快速响应客户端请求
 * @author MiSub Team
 */

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

export function isSuspiciousNodeCountDrop(previousCount, nextCount) {
  const previous = Number(previousCount);
  const next = Number(nextCount);
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return false;
  if (previous < SHRINK_PROTECTION_MIN_CACHED_NODES || next >= previous) return false;
  return next / previous < SHRINK_PROTECTION_MAX_RATIO;
}

export function isLikelyPartialAggregateNodeList(nodes) {
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
 * @param {string} type - 缓存类型 ('profile' | 'token')
 * @param {string} identifier - 标识符
 * @returns {string} 缓存键
 */
export function generateCacheKey(type, identifier) {
  return `${CACHE_CONFIG.KEY_PREFIX}${type}_${identifier}`;
}

function isSubscriptionNodeCacheKey(key) {
  return (
    typeof key === 'string' &&
    (key.startsWith(`${CACHE_CONFIG.KEY_PREFIX}subscription_`) ||
      key.startsWith(`${CACHE_CONFIG.KEY_PREFIX}subscription_url_`))
  );
}

/**
 * 缓存数据结构
 * @typedef {Object} CacheEntry
 * @property {string} nodes - Base64 编码的节点列表
 * @property {number} timestamp - 缓存时间戳
 * @property {number} nodeCount - 节点数量
 * @property {string[]} sources - 来源订阅名称列表
 */

/**
 * 获取缓存
 * @param {Object} storageAdapter - 存储适配器
 * @param {string} cacheKey - 缓存键
 * @returns {Promise<{data: CacheEntry|null, status: 'fresh'|'stale'|'expired'|'miss'}>}
 */
export async function getCache(storageAdapter, cacheKey) {
  try {
    const cached = await storageAdapter.get(cacheKey);
    if (!cached) {
      return { data: null, status: 'miss' };
    }

    const now = Date.now();
    const age = now - cached.timestamp;

    if (age < CACHE_CONFIG.FRESH_TTL) {
      return { data: cached, status: 'fresh' };
    } else if (age < CACHE_CONFIG.STALE_TTL) {
      return { data: cached, status: 'stale' };
    } else if (age < CACHE_CONFIG.MAX_AGE) {
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
 * @param {Object} storageAdapter - 存储适配器
 * @param {string} cacheKey - 缓存键
 * @param {string} nodes - 节点列表字符串
 * @param {string[]} sources - 来源订阅名称列表
 * @returns {Promise<boolean>}
 */
export async function setCache(storageAdapter, cacheKey, nodes, sources = []) {
  try {
    const nodeCount = nodes.split('\n').filter((line) => line.trim()).length;
    if (isLikelyPartialAggregateNodeList(nodes)) {
      console.warn(`[Cache] Refusing to cache a likely partial aggregate node list for ${cacheKey}`);
      return false;
    }
    const existing = await storageAdapter.get(cacheKey);
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

    const cacheEntry = {
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
 * @param {Object} context - Cloudflare 上下文
 * @param {Function} refreshFn - 刷新函数
 */
export function triggerBackgroundRefresh(context, refreshFn) {
  if (context && typeof context.waitUntil === 'function') {
    // 使用 waitUntil 在响应后继续执行
    const refreshPromise = Promise.race([
      refreshFn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Background refresh timeout')), CACHE_CONFIG.BACKGROUND_REFRESH_TIMEOUT),
      ),
    ]).catch((error) => {
      console.warn('[Cache] Background refresh failed:', error.message);
    });

    context.waitUntil(refreshPromise);
  } else {
    // 降级：不等待刷新完成
    console.warn('[Cache] waitUntil not available, skipping background refresh');
  }
}

/**
 * 创建缓存响应头
 * @param {string} status - 缓存状态
 * @param {number} nodeCount - 节点数量
 * @returns {Object} 响应头对象
 */
export function createCacheHeaders(status, nodeCount) {
  return {
    'X-Cache-Status': status,
    'X-Node-Count': String(nodeCount),
    'X-Cache-Time': new Date().toISOString(),
  };
}

/**
 * 获取缓存配置（供外部使用）
 */
export function getCacheConfig() {
  return { ...CACHE_CONFIG };
}

/**
 * 清除所有节点缓存
 * @param {Object} storageAdapter - 存储适配器
 * @returns {Promise<{cleared: number, failed: number}>}
 */
export async function clearAllNodeCaches(storageAdapter, options = {}) {
  try {
    let cleared = 0;
    let failed = 0;
    let skipped = 0;
    const preserveKeys = new Set(
      Array.isArray(options?.preserveKeys) ? options.preserveKeys.filter(isSubscriptionNodeCacheKey) : [],
    );

    if (typeof storageAdapter.list !== 'function') {
      console.warn('[Cache] Storage adapter does not support list operation');
      return { cleared, failed, skipped };
    }

    const result = await storageAdapter.list(CACHE_CONFIG.KEY_PREFIX);
    const keys = Array.isArray(result) ? result : result?.keys || [];

    // 删除缓存
    for (const keyInfo of keys) {
      const key = typeof keyInfo === 'string' ? keyInfo : keyInfo.name || keyInfo;
      if (preserveKeys.has(key)) {
        skipped++;
        continue;
      }
      try {
        await storageAdapter.delete(key);
        cleared++;
      } catch {
        failed++;
      }
    }

    return { cleared, failed, skipped };
  } catch (error) {
    console.error('[Cache] Failed to clear all caches:', error);
    return { cleared: 0, failed: 0, skipped: 0 };
  }
}

