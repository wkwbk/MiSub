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
import { createJsonResponse, migrateConfigSettings } from './modules/utils.js';
import { corsMiddleware, csrfOriginMiddleware, securityHeadersMiddleware } from './middleware/cors.js';
import { evaluatePageAccess } from './modules/access-control.js';
import { StorageFactory } from './storage-adapter.js';
import { DEFAULT_SETTINGS as defaultSettings, STORAGE_KEY_SETTINGS } from './modules/config.js';
import { handleCronTrigger } from './modules/notifications.js';
import { handleCronBackupTrigger, handleCronMaintenanceTrigger } from './modules/scheduled-task-runner.js';
import { rotateSubscriptionToken } from './modules/handlers/rotate-token.js';
import { renewAuthSession } from './modules/auth-middleware.js';
import { normalizeSubPath } from '../shared/reserved-paths.js';

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

      // 统一订阅路由：/{subPath}/{identifier}（默认 subPath = 'sub'）
      const subPath = normalizeSubPath(config.profileToken, 'sub');
      const pathSegments = url.pathname.split('/').filter(Boolean);
      const isSubRoute = pathSegments.length === 2 && pathSegments[0] === subPath;

      // 路由分发
      if (url.pathname.startsWith('/api/')) {
        // API 路由
        return await handleApiRequest(request, env, context);
      } else if (isSubRoute) {
        // MiSub 订阅路由
        return await handleMisubRequest(context);
      } else if (url.pathname === '/cron' || url.pathname.startsWith('/cron/')) {
        // 定时任务路由 (按业务拆分，统一校验 Cron Secret)
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

        switch (url.pathname) {
          case '/cron/subscriptions':
            return await handleCronTrigger(env);
          case '/cron/backup':
            return await handleCronBackupTrigger(env);
          case '/cron/maintenance':
            return await handleCronMaintenanceTrigger(env);
          case '/cron/rotate-token': {
            const rotateResult = await rotateSubscriptionToken(env, {
              request,
              force: url.searchParams.get('force') === '1',
              source: 'http-cron',
            });
            return createJsonResponse({
              success: true,
              task: 'rotate-token',
              ...rotateResult,
            });
          }
          default:
            return createJsonResponse(
              {
                error: '请指定具体的 Cron 任务路径',
                availableTasks: ['/cron/subscriptions', '/cron/backup', '/cron/maintenance', '/cron/rotate-token'],
              },
              400,
            );
        }
      } else {
        // 静态文件直通（如 /assets/、/src/、/logo.png 等）
        const isStaticAsset = /^\/(assets|@vite|src)\/./.test(url.pathname) || /\.\w+$/.test(url.pathname);

        if (!isStaticAsset) {
          const access = await evaluatePageAccess(request, env, config);
          if (!access.allow) {
            return access.response;
          }
        }

        let response = await fetchStaticAsset(request, env, next);

        const acceptHeader = request.headers.get('Accept') || '';
        const fetchMode = request.headers.get('Sec-Fetch-Mode') || '';
        const fetchDest = request.headers.get('Sec-Fetch-Dest') || '';
        const isNavigationRequest = fetchMode === 'navigate' || fetchDest === 'document';
        const isHtmlRequest = isNavigationRequest && acceptHeader.includes('text/html');

        if (response.status === 404 && !isStaticAsset) {
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
