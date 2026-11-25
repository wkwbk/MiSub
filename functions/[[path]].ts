/**
 * MiSub Cloudflare Pages Functions - 主入口适配器
 * 统一委托给 Hono 根应用 (`functions/app.js`) 执行路由分发、中间件与异常拦截
 */

import type { PagesFunctionContext } from './types.js';
import { app } from './app.js';
import { ensureStandardRequest, setBoundContext } from './middleware/request-context-store.js';
import { createJsonResponse } from './modules/utils.js';

/**
 * 主要的请求处理函数
 */
export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  try {
    const stdRequest = ensureStandardRequest(context.request);
    setBoundContext(stdRequest, {
      ...context,
      request: stdRequest,
    });
    const executionCtx: ExecutionContext = {
      waitUntil: typeof context.waitUntil === 'function' ? context.waitUntil : () => {},
      passThroughOnException:
        typeof context.passThroughOnException === 'function' ? context.passThroughOnException : () => {},
      props: {},
    };
    return await app.fetch(stdRequest, context.env, executionCtx);
  } catch (error) {
    console.error('[Main Handler Error]', error);
    return createJsonResponse(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
}
