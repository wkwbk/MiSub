/**
 * Cloudflare Turnstile 人机验证模块
 * 统一解析配置（后台设置优先，环境变量兜底）并向 Cloudflare siteverify 校验令牌
 */

const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isTruthyEnvFlag(value) {
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
 *
 * @param {Object} settings
 * @param {Object} env
 * @returns {Object}
 */
export function resolveTurnstileConfig(settings = {}, env = {}) {
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
 * @param {Object} settings
 * @param {Object} env
 * @returns {{ siteKey: string, enableForGuestbook: boolean, enableForLogin: boolean }}
 */
export function getPublicTurnstileConfig(settings = {}, env = {}) {
  const resolved = resolveTurnstileConfig(settings, env);
  return {
    siteKey: resolved.enabled ? resolved.siteKey : '',
    enableForGuestbook: resolved.enableForGuestbook,
    enableForLogin: resolved.enableForLogin,
  };
}

function getClientIp(request) {
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
 *
 * @param {string} token
 * @param {Request} request
 * @param {Object} [options]
 * @param {string} [options.secretKey]
 * @param {Function} [options.fetchImpl]
 * @returns {Promise<{ success: boolean, error?: string, code?: string, errorCodes?: string[] }>}
 */
export async function verifyTurnstileToken(
  token,
  request,
  { secretKey = '', fetchImpl = fetch } = /** @type {{ secretKey?: string, fetchImpl?: Function }} */ ({}),
) {
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

    const result = await response.json();
    if (result?.success === true) {
      return { success: true };
    }

    const errorCodes = Array.isArray(result?.['error-codes']) ? result['error-codes'] : [];
    const isExpired = errorCodes.includes('timeout-or-duplicate');
    return {
      success: false,
      error: isExpired ? '人机验证已过期，请重新验证' : '人机验证失败，请重试',
      code: isExpired ? 'turnstile_expired' : 'turnstile_invalid',
      errorCodes,
    };
  } catch (error) {
    console.warn('[Turnstile] Verification request failed:', error?.message || error);
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
