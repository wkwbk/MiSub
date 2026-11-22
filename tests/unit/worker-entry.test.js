import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { createWorkerContext } from '../../worker.js';

function createKv(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    async get(key) {
      return values.get(key) ?? null;
    },
    async put(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    },
  };
}

describe('Cloudflare Worker entry (worker.js)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a Pages-compatible context from Worker arguments', () => {
    const waitUntil = vi.fn();
    const passThroughOnException = vi.fn();
    const request = new Request('https://example.com/api/public_config');
    const env = { MISUB_KV: createKv() };

    const context = createWorkerContext(request, env, {
      waitUntil,
      passThroughOnException,
    });

    expect(context.request).toBe(request);
    expect(context.env).toBe(env);
    expect(context.next).toBeUndefined();

    const promise = Promise.resolve();
    context.waitUntil(promise);
    context.passThroughOnException();

    expect(waitUntil).toHaveBeenCalledWith(promise);
    expect(passThroughOnException).toHaveBeenCalledOnce();
  });

  it('routes SPA paths to env.ASSETS.fetch with no-store HTML headers', async () => {
    const assetsFetch = vi.fn(async (req) => {
      const url = new URL(req.url);
      if (url.pathname === '/') {
        return new Response('<!doctype html><html><body>SPA</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const env = {
      MISUB_KV: createKv(),
      ASSETS: { fetch: assetsFetch },
    };

    const response = await worker.fetch(
      new Request('https://example.com/explore', {
        headers: {
          Accept: 'text/html',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Dest': 'document',
        },
      }),
      env,
      { waitUntil: vi.fn() },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('SPA');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(assetsFetch).toHaveBeenCalled();
  });

  it('dispatches Worker scheduled triggers by cron expression and registers with ctx.waitUntil', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const waitUntil = vi.fn();
    const env = {};

    await worker.scheduled({ cron: '0 */6 * * *' }, env, { waitUntil });
    await worker.scheduled({ cron: '0 2 * * *' }, env, { waitUntil });
    await worker.scheduled({ cron: '30 3 * * *' }, env, { waitUntil });

    expect(waitUntil).toHaveBeenCalledTimes(3);
    expect(infoSpy).toHaveBeenCalledWith('[Cron] Starting parallel update for 0 subscriptions');
  });
});
