/**
 * Cloudflare Turnstile 人机验证模块
 * 统一解析配置（后台设置优先，环境变量兜底）并向 Cloudflare siteverify 校验令牌
 */

import type { Env } from '../types.js';

const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileRawSettings {
  turnstile?: {
    enabled?: unknown;
    siteKey?: unknown;
    secretKey?: unknown;
    enableForGuestbook?: unknown;
    enableForLogin?: unknown;
  };
  [key: string]: unknown;
}

export interface ResolvedTurnstileConfig {
  enabled: boolean;
  siteKey: string;
  secretKey: string;
  hasKeys: boolean;
  hasEnvKeys: boolean;
  loginDisabledByEnv: boolean;
  enableForGuestbook: boolean;
  enableForLogin: boolean;
}

export interface PublicTurnstileConfig {
  siteKey: string;
  enableForGuestbook: boolean;
  enableForLogin: boolean;
}

export interface VerifyTurnstileOptions {
  secretKey?: string;
  fetchImpl?: typeof fetch;
}

export interface VerifyTurnstileResult {
  success: boolean;
  error?: string;
  code?: string;
  errorCodes?: string[];
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isTruthyEnvFlag(value: unknown): boolean {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === 'true'
  );
}

/**
 * 解析当前生效的 Turnstile 配置
 * 密钥优先级：后台设置 > 环境变量 (TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY)
 * 支持通过环境变量 DISABLE_LOGIN_TURNSTILE=true 紧急跳过登录验证，防止配置失误锁死后台
 */
export function resolveTurnstileConfig(
  settings: TurnstileRawSettings | null | undefined = {},
  env: Env | Record<string, unknown> | null | undefined = {},
): ResolvedTurnstileConfig {
  const raw = settings?.turnstile && typeof settings.turnstile === 'object' ? settings.turnstile : {};
  const settingsSiteKey = normalizeString(raw.siteKey);
  const settingsSecretKey = normalizeString(raw.secretKey);
  const envSiteKey = normalizeString(env?.TURNSTILE_SITE_KEY);
  const envSecretKey = normalizeString(env?.TURNSTILE_SECRET_KEY);

  const siteKey = settingsSiteKey || envSiteKey;
  const secretKey = settingsSecretKey || envSecretKey;
  const hasKeys = Boolean(siteKey && secretKey);
  const hasEnvKeys = Boolean(envSiteKey && envSecretKey);
  const loginDisabledByEnv = isTruthyEnvFlag(env?.DISABLE_LOGIN_TURNSTILE);

  const enabled = Boolean(raw.enabled) && hasKeys;
  const enableForGuestbook = enabled && raw.enableForGuestbook !== false;
  const enableForLogin = enabled && Boolean(raw.enableForLogin) && !loginDisabledByEnv;

  return {
    enabled,
    siteKey,
    secretKey,
    hasKeys,
    hasEnvKeys,
    loginDisabledByEnv,
    enableForGuestbook,
    enableForLogin,
  };
}

/**
 * 生成可安全暴露给公开端点的 Turnstile 配置（绝不包含 secretKey）
 */
export function getPublicTurnstileConfig(
  settings: TurnstileRawSettings | null | undefined = {},
  env: Env | Record<string, unknown> | null | undefined = {},
): PublicTurnstileConfig {
  const resolved = resolveTurnstileConfig(settings, env);
  return {
    siteKey: resolved.enabled ? resolved.siteKey : '',
    enableForGuestbook: resolved.enableForGuestbook,
    enableForLogin: resolved.enableForLogin,
  };
}

function getClientIp(request: Request | null | undefined): string {
  if (!request?.headers) return '';
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp.trim();
  const realIp = request.headers.get('X-Real-IP');
  if (realIp) return realIp.trim();
  const forwarded = request.headers.get('X-Forwarded-For');
  if (forwarded) return forwarded.split(',')[0].trim();
  return '';
}

/**
 * 向 Cloudflare Turnstile siteverify 校验前端提交的 token
 */
export async function verifyTurnstileToken(
  token: unknown,
  request: Request | null | undefined,
  { secretKey = '', fetchImpl = fetch }: VerifyTurnstileOptions = {},
): Promise<VerifyTurnstileResult> {
  const normalizedToken = normalizeString(token);
  const normalizedSecret = normalizeString(secretKey);

  if (!normalizedSecret) {
    return {
      success: false,
      error: '人机验证服务未正确配置',
      code: 'turnstile_not_configured',
    };
  }

  if (!normalizedToken) {
    return {
      success: false,
      error: '请先完成人机验证',
      code: 'turnstile_missing',
    };
  }

  const formBody = new URLSearchParams();
  formBody.set('secret', normalizedSecret);
  formBody.set('response', normalizedToken);
  const remoteIp = getClientIp(request);
  if (remoteIp) {
    formBody.set('remoteip', remoteIp);
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 10000) : null;

  try {
    const response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (!response.ok) {
      return {
        success: false,
        error: '人机验证服务暂时不可用，请稍后重试',
        code: 'turnstile_upstream_error',
      };
    }

    const rawResult: unknown = await response.json();
    const result =
      rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)
        ? (rawResult as Record<string, unknown>)
        : null;
    if (result?.success === true) {
      return { success: true };
    }

    const rawErrorCodes = result?.['error-codes'];
    const errorCodes = Array.isArray(rawErrorCodes) ? rawErrorCodes.map((code) => String(code)) : [];
    const isExpired = errorCodes.includes('timeout-or-duplicate');
    return {
      success: false,
      error: isExpired ? '人机验证已过期，请重新验证' : '人机验证失败，请重试',
      code: isExpired ? 'turnstile_expired' : 'turnstile_invalid',
      errorCodes,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[Turnstile] Verification request failed:', errorMessage);
    return {
      success: false,
      error: '人机验证请求失败，请稍后重试',
      code: 'turnstile_network_error',
    };
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}
