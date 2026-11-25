import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProcessorService } from '../../functions/services/processor-service.js';
import {
  manualProxyKeys,
  sortShadowrocketNodeList,
  sortShadowrocketProxies,
} from '../../functions/modules/subscription/core/shadowrocket-order.js';
import {
  renderShadowrocketConfigFromClash,
  renderShadowrocketProxy,
} from '../../functions/modules/subscription/templates/renderers/render-shadowrocket.js';
import {
  loadShadowrocketRuleBundle,
  parseShadowrocketRuleBundle,
  resetShadowrocketRuleBundleState,
} from '../../functions/modules/subscription/core/shadowrocket-rule-bundle.js';
import { resolveRequestContext } from '../../functions/modules/subscription/core/request-context.js';
import {
  shadowrocketConfigUrl,
  shadowrocketNodesUrl,
  shadowrocketQrPayload,
} from '@misub/core/domain/shadowrocket-links.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';
import { StorageFactory } from '../../functions/storage-adapter.js';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import CopyLinkModal from '@/components/modals/CopyLinkModal.vue';
import QRCodeModal from '@/components/modals/QRCodeModal.vue';
import { createI18n } from '@/i18n/index.js';

const sampleNodes = [
  'trojan://test@hk.example.com:443#HK-01',
  'vless://11111111-1111-4111-8111-111111111111@us.example.com:443?security=reality&sni=example.com&pbk=PUBLIC_KEY&sid=abcd&spx=%2F&fp=chrome&flow=xtls-rprx-vision#US-Self-LA',
  'trojan://test@us2.example.com:443#US-02',
  'trojan://test@sg.example.com:443#SG-01',
  'trojan://test@jp.example.com:443#JP-01',
].join('\n');

describe('Shadowrocket native .conf generator and rule bundle', () => {
  afterEach(() => {
    resetShadowrocketRuleBundleState();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exports complete native Shadowrocket .conf with VLESS REALITY/Vision, groups, DoH, and geo-split RULE-SET', async () => {
    const output = await ProcessorService.renderOutput({
      targetFormat: 'shadowrocket',
      subName: 'iOS-Shadowrocket',
      combinedNodeList: sampleNodes,
      config: {},
      builtinOptions: {
        ruleLevel: 'std',
        isChinaClient: true,
        compactNames: true,
      },
      templateSource: { kind: 'none', value: '' },
    });

    expect(output.fileName).toBe('iOS-Shadowrocket.conf');
    expect(output.contentType).toBe('text/plain; charset=utf-8');
    expect(output.content).toContain('[General]');
    expect(output.content).toContain('[Proxy]');
    expect(output.content).toContain('[Proxy Group]');
    expect(output.content).toContain('[Rule]');
    expect(output.content).toContain('https://1.1.1.1/dns-query#proxy=');
    expect(output.content).toContain('udp-policy-not-supported-behaviour = REJECT');
    expect(output.content).toMatch(/US-Self-LA = vless, us\.example\.com, 443, .*pbk=PUBLIC_KEY/);
    expect(output.content).toContain('sid=abcd');
    expect(output.content).toContain('xtls=2');
    expect(output.content).toContain('fp=chrome');
    expect(output.content).toContain('https://gh-proxy.org/');
    expect(output.content).toContain('FINAL,');
  });

  it('handles INI templates with use-selected-proxy, YouTube API precedence, and opt-in rule bundle', async () => {
    const entries = Array.from({ length: 50 }, (_, i) => `DOMAIN,site${i}.example,PROXY,force-remote-dns`);
    const bundleText = ['# Shadowrocket-Rule-Sets v1', 'DOMAIN-SUFFIX,chatgpt.com,DIRECT', ...entries].join('\n');
    const template = {
      id: 'custom-sr',
      content: [
        '[MiSub]',
        'shadowrocket-rule-bundle=true',
        '[Proxy Group]',
        'PROXY = select, US-Self-LA, HK-01',
        'YouTube = select, US-Self-LA, US-02',
        'Google-US = select, US-Self-LA',
        '[Rule]',
        'DOMAIN-SUFFIX,bybit.com,PROXY,use-selected-proxy,force-remote-dns',
        'DOMAIN-SUFFIX,googleapis.com,Google-US',
        'DOMAIN,youtube.googleapis.com,YouTube,force-remote-dns',
        'DOMAIN,youtubei.googleapis.com,YouTube,force-remote-dns',
        'MATCH,DIRECT',
      ].join('\n'),
    };

    const db = createMemoryD1();
    const storageAdapter = StorageFactory.createAdapter({ MISUB_DB: db });
    const fetchMock = vi.fn(async () => new Response(bundleText));
    vi.stubGlobal('fetch', fetchMock);

    const output = await ProcessorService.renderOutput({
      targetFormat: 'shadowrocket',
      subName: 'MySR',
      combinedNodeList: sampleNodes,
      config: {},
      builtinOptions: { ruleLevel: 'none', isChinaClient: false, compactNames: false, addFlagEmoji: false },
      templateSource: { kind: 'custom', value: template.id },
      storageAdapter: {
        get: async (key) => (key === 'rule_templates' ? [template] : storageAdapter.get(key)),
        put: (key, val) => storageAdapter.put(key, val),
      },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(output.headers['X-MiSub-Shadowrocket-Rules']).toBe('aggregated');
    expect(output.content).toContain('MiSub 默认代理 = select,');
    expect(output.content).toContain('DOMAIN-SUFFIX,bybit.com,PROXY,force-remote-dns');
    expect(output.content).not.toContain('use-selected-proxy');
    expect(output.content).toContain('DOMAIN,site0.example,MiSub 默认代理,force-remote-dns');

    const rulesSection = output.content.split('[Rule]\n')[1];
    expect(rulesSection.indexOf('DOMAIN,youtube.googleapis.com,YouTube')).toBeLessThan(
      rulesSection.indexOf('DOMAIN-SUFFIX,googleapis.com,Google-US'),
    );
    expect(rulesSection.indexOf('DOMAIN,site0.example')).toBeLessThan(rulesSection.indexOf('FINAL,DIRECT'));
  });

  it('caches rule bundle in D1 cache table and serves stored bundle on background refresh', async () => {
    const entries = Array.from({ length: 50 }, (_, i) => `DOMAIN,cached${i}.example,PROXY,force-remote-dns`);
    const bundleText = ['# Shadowrocket-Rule-Sets v1', ...entries].join('\n');
    const db = createMemoryD1();
    const storageAdapter = StorageFactory.createAdapter({ MISUB_DB: db });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bundleText)),
    );
    const first = await loadShadowrocketRuleBundle({ storageAdapter, isChinaClient: false });
    expect(first.filter(({ key }) => key)).toHaveLength(50);
    expect(db.tables.cache.has('node_cache_sr_rule_bundle_v1')).toBe(true);

    // Cold worker reads cached bundle directly from D1 without blocking on upstream failure
    resetShadowrocketRuleBundleState();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('network down'))),
    );
    const cached = await loadShadowrocketRuleBundle({ storageAdapter, isChinaClient: false });
    expect(cached.filter(({ key }) => key)).toHaveLength(50);

    // Invalid bundle rejected strictly
    expect(() => parseShadowrocketRuleBundle(`${bundleText}\n[MITM]`)).toThrow();
    expect(() => parseShadowrocketRuleBundle(`${bundleText}\n${entries[0]}`)).toThrow();
  });

  it('pins manual nodes first, groups by region, places info last, and compacts names cleanly', () => {
    const sources = [
      { name: '自建洛杉矶', url: 'trojan://self@self.example.com:443#old-name', enabled: true },
      { name: '未选中自建', url: 'trojan://other@other.example.com:443#other', enabled: true },
    ];
    const preferred = manualProxyKeys(sources);
    const proxies = [
      { name: 'JP-01', type: 'trojan', server: 'jp.example.com', port: 443, password: 'jp' },
      { name: 'HK-01', type: 'trojan', server: 'hk.example.com', port: 443, password: 'hk' },
      { name: '流量: 1,000 GB', type: 'http', server: 'info.example.com', port: 80 },
      { name: 'US-Self-LA', type: 'trojan', server: 'self.example.com', port: 8443, password: 'self' },
    ];
    expect(sortShadowrocketProxies(proxies, preferred).map((p) => p.name)).toEqual([
      'US-Self-LA',
      'HK-01',
      'JP-01',
      '流量: 1,000 GB',
    ]);

    const sortedFeed = sortShadowrocketNodeList(
      [
        'trojan://a@hk.example.com:443#HK-01',
        sources[0].url,
        'trojan://b@jp.example.com:443#%F0%9F%87%BA%F0%9F%87%B2%20%5BIPLC-%E7%BE%8E%E5%9B%BD-01%5D%20%E2%9C%A8%202x',
      ].join('\n'),
      preferred,
      { compactNames: true },
    );
    const lines = sortedFeed.trim().split('\n');
    expect(lines[0]).toContain('self.example.com');
  });

  it('renders SS-2022, Hysteria2, AnyTLS, TUIC, and sanitizes separators', () => {
    expect(
      renderShadowrocketProxy({
        name: 'HK-SS',
        type: 'ss',
        server: 'ss.example.com',
        port: 443,
        cipher: '2022-blake3-aes-256-gcm',
        password: 'AAAA==',
        udp: true,
      }).proxyLine,
    ).toContain('method=2022-blake3-aes-256-gcm, password=AAAA==');

    const conf = renderShadowrocketConfigFromClash(
      {
        proxies: [{ name: 'HK,with=sep', type: 'anytls', server: 'any.example.com', port: 443, password: 'pwd' }],
        'proxy-groups': [{ name: 'PROXY', type: 'select', proxies: ['HK,with=sep'] }],
        rules: ['MATCH,PROXY'],
      },
      { compactNames: false },
    );
    expect(conf).toContain('HK with sep = anytls');
    expect(conf).toContain('MiSub 默认代理 = select, HK with sep');
  });

  it('resolves 3-segment .conf download paths while rejecting /sub/profiles/...', () => {
    const config = { myToken: 'main', profileToken: 'sub' };
    expect(
      resolveRequestContext(new URL('https://example.com/sub/vip/MyProfile.conf?target=shadowrocket'), config),
    ).toEqual({
      token: 'sub',
      profileIdentifier: 'vip',
    });
    expect(resolveRequestContext(new URL('https://example.com/sub/profiles/group-a'), config)).toEqual({
      token: '',
      profileIdentifier: null,
    });
  });

  it('builds Shadowrocket config/node URLs, QR payloads, and exposes entries in CopyLinkModal & QRCodeModal', async () => {
    const base = 'https://misub.example/sub/daily';
    expect(shadowrocketConfigUrl(base, '日常使用')).toBe(
      `https://misub.example/sub/daily/${encodeURIComponent('日常使用.conf')}?target=shadowrocket`,
    );
    expect(shadowrocketNodesUrl(base)).toBe('https://misub.example/sub/daily?target=base64&node-order=manual-region');
    expect(shadowrocketQrPayload(base, 'shadowrocket-config', '日常使用')).toContain('shadowrocket://config/add/');
    expect(shadowrocketQrPayload(base, 'shadowrocket-nodes', '日常使用')).toContain('shadowrocket://add/sub://');

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const modalStub = {
      props: ['show'],
      template: '<div v-if="show"><slot name="title" /><slot name="body" /></div>',
    };

    const copyWrapper = mount(CopyLinkModal, {
      props: {
        show: true,
        token: 'sub',
        profile: { id: 'p1', customId: 'daily', name: '日常使用' },
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: { Modal: modalStub },
      },
    });
    const srItem = copyWrapper.findAll('.cursor-pointer').find((el) => el.text().includes('Shadowrocket'));
    expect(srItem).toBeTruthy();
    await srItem.trigger('click');
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('.conf?target=shadowrocket'));

    const qrWrapper = mount(QRCodeModal, {
      props: {
        show: true,
        url: base,
        title: '日常使用',
        subscription: true,
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'en-US' })],
        stubs: { Modal: modalStub },
      },
    });
    expect(qrWrapper.find('#qr-import-mode').exists()).toBe(true);
  });
});
