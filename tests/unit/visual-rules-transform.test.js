import { describe, expect, it } from 'vitest';
import * as yaml from 'js-yaml';
import { generateBuiltinClashConfig } from '../../functions/modules/subscription/generators/builtin-clash-generator.js';
import { generateBuiltinSingboxConfig } from '../../functions/modules/subscription/generators/builtin-singbox-generator.js';
import { generateBuiltinSurgeConfig } from '../../functions/modules/subscription/generators/builtin-surge-generator.js';
import { generateSubconverterIniConfig } from '../../functions/modules/subscription/visual-rules-builder.js';
import { handleApiRequest } from '../../functions/modules/api-router.js';

const SAMPLE_NODES = [
  'trojan://pass1@1.1.1.1:443#🇭🇰 香港 01',
  'trojan://pass2@2.2.2.2:443#🇯🇵 日本 01',
  'trojan://pass3@3.3.3.3:443#🇺🇸 美国 01',
].join('\n');

describe('MiSub Native Visual Rules & Transform Options', () => {
  it('generates Clash config from visual selectedRules, customRules, Clash API, and baseConfig override', () => {
    const clashYaml = generateBuiltinClashConfig(SAMPLE_NODES, {
      builtinTransform: {
        visualRulesEnabled: true,
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
      builtinTransform: {
        visualRulesEnabled: true,
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
      builtinTransform: {
        visualRulesEnabled: true,
        selectedRules: ['telegram'],
        customRules: [{ name: '直连站点', action: 'direct', domainSuffix: ['my-site.cn'] }],
        groupByCountry: false,
        includeAutoSelect: false,
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
});
