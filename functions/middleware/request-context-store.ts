import type { BoundRequestContext, Env } from '../types.js';

const requestContextMap = new WeakMap<object, BoundRequestContext>();

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

export interface MockHeaders {
  get(name: string): string | null;
  forEach(callback: (value: string, key: string, parent: MockHeaders) => void): void;
}

export interface MockRequestLike {
  url?: string;
  method?: string;
  headers?: unknown;
  [key: string]: unknown;
}

function normalizeMockHeaders(rawHeaders: unknown): Headers | MockHeaders {
  if (
    rawHeaders &&
    typeof rawHeaders === 'object' &&
    'get' in rawHeaders &&
    typeof rawHeaders.get === 'function' &&
    'forEach' in rawHeaders &&
    typeof rawHeaders.forEach === 'function'
  ) {
    return rawHeaders as Headers;
  }

  return {
    get(name: string): string | null {
      if (rawHeaders && typeof rawHeaders === 'object' && 'get' in rawHeaders && typeof rawHeaders.get === 'function') {
        const result: unknown = (rawHeaders.get as (n: string) => unknown)(name);
        return result == null ? null : String(result);
      }
      if (rawHeaders && typeof rawHeaders === 'object') {
        const key = String(name || '').toLowerCase();
        for (const [k, v] of Object.entries(rawHeaders)) {
          if (k.toLowerCase() === key) return v == null ? null : String(v);
        }
      }
      return null;
    },
    forEach(callback: (value: string, key: string, parent: MockHeaders) => void): void {
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
 */
export function ensureStandardRequest(request: Request | MockRequestLike): Request {
  if (request instanceof Request) {
    return request;
  }

  const normalized = Object.create(Object.getPrototypeOf(request) || Object.prototype) as Record<string, unknown>;
  Object.assign(normalized, request, {
    url: String(request?.url || 'https://example.com/'),
    method: String(request?.method || 'GET').toUpperCase(),
    headers: normalizeMockHeaders(request?.headers),
  });
  return normalized as unknown as Request;
}

/**
 * 将请求级上下文对象绑定到请求对象，避免污染 env
 */
export function setBoundContext(request: Request, context: BoundRequestContext | null | undefined): void {
  if (request && context && typeof request === 'object') {
    requestContextMap.set(request, context);
  }
}

/**
 * 读取绑定在 Request 上的上下文对象
 */
export function getBoundContext(request: Request, fallbackEnv?: Env): BoundRequestContext | null {
  if (request && typeof request === 'object' && requestContextMap.has(request)) {
    return requestContextMap.get(request) ?? null;
  }
  return fallbackEnv ? { env: fallbackEnv } : null;
}
