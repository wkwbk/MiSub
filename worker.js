/**
 * MiSub Cloudflare Worker 入口适配器
 * 桥接 Cloudflare Workers (Static Assets) 与 Pages Functions 主入口
 */

import { onRequest } from './functions/[[path]].js';

export function createWorkerContext(request, env, ctx = {}) {
  return {
    request,
    env,
    params: {},
    data: {},
    waitUntil: typeof ctx?.waitUntil === 'function' ? ctx.waitUntil.bind(ctx) : () => {},
    passThroughOnException:
      typeof ctx?.passThroughOnException === 'function' ? ctx.passThroughOnException.bind(ctx) : () => {},
    // 置为 undefined，使 [[path]].js 自动走 env.ASSETS.fetch 静态资源分支
    next: undefined,
  };
}

export default {
  /**
   * Cloudflare Worker HTTP 请求入口
   * @param {Request} request
   * @param {Object} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    const context = createWorkerContext(request, env, ctx);
    return await onRequest(context);
  },
};
