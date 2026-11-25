const requestContextMap = new WeakMap();

const STANDARD_HEADER_NAMES = [
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'CF-Connecting-IP',
  'CF-IPCountry',
  'CF-Ray',
  'Content-Length',
  'Content-Type',
  'Cookie',
  'Host',
  'Origin',
  'Pragma',
  'Referer',
  'Sec-Fetch-Dest',
  'Sec-Fetch-Mode',
  'Sec-Fetch-Site',
  'User-Agent',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'X-MiSub-Path',
  'X-MiSub-Save-Scope',
  'X-Real-IP',
  'X-Requested-With',
  'x-misub-internal-spa-fetch',
  'x-misub-origin-asset-fetch',
];

function normalizeMockHeaders(rawHeaders) {
  if (rawHeaders && typeof rawHeaders.get === 'function' && typeof rawHeaders.forEach === 'function') {
    return rawHeaders;
  }

  return {
    get(name) {
      if (rawHeaders && typeof rawHeaders.get === 'function') {
        return rawHeaders.get(name);
      }
      if (rawHeaders && typeof rawHeaders === 'object') {
        const key = String(name || '').toLowerCase();
        for (const [k, v] of Object.entries(rawHeaders)) {
          if (k.toLowerCase() === key) return v ?? null;
        }
      }
      return null;
    },
    forEach(callback) {
      for (const name of STANDARD_HEADER_NAMES) {
        const value = this.get(name);
        if (value !== null && value !== undefined) {
          callback(String(value), name.toLowerCase(), this);
        }
      }
    },
  };
}

/**
 * 规范化请求对象以兼容 Hono 与单测传入的轻量 mock request。
 * 对非 Request 实例不经过 new Request() 构造，避免 Happy-DOM 测试环境剥离 Cookie / Origin 等 Fetch 受限头。
 * @param {Request | Record<string, any>} request
 * @returns {Request}
 */
export function ensureStandardRequest(request) {
  if (request instanceof Request) {
    return request;
  }

  const normalized = Object.create(Object.getPrototypeOf(request) || Object.prototype);
  Object.assign(normalized, request, {
    url: String(request?.url || 'https://example.com/'),
    method: String(request?.method || 'GET').toUpperCase(),
    headers: normalizeMockHeaders(request?.headers),
  });
  return /** @type {Request} */ (normalized);
}

/**
 * 将请求级上下文对象绑定到请求对象，避免污染 env
 * @param {Request} request
 * @param {Record<string, any> | null | undefined} context
 */
export function setBoundContext(request, context) {
  if (request && context && typeof request === 'object') {
    requestContextMap.set(request, context);
  }
}

/**
 * 读取绑定在 Request 上的上下文对象
 * @param {Request} request
 * @param {Record<string, any>} [fallbackEnv]
 * @returns {Record<string, any> | null}
 */
export function getBoundContext(request, fallbackEnv = undefined) {
  if (request && typeof request === 'object' && requestContextMap.has(request)) {
    return requestContextMap.get(request);
  }
  return fallbackEnv ? { env: fallbackEnv } : null;
}
