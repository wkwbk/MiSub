/**
 * 手动节点与探测缓存仓储（NodeRepository）
 * - 管理 manual nodes 读取与批量延迟状态写入（db.batch）
 * - 管理节点探测缓存（DNS DoH 解析 / IP Geo）批量读穿透与批量写入
 */

import type { ManualNodeItem, MisubItem } from '@misub/core/types.js';
import type { BatchCachePutEntry, BatchItemUpdate } from '../types.js';
import { isManualNodeRecord } from '../storage/d1-schema.js';
import { BaseRepository } from './base-repository.js';

export interface NodeLatencyStatusUpdate {
  id: string;
  latency?: number;
  status?: string;
  mode?: string;
  testedAt?: string;
}

const NAMESPACE = 'nodes';
const SUBS_NAMESPACE = 'subscriptions';
const INSPECT_CACHE_NAMESPACE = 'inspect_cache';
const NODE_CACHE_TTL_MS = 30 * 1000;
const NODE_EDGE_TTL_SECONDS = 30;
const INSPECT_MEMORY_TTL_MS = 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 5 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class NodeRepository extends BaseRepository {
  invalidateCaches(): void {
    const target = this.getCacheTarget();
    this.cache.invalidateNamespaceSync(target, NAMESPACE);
    this.cache.invalidateNamespaceSync(target, SUBS_NAMESPACE);
  }

  async getAllManualNodes({ fresh = false }: { fresh?: boolean } = {}): Promise<ManualNodeItem[]> {
    const result = await this.cache.getOrLoad<ManualNodeItem[]>({
      target: this.getCacheTarget(),
      namespace: NAMESPACE,
      key: 'manual:all',
      ttlMs: NODE_CACHE_TTL_MS,
      edgeTtlSeconds: NODE_EDGE_TTL_SECONDS,
      fresh,
      edgeCache: this.edgeCache,
      loader: async () => {
        if (typeof this.storage.getManualNodes === 'function') {
          const rows = await this.storage.getManualNodes({ fresh });
          return Array.isArray(rows) ? rows : [];
        }
        const all = (await this.storage.getAllSubscriptions({ fresh })) || [];
        return all.filter((item): item is ManualNodeItem => isManualNodeRecord(item));
      },
    });
    return result ?? [];
  }

  async getById(id: string, { fresh = false }: { fresh?: boolean } = {}): Promise<ManualNodeItem | null> {
    const targetId = typeof id === 'string' ? id.trim() : '';
    if (!targetId) return null;

    return await this.cache.getOrLoad<ManualNodeItem | null>({
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
          return found && isManualNodeRecord(found) ? (found as ManualNodeItem) : null;
        }
        const all = await this.getAllManualNodes({ fresh });
        return all.find((item) => item?.id === targetId) || null;
      },
    });
  }

  async save(node: ManualNodeItem): Promise<MisubItem | null> {
    if (!node?.id) return null;
    let saved: MisubItem = node;
    if (typeof this.storage.putSubscription === 'function') {
      saved = await this.storage.putSubscription(node);
    }
    this.invalidateCaches();
    return saved;
  }

  async putMany(nodes: ManualNodeItem[] = []): Promise<boolean> {
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

  async deleteById(id: string): Promise<boolean> {
    const deleted = await this.storage.deleteSubscriptionById(id);
    this.invalidateCaches();
    return deleted;
  }

  async compareAndSwap(
    node: ManualNodeItem,
    expectedConfigVersion: number,
    options: { skipOtherTableDelete?: boolean } = {},
  ): Promise<{ updated: boolean; current: MisubItem | null }> {
    if (!node?.id) return { updated: false, current: null };
    if (typeof this.storage.compareAndSwapSubscription === 'function') {
      const result = await this.storage.compareAndSwapSubscription(node, expectedConfigVersion, options);
      if (result.updated) {
        this.invalidateCaches();
      }
      return result;
    }
    const current = await this.getById(node.id, { fresh: true });
    const currentVer = Math.max(1, Number(current?.configVersion) || 1);
    const expectedVer = Math.max(1, Number(expectedConfigVersion) || 1);
    if (!current || currentVer !== expectedVer) {
      return { updated: false, current };
    }
    const nextNode: ManualNodeItem = {
      ...node,
      configVersion: currentVer + 1,
    };
    const saved = await this.save(nextNode);
    return { updated: true, current: saved };
  }

  async deleteManyByIds(ids: string[] = []): Promise<number> {
    const uniqueIds = Array.from(
      new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean)),
    );
    if (uniqueIds.length === 0) return 0;
    if (typeof this.storage.deleteSubscriptionsByIds === 'function') {
      const count = await this.storage.deleteSubscriptionsByIds(uniqueIds);
      this.invalidateCaches();
      return count;
    }
    let deletedCount = 0;
    for (const id of uniqueIds) {
      if (await this.storage.deleteSubscriptionById(id)) deletedCount++;
    }
    this.invalidateCaches();
    return deletedCount;
  }

  /**
   * 批量更新手动节点延迟与可达状态（合并为单次 db.batch 事务）
   */
  async batchUpdateLatencyStatus(statusUpdates: NodeLatencyStatusUpdate[] = []): Promise<MisubItem[]> {
    const nowIso = new Date().toISOString();
    const updates: BatchItemUpdate[] = (Array.isArray(statusUpdates) ? statusUpdates : [])
      .filter((item) => item && typeof item.id === 'string' && item.id.trim())
      .map((item) => ({
        id: item.id.trim(),
        updater: (current: MisubItem): MisubItem => ({
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

    const updated: MisubItem[] = [];
    for (const entry of updates) {
      const result = await this.storage.updateSubscriptionById?.(entry.id, (current) => {
        const next = entry.updater(current);
        return next && typeof next === 'object' ? next : current;
      });
      if (result) updated.push(result);
    }
    this.invalidateCaches();
    return updated;
  }

  /**
   * 批量读取节点探测缓存（Tier 1 Memory -> Tier 2 Cache API -> Tier 3 D1 SELECT ... WHERE key IN (...)）
   */
  async getInspectCacheBatch(keys: string[] = [], now = Date.now()): Promise<Map<string, Record<string, unknown>>> {
    const uniqueKeys = Array.from(
      new Set((Array.isArray(keys) ? keys : []).filter((key) => typeof key === 'string' && key.trim())),
    );
    const hits = new Map<string, Record<string, unknown>>();
    if (uniqueKeys.length === 0 || !this.isAvailable()) return hits;

    const target = this.getCacheTarget();
    const missedKeys: string[] = [];

    for (const key of uniqueKeys) {
      const cached = await this.cache.get<Record<string, unknown>>({
        target,
        namespace: INSPECT_CACHE_NAMESPACE,
        key,
        ttlMs: INSPECT_MEMORY_TTL_MS,
        edgeTtlSeconds: 300,
        edgeCache: this.edgeCache,
      });
      if (cached.hit && !cached.isNullSentinel && isRecord(cached.value)) {
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
        if (!isRecord(value)) continue;
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
          if (!isRecord(cached)) return;
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
   */
  async putInspectCacheBatch(entries: BatchCachePutEntry[] = [], edgeTtlSeconds = 300): Promise<boolean> {
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
