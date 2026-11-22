/**
 * 日志服务模块
 * 处理订阅访问日志的存储和检索（纯 D1 行级表 access_logs）
 */

import { StorageFactory } from '../storage-adapter.js';

const MAX_LOG_ENTRIES = 200;
const MAX_LOG_AGE_DAYS = 30;
const MAX_LOG_AGE_MS = MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
const SUCCESS_LOG_COOLDOWN_MS = 5 * 60 * 1000;
const ERROR_LOG_COOLDOWN_MS = 60 * 1000;
const MAX_PERSISTED_LOGS_PER_MINUTE = 12;
const MAX_FLUSH_RETRIES = 3;
let consecutiveFlushFailures = 0;

export function anonymizeLogToken(value, type = 'token') {
  const text = String(value ?? '');
  const normalizedType = type === 'profile' ? 'profile' : 'token';
  if (!text) return '';
  if (new RegExp(`^${normalizedType}:[a-f0-9]{12}$`).test(text)) return text;

  let hash1 = 0x811c9dc5;
  let hash2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    hash1 ^= code;
    hash1 = Math.imul(hash1, 0x01000193) >>> 0;
    hash2 ^= code + i;
    hash2 = Math.imul(hash2, 0x811c9dc5) >>> 0;
  }

  const fingerprint = `${hash1.toString(16).padStart(8, '0')}${hash2.toString(16).padStart(8, '0')}`.slice(0, 12);
  return `${normalizedType}:${fingerprint}`;
}

function sanitizeLogEntry(logEntry = {}) {
  const type = logEntry?.type === 'profile' ? 'profile' : 'token';
  return {
    ...logEntry,
    type,
    token: anonymizeLogToken(logEntry?.token, type),
  };
}

function resolveLogStorage(env) {
  const storage = StorageFactory.createAdapter(env);
  if (!storage || storage.type === 'noop') {
    return null;
  }
  const hasRowLogMethods =
    typeof storage.insertAccessLogs === 'function' &&
    typeof storage.getAccessLogs === 'function' &&
    typeof storage.clearAccessLogs === 'function';

  if (!hasRowLogMethods) {
    return null;
  }

  return storage;
}

// 全局内存队列，用于削峰填谷和防写竞争
let logBatch = [];
let isFlushing = false;
let recentLogFingerprints = new Map();
let persistedLogTimestamps = [];

function cleanupLogBudgets(now = Date.now()) {
  persistedLogTimestamps = persistedLogTimestamps.filter((ts) => now - ts < 60 * 1000);
  for (const [fingerprint, expiresAt] of recentLogFingerprints.entries()) {
    if (expiresAt <= now) {
      recentLogFingerprints.delete(fingerprint);
    }
  }
}

function getLogFingerprint(logEntry) {
  const type = logEntry?.type || 'unknown';
  const token = anonymizeLogToken(logEntry?.token || 'unknown', type);
  const format = logEntry?.format || 'unknown';
  const status = logEntry?.status || 'unknown';
  const domain = logEntry?.domain || 'unknown';
  const message = logEntry?.details?.error || logEntry?.summary || '';
  return `${status}|${type}|${token}|${format}|${domain}|${message}`;
}

function shouldPersistLog(logEntry) {
  const now = Date.now();
  cleanupLogBudgets(now);

  const mode = logEntry?.persistenceMode === 'full' ? 'full' : 'light';
  if (mode === 'full') {
    return true;
  }

  const isError = logEntry?.status === 'error';
  const fingerprint = getLogFingerprint(logEntry);
  const cooldownMs = isError ? ERROR_LOG_COOLDOWN_MS : SUCCESS_LOG_COOLDOWN_MS;
  const fingerprintExpiresAt = recentLogFingerprints.get(fingerprint) || 0;

  if (fingerprintExpiresAt > now) {
    return false;
  }

  if (!isError && persistedLogTimestamps.length >= MAX_PERSISTED_LOGS_PER_MINUTE) {
    return false;
  }

  recentLogFingerprints.set(fingerprint, now + cooldownMs);
  persistedLogTimestamps.push(now);
  return true;
}

export const LogService = {
  /**
   * 添加一条新日志 (支持 Isolate 级别的批量异步写入)
   * @param {Object} env - Cloudflare Environment
   * @param {Object} logEntry - 日志内容
   */
  async addLog(env, logEntry) {
    const storage = resolveLogStorage(env);
    if (!storage) return;
    const sanitizedLogEntry = sanitizeLogEntry(logEntry);
    if (!shouldPersistLog(sanitizedLogEntry)) return null;

    const enrichedLog = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...sanitizedLogEntry,
    };

    // 放入全局内存队列
    logBatch.push(enrichedLog);

    // 如果没有正在刷盘的任务，则启动刷盘。
    // 由于调用点通常在 ctx.waitUntil 中，这保证了请求结束后仍有执行时间。
    if (!isFlushing) {
      isFlushing = true;
      // 简单的防抖：给并发请求一点时间累积日志
      await new Promise((resolve) => setTimeout(resolve, 500));
      await this._flush(env);
    }

    return enrichedLog;
  },

  /**
   * 内部方法：将内存队列中的日志批量刷入 D1
   */
  async _flush(env) {
    if (logBatch.length === 0) {
      isFlushing = false;
      return;
    }

    // 把当前队列的数据取出
    const batchToFlush = [...logBatch];
    logBatch = [];

    try {
      const storage = resolveLogStorage(env);
      if (!storage) {
        return;
      }

      await storage.insertAccessLogs(batchToFlush, {
        maxAgeMs: MAX_LOG_AGE_MS,
        maxEntries: MAX_LOG_ENTRIES,
      });
      consecutiveFlushFailures = 0;
    } catch (error) {
      consecutiveFlushFailures += 1;
      console.error('[LogService] Failed to flush batch logs:', error);
      if (consecutiveFlushFailures < MAX_FLUSH_RETRIES) {
        // 写入失败且未超过重试上限时，把日志塞回队列前部等待重试
        logBatch.unshift(...batchToFlush);
      } else {
        console.warn(`[LogService] Dropping ${batchToFlush.length} logs after ${MAX_FLUSH_RETRIES} failed flush attempts.`);
        consecutiveFlushFailures = 0;
      }
    } finally {
      // 检查是否有在刷盘期间新进来的日志
      if (logBatch.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await this._flush(env);
      } else {
        isFlushing = false;
      }
    }
  },

  /**
   * 获取日志列表
   * @param {Object} env - Cloudflare Environment
   */
  async getLogs(env) {
    try {
      const storage = resolveLogStorage(env);
      if (!storage) return [];

      return await storage.getAccessLogs({
        limit: MAX_LOG_ENTRIES,
        minTimestamp: Date.now() - MAX_LOG_AGE_MS,
      });
    } catch (error) {
      console.error('[LogService] Failed to get logs:', error);
      return [];
    }
  },

  /**
   * 清空日志
   * @param {Object} env - Cloudflare Environment
   * @param {Object} [options] - 可选过滤条件
   * @param {string} [options.profileName] - 仅清空指定订阅组名称的日志
   */
  async clearLogs(env, { profileName = '' } = {}) {
    try {
      const targetProfileName = typeof profileName === 'string' ? profileName : '';
      const storage = resolveLogStorage(env);
      if (!storage) return false;

      if (targetProfileName) {
        logBatch = logBatch.filter((log) => log?.profileName !== targetProfileName);
      } else {
        logBatch = [];
      }

      return await storage.clearAccessLogs(targetProfileName ? { profileName: targetProfileName } : {});
    } catch (error) {
      console.error('[LogService] Failed to clear logs:', error);
      return false;
    }
  },
};
