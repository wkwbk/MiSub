import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryD1 } from '../helpers/memory-d1.js';
import { fetchSubscriptionNodes } from '../../functions/modules/subscription/security/node-fetcher.js';
import { handleDirectUrlMode } from '../../functions/modules/subscription/core/single-subscription.js';
import { handleProfileMode } from '../../functions/modules/subscription/core/profile-handler.js';
import {
  handlePublicPreviewRequest,
  resetPublicPreviewProtectionForTests,
} from '../../functions/modules/subscription/core/preview-handler.js';
import { resetStrictCooldownMemoryForTests } from '../../functions/modules/subscription/security/fetch-guard.js';
import { handleCronTrigger } from '../../functions/modules/notifications.js';
import {
  handleBatchUpdateNodesRequest,
  handleNodeCountRequest,
} from '../../functions/modules/handlers/node-handler.js';
import { handleNodeTcpingRequest } from '../../functions/modules/handlers/node-inspect-handler.js';
import Card from '@/components/subscriptions/Card.vue';
import SubscriptionPanel from '@/components/subscriptions/SubscriptionPanel.vue';
import { createI18n } from '@/i18n/index.js';

describe('P0/P1 runtime stability & safety guards', () => {
  beforeEach(() => {
    resetStrictCooldownMemoryForTests();
    resetPublicPreviewProtectionForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetStrictCooldownMemoryForTests();
    resetPublicPreviewProtectionForTests();
  });

  it('passes an AbortSignal timeout to fetch in fetchSubscriptionNodes and blocks SSRF URLs without cache fallback', async () => {
    const fetchSpy = vi.fn(async (input) => {
      const req = input instanceof Request ? input : new Request(String(input));
      expect(req.signal).toBeInstanceOf(AbortSignal);
      return new Response('trojan://pass@example.com:443#HK', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const okRes = await fetchSubscriptionNodes('https://sub.example.com/list', 'PublicSub', 'v2rayN/7.23');
    expect(okRes.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const mockStorage = {
      get: vi.fn().mockResolvedValue({
        nodes: ['trojan://cached@example.com:443#Cached'],
        updatedAt: Date.now(),
      }),
    };

    for (const badUrl of ['http://127.0.0.1/sub', 'http://169.254.169.254/latest/meta-data/']) {
      const badRes = await fetchSubscriptionNodes(
        badUrl,
        'BlockedSub',
        'v2rayN/7.23',
        null,
        false,
        '',
        null,
        false,
        false,
        true,
        mockStorage,
        { id: 'ssrf-sub', url: badUrl, enableNodeCache: true },
      );
      expect(badRes.success).toBe(false);
      expect(badRes.nodes).toEqual([]);
      expect(badRes.error).toMatch(/not allowed|Invalid/i);
    }

    expect(mockStorage.get).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await expect(handleDirectUrlMode('http://127.0.0.1/sub', 'MiSub/1.0')).rejects.toThrow(/not allowed/i);
  });

  it('caps upstream concurrency at <= 4 in handleProfileMode', async () => {
    const subscriptions = Array.from({ length: 8 }, (_, idx) => ({
      id: `sub-${idx + 1}`,
      name: `Airport ${idx + 1}`,
      url: `https://sub${idx + 1}.example.com/feed`,
      enabled: true,
    }));
    const env = {
      MISUB_DB: createMemoryD1({
        subscriptions,
        profiles: [
          {
            id: 'prof-1',
            name: 'Bundle',
            enabled: true,
            subscriptions: subscriptions.map((s) => s.id),
            manualNodes: [],
          },
        ],
      }),
    };

    let active = 0;
    let maxActive = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return new Response('trojan://pass@example.com:443#Node', { status: 200 });
      }),
    );

    const result = await handleProfileMode(
      new Request('https://example.com/api/subscription_nodes'),
      env,
      'prof-1',
      'MiSub-Test/1.0',
      false,
      false,
    );

    expect(result.success).toBe(true);
    expect(result.totalCount).toBe(8);
    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it('releases traffic response bodies, caps concurrency <= 6 total fetches, uses AbortSignal, and blocks SSRF in handleCronTrigger', async () => {
    const subscriptions = [
      ...Array.from({ length: 5 }, (_, idx) => ({
        id: `cron-sub-${idx + 1}`,
        name: `Cron Sub ${idx + 1}`,
        url: `https://cron${idx + 1}.example.com/sub`,
        enabled: true,
        autoUpdate: true,
      })),
      {
        id: 'cron-ssrf',
        name: 'Blocked Local',
        url: 'http://127.0.0.1/secret',
        enabled: true,
        autoUpdate: true,
      },
    ];
    const env = {
      MISUB_DB: createMemoryD1({
        subscriptions,
        main: {},
      }),
    };

    const cancelSpies = [];
    let activeFetches = 0;
    let maxActiveFetches = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const req = input instanceof Request ? input : new Request(String(input));
        expect(req.signal).toBeInstanceOf(AbortSignal);
        activeFetches += 1;
        maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeFetches -= 1;

        const isTrafficReq = req.headers.get('user-agent') === 'clash-verge/v2.4.3';
        if (isTrafficReq) {
          const cancel = vi.fn().mockResolvedValue(undefined);
          cancelSpies.push(cancel);
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'subscription-userinfo': 'upload=1; download=2; total=100' }),
            body: { cancel },
            text: async () => '',
          };
        }
        return new Response('ss://YWVzLTEyOC1nY206cGFzc0BleGFtcGxlLmNvbTo4Mzg4#ok', { status: 200 });
      }),
    );

    const warnSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const resp = await handleCronTrigger(env);
      const data = await resp.json();

      expect(data.summary.total).toBe(6);
      expect(data.summary.updated).toBe(5);
      expect(data.summary.failed).toBe(1);
      expect(maxActiveFetches).toBeLessThanOrEqual(6);
      expect(cancelSpies).toHaveLength(5);
      for (const spy of cancelSpies) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('cancels traffic response body, passes AbortSignal, and rejects SSRF URLs in handleNodeCountRequest', async () => {
    const ssrfResp = await handleNodeCountRequest(
      new Request('https://example.com/api/node_count', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'http://127.0.0.1/internal' }),
      }),
      {},
    );
    expect(ssrfResp.status).toBe(400);

    const trafficCancelSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const req = input instanceof Request ? input : new Request(String(input));
        expect(req.signal).toBeInstanceOf(AbortSignal);
        if (req.headers.get('user-agent') === 'clash-verge/v2.4.3') {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'subscription-userinfo': 'upload=10; download=20; total=1000' }),
            body: { cancel: trafficCancelSpy },
          };
        }
        return new Response('trojan://pass@example.com:443#HK', { status: 200 });
      }),
    );

    const okResp = await handleNodeCountRequest(
      new Request('https://example.com/api/node_count', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://airport.example.com/sub' }),
      }),
      { MISUB_DB: createMemoryD1({ main: { builtinSkipCertVerify: false } }) },
    );
    const data = await okResp.json();

    expect(data.success).toBe(true);
    expect(data.data.count).toBe(1);
    expect(trafficCancelSpy).toHaveBeenCalledTimes(1);
  });

  it('caps batch update concurrency at <= 4, passes AbortSignal, and blocks SSRF URLs without fetch', async () => {
    const subscriptions = [
      ...Array.from({ length: 7 }, (_, idx) => ({
        id: `b-${idx + 1}`,
        name: `Batch ${idx + 1}`,
        url: `https://batch${idx + 1}.example.com/sub`,
        enabled: true,
        autoUpdate: true,
      })),
      {
        id: 'b-ssrf',
        name: 'SSRF Batch',
        url: 'http://127.0.0.1/admin',
        enabled: true,
        autoUpdate: true,
      },
    ];
    const env = { MISUB_DB: createMemoryD1({ subscriptions }) };

    let active = 0;
    let maxActive = 0;
    const fetchSpy = vi.fn(async (input) => {
      const req = input instanceof Request ? input : new Request(String(input));
      expect(req.signal).toBeInstanceOf(AbortSignal);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return new Response('trojan://pass@example.com:443#HK', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const resp = await handleBatchUpdateNodesRequest(
      new Request('https://example.com/api/batch_update_nodes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscriptionIds: subscriptions.map((s) => s.id) }),
      }),
      env,
    );
    const data = await resp.json();

    expect(data.success).toBe(true);
    expect(data.summary.successfulUpdates).toBe(7);
    expect(data.summary.failedUpdates).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(7);
    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it('protects /api/public/preview with edge caching, Single-Flight coalescing, and per-IP rate limiting', async () => {
    const env = {
      MISUB_DB: createMemoryD1({
        main: { enablePublicPage: true },
        subscriptions: [
          {
            id: 'pub-sub-1',
            name: 'Public Sub',
            url: 'https://public-sub.example.com/feed',
            enabled: true,
          },
        ],
        profiles: [
          {
            id: 'pub-prof-1',
            customId: 'public-bundle',
            name: 'Public Bundle',
            enabled: true,
            isPublic: true,
            subscriptions: ['pub-sub-1'],
            manualNodes: [],
            updatedAt: '2026-11-26T00:00:00Z',
          },
        ],
      }),
    };

    const fetchSpy = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return new Response('trojan://pass@example.com:443#PublicNode', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const makePreviewReq = (ip = '203.0.113.10') =>
      new Request('https://example.com/api/public/preview', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-connecting-ip': ip,
        },
        body: JSON.stringify({ profileId: 'public-bundle' }),
      });

    // Concurrent misses coalesce into a single upstream fetch via Single-Flight
    const [r1, r2] = await Promise.all([
      handlePublicPreviewRequest(makePreviewReq('203.0.113.10'), env),
      handlePublicPreviewRequest(makePreviewReq('203.0.113.11'), env),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.headers.get('X-MiSub-Edge-Cache')).toBe('MISS');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Subsequent call hits the isolate/edge cache without fetching upstream
    const r3 = await handlePublicPreviewRequest(makePreviewReq('203.0.113.12'), env);
    expect(r3.status).toBe(200);
    expect(r3.headers.get('X-MiSub-Edge-Cache')).toBe('HIT');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Same IP exceeding 20 requests/min receives 429 with Retry-After
    for (let i = 0; i < 19; i += 1) {
      const okResp = await handlePublicPreviewRequest(makePreviewReq('203.0.113.10'), env);
      expect(okResp.status).toBe(200);
    }
    const limitedResp = await handlePublicPreviewRequest(makePreviewReq('203.0.113.10'), env);
    expect(limitedResp.status).toBe(429);
    expect(Number(limitedResp.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(limitedResp.headers.get('X-MiSub-Rate-Limit')).toBe('public-preview');
  });

  it('returns 501 unsupported cleanly for handleNodeTcpingRequest when cloudflare:sockets is unavailable', async () => {
    const resp = await handleNodeTcpingRequest(
      new Request('https://example.com/api/nodes/tcping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targets: [{ id: 'n1', host: '1.1.1.1', port: 443 }] }),
      }),
      {},
    );
    expect(resp.status).toBe(501);
    const data = await resp.json();
    expect(data).toMatchObject({ success: false, unsupported: true });
  });

  it('does not mutate props.misub.enabled in Card.vue and emits toggle upward through SubscriptionPanel', async () => {
    const misub = {
      id: 'sub-card-1',
      name: 'Test Card Sub',
      url: 'https://example.com/sub',
      enabled: true,
      nodeCount: 3,
      tags: [],
    };
    const cardWrapper = mount(Card, {
      props: { misub },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
      },
    });

    await cardWrapper.get('input[type="checkbox"]').trigger('change');
    expect(misub.enabled).toBe(true);
    expect(cardWrapper.emitted('change')).toEqual([[false]]);

    const panelWrapper = mount(SubscriptionPanel, {
      props: {
        subscriptions: [misub],
        isSorting: false,
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: {
          MoreActionsMenu: { template: '<div><slot name="menu" :close="() => {}" /></div>' },
          draggable: {
            template: '<div><slot name="item" v-for="element in modelValue" :element="element" /></div>',
            props: ['modelValue'],
          },
        },
      },
    });

    await panelWrapper.get('input[type="checkbox"]').trigger('change');
    expect(misub.enabled).toBe(true);
    expect(panelWrapper.emitted('toggle')).toEqual([[{ id: 'sub-card-1', enabled: false }]]);
  });
});
