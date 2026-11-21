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

/**
 * 改进版的并发任务收集
 * 真正的可中断收集：通过传递 AbortSignal 给各个任务。超时时不仅返回已完成的结果，还会中止未完成的底层 fetch。
 *
 * @param {Function[]} taskFactories - 返回 Promise 的工厂函数数组: (signal) => Promise
 * @param {number} timeoutMs - 整体超时时间(ms)
 * @returns {Promise<any[]>} - 在超时前所有成功 resolve 的结果数组
 */
export async function robustCollect(taskFactories, timeoutMs) {
  const results = [];
  const controller = new AbortController();

  // 超时中止
  const timerId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const promises = taskFactories.map(async (taskFactory) => {
    try {
      const res = await taskFactory(controller.signal);
      if (res !== undefined && res !== null) {
        results.push(res);
      }
    } catch (e) {
      // 被 controller.abort() 的 AbortError 和常规执行错误都会在这里被忽略
      if (e.name !== 'AbortError') {
        console.warn('[robustCollect] Task error:', e.message);
      }
    }
  });

  // 无论全部成功还是因为 abort 报错，Promise.all 都会在全部 settled 后返回或抛出
  // 我们在内层 catch 了错误，所以 Promise.all 会平稳结束
  await Promise.all(promises);

  // 如果还没超时就收集完了，取消定时器
  clearTimeout(timerId);

  return results;
}
