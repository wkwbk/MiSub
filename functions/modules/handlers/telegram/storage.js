/**
 * Telegram Bot 存储与请求级缓存模块
 */

import { StorageFactory } from '../../../storage-adapter.js';
import { STORAGE_KEY_SETTINGS } from '../../config.js';

/**
 * 获取存储适配器实例
 */
export async function getStorageAdapter(env) {
  const storageType = await StorageFactory.getStorageType(env);
  return StorageFactory.createAdapter(env, storageType);
}

export function createRequestCache() {
  return {
    storageAdapter: null,
    settings: undefined,
    subscriptions: undefined,
    profiles: undefined,
    telegramPushConfig: undefined,
  };
}

export async function getCachedStorageAdapter(env, cache) {
  if (!cache.storageAdapter) {
    cache.storageAdapter = await getStorageAdapter(env);
  }
  return cache.storageAdapter;
}

export async function getCachedSettings(env, cache) {
  if (cache.settings !== undefined) return cache.settings;
  const storageAdapter = await getCachedStorageAdapter(env, cache);
  cache.settings = (await storageAdapter.get(STORAGE_KEY_SETTINGS)) || {};
  return cache.settings;
}

export async function getCachedSubscriptions(env, cache) {
  if (cache.subscriptions !== undefined) return cache.subscriptions;
  const storageAdapter = await getCachedStorageAdapter(env, cache);
  cache.subscriptions = await storageAdapter.getAllSubscriptions();
  return cache.subscriptions;
}

export async function getCachedProfiles(env, cache) {
  if (cache.profiles !== undefined) return cache.profiles;
  const storageAdapter = await getCachedStorageAdapter(env, cache);
  cache.profiles = await storageAdapter.getAllProfiles();
  return cache.profiles;
}

export async function persistCachedSubscriptions(env, cache) {
  if (cache.subscriptions === undefined) return;
  const storageAdapter = await getCachedStorageAdapter(env, cache);
  await storageAdapter.putAllSubscriptions(cache.subscriptions);
}

export async function persistCachedProfiles(env, cache) {
  if (cache.profiles === undefined) return;
  const storageAdapter = await getCachedStorageAdapter(env, cache);
  await storageAdapter.putAllProfiles(cache.profiles);
}

export async function persistCachedSettings(env, cache) {
  if (cache.settings === undefined) return;
  const storageAdapter = await getCachedStorageAdapter(env, cache);
  await storageAdapter.put(STORAGE_KEY_SETTINGS, cache.settings);
}

/**
 * 优先走单行 D1 写入（O(1)），在未实现 putSubscription 的测试桩中回退到全量写入
 */
export async function saveSingleSubscription(storageAdapter, item, fallbackAll) {
  if (item?.id && typeof storageAdapter.putSubscription === 'function') {
    return storageAdapter.putSubscription(item);
  }
  return storageAdapter.putAllSubscriptions(fallbackAll);
}

/**
 * 优先走单行 D1 写入（O(1)），在未实现 putProfile 的测试桩中回退到全量写入
 */
export async function saveSingleProfile(storageAdapter, profile, fallbackAll) {
  if (profile?.id && typeof storageAdapter.putProfile === 'function') {
    return storageAdapter.putProfile(profile);
  }
  return storageAdapter.putAllProfiles(fallbackAll);
}

/**
 * 获取 Telegram Bot 推送配置
 */
export async function getTelegramPushConfig(env, cache = null) {
  let settings;
  if (cache) {
    settings = await getCachedSettings(env, cache);
  } else {
    const storageAdapter = await getStorageAdapter(env);
    settings = (await storageAdapter.get(STORAGE_KEY_SETTINGS)) || {};
  }
  const config = settings.telegram_push_config || {};
  const allowedUserIds = Array.isArray(config.allowed_user_ids)
    ? config.allowed_user_ids
    : env.TELEGRAM_PUSH_ALLOWED_USERS?.split(',') || [];

  return {
    enabled: config.enabled ?? true,
    bot_token: config.bot_token || env.TELEGRAM_PUSH_BOT_TOKEN,
    webhook_secret: config.webhook_secret || env.TELEGRAM_PUSH_WEBHOOK_SECRET,
    allowed_user_ids: allowedUserIds.map((id) => id?.toString().trim()).filter(Boolean),
    allow_all_users: config.allow_all_users === true,
    rate_limit: config.rate_limit || {
      max_per_minute: 1000,
      max_per_day: 10000,
    },
    default_profile_id: config.default_profile_id || '',
    auto_bind: config.auto_bind ?? true,
    user_bindings: config.user_bindings && typeof config.user_bindings === 'object' ? config.user_bindings : {},
  };
}
