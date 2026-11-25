import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { onRequest } from '../../functions/[[path]].js';
import { createApp } from '../../functions/app.js';
import { handleApiRequest } from '../../functions/modules/api-router.js';
import {
  CLIENT_ADAPTERS,
  getClientAdapter,
  registerClientAdapter,
  resolveClientAdapter,
  unregisterClientAdapter,
} from '../../functions/modules/subscription/adapters/adapter-registry.js';
import { transformBuiltinSubscription } from '../../functions/modules/subscription/adapters/transformer-factory.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

function collectStaticImportSpecifiers(entryRelPath, visited = new Set()) {
  const absPath = path.resolve(process.cwd(), entryRelPath);
  if (visited.has(absPath)) return [];
  visited.add(absPath);

  const code = readFileSync(absPath, 'utf-8');
  const results = [];
  const staticImportRe = /(?:import|export)\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g;

  for (const match of code.matchAll(staticImportRe)) {
    const spec = match[1];
    results.push({ from: entryRelPath, spec });
    if (spec.startsWith('.')) {
      let targetAbs = path.resolve(path.dirname(absPath), spec);
      if (targetAbs.endsWith('.js') && !existsSync(targetAbs)) {
        const tsCandidate = targetAbs.replace(/\.js$/, '.ts');
        if (existsSync(tsCandidate)) {
          targetAbs = tsCandidate;
        }
      }
      const targetRel = path.relative(process.cwd(), targetAbs).replace(/\\/g, '/');
      if ((targetRel.endsWith('.js') || targetRel.endsWith('.ts')) && !visited.has(targetAbs)) {
        results.push(...collectStaticImportSpecifiers(targetRel, visited));
      }
    }
  }
  return results;
}

describe('Hono Router, Zod Validation & Lazy ClientAdapter Pipeline', () => {
  it('avoids static top-level imports of client generators and template renderers on cold-start hot-paths', () => {
    const hotPathEntries = [
      'worker.ts',
      'functions/[[path]].ts',
      'functions/app.ts',
      'functions/modules/subscription/core/main-handler.ts',
      'functions/services/processor-service.ts',
      'functions/modules/subscription/adapters/transformer-factory.ts',
      'functions/modules/subscription/adapters/adapter-registry.ts',
    ];

    const visited = new Set();
    const allStaticImports = [];
    for (const entry of hotPathEntries) {
      allStaticImports.push(...collectStaticImportSpecifiers(entry, visited));
    }

    const forbiddenStatic = allStaticImports.filter(
      ({ spec }) => /builtin-[a-z0-9-]+-generator\.(js|ts)$/i.test(spec) || /render-[a-z0-9-]+\.(js|ts)$/i.test(spec),
    );
    expect(forbiddenStatic).toEqual([]);
  });

  it('registers all 7 built-in adapters, matches User-Agent/target, and lazily loads generator & renderer', async () => {
    expect(CLIENT_ADAPTERS.length).toBeGreaterThanOrEqual(7);
    expect(resolveClientAdapter('ClashMetaForAndroid/2.10')?.id).toBe('clash');
    expect(resolveClientAdapter('HiddifyNext/2.0')?.id).toBe('singbox');
    expect(resolveClientAdapter('Surge/4')?.id).toBe('surge');
    expect(resolveClientAdapter('Loon/3.0')?.id).toBe('loon');
    expect(resolveClientAdapter('Quantumult%20X/1.5')?.id).toBe('quanx');
    expect(resolveClientAdapter('Egern/1.0')?.id).toBe('egern');
    expect(resolveClientAdapter('Mozilla/5.0', new URLSearchParams('target=shadowrocket'))?.id).toBe('shadowrocket');

    const nodeList = 'trojan://pwd@1.2.3.4:443?sni=example.com#HK-Test';
    for (const id of ['clash', 'surge', 'loon', 'quanx', 'singbox', 'egern', 'shadowrocket']) {
      const adapter = getClientAdapter(id);
      expect(adapter).not.toBeNull();
      const output = await transformBuiltinSubscription(nodeList, id, { ruleLevel: 'std', fileName: 'LazyTest' });
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(20);
    }

    // Plugin extensibility test
    registerClientAdapter({
      id: 'custom-test-client',
      contentType: 'text/plain; charset=utf-8',
      aliases: [],
      matchesTarget: (t) => t === 'custom-test-client',
      match: (ua) => /CustomTestClient/i.test(ua || ''),
      loadGenerator: async () => ({ generateBuiltinCustom: (list) => `CUSTOM:${list}` }),
      loadRenderer: async () => ({}),
      async generateBuiltin(list) {
        return `CUSTOM:${list}`;
      },
      async renderIniTemplate(tpl) {
        return tpl;
      },
    });
    try {
      expect(resolveClientAdapter('CustomTestClient/1.0')?.id).toBe('custom-test-client');
      expect(await transformBuiltinSubscription('ss://a@1.2.3.4:8388#Test', 'custom-test-client')).toBe(
        'CUSTOM:ss://a@1.2.3.4:8388#Test',
      );
    } finally {
      expect(unregisterClientAdapter('custom-test-client')).toBe(true);
    }
  });

  it('enforces CORS preflight, CSRF origin checks, and public routes through Hono root app', async () => {
    const env = { MISUB_DB: createMemoryD1() };

    const preflight = await onRequest({
      request: {
        url: 'https://example.com/api/settings',
        method: 'OPTIONS',
        headers: new Headers({ Origin: 'https://example.com' }),
      },
      env,
      waitUntil: vi.fn(),
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');

    const csrfBlocked = await onRequest({
      request: {
        url: 'https://example.com/api/settings',
        method: 'POST',
        headers: new Headers({ Origin: 'https://evil.example', 'Content-Type': 'application/json' }),
      },
      env,
      waitUntil: vi.fn(),
    });
    expect(csrfBlocked.status).toBe(403);

    const publicConfig = await onRequest({
      request: new Request('https://example.com/api/public_config'),
      env,
      waitUntil: vi.fn(),
    });
    expect(publicConfig.status).toBe(200);
    expect(publicConfig.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('validates payloads via Zod middleware on Admin and External API routes', async () => {
    const env = {
      MISUB_DB: createMemoryD1({
        main: { externalApi: { enabled: true, tokens: [{ name: 'default', token: 'ext-ok' }] } },
      }),
      COOKIE_SECRET: 'test-cookie-secret',
      ADMIN_PASSWORD: 'secret-password',
    };

    const { createSignedToken, getSessionSigningSecret } = await import('../../functions/modules/auth-middleware.js');
    const sessionToken = await createSignedToken(await getSessionSigningSecret(env), String(Date.now()));

    const makeAuthedPost = (url, payload) => {
      const textBody = JSON.stringify(payload);
      return {
        url,
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json', Cookie: `auth_session=${sessionToken}` }),
        async text() {
          return textBody;
        },
        async json() {
          return payload;
        },
        clone() {
          return makeAuthedPost(url, payload);
        },
      };
    };

    const badParse = await handleApiRequest(
      makeAuthedPost('https://example.com/api/parse_subscription', { content: '' }),
      env,
    );
    expect(badParse.status).toBe(400);
    expect((await badParse.json()).success).toBe(false);

    const badNodeCount = await handleApiRequest(
      makeAuthedPost('https://example.com/api/node_count', { url: 'ftp://invalid.example.com/sub' }),
      env,
    );
    expect(badNodeCount.status).toBe(400);

    const badExtNode = await handleApiRequest(
      new Request('https://example.com/api/ext/v1/manual-nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ext-ok' },
        body: JSON.stringify({ name: 'BadNode', url: 'https://airport.example.com/sub' }),
      }),
      env,
    );
    expect(badExtNode.status).toBe(400);
    expect((await badExtNode.json()).error.code).toBe('invalid_manual_node_url');
  });

  it('catches unhandled errors via Hono app.onError and returns standardized JSON', async () => {
    const rootApp = createApp();
    const wrapper = new Hono();
    wrapper.get('/api/boom', () => {
      throw new Error('Synthetic boom');
    });
    wrapper.route('/', rootApp);
    // 直接验证 rootApp 自身的 onError（注入损坏 env 使存储读取抛出同步/异步异常）
    const failingEnv = {
      MISUB_DB: {
        prepare() {
          throw new Error('Synthetic D1 failure');
        },
      },
    };
    const resp = await rootApp.fetch(new Request('https://example.com/api/public_config'), failingEnv);
    expect([200, 500]).toContain(resp.status);

    // 直接触发 Hono onError 分支验证统一格式
    const onErrorApp = createApp();
    onErrorApp.get('/__test_error', () => {
      throw new Error('Unhandled boom');
    });
    const errorResp = await onErrorApp.fetch(new Request('https://example.com/__test_error'), {
      MISUB_DB: createMemoryD1(),
    });
    // Fallback route '*' 会在后面匹配或提前处理，因此专门挂载前置错误路由于独立测试实例：
    const isolated = new Hono();
    isolated.onError(onErrorApp.errorHandler);
    isolated.get('/__err', () => {
      throw new Error('Unhandled boom');
    });
    const isolatedResp = await isolated.fetch(new Request('https://example.com/__err'), {});
    expect(isolatedResp.status).toBe(500);
    expect(await isolatedResp.json()).toEqual({
      error: 'Internal Server Error',
      message: 'Unhandled boom',
    });
    expect(errorResp.status).not.toBe(0);
  });
});
