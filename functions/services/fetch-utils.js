/**
 * 网络请求工具集
 * 提供自动重试、并发控制和超时处理
 */
import { createTimeoutFetch } from '../modules/utils.js';

const DEFAULT_RETRY_OPTIONS = {
  MAX_RETRIES: 2, // 最多重试 2 次
  BASE_DELAY: 1000, // 重试基础延迟 1 秒
  RETRYABLE_STATUS: [500, 502, 503, 504, 429], // 可重试的 HTTP 状态码
};

/**
 * 带重试的 fetch 函数（支持超时控制、Retry-After 退避与响应体释放）
 * @param {string} url - 请求 URL
 * @param {Object} init - fetch 初始化选项
 * @param {Object} options - 重试选项 (timeout, maxRetries, baseDelay, retryableStatus)
 * @returns {Promise<Response>} - 响应对象
 */
export async function fetchWithRetry(url, init = {}, options = {}) {
  const {
    timeout = 0,
    maxRetries = DEFAULT_RETRY_OPTIONS.MAX_RETRIES,
    baseDelay = DEFAULT_RETRY_OPTIONS.BASE_DELAY,
    retryableStatus = DEFAULT_RETRY_OPTIONS.RETRYABLE_STATUS,
  } = options;

  let lastError;
  let lastResponse;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = timeout > 0 ? await createTimeoutFetch(url, init, timeout) : await fetch(url, init);

      if (response.ok || !retryableStatus.includes(response.status)) {
        return response;
      }

      if (attempt < maxRetries) {
        let delay = baseDelay * Math.pow(2, attempt);
        const retryAfter = response.headers?.get?.('Retry-After');
        if (retryAfter) {
          const retryAfterSeconds = parseInt(retryAfter, 10);
          if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
            delay = Math.min(retryAfterSeconds * 1000, 30000);
          }
        }

        console.warn(
          `[Retry] HTTP ${response.status} (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`,
        );

        try {
          await response.body?.cancel();
        } catch {
          // 忽略响应体释放失败
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      lastResponse = response;
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(
        `[Fetch Retry] Attempt ${attempt + 1}/${maxRetries} failed for ${url}: ${error.message}. Retrying in ${delay / 1000}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

/**
 * 创建并发控制器
 * @param {number} limit - 最大并发数
 * @returns {Function} - 包装函数 (task => Promise)
 */
export function createConcurrencyLimiter(limit) {
  const queue = [];
  let active = 0;

  const runNext = () => {
    if (active < limit && queue.length > 0) {
      active++;
      const { task, resolve, reject } = queue.shift();

      // 执行任务
      Promise.resolve(task())
        .then(resolve)
        .catch(reject)
        .finally(() => {
          active--;
          runNext();
        });
    }
  };

  return (task) => {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      runNext();
    });
  };
}
