import type { BoundRequestContext, Env, StorageAdapter } from '../types.js';
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
const lastMaintenanceMap = new WeakMap<object, number>();

export interface ScheduledTaskOptions {
  forceCheck?: boolean;
  forceRun?: boolean;
  awaitRun?: boolean;
  source?: string;
}

interface ScheduledWebdavConfig {
  enabled?: boolean;
  autoBackup?: boolean;
  lastCheckedAt?: string | null;
  lastBackupAt?: string | null;
  interval?: string;
}

interface ScheduledSettings {
  tokenAutoRotate?: {
    enabled?: boolean;
    intervalDays?: number;
    lastRotatedAt?: string | null;
  };
  webdavBackup?: ScheduledWebdavConfig;
  [key: string]: unknown;
}

interface BackupLockRecord {
  lockedAt?: string;
  expiresAt?: string;
  source?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseTime(value: unknown): number {
  const ts = Date.parse(typeof value === 'string' ? value : '');
  return Number.isFinite(ts) ? ts : 0;
}

function intervalMs(interval?: string): number {
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

async function getStorage(env: Env | Record<string, unknown> | null | undefined): Promise<StorageAdapter> {
  return StorageFactory.createAdapter(env);
}

export async function maybeRunScheduledTasks(
  context: BoundRequestContext | Env | Record<string, unknown> = {},
  options: ScheduledTaskOptions = {},
): Promise<{ skipped?: boolean; reason?: string; scheduled?: boolean; completed?: boolean }> {
  const ctxObj =
    context && typeof context === 'object' ? (context as BoundRequestContext & Record<string, unknown>) : null;
  if (!ctxObj) return { skipped: true, reason: 'missing-env' };

  const env = (ctxObj.env || ctxObj) as Env | Record<string, unknown>;
  if (!env) return { skipped: true, reason: 'missing-env' };

  const storageAdapter = ctxObj.storage || (await getStorage(env));
  const now = Date.now();
  const db = env.MISUB_DB && typeof env.MISUB_DB === 'object' ? env.MISUB_DB : null;

  if (db && typeof storageAdapter.cleanupMaintenance === 'function') {
    const lastMaint = lastMaintenanceMap.get(db) || 0;
    if (options.forceCheck || now - lastMaint >= MAINTENANCE_THROTTLE_MS) {
      lastMaintenanceMap.set(db, now);
      const maintPromise = storageAdapter.cleanupMaintenance({ now }).catch((err: unknown) => {
        console.warn('[ScheduledTasks] Storage maintenance failed:', getErrorMessage(err));
      });
      if (typeof ctxObj.waitUntil === 'function' && !options.awaitRun) {
        ctxObj.waitUntil(maintPromise);
      } else {
        await maintPromise;
      }
    }
  }

  const rawSettings =
    ctxObj.settings !== undefined && !options.forceCheck
      ? ctxObj.settings
      : await storageAdapter.get<ScheduledSettings>(STORAGE_KEY_SETTINGS, 'json', { fresh: true });
  const settings: ScheduledSettings =
    rawSettings && typeof rawSettings === 'object' ? (rawSettings as ScheduledSettings) : {};

  if (settings?.tokenAutoRotate?.enabled === true && isTokenRotationDue(settings, now)) {
    const rotatePromise = rotateSubscriptionToken(env, {
      force: false,
      source: options.source || 'lazy-cron',
      now,
    }).catch((err: unknown) => {
      console.warn('[ScheduledTasks] Token auto-rotation failed:', getErrorMessage(err));
    });
    if (typeof ctxObj.waitUntil === 'function' && !options.awaitRun) {
      ctxObj.waitUntil(rotatePromise);
    } else {
      await rotatePromise;
    }
  }

  const config: ScheduledWebdavConfig = settings.webdavBackup || {};

  if (!config.enabled || !config.autoBackup) {
    return { skipped: true, reason: 'disabled' };
  }

  const cachedCheck = await storageAdapter
    .get<{ checkedAt?: string } | string>(WEBDAV_LAST_CHECKED_CACHE_KEY, 'json', { fresh: true })
    .catch(() => null);
  const cachedCheckedAt =
    cachedCheck && typeof cachedCheck === 'object'
      ? cachedCheck.checkedAt
      : typeof cachedCheck === 'string'
        ? cachedCheck
        : '';
  const lastCheckedAt = Math.max(parseTime(cachedCheckedAt), parseTime(config.lastCheckedAt));
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

  const lock = await storageAdapter.get<BackupLockRecord>(LOCK_KEY, 'json', { fresh: true }).catch(() => null);
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

  if (typeof ctxObj.waitUntil === 'function' && !options.awaitRun) {
    ctxObj.waitUntil(run());
    return { scheduled: true };
  }

  await run();
  return { scheduled: true, completed: true };
}

/**
 * HTTP /cron/backup 处理器：按独立定时任务执行 WebDAV 备份
 */
export async function handleCronBackupTrigger(env: Env | Record<string, unknown> | null | undefined): Promise<Response> {
  const storageAdapter = await getStorage(env);
  const now = Date.now();
  const rawSettings = await storageAdapter.get<ScheduledSettings>(STORAGE_KEY_SETTINGS, 'json', { fresh: true });
  const settings: ScheduledSettings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const config: ScheduledWebdavConfig = settings.webdavBackup || {};

  if (!config.enabled) {
    return createJsonResponse({
      success: true,
      task: 'backup',
      skipped: true,
      reason: 'disabled',
    });
  }

  const lock = await storageAdapter.get<BackupLockRecord>(LOCK_KEY, 'json', { fresh: true }).catch(() => null);
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
    const result = await performWebdavBackup(env ?? {}, { trigger: 'cron' });
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
        error: error instanceof Error ? error.message : 'WebDAV backup failed',
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
export async function handleCronMaintenanceTrigger(
  env: Env | Record<string, unknown> | null | undefined,
): Promise<Response> {
  const storageAdapter = await getStorage(env);
  const stats = (await storageAdapter.cleanupMaintenance?.({ now: Date.now() })) || {};
  return createJsonResponse({
    success: true,
    task: 'maintenance',
    stats,
  });
}
