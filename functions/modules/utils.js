/**
 * 工具函数模块
 * 包含各种通用的辅助函数
 */

import { utf8ToBase64 } from '../../shared/base64.js';
import { ensureD1Schema } from '../storage-adapter.js';

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

function isNoSuchTableError(error) {
  return String(error?.message || error || '')
    .toLowerCase()
    .includes('no such table');
}

function isD1StorageUnavailableError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('d1') ||
    message.includes('database is locked') ||
    message.includes('storage is paused') ||
    message.includes('limit exceeded')
  );
}

function unwrapStoredText(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw);
  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      return String(JSON.parse(text));
    } catch {
      return text;
    }
  }
  return text;
}

async function readD1SettingStrict(db, key) {
  if (!db) return null;
  try {
    const stmt = db.prepare('SELECT value as data FROM settings WHERE key = ?');
    const bound = typeof stmt.bind === 'function' ? stmt.bind(key) : stmt;
    const row = await bound.first();
    if (!row) return null;
    return unwrapStoredText(row.data ?? row.value);
  } catch (error) {
    if (isNoSuchTableError(error)) {
      return null;
    }
    throw error;
  }
}

async function safeD1Get(db, key) {
  try {
    return await readD1SettingStrict(db, key);
  } catch (error) {
    if (isD1StorageUnavailableError(error)) {
      console.warn(`[Auth Storage] D1 get skipped for ${key}: ${error.message}`);
      return null;
    }
    throw error;
  }
}

async function putD1SettingStrict(db, key, value) {
  const writeOnce = async () => {
    await db
      .prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`)
      .bind(key, String(value))
      .run();
  };
  try {
    await writeOnce();
  } catch (error) {
    if (isNoSuchTableError(error)) {
      await ensureD1Schema(db);
      await writeOnce();
      return;
    }
    throw error;
  }
}

async function safeD1Put(db, key, value) {
  if (!db) return false;
  try {
    await putD1SettingStrict(db, key, value);
    return true;
  } catch (error) {
    console.warn(`[Auth Storage] D1 put skipped for ${key}: ${error.message}`);
    return false;
  }
}

let fallbackCookieSecret = null;
let cookieSecretCache = new WeakMap();
const COOKIE_SECRET_CACHE_TTL_MS = 5 * 60 * 1000;

function getFallbackCookieSecret() {
  if (!fallbackCookieSecret) {
    fallbackCookieSecret = crypto.randomUUID();
  }
  return fallbackCookieSecret;
}

export function clearCookieSecretCache() {
  cookieSecretCache = new WeakMap();
}

/**
 * 获取或生成 Cookie 加密密钥
 * 优先顺序：D1 → 环境变量 COOKIE_SECRET → 当前实例临时密钥（无 D1 或写入失败时）
 * @param {Object} env - 运行时环境对象
 * @returns {Promise<string>} 密钥
 */
export async function getCookieSecret(env) {
  const db = getD1(env);
  const runtimeCookieSecret = getRuntimeEnvValue(env, 'COOKIE_SECRET');

  if (db) {
    const now = Date.now();
    const cached = cookieSecretCache.get(db);
    if (cached && now - cached.timestamp < COOKIE_SECRET_CACHE_TTL_MS) {
      return cached.secret;
    }

    const storedSecret = await safeD1Get(db, 'SYSTEM_COOKIE_SECRET');
    if (storedSecret) {
      cookieSecretCache.set(db, { secret: storedSecret, timestamp: now });
      return storedSecret;
    }

    if (runtimeCookieSecret) {
      const saved = await safeD1Put(db, 'SYSTEM_COOKIE_SECRET', runtimeCookieSecret);
      if (saved) {
        cookieSecretCache.set(db, { secret: runtimeCookieSecret, timestamp: now });
      }
      return runtimeCookieSecret;
    }

    const newSecret = crypto.randomUUID();
    const saved = await safeD1Put(db, 'SYSTEM_COOKIE_SECRET', newSecret);
    if (saved) {
      cookieSecretCache.set(db, { secret: newSecret, timestamp: now });
      return newSecret;
    }
    return getFallbackCookieSecret();
  }

  if (runtimeCookieSecret) return runtimeCookieSecret;
  return getFallbackCookieSecret();
}

const SYSTEM_AUTH_INITIALIZED_KEY = 'SYSTEM_AUTH_INITIALIZED';

export class AdminPasswordMissingError extends Error {
  constructor(
    message = '管理员密码未配置：检测到实例已初始化或已有数据，但缺少 ADMIN_PASSWORD。请在平台控制台将其设置为 Secret 密钥后重试。',
  ) {
    super(message);
    this.name = 'AdminPasswordMissingError';
    this.status = 503;
    this.code = 'ADMIN_PASSWORD_MISSING';
  }
}

export async function hasInitializedInstanceState(env) {
  const db = getD1(env);
  if (!db) return false;

  const initialized = await readD1SettingStrict(db, SYSTEM_AUTH_INITIALIZED_KEY);
  if (initialized !== null && initialized !== undefined && String(initialized) !== '') {
    return true;
  }

  for (const table of ['subscriptions', 'profiles', 'settings']) {
    try {
      const row = await db.prepare(`SELECT 1 AS ok FROM ${table} LIMIT 1`).first();
      if (row) return true;
    } catch (error) {
      if (isNoSuchTableError(error)) {
        continue;
      }
      throw error;
    }
  }

  return false;
}

export async function markAuthInitialized(env) {
  const db = getD1(env);
  if (!db) return false;
  return safeD1Put(db, SYSTEM_AUTH_INITIALIZED_KEY, '1');
}

/**
 * 获取管理员密码
 * 优先顺序：环境变量 ADMIN_PASSWORD → D1 → 默认值 'admin'（仅限未初始化的全新实例）
 * @param {Object} env - 运行时环境对象
 * @returns {Promise<string>} 密码
 */
export async function getAdminPassword(env) {
  const runtimeAdminPassword = getRuntimeEnvValue(env, 'ADMIN_PASSWORD');
  if (runtimeAdminPassword) {
    return runtimeAdminPassword.trim();
  }

  const db = getD1(env);
  if (db) {
    const d1Password = await readD1SettingStrict(db, 'SYSTEM_ADMIN_PASSWORD');
    if (d1Password) return String(d1Password).trim();
  }

  if (await hasInitializedInstanceState(env)) {
    throw new AdminPasswordMissingError();
  }

  return 'admin';
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

  let hasD1AdminPassword = false;
  let hasD1CookieSecret = false;

  if (db) {
    hasD1AdminPassword = !!(await safeD1Get(db, 'SYSTEM_ADMIN_PASSWORD'));
    hasD1CookieSecret = !!(await safeD1Get(db, 'SYSTEM_COOKIE_SECRET'));
  }

  let adminPasswordSource = 'default';
  if (runtimeAdminPassword) {
    adminPasswordSource = 'env';
  } else if (hasD1AdminPassword) {
    adminPasswordSource = 'd1';
  }

  let cookieSecretSource = 'generated';
  if (runtimeCookieSecret) {
    cookieSecretSource = 'env';
  } else if (hasD1CookieSecret) {
    cookieSecretSource = 'd1';
  }

  return {
    hasD1: !!db,
    adminPassword: {
      source: adminPasswordSource,
      hasRuntime: !!runtimeAdminPassword,
      hasD1Value: hasD1AdminPassword,
      isDefaultFallback: adminPasswordSource === 'default',
    },
    cookieSecret: {
      source: cookieSecretSource,
      hasRuntime: !!runtimeCookieSecret,
      hasD1Value: hasD1CookieSecret,
      mayRegenerateWithoutD1: !db && !runtimeCookieSecret,
    },
  };
}

/**
 * 检查是否正在使用默认密码
 * @param {Object} env
 * @returns {Promise<boolean>}
 */
export async function isUsingDefaultPassword(env) {
  try {
    const current = await getAdminPassword(env);
    return current === 'admin';
  } catch (error) {
    if (error instanceof AdminPasswordMissingError) {
      return false;
    }
    throw error;
  }
}

/**
 * 设置管理员密码
 * 持久化到 D1；无 D1 时抛出提示
 * @param {Object} env - 运行时环境对象
 * @param {string} newPassword - 新密码
 */
export async function setAdminPassword(env, newPassword) {
  if (getRuntimeEnvValue(env, 'ADMIN_PASSWORD')) {
    throw new Error('当前部署通过环境变量 ADMIN_PASSWORD 设置密码，请在平台控制台修改该变量');
  }
  const db = getD1(env);
  if (!db) {
    throw new Error('D1 database not available');
  }
  await putD1SettingStrict(db, 'SYSTEM_ADMIN_PASSWORD', newPassword);
  await markAuthInitialized(env);
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
  // [Migration] 映射旧名到新名（如果新名不存在且旧名存在）
  if (!migratedConfig.hasOwnProperty('builtinSkipCertVerify') && migratedConfig.hasOwnProperty('transformBackendScv')) {
    migratedConfig.builtinSkipCertVerify = toBoolean(migratedConfig.transformBackendScv);
  }
  if (!migratedConfig.hasOwnProperty('builtinEnableUdp') && migratedConfig.hasOwnProperty('transformBackendUdp')) {
    migratedConfig.builtinEnableUdp = toBoolean(migratedConfig.transformBackendUdp);
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
  } else if (migratedConfig.hasOwnProperty('UpdateInterval')) {
    const parsed = Number(migratedConfig.UpdateInterval);
    if (Number.isFinite(parsed)) {
      migratedConfig.profileUpdateInterval =
        parsed >= 3600 && parsed % 3600 === 0 ? Math.round(parsed / 3600) : Math.round(parsed);
    }
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
