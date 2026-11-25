/**
 * Repository 基类：统一封装存储适配器解析、可用性检查与多级缓存实例绑定
 */

import type { BoundRequestContext, Env, StorageAdapter } from '../types.js';
import { StorageFactory } from '../storage-adapter.js';
import { defaultMultiTierCache, type EdgeCacheLike, type MultiTierCache } from './multi-tier-cache.js';

export interface BaseRepositoryOptions {
  env?: Env | null;
  storage?: StorageAdapter | null;
  cache?: MultiTierCache | null;
  context?: BoundRequestContext | null;
  edgeCache?: EdgeCacheLike | null;
}

export class BaseRepository {
  env: Env | null;
  context: BoundRequestContext | null;
  storage: StorageAdapter;
  cache: MultiTierCache;
  edgeCache: EdgeCacheLike | null | undefined;

  constructor({
    env = null,
    storage = null,
    cache = defaultMultiTierCache,
    context = null,
    edgeCache = undefined,
  }: BaseRepositoryOptions = {}) {
    this.env = env;
    this.context = context;
    this.storage = storage || context?.storage || StorageFactory.createAdapter(env);
    this.cache = cache || defaultMultiTierCache;
    this.edgeCache = edgeCache;
  }

  isAvailable(): boolean {
    return Boolean(this.storage && this.storage.type !== 'noop');
  }

  getCacheTarget(): object | StorageAdapter {
    if (!this.storage || typeof this.storage !== 'object') return this.storage;
    return this.storage.db && typeof this.storage.db === 'object' ? this.storage.db : this.storage;
  }
}
