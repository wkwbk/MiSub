import { describe, expect, it } from 'vitest';
import * as yaml from 'js-yaml';
import { generateBuiltinClashConfig } from '../../functions/modules/subscription/adapters/generators/builtin-clash-generator.js';
import { generateBuiltinSingboxConfig } from '../../functions/modules/subscription/adapters/generators/builtin-singbox-generator.js';
import { generateBuiltinSurgeConfig } from '../../functions/modules/subscription/adapters/generators/builtin-surge-generator.js';
import { generateSubconverterIniConfig } from '../../functions/modules/subscription/core/visual-rules-builder.js';
import { handleApiRequest } from '../../functions/modules/api-router.js';
import { transformBuiltinSubscription } from '../../functions/modules/subscription/adapters/transformer-factory.js';
import { VISUAL_RULE_PRESETS } from '../../packages/core/src/domain/visual-rules-catalog.js';

const SAMPLE_NODES = [
  'trojan://pass1@1.1.1.1:443#🇭🇰 香港 01',
  'trojan://pass2@2.2.2.2:443#🇯🇵 日本 01',
  'trojan://pass3@3.3.3.3:443#🇺🇸 美国 01',
].join('\n');

describe('MiSub Native Visual Rules & Transform Options', () => {
  it('generates Clash config from visual selectedRules, customRules, Clash API, and baseConfig override', () => {
    const clashYaml = generateBuiltinClashConfig(SAMPLE_NODES, {
      smartPreset: 'balanced',
      customVisualRules: {
        selectedRules: ['ai_services', 'youtube', 'cn_services'],
        customRules: [
          {
            name: '🏢 公司内网',
            action: 'direct',
            domainSuffix: ['corp.local'],
            ipCidr: ['10.20.0.0/16'],
            srcIpCidr: ['192.168.1.50/32'],
          },
        ],
        groupByCountry: true,
        includeAutoSelect: false,
      },
      advancedBaseConfig: {
        enableClashApi: true,
        externalController: '0.0.0.0:9099',
        externalUiDownloadUrl: 'https://example.com/ui.zip',
        baseConfig: {
          clash: 'mixed-port: 7899\nallow-lan: true\nproxies: []\nrules: []\n',
        },
      },
    });

    const parsed = yaml.load(clashYaml);
    expect(parsed['mixed-port']).toBe(7899);
    expect(parsed['allow-lan']).toBe(true);
    expect(parsed['external-controller']).toBe('0.0.0.0:9099');
    expect(parsed['external-ui-url']).toBe('https://example.com/ui.zip');
    expect(parsed.proxies.length).toBe(3);

    const groupNames = parsed['proxy-groups'].map((g) => g.name);
    expect(groupNames).toContain('🏢 公司内网');
    expect(groupNames).toContain('💬 AI 服务');
    expect(groupNames).toContain('📹 油管视频');
    expect(groupNames).toContain('🔒 国内服务');
    expect(groupNames).not.toContain('🎮 游戏平台');
    expect(groupNames).not.toContain('♻️ 自动选择');
    expect(groupNames).toContain('🇭🇰 香港节点');

    expect(parsed.rules).toContain('SRC-IP-CIDR,192.168.1.50/32,🏢 公司内网');
    expect(parsed.rules).toContain('DOMAIN-SUFFIX,corp.local,🏢 公司内网');
    expect(parsed.rules).toContain('IP-CIDR,10.20.0.0/16,🏢 公司内网,no-resolve');
  });

  it('generates Sing-Box config with visual rules, Clash API experimental block, and JSON baseConfig override', () => {
    const rawJson = generateBuiltinSingboxConfig(SAMPLE_NODES, {
      smartPreset: 'balanced',
      customVisualRules: {
        selectedRules: ['ai_services', 'github'],
        customRules: [
          {
            name: '内部服务',
            action: 'direct',
            domainKeyword: ['intranet'],
          },
        ],
        groupByCountry: false,
        includeAutoSelect: true,
      },
      advancedBaseConfig: {
        enableClashApi: true,
        externalController: '0.0.0.0:9090',
        externalUiDownloadUrl: 'https://example.com/zashboard.zip',
        baseConfig: {
          singbox: JSON.stringify({
            log: { level: 'warn' },
            outbounds: [],
          }),
        },
      },
    });

    const parsed = JSON.parse(rawJson);
    expect(parsed.log.level).toBe('warn');
    expect(parsed.experimental?.clash_api?.external_controller).toBe('0.0.0.0:9090');
    expect(parsed.experimental?.clash_api?.external_ui_download_url).toBe('https://example.com/zashboard.zip');

    const outboundTags = parsed.outbounds.map((o) => o.tag);
    expect(outboundTags).toContain('内部服务');
    expect(outboundTags).toContain('💬 AI 服务');
    expect(outboundTags).toContain('🐱 Github');
    expect(outboundTags).not.toContain('🇭🇰 香港节点');
    expect(outboundTags).toContain('♻️ 自动选择');

    expect(parsed.route.rules).toEqual(
      expect.arrayContaining([expect.objectContaining({ domain_keyword: ['intranet'], outbound: '内部服务' })]),
    );
  });

  it('generates Surge config with visual rules and baseConfig [General] override', () => {
    const surgeIni = generateBuiltinSurgeConfig(SAMPLE_NODES, {
      smartPreset: 'balanced',
      customVisualRules: {
        selectedRules: ['telegram'],
        customRules: [{ name: '直连站点', action: 'direct', domainSuffix: ['my-site.cn'] }],
        groupByCountry: false,
        includeAutoSelect: false,
      },
      advancedBaseConfig: {
        baseConfig: {
          surge: '[General]\nloglevel = verbose\nipv6 = true\n',
        },
      },
    });

    expect(surgeIni).toContain('loglevel = verbose');
    expect(surgeIni).toContain('ipv6 = true');
    expect(surgeIni).toContain('直连站点 = select, DIRECT');
    expect(surgeIni).toContain('📲 电报消息 = select,');
    expect(surgeIni).toContain('DOMAIN-SUFFIX,my-site.cn,直连站点');
    expect(surgeIni).not.toContain('♻️ 自动选择 = url-test');
  });

  it('generates valid Subconverter external INI via helper and /api/subconverter-config endpoint', async () => {
    const ini = generateSubconverterIniConfig({
      selectedRules: ['ai_services', 'cn_services'],
      customRules: [{ name: '测试规则', action: 'direct', domainSuffix: ['example.org'] }],
      groupByCountry: true,
      includeAutoSelect: true,
    });
    expect(ini).toContain('[custom]');
    expect(ini).toContain('ruleset=测试规则,[]DOMAIN-SUFFIX,example.org');
    expect(ini).toContain('custom_proxy_group=💬 AI 服务`select`');
    expect(ini).toContain('custom_proxy_group=🇭🇰 香港节点`url-test`');

    const req = new Request(
      'https://misub.example.com/api/subconverter-config?selectedRules=minimal&group_by_country=false&include_auto_select=false',
      { method: 'GET' },
    );
    const res = await handleApiRequest(req, {});
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('[custom]');
    expect(body).toContain('🔒 国内服务');
    expect(body).not.toContain('🇭🇰 香港节点');
    expect(body).not.toContain('♻️ 自动选择');
  });

  it('minimal preset emits Mihomo .mrs providers with domain-before-IP order and no-resolve', () => {
    const clashYaml = generateBuiltinClashConfig(SAMPLE_NODES, {
      userAgent: 'ClashMeta/1.18.0',
      smartPreset: 'minimal',
      customVisualRules: {
        selectedRules: [...VISUAL_RULE_PRESETS.minimal],
      },
    });
    const parsed = yaml.load(clashYaml);
    const providers = parsed['rule-providers'] || {};

    expect(Object.keys(providers)).toEqual(
      expect.arrayContaining(['geosite-private', 'geosite-cn', 'geosite-geolocation-!cn', 'geoip-private', 'geoip-cn']),
    );
    for (const def of Object.values(providers)) {
      expect(def.format).toBe('mrs');
      expect(def.url).toMatch(/\.mrs$/);
      expect(def.url).not.toMatch(/\.yaml$/i);
    }

    const rules = parsed.rules || [];
    const geositeCnIdx = rules.findIndex((r) => r.startsWith('RULE-SET,geosite-cn,'));
    const geoipPrivateIdx = rules.findIndex((r) => r.startsWith('RULE-SET,geoip-private,'));
    const geoipCnIdx = rules.findIndex((r) => r.startsWith('RULE-SET,geoip-cn,'));
    expect(geositeCnIdx).toBeGreaterThan(-1);
    expect(geositeCnIdx).toBeLessThan(geoipPrivateIdx);
    expect(geoipPrivateIdx).toBeLessThan(geoipCnIdx);
    expect(rules[geoipPrivateIdx]).toContain(',no-resolve');
    expect(rules[geoipCnIdx]).toContain(',no-resolve');
  });

  it('falls back to fixed .list text providers when preferMrsRules is false or Stash UA is used', () => {
    for (const opts of [{ preferMrsRules: false }, { userAgent: 'Stash/2.6.0 Clash/1.18.0' }]) {
      const clashYaml = generateBuiltinClashConfig(SAMPLE_NODES, {
        ...opts,
        smartPreset: 'minimal',
        customVisualRules: {
          selectedRules: [...VISUAL_RULE_PRESETS.minimal],
        },
      });
      const parsed = yaml.load(clashYaml);
      const providerMap = parsed['rule-providers'] || {};
      const providers = Object.values(providerMap);
      expect(providers.length).toBeGreaterThan(0);
      for (const def of providers) {
        expect(def.format).not.toBe('mrs');
        expect(def.url).not.toMatch(/\.mrs$/i);
        expect(def.url).not.toMatch(/Providers\/(?:LocalAreaNetwork|ChinaDomain)\.yaml$/i);
      }
      expect(providerMap.VIS_PRIVATE).toMatchObject({
        format: 'text',
        url: expect.stringMatching(/\.list$/i),
      });
      expect(providerMap.VIS_CN_SERVICES).toMatchObject({
        format: 'text',
        url: expect.stringMatching(/\.list$/i),
      });
      expect(providerMap.VIS_NON_CN.format).toBeUndefined();
      expect(providerMap.VIS_NON_CN.url).toMatch(/Providers\/ProxyLite\.yaml$/i);
      expect(parsed.rules).toContain('GEOIP,CN,🔒 国内服务,no-resolve');
    }
  });

  it('supports Loon and Quantumult X visual rules end-to-end with IP-DoH DNS', async () => {
    const visualOpts = {
      smartPreset: 'balanced',
      customVisualRules: {
        selectedRules: ['ad_block', 'private', 'cn_services'],
      },
    };

    const loon = await transformBuiltinSubscription(SAMPLE_NODES, 'loon', visualOpts);
    expect(loon).toContain('doh-server = https://223.5.5.5/dns-query, https://120.53.53.53/dns-query');
    expect(loon).toContain('geoip-url = https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country.mmdb');
    expect(loon).toContain('BanAD.list');
    expect(loon).toContain('GEOIP,CN,🔒 国内服务,no-resolve');

    const quanx = await transformBuiltinSubscription(SAMPLE_NODES, 'quanx', visualOpts);
    expect(quanx).toContain('doh-server = https://223.5.5.5/dns-query');
    expect(quanx).toContain('filter_remote');
    expect(quanx).toContain('final, 🐟 漏网之鱼');
  });
});
