/**
 * 多级缓存管理器（Memory -> Cloudflare Cache API -> D1）
 * - 按存储实例（db / storage）隔离作用域与代数（Generation）
 * - 内置 Single-Flight 请求合并（防缓存击穿）
 * - 内置空值负向哨兵缓存（防缓存穿透，写入时主动失效）
 */

import { registerCacheInvalidationListener, registerCacheResetListener } from '../storage/d1-collection-cache.js';

const DEFAULT_SCOPE_KEY = Object.freeze({ __misubDefaultScope: true });
const DEFAULT_MAX_MEMORY_ENTRIES = 256;
const REPOSITORY_CACHE_NAME = 'misub:repository';

function cloneCachedValue(value) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

async function resolveEdgeCache(edgeCache) {
  if (edgeCache !== undefined) {
    return edgeCache || null;
  }
  try {
    // 使用独立的命名 Cache 空间（misub:repository），避免与 fetch-guard 的 caches.default 响应缓存互相干扰
    if (typeof caches !== 'undefined' && typeof caches?.open === 'function') {
      return await caches.open(REPOSITORY_CACHE_NAME);
    }
  } catch {}
  return null;
}

export class MultiTierCache {
  constructor({ maxEntries = DEFAULT_MAX_MEMORY_ENTRIES, edgeCache = undefined } = {}) {
    this.maxEntries = Math.max(16, Number(maxEntries) || DEFAULT_MAX_MEMORY_ENTRIES);
    this.defaultEdgeCache = edgeCache;
    this._scopes = new WeakMap();
    this._scopeSeq = 0;
  }

  _normalizeTarget(target) {
    return target && typeof target === 'object' ? target : DEFAULT_SCOPE_KEY;
  }

  _getScope(target) {
    const scopeTarget = this._normalizeTarget(target);
    let scope = this._scopes.get(scopeTarget);
    if (!scope) {
      this._scopeSeq += 1;
      scope = {
        scopeId: `s${this._scopeSeq}_${Math.random().toString(36).slice(2, 8)}`,
        generations: new Map(),
        namespaces: new Map(),
        inflight: new Map(),
      };
      this._scopes.set(scopeTarget, scope);
    }
    return scope;
  }

  _getGeneration(scope, namespace) {
    return scope.generations.get(namespace) || 1;
  }

  _getMemoryMap(scope, namespace) {
    let nsMap = scope.namespaces.get(namespace);
    if (!nsMap) {
      nsMap = new Map();
      scope.namespaces.set(namespace, nsMap);
    }
    return nsMap;
  }

  _setMemoryEntry(scope, namespace, key, entry) {
    const nsMap = this._getMemoryMap(scope, namespace);
    if (nsMap.has(key)) {
      nsMap.delete(key);
    } else if (nsMap.size >= this.maxEntries) {
      const oldestKey = nsMap.keys().next().value;
      if (oldestKey !== undefined) {
        nsMap.delete(oldestKey);
      }
    }
    nsMap.set(key, entry);
  }

  _buildEdgeRequest(scopeId, namespace, generation, key) {
    const url = `https://cache.misub.internal/v1/${encodeURIComponent(scopeId)}/${encodeURIComponent(namespace)}/g${generation}/${encodeURIComponent(String(key))}`;
    return new Request(url, { method: 'GET' });
  }

  async _resolveEdge(edgeCache) {
    return await resolveEdgeCache(edgeCache !== undefined ? edgeCache : this.defaultEdgeCache);
  }

  async _readEdge(edge, scopeId, namespace, generation, key, now) {
    if (!edge || typeof edge.match !== 'function') return { hit: false };
    try {
      const matched = await edge.match(this._buildEdgeRequest(scopeId, namespace, generation, key));
      if (!matched) return { hit: false };
      const envelope = await matched.json();
      if (!envelope || typeof envelope !== 'object' || Number(envelope.expiresAt || 0) <= now) {
        return { hit: false };
      }
      return {
        hit: true,
        isNullSentinel: Boolean(envelope.isNullSentinel),
        value: envelope.isNullSentinel ? null : envelope.value,
        expiresAt: Number(envelope.expiresAt),
      };
    } catch {
      return { hit: false };
    }
  }

  async _writeEdge(edge, scopeId, namespace, generation, key, envelope, ttlSeconds) {
    if (!edge || typeof edge.put !== 'function') return;
    const maxAge = Math.max(1, Math.floor(Number(ttlSeconds) || 1));
    try {
      const req = this._buildEdgeRequest(scopeId, namespace, generation, key);
      const res = new Response(JSON.stringify(envelope), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${maxAge}`,
        },
      });
      await edge.put(req, res);
    } catch {}
  }

  getSyncFromMemory({ target, namespace, key, now = Date.now() }) {
    const scope = this._getScope(target);
    const nsMap = scope.namespaces.get(namespace);
    if (!nsMap) return { hit: false };
    const entry = nsMap.get(key);
    if (!entry) return { hit: false };
    if (entry.expiresAt <= now) {
      nsMap.delete(key);
      return { hit: false };
    }
    return {
      hit: true,
      isNullSentinel: Boolean(entry.isNullSentinel),
      value: entry.isNullSentinel ? null : cloneCachedValue(entry.value),
    };
  }

  /**
   * @param {{
   *   target?: any,
   *   namespace?: string,
   *   key?: string,
   *   ttlMs?: number,
   *   edgeTtlSeconds?: number,
   *   edgeCache?: any,
   * }} [options]
   */
  async get({ target, namespace, key, ttlMs = 30000, edgeTtlSeconds = 0, edgeCache = undefined } = {}) {
    const scope = this._getScope(target);
    const now = Date.now();
    const memHit = this.getSyncFromMemory({ target, namespace, key, now });
    if (memHit.hit) {
      return {
        hit: true,
        tier: 'memory',
        isNullSentinel: memHit.isNullSentinel,
        value: memHit.value,
      };
    }

    const edge = await this._resolveEdge(edgeCache);
    if (edge && edgeTtlSeconds > 0) {
      const gen = this._getGeneration(scope, namespace);
      const edgeHit = await this._readEdge(edge, scope.scopeId, namespace, gen, key, now);
      if (edgeHit.hit) {
        const ttlWindowMs = Number(ttlMs) || 30000;
        const memExpiresAt = Math.min(Number(edgeHit.expiresAt) || now + ttlWindowMs, now + ttlWindowMs);
        this._setMemoryEntry(scope, namespace, key, {
          isNullSentinel: edgeHit.isNullSentinel,
          value: edgeHit.isNullSentinel ? null : cloneCachedValue(edgeHit.value),
          expiresAt: memExpiresAt,
        });
        return {
          hit: true,
          tier: 'edge',
          isNullSentinel: edgeHit.isNullSentinel,
          value: edgeHit.isNullSentinel ? null : cloneCachedValue(edgeHit.value),
        };
      }
    }

    return { hit: false, tier: 'miss', isNullSentinel: false, value: null };
  }

  /**
   * @param {{
   *   target?: any,
   *   namespace?: string,
   *   key?: string,
   *   value?: any,
   *   ttlMs?: number,
   *   edgeTtlSeconds?: number,
   *   isNullSentinel?: boolean,
   *   edgeCache?: any,
   * }} [options]
   */
  async set({
    target,
    namespace,
    key,
    value,
    ttlMs = 30000,
    edgeTtlSeconds = 0,
    isNullSentinel = false,
    edgeCache = undefined,
  } = {}) {
    const scope = this._getScope(target);
    const now = Date.now();
    const safeTtlMs = Math.max(1, Number(ttlMs) || 30000);
    const storedValue = isNullSentinel ? null : cloneCachedValue(value);
    const entry = {
      isNullSentinel: Boolean(isNullSentinel),
      value: storedValue,
      expiresAt: now + safeTtlMs,
    };
    this._setMemoryEntry(scope, namespace, key, entry);

    const edge = await this._resolveEdge(edgeCache);
    const effectiveEdgeTtl = isNullSentinel
      ? edge && edgeTtlSeconds > 0
        ? Math.max(1, Math.ceil(safeTtlMs / 1000))
        : 0
      : Math.max(0, Number(edgeTtlSeconds) || 0);

    if (edge && effectiveEdgeTtl > 0) {
      const gen = this._getGeneration(scope, namespace);
      const edgeExpiresAt = now + effectiveEdgeTtl * 1000;
      await this._writeEdge(
        edge,
        scope.scopeId,
        namespace,
        gen,
        key,
        {
          isNullSentinel: Boolean(isNullSentinel),
          value: storedValue,
          expiresAt: edgeExpiresAt,
        },
        effectiveEdgeTtl,
      );
    }
  }

  /**
   * 三级缓存读穿透（带并发请求合并与空值穿透防护）
   * @param {{
   *   target?: any,
   *   namespace?: string,
   *   key?: string,
   *   ttlMs?: number,
   *   negativeTtlMs?: number,
   *   edgeTtlSeconds?: number,
   *   fresh?: boolean,
   *   edgeCache?: any,
   *   loader: () => Promise<any>,
   * }} options
   */
  async getOrLoad({
    target,
    namespace,
    key,
    ttlMs = 30000,
    negativeTtlMs = 0,
    edgeTtlSeconds = 0,
    fresh = false,
    edgeCache = undefined,
    loader,
  }) {
    const scope = this._getScope(target);
    const gen = this._getGeneration(scope, namespace);

    if (!fresh) {
      const cached = await this.get({ target, namespace, key, ttlMs, edgeTtlSeconds, edgeCache });
      if (cached.hit) {
        return cached.isNullSentinel ? null : cached.value;
      }
    }

    const inflightKey = `${namespace}:${gen}:${String(key)}`;
    if (!fresh && scope.inflight.has(inflightKey)) {
      const sharedResult = await scope.inflight.get(inflightKey);
      return cloneCachedValue(sharedResult);
    }

    const loadPromise = (async () => {
      const loaded = await loader();
      if (loaded === null || loaded === undefined) {
        if (negativeTtlMs > 0) {
          await this.set({
            target,
            namespace,
            key,
            value: null,
            ttlMs: negativeTtlMs,
            edgeTtlSeconds,
            isNullSentinel: true,
            edgeCache,
          });
        }
        return null;
      }

      await this.set({
        target,
        namespace,
        key,
        value: loaded,
        ttlMs,
        edgeTtlSeconds,
        isNullSentinel: false,
        edgeCache,
      });
      return loaded;
    })();

    if (!fresh) {
      scope.inflight.set(inflightKey, loadPromise);
    }

    try {
      const result = await loadPromise;
      return cloneCachedValue(result);
    } finally {
      if (scope.inflight.get(inflightKey) === loadPromise) {
        scope.inflight.delete(inflightKey);
      }
    }
  }

  async invalidateKey(target, namespace, key, { edgeCache = undefined } = {}) {
    const scope = this._getScope(target);
    scope.namespaces.get(namespace)?.delete(key);

    const gen = this._getGeneration(scope, namespace);
    scope.inflight.delete(`${namespace}:${gen}:${String(key)}`);

    const edge = await this._resolveEdge(edgeCache);
    if (edge && typeof edge.delete === 'function') {
      try {
        await edge.delete(this._buildEdgeRequest(scope.scopeId, namespace, gen, key));
      } catch {}
    }
  }

  invalidateNamespaceSync(target, namespace) {
    const scope = this._getScope(target);
    scope.namespaces.delete(namespace);
    const nextGen = this._getGeneration(scope, namespace) + 1;
    scope.generations.set(namespace, nextGen);

    const inflightPrefix = `${namespace}:`;
    for (const inflightKey of Array.from(scope.inflight.keys())) {
      if (inflightKey.startsWith(inflightPrefix)) {
        scope.inflight.delete(inflightKey);
      }
    }
  }

  async invalidateNamespace(target, namespace) {
    this.invalidateNamespaceSync(target, namespace);
  }

  clearMemory(target = null) {
    if (target) {
      const scope = this._scopes.get(this._normalizeTarget(target));
      scope?.namespaces.clear();
      return;
    }
    this._scopes = new WeakMap();
  }

  reset() {
    this._scopes = new WeakMap();
    this._scopeSeq = 0;
  }
}

export const defaultMultiTierCache = new MultiTierCache();

export function resetAllMultiTierCaches() {
  defaultMultiTierCache.reset();
}

registerCacheResetListener(() => {
  defaultMultiTierCache.reset();
});

registerCacheInvalidationListener((target, namespace, key) => {
  if (!namespace) return;
  if (namespace === 'subscriptions' || namespace === 'nodes') {
    defaultMultiTierCache.invalidateNamespaceSync(target, 'subscriptions');
    defaultMultiTierCache.invalidateNamespaceSync(target, 'nodes');
    return;
  }
  if (key) {
    defaultMultiTierCache.invalidateKey(target, namespace, key).catch(() => {});
    return;
  }
  defaultMultiTierCache.invalidateNamespaceSync(target, namespace);
});
