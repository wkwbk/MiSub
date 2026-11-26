/**
 * Telegram Bot 存储与请求级缓存模块
 */

import type { MisubItem, ProfileConfig } from '@misub/core/types.js';
import type { Env, StorageAdapter } from '../../../types.js';
import { StorageFactory } from '../../../storage-adapter.js';
import { STORAGE_KEY_SETTINGS } from '../../config.js';
import { isRecord } from './utils.js';

export type TelegramSubscriptionItem = MisubItem & {
  source?: string;
  telegram_user_id?: number | string;
  created_at?: string;
};

interface TelegramRateLimitConfig {
  maxPerMinute: number;
  maxPerDay: number;
}

export interface TelegramPushConfig {
  enabled: boolean;
  botToken: string;
  webhookSecret: string;
  allowedUserIds: string[];
  allowAllUsers: boolean;
  rateLimit: TelegramRateLimitConfig;
  defaultProfileId: string;
  autoBind: boolean;
  userBindings: Record<string, string>;
}

export interface TelegramRequestCache {
  storageAdapter: StorageAdapter | null;
  settings: Record<string, unknown> | undefined;
  subscriptions: TelegramSubscriptionItem[] | undefined;
  profiles: ProfileConfig[] | undefined;
  telegramPushConfig: TelegramPushConfig | undefined;
}

/**
 * 获取存储适配器实例
 */
export async function getStorageAdapter(env: Env): Promise<StorageAdapter> {
  return StorageFactory.createAdapter(env) as unknown as StorageAdapter;
}

export function createRequestCache(): TelegramRequestCache {
  return {
    storageAdapter: null,
    settings: undefined,
    subscriptions: undefined,
    profiles: undefined,
    telegramPushConfig: undefined,
  };
}

export async function getCachedStorageAdapter(env: Env, cache: TelegramRequestCache): Promise<StorageAdapter> {
  if (!cache.storageAdapter) {
    cache.storageAdapter = await getStorageAdapter(env);
  }
  return cache.storageAdapter;
}

export async function getCachedSettings(env: Env, cache: TelegramRequestCache): Promise<Record<string, unknown>> {
  if (cache.settings !== undefined) return cache.settings;
  const storageAdapter = await getCachedStorageAdapter(env, cache);
  const loaded = await storageAdapter.get<Record<string, unknown>>(STORAGE_KEY_SETTINGS);
  cache.settings = isRecord(loaded) ? loaded : {};
  return cache.settings;
}

export async function getCachedSubscriptions(
  env: Env,
  cache: TelegramRequestCache,
): Promise<TelegramSubscriptionItem[]> {
  if (cache.subscriptions !== undefined) return cache.subscriptions;
  const storageAdapter = await getCachedStorageAdapter(env, cache);
  cache.subscriptions = (await storageAdapter.getAllSubscriptions()) as TelegramSubscriptionItem[];
  return cache.subscriptions;
}

export async function getCachedProfiles(env: Env, cache: TelegramRequestCache): Promise<ProfileConfig[]> {
  if (cache.profiles !== undefined) return cache.profiles;
  const storageAdapter = await getCachedStorageAdapter(env, cache);
  cache.profiles = await storageAdapter.getAllProfiles();
  return cache.profiles;
}

export async function persistCachedSettings(env: Env, cache: TelegramRequestCache): Promise<void> {
  if (cache.settings === undefined) return;
  const storageAdapter = await getCachedStorageAdapter(env, cache);
  await storageAdapter.put(STORAGE_KEY_SETTINGS, cache.settings);
}

/**
 * 优先走单行 D1 写入（O(1)），在未实现 putSubscription 的测试桩中回退到全量写入
 */
export async function saveSingleSubscription(
  storageAdapter: StorageAdapter,
  item: TelegramSubscriptionItem,
  fallbackAll: TelegramSubscriptionItem[],
): Promise<MisubItem | boolean> {
  if (item?.id && typeof storageAdapter.putSubscription === 'function') {
    return storageAdapter.putSubscription(item);
  }
  return storageAdapter.putAllSubscriptions(fallbackAll);
}

/**
 * 优先走单行 D1 写入（O(1)），在未实现 putProfile 的测试桩中回退到全量写入
 */
export async function saveSingleProfile(
  storageAdapter: StorageAdapter,
  profile: ProfileConfig,
  fallbackAll: ProfileConfig[],
): Promise<ProfileConfig | boolean> {
  if (profile?.id && typeof storageAdapter.putProfile === 'function') {
    return storageAdapter.putProfile(profile);
  }
  return storageAdapter.putAllProfiles(fallbackAll);
}

export function extractTelegramPushConfigObject(settings: Record<string, unknown>): Record<string, unknown> {
  return isRecord(settings.telegramPushConfig) ? settings.telegramPushConfig : {};
}

/**
 * 获取 Telegram Bot 推送配置
 */
export async function getTelegramPushConfig(
  env: Env,
  cache: TelegramRequestCache | null = null,
): Promise<TelegramPushConfig> {
  let settings: Record<string, unknown>;
  if (cache) {
    settings = await getCachedSettings(env, cache);
  } else {
    const storageAdapter = await getStorageAdapter(env);
    const loaded = await storageAdapter.get<Record<string, unknown>>(STORAGE_KEY_SETTINGS);
    settings = isRecord(loaded) ? loaded : {};
  }
  const config = extractTelegramPushConfigObject(settings);
  const allowedUserIds = Array.isArray(config.allowedUserIds) ? config.allowedUserIds : [];
  const rawRateLimit = isRecord(config.rateLimit) ? config.rateLimit : null;
  const rateLimit: TelegramRateLimitConfig = rawRateLimit
    ? {
        maxPerMinute: Number(rawRateLimit.maxPerMinute) || 1000,
        maxPerDay: Number(rawRateLimit.maxPerDay) || 10000,
      }
    : {
        maxPerMinute: 1000,
        maxPerDay: 10000,
      };
  const rawUserBindings = isRecord(config.userBindings) ? config.userBindings : {};
  const userBindings: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawUserBindings)) {
    if (typeof v === 'string') {
      userBindings[k] = v;
    } else if (v != null) {
      userBindings[k] = String(v);
    }
  }

  return {
    enabled: typeof config.enabled === 'boolean' ? config.enabled : true,
    botToken: typeof config.botToken === 'string' ? config.botToken : '',
    webhookSecret: typeof config.webhookSecret === 'string' ? config.webhookSecret : '',
    allowedUserIds: allowedUserIds.map((id) => String(id ?? '').trim()).filter(Boolean),
    allowAllUsers: config.allowAllUsers === true,
    rateLimit,
    defaultProfileId: typeof config.defaultProfileId === 'string' ? config.defaultProfileId : '',
    autoBind: typeof config.autoBind === 'boolean' ? config.autoBind : true,
    userBindings,
  };
}
