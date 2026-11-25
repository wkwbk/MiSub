/**
 * 认证中间件模块
 * 处理用户认证和会话管理
 */

import type { Env, StorageAdapter } from '../types.js';
import {
  COOKIE_NAME,
  DEFAULT_SETTINGS,
  SESSION_DURATION,
  SESSION_RENEW_THRESHOLD,
  STORAGE_KEY_SETTINGS,
} from './config.js';
import { StorageFactory } from '../storage-adapter.js';
import { resolveTurnstileConfig, type TurnstileRawSettings, verifyTurnstileToken } from './turnstile.js';
import {
  AdminPasswordMissingError,
  getAdminPassword,
  getAuthDebugInfo,
  getCookieSecret,
  JSON_BODY_LIMITS,
  readJsonWithLimit,
  RequestBodyTooLargeError,
} from './utils.js';

type EnvLike = Env | Record<string, unknown> | null | undefined;

export interface AuthSessionDiagnostic {
  isAuthenticated: boolean;
  reason: string;
  cookieHeaderPresent: boolean;
  authSessionCookieCount: number;
  token: {
    exists: boolean;
    decodeMode: string;
    length: number;
    partCount: number;
  };
  verify: {
    success: boolean;
    hasTimestamp: boolean;
    isExpired: boolean | null;
    sessionAgeMs: number | null;
  };
  shouldRenew: boolean;
}

export interface LoginPasswordDiagnostic {
  success: boolean;
  matched: boolean;
  reason: string;
  runtime: {
    adminPasswordSource: string;
  };
  input: {
    provided: boolean;
    normalizedLength: number;
  };
  expected: {
    normalizedLength: number;
  };
}

interface LoginRateRecord {
  count?: number;
  windowStart?: number;
  lockedUntil?: number;
  expiresAt?: number;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeSecret(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFEFF/g, '')
    .replace(/[\u200B-\u200D]/g, '')
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

async function sha256Bytes(value: unknown): Promise<Uint8Array> {
  const data = new TextEncoder().encode(String(value ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

/**
 * 常量时间字符串比对（先做 SHA-256 归一化长度，再常量时间比较）
 */
export async function timingSafeStringEqual(a: string, b: string): Promise<boolean> {
  const [hashA, hashB] = await Promise.all([sha256Bytes(a), sha256Bytes(b)]);
  if (typeof crypto.subtle?.timingSafeEqual === 'function') {
    return crypto.subtle.timingSafeEqual(hashA, hashB);
  }
  let diff = 0;
  for (let i = 0; i < hashA.length; i++) {
    diff |= hashA[i] ^ hashB[i];
  }
  return diff === 0;
}

/**
 * 派生会话签名密钥：仅基于环境变量（COOKIE_SECRET 与 ADMIN_PASSWORD），不读写 D1。
 * 修改 ADMIN_PASSWORD 或 COOKIE_SECRET 都会立即吊销所有旧会话；未配置 COOKIE_SECRET 时基于 ADMIN_PASSWORD 稳定派生。
 */
export async function getSessionSigningSecret(env: EnvLike): Promise<string> {
  const adminPassword = normalizeSecret(await getAdminPassword(env));
  const cookieSecret = normalizeSecret(await getCookieSecret(env));
  const hmacKeyMaterial = cookieSecret || adminPassword;
  const derivationContext = cookieSecret
    ? `misub-session-v2:${adminPassword}`
    : 'misub-session-v2:derived-from-admin-password';

  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(hmacKeyMaterial),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const derived = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(derivationContext));
  return Array.from(new Uint8Array(derived))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildRequestMeta(request: Request | null | undefined, env: EnvLike) {
  return {
    url: request?.url,
    method: request?.method,
    contentType: request?.headers?.get('Content-Type'),
    contentLength: request?.headers?.get('Content-Length'),
    userAgent: request?.headers?.get('User-Agent'),
    origin: request?.headers?.get('Origin'),
    referer: request?.headers?.get('Referer'),
    cfRay: request?.headers?.get('CF-Ray'),
    hasD1: !!env?.MISUB_DB,
  };
}

/**
 * 创建 HMAC 签名的令牌
 */
export async function createSignedToken(key: string, data: string): Promise<string> {
  if (!key || !data) throw new Error('Key and data are required for signing.');
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const dataToSign = encoder.encode(data);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataToSign);
  return `${data}.${Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * 验证 HMAC 签名令牌
 */
async function verifySignedToken(key: string, token: string): Promise<string | null> {
  if (!key || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, signatureHex] = parts;

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const dataToVerify = encoder.encode(data);

    const sigBytes = new Uint8Array(signatureHex.length / 2);
    for (let i = 0; i < signatureHex.length; i += 2) {
      sigBytes[i / 2] = parseInt(signatureHex.substring(i, i + 2), 16);
    }

    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, [
      'verify',
    ]);

    const isValid = await crypto.subtle.verify('HMAC', cryptoKey, sigBytes, dataToVerify);

    return isValid ? data : null;
  } catch (e) {
    console.error('[Auth] Token verify error:', e);
    return null;
  }
}

const requestAuthDiagnosticCache = new WeakMap<object, { env: EnvLike; diagnostic: AuthSessionDiagnostic }>();

async function getCachedAuthSessionDiagnostic(request: Request, env: EnvLike): Promise<AuthSessionDiagnostic> {
  if (request && typeof request === 'object') {
    const cached = requestAuthDiagnosticCache.get(request);
    if (cached && cached.env === env) {
      return cached.diagnostic;
    }
  }

  const diagnostic = await getAuthSessionDiagnostic(request, env);
  if (request && typeof request === 'object') {
    requestAuthDiagnosticCache.set(request, { env, diagnostic });
  }
  return diagnostic;
}

/**
 * 获取认证会话调试信息（不包含敏感值）
 */
export async function getAuthSessionDiagnostic(request: Request, env: EnvLike): Promise<AuthSessionDiagnostic> {
  const result: AuthSessionDiagnostic = {
    isAuthenticated: false,
    reason: 'unknown',
    cookieHeaderPresent: false,
    authSessionCookieCount: 0,
    token: {
      exists: false,
      decodeMode: 'none',
      length: 0,
      partCount: 0,
    },
    verify: {
      success: false,
      hasTimestamp: false,
      isExpired: null,
      sessionAgeMs: null,
    },
    shouldRenew: false,
  };

  // 先检查 Cookie，无会话 Cookie 时直接早退，避免触发 D1 查询与密钥读取
  const cookieHeader = request.headers.get('Cookie') || '';
  result.cookieHeaderPresent = cookieHeader.length > 0;

  const matchedCookies = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .filter((c) => c.startsWith(`${COOKIE_NAME}=`));

  result.authSessionCookieCount = matchedCookies.length;
  if (matchedCookies.length === 0) {
    result.reason = 'no_cookie';
    return result;
  }

  const rawToken = matchedCookies[matchedCookies.length - 1].slice(COOKIE_NAME.length + 1);
  if (!rawToken) {
    result.reason = 'empty_token';
    return result;
  }

  let token = rawToken;
  try {
    token = decodeURIComponent(rawToken);
    result.token.decodeMode = 'decodeURIComponent';
  } catch {
    result.token.decodeMode = 'raw';
  }

  token = String(token || '').replace(/^"|"$/g, '');
  result.token.exists = token.length > 0;
  result.token.length = token.length;
  result.token.partCount = token ? token.split('.').length : 0;

  if (!token) {
    result.reason = 'empty_token';
    return result;
  }

  let secret: string;
  try {
    secret = await getSessionSigningSecret(env);
  } catch (error) {
    if (error instanceof AdminPasswordMissingError) {
      result.reason = 'admin_password_missing';
      return result;
    }
    throw error;
  }
  if (!secret) {
    result.reason = 'no_secret';
    return result;
  }

  const verifiedData = await verifySignedToken(secret, token);
  if (!verifiedData) {
    result.reason = 'invalid_signature_or_secret';
    return result;
  }

  result.verify.success = true;
  const ts = parseInt(verifiedData, 10);
  const hasTimestamp = Number.isFinite(ts);
  result.verify.hasTimestamp = hasTimestamp;

  if (!hasTimestamp) {
    result.reason = 'invalid_timestamp';
    return result;
  }

  const sessionAgeMs = Date.now() - ts;
  const isExpired = sessionAgeMs >= SESSION_DURATION;
  result.verify.isExpired = isExpired;
  result.verify.sessionAgeMs = sessionAgeMs;
  if (isExpired) {
    result.reason = 'expired';
    return result;
  }

  result.isAuthenticated = true;
  result.shouldRenew = sessionAgeMs >= SESSION_RENEW_THRESHOLD;
  result.reason = 'ok';
  return result;
}

export async function renewAuthSession(
  request: Request,
  env: EnvLike,
  response: Response,
  diagnostic: AuthSessionDiagnostic | null = null,
): Promise<Response> {
  const authDiagnostic = diagnostic || (await getCachedAuthSessionDiagnostic(request, env));
  if (!authDiagnostic?.isAuthenticated || !authDiagnostic.shouldRenew) {
    return response;
  }

  let secret: string;
  try {
    secret = await getSessionSigningSecret(env);
  } catch (error) {
    if (error instanceof AdminPasswordMissingError) {
      return response;
    }
    throw error;
  }
  if (!secret) return response;

  const token = await createSignedToken(secret, String(Date.now()));
  const isSecure = request.url.startsWith('https');
  const cookieString = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; ${isSecure ? 'Secure;' : ''} SameSite=Lax; Max-Age=${SESSION_DURATION / 1000}`;
  const renewedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
  renewedResponse.headers.append('Set-Cookie', cookieString);
  return renewedResponse;
}

/**
 * 获取登录密码诊断信息（不返回明文密码）
 */
export async function getLoginPasswordDiagnostic(request: Request, env: EnvLike): Promise<LoginPasswordDiagnostic> {
  const debugInfo = await getAuthDebugInfo(env);
  const result: LoginPasswordDiagnostic = {
    success: false,
    matched: false,
    reason: 'unknown',
    runtime: {
      adminPasswordSource: debugInfo?.adminPassword?.source || 'unknown',
    },
    input: {
      provided: false,
      normalizedLength: 0,
    },
    expected: {
      normalizedLength: 0,
    },
  };

  let payload: unknown;
  try {
    payload = await readJsonWithLimit(request, JSON_BODY_LIMITS.auth);
  } catch {
    result.reason = 'invalid_json';
    return result;
  }

  let currentPassword: string;
  try {
    currentPassword = normalizeSecret(await getAdminPassword(env));
  } catch (error) {
    if (error instanceof AdminPasswordMissingError) {
      result.reason = 'admin_password_missing';
      return result;
    }
    throw error;
  }

  const payloadObj =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
  const rawPassword = payloadObj?.password;
  const inputPassword = normalizeSecret(rawPassword);

  result.input.provided = typeof rawPassword === 'string';
  result.input.normalizedLength = inputPassword.length;
  result.expected.normalizedLength = currentPassword.length;

  if (!result.input.provided) {
    result.reason = 'missing_password';
    return result;
  }

  result.matched = await timingSafeStringEqual(inputPassword, currentPassword);
  result.success = true;
  result.reason = result.matched ? 'matched' : 'mismatch';
  return result;
}

/**
 * 认证中间件 - 检查用户是否已登录
 */
export async function authMiddleware(request: Request, env: EnvLike): Promise<boolean> {
  const logMeta = buildRequestMeta(request, env);
  try {
    const diagnostic = await getCachedAuthSessionDiagnostic(request, env);
    return diagnostic.isAuthenticated;
  } catch (e) {
    console.error('[Auth] 鉴权失败', { ...logMeta, error: getErrorMessage(e) });
    return false;
  }
}

export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000;

function getLoginClientIp(request: Request | null | undefined): string {
  const raw =
    request?.headers?.get?.('CF-Connecting-IP') ||
    request?.headers?.get?.('X-Real-IP') ||
    request?.headers?.get?.('X-Forwarded-For')?.split(',')[0] ||
    '';
  return String(raw).trim() || 'unknown';
}

async function buildLoginRateLimitKey(request: Request): Promise<string> {
  const ip = getLoginClientIp(request);
  const hashBytes = await sha256Bytes(`login-ip:${ip}`);
  const hashPrefix = Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return `auth_login_rate:${hashPrefix}`;
}

/**
 * 处理用户登录
 */
export async function handleLogin(request: Request, env: EnvLike): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const logMeta = buildRequestMeta(request, env);
  let payload: unknown;
  try {
    payload = await readJsonWithLimit(request, JSON_BODY_LIMITS.auth);
  } catch (e) {
    console.error('[API Error /login] Request body parse failed', {
      ...logMeta,
      error: getErrorMessage(e),
    });
    if (e instanceof RequestBodyTooLargeError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: '请求体解析失败' }), { status: 400 });
  }

  try {
    const payloadObj =
      payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
    const password = payloadObj.password;
    const turnstileToken = payloadObj.turnstileToken;

    let storageAdapter: StorageAdapter | null = null;
    try {
      storageAdapter = StorageFactory.createAdapter(env);
    } catch {
      storageAdapter = null;
    }
    const hasPersistentStorage = Boolean(storageAdapter && storageAdapter.type !== 'noop');
    const rateKey = hasPersistentStorage ? await buildLoginRateLimitKey(request) : '';
    let existingRateRecord: LoginRateRecord | null = null;
    const now = Date.now();

    if (storageAdapter && hasPersistentStorage && rateKey) {
      try {
        existingRateRecord = await storageAdapter.get<LoginRateRecord>(rateKey, 'json', { fresh: true });
      } catch {
        existingRateRecord = null;
      }

      if (existingRateRecord?.lockedUntil && existingRateRecord.lockedUntil > now) {
        const retryAfterSeconds = Math.max(1, Math.ceil((existingRateRecord.lockedUntil - now) / 1000));
        return new Response(
          JSON.stringify({
            error: '登录尝试过于频繁，请稍后再试',
            code: 'LOGIN_RATE_LIMITED',
            retryAfterSeconds,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': String(retryAfterSeconds),
            },
          },
        );
      }
    }

    let savedSettings: TurnstileRawSettings = {};
    if (storageAdapter && hasPersistentStorage) {
      try {
        savedSettings = (await storageAdapter.get<TurnstileRawSettings>(STORAGE_KEY_SETTINGS)) || {};
      } catch (settingsError) {
        console.warn('[API /login] Failed to load settings for Turnstile check:', getErrorMessage(settingsError));
      }
    }

    const turnstileConfig = resolveTurnstileConfig({ ...DEFAULT_SETTINGS, ...savedSettings }, env);
    if (turnstileConfig.enableForLogin) {
      const verification = await verifyTurnstileToken(turnstileToken, request, {
        secretKey: turnstileConfig.secretKey,
      });
      if (!verification.success) {
        return new Response(
          JSON.stringify({
            error: verification.error,
            code: verification.code || 'turnstile_failed',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
    }

    const inputPassword = normalizeSecret(password);
    const currentPassword = normalizeSecret(await getAdminPassword(env));
    const isPasswordMatched = await timingSafeStringEqual(inputPassword, currentPassword);

    if (isPasswordMatched) {
      if (storageAdapter && hasPersistentStorage && rateKey) {
        await storageAdapter.delete(rateKey).catch(() => {});
      }
      const secret = await getSessionSigningSecret(env);
      const token = await createSignedToken(secret, String(Date.now()));
      const isSecure = request.url.startsWith('https');
      const cookieString = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; ${isSecure ? 'Secure;' : ''} SameSite=Lax; Max-Age=${SESSION_DURATION / 1000}`;
      const response = new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      response.headers.append('Set-Cookie', cookieString);
      return response;
    }

    if (storageAdapter && hasPersistentStorage && rateKey) {
      const prevWindowStart = existingRateRecord?.windowStart;
      const withinWindow =
        existingRateRecord &&
        typeof prevWindowStart === 'number' &&
        Number.isFinite(prevWindowStart) &&
        now - prevWindowStart < LOGIN_RATE_LIMIT_WINDOW_MS;
      const windowStart = withinWindow ? prevWindowStart : now;
      const nextCount = (withinWindow ? Number(existingRateRecord?.count) || 0 : 0) + 1;
      const lockedUntil = nextCount >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS ? now + LOGIN_RATE_LIMIT_LOCKOUT_MS : 0;
      const expiresAt = Math.max(lockedUntil, windowStart + LOGIN_RATE_LIMIT_WINDOW_MS);
      await storageAdapter
        .put(rateKey, {
          count: nextCount,
          windowStart,
          lockedUntil,
          expiresAt,
        })
        .catch(() => {});
    }

    return new Response(JSON.stringify({ error: '密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    if (e instanceof AdminPasswordMissingError) {
      console.error('[API Error /login] Admin password missing on initialized instance', logMeta);
      return new Response(
        JSON.stringify({
          error: e.message,
          code: e.code,
        }),
        {
          status: e.status || 503,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    console.error('[API Error /login] Login handler failed', { ...logMeta, error: getErrorMessage(e) });
    return new Response(JSON.stringify({ error: '登录处理失败' }), { status: 500 });
  }
}

/**
 * 处理用户登出
 */
export async function handleLogout(request: Request | null | undefined): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const isSecure = typeof request?.url === 'string' && request.url.startsWith('https');
  const secureFlag = isSecure ? 'Secure;' : '';
  headers.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; ${secureFlag} SameSite=Lax; Max-Age=0`);
  return new Response(JSON.stringify({ success: true }), { headers });
}
