/**
 * MiSub Cloudflare Pages Functions - 主入口文件
 * 负责路由分发和请求协调
 *
 * 模块化架构v2:
 * - utils.js: 工具函数
 * - auth-middleware.js: 认证中间件
 * - notifications.js: 通知功能
 * - subscription-handler.js: 订阅请求处理
 * - api-handler.js: API处理
 * - api-router.js: API路由
 * - handlers/: 功能处理器模块
 *   - subscription-handler.js: 订阅相关处理
 *   - node-handler.js: 节点相关处理
 *   - debug-handler.js: 调试相关处理
 * - utils/: 工具模块
 *   - geo-utils.js: 地理识别工具
 *   - node-parser.js: 节点解析工具
 */

import { handleMisubRequest } from './modules/subscription/main-handler.js';
import { handleApiRequest } from './modules/api-router.js';
import { createJsonResponse, migrateConfigSettings, normalizeLoginPath } from './modules/utils.js';
import { corsMiddleware, csrfOriginMiddleware, securityHeadersMiddleware } from './middleware/cors.js';
import { handleDisguiseRequest } from './modules/handlers/disguise-handler.js';
import { createDisguiseResponse } from './modules/disguise-page.js'; // 静态导入核心依赖以优化冷加载
import { StorageFactory } from './storage-adapter.js';
import { DEFAULT_SETTINGS as defaultSettings, STORAGE_KEY_SETTINGS } from './modules/config.js';
import { handleCronTrigger } from './modules/notifications.js';
import { authMiddleware, renewAuthSession } from './modules/auth-middleware.js';

function parseCorsOrigins(env, requestUrl) {
  const configured = (env?.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins = configured.length ? configured : [requestUrl.origin];
  if (['localhost', '127.0.0.1'].includes(requestUrl.hostname)) {
    origins.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }
  return Array.from(new Set(origins));
}

function applyNoStoreToHtmlResponse(response) {
  if (!response || !response.headers) {
    return response;
  }
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding');
  headers.delete('content-encoding');
  headers.delete('Content-Length');
  headers.delete('content-length');
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  headers.set('CDN-Cache-Control', 'no-store, no-cache, must-revalidate');
  headers.set('Surrogate-Control', 'no-store, no-cache, must-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function applyCacheHeadersToAssetResponse(response, pathname) {
  if (!response || !response.headers || (response.status !== 200 && response.status !== 304)) {
    return response;
  }
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('text/html')) {
    return response;
  }
  const headers = new Headers(response.headers);
  // Vite 产物（带 hash 的 JS/CSS/Assets）设置为永久不可变强缓存
  if (pathname.startsWith('/assets/')) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('CDN-Cache-Control', 'public, max-age=31536000, immutable');
  } else if (
    pathname.startsWith('/icons/') ||
    /\.(png|jpe?g|svg|webp|ico|woff2?|ttf|eot)$/i.test(pathname)
  ) {
    // 静态图标及图片字体：浏览器与 CDN 强缓存 7 天，后台平滑重校验
    headers.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    headers.set('CDN-Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const INTERNAL_SPA_FETCH_HEADER = 'x-misub-internal-spa-fetch';
const INTERNAL_ORIGIN_ASSET_FETCH_HEADER = 'x-misub-origin-asset-fetch';

async function fetchHostedAssetViaOrigin(request, assetPath) {
  const assetUrl = new URL(assetPath, request.url);
  const headers = new Headers(request.headers);
  headers.delete(INTERNAL_SPA_FETCH_HEADER);
  headers.set(INTERNAL_ORIGIN_ASSET_FETCH_HEADER, '1');

  return fetch(
    new Request(assetUrl.toString(), {
      method: ['GET', 'HEAD'].includes(request.method) ? request.method : 'GET',
      headers,
    }),
    {
      cf: { cacheTtl: 0, cacheEverything: false },
    },
  );
}

async function fetchStaticAsset(request, env, next) {
  if (typeof next === 'function') {
    return next();
  }

  if (typeof env?.ASSETS?.fetch === 'function') {
    return env.ASSETS.fetch(request);
  }

  if (request.headers.get(INTERNAL_ORIGIN_ASSET_FETCH_HEADER) === '1') {
    return new Response('Not Found', { status: 404 });
  }

  const url = new URL(request.url);

  if (url.pathname === '/') {
    return fetchHostedAssetViaOrigin(request, '/index.html');
  }

  if (url.pathname === '/index.html' || /\.\w+$/.test(url.pathname)) {
    return fetchHostedAssetViaOrigin(request, `${url.pathname}${url.search}`);
  }

  return new Response('Not Found', { status: 404 });
}

async function fetchSpaEntry(request, env, next) {
  const indexUrl = new URL('/', request.url);

  if (typeof env?.ASSETS?.fetch === 'function') {
    return env.ASSETS.fetch(new Request(indexUrl, request));
  }

  if (typeof next === 'function') {
    const headers = new Headers(request.headers);
    headers.set(INTERNAL_SPA_FETCH_HEADER, '1');

    if (new URL(request.url).pathname === '/') {
      return applyNoStoreToHtmlResponse(await next());
    }

    const assetsResponse = await fetchStaticAsset(
      new Request(indexUrl, {
        method: request.method,
        headers: headers,
        redirect: request.redirect,
      }),
      env,
      next,
    );
    return applyNoStoreToHtmlResponse(assetsResponse);
  }

  return fetchHostedAssetViaOrigin(request, '/index.html');
}

/**
 * 主要的请求处理函数
 * @param {Object} context - Cloudflare上下文对象
 * @returns {Promise<Response>} HTTP响应
 */
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  try {
    const isPublicAssetRequest =
      ['GET', 'HEAD'].includes(request.method) &&
      (/^\/(assets|icons)\/./.test(url.pathname) ||
        (/\.(png|jpe?g|svg|webp|ico|woff2?|ttf|eot)$/i.test(url.pathname) && !url.pathname.startsWith('/api/')));

    const handleRequest = async () => {
      // 优化：纯静态公共资产（如 /assets/ 打包产物与 /icons/ 图标）直通，跳过异步读取 D1 设置
      if (isPublicAssetRequest) {
        const assetResponse = await fetchStaticAsset(request, env, next);
        if (assetResponse.status === 200 || assetResponse.status === 304) {
          return applyCacheHeadersToAssetResponse(assetResponse, url.pathname);
        }
      }

      const storageAdapter = StorageFactory.createAdapter(env);
      const settings = (await storageAdapter.get(STORAGE_KEY_SETTINGS)) || {};
      context.settings = settings;
      const config = migrateConfigSettings({ ...defaultSettings, ...settings });

      if (request.headers.get(INTERNAL_SPA_FETCH_HEADER) === '1') {
        return applyNoStoreToHtmlResponse(await fetchStaticAsset(request, env, next));
      }

      // 动态识别订阅路由：仅保留 /sub/ 显式前缀，以及用户自定义 mytoken/profileToken 短链
      const isExplicitSubRoute = url.pathname.startsWith('/sub/');

      const firstSeg = url.pathname.split('/').filter(Boolean)[0];
      const isCustomTokenRoute = firstSeg && (firstSeg === config.mytoken || firstSeg === config.profileToken);

      // 路由分发
      if (url.pathname.startsWith('/api/')) {
        // API 路由
        return await handleApiRequest(request, env, context);
      } else if (isExplicitSubRoute || isCustomTokenRoute) {
        // MiSub 订阅路由
        return await handleMisubRequest(context);
      } else if (url.pathname === '/cron') {
        // 定时任务路由 (需要认证)
        // 使用设置中的 cronSecret 进行验证
        const expectedSecret = settings.cronSecret;

        if (!expectedSecret) {
          return createJsonResponse(
            {
              error: 'Cron Secret 未配置',
              hint: '请在设置页面的「自动任务配置」中设置 Cron Secret',
            },
            500,
          );
        }

        const cronAuthHeader = request.headers.get('Authorization');
        const cronSecretParam = url.searchParams.get('secret');
        const isAuthorized = cronAuthHeader === `Bearer ${expectedSecret}` || cronSecretParam === expectedSecret;

        if (!isAuthorized) {
          return createJsonResponse({ error: 'Unauthorized' }, 401);
        }

        return await handleCronTrigger(env);
      } else {
        const isLocalhost = ['localhost', '127.0.0.1'].includes(url.hostname);

        // 本地 wrangler pages dev 调试兜底：优先返回静态资源，避免函数逻辑影响 SPA 首屏
        if (isLocalhost) {
          let localResponse = await fetchStaticAsset(request, env, next);
          const isLikelySpaPath =
            !/\.\w+$/.test(url.pathname) &&
            !url.pathname.startsWith('/api/') &&
            !isExplicitSubRoute &&
            !isCustomTokenRoute &&
            url.pathname !== '/cron';

          if (localResponse.status === 404 && isLikelySpaPath) {
            const indexResponse = await fetchSpaEntry(request, env, next);
            if (indexResponse.status === 200) {
              localResponse = indexResponse;
            }
          }

          return applyNoStoreToHtmlResponse(localResponse);
        }
        // 静态文件处理
        const isStaticAsset = /^\/(assets|@vite|src)\/./.test(url.pathname) || /\.\w+$/.test(url.pathname);

        const customLoginPath = normalizeLoginPath(settings?.customLoginPath);
        const defaultLoginPath = '/login';
        const hasCustomLoginPath = customLoginPath !== defaultLoginPath;

        // SPA 路由白名单：这些请求应该交由前端路由处理，而不是作为订阅请求
        // [修复] 增加更多可能的SPA路由，防止被误判为订阅请求
        // [新增] 动态包含自定义登录路径
        // [Fix #400] 当设置了自定义登录路径时，/login 不再作为 SPA 路由，
        // 应直接返回 404 / disguise 页面以避免暴露自定义路径。
        const isSpaRoute = ['/', '/dashboard', '/login', '/explore', customLoginPath].some((route) => {
          if (route === '/') return url.pathname === '/';
          if (route === '/dashboard') {
            return url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/');
          }
          return url.pathname === route || url.pathname.startsWith(route + '/');
        });

        // [Fix #400] 设置了自定义路径后，/login 不再是有效 SPA 路由
        const isLoginPath = url.pathname === '/login';
        if (hasCustomLoginPath && isLoginPath) {
          return createDisguiseResponse(settings?.disguise, request.url) || new Response('Not Found', { status: 404 });
        }

        const isProtectedSpaRoute =
          isSpaRoute &&
          url.pathname !== '/' &&
          url.pathname !== '/login' &&
          url.pathname !== customLoginPath &&
          !url.pathname.startsWith('/explore');

        if (isProtectedSpaRoute) {
          const isAuthenticated = await authMiddleware(request, env);
          if (!isAuthenticated) {
            return createDisguiseResponse(settings?.disguise, request.url);
          }
        }

        if ((url.pathname === '/' || isSpaRoute) && !isStaticAsset) {
          const disguiseResponse = await handleDisguiseRequest(context, settings);
          if (disguiseResponse) {
            return disguiseResponse;
          }
        }

        if (!isStaticAsset && !isSpaRoute && url.pathname !== '/') {
          return await handleMisubRequest(context);
        }

        let response = await fetchStaticAsset(request, env, next);

        const acceptHeader = request.headers.get('Accept') || '';
        const fetchMode = request.headers.get('Sec-Fetch-Mode') || '';
        const fetchDest = request.headers.get('Sec-Fetch-Dest') || '';
        const isNavigationRequest = fetchMode === 'navigate' || fetchDest === 'document';
        const isHtmlRequest = isNavigationRequest && acceptHeader.includes('text/html');

        if (response.status === 404 && (isSpaRoute || isHtmlRequest)) {
          const indexResponse = await fetchSpaEntry(request, env, next);

          if (indexResponse.status === 200) {
            response = indexResponse;
          }
        }

        if (isStaticAsset && !isHtmlRequest) {
          response = applyCacheHeadersToAssetResponse(response, url.pathname);
        }

        return applyNoStoreToHtmlResponse(response);
      }
    };

    const corsOptions = {
      origins: parseCorsOrigins(env, url),
      allowCredentials: true,
    };
    const response = await corsMiddleware(
      request,
      () => csrfOriginMiddleware(request, () => securityHeadersMiddleware(request, handleRequest), corsOptions),
      corsOptions,
    );

    const isAuthCookieManagementRoute = url.pathname === '/api/login' || url.pathname === '/api/logout';
    if (isPublicAssetRequest || isAuthCookieManagementRoute || request.method === 'OPTIONS') {
      return response;
    }
    return await renewAuthSession(request, env, response);
  } catch (error) {
    // 全局错误处理
    console.error('[Main Handler Error]', error);
    return createJsonResponse(
      {
        error: 'Internal Server Error',
        message: error.message,
      },
      500,
    );
  }
}
