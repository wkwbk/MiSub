/**
 * MiSub Cloudflare Worker 入口适配器
 * 桥接 Cloudflare Workers (Static Assets + Cron Triggers) 与 Pages Functions 主入口
 */

import { onRequest } from './functions/[[path]].js';
import { handleCronTrigger } from './functions/modules/notifications.js';
import { handleCronBackupTrigger, handleCronMaintenanceTrigger } from './functions/modules/scheduled-task-runner.js';

export const WORKER_CRON_SCHEDULES = {
  SUBSCRIPTIONS: '0 */6 * * *',
  BACKUP: '0 2 * * *',
  MAINTENANCE: '30 3 * * *',
};

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

  /**
   * Cloudflare Worker 原生定时任务入口 (Cron Triggers)
   * 按 cron 表达式分发至对应业务任务
   * @param {ScheduledController} event
   * @param {Object} env
   * @param {ExecutionContext} ctx
   */
  async scheduled(event, env, ctx) {
    const cron = event?.cron || '';
    const task = Promise.resolve()
      .then(async () => {
        switch (cron) {
          case WORKER_CRON_SCHEDULES.BACKUP:
            await handleCronBackupTrigger(env);
            break;
          case WORKER_CRON_SCHEDULES.MAINTENANCE:
            await handleCronMaintenanceTrigger(env);
            break;
          case WORKER_CRON_SCHEDULES.SUBSCRIPTIONS:
          default:
            await handleCronTrigger(env);
            break;
        }
      })
      .catch((error) => {
        console.error(`[Worker Scheduled] Cron execution failed (${cron || 'unknown'}):`, error);
      });

    if (typeof ctx?.waitUntil === 'function') {
      ctx.waitUntil(task);
    }
    await task;
  },
};
