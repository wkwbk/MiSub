import { describe, expect, it } from 'vitest';
import * as yaml from 'js-yaml';
import { generateBuiltinClashConfig } from '../../functions/modules/subscription/adapters/generators/builtin-clash-generator.js';
import { generateBuiltinSingboxConfig } from '../../functions/modules/subscription/adapters/generators/builtin-singbox-generator.js';
import { renderClashFromTemplateModel } from '../../functions/modules/subscription/templates/renderers/render-clash.js';
import { renderSingboxFromTemplateModel } from '../../functions/modules/subscription/templates/renderers/render-singbox.js';
import { getBuiltinTemplate } from '../../functions/modules/subscription/templates/builtin-template-registry.js';
import { parseIniTemplate } from '../../functions/modules/subscription/templates/parsers/ini-template-parser.js';
import { applySmartModelOptimizations } from '../../functions/modules/subscription/templates/template-processor.js';
import { renderClashFromIniTemplate } from '../../functions/modules/subscription/templates/template-pipeline.js';

const NODES = 'ss://YWVzLTEyOC1nY206cGFzcw@hk.example.com:8388#香港01';

function getOptimizedTemplateModel(templateId) {
  const template = getBuiltinTemplate(templateId);
  const model = parseIniTemplate(template.content, { proxies: [], ruleLevel: 'std' });
  return applySmartModelOptimizations(model);
}

describe('域名嗅探（sniffer）、DoH 与内置模板策略组完整性', () => {
  it('内置 Clash 配置包含嗅探配置与 skip-domain 防误判', () => {
    const cfg = yaml.load(generateBuiltinClashConfig(NODES, { ruleLevel: 'relay', isMeta: true }));

    expect(cfg.sniffer).toMatchObject({
      enable: true,
      'parse-pure-ip': true,
      'override-destination': true,
    });
    expect(Object.keys(cfg.sniffer.sniff)).toEqual(expect.arrayContaining(['TLS', 'HTTP', 'QUIC']));
    expect(cfg.sniffer['skip-domain']).toEqual(expect.arrayContaining(['Mijia Cloud', '+.push.apple.com']));
  });

  it('统一模板(INI) Clash 渲染同样携带嗅探配置与 geox-url', () => {
    const model = getOptimizedTemplateModel('clash_misub_minimal');
    const cfg = yaml.load(renderClashFromTemplateModel(model));

    expect(cfg.sniffer?.enable).toBe(true);
    expect(cfg.sniffer?.sniff?.TLS).toBeTruthy();
    expect(cfg['geox-url']?.geoip).toContain('meta-rules-dat@release/geoip.dat');
  });

  it('内置 sing-box 配置首条路由规则为嗅探（含可视化规则模式）', () => {
    const parsed = JSON.parse(generateBuiltinSingboxConfig(NODES, { ruleLevel: 'std' }));
    expect(parsed.route.rules[0]).toEqual({ action: 'sniff' });

    const visualParsed = JSON.parse(
      generateBuiltinSingboxConfig(NODES, {
        builtinTransform: { visualRulesEnabled: true, selectedRules: ['ai'] },
      }),
    );
    expect(visualParsed.route.rules[0]).toEqual({ action: 'sniff' });
  });

  it('统一模板(INI) sing-box 渲染同样首条嗅探', () => {
    const model = getOptimizedTemplateModel('clash_misub_minimal');
    const parsed = JSON.parse(renderSingboxFromTemplateModel(model));

    expect(parsed.route.rules[0]).toEqual({ action: 'sniff' });
  });

  it('境外 DNS 在内置 Clash / sing-box 输出中均为带代理出口的 DoH', () => {
    const clash = yaml.load(generateBuiltinClashConfig(NODES, { ruleLevel: 'std' }));
    expect(clash.dns.nameserver).toEqual([
      'https://8.8.8.8/dns-query#🌐 DNS 出口',
      'https://1.1.1.1/dns-query#🌐 DNS 出口',
    ]);

    const singbox = JSON.parse(generateBuiltinSingboxConfig(NODES, { ruleLevel: 'std' }));
    const foreign = singbox.dns.servers.filter((s) => s.tag.startsWith('dns-foreign'));
    expect(foreign.length).toBeGreaterThan(0);
    expect(foreign.every((s) => s.type === 'https' && s.detour === '🌐 DNS 出口')).toBe(true);
    expect(singbox.dns.servers[0]).toMatchObject({ type: 'udp', server: '223.5.5.5' });
  });

  it('AI 开发者模板与游戏加速模板均定义了直连和漏网之鱼策略组', () => {
    for (const templateId of ['clash_exclusive_ai', 'clash_game_optimized']) {
      const template = getBuiltinTemplate(templateId);
      const rendered = yaml.load(
        renderClashFromIniTemplate(template.content, {
          nodeList: 'trojan://password@1.2.3.4:443#US-01',
          targetFormat: 'clash',
        }),
      );
      const groupNames = (rendered['proxy-groups'] || []).map((g) => g.name);
      expect(groupNames, `${templateId} 应定义 🎯 全球直连`).toContain('🎯 全球直连');
      expect(groupNames, `${templateId} 应定义 🐟 漏网之鱼`).toContain('🐟 漏网之鱼');
    }
  });
});
