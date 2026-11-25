/**
 * 工具函数模块
 * 包含各种通用的辅助函数
 */

import { utf8ToBase64 } from '@misub/core/utils/base64.js';
import type { Env } from '../types.js';

/**
 * 规范化自定义登录路径，确保始终以单个前导斜杠开头；无效时回退为 '/login'
 */
export function normalizeLoginPath(customLoginPath: unknown): string {
  if (typeof customLoginPath !== 'string') return '/login';
  const normalized = customLoginPath.trim().replace(/^\/+/, '');
  return normalized && normalized !== 'login' ? `/${normalized}` : '/login';
}

function getD1(env: Env | Record<string, unknown> | null | undefined): D1Database | null {
  const db = env?.MISUB_DB;
  if (db && typeof db === 'object' && 'prepare' in db && typeof (db as D1Database).prepare === 'function') {
    return db as D1Database;
  }
  return null;
}

/**
 * 读取运行时环境变量。
 */
function getRuntimeEnvValue(
  env: Env | Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const envValue = env?.[key];
  if (envValue !== undefined && envValue !== null && String(envValue).trim() !== '') {
    return String(envValue);
  }

  return undefined;
}

/**
 * 获取 Cookie 加密密钥
 * 仅从环境变量 COOKIE_SECRET 读取；未配置时返回 null（由会话层基于 ADMIN_PASSWORD 稳定派生）
 */
export async function getCookieSecret(env: Env | Record<string, unknown> | null | undefined): Promise<string | null> {
  const runtimeCookieSecret = getRuntimeEnvValue(env, 'COOKIE_SECRET');
  return runtimeCookieSecret ? runtimeCookieSecret.trim() : null;
}

export class AdminPasswordMissingError extends Error {
  status: number;
  code: string;

  constructor(
    message = '管理员密码未配置：请在平台控制台将 ADMIN_PASSWORD 设置为 Secret 密钥（本地开发请在 .dev.vars 中配置）后重试。',
  ) {
    super(message);
    this.name = 'AdminPasswordMissingError';
    this.status = 503;
    this.code = 'ADMIN_PASSWORD_MISSING';
  }
}

/**
 * 获取管理员密码
 * 仅从环境变量 ADMIN_PASSWORD 读取；未配置时 fail-closed 抛出 AdminPasswordMissingError
 */
export async function getAdminPassword(env: Env | Record<string, unknown> | null | undefined): Promise<string> {
  const runtimeAdminPassword = getRuntimeEnvValue(env, 'ADMIN_PASSWORD');
  if (!runtimeAdminPassword) {
    throw new AdminPasswordMissingError();
  }
  return runtimeAdminPassword.trim();
}

export interface AuthDebugInfo {
  hasD1: boolean;
  adminPassword: {
    source: 'env' | 'missing';
    configured: boolean;
  };
  cookieSecret: {
    source: 'env' | 'derived';
    configured: boolean;
  };
}

/**
 * 获取认证相关调试信息（不返回任何敏感值）
 */
export async function getAuthDebugInfo(env: Env | Record<string, unknown> | null | undefined): Promise<AuthDebugInfo> {
  const runtimeAdminPassword = getRuntimeEnvValue(env, 'ADMIN_PASSWORD');
  const runtimeCookieSecret = getRuntimeEnvValue(env, 'COOKIE_SECRET');
  const db = getD1(env);

  return {
    hasD1: !!db,
    adminPassword: {
      source: runtimeAdminPassword ? 'env' : 'missing',
      configured: !!runtimeAdminPassword,
    },
    cookieSecret: {
      source: runtimeCookieSecret ? 'env' : 'derived',
      configured: !!runtimeCookieSecret,
    },
  };
}

/**
 * 带超时控制的 fetch 封装
 */
export function createTimeoutFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeout = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // 分离 cf 选项：cf 是 Cloudflare Workers fetch 特有的选项，
  // 不属于标准 RequestInit，不应传入 Request 构造器。
  // 将其直接传给 fetch() 的第二参数，Cloudflare 环境正常生效，Node.js 环境安全忽略。
  const { cf, ...requestInit } = init;
  const request = new Request(input, {
    ...requestInit,
    signal: controller.signal,
  });
  const fetchPromise = cf ? fetch(request, { cf }) : fetch(request);

  return fetchPromise.finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * 处理配置的向后兼容性，确保新的前缀配置结构存在
 */
export function migrateConfigSettings<T extends Record<string, unknown>>(config: T): T {
  const migratedConfig: Record<string, unknown> = { ...config };

  // [Fix] 强制转换为布尔值，防止存储中出现字符串"false"导致判断错误
  const toBoolean = (val: unknown): boolean => {
    if (typeof val === 'string') {
      return val.toLowerCase() === 'true';
    }
    return !!val;
  };

  if (Object.prototype.hasOwnProperty.call(migratedConfig, 'enableAccessLog')) {
    migratedConfig.enableAccessLog = toBoolean(migratedConfig.enableAccessLog);
  }
  if (Object.prototype.hasOwnProperty.call(migratedConfig, 'enableTrafficNode')) {
    migratedConfig.enableTrafficNode = toBoolean(migratedConfig.enableTrafficNode);
  }
  if (Object.prototype.hasOwnProperty.call(migratedConfig, 'enablePublicPage')) {
    migratedConfig.enablePublicPage = toBoolean(migratedConfig.enablePublicPage);
  }
  if (Object.prototype.hasOwnProperty.call(migratedConfig, 'allowBrowserSubAccess')) {
    migratedConfig.allowBrowserSubAccess = toBoolean(migratedConfig.allowBrowserSubAccess);
  }
  if (migratedConfig.disguise && typeof migratedConfig.disguise === 'object') {
    const rawDisguise = migratedConfig.disguise as Record<string, unknown>;
    migratedConfig.disguise = {
      pageType: rawDisguise.pageType === 'redirect' ? 'redirect' : 'default',
      redirectUrl: typeof rawDisguise.redirectUrl === 'string' ? rawDisguise.redirectUrl.trim() : '',
    };
  }
  if (Object.prototype.hasOwnProperty.call(migratedConfig, 'builtinSkipCertVerify')) {
    migratedConfig.builtinSkipCertVerify = toBoolean(migratedConfig.builtinSkipCertVerify);
  }
  if (Object.prototype.hasOwnProperty.call(migratedConfig, 'builtinEnableUdp')) {
    migratedConfig.builtinEnableUdp = toBoolean(migratedConfig.builtinEnableUdp);
  }

  if (Object.prototype.hasOwnProperty.call(migratedConfig, 'profileUpdateInterval')) {
    const parsed = Number(migratedConfig.profileUpdateInterval);
    migratedConfig.profileUpdateInterval = Number.isFinite(parsed) ? parsed : 24;
  }
  if (Object.prototype.hasOwnProperty.call(migratedConfig, 'subFetchMinInterval')) {
    const parsed = Number(migratedConfig.subFetchMinInterval);
    migratedConfig.subFetchMinInterval = Number.isFinite(parsed) ? Math.max(0, Math.min(1440, Math.round(parsed))) : 15;
  }
  if (Object.prototype.hasOwnProperty.call(migratedConfig, 'subFetchLimitMode')) {
    migratedConfig.subFetchLimitMode = migratedConfig.subFetchLimitMode === 'strict' ? 'strict' : 'cache';
  }

  return migratedConfig as T;
}

/**
 * 创建标准JSON响应
 */
export function createJsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

/**
 * 自定义 API 错误类
 */
export class APIError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(message: string, status = 500, code = 'INTERNAL_ERROR', details: unknown = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * 转义HTML特殊字符，防止XSS和Telegram解析错误
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const JSON_BODY_LIMITS = {
  auth: 16 * 1024,
  small: 128 * 1024,
  normal: 1024 * 1024,
  large: 5 * 1024 * 1024,
} as const;

export class RequestBodyTooLargeError extends Error {
  status: number;
  code: string;

  constructor(limitBytes: number) {
    super(`Request JSON body too large (max ${limitBytes} bytes)`);
    this.name = 'RequestBodyTooLargeError';
    this.status = 413;
    this.code = 'REQUEST_BODY_TOO_LARGE';
  }
}

export async function readJsonWithLimit(
  request: Request,
  limitBytes: number = JSON_BODY_LIMITS.normal,
): Promise<unknown> {
  const contentLength = request?.headers?.get?.('Content-Length') || request?.headers?.get?.('content-length');
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > limitBytes) {
      throw new RequestBodyTooLargeError(limitBytes);
    }
  }

  let text = '';
  if (request?.body && typeof request.body.getReader === 'function') {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
          totalBytes += bytes.byteLength;
          if (totalBytes > limitBytes) {
            await reader.cancel().catch(() => {});
            throw new RequestBodyTooLargeError(limitBytes);
          }
          chunks.push(bytes);
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {}
    }

    if (totalBytes > 0) {
      const merged = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      text = new TextDecoder('utf-8').decode(merged);
    }
  } else {
    text = await request.text();
    if (new TextEncoder().encode(text).length > limitBytes) {
      throw new RequestBodyTooLargeError(limitBytes);
    }
  }

  return text ? (JSON.parse(text) as unknown) : {};
}

/**
 * 创建标准错误响应
 */
export function createErrorResponse(error: unknown, status = 500): Response {
  let message = 'Internal Server Error';
  let code = 'INTERNAL_ERROR';
  let details: unknown = null;

  if (error instanceof APIError) {
    status = error.status;
    message = error.message;
    code = error.code;
    details = error.details;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  return createJsonResponse(
    {
      success: false,
      error: message,
      code,
      details,
    },
    status,
  );
}

/**
 * 生成唯一标识符 (UUID v4)
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 安全的 UTF-8 到 Base64 编码 (替代已弃用的 unescape/encodeURIComponent 方案)
 */
export function base64EncodeUtf8(str: string): string {
  if (!str) return '';
  try {
    return utf8ToBase64(str);
  } catch (e) {
    console.error('[Utils] base64EncodeUtf8 failed:', e);
    return '';
  }
}
