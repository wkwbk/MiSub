/**
 * Repository 仓储工厂与导出入口
 */

import { StorageFactory } from '../storage-adapter.js';
import { defaultMultiTierCache, MultiTierCache } from './multi-tier-cache.js';
import { SubscriptionRepository } from './subscription-repository.js';
import { NodeRepository } from './node-repository.js';
import { ProfileRepository } from './profile-repository.js';
import { SettingsRepository } from './settings-repository.js';
import { AccessLogRepository } from './access-log-repository.js';

export { MultiTierCache };

/**
 * 为当前请求或任务创建共享同一 StorageAdapter 的全套 Repository 实例
 * @param {Object} env
 * @param {Object|null} [context]
 * @param {Object} [options]
 */
export function createRepositories(env, context = null, options = {}) {
  if (context?.repos && !options.storage && !options.cache && options.edgeCache === undefined) {
    return context.repos;
  }

  const storage = options.storage || context?.storage || StorageFactory.createAdapter(env);
  const cache = options.cache || defaultMultiTierCache;
  const edgeCache = options.edgeCache;

  const baseOptions = { env, storage, cache, context, edgeCache };
  const repos = {
    storage,
    cache,
    subscriptions: new SubscriptionRepository(baseOptions),
    nodes: new NodeRepository(baseOptions),
    profiles: new ProfileRepository(baseOptions),
    settings: new SettingsRepository(baseOptions),
    accessLogs: new AccessLogRepository(baseOptions),
  };

  if (context && !options.storage && !options.cache && options.edgeCache === undefined) {
    context.storage = context.storage || storage;
    context.repos = repos;
  }

  return repos;
}
