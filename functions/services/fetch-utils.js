/**
 * 网络请求工具集
 * 提供自动重试、并发控制和超时处理
 */

const DEFAULT_RETRY_OPTIONS = {
  MAX_RETRIES: 2, // 最多重试 2 次
  BASE_DELAY: 1000, // 重试基础延迟 1 秒
  RETRYABLE_STATUS: [500, 502, 503, 504, 429], // 可重试的 HTTP 状态码
};

/**
 * 带重试的 fetch 函数
 * @param {string} url - 请求 URL
 * @param {Object} init - fetch 初始化选项
 * @param {Object} options - 重试选项 (maxRetries, baseDelay, retryableStatus)
 * @returns {Promise<Response>} - 响应对象
 */
export async function fetchWithRetry(url, init = {}, options = {}) {
  const {
    maxRetries = DEFAULT_RETRY_OPTIONS.MAX_RETRIES,
    baseDelay = DEFAULT_RETRY_OPTIONS.BASE_DELAY,
    retryableStatus = DEFAULT_RETRY_OPTIONS.RETRYABLE_STATUS,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.ok) {
        return response;
      }

      // 检查状态码是否可重试
      if (!retryableStatus.includes(response.status)) {
        return response; // 不可重试的错误直接返回
      }

      // 如果是最后一次尝试，则直接返回
      if (attempt === maxRetries) {
        return response;
      }

      // 构造错误以便进入 catch 块进行延迟处理
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        break;
      }

      // 指数退避策略: 1s, 2s, 4s...
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(
        `[Fetch Retry] Attempt ${attempt + 1}/${maxRetries} failed for ${url}: ${error.message}. Retrying in ${delay / 1000}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
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
