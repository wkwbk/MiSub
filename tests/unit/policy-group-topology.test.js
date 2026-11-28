import { describe, expect, it } from 'vitest';
import * as yaml from 'js-yaml';
import { transformBuiltinSubscription } from '../../functions/modules/subscription/adapters/transformer-factory.js';
import { generateSubconverterIniConfig } from '../../functions/modules/subscription/core/visual-rules-builder.js';
import {
  AUTO_SELECT_GROUP,
  DEFAULT_SELECT_GROUP,
  FALLBACK_GROUP,
  MANUAL_SELECT_GROUP,
  removePolicyGroupCycles,
  sanitizePolicyGroupGraph,
} from '../../functions/modules/subscription/core/policy-group-topology.js';
import { pruneProxyGroups } from '../../functions/modules/subscription/templates/builtin-rules-provider.js';
import { DNS_PROXY_GROUP } from '../../functions/modules/subscription/security/safe-dns.js';
import { handleApiRequest } from '../../functions/modules/api-router.js';
import { renderClashFromIniTemplate } from '../../functions/modules/subscription/templates/template-pipeline.js';
import { parseIniTemplate } from '../../functions/modules/subscription/templates/parsers/ini-template-parser.js';
import { applySmartModelOptimizations } from '../../functions/modules/subscription/templates/template-processor.js';
import { VISUAL_RULE_PRESETS } from '@misub/core/domain/visual-rules-catalog.js';

const US_NODES = [
  'vless://11111111-1111-4111-8111-111111111111@us1.example.com:443?encryption=none&security=tls&type=ws#🇺🇸 US-XHTTP-01',
  'hysteria2://pass@us2.example.com:443?sni=us2.example.com#🇺🇸 US-HY2-02',
  'tuic://22222222-2222-4222-8222-222222222222:pass@us3.example.com:443?sni=us3.example.com&alpn=h3#🇺🇸 US-TU5-03',
].join('\n');

const NON_VLESS_US_NODES = [
  'trojan://pass1@us1.example.com:443?sni=us1.example.com#🇺🇸 US-Trojan-01',
  'hysteria2://pass2@us2.example.com:443?sni=us2.example.com#🇺🇸 US-HY2-02',
].join('\n');

function extractIniSectionLines(iniText, sectionName) {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = iniText.match(new RegExp(`\\[${escaped}\\]\\n([\\s\\S]*?)(?:\\n\\n\\[|$)`));
  return match
    ? match[1]
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

describe('Policy group topology & layered routing regression', () => {
  describe('Minimal preset across all clients (screenshots 4 & 5 regression)', () => {
    const minimalOpts = {
      smartPreset: 'minimal',
      customVisualRules: {
        selectedRules: [...VISUAL_RULE_PRESETS.minimal],
        groupByCountry: true,
        includeAutoSelect: true,
      },
    };

    it('Clash/Mihomo: 🌍 非中国、🏠 私有网络、🔒 国内服务 均接入 🚀 节点选择 与策略池', async () => {
      const clashYaml = await transformBuiltinSubscription(US_NODES, 'clash', {
        ...minimalOpts,
        isMeta: true,
      });
      const parsed = yaml.load(clashYaml);
      const findGroup = (name) => parsed['proxy-groups'].find((g) => g.name === name);

      const nonCn = findGroup('🌍 非中国');
      expect(nonCn?.proxies).toEqual([
        '🚀 节点选择',
        '♻️ 自动选择',
        '🔯 故障转移',
        '👋 手动切换',
        '🇺🇸 美国节点',
        'DIRECT',
      ]);

      for (const directGroupName of ['🏠 私有网络', '🔒 国内服务']) {
        const group = findGroup(directGroupName);
        expect(group?.proxies).toEqual([
          'DIRECT',
          '🚀 节点选择',
          '♻️ 自动选择',
          '🔯 故障转移',
          '👋 手动切换',
          '🇺🇸 美国节点',
        ]);
      }

      expect(findGroup('🚀 节点选择')?.proxies).toEqual([
        '♻️ 自动选择',
        '🔯 故障转移',
        '👋 手动切换',
        '🇺🇸 美国节点',
        'DIRECT',
      ]);
      expect(findGroup('🐟 漏网之鱼')?.proxies).toEqual([
        '🚀 节点选择',
        '♻️ 自动选择',
        '🔯 故障转移',
        '👋 手动切换',
        '🇺🇸 美国节点',
        'DIRECT',
      ]);
      expect(parsed.rules.at(-1)).toBe('MATCH,🐟 漏网之鱼');
    });

    it('Sing-Box: selector 出站显式设置 default 且 🌍 非中国 默认跟随 🚀 节点选择', async () => {
      const rawJson = await transformBuiltinSubscription(US_NODES, 'singbox', minimalOpts);
      const parsed = JSON.parse(rawJson);
      const findOutbound = (tag) => parsed.outbounds.find((o) => o.tag === tag);

      const nonCn = findOutbound('🌍 非中国');
      expect(nonCn?.type).toBe('selector');
      expect(nonCn?.default).toBe('🚀 节点选择');
      expect(nonCn?.outbounds).toEqual([
        '🚀 节点选择',
        '♻️ 自动选择',
        '🔯 故障转移',
        '👋 手动切换',
        '🇺🇸 美国节点',
        'DIRECT',
      ]);

      for (const directTag of ['🏠 私有网络', '🔒 国内服务']) {
        const outbound = findOutbound(directTag);
        expect(outbound?.default).toBe('DIRECT');
        expect(outbound?.outbounds).toEqual([
          'DIRECT',
          '🚀 节点选择',
          '♻️ 自动选择',
          '🔯 故障转移',
          '👋 手动切换',
          '🇺🇸 美国节点',
        ]);
      }

      const mainSelect = findOutbound('🚀 节点选择');
      expect(mainSelect?.default).toBe('♻️ 自动选择');
      const finalGroup = findOutbound('🐟 漏网之鱼');
      expect(finalGroup?.type).toBe('selector');
      expect(finalGroup?.default).toBe('🚀 节点选择');
      expect(finalGroup?.outbounds).toEqual([
        '🚀 节点选择',
        '♻️ 自动选择',
        '🔯 故障转移',
        '👋 手动切换',
        '🇺🇸 美国节点',
        'DIRECT',
      ]);
      expect(parsed.route.final).toBe('🐟 漏网之鱼');
    });

    it('Surge & Loon: 🌍 非中国、🏠 私有网络、🔒 国内服务 与 🐟 漏网之鱼 保持同一分层拓扑', async () => {
      for (const target of ['surge', 'loon']) {
        const rendered = await transformBuiltinSubscription(NON_VLESS_US_NODES, target, minimalOpts);
        const groupLines = extractIniSectionLines(rendered, 'Proxy Group');
        const ruleLines = extractIniSectionLines(rendered, 'Rule');
        const findLine = (prefix) => groupLines.find((l) => l.startsWith(`${prefix} = `));

        expect(findLine('🌍 非中国')).toContain(
          '🌍 非中国 = select, 🚀 节点选择, ♻️ 自动选择, 🔯 故障转移, 👋 手动切换, 🇺🇸 美国节点, DIRECT',
        );
        expect(findLine('🏠 私有网络')).toContain(
          '🏠 私有网络 = select, DIRECT, 🚀 节点选择, ♻️ 自动选择, 🔯 故障转移, 👋 手动切换, 🇺🇸 美国节点',
        );
        expect(findLine('🔒 国内服务')).toContain(
          '🔒 国内服务 = select, DIRECT, 🚀 节点选择, ♻️ 自动选择, 🔯 故障转移, 👋 手动切换, 🇺🇸 美国节点',
        );
        expect(findLine('🐟 漏网之鱼')).toContain(
          '🐟 漏网之鱼 = select, 🚀 节点选择, ♻️ 自动选择, 🔯 故障转移, 👋 手动切换, 🇺🇸 美国节点, DIRECT',
        );
        expect(ruleLines.at(-1)).toMatch(/^FINAL,🐟 漏网之鱼/);
      }
    });

    it('Quantumult X: static 策略组包含 🚀 节点选择 与 🐟 漏网之鱼 兜底', async () => {
      const rendered = await transformBuiltinSubscription(US_NODES, 'quanx', minimalOpts);
      const policyLines = extractIniSectionLines(rendered, 'policy');
      const localRuleLines = extractIniSectionLines(rendered, 'filter_local');
      const nonCnLine = policyLines.find((l) => l.startsWith('static=🌍 非中国,'));
      const privateLine = policyLines.find((l) => l.startsWith('static=🏠 私有网络,'));
      const finalLine = policyLines.find((l) => l.startsWith('static=🐟 漏网之鱼,'));

      expect(nonCnLine).toBe(
        'static=🌍 非中国, 🚀 节点选择, ♻️ 自动选择, 🔯 故障转移, 👋 手动切换, 🇺🇸 美国节点, direct',
      );
      expect(privateLine).toBe(
        'static=🏠 私有网络, direct, 🚀 节点选择, ♻️ 自动选择, 🔯 故障转移, 👋 手动切换, 🇺🇸 美国节点',
      );
      expect(finalLine).toContain(
        'static=🐟 漏网之鱼, 🚀 节点选择, ♻️ 自动选择, 🔯 故障转移, 👋 手动切换, 🇺🇸 美国节点, direct',
      );
      expect(localRuleLines.at(-1)).toBe('final, 🐟 漏网之鱼');
    });

    it('Shadowrocket: 🌍 非中国 与 🐟 漏网之鱼 默认选中 🚀 节点选择 (policy-select-name)', async () => {
      const rendered = await transformBuiltinSubscription(US_NODES, 'shadowrocket', minimalOpts);
      const groupLines = extractIniSectionLines(rendered, 'Proxy Group');
      const ruleLines = extractIniSectionLines(rendered, 'Rule');
      const nonCnLine = groupLines.find((l) => l.startsWith('🌍 非中国 = '));
      const privateLine = groupLines.find((l) => l.startsWith('🏠 私有网络 = '));
      const finalGroupLine = groupLines.find((l) => l.startsWith('🐟 漏网之鱼 = '));

      expect(nonCnLine).toContain('🌍 非中国 = select, 🚀 节点选择, ♻️ 自动选择, 🔯 故障转移, 👋 手动切换');
      expect(nonCnLine).toContain('policy-select-name=🚀 节点选择');
      expect(privateLine).toContain('🏠 私有网络 = select, DIRECT, 🚀 节点选择, ♻️ 自动选择, 🔯 故障转移, 👋 手动切换');
      expect(privateLine).toContain('policy-select-name=DIRECT');
      expect(finalGroupLine).toContain('🐟 漏网之鱼 = select, 🚀 节点选择, ♻️ 自动选择, 🔯 故障转移, 👋 手动切换');
      expect(finalGroupLine).toContain('policy-select-name=🚀 节点选择');
      expect(ruleLines.at(-1)).toBe('FINAL,🐟 漏网之鱼');
    });

    it('Egern: 内置极简模板策略组包含 🚀 节点选择、♻️ 自动选择、🔯 故障转移与 ☑️ 手动切换', async () => {
      const rendered = await transformBuiltinSubscription(US_NODES, 'egern', minimalOpts);
      const parsed = yaml.load(rendered);
      const findSelectPolicies = (name) =>
        parsed.policy_groups.find((entry) => entry.select?.name === name)?.select?.policies;

      for (const groupName of ['🎬 流媒体', '📲 电报消息', '🐟 漏网之鱼']) {
        expect(findSelectPolicies(groupName)).toEqual([
          '🚀 节点选择',
          '♻️ 自动选择',
          '🔯 故障转移',
          '☑️ 手动切换',
          'DIRECT',
        ]);
      }
      expect(findSelectPolicies('🎯 全球直连')).toEqual([
        'DIRECT',
        '🚀 节点选择',
        '♻️ 自动选择',
        '🔯 故障转移',
        '☑️ 手动切换',
      ]);
    });

    it('Subconverter INI & /api/subconverter-config: 与内置引擎共享同一拓扑与 fail-closed 策略', async () => {
      const ini = generateSubconverterIniConfig({
        selectedRules: ['ai_services', 'cn_services', 'non_cn'],
        groupByCountry: true,
        includeAutoSelect: true,
      });

      expect(ini).toContain(
        'custom_proxy_group=🌍 非中国`select`[]🚀 节点选择`[]♻️ 自动选择`[]🔯 故障转移`[]👋 手动切换`[]🇭🇰 香港节点',
      );
      expect(ini).toContain(
        'custom_proxy_group=🔒 国内服务`select`[]DIRECT`[]🚀 节点选择`[]♻️ 自动选择`[]🔯 故障转移`[]👋 手动切换`[]🇭🇰 香港节点',
      );
      const aiLine = ini.split('\n').find((line) => line.startsWith('custom_proxy_group=💬 AI 服务`'));
      expect(aiLine).toContain(
        'custom_proxy_group=💬 AI 服务`select`[]🚀 节点选择`[]♻️ 自动选择`[]🔯 故障转移`[]👋 手动切换',
      );
      expect(aiLine).not.toContain('[]DIRECT');
      expect(ini).toContain('ruleset=🐟 漏网之鱼,[]FINAL');
      expect(ini).toContain(
        'custom_proxy_group=🐟 漏网之鱼`select`[]🚀 节点选择`[]♻️ 自动选择`[]🔯 故障转移`[]👋 手动切换`[]🇭🇰 香港节点',
      );
      expect(ini).toContain('custom_proxy_group=🔯 故障转移`fallback`.*`');

      const res = await handleApiRequest(
        new Request('https://misub.example.com/api/subconverter-config?selectedRules=minimal', { method: 'GET' }),
        {},
      );
      expect(res.status).toBe(200);
      const apiIni = await res.text();
      expect(apiIni).toContain(
        'custom_proxy_group=🌍 非中国`select`[]🚀 节点选择`[]♻️ 自动选择`[]🔯 故障转移`[]👋 手动切换',
      );
      expect(apiIni).toContain('ruleset=🐟 漏网之鱼,[]FINAL');
      expect(apiIni).toContain(
        'custom_proxy_group=🐟 漏网之鱼`select`[]🚀 节点选择`[]♻️ 自动选择`[]🔯 故障转移`[]👋 手动切换',
      );
    });
  });

  describe('Balanced & Full presets + custom rules', () => {
    it('wires 🚀 节点选择 across all category groups while keeping 💬 AI 服务 fail-closed and 🛑 广告拦截 reject-first', async () => {
      const clashYaml = await transformBuiltinSubscription(US_NODES, 'clash', {
        smartPreset: 'full',
        customVisualRules: {
          selectedRules: [...VISUAL_RULE_PRESETS.full],
          customRules: [
            { name: '⭐ 专属代理', action: 'proxy', domainSuffix: ['proxy.example'] },
            { name: '🏢 内网直连', action: 'direct', domainSuffix: ['corp.example'] },
            { name: '🚫 广告追踪', action: 'reject', domainSuffix: ['track.example'] },
          ],
          groupByCountry: true,
          includeAutoSelect: true,
        },
      });
      const parsed = yaml.load(clashYaml);
      const findGroup = (name) => parsed['proxy-groups'].find((g) => g.name === name);

      const aiGroup = findGroup('💬 AI 服务');
      expect(aiGroup?.proxies[0]).toBe('🚀 节点选择');
      expect(aiGroup?.proxies).not.toContain('DIRECT');
      expect(aiGroup?.proxies).toEqual(expect.arrayContaining(['♻️ 自动选择', '🔯 故障转移', '👋 手动切换']));

      const adBlock = findGroup('🛑 广告拦截');
      expect(adBlock?.proxies.slice(0, 3)).toEqual(['REJECT', 'DIRECT', '🚀 节点选择']);

      for (const proxyRuleName of [
        '📹 油管视频',
        '🔍 谷歌服务',
        '📲 电报消息',
        '🐱 Github',
        '🌍 非中国',
        '⭐ 专属代理',
      ]) {
        const group = findGroup(proxyRuleName);
        expect(group?.proxies.slice(0, 4), `${proxyRuleName} 应以 🚀 节点选择 为首`).toEqual([
          '🚀 节点选择',
          '♻️ 自动选择',
          '🔯 故障转移',
          '👋 手动切换',
        ]);
      }

      expect(findGroup('🏢 内网直连')?.proxies.slice(0, 5)).toEqual([
        'DIRECT',
        '🚀 节点选择',
        '♻️ 自动选择',
        '🔯 故障转移',
        '👋 手动切换',
      ]);
      expect(findGroup('🚫 广告追踪')?.proxies.slice(0, 3)).toEqual(['REJECT', 'DIRECT', '🚀 节点选择']);
    });
  });

  describe('Feature toggles & edge cases', () => {
    it('produces zero dangling references when includeAutoSelect=false and groupByCountry=false', async () => {
      const clashYaml = await transformBuiltinSubscription(US_NODES, 'clash', {
        smartPreset: 'minimal',
        customVisualRules: {
          selectedRules: ['non_cn'],
          groupByCountry: false,
          includeAutoSelect: false,
        },
      });
      const parsed = yaml.load(clashYaml);
      const groupNames = parsed['proxy-groups'].map((g) => g.name);
      expect(groupNames).not.toContain('♻️ 自动选择');
      expect(groupNames).not.toContain('🇺🇸 美国节点');

      const nonCn = parsed['proxy-groups'].find((g) => g.name === '🌍 非中国');
      expect(nonCn?.proxies).toEqual(['🚀 节点选择', '🔯 故障转移', '👋 手动切换', 'DIRECT']);
      const finalGroup = parsed['proxy-groups'].find((g) => g.name === '🐟 漏网之鱼');
      expect(finalGroup?.proxies).toEqual(['🚀 节点选择', '🔯 故障转移', '👋 手动切换', 'DIRECT']);
    });

    it('prunes disabled ♻️ 自动选择 from Surge/Loon 落地节点 when enableRelay=true and includeAutoSelect=false', async () => {
      for (const target of ['surge', 'loon']) {
        const rendered = await transformBuiltinSubscription(NON_VLESS_US_NODES, target, {
          smartPreset: 'minimal',
          enableRelay: true,
          customVisualRules: {
            selectedRules: ['non_cn'],
            groupByCountry: false,
            includeAutoSelect: false,
          },
        });
        const groupLines = extractIniSectionLines(rendered, 'Proxy Group');
        const landingLine = groupLines.find((l) => l.startsWith('落地节点 = '));
        const nonCnLine = groupLines.find((l) => l.startsWith('🌍 非中国 = '));
        const finalGroupLine = groupLines.find((l) => l.startsWith('🐟 漏网之鱼 = '));

        expect(landingLine).toBeTruthy();
        expect(landingLine).not.toContain('♻️ 自动选择');
        expect(nonCnLine).toContain(
          '🌍 非中国 = select, 🌍 总出口, 🔗 链式代理, 🚀 常用节点, 🔯 故障转移, 👋 手动切换, DIRECT',
        );
        expect(finalGroupLine).toContain(
          '🐟 漏网之鱼 = select, 🌍 总出口, 🔗 链式代理, 🚀 常用节点, 🔯 故障转移, 👋 手动切换, DIRECT',
        );
      }
    });
  });

  describe('DAG sanitizer & cycle breaking (sanitizePolicyGroupGraph / template-processor)', () => {
    const proxies = [
      { name: 'HK-01', tag: 'HK-01' },
      { name: 'US-01', tag: 'US-01' },
    ];

    it('preserves diamond DAG edges without false positives', () => {
      const groups = [
        { name: '🌍 非中国', type: 'select', proxies: [DEFAULT_SELECT_GROUP, MANUAL_SELECT_GROUP, 'DIRECT'] },
        { name: DEFAULT_SELECT_GROUP, type: 'select', proxies: [AUTO_SELECT_GROUP, MANUAL_SELECT_GROUP, 'DIRECT'] },
        { name: AUTO_SELECT_GROUP, type: 'url-test', proxies: ['HK-01', 'US-01'] },
        { name: MANUAL_SELECT_GROUP, type: 'select', proxies: ['HK-01', 'US-01'] },
      ];

      const sanitized = pruneProxyGroups(groups, proxies);
      expect(sanitized.find((g) => g.name === '🌍 非中国')?.proxies).toEqual([
        DEFAULT_SELECT_GROUP,
        MANUAL_SELECT_GROUP,
        'DIRECT',
      ]);
      expect(sanitized.find((g) => g.name === DEFAULT_SELECT_GROUP)?.proxies).toEqual([
        AUTO_SELECT_GROUP,
        MANUAL_SELECT_GROUP,
        'DIRECT',
      ]);
    });

    it('breaks self-loops, 2-hop cycles, and 3-hop cycles while keeping remaining DAG paths', () => {
      const groups = [
        { name: DEFAULT_SELECT_GROUP, type: 'select', proxies: [DEFAULT_SELECT_GROUP, MANUAL_SELECT_GROUP, 'DIRECT'] },
        { name: MANUAL_SELECT_GROUP, type: 'select', proxies: [DEFAULT_SELECT_GROUP, 'HK-01'] },
        { name: 'A', type: 'select', proxies: ['B'] },
        { name: 'B', type: 'select', proxies: ['C'] },
        { name: 'C', type: 'select', proxies: ['A', 'US-01'] },
      ];

      const sanitized = sanitizePolicyGroupGraph(groups, proxies);
      expect(sanitized.find((g) => g.name === DEFAULT_SELECT_GROUP)?.proxies).toEqual([MANUAL_SELECT_GROUP, 'DIRECT']);
      expect(sanitized.find((g) => g.name === MANUAL_SELECT_GROUP)?.proxies).toEqual(['HK-01']);
      expect(sanitized.find((g) => g.name === 'C')?.proxies).toEqual(['US-01']);
    });

    it('falls back empty pure cycles to DIRECT or REJECT (fail-closed for 🤖 / DNS)', () => {
      const groups = [
        { name: 'PureLoopA', type: 'select', proxies: ['PureLoopB'] },
        { name: 'PureLoopB', type: 'select', proxies: ['PureLoopA'] },
        { name: '🤖 AI 隔离', type: 'select', proxies: ['🤖 AI 隔离'] },
        { name: DNS_PROXY_GROUP, type: 'url-test', proxies: [DNS_PROXY_GROUP] },
      ];

      const sanitized = sanitizePolicyGroupGraph(groups, proxies);
      expect(sanitized.find((g) => g.name === 'PureLoopB')?.proxies).toEqual(['DIRECT']);
      expect(sanitized.find((g) => g.name === '🤖 AI 隔离')?.proxies).toEqual(['REJECT']);
      expect(sanitized.find((g) => g.name === DNS_PROXY_GROUP)?.proxies).toEqual(['REJECT']);
    });

    it('prunes disabled group names, unknown targets, and duplicates while preserving priority order', () => {
      const groups = [
        {
          name: '🌍 非中国',
          type: 'select',
          proxies: [
            DEFAULT_SELECT_GROUP,
            AUTO_SELECT_GROUP, // not present in groups -> must be pruned
            FALLBACK_GROUP,
            DEFAULT_SELECT_GROUP, // duplicate -> deduped
            '不存在的节点',
            'DIRECT',
          ],
        },
        { name: DEFAULT_SELECT_GROUP, type: 'select', proxies: [FALLBACK_GROUP, 'HK-01'] },
        { name: FALLBACK_GROUP, type: 'fallback', proxies: ['HK-01', 'HK-01', 'US-01'] },
      ];

      const sanitized = sanitizePolicyGroupGraph(groups, proxies);
      expect(sanitized.find((g) => g.name === '🌍 非中国')?.proxies).toEqual([
        DEFAULT_SELECT_GROUP,
        FALLBACK_GROUP,
        'DIRECT',
      ]);
      expect(sanitized.find((g) => g.name === FALLBACK_GROUP)?.proxies).toEqual(['HK-01', 'US-01']);
    });

    it('removes cycles in template-processor while retaining valid template hierarchy', () => {
      const rendered = renderClashFromIniTemplate(
        `
[Proxy Group]
🚀 节点选择 = select, ☑️ 手动切换, DIRECT
☑️ 手动切换 = select, 🚀 节点选择, HK-01
🐟 漏网之鱼 = select, 🚀 节点选择, ☑️ 手动切换, DIRECT

[Rule]
MATCH,🐟 漏网之鱼
        `,
        {
          injectSmartGroups: false,
          proxies: [{ name: 'HK-01', type: 'trojan', server: '1.1.1.1', port: 443, password: 'pass' }],
        },
      );
      const parsed = yaml.load(rendered);
      const findGroup = (name) => parsed['proxy-groups'].find((g) => g.name === name);

      expect(findGroup('☑️ 手动切换')?.proxies).toEqual(['HK-01']);
      expect(findGroup('🚀 节点选择')?.proxies).toEqual(['☑️ 手动切换', 'DIRECT']);
      expect(findGroup('🐟 漏网之鱼')?.proxies).toEqual(['🚀 节点选择', '☑️ 手动切换', 'DIRECT']);
    });

    it('applySmartModelOptimizations breaks 3-node cycles directly on UnifiedTemplateModel', () => {
      const model = parseIniTemplate(
        `
[Proxy Group]
G1 = select, G2
G2 = select, G3
G3 = select, G1, HK-01

[Rule]
MATCH,G1
        `,
        {
          injectSmartGroups: false,
          proxies: [{ name: 'HK-01', type: 'trojan', server: '1.1.1.1', port: 443, password: 'pass' }],
        },
      );
      const optimized = applySmartModelOptimizations(model);
      const g3 = optimized.groups.find((g) => g.name === 'G3');
      expect(g3?.members).toEqual(['HK-01']);

      const result = removePolicyGroupCycles(
        [
          { name: 'X', members: ['Y'] },
          { name: 'Y', members: ['X', 'HK-01'] },
        ],
        (g) => g.name,
        (g) => g.members,
        (g, next) => ({ ...g, members: next }),
      );
      expect(result.find((g) => g.name === 'Y')?.members).toEqual(['HK-01']);
    });
  });
});
