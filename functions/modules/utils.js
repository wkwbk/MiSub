/**
 * 工具函数模块
 * 包含各种通用的辅助函数
 */

/**
 * 规范化自定义登录路径，确保始终以单个前导斜杠开头；无效时回退为 '/login'
 * @param {string} customLoginPath
 * @returns {string}
 */
export function normalizeLoginPath(customLoginPath) {
  if (typeof customLoginPath !== 'string') return '/login';
  const normalized = customLoginPath.trim().replace(/^\/+/, '');
  return normalized && normalized !== 'login' ? `/${normalized}` : '/login';
}

function getD1(env) {
  const db = env?.MISUB_DB;
  return db && typeof db.prepare === 'function' ? db : null;
}

/**
 * 读取运行时环境变量。
 * @param {Object} env
 * @param {string} key
 * @returns {string|undefined}
 */
function getRuntimeEnvValue(env, key) {
  const envValue = env?.[key];
  if (envValue !== undefined && envValue !== null && String(envValue).trim() !== '') {
    return String(envValue);
  }

  return undefined;
}

/**
 * 获取 Cookie 加密密钥
 * 仅从环境变量 COOKIE_SECRET 读取；未配置时返回 null（由会话层基于 ADMIN_PASSWORD 稳定派生）
 * @param {Object} env - 运行时环境对象
 * @returns {Promise<string|null>} 密钥
 */
export async function getCookieSecret(env) {
  const runtimeCookieSecret = getRuntimeEnvValue(env, 'COOKIE_SECRET');
  return runtimeCookieSecret ? runtimeCookieSecret.trim() : null;
}

export class AdminPasswordMissingError extends Error {
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
 * @param {Object} env - 运行时环境对象
 * @returns {Promise<string>} 密码
 */
export async function getAdminPassword(env) {
  const runtimeAdminPassword = getRuntimeEnvValue(env, 'ADMIN_PASSWORD');
  if (!runtimeAdminPassword) {
    throw new AdminPasswordMissingError();
  }
  return runtimeAdminPassword.trim();
}

/**
 * 获取认证相关调试信息（不返回任何敏感值）
 * @param {Object} env
 * @returns {Promise<Object>}
 */
export async function getAuthDebugInfo(env) {
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
 * 名称前缀辅助函数
 * @param {string} link - 节点链接
 * @param {string} prefix - 前缀文本
 * @returns {string} 添加前缀后的链接
 */
export function createTimeoutFetch(input, init = {}, timeout = 10000) {
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
 * @param {Object} config - 原始配置对象
 * @returns {Object} - 处理后的配置对象
 */
export function migrateConfigSettings(config) {
  const migratedConfig = { ...config };

  // [Fix] 强制转换为布尔值，防止存储中出现字符串"false"导致判断错误
  const toBoolean = (val) => {
    if (typeof val === 'string') {
      return val.toLowerCase() === 'true';
    }
    return !!val;
  };

  if (migratedConfig.hasOwnProperty('enableAccessLog')) {
    migratedConfig.enableAccessLog = toBoolean(migratedConfig.enableAccessLog);
  }
  if (migratedConfig.hasOwnProperty('enableTrafficNode')) {
    migratedConfig.enableTrafficNode = toBoolean(migratedConfig.enableTrafficNode);
  }
  if (migratedConfig.hasOwnProperty('enablePublicPage')) {
    migratedConfig.enablePublicPage = toBoolean(migratedConfig.enablePublicPage);
  }
  if (migratedConfig.hasOwnProperty('allowBrowserSubAccess')) {
    migratedConfig.allowBrowserSubAccess = toBoolean(migratedConfig.allowBrowserSubAccess);
  }
  if (migratedConfig.disguise && typeof migratedConfig.disguise === 'object') {
    migratedConfig.disguise = {
      pageType: migratedConfig.disguise.pageType === 'redirect' ? 'redirect' : 'default',
      redirectUrl:
        typeof migratedConfig.disguise.redirectUrl === 'string' ? migratedConfig.disguise.redirectUrl.trim() : '',
    };
  }
  if (migratedConfig.hasOwnProperty('builtinSkipCertVerify')) {
    migratedConfig.builtinSkipCertVerify = toBoolean(migratedConfig.builtinSkipCertVerify);
  }
  if (migratedConfig.hasOwnProperty('builtinEnableUdp')) {
    migratedConfig.builtinEnableUdp = toBoolean(migratedConfig.builtinEnableUdp);
  }
  if (migratedConfig.hasOwnProperty('builtinLoonSkipCertVerify')) {
    migratedConfig.builtinLoonSkipCertVerify = toBoolean(migratedConfig.builtinLoonSkipCertVerify);
  }

  if (migratedConfig.hasOwnProperty('profileUpdateInterval')) {
    const parsed = Number(migratedConfig.profileUpdateInterval);
    migratedConfig.profileUpdateInterval = Number.isFinite(parsed) ? parsed : 24;
  }
  if (migratedConfig.hasOwnProperty('subFetchMinInterval')) {
    const parsed = Number(migratedConfig.subFetchMinInterval);
    migratedConfig.subFetchMinInterval = Number.isFinite(parsed) ? Math.max(0, Math.min(1440, Math.round(parsed))) : 15;
  }
  if (migratedConfig.hasOwnProperty('subFetchLimitMode')) {
    migratedConfig.subFetchLimitMode = migratedConfig.subFetchLimitMode === 'strict' ? 'strict' : 'cache';
  }

  return migratedConfig;
}

/**
 * 创建标准JSON响应
 * @param {Object} data - 响应数据
 * @param {number} status - HTTP状态码
 * @param {Object} headers - 额外的HTTP头
 * @returns {Response}
 */
export function createJsonResponse(data, status = 200, headers = {}) {
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
  constructor(message, status = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * 转义HTML特殊字符，防止XSS和Telegram解析错误
 * @param {string} str - 需要转义的字符串
 * @returns {string} - 转义后的字符串
 */
export function escapeHtml(str) {
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
};

export class RequestBodyTooLargeError extends Error {
  constructor(limitBytes) {
    super(`Request JSON body too large (max ${limitBytes} bytes)`);
    this.name = 'RequestBodyTooLargeError';
    this.status = 413;
    this.code = 'REQUEST_BODY_TOO_LARGE';
  }
}

export async function readJsonWithLimit(request, limitBytes = JSON_BODY_LIMITS.normal) {
  const contentLength = request?.headers?.get?.('Content-Length') || request?.headers?.get?.('content-length');
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > limitBytes) {
      throw new RequestBodyTooLargeError(limitBytes);
    }
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > limitBytes) {
    throw new RequestBodyTooLargeError(limitBytes);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * 创建标准错误响应
 * @param {Error|string} error - 错误对象或错误消息
 * @param {number} status - HTTP状态码 (默认500)
 * @returns {Response}
 */
export function createErrorResponse(error, status = 500) {
  let message = 'Internal Server Error';
  let code = 'INTERNAL_ERROR';
  let details = null;

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
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 安全的 UTF-8 到 Base64 编码 (替代已弃用的 unescape/encodeURIComponent 方案)
 */
export function base64EncodeUtf8(str) {
  if (!str) return '';
  try {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return btoa(binString);
  } catch (e) {
    console.error('[Utils] base64EncodeUtf8 failed:', e);
    return '';
  }
}
