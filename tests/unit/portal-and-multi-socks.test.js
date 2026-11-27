// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as yaml from 'js-yaml';
import { createMemoryD1 } from '../helpers/memory-d1.js';
import { clearSettingsCache } from '../../functions/storage-adapter.js';
import { resetStrictCooldownMemoryForTests } from '../../functions/modules/subscription/security/fetch-guard.js';

function createUpstreamNodes() {
  return [
    'trojan://super-secret-trojan-pass@198.51.100.11:8443#香港-01',
    'trojan://super-secret-trojan-pass-dup@198.51.100.12:8444#香港-01',
    'vless://11111111-2222-3333-4444-555555555555@198.51.100.22:9443?security=tls&sni=jp.example.com#日本-Tokyo',
    'ss://YWVzLTEyOC1nY206c2VjcmV0LXNzLXBhc3M=@198.51.100.33:10443#美国-LosAngeles',
  ].join('\n');
}

function createBaseDb({ settings = {}, profiles = [], subscriptions = [] } = {}) {
  return createMemoryD1({
    main: settings,
    subscriptions: subscriptions.length
      ? subscriptions
      : [
          {
            id: 'sub-1',
            name: '机场A',
            url: 'https://airport.example.com/sub',
            enabled: true,
            userInfo: { upload: 1024 * 1024 * 1024, download: 2 * 1024 * 1024 * 1024, total: 10 * 1024 * 1024 * 1024, expire: 1893456000 },
            sortIndex: 0,
          },
        ],
    profiles: profiles.length
      ? profiles
      : [
          {
            id: 'prof-1',
            name: '主力订阅组',
            customId: 'main',
            linkId: 'link-main',
            subscriptions: ['sub-1'],
            manualNodes: [],
            subProfiles: [],
            enabled: true,
            isPublic: false,
            downloadCount: 0,
            sortIndex: 0,
            configVersion: 1,
          },
        ],
  });
}

describe('Subscription browser portal & Mihomo multi-port SOCKS5', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    clearSettingsCache();
    resetStrictCooldownMemoryForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('serves standalone portal HTML to browser Accept: text/html without leaking upstream secrets, while proxy UAs and explicit flags receive YAML/Base64', async () => {
    const db = createBaseDb({
      settings: {
        myToken: 'default-tok',
        profileToken: 'sub',
        subPortalMode: 'portal',
        subPortalTitle: 'MiSub 统一门户',
        subPortalNotice: '全局公告：请勿泄露订阅地址\n支持多端接入',
        enableTrafficNode: true,
        enableFlagEmoji: true,
        defaultMultiSocksEnabled: true,
        defaultMultiSocksStartPort: 42001,
        defaultMultiSocksListen: '127.0.0.1',
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(createUpstreamNodes(), {
            status: 200,
            headers: {
              'subscription-userinfo': 'upload=1073741824; download=2147483648; total=10737418240; expire=1893456000',
            },
          }),
      ),
    );

    const { handleMisubRequest } = await import('../../functions/modules/subscription/core/main-handler.js');

    const mockSpaHtml =
      '<!DOCTYPE html><html><head><title>MiSub</title><script type="module" src="/assets/main.js"></script></head><body><div id="app"></div></body></html>';

    // 1. 普通浏览器访问：向 SPA index.html 注入脱敏 __MISUB_PORTAL_DATA__，且不泄露上游敏感字段
    const browserRes = await handleMisubRequest({
      request: new Request('https://portal.example.com/sub/main?refresh=1', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      }),
      env: { MISUB_DB: db },
      waitUntil: vi.fn(),
      fetchSpaEntry: async () =>
        new Response(mockSpaHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    });
    const html = await browserRes.text();

    expect(browserRes.status).toBe(200);
    expect(browserRes.headers.get('Content-Type')).toContain('text/html');
    expect(browserRes.headers.get('X-MiSub-Mode')).toBe('subscription-portal');
    expect(html).toContain('<script type="module" src="/assets/main.js"></script>');
    expect(html).toContain('<title>MiSub 统一门户 - MiSub</title>');

    const dataMatch = html.match(/<script id="__MISUB_PORTAL_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    expect(dataMatch).not.toBeNull();
    const portalPayload = JSON.parse(dataMatch[1]);
    expect(portalPayload).toMatchObject({
      title: 'MiSub 统一门户',
      subName: '主力订阅组',
      notice: '全局公告：请勿泄露订阅地址\n支持多端接入',
      pathname: '/sub/main',
      nodeCount: 4,
      traffic: {
        upload: 1024 * 1024 * 1024,
        download: 2 * 1024 * 1024 * 1024,
        total: 10 * 1024 * 1024 * 1024,
        remaining: 7 * 1024 * 1024 * 1024,
      },
      multiSocks: {
        enabled: true,
        listen: '127.0.0.1',
        startPort: 42001,
      },
    });
    expect(portalPayload.multiSocks.bindings).toHaveLength(4);

    // 严禁泄露任何上游节点真实服务器 IP、端口、UUID 或密码
    expect(html).not.toContain('198.51.100.11');
    expect(html).not.toContain('198.51.100.22');
    expect(html).not.toContain('198.51.100.33');
    expect(html).not.toContain('8443');
    expect(html).not.toContain('9443');
    expect(html).not.toContain('10443');
    expect(html).not.toContain('super-secret-trojan-pass');
    expect(html).not.toContain('11111111-2222-3333-4444-555555555555');
    expect(html).not.toContain('secret-ss-pass');

    // 2. Clash/Mihomo 代理客户端 UA 返回 YAML
    const clashRes = await handleMisubRequest({
      request: new Request('https://portal.example.com/sub/main', {
        headers: { 'User-Agent': 'ClashMeta/1.18.0', Accept: '*/*' },
      }),
      env: { MISUB_DB: db },
      waitUntil: vi.fn(),
    });
    const clashYaml = await clashRes.text();
    expect(clashRes.status).toBe(200);
    expect(clashRes.headers.get('Content-Type')).toContain('yaml');
    const parsedClash = yaml.load(clashYaml);
    expect(Array.isArray(parsedClash.proxies)).toBe(true);
    expect(Array.isArray(parsedClash.listeners)).toBe(true);

    // 3. Shadowrocket UA 返回 Base64
    const srRes = await handleMisubRequest({
      request: new Request('https://portal.example.com/sub/main', {
        headers: { 'User-Agent': 'Shadowrocket/2.2.60', Accept: 'text/html,*/*' },
      }),
      env: { MISUB_DB: db },
      waitUntil: vi.fn(),
    });
    expect(srRes.status).toBe(200);
    expect(srRes.headers.get('Content-Type')).toContain('text/plain');

    // 4. 浏览器携带 ?raw=1 / ?target=clash / ?flag=1 走原有订阅输出流程
    const rawRes = await handleMisubRequest({
      request: new Request('https://portal.example.com/sub/main?raw=1', {
        headers: {
          'User-Agent': 'Mozilla/5.0 Chrome/125.0 Safari/537.36',
          Accept: 'text/html',
        },
      }),
      env: { MISUB_DB: db },
      waitUntil: vi.fn(),
    });
    expect(rawRes.status).toBe(200);
    expect(rawRes.headers.get('Content-Type')).toContain('text/plain');

    const targetClashRes = await handleMisubRequest({
      request: new Request('https://portal.example.com/sub/main?target=clash', {
        headers: {
          'User-Agent': 'Mozilla/5.0 Chrome/125.0 Safari/537.36',
          Accept: 'text/html',
        },
      }),
      env: { MISUB_DB: db },
      waitUntil: vi.fn(),
    });
    expect(targetClashRes.status).toBe(200);
    expect(targetClashRes.headers.get('Content-Type')).toContain('yaml');

    const flagRes = await handleMisubRequest({
      request: new Request('https://portal.example.com/sub/main?flag=1', {
        headers: {
          'User-Agent': 'Mozilla/5.0 Chrome/125.0 Safari/537.36',
          Accept: 'text/html',
        },
      }),
      env: { MISUB_DB: db },
      waitUntil: vi.fn(),
    });
    expect(flagRes.status).toBe(200);
    expect(flagRes.headers.get('Content-Type')).toContain('text/plain');
  });

  it('returns 302 redirect when effective portalMode is redirect without fetching upstream', async () => {
    const db = createBaseDb({
      settings: {
        profileToken: 'sub',
        subPortalMode: 'portal',
        subPortalRedirectUrl: 'https://global.example.com',
      },
      profiles: [
        {
          id: 'prof-redirect',
          name: '跳转组',
          customId: 'redir',
          linkId: 'link-redir',
          subscriptions: ['sub-1'],
          manualNodes: [],
          subProfiles: [],
          enabled: true,
          portalMode: 'redirect',
          portalRedirectUrl: 'https://custom-docs.example.com/guide',
          configVersion: 1,
        },
      ],
    });
    const fetchSpy = vi.fn(async () => new Response(createUpstreamNodes(), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const { handleMisubRequest } = await import('../../functions/modules/subscription/core/main-handler.js');
    const res = await handleMisubRequest({
      request: new Request('https://portal.example.com/sub/redir', {
        headers: {
          'User-Agent': 'Mozilla/5.0 Chrome/125.0 Safari/537.36',
          Accept: 'text/html',
        },
      }),
      env: { MISUB_DB: db },
      waitUntil: vi.fn(),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://custom-docs.example.com/guide');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps Mihomo YAML listeners 100% consistent with portal bindings including deduplication, virtual node exclusion, auth, and maxPorts', async () => {
    const db = createBaseDb({
      settings: {
        profileToken: 'sub',
        enableTrafficNode: true,
        enableFlagEmoji: true,
      },
      profiles: [
        {
          id: 'prof-socks',
          name: '多端口组',
          customId: 'socks',
          linkId: 'link-socks',
          subscriptions: ['sub-1'],
          manualNodes: [],
          subProfiles: [],
          enabled: true,
          portalMode: 'portal',
          multiSocksEnabled: true,
          multiSocksStartPort: 43001,
          multiSocksListen: '0.0.0.0',
          multiSocksUsername: 'proxy_user',
          multiSocksPassword: 'proxy_pass',
          multiSocksMaxPorts: 3,
          configVersion: 1,
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(createUpstreamNodes(), {
            status: 200,
            headers: {
              'subscription-userinfo': 'upload=1073741824; download=2147483648; total=10737418240; expire=1893456000',
            },
          }),
      ),
    );

    const { handleMisubRequest } = await import('../../functions/modules/subscription/core/main-handler.js');

    const [yamlRes, portalRes] = await Promise.all([
      handleMisubRequest({
        request: new Request('https://portal.example.com/sub/socks?refresh=1', {
          headers: { 'User-Agent': 'clash-verge/v1.7.7' },
        }),
        env: { MISUB_DB: db },
        waitUntil: vi.fn(),
      }),
      handleMisubRequest({
        request: new Request('https://portal.example.com/sub/socks', {
          headers: {
            'User-Agent': 'Mozilla/5.0 Chrome/125.0 Safari/537.36',
            Accept: 'text/html',
          },
        }),
        env: { MISUB_DB: db },
        waitUntil: vi.fn(),
      }),
    ]);

    const parsedYaml = yaml.load(await yamlRes.text());
    const portalHtml = await portalRes.text();
    const jsonMatch = portalHtml.match(/<script id="__MISUB_PORTAL_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    expect(jsonMatch).not.toBeNull();
    const portalPayload = JSON.parse(jsonMatch[1]);
    const portalBindings = portalPayload.multiSocks.bindings;

    // 共有 4 个真实节点，maxPorts=3，且排除了流量/到期虚拟节点
    expect(parsedYaml.listeners).toHaveLength(3);
    expect(portalBindings).toHaveLength(3);

    const proxyNames = new Set(parsedYaml.proxies.map((p) => p.name));
    expect(proxyNames.size).toBe(parsedYaml.proxies.length);

    parsedYaml.listeners.forEach((listener, index) => {
      const binding = portalBindings[index];
      expect(listener).toEqual({
        name: `socks-${43001 + index}`,
        type: 'socks',
        listen: '0.0.0.0',
        port: 43001 + index,
        proxy: binding.proxyName,
        udp: true,
        users: [{ username: 'proxy_user', password: 'proxy_pass' }],
      });
      expect(proxyNames.has(listener.proxy)).toBe(true);
      expect(binding.port).toBe(43001 + index);
      expect(binding.listen).toBe('0.0.0.0');
      expect(binding.protocol).toBe('socks5');
      expect(binding.username).toBe('proxy_user');
      expect(binding.password).toBe('proxy_pass');
      expect(binding).not.toHaveProperty('server');
      expect(binding).not.toHaveProperty('uuid');
    });

    // 验证重名去重（两个 香港-01 均唯一）
    expect(portalBindings[0].proxyName).not.toBe(portalBindings[1].proxyName);
    expect(portalBindings[0].countryCode).toBe('HK');
    expect(portalBindings[2].countryCode).toBe('JP');
  });

  it('enforces priority override URL > Profile > Settings and isolates edge cache between portal HTML and client responses', async () => {
    const db = createBaseDb({
      settings: {
        profileToken: 'sub',
        enableFlagEmoji: false,
        enableTrafficNode: false,
        subFetchMinInterval: 15,
        subFetchLimitMode: 'cache',
        defaultMultiSocksEnabled: false,
        defaultMultiSocksStartPort: 42001,
        defaultMultiSocksListen: '127.0.0.1',
      },
      profiles: [
        {
          id: 'prof-prio',
          name: '优先级组',
          customId: 'prio',
          linkId: 'link-prio',
          subscriptions: ['sub-1'],
          manualNodes: [],
          subProfiles: [],
          enabled: true,
          multiSocksEnabled: true,
          multiSocksStartPort: 45001,
          multiSocksListen: '127.0.0.1',
          configVersion: 1,
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(createUpstreamNodes(), {
            status: 200,
            headers: {
              'subscription-userinfo': 'upload=1073741824; download=2147483648; total=10737418240; expire=1893456000',
            },
          }),
      ),
    );

    const { handleMisubRequest } = await import('../../functions/modules/subscription/core/main-handler.js');

    // 先由浏览器命中门户并写入 Edge Cache，确保不会污染后续代理客户端请求
    const portalFirst = await handleMisubRequest({
      request: new Request('https://portal.example.com/sub/prio', {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/125.0 Safari/537.36', Accept: 'text/html' },
      }),
      env: { MISUB_DB: db },
      waitUntil: vi.fn(),
    });
    expect(portalFirst.headers.get('Content-Type')).toContain('text/html');

    // Profile 覆盖全局（45001, 127.0.0.1）
    const profileYamlRes = await handleMisubRequest({
      request: new Request('https://portal.example.com/sub/prio', {
        headers: { 'User-Agent': 'ClashMeta/1.18.0' },
      }),
      env: { MISUB_DB: db },
      waitUntil: vi.fn(),
    });
    expect(profileYamlRes.headers.get('Content-Type')).toContain('yaml');
    const profileYaml = yaml.load(await profileYamlRes.text());
    expect(profileYaml.listeners[0]).toMatchObject({ port: 45001, listen: '127.0.0.1' });

    // URL 参数覆盖 Profile（?mode=multi-socks&startPort=46001&listen=0.0.0.0）
    const queryYamlRes = await handleMisubRequest({
      request: new Request('https://portal.example.com/sub/prio?mode=multi-socks&startPort=46001&listen=0.0.0.0', {
        headers: { 'User-Agent': 'curl/8.5.0' },
      }),
      env: { MISUB_DB: db },
      waitUntil: vi.fn(),
    });
    expect(queryYamlRes.headers.get('Content-Type')).toContain('yaml');
    const queryYaml = yaml.load(await queryYamlRes.text());
    expect(queryYaml.listeners[0]).toMatchObject({ port: 46001, listen: '0.0.0.0' });

    // URL 参数强制关闭 multi-socks（?mode=normal）
    const disabledByQueryRes = await handleMisubRequest({
      request: new Request('https://portal.example.com/sub/prio?mode=normal', {
        headers: { 'User-Agent': 'ClashMeta/1.18.0' },
      }),
      env: { MISUB_DB: db },
      waitUntil: vi.fn(),
    });
    const disabledByQueryYaml = yaml.load(await disabledByQueryRes.text());
    expect(disabledByQueryYaml.listeners).toBeUndefined();
  });

  it('persists and validates new portal & multi-socks fields via PATCH /api/profiles/:id and PATCH /api/settings', async () => {
    const db = createBaseDb();
    const env = { MISUB_DB: db };
    const { handleSettingsSave, handleSettingsGet } = await import('../../functions/modules/api-handler.js');
    const { handleProfilePatch } = await import('../../functions/modules/resource-crud-handler.js');

    // 1. Settings 非法端口校验
    const badSettingsRes = await handleSettingsSave(
      new Request('https://portal.example.com/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultMultiSocksStartPort: 80 }),
      }),
      env,
    );
    expect(badSettingsRes.status).toBe(400);

    // 2. Settings 合法持久化
    const okSettingsRes = await handleSettingsSave(
      new Request('https://portal.example.com/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subPortalMode: 'redirect',
          subPortalRedirectUrl: 'https://docs.example.com',
          subPortalTitle: '企业订阅门户',
          subPortalNotice: '全局通知',
          defaultMultiSocksEnabled: true,
          defaultMultiSocksStartPort: 44001,
          defaultMultiSocksListen: '0.0.0.0',
          portalCustomPage: {
            enabled: true,
            type: 'html',
            content: '<div class="custom-portal">{{title}} {{overview}}</div>',
            css: '.custom-portal { padding: 16px; }',
            useDefaultLayout: false,
            hideBranding: true,
            hideHeader: true,
            hideFooter: true,
          },
        }),
      }),
      env,
    );
    expect(okSettingsRes.status).toBe(200);
    const savedSettings = await (await handleSettingsGet(env)).json();
    expect(savedSettings).toMatchObject({
      subPortalMode: 'redirect',
      subPortalRedirectUrl: 'https://docs.example.com',
      subPortalTitle: '企业订阅门户',
      subPortalNotice: '全局通知',
      defaultMultiSocksEnabled: true,
      defaultMultiSocksStartPort: 44001,
      defaultMultiSocksListen: '0.0.0.0',
      portalCustomPage: {
        enabled: true,
        type: 'html',
        content: '<div class="custom-portal">{{title}} {{overview}}</div>',
        css: '.custom-portal { padding: 16px; }',
        useDefaultLayout: false,
        hideBranding: true,
        hideHeader: true,
        hideFooter: true,
      },
    });

    // 3. Profile PATCH 非法 URL / 端口校验
    const badProfileRes = await handleProfilePatch(
      new Request('https://portal.example.com/api/profiles/prof-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configVersion: 1, portalRedirectUrl: 'javascript:alert(1)' }),
      }),
      env,
      'prof-1',
    );
    expect(badProfileRes.status).toBe(400);

    // 4. Profile PATCH 正常持久化 + OCC 版本递增
    const patchRes = await handleProfilePatch(
      new Request('https://portal.example.com/api/profiles/prof-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configVersion: 1,
          portalMode: 'portal',
          portalNotice: '单组公告',
          multiSocksEnabled: true,
          multiSocksStartPort: 45100,
          multiSocksListen: '127.0.0.1',
          multiSocksUsername: 'u1',
          multiSocksPassword: 'p1',
          multiSocksMaxPorts: 50,
        }),
      }),
      env,
      'prof-1',
    );
    expect(patchRes.status).toBe(200);
    const patchedBody = await patchRes.json();
    expect(patchedBody.data).toMatchObject({
      configVersion: 2,
      portalMode: 'portal',
      portalNotice: '单组公告',
      multiSocksEnabled: true,
      multiSocksStartPort: 45100,
      multiSocksListen: '127.0.0.1',
      multiSocksUsername: 'u1',
      multiSocksPassword: 'p1',
      multiSocksMaxPorts: 50,
    });

    // 5. Profile PATCH 清除覆盖恢复继承全局
    const resetOverrideRes = await handleProfilePatch(
      new Request('https://portal.example.com/api/profiles/prof-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configVersion: 2,
          portalMode: 'inherit',
          multiSocksEnabled: null,
          multiSocksStartPort: null,
          multiSocksListen: '',
          multiSocksMaxPorts: null,
        }),
      }),
      env,
      'prof-1',
    );
    expect(resetOverrideRes.status).toBe(200);
    const resetBody = await resetOverrideRes.json();
    expect(resetBody.data).toMatchObject({
      configVersion: 3,
      portalMode: 'inherit',
      multiSocksEnabled: null,
      multiSocksStartPort: null,
      multiSocksListen: '',
      multiSocksMaxPorts: null,
    });
  });
});
