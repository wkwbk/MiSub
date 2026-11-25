/**
 * Telegram Bot 鉴权、用户绑定与频率限制模块
 */

import type { Env, StorageAdapter } from '../../../types.js';
import { StorageFactory } from '../../../storage-adapter.js';
import type { TelegramPushConfig } from './storage.js';
import { isRecord } from './utils.js';

export type TelegramPermissionResult = { allowed: true } | { allowed: false; reason: string };

/**
 * 验证 Telegram Webhook 请求
 */
export function verifyTelegramRequest(request: Request, config: Pick<TelegramPushConfig, 'webhookSecret'>): boolean {
  const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  return secretToken === config.webhookSecret;
}

function getUserBindingKey(userId: number | string | null | undefined): string {
  return userId != null ? userId.toString().trim() : '';
}

export function getUserBoundProfileId(
  config: Partial<Pick<TelegramPushConfig, 'userBindings' | 'autoBind' | 'defaultProfileId'>> | Record<string, unknown>,
  userId: number | string,
): string {
  const bindingKey = getUserBindingKey(userId);
  const bindings = isRecord(config?.userBindings) ? config.userBindings : {};

  if (bindingKey && Object.prototype.hasOwnProperty.call(bindings, bindingKey)) {
    const val = bindings[bindingKey];
    return typeof val === 'string' ? val : val ? String(val) : '';
  }

  if (config?.autoBind && typeof config?.defaultProfileId === 'string' && config.defaultProfileId) {
    return config.defaultProfileId;
  }

  return '';
}

export function setUserBoundProfileId(
  config: Record<string, unknown>,
  userId: number | string,
  profileId: string,
): void {
  const bindingKey = getUserBindingKey(userId);
  const bindings: Record<string, string> = {};
  if (isRecord(config.userBindings)) {
    for (const [k, v] of Object.entries(config.userBindings)) {
      if (typeof v === 'string') {
        bindings[k] = v;
      } else if (v != null) {
        bindings[k] = String(v);
      }
    }
  }

  if (bindingKey) {
    bindings[bindingKey] = profileId || '';
  }

  config.userBindings = bindings;
}

/**
 * 检查用户权限
 */
export function checkUserPermission(
  userId: number | string,
  config: Pick<TelegramPushConfig, 'enabled' | 'allowAllUsers' | 'allowedUserIds'>,
): TelegramPermissionResult {
  if (!config.enabled) {
    return { allowed: false, reason: 'Bot 已被管理员禁用' };
  }

  if (config.allowAllUsers) {
    return { allowed: true };
  }

  if (!config.allowedUserIds || config.allowedUserIds.length === 0) {
    return {
      allowed: false,
      reason: '未配置白名单，请先在设置中添加允许用户或显式开启公开访问',
    };
  }

  const userIdStr = userId.toString();
  if (!config.allowedUserIds.some((id) => id.toString().trim() === userIdStr)) {
    return { allowed: false, reason: '无权限使用此 Bot，请联系管理员添加白名单' };
  }

  return { allowed: true };
}

/**
 * 检查频率限制（并行读写分钟/天计数器）
 */
export async function checkRateLimit(
  userId: number | string,
  env: Env,
  config: Pick<TelegramPushConfig, 'rateLimit'>,
): Promise<TelegramPermissionResult> {
  const now = Date.now();
  const minuteKey = `tg_push_rate:${userId}:min`;
  const dayKey = `tg_push_rate:${userId}:day`;

  if (!env?.MISUB_DB) return { allowed: true };
  const storage = StorageFactory.createAdapter(env) as unknown as StorageAdapter;
  if (!storage || storage.type === 'noop') return { allowed: true };

  const readCounter = async (key: string): Promise<{ count: number; expiresAt: number }> => {
    const entry = await storage.get<Record<string, unknown>>(key);
    if (!isRecord(entry)) return { count: 0, expiresAt: 0 };
    if (Number(entry.expiresAt || 0) <= now) return { count: 0, expiresAt: 0 };
    return { count: Number(entry.count || 0), expiresAt: Number(entry.expiresAt) };
  };

  const [minuteEntry, dayEntry] = await Promise.all([readCounter(minuteKey), readCounter(dayKey)]);

  if (minuteEntry.count >= config.rateLimit.maxPerMinute) {
    return {
      allowed: false,
      reason: `操作过快，请1分钟后再试（${config.rateLimit.maxPerMinute}/分钟）`,
    };
  }

  if (dayEntry.count >= config.rateLimit.maxPerDay) {
    return { allowed: false, reason: `今日配额已用完（${config.rateLimit.maxPerDay}/天）` };
  }

  await Promise.all([
    storage.put(minuteKey, {
      count: minuteEntry.count + 1,
      expiresAt: minuteEntry.expiresAt > now ? minuteEntry.expiresAt : now + 60_000,
    }),
    storage.put(dayKey, {
      count: dayEntry.count + 1,
      expiresAt: dayEntry.expiresAt > now ? dayEntry.expiresAt : now + 86_400_000,
    }),
  ]);

  return { allowed: true };
}
