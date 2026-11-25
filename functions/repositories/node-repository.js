/**
 * 手动节点与探测缓存仓储（NodeRepository）
 * - 管理 manual nodes 读取与批量延迟状态写入（db.batch）
 * - 管理节点探测缓存（DNS DoH 解析 / IP Geo）批量读穿透与批量写入
 */

import { isManualNodeRecord } from '../storage/d1-schema.js';
import { BaseRepository } from './base-repository.js';

const NAMESPACE = 'nodes';
const SUBS_NAMESPACE = 'subscriptions';
const INSPECT_CACHE_NAMESPACE = 'inspect_cache';
const NODE_CACHE_TTL_MS = 30 * 1000;
const NODE_EDGE_TTL_SECONDS = 30;
const INSPECT_MEMORY_TTL_MS = 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 5 * 1000;

export class NodeRepository extends BaseRepository {
  invalidateCaches() {
    const target = this.getCacheTarget();
    this.cache.invalidateNamespaceSync(target, NAMESPACE);
    this.cache.invalidateNamespaceSync(target, SUBS_NAMESPACE);
  }

  async getAllManualNodes({ fresh = false } = {}) {
    return await this.cache.getOrLoad({
      target: this.getCacheTarget(),
      namespace: NAMESPACE,
      key: 'manual:all',
      ttlMs: NODE_CACHE_TTL_MS,
      edgeTtlSeconds: NODE_EDGE_TTL_SECONDS,
      fresh,
      edgeCache: this.edgeCache,
      loader: async () => {
        if (typeof this.storage.getManualNodes === 'function') {
          const rows = await this.storage.getManualNodes();
          return Array.isArray(rows) ? rows : [];
        }
        const all = (await this.storage.getAllSubscriptions()) || [];
        return all.filter((item) => isManualNodeRecord(item));
      },
    });
  }

  async getById(id, { fresh = false } = {}) {
    const targetId = typeof id === 'string' ? id.trim() : '';
    if (!targetId) return null;

    return await this.cache.getOrLoad({
      target: this.getCacheTarget(),
      namespace: NAMESPACE,
      key: `id:${targetId}`,
      ttlMs: NODE_CACHE_TTL_MS,
      negativeTtlMs: NEGATIVE_CACHE_TTL_MS,
      edgeTtlSeconds: NODE_EDGE_TTL_SECONDS,
      fresh,
      edgeCache: this.edgeCache,
      loader: async () => {
        if (typeof this.storage.getSubscriptionById === 'function') {
          const found = await this.storage.getSubscriptionById(targetId);
          return found && isManualNodeRecord(found) ? found : null;
        }
        const all = await this.getAllManualNodes({ fresh });
        return all.find((item) => item?.id === targetId) || null;
      },
    });
  }

  async save(node) {
    if (!node?.id) return null;
    let saved = node;
    if (typeof this.storage.putSubscription === 'function') {
      saved = await this.storage.putSubscription(node);
    }
    this.invalidateCaches();
    return saved;
  }

  async putMany(nodes = []) {
    const validNodes = (Array.isArray(nodes) ? nodes : []).filter((node) => node?.id);
    if (validNodes.length === 0) return true;

    if (typeof this.storage.putAllSubscriptions === 'function') {
      const result = await this.storage.putAllSubscriptions(validNodes);
      this.invalidateCaches();
      return result;
    }

    for (const node of validNodes) {
      await this.storage.putSubscription(node);
    }
    this.invalidateCaches();
    return true;
  }

  async deleteById(id) {
    const deleted = await this.storage.deleteSubscriptionById(id);
    this.invalidateCaches();
    return deleted;
  }

  /**
   * 批量更新手动节点延迟与可达状态（合并为单次 db.batch 事务）
   * @param {Array<{ id: string, latency?: number, status?: string, mode?: string, testedAt?: string }>} statusUpdates
   */
  async batchUpdateLatencyStatus(statusUpdates = []) {
    const nowIso = new Date().toISOString();
    const updates = (Array.isArray(statusUpdates) ? statusUpdates : [])
      .filter((item) => item && typeof item.id === 'string' && item.id.trim())
      .map((item) => ({
        id: item.id.trim(),
        updater: (current) => ({
          ...current,
          ...(item.latency !== undefined ? { latency: item.latency } : {}),
          ...(item.status !== undefined ? { status: item.status } : {}),
          ...(item.mode !== undefined ? { latencyMode: item.mode } : {}),
          lastTestedAt: item.testedAt || nowIso,
          updatedAt: nowIso,
        }),
      }));

    if (updates.length === 0) return [];

    if (typeof this.storage.batchUpdateItemsById === 'function') {
      const updated = await this.storage.batchUpdateItemsById(updates, { preferredTable: 'nodes' });
      this.invalidateCaches();
      return updated;
    }

    const updated = [];
    for (const entry of updates) {
      const result = await this.storage.updateSubscriptionById?.(entry.id, entry.updater);
      if (result) updated.push(result);
    }
    this.invalidateCaches();
    return updated;
  }

  /**
   * 批量读取节点探测缓存（Tier 1 Memory -> Tier 2 Cache API -> Tier 3 D1 SELECT ... WHERE key IN (...)）
   */
  async getInspectCacheBatch(keys = [], now = Date.now()) {
    const uniqueKeys = Array.from(
      new Set((Array.isArray(keys) ? keys : []).filter((key) => typeof key === 'string' && key.trim())),
    );
    const hits = new Map();
    if (uniqueKeys.length === 0 || !this.isAvailable()) return hits;

    const target = this.getCacheTarget();
    const missedKeys = [];

    for (const key of uniqueKeys) {
      const cached = await this.cache.get({
        target,
        namespace: INSPECT_CACHE_NAMESPACE,
        key,
        ttlMs: INSPECT_MEMORY_TTL_MS,
        edgeTtlSeconds: 300,
        edgeCache: this.edgeCache,
      });
      if (cached.hit && !cached.isNullSentinel && cached.value && typeof cached.value === 'object') {
        if (!cached.value.expiresAt || Number(cached.value.expiresAt) > now) {
          hits.set(key, cached.value);
          continue;
        }
      }
      missedKeys.push(key);
    }

    if (missedKeys.length === 0) {
      return hits;
    }

    if (typeof this.storage.getManyCacheEntries === 'function') {
      const dbHits = await this.storage.getManyCacheEntries(missedKeys, now);
      for (const [key, value] of dbHits.entries()) {
        if (!value || typeof value !== 'object') continue;
        if (value.expiresAt && Number(value.expiresAt) <= now) continue;
        hits.set(key, value);
        await this.cache.set({
          target,
          namespace: INSPECT_CACHE_NAMESPACE,
          key,
          value,
          ttlMs: INSPECT_MEMORY_TTL_MS,
          edgeTtlSeconds: 0,
          edgeCache: this.edgeCache,
        });
      }
      return hits;
    }

    // 降级：兼容仅实现 get() 的测试 Mock 适配器
    await Promise.allSettled(
      missedKeys.map(async (key) => {
        try {
          const cached = await this.storage.get(key);
          if (!cached || typeof cached !== 'object') return;
          if (cached.expiresAt && Number(cached.expiresAt) <= now) return;
          hits.set(key, cached);
          await this.cache.set({
            target,
            namespace: INSPECT_CACHE_NAMESPACE,
            key,
            value: cached,
            ttlMs: INSPECT_MEMORY_TTL_MS,
            edgeTtlSeconds: 0,
            edgeCache: this.edgeCache,
          });
        } catch {}
      }),
    );

    return hits;
  }

  /**
   * 批量写入节点探测缓存（合并为单次 db.batch）
   * @param {Array<{ key: string, value: any, expiresAt?: number | null }>} entries
   */
  async putInspectCacheBatch(entries = [], edgeTtlSeconds = 300) {
    const validEntries = (Array.isArray(entries) ? entries : []).filter(
      (entry) => entry && typeof entry.key === 'string' && entry.key.trim() && entry.value !== undefined,
    );
    if (validEntries.length === 0 || !this.isAvailable()) return true;

    const target = this.getCacheTarget();

    if (typeof this.storage.putManyCacheEntries === 'function') {
      await this.storage.putManyCacheEntries(validEntries);
    } else {
      for (const entry of validEntries) {
        await this.storage.put(entry.key, entry.value);
      }
    }

    await Promise.allSettled(
      validEntries.map((entry) =>
        this.cache.set({
          target,
          namespace: INSPECT_CACHE_NAMESPACE,
          key: entry.key,
          value: entry.value,
          ttlMs: INSPECT_MEMORY_TTL_MS,
          edgeTtlSeconds,
          edgeCache: this.edgeCache,
        }),
      ),
    );

    return true;
  }
}
