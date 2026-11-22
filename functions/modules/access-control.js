import { createDisguiseResponse, renderDisguisePage } from './disguise-page.js';
import { authMiddleware } from './auth-middleware.js';
import { createJsonResponse, normalizeLoginPath } from './utils.js';

export const DEFAULT_DISGUISE_CONFIG = Object.freeze({
  pageType: 'default',
  redirectUrl: '',
});

/**
 * 规范化拦截响应配置，确保字段类型与默认值一致
 * @param {Object|null|undefined} raw
 * @returns {{pageType: 'default'|'redirect', redirectUrl: string}}
 */
export function normalizeDisguiseConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_DISGUISE_CONFIG };
  }
  const pageType = raw.pageType === 'redirect' ? 'redirect' : 'default';
  const redirectUrl = typeof raw.redirectUrl === 'string' ? raw.redirectUrl.trim() : '';
  return { pageType, redirectUrl };
}

/**
 * 判断公开页（/、/explore 及公开 API）是否允许未登录访问
 * @param {Object|null|undefined} config
 * @returns {boolean}
 */
export function isPublicPageEnabled(config) {
  if (!config || typeof config !== 'object') return true;
  if (typeof config.enablePublicPage === 'string') {
    return config.enablePublicPage.toLowerCase() !== 'false';
  }
  return config.enablePublicPage !== false;
}

/**
 * 判断是否允许浏览器直接打开订阅链接（默认允许；关闭后仅放行代理客户端）
 * @param {Object|null|undefined} config
 * @returns {boolean}
 */
export function isBrowserSubAccessAllowed(config) {
  if (!config || typeof config !== 'object') return true;
  if (typeof config.allowBrowserSubAccess === 'string') {
    return config.allowBrowserSubAccess.toLowerCase() !== 'false';
  }
  return config.allowBrowserSubAccess !== false;
}

/**
 * 生成统一的拦截响应（独立于「禁止浏览器打开订阅链接」开关，统一用于所有被拦截请求）：
 * - 当策略为 redirect 且配置了目标 URL 时执行 302 跳转
 * - 策略为 default（默认 404）或未填写目标 URL 时返回不可缓存的干净 404 页面，绝不泄露残留 redirectUrl
 *
 * @param {Object|null|undefined} disguiseConfig
 * @param {string} [requestUrl]
 * @returns {Response}
 */
export function createBlockedResponse(disguiseConfig, requestUrl) {
  const disguise = normalizeDisguiseConfig(disguiseConfig);
  if (disguise.pageType === 'redirect' && disguise.redirectUrl) {
    return createDisguiseResponse(disguise, requestUrl);
  }
  return renderDisguisePage(null);
}

/**
 * 校验公开 API（/api/public/profiles、/api/public/preview、/api/public/guestbook）的访问权限：
 * - 公开页开启时放行
 * - 公开页关闭时仅允许已登录管理员访问，未登录统一返回 404
 *
 * @param {Request} request
 * @param {Object} env
 * @param {Object} config
 * @returns {Promise<Response|null>}
 */
export async function enforcePublicApiAccess(request, env, config) {
  if (isPublicPageEnabled(config)) {
    return null;
  }
  if (await authMiddleware(request, env)) {
    return null;
  }
  return createJsonResponse({ success: false, error: 'Not Found' }, 404);
}

/**
 * 统一评估非 API / 非订阅 / 非静态资源页面的访问控制（单一真源）：
 * 1. 当前生效的登录入口（/login 或自定义路径）始终允许访问，防止管理员锁死
 * 2. 设置了自定义登录路径后，默认 /login 立即拦截
 * 3. / 与 /explore 受 enablePublicPage 控制：开启则放行，关闭则仅已登录管理员可访问
 * 4. /dashboard 与 /dashboard/* 始终需要管理员登录
 * 5. 其余未知路径统一拦截
 *
 * @param {Request} request
 * @param {Object} env
 * @param {Object} config - 合并 DEFAULT_SETTINGS 后的完整配置
 * @returns {Promise<{allow: boolean, response?: Response}>}
 */
export async function evaluatePageAccess(request, env, config) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const loginPath = normalizeLoginPath(config?.customLoginPath);
  const hasCustomLoginPath = loginPath !== '/login';

  // 1. 当前生效的登录入口始终放行
  if (pathname === loginPath) {
    return { allow: true };
  }

  // 2. 自定义登录路径生效后，旧默认 /login 立即失效
  if (hasCustomLoginPath && pathname === '/login') {
    return { allow: false, response: createBlockedResponse(config?.disguise, request.url) };
  }

  // 3. 公开入口：/ 与 /explore
  if (pathname === '/' || pathname === '/explore') {
    if (isPublicPageEnabled(config)) {
      return { allow: true };
    }
    if (await authMiddleware(request, env)) {
      return { allow: true };
    }
    return { allow: false, response: createBlockedResponse(config?.disguise, request.url) };
  }

  // 4. 后台管理 SPA 路由：/dashboard 及子路径
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    if (await authMiddleware(request, env)) {
      return { allow: true };
    }
    return { allow: false, response: createBlockedResponse(config?.disguise, request.url) };
  }

  // 5. 其余未知路径统一拦截
  return { allow: false, response: createBlockedResponse(config?.disguise, request.url) };
}
