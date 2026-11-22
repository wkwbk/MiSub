/**
 * Telegram Bot 鉴权、用户绑定与频率限制模块
 */

import { StorageFactory } from '../../../storage-adapter.js';

/**
 * 验证 Telegram Webhook 请求
 */
export function verifyTelegramRequest(request, config) {
  const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  return secretToken === config.webhookSecret;
}

export function getUserBindingKey(userId) {
  return userId?.toString().trim();
}

export function getUserBoundProfileId(config, userId) {
  const bindingKey = getUserBindingKey(userId);
  const bindings = config?.userBindings || {};

  if (bindingKey && Object.prototype.hasOwnProperty.call(bindings, bindingKey)) {
    return bindings[bindingKey] || '';
  }

  if (config?.autoBind && config?.defaultProfileId) {
    return config.defaultProfileId;
  }

  return '';
}

export function setUserBoundProfileId(config, userId, profileId) {
  const bindingKey = getUserBindingKey(userId);
  const bindings = config.userBindings && typeof config.userBindings === 'object' ? { ...config.userBindings } : {};

  if (bindingKey) {
    bindings[bindingKey] = profileId || '';
  }

  config.userBindings = bindings;
}

/**
 * 检查用户权限
 */
export function checkUserPermission(userId, config) {
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
export async function checkRateLimit(userId, env, config) {
  const now = Date.now();
  const minuteKey = `tg_push_rate:${userId}:min`;
  const dayKey = `tg_push_rate:${userId}:day`;

  if (!env?.MISUB_DB) return { allowed: true };
  const storage = StorageFactory.createAdapter(env);
  if (!storage || storage.type === 'noop') return { allowed: true };

  const readCounter = async (key) => {
    const entry = await storage.get(key);
    if (!entry || typeof entry !== 'object') return { count: 0, expiresAt: 0 };
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
