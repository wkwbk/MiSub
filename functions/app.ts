import { type Context, Hono } from 'hono';
import { normalizeSubPath } from '@misub/core/domain/reserved-paths.js';
import type { BoundRequestContext, Env, HonoEnv } from './types.js';
import { StorageFactory } from './storage-adapter.js';
import { createRepositories } from './repositories/index.js';
import { DEFAULT_SETTINGS as defaultSettings, STORAGE_KEY_SETTINGS } from './modules/config.js';
import { createJsonResponse, migrateConfigSettings } from './modules/utils.js';
import { type AccessControlConfig, evaluatePageAccess } from './modules/access-control.js';
import { timingSafeStringEqual } from './modules/auth-middleware.js';
import { apiApp } from './modules/api-router.js';
import { handleMisubRequest } from './modules/subscription/core/main-handler.js';
import { handleCronTrigger } from './modules/notifications.js';
import { handleCronBackupTrigger, handleCronMaintenanceTrigger } from './modules/scheduled-task-runner.js';
import { rotateSubscriptionToken } from './modules/handlers/rotate-token.js';
import { getBoundContext, setBoundContext } from './middleware/request-context-store.js';
import {
  corsCsrfSecurityMiddleware,
  isPublicStaticAssetRequest,
  sessionRenewalMiddleware,
} from './middleware/hono-middlewares.js';

const INTERNAL_SPA_FETCH_HEADER = 'x-misub-internal-spa-fetch';
const INTERNAL_ORIGIN_ASSET_FETCH_HEADER = 'x-misub-origin-asset-fetch';

type NextAssetFn = (input?: Request | string, init?: RequestInit) => Promise<Response>;

function applyNoStoreToHtmlResponse(response: Response): Response {
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

function applyCacheHeadersToAssetResponse(response: Response, pathname: string): Response {
  if (!response || !response.headers || (response.status !== 200 && response.status !== 304)) {
    return response;
  }
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('text/html')) {
    return response;
  }
  const headers = new Headers(response.headers);
  if (pathname.startsWith('/assets/')) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('CDN-Cache-Control', 'public, max-age=31536000, immutable');
  } else if (pathname.startsWith('/icons/') || /\.(png|jpe?g|svg|webp|ico|woff2?|ttf|eot)$/i.test(pathname)) {
    headers.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    headers.set('CDN-Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function fetchHostedAssetViaOrigin(request: Request, assetPath: string): Promise<Response> {
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

async function fetchStaticAsset(request: Request, env: Env | undefined, next?: NextAssetFn): Promise<Response> {
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

async function fetchSpaEntry(request: Request, env: Env | undefined, next?: NextAssetFn): Promise<Response> {
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
        headers,
        redirect: request.redirect,
      }),
      env,
      next,
    );
    return applyNoStoreToHtmlResponse(assetsResponse);
  }

  return fetchHostedAssetViaOrigin(request, '/index.html');
}

async function handleCronDispatch(c: Context<HonoEnv>): Promise<Response> {
  const request = c.req.raw;
  const env = c.env;
  const url = new URL(request.url);
  const ctx = getBoundContext(request, env) || {};
  const settings = ctx.settings || {};
  const expectedSecret = String(settings.cronSecret || env?.CRON_SECRET || '').trim();

  if (!expectedSecret) {
    return createJsonResponse(
      {
        error: 'Cron Secret 未配置',
        hint: '请在设置页面的「自动任务配置」中设置 Cron Secret',
      },
      500,
    );
  }

  const cronAuthHeader = request.headers.get('Authorization') || '';
  const bearerMatch = cronAuthHeader.match(/^Bearer\s+(.+)$/i);
  const bearerToken = bearerMatch ? bearerMatch[1].trim() : '';
  const cronSecretParam = String(url.searchParams.get('secret') || '').trim();
  const isBearerAuthorized = bearerToken ? await timingSafeStringEqual(bearerToken, expectedSecret) : false;
  const isParamAuthorized = cronSecretParam ? await timingSafeStringEqual(cronSecretParam, expectedSecret) : false;

  if (!isBearerAuthorized && !isParamAuthorized) {
    return createJsonResponse({ error: 'Unauthorized' }, 401);
  }

  switch (url.pathname) {
    case '/cron/subscriptions':
      return await handleCronTrigger(env);
    case '/cron/backup':
      return await handleCronBackupTrigger(env);
    case '/cron/maintenance':
      return await handleCronMaintenanceTrigger(env, {
        force: url.searchParams.get('force') === '1',
        source: 'http-cron',
      });
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
}

/**
 * 创建并组装 MiSub 根 Hono 应用
 */
export function createApp() {
  const rootApp = new Hono<HonoEnv>();

  // 全局统一异常拦截
  rootApp.onError((error) => {
    console.error('[Main Handler Error]', error);
    return createJsonResponse(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  });

  // 1. 洋葱最外层：会话续期 + CORS/CSRF + 安全响应头
  rootApp.use('*', sessionRenewalMiddleware);
  rootApp.use('*', corsCsrfSecurityMiddleware);

  // 2. 热路径优化：纯静态公共资产（/assets/*, /icons/*）直接直通，零 D1 查询
  rootApp.use('*', async (c, next) => {
    const request = c.req.raw;
    const url = new URL(request.url);
    if (isPublicStaticAssetRequest(request, url.pathname)) {
      const boundCtx = getBoundContext(request, c.env);
      const assetResponse = await fetchStaticAsset(request, c.env, boundCtx?.next);
      if (assetResponse.status === 200 || assetResponse.status === 304) {
        return applyCacheHeadersToAssetResponse(assetResponse, url.pathname);
      }
    }
    await next();
  });

  // 3. 动态请求上下文注入 & 动态订阅路径分发
  rootApp.use('*', async (c, next) => {
    const request = c.req.raw;
    const url = new URL(request.url);
    let executionCtx: ExecutionContext | null = null;
    try {
      executionCtx = c.executionCtx;
    } catch {
      executionCtx = null;
    }
    const defaultWaitUntil =
      typeof executionCtx?.waitUntil === 'function' ? executionCtx.waitUntil.bind(executionCtx) : () => {};
    const defaultPassThrough =
      typeof executionCtx?.passThroughOnException === 'function'
        ? executionCtx.passThroughOnException.bind(executionCtx)
        : () => {};
    const boundCtx: BoundRequestContext = getBoundContext(request) || {
      request,
      env: c.env,
      params: {},
      data: {},
      waitUntil: defaultWaitUntil,
      passThroughOnException: defaultPassThrough,
    };
    boundCtx.request ||= request;
    boundCtx.env ||= c.env;
    boundCtx.params ||= {};
    boundCtx.data ||= {};
    boundCtx.waitUntil ||= defaultWaitUntil;
    boundCtx.passThroughOnException ||= defaultPassThrough;

    const storageAdapter = StorageFactory.createAdapter(c.env);
    boundCtx.storage = storageAdapter;
    const rawSettings = await storageAdapter.get<Partial<typeof defaultSettings> & Record<string, unknown>>(
      STORAGE_KEY_SETTINGS,
    );
    const settings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
    boundCtx.settings = settings;
    const config = migrateConfigSettings({ ...defaultSettings, ...settings });
    boundCtx.config = config;
    boundCtx.repos = createRepositories(c.env, boundCtx);
    setBoundContext(request, boundCtx);

    if (request.headers.get(INTERNAL_SPA_FETCH_HEADER) === '1') {
      return applyNoStoreToHtmlResponse(await fetchStaticAsset(request, c.env, boundCtx.next));
    }

    // 统一订阅路由分发（保持 /api/* 与 /cron/* 优先权）
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/cron' && !url.pathname.startsWith('/cron/')) {
      const subPath = normalizeSubPath(config.profileToken, 'sub');
      const pathSegments = url.pathname.split('/').filter(Boolean);
      const isSubRoute =
        pathSegments[0] === subPath &&
        (pathSegments.length === 2 ||
          (pathSegments.length === 3 && pathSegments[1] !== 'profiles' && /\.conf$/i.test(pathSegments[2])));
      if (isSubRoute) {
        boundCtx.fetchSpaEntry = () => fetchSpaEntry(request, c.env, boundCtx.next);
        return await handleMisubRequest(boundCtx);
      }
    }

    await next();
  });

  // 4. 挂载 /api 路由组
  rootApp.route('/api', apiApp);

  // 5. 挂载 /cron 任务路由组
  rootApp.all('/cron', handleCronDispatch);
  rootApp.all('/cron/*', handleCronDispatch);

  // 6. 静态文件与 SPA 入口兜底（含伪装页/公开页访问评估）
  rootApp.all('*', async (c) => {
    const request = c.req.raw;
    const url = new URL(request.url);
    const boundCtx = getBoundContext(request, c.env) || {};
    const config = boundCtx.config || migrateConfigSettings({ ...defaultSettings });
    const next = boundCtx.next;

    const isStaticAsset = /^\/(assets|@vite|src)\/./.test(url.pathname) || /\.\w+$/.test(url.pathname);
    if (!isStaticAsset) {
      const access = await evaluatePageAccess(request, c.env, config as AccessControlConfig);
      if (!access.allow) {
        return access.response;
      }
    }

    let response = await fetchStaticAsset(request, c.env, next);

    const acceptHeader = request.headers.get('Accept') || '';
    const fetchMode = request.headers.get('Sec-Fetch-Mode') || '';
    const fetchDest = request.headers.get('Sec-Fetch-Dest') || '';
    const isNavigationRequest = fetchMode === 'navigate' || fetchDest === 'document';
    const isHtmlRequest = isNavigationRequest && acceptHeader.includes('text/html');

    if (response.status === 404 && !isStaticAsset) {
      const indexResponse = await fetchSpaEntry(request, c.env, next);
      if (indexResponse.status === 200) {
        response = indexResponse;
      }
    }

    if (isStaticAsset && !isHtmlRequest) {
      response = applyCacheHeadersToAssetResponse(response, url.pathname);
    }

    return applyNoStoreToHtmlResponse(response);
  });

  return rootApp;
}

export const app = createApp();
