/**
 * 订阅源仓储（SubscriptionRepository）
 * - 统一管理远程机场订阅与全量订阅集合（Memory -> Cache API -> D1）
 * - 支持高频运行时状态更新的微任务合并（db.batch）
 */

import { isManualNodeRecord } from '../storage/d1-schema.js';
import { BaseRepository } from './base-repository.js';

const NAMESPACE = 'subscriptions';
const NODES_NAMESPACE = 'nodes';
const SUBSCRIPTION_CACHE_TTL_MS = 30 * 1000;
const SUBSCRIPTION_EDGE_TTL_SECONDS = 30;
const NEGATIVE_CACHE_TTL_MS = 5 * 1000;

const runtimeUpdateQueues = new WeakMap();

export class SubscriptionRepository extends BaseRepository {
  invalidateCaches() {
    const target = this.getCacheTarget();
    this.cache.invalidateNamespaceSync(target, NAMESPACE);
    this.cache.invalidateNamespaceSync(target, NODES_NAMESPACE);
  }

  async getAll({ fresh = false } = {}) {
    return await this.cache.getOrLoad({
      target: this.getCacheTarget(),
      namespace: NAMESPACE,
      key: 'all',
      ttlMs: SUBSCRIPTION_CACHE_TTL_MS,
      edgeTtlSeconds: SUBSCRIPTION_EDGE_TTL_SECONDS,
      fresh,
      edgeCache: this.edgeCache,
      loader: async () => {
        const list = await this.storage.getAllSubscriptions();
        return Array.isArray(list) ? list : [];
      },
    });
  }

  async getRemoteSubscriptions({ fresh = false } = {}) {
    return await this.cache.getOrLoad({
      target: this.getCacheTarget(),
      namespace: NAMESPACE,
      key: 'remote',
      ttlMs: SUBSCRIPTION_CACHE_TTL_MS,
      edgeTtlSeconds: SUBSCRIPTION_EDGE_TTL_SECONDS,
      fresh,
      edgeCache: this.edgeCache,
      loader: async () => {
        if (typeof this.storage.getRemoteSubscriptions === 'function') {
          const rows = await this.storage.getRemoteSubscriptions();
          return Array.isArray(rows) ? rows : [];
        }
        const all = await this.getAll({ fresh });
        return all.filter((item) => item && !isManualNodeRecord(item));
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
      ttlMs: SUBSCRIPTION_CACHE_TTL_MS,
      negativeTtlMs: NEGATIVE_CACHE_TTL_MS,
      edgeTtlSeconds: SUBSCRIPTION_EDGE_TTL_SECONDS,
      fresh,
      edgeCache: this.edgeCache,
      loader: async () => {
        if (typeof this.storage.getSubscriptionById === 'function') {
          return (await this.storage.getSubscriptionById(targetId)) || null;
        }
        const all = await this.getAll({ fresh });
        return all.find((item) => item?.id === targetId) || null;
      },
    });
  }

  async getByIds(ids = []) {
    const uniqueIds = Array.from(new Set((Array.isArray(ids) ? ids : []).filter(Boolean)));
    if (uniqueIds.length === 0) return [];
    if (typeof this.storage.getSubscriptionsByIds === 'function') {
      return (await this.storage.getSubscriptionsByIds(uniqueIds)) || [];
    }
    const idSet = new Set(uniqueIds);
    const all = await this.getAll();
    return all.filter((item) => item?.id && idSet.has(item.id));
  }

  async save(item, options = {}) {
    if (!item?.id) return null;
    let saved = item;
    if (typeof this.storage.putSubscription === 'function') {
      saved = await this.storage.putSubscription(item, options);
    } else if (typeof this.storage.syncAllSubscriptions === 'function') {
      const current = (await this.storage.getAllSubscriptions()) || [];
      const next = current.filter((entry) => entry?.id !== item.id);
      next.push(item);
      await this.storage.syncAllSubscriptions(next);
    }
    this.invalidateCaches();
    return saved;
  }

  async putMany(items = []) {
    const validItems = (Array.isArray(items) ? items : []).filter((item) => item?.id);
    if (validItems.length === 0) return true;

    if (typeof this.storage.putAllSubscriptions === 'function') {
      const result = await this.storage.putAllSubscriptions(validItems);
      this.invalidateCaches();
      return result;
    }

    for (const item of validItems) {
      await this.storage.putSubscription(item);
    }
    this.invalidateCaches();
    return true;
  }

  async syncAll(items = []) {
    const result = await this.storage.syncAllSubscriptions(Array.isArray(items) ? items : []);
    this.invalidateCaches();
    return result;
  }

  async deleteById(id) {
    const deleted = await this.storage.deleteSubscriptionById(id);
    this.invalidateCaches();
    return deleted;
  }

  async updateRuntimeState(id, updater) {
    if (!id || typeof updater !== 'function') return null;
    if (typeof this.storage.updateSubscriptionById === 'function') {
      const updated = await this.storage.updateSubscriptionById(id, updater);
      this.invalidateCaches();
      return updated;
    }
    const existing = await this.getById(id, { fresh: true });
    if (!existing) return null;
    const updated = updater({ ...existing });
    await this.save(updated);
    return updated;
  }

  async batchUpdateRuntimeStates(updates = []) {
    const validUpdates = (Array.isArray(updates) ? updates : []).filter(
      (entry) => entry && typeof entry.id === 'string' && entry.id.trim() && typeof entry.updater === 'function',
    );
    if (validUpdates.length === 0) return [];

    if (typeof this.storage.batchUpdateItemsById === 'function') {
      const updatedItems = await this.storage.batchUpdateItemsById(validUpdates, {
        preferredTable: 'subscriptions',
      });
      this.invalidateCaches();
      return updatedItems;
    }

    const updatedItems = [];
    for (const entry of validUpdates) {
      const updated = await this.updateRuntimeState(entry.id, entry.updater);
      if (updated) updatedItems.push(updated);
    }
    this.invalidateCaches();
    return updatedItems;
  }

  /**
   * 微任务合并高频运行时状态写入（如订阅节点数/流量/名称更新）
   * 使用 queueMicrotask 而不依赖 setTimeout，避免与测试假时钟冲突
   */
  enqueueRuntimeStateUpdate(id, updater) {
    const targetId = typeof id === 'string' ? id.trim() : '';
    if (!targetId || typeof updater !== 'function') {
      return Promise.resolve(null);
    }

    if (typeof this.storage.batchUpdateItemsById !== 'function') {
      return this.updateRuntimeState(targetId, updater);
    }

    const cacheTarget = this.getCacheTarget() || this.storage;
    let queueState = runtimeUpdateQueues.get(cacheTarget);
    if (!queueState) {
      queueState = { items: [], scheduled: false };
      runtimeUpdateQueues.set(cacheTarget, queueState);
    }

    return new Promise((resolve, reject) => {
      queueState.items.push({ id: targetId, updater, resolve, reject });
      if (queueState.scheduled) return;
      queueState.scheduled = true;

      queueMicrotask(async () => {
        const pending = queueState.items.splice(0, queueState.items.length);
        queueState.scheduled = false;
        if (pending.length === 0) return;

        try {
          const updatedList = await this.batchUpdateRuntimeStates(
            pending.map((entry) => ({ id: entry.id, updater: entry.updater })),
          );
          const updatedMap = new Map(updatedList.filter((item) => item?.id).map((item) => [item.id, item]));
          for (const entry of pending) {
            entry.resolve(updatedMap.get(entry.id) || null);
          }
        } catch (error) {
          for (const entry of pending) {
            entry.reject(error);
          }
        }
      });
    });
  }
}
