import { describe, expect, it } from 'vitest';
import * as yaml from 'js-yaml';
import {
  GEOX_URLS,
  GH_PROXY_BASE,
  PINNED_RULE_REVISIONS,
} from '../../functions/modules/subscription/templates/builtin-rules-provider.js';
import { buildVisualRulesAndProviders } from '../../functions/modules/subscription/core/visual-rules-builder.js';
import { generateBuiltinClashConfig } from '../../functions/modules/subscription/adapters/generators/builtin-clash-generator.js';
import { generateBuiltinSingboxConfig } from '../../functions/modules/subscription/adapters/generators/builtin-singbox-generator.js';

const SMART_PRESETS = ['minimal', 'balanced', 'full'];
const SAMPLE_NODES = 'ss://YWVzLTEyOC1nY206cGFzcw@example.com:8388#HKNode';
const ACL4SSR_CN_DOMAIN = `https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/${PINNED_RULE_REVISIONS.ACL4SSR}/Clash/ChinaDomain.list`;

function indexOfRule(rules, predicate) {
  return rules.findIndex(predicate);
}

describe('内置规则 - 国内直连（域名维度 + IP 维度）', () => {
  it('所有智能分流预设都在 IP/MATCH 之前包含国内域名直连规则', () => {
    for (const smartPreset of SMART_PRESETS) {
      const { rules } = buildVisualRulesAndProviders('clash', { smartPreset });
      const cnDomainIdx = indexOfRule(rules, (r) => typeof r === 'string' && r.startsWith('RULE-SET,geosite-cn,'));
      const cnIpIdx = indexOfRule(rules, (r) => typeof r === 'string' && r.startsWith('RULE-SET,geoip-cn,'));
      const matchIdx = indexOfRule(rules, (r) => typeof r === 'string' && r.startsWith('MATCH,'));

      expect(cnDomainIdx, `${smartPreset} 应包含 geosite-cn`).toBeGreaterThan(-1);
      expect(cnIpIdx, `${smartPreset} 应包含 geoip-cn`).toBeGreaterThan(-1);
      expect(cnDomainIdx).toBeLessThan(cnIpIdx);
      expect(cnIpIdx).toBeLessThan(matchIdx);
    }
  });

  it('Clash 翻译：默认输出 .mrs 规则提供器（geosite-cn / geoip-cn），preferMrs: false 时回退 ACL4SSR .list', () => {
    const mrsResult = buildVisualRulesAndProviders('clash', { smartPreset: 'balanced', enableRelay: true });
    expect(mrsResult.rules).toContain('RULE-SET,geosite-cn,🔒 国内服务');
    expect(mrsResult.rules).toContain('RULE-SET,geoip-cn,🔒 国内服务,no-resolve');

    expect(mrsResult.clashProviders['geosite-cn']).toMatchObject({
      type: 'http',
      format: 'mrs',
      behavior: 'domain',
      url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/cn.mrs',
      path: './ruleset/geosite-cn.mrs',
    });
    expect(mrsResult.clashProviders['geoip-cn']).toMatchObject({
      type: 'http',
      format: 'mrs',
      behavior: 'ipcidr',
      url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cn.mrs',
      path: './ruleset/geoip-cn.mrs',
    });

    const legacyResult = buildVisualRulesAndProviders('clash', {
      smartPreset: 'balanced',
      enableRelay: true,
      preferMrs: false,
    });
    expect(legacyResult.clashProviders.VIS_CN_SERVICES).toMatchObject({
      type: 'http',
      behavior: 'classical',
      format: 'text',
      url: ACL4SSR_CN_DOMAIN,
    });
    expect(legacyResult.clashProviders.VIS_CN_SERVICES.path).toBe('./ruleset/VIS_CN_SERVICES.list');
  });

  it('国内请求方的传统 ACL4SSR 规则源走 gh-proxy.org 加速', () => {
    const result = buildVisualRulesAndProviders('clash', {
      smartPreset: 'full',
      isChinaClient: true,
      preferMrs: false,
    });

    expect(result.clashProviders.VIS_CN_SERVICES.url).toBe(`${GH_PROXY_BASE}${ACL4SSR_CN_DOMAIN}`);
    expect(result.clashProviders.VIS_AD_BLOCK.url).toContain(GH_PROXY_BASE);

    const surgeResult = buildVisualRulesAndProviders('surge', {
      smartPreset: 'balanced',
      enableRelay: true,
      isChinaClient: true,
    });
    expect(surgeResult.rules).toContain(`RULE-SET,${GH_PROXY_BASE}${ACL4SSR_CN_DOMAIN},🔒 国内服务`);

    const foreignResult = buildVisualRulesAndProviders('surge', { smartPreset: 'balanced', enableRelay: true });
    expect(foreignResult.rules).toContain(`RULE-SET,${ACL4SSR_CN_DOMAIN},🔒 国内服务`);
  });

  it('Clash 翻译后的规则行按 geosite-cn -> geoip-cn/GEOIP -> MATCH 顺序输出', () => {
    const { rules } = buildVisualRulesAndProviders('clash', { smartPreset: 'balanced', enableRelay: true });
    const cnDomainIdx = indexOfRule(rules, (r) => r === 'RULE-SET,geosite-cn,🔒 国内服务');
    const cnIpIdx = indexOfRule(rules, (r) => r === 'RULE-SET,geoip-cn,🔒 国内服务,no-resolve');
    const matchIdx = indexOfRule(rules, (r) => typeof r === 'string' && r.startsWith('MATCH,'));

    expect(cnDomainIdx).toBeGreaterThan(-1);
    expect(cnDomainIdx).toBeLessThan(cnIpIdx);
    expect(cnIpIdx).toBeLessThan(matchIdx);

    const legacyResult = buildVisualRulesAndProviders('clash', {
      smartPreset: 'balanced',
      enableRelay: true,
      preferMrs: false,
    });
    expect(legacyResult.rules).toContain('GEOIP,CN,🔒 国内服务,no-resolve');
  });

  it('sing-box 翻译：geosite-cn 位于 geoip-cn 之前且规则集去重', () => {
    const { rules, singboxRuleSets } = buildVisualRulesAndProviders('singbox', {
      smartPreset: 'balanced',
      enableRelay: true,
    });
    const geositeIdx = indexOfRule(
      rules,
      (r) => typeof r === 'object' && Array.isArray(r.rule_set) && r.rule_set.includes('geosite-cn'),
    );
    const geoipIdx = indexOfRule(
      rules,
      (r) => typeof r === 'object' && Array.isArray(r.rule_set) && r.rule_set.includes('geoip-cn'),
    );

    expect(geositeIdx).toBeGreaterThan(-1);
    expect(geositeIdx).toBeLessThan(geoipIdx);
    expect(singboxRuleSets.filter((rs) => rs.tag === 'geosite-cn')).toHaveLength(1);
  });

  it('Surge/Loon 翻译：CN 规则指向 ACL4SSR 国内域名列表，且不产生 undefined 引用', () => {
    for (const format of ['surge', 'loon']) {
      const { rules } = buildVisualRulesAndProviders(format, { smartPreset: 'balanced', enableRelay: true });
      expect(rules).toContain(`RULE-SET,${ACL4SSR_CN_DOMAIN},🔒 国内服务`);
      expect(rules).toContain('GEOIP,CN,🔒 国内服务,no-resolve');
      rules.forEach((rule) => {
        expect(rule).not.toContain('undefined');
      });
    }
  });

  it('Quantumult X 翻译：仅输出显式 filter_remote 源，不回退到 Clash YAML URL', () => {
    const { rules } = buildVisualRulesAndProviders('quanx', { smartPreset: 'balanced' });
    const remoteRules = rules.filter((rule) => typeof rule === 'string' && rule.startsWith('filter_remote'));
    expect(remoteRules.length).toBeGreaterThan(0);
    remoteRules.forEach((rule) => {
      expect(rule).toContain('raw.githubusercontent.com/ACL4SSR');
      expect(rule).not.toContain('.yaml');
    });
    expect(rules).toContain('GEOIP,CN,🔒 国内服务');
  });
});

describe('内置生成器 - 国内直连兜底能力', () => {
  it('Clash(Meta) 配置注入 geox-url jsDelivr 镜像，默认生成 .mrs 规则源且顺序正确', () => {
    const config = yaml.load(
      generateBuiltinClashConfig(SAMPLE_NODES, { smartPreset: 'balanced', enableRelay: true, isMeta: true }),
    );

    expect(config['geox-url']).toMatchObject({
      geoip: expect.stringContaining('https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat'),
      geosite: expect.stringContaining('meta-rules-dat@release/geosite.dat'),
      mmdb: expect.stringContaining('meta-rules-dat@release/country.mmdb'),
    });

    const cnDomainIdx = indexOfRule(config.rules, (r) => r === 'RULE-SET,geosite-cn,🔒 国内服务');
    const cnIpIdx = indexOfRule(config.rules, (r) => r === 'RULE-SET,geoip-cn,🔒 国内服务,no-resolve');
    const matchIdx = indexOfRule(config.rules, (r) => r.startsWith('MATCH,'));

    expect(cnDomainIdx).toBeGreaterThan(-1);
    expect(cnDomainIdx).toBeLessThan(cnIpIdx);
    expect(cnIpIdx).toBeLessThan(matchIdx);

    expect(config['rule-providers']['geosite-cn']).toMatchObject({
      behavior: 'domain',
      format: 'mrs',
      url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/cn.mrs',
    });
    expect(config['rule-providers']['geoip-cn']).toMatchObject({
      behavior: 'ipcidr',
      format: 'mrs',
      url: 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/cn.mrs',
    });

    const legacyConfig = yaml.load(
      generateBuiltinClashConfig(SAMPLE_NODES, {
        smartPreset: 'balanced',
        enableRelay: true,
        isMeta: false,
        preferMrsRules: false,
      }),
    );
    expect(legacyConfig.rules).toContain('GEOIP,CN,🔒 国内服务,no-resolve');
    expect(legacyConfig['rule-providers'].VIS_CN_SERVICES).toMatchObject({
      behavior: 'classical',
      format: 'text',
      url: ACL4SSR_CN_DOMAIN,
    });
  });

  it('国内请求方在传统规则源模式下生成的 Clash 配置全部经 gh-proxy 加速', () => {
    const config = yaml.load(
      generateBuiltinClashConfig(SAMPLE_NODES, {
        smartPreset: 'balanced',
        enableRelay: true,
        isMeta: true,
        isChinaClient: true,
        preferMrsRules: false,
      }),
    );
    const providerUrls = Object.values(config['rule-providers'] || {}).map((p) => p.url);

    expect(providerUrls.length).toBeGreaterThan(0);
    for (const url of providerUrls) {
      expect(url.startsWith(`${GH_PROXY_BASE}https://raw.githubusercontent.com/`)).toBe(true);
    }
  });

  it('sing-box 配置：geosite-cn 直连规则在 geoip-cn 之前且 rule_set 去重', () => {
    const parsed = JSON.parse(
      generateBuiltinSingboxConfig(SAMPLE_NODES, { smartPreset: 'balanced', enableRelay: true }),
    );

    const rules = parsed.route.rules;
    const geositeIdx = indexOfRule(rules, (r) => Array.isArray(r.rule_set) && r.rule_set.includes('geosite-cn'));
    const geoipIdx = indexOfRule(rules, (r) => Array.isArray(r.rule_set) && r.rule_set.includes('geoip-cn'));

    expect(geositeIdx).toBeGreaterThan(-1);
    expect(geositeIdx).toBeLessThan(geoipIdx);
    expect(parsed.route.rule_set.filter((rs) => rs.tag === 'geosite-cn')).toHaveLength(1);
  });

  it('GEOX_URLS 全部指向 jsDelivr 镜像', () => {
    Object.values(GEOX_URLS).forEach((url) => {
      expect(url).toContain('https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/');
      expect(url).not.toContain('github.com');
    });
  });
});
