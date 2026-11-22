/**
 * 订阅拉取防刷与边缘缓存保护模块
 * - 温和模式 (cache)：在最小间隔内通过 Cloudflare Edge Cache (caches.default) 直接返回已生成响应，
 *   同时配合节点缓存 FRESH_TTL 避免高频回源、D1 写入和日志/通知刷屏。
 * - 严格模式 (strict)：按订阅 + 客户端 IP 维度限制最小拉取间隔，间隔内返回 429 Too Many Requests。
 */

export const DEFAULT_SUB_FETCH_MIN_INTERVAL = 15; // 分钟
export const MAX_SUB_FETCH_MIN_INTERVAL = 1440; // 24 小时
export const DEFAULT_SUB_FETCH_LIMIT_MODE = 'cache';

const STRICT_COOLDOWN_MEMORY_LIMIT = 500;
const ISOLATE_RESPONSE_CACHE_LIMIT = 64;
const strictCooldownMemory = new Map();
let isolateResponseCaches = new WeakMap();

function getIsolateResponseCacheMap(storageAdapter) {
  if (!storageAdapter || typeof storageAdapter !== 'object') return null;
  const target = storageAdapter.db && typeof storageAdapter.db === 'object' ? storageAdapter.db : storageAdapter;
  let map = isolateResponseCaches.get(target);
  if (!map) {
    map = new Map();
    isolateResponseCaches.set(target, map);
  }
  return map;
}

function pruneIsolateResponseCache(map, now) {
  if (!map || map.size <= ISOLATE_RESPONSE_CACHE_LIMIT) return;
  for (const [key, entry] of map.entries()) {
    if (entry.expiresAt <= now) {
      map.delete(key);
    }
  }
  while (map.size > ISOLATE_RESPONSE_CACHE_LIMIT) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

function clampIntervalMinutes(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 0) return 0;
  return Math.min(MAX_SUB_FETCH_MIN_INTERVAL, Math.max(1, Math.round(num)));
}

/**
 * 解析生效的订阅拉取保护策略
 * 优先级：Profile 覆盖 > 全局设置 > 默认值（15 分钟 + cache 模式）
 * @param {Object|null} profile
 * @param {Object|null} config
 */
export function resolveFetchGuardPolicy(profile, config) {
  let minIntervalMinutes = DEFAULT_SUB_FETCH_MIN_INTERVAL;

  const profileRawInterval = profile?.fetchMinInterval;
  if (profileRawInterval !== undefined && profileRawInterval !== null && profileRawInterval !== '') {
    const parsed = clampIntervalMinutes(profileRawInterval);
    if (parsed !== null) {
      minIntervalMinutes = parsed;
    }
  } else {
    const globalRawInterval = config?.subFetchMinInterval;
    if (globalRawInterval !== undefined && globalRawInterval !== null && globalRawInterval !== '') {
      const parsed = clampIntervalMinutes(globalRawInterval);
      if (parsed !== null) {
        minIntervalMinutes = parsed;
      }
    }
  }

  let mode = DEFAULT_SUB_FETCH_LIMIT_MODE;
  const profileRawMode = profile?.fetchLimitMode;
  if (profileRawMode === 'strict' || profileRawMode === 'cache') {
    mode = profileRawMode;
  } else if (config?.subFetchLimitMode === 'strict' || config?.subFetchLimitMode === 'cache') {
    mode = config.subFetchLimitMode;
  }

  return {
    enabled: minIntervalMinutes > 0,
    minIntervalMinutes,
    minIntervalSeconds: minIntervalMinutes * 60,
    minIntervalMs: minIntervalMinutes * 60 * 1000,
    mode,
  };
}

function getDefaultEdgeCache() {
  if (typeof caches !== 'undefined' && caches && caches.default) {
    return caches.default;
  }
  return null;
}

function hashShortKey(input) {
  const text = String(input || '');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code + i;
    h2 = Math.imul(h2, 0x811c9dc5) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

/**
 * 构造 Cloudflare Edge Cache 的规范化缓存键 Request
 */
export function buildEdgeCacheRequest({
  requestUrl,
  targetFormat = 'base64',
  isMeta = false,
  cacheVersion = '0',
  isProfileExpired = false,
}) {
  const url = new URL(requestUrl);
  const normalizedParams = new URLSearchParams();
  const excludedParams = new Set(['refresh', 'nocache', 'debug', 'callback_token']);

  const entries = Array.from(url.searchParams.entries())
    .filter(([key]) => !excludedParams.has(key))
    .sort(([aKey, aVal], [bKey, bVal]) => (aKey === bKey ? aVal.localeCompare(bVal) : aKey.localeCompare(bKey)));

  for (const [key, value] of entries) {
    normalizedParams.append(key, value);
  }

  normalizedParams.set('__fmt', String(targetFormat || 'base64'));
  normalizedParams.set('__meta', isMeta ? '1' : '0');
  normalizedParams.set('__exp', isProfileExpired ? '1' : '0');
  normalizedParams.set('__v', String(cacheVersion || '0'));

  const cacheUrl = `${url.origin}${url.pathname}?${normalizedParams.toString()}`;
  return new Request(cacheUrl, { method: 'GET' });
}

/**
 * 读取缓存的订阅响应（优先 Isolate 内存缓存，再查 Cloudflare Edge Cache，兼容 workers.dev / pages.dev）
 */
export async function readEdgeCachedResponse(cacheRequest, storageAdapter = null) {
  if (!cacheRequest) return null;
  const cacheKeyUrl = typeof cacheRequest === 'string' ? cacheRequest : cacheRequest.url;
  const now = Date.now();

  const isolateMap = getIsolateResponseCacheMap(storageAdapter);
  if (isolateMap) {
    const memEntry = isolateMap.get(cacheKeyUrl);
    if (memEntry) {
      if (memEntry.expiresAt > now) {
        const headers = new Headers(memEntry.headers);
        headers.set('Cache-Control', 'no-store, no-cache');
        headers.set('X-MiSub-Edge-Cache', 'HIT');
        headers.set('X-Cache-Status', 'EDGE-HIT');
        return new Response(memEntry.body, {
          status: memEntry.status,
          statusText: memEntry.statusText,
          headers,
        });
      }
      isolateMap.delete(cacheKeyUrl);
    }
  }

  const edgeCache = getDefaultEdgeCache();
  if (!edgeCache) return null;

  try {
    const matched = await edgeCache.match(cacheRequest);
    if (!matched) return null;

    const headers = new Headers(matched.headers);
    headers.set('Cache-Control', 'no-store, no-cache');
    headers.set('X-MiSub-Edge-Cache', 'HIT');
    headers.set('X-Cache-Status', 'EDGE-HIT');

    return new Response(matched.body, {
      status: matched.status,
      statusText: matched.statusText,
      headers,
    });
  } catch (error) {
    console.warn('[FetchGuard] Edge cache read failed:', error?.message || error);
    return null;
  }
}

/**
 * 将 200 订阅响应写入 Isolate 内存缓存与 Cloudflare Edge Cache（不影响返回给客户端的 no-store 响应头）
 */
export function writeEdgeCachedResponse(context, cacheRequest, response, ttlSeconds, storageAdapter = null) {
  if (!cacheRequest || !response || response.status !== 200) return;
  const safeTtl = Math.max(1, Math.round(Number(ttlSeconds) || 0));
  if (!Number.isFinite(safeTtl) || safeTtl <= 0) return;

  const cacheKeyUrl = typeof cacheRequest === 'string' ? cacheRequest : cacheRequest.url;
  const isolateMap = getIsolateResponseCacheMap(storageAdapter);
  const edgeCache = getDefaultEdgeCache();
  if (!isolateMap && !edgeCache) return;

  try {
    const cloned = response.clone();
    const headers = new Headers(cloned.headers);
    headers.delete('Set-Cookie');
    headers.set('Cache-Control', `public, max-age=${safeTtl}`);
    headers.set('X-MiSub-Edge-Cache-TTL', String(safeTtl));

    const asyncTasks = [];

    if (isolateMap) {
      const memClone = cloned.clone();
      const headerEntries = Array.from(headers.entries());
      const now = Date.now();
      const memTask = memClone
        .arrayBuffer()
        .then((buf) => {
          isolateMap.set(cacheKeyUrl, {
            body: buf,
            status: memClone.status,
            statusText: memClone.statusText,
            headers: headerEntries,
            expiresAt: now + safeTtl * 1000,
          });
          pruneIsolateResponseCache(isolateMap, now);
        })
        .catch(() => {});
      asyncTasks.push(memTask);
    }

    if (edgeCache) {
      const cacheableResponse = new Response(cloned.body, {
        status: cloned.status,
        statusText: cloned.statusText,
        headers,
      });

      const putPromise = edgeCache.put(cacheRequest, cacheableResponse).catch((error) => {
        console.warn('[FetchGuard] Edge cache write failed:', error?.message || error);
      });
      asyncTasks.push(putPromise);
    }

    if (asyncTasks.length > 0 && context && typeof context.waitUntil === 'function') {
      context.waitUntil(Promise.all(asyncTasks));
    }
  } catch (error) {
    console.warn('[FetchGuard] Failed to prepare edge cache write:', error?.message || error);
  }
}

function buildStrictCooldownKey(scopeKey, clientIp) {
  const safeScope = hashShortKey(scopeKey || 'default');
  const safeIp = hashShortKey(clientIp || 'unknown');
  return `${safeScope}:${safeIp}`;
}

function buildStrictCooldownCacheRequest(origin, cooldownKey) {
  const safeOrigin = origin && /^https?:\/\//i.test(origin) ? origin : 'https://misub-ratelimit.invalid';
  return new Request(`${safeOrigin}/__misub_ratelimit/${encodeURIComponent(cooldownKey)}`, { method: 'GET' });
}

function pruneStrictCooldownMemory(now) {
  if (strictCooldownMemory.size <= STRICT_COOLDOWN_MEMORY_LIMIT) return;
  for (const [key, expiresAt] of strictCooldownMemory.entries()) {
    if (expiresAt <= now) {
      strictCooldownMemory.delete(key);
    }
  }
  while (strictCooldownMemory.size > STRICT_COOLDOWN_MEMORY_LIMIT) {
    const oldestKey = strictCooldownMemory.keys().next().value;
    if (oldestKey === undefined) break;
    strictCooldownMemory.delete(oldestKey);
  }
}

/**
 * 检查严格限流冷却窗口（优先内存，再查 Edge Cache，避免 D1 写入）
 */
export async function checkStrictFetchCooldown({ origin, scopeKey, clientIp, minIntervalMs, now = Date.now() }) {
  if (!minIntervalMs || minIntervalMs <= 0) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  const cooldownKey = buildStrictCooldownKey(scopeKey, clientIp);
  const memExpiresAt = strictCooldownMemory.get(cooldownKey) || 0;
  if (memExpiresAt > now) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((memExpiresAt - now) / 1000)),
    };
  }

  const edgeCache = getDefaultEdgeCache();
  if (edgeCache) {
    try {
      const markerReq = buildStrictCooldownCacheRequest(origin, cooldownKey);
      const matched = await edgeCache.match(markerReq);
      if (matched) {
        const text = await matched.text();
        const expiresAt = Number(text);
        if (Number.isFinite(expiresAt) && expiresAt > now) {
          strictCooldownMemory.set(cooldownKey, expiresAt);
          pruneStrictCooldownMemory(now);
          return {
            limited: true,
            retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
          };
        }
      }
    } catch (error) {
      console.warn('[FetchGuard] Strict cooldown read failed:', error?.message || error);
    }
  }

  return { limited: false, retryAfterSeconds: 0 };
}

/**
 * 记录一次成功放行的拉取时间，启动严格限流冷却窗口
 */
export function recordStrictFetchCooldown({ context, origin, scopeKey, clientIp, minIntervalMs, now = Date.now() }) {
  if (!minIntervalMs || minIntervalMs <= 0) return;

  const cooldownKey = buildStrictCooldownKey(scopeKey, clientIp);
  const expiresAt = now + minIntervalMs;
  strictCooldownMemory.set(cooldownKey, expiresAt);
  pruneStrictCooldownMemory(now);

  const edgeCache = getDefaultEdgeCache();
  if (!edgeCache) return;

  try {
    const ttlSeconds = Math.max(1, Math.ceil(minIntervalMs / 1000));
    const markerReq = buildStrictCooldownCacheRequest(origin, cooldownKey);
    const markerRes = new Response(String(expiresAt), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': `public, max-age=${ttlSeconds}`,
      },
    });
    const putPromise = edgeCache.put(markerReq, markerRes).catch((error) => {
      console.warn('[FetchGuard] Strict cooldown write failed:', error?.message || error);
    });
    if (context && typeof context.waitUntil === 'function') {
      context.waitUntil(putPromise);
    }
  } catch (error) {
    console.warn('[FetchGuard] Failed to record strict cooldown:', error?.message || error);
  }
}

/**
 * 构造严格模式 429 响应
 */
export function createStrictRateLimitResponse(retryAfterSeconds, minIntervalMinutes) {
  const safeRetryAfter = Math.max(1, Math.ceil(Number(retryAfterSeconds) || 60));
  return new Response(
    `Too Many Requests: subscription fetch interval is limited to once every ${minIntervalMinutes} minute(s). Please retry after ${safeRetryAfter}s.`,
    {
      status: 429,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache',
        'Retry-After': String(safeRetryAfter),
        'X-MiSub-Rate-Limit': 'strict',
        'X-MiSub-Min-Interval-Minutes': String(minIntervalMinutes),
      },
    },
  );
}

export function resetStrictCooldownMemoryForTests() {
  strictCooldownMemory.clear();
  isolateResponseCaches = new WeakMap();
}
