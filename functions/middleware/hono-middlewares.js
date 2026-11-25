import { createMiddleware } from 'hono/factory';
import { zValidator } from '@hono/zod-validator';
import { corsMiddleware, csrfOriginMiddleware, securityHeadersMiddleware } from './cors.js';
import { authMiddleware, renewAuthSession } from '../modules/auth-middleware.js';
import { authenticateExternalApiRequest } from '../modules/external-api/external-api-auth.js';
import { createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from '../modules/utils.js';

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

export function isPublicStaticAssetRequest(request, pathname) {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  return (
    /^\/(assets|icons)\/./.test(pathname) ||
    (/\.(png|jpe?g|svg|webp|ico|woff2?|ttf|eot)$/i.test(pathname) && !pathname.startsWith('/api/'))
  );
}

/**
 * 统一洋葱模型 CORS / CSRF 来源校验 / 安全响应头中间件（仅在根 Hono 应用挂载一次）
 */
export const corsCsrfSecurityMiddleware = createMiddleware(async (c, next) => {
  const request = c.req.raw;
  const url = new URL(request.url);
  const corsOptions = {
    origins: parseCorsOrigins(c.env, url),
    allowCredentials: true,
  };

  let nextCalled = false;
  const response = await corsMiddleware(
    request,
    () =>
      csrfOriginMiddleware(
        request,
        () =>
          securityHeadersMiddleware(request, async () => {
            nextCalled = true;
            await next();
            return c.res;
          }),
        corsOptions,
      ),
    corsOptions,
  );

  if (!nextCalled) {
    return response;
  }
  c.res = response;
});

/**
 * 会话自动续期中间件（跳过公开静态资产、登录/登出与预检请求）
 */
export const sessionRenewalMiddleware = createMiddleware(async (c, next) => {
  await next();

  const request = c.req.raw;
  const pathname = new URL(request.url).pathname;
  const isAuthCookieManagementRoute = pathname === '/api/login' || pathname === '/api/logout';

  if (isPublicStaticAssetRequest(request, pathname) || isAuthCookieManagementRoute || request.method === 'OPTIONS') {
    return;
  }

  c.res = await renewAuthSession(request, c.env, c.res);
});

/**
 * 管理端 Cookie 会话鉴权中间件
 */
export const adminAuthMiddleware = createMiddleware(async (c, next) => {
  if (!(await authMiddleware(c.req.raw, c.env))) {
    return createJsonResponse({ error: 'Unauthorized' }, 401);
  }
  await next();
});

/**
 * 对外 API Bearer Token 鉴权中间件
 */
export const externalApiAuthMiddleware = createMiddleware(async (c, next) => {
  const authResult = await authenticateExternalApiRequest(c.req.raw, c.env);
  if (!authResult.ok) {
    return authResult.response;
  }
  c.set('externalTokenName', authResult.tokenName);
  await next();
});

/**
 * Hono Query 参数 Zod 校验包装器
 * @param {import('zod').ZodTypeAny} schema
 * @param {(error: any, c: import('hono').Context) => Response} [onError]
 */
export function zodQueryValidator(schema, onError) {
  return zValidator('query', schema, (result, c) => {
    if (!result.success) {
      if (typeof onError === 'function') {
        return onError(result.error, c);
      }
      return createJsonResponse(
        {
          success: false,
          error: result.error.issues[0]?.message || 'Invalid query parameters',
        },
        400,
      );
    }
  });
}

/**
 * JSON 请求体大小限制与 Zod 校验中间件
 * 使用 request.clone() 读取，确保下游复用现有处理器时原始请求流仍可读且严格维持 413 体积守卫。
 * @param {import('zod').ZodTypeAny} schema
 * @param {{
 *   maxBytes?: number,
 *   skipIf?: (c: import('hono').Context) => boolean | Promise<boolean>,
 *   onParseError?: (error: Error & { status?: number }, c: import('hono').Context) => Response,
 *   onValidationError?: (error: import('zod').ZodError, rawData: unknown, c: import('hono').Context) => Response,
 * }} [options]
 */
export function zodJsonValidator(schema, options = {}) {
  const { maxBytes = JSON_BODY_LIMITS.normal, skipIf, onParseError, onValidationError } = options;

  return createMiddleware(async (c, next) => {
    if (typeof skipIf === 'function' && (await skipIf(c))) {
      await next();
      return;
    }

    let rawData;
    try {
      const reqClone = typeof c.req.raw.clone === 'function' ? c.req.raw.clone() : c.req.raw;
      rawData = await readJsonWithLimit(reqClone, maxBytes);
    } catch (parseError) {
      if (typeof onParseError === 'function') {
        return onParseError(parseError, c);
      }
      return createJsonResponse(
        {
          success: false,
          error: parseError?.message || 'Invalid JSON body',
        },
        parseError?.status || 400,
      );
    }

    const parsed = schema.safeParse(rawData);
    if (!parsed.success) {
      if (typeof onValidationError === 'function') {
        return onValidationError(parsed.error, rawData, c);
      }
      return createJsonResponse(
        {
          success: false,
          error: parsed.error.issues[0]?.message || 'Validation failed',
        },
        400,
      );
    }

    c.set('validatedBody', parsed.data);
    await next();
  });
}
