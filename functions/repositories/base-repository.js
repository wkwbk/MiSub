/**
 * Repository 基类：统一封装存储适配器解析、可用性检查与多级缓存实例绑定
 */

import { StorageFactory } from '../storage-adapter.js';
import { defaultMultiTierCache } from './multi-tier-cache.js';

export class BaseRepository {
  /**
   * @param {Object} [options]
   * @param {Object|null} [options.env]
   * @param {Object|null} [options.storage]
   * @param {import('./multi-tier-cache.js').MultiTierCache} [options.cache]
   * @param {Object|null} [options.context]
   * @param {Object} [options.edgeCache]
   */
  constructor({
    env = null,
    storage = null,
    cache = defaultMultiTierCache,
    context = null,
    edgeCache = undefined,
  } = {}) {
    this.env = env;
    this.context = context;
    this.storage = storage || context?.storage || StorageFactory.createAdapter(env);
    this.cache = cache || defaultMultiTierCache;
    this.edgeCache = edgeCache;
  }

  isAvailable() {
    return Boolean(this.storage && this.storage.type !== 'noop');
  }

  getCacheTarget() {
    if (!this.storage || typeof this.storage !== 'object') return this.storage;
    return this.storage.db && typeof this.storage.db === 'object' ? this.storage.db : this.storage;
  }
}
