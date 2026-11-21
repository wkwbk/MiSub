/**
 * 工具函数模块
 * 包含各种通用的辅助函数
 */

import { utf8ToBase64 } from '../../shared/base64.js';
import { ensureD1Schema } from '../storage-adapter.js';

/**
 * 计算数据的简单哈希值，用于检测变更
 * @param {any} data - 要计算哈希的数据
 * @returns {string} - 数据的哈希值
 */
export function calculateDataHash(data) {
  const jsonString = JSON.stringify(data, Object.keys(data).sort());
  let hash = 0;
  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 转换为32位整数
  }
  return hash.toString();
}

/**
 * 检测数据是否发生变更
 * @param {any} oldData - 旧数据
 * @param {any} newData - 新数据
 * @returns {boolean} - 是否发生变更
 */
export function hasDataChanged(oldData, newData) {
  if (!oldData && !newData) return false;
  if (!oldData || !newData) return true;
  return calculateDataHash(oldData) !== calculateDataHash(newData);
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

function getFallbackCookieSecret() {
  if (!fallbackCookieSecret) {
    fallbackCookieSecret = crypto.randomUUID();
  }
  return fallbackCookieSecret;
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
    const storedSecret = await safeD1Get(db, 'SYSTEM_COOKIE_SECRET');
    if (storedSecret) return storedSecret;

    if (runtimeCookieSecret) {
      await safeD1Put(db, 'SYSTEM_COOKIE_SECRET', runtimeCookieSecret);
      return runtimeCookieSecret;
    }

    const newSecret = crypto.randomUUID();
    const saved = await safeD1Put(db, 'SYSTEM_COOKIE_SECRET', newSecret);
    return saved ? newSecret : getFallbackCookieSecret();
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

/**
 * Check whether the instance already has initialized auth state or persisted user data in D1.
 * Storage read errors propagate so callers fail closed instead of falling back to defaults.
 * @param {Object} env
 * @returns {Promise<boolean>}
 */
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

/**
 * Record that this instance has been initialized with a non-default admin password.
 * @param {Object} env
 * @returns {Promise<boolean>}
 */
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
export function prependNodeName(link, prefix) {
  if (!prefix) return link;
  const appendToFragment = (baseLink, namePrefix) => {
    const hashIndex = baseLink.lastIndexOf('#');
    const originalName = hashIndex !== -1 ? decodeURIComponent(baseLink.substring(hashIndex + 1)) : '';
    const base = hashIndex !== -1 ? baseLink.substring(0, hashIndex) : baseLink;
    if (originalName.startsWith(namePrefix)) {
      return baseLink;
    }
    const newName = originalName ? `${namePrefix} - ${originalName}` : namePrefix;
    return `${base}#${encodeURIComponent(newName)}`;
  };
  if (link.startsWith('vmess://')) {
    try {
      const base64Part = link.substring('vmess://'.length);
      const binaryString = atob(base64Part);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const jsonString = new TextDecoder('utf-8').decode(bytes);
      const nodeConfig = JSON.parse(jsonString);
      const originalPs = nodeConfig.ps || '';
      if (!originalPs.startsWith(prefix)) {
        nodeConfig.ps = originalPs ? `${prefix} - ${originalPs}` : prefix;
      }
      const newJsonString = JSON.stringify(nodeConfig);
      const newBase64Part = utf8ToBase64(newJsonString);
      return 'vmess://' + newBase64Part;
    } catch (e) {
      console.error('为 vmess 节点添加名称前缀失败，将回退到通用方法。', e);
      return appendToFragment(link, prefix);
    }
  }
  return appendToFragment(link, prefix);
}

/**
 * 创建带超时的请求
 * @param {RequestInfo} input - 请求输入
 * @param {RequestInit} init - 请求初始化选项
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<Response>} 响应
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
 * 带重试机制的请求函数
 * @param {RequestInfo} input - 请求输入
 * @param {RequestInit} init - 请求初始化选项
 * @param {Object} options - 选项
 * @param {number} options.maxRetries - 最大重试次数
 * @param {number} options.timeout - 每次请求超时时间
 * @param {number} options.baseDelay - 基础延迟时间
 * @returns {Promise<Response>} 响应
 */
export async function retryFetch(input, init = {}, options = {}) {
  const { maxRetries = 3, timeout = 10000, baseDelay = 1000 } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await createTimeoutFetch(input, init, timeout);
    } catch (error) {
      lastError = error;

      // 如果是最后一次尝试，直接抛出错误
      if (attempt === maxRetries) {
        throw error;
      }

      // 计算延迟时间（指数退避）
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(
        `[Retry] Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`,
        error.message,
      );

      // 等待延迟
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * 安全的存储操作包装器
 * @param {Function} operation - 存储操作函数
 * @param {any} fallback - 操作失败时的默认返回值
 * @param {string} context - 操作上下文
 * @returns {Promise<any>} 操作结果
 */
export async function safeStorageOperation(operation, fallback = null, context = '') {
  try {
    return await operation();
  } catch (error) {
    console.error(`[Storage] ${context} failed:`, error);
    return fallback;
  }
}

/**
 * 通用日志函数
 * @param {string} level - 日志级别 (info, warn, error)
 * @param {string} message - 日志消息
 * @param {any} data - 附加数据
 */
export function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    data,
  };

  switch (level) {
    case 'info':
      console.info(`[${timestamp}] ${message}`, data);
      break;
    case 'warn':
      console.warn(`[${timestamp}] ${message}`, data);
      break;
    case 'error':
      console.error(`[${timestamp}] ${message}`, data);
      break;
    default:
      console.info(`[${timestamp}] ${message}`, data);
  }

  return logEntry;
}

/**
 * 获取回调令牌
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<string>} 回调令牌
 */
export async function getCallbackToken(env) {
  const secret = env.COOKIE_SECRET || 'default-callback-secret';
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode('callback-static-data'));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
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
 * 获取用于外部回调的基础 URL
 * @param {Object} env - Cloudflare环境对象
 * @param {URL} requestUrl - 当前请求 URL
 * @returns {URL} - 规范化后的基础 URL
 */
export function getPublicBaseUrl(env, requestUrl) {
  const configured = (env?.MISUB_CALLBACK_URL || env?.MISUB_PUBLIC_URL || '').trim();
  if (!configured) {
    return new URL(requestUrl.origin);
  }

  const hasProtocol = /^https?:\/\//i.test(configured);
  const normalized = hasProtocol ? configured : `https://${configured}`;
  const baseUrl = new URL(normalized);
  baseUrl.pathname = '';
  baseUrl.search = '';
  baseUrl.hash = '';
  return baseUrl;
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

/**
 * 安全的 Base64 到 UTF-8 解码
 */
export function base64DecodeUtf8(base64) {
  if (!base64) return '';
  try {
    const binString = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binString, (m) => m.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error('[Utils] base64DecodeUtf8 failed:', e);
    return '';
  }
}
