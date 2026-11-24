import { StorageFactory } from '../storage-adapter.js';
import { STORAGE_KEY_SETTINGS } from './config.js';
import { performWebdavBackup } from './handlers/webdav-backup-handler.js';
import { isTokenRotationDue, rotateSubscriptionToken } from './handlers/rotate-token.js';
import { createJsonResponse } from './utils.js';

const LOCK_KEY = 'misub_webdav_backup_lock';
export const WEBDAV_LAST_CHECKED_CACHE_KEY = 'misub_webdav_backup_last_checked';
const CHECK_THROTTLE_MS = 5 * 60 * 1000;
const LOCK_TTL_MS = 10 * 60 * 1000;
const LAST_CHECKED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAINTENANCE_THROTTLE_MS = 6 * 60 * 60 * 1000;
const lastMaintenanceMap = new WeakMap();

function parseTime(value) {
  const ts = Date.parse(value || '');
  return Number.isFinite(ts) ? ts : 0;
}

function intervalMs(interval) {
  switch (interval) {
    case 'hourly':
      return 60 * 60 * 1000;
    case 'weekly':
      return 7 * 24 * 60 * 60 * 1000;
    case 'monthly':
      return 30 * 24 * 60 * 60 * 1000;
    case 'daily':
    default:
      return 24 * 60 * 60 * 1000;
  }
}

async function getStorage(env) {
  return StorageFactory.createAdapter(env);
}

export async function maybeRunScheduledTasks(context = {}, options = {}) {
  const env = context.env || context;
  if (!env) return { skipped: true, reason: 'missing-env' };

  const storageAdapter = context?.storage || (await getStorage(env));
  const now = Date.now();

  if (env?.MISUB_DB && typeof storageAdapter.cleanupMaintenance === 'function') {
    const lastMaint = lastMaintenanceMap.get(env.MISUB_DB) || 0;
    if (options.forceCheck || now - lastMaint >= MAINTENANCE_THROTTLE_MS) {
      lastMaintenanceMap.set(env.MISUB_DB, now);
      const maintPromise = storageAdapter.cleanupMaintenance({ now }).catch((err) => {
        console.warn('[ScheduledTasks] Storage maintenance failed:', err?.message || err);
      });
      if (typeof context.waitUntil === 'function' && !options.awaitRun) {
        context.waitUntil(maintPromise);
      } else {
        await maintPromise;
      }
    }
  }

  const settings =
    context?.settings !== undefined && !options.forceCheck
      ? context.settings || {}
      : (await storageAdapter.get(STORAGE_KEY_SETTINGS, 'json', { fresh: true })) || {};

  if (settings?.tokenAutoRotate?.enabled === true && isTokenRotationDue(settings, now)) {
    const rotatePromise = rotateSubscriptionToken(env, {
      force: false,
      source: options.source || 'lazy-cron',
      now,
    }).catch((err) => {
      console.warn('[ScheduledTasks] Token auto-rotation failed:', err?.message || err);
    });
    if (typeof context.waitUntil === 'function' && !options.awaitRun) {
      context.waitUntil(rotatePromise);
    } else {
      await rotatePromise;
    }
  }

  const config = settings.webdavBackup || {};

  if (!config.enabled || !config.autoBackup) {
    return { skipped: true, reason: 'disabled' };
  }

  const cachedCheck = await storageAdapter
    .get(WEBDAV_LAST_CHECKED_CACHE_KEY, 'json', { fresh: true })
    .catch(() => null);
  const lastCheckedAt = Math.max(
    parseTime(cachedCheck?.checkedAt || (typeof cachedCheck === 'string' ? cachedCheck : '')),
    parseTime(config.lastCheckedAt),
  );
  if (!options.forceCheck && lastCheckedAt && now - lastCheckedAt < CHECK_THROTTLE_MS) {
    return { skipped: true, reason: 'throttled' };
  }

  await storageAdapter.put(WEBDAV_LAST_CHECKED_CACHE_KEY, {
    checkedAt: new Date(now).toISOString(),
    expiresAt: now + LAST_CHECKED_TTL_MS,
  });

  const lastBackupAt = parseTime(config.lastBackupAt);
  if (!options.forceRun && lastBackupAt && now - lastBackupAt < intervalMs(config.interval)) {
    return { skipped: true, reason: 'not-due' };
  }

  const lock = await storageAdapter.get(LOCK_KEY, 'json', { fresh: true }).catch(() => null);
  if (lock?.expiresAt && parseTime(lock.expiresAt) > now) {
    return { skipped: true, reason: 'locked' };
  }

  await storageAdapter.put(LOCK_KEY, {
    lockedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + LOCK_TTL_MS).toISOString(),
    source: options.source || 'request',
  });

  const run = async () => {
    try {
      await performWebdavBackup(env, { trigger: options.source || 'lazy-cron' });
    } finally {
      await storageAdapter.delete?.(LOCK_KEY).catch(() => {});
    }
  };

  if (typeof context.waitUntil === 'function' && !options.awaitRun) {
    context.waitUntil(run());
    return { scheduled: true };
  }

  await run();
  return { scheduled: true, completed: true };
}

/**
 * HTTP /cron/backup 处理器：按独立定时任务执行 WebDAV 备份
 */
export async function handleCronBackupTrigger(env) {
  const storageAdapter = await getStorage(env);
  const now = Date.now();
  const settings = (await storageAdapter.get(STORAGE_KEY_SETTINGS, 'json', { fresh: true })) || {};
  const config = settings.webdavBackup || {};

  if (!config.enabled) {
    return createJsonResponse({
      success: true,
      task: 'backup',
      skipped: true,
      reason: 'disabled',
    });
  }

  const lock = await storageAdapter.get(LOCK_KEY, 'json', { fresh: true }).catch(() => null);
  if (lock?.expiresAt && parseTime(lock.expiresAt) > now) {
    return createJsonResponse({
      success: true,
      task: 'backup',
      skipped: true,
      reason: 'locked',
    });
  }

  await storageAdapter.put(LOCK_KEY, {
    lockedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + LOCK_TTL_MS).toISOString(),
    source: 'cron',
  });

  try {
    const result = await performWebdavBackup(env, { trigger: 'cron' });
    return createJsonResponse({
      success: true,
      task: 'backup',
      result,
    });
  } catch (error) {
    return createJsonResponse(
      {
        success: false,
        task: 'backup',
        error: error?.message || 'WebDAV backup failed',
      },
      500,
    );
  } finally {
    await storageAdapter.delete?.(LOCK_KEY).catch(() => {});
  }
}

/**
 * HTTP /cron/maintenance 处理器：清理过期缓存、孤儿缓存与过期访问日志
 */
export async function handleCronMaintenanceTrigger(env) {
  const storageAdapter = await getStorage(env);
  const stats = (await storageAdapter.cleanupMaintenance?.({ now: Date.now() })) || {};
  return createJsonResponse({
    success: true,
    task: 'maintenance',
    stats,
  });
}
