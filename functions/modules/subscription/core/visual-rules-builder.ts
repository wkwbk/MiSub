/**
 * 可视化分流规则、通用开关、Subconverter 外部配置与基础配置覆写构建器（MiSub 原生实现）
 */

import * as yaml from 'js-yaml';
import type { CustomVisualRulesConfig, SmartPreset } from '@misub/core/types.js';
import {
  normalizeCustomVisualRules,
  VISUAL_RULE_MAP,
  VISUAL_RULE_PRESETS,
} from '@misub/core/domain/visual-rules-catalog.js';
import {
  ACL4SSR_BASE,
  AUTO_SELECT_GROUP,
  buildMetaMrsProvider,
  DEFAULT_RELAY_GROUP,
  DEFAULT_SELECT_GROUP,
  FALLBACK_GROUP,
  MANUAL_SELECT_GROUP,
  pinRemoteRuleUrl,
  pruneProxyGroups,
  RELAY_CHAIN_GROUP,
  RELAY_ENTRY_GROUP,
  resolveSingboxGeoipRuleSetUrl,
  SING_GEOSITE_BASE,
  type ClashRuleProviderDefinition,
  type PinRemoteRuleUrlOptions,
  type SingboxRuleSetDefinition,
} from '../templates/builtin-rules-provider.js';
import {
  buildRegionPolicyGroups,
  type RegionGroupNode,
  type RegionGroupsOptions,
  type RegionPolicyGroup,
} from './region-groups.js';
import { DNS_PROXY_GROUP } from '../security/safe-dns.js';

export interface VisualRulesOptions extends RegionGroupsOptions, PinRemoteRuleUrlOptions {
  smartPreset?: SmartPreset | string;
  enableRelay?: boolean;
  customVisualRules?: Partial<CustomVisualRulesConfig> | Record<string, unknown> | null;
  preferMrs?: boolean;
}

export type SingboxVisualRule =
  | { source_ip_cidr: string[]; outbound: string }
  | { domain_suffix: string[]; outbound: string }
  | { domain_keyword: string[]; outbound: string }
  | { rule_set: string[]; outbound: string }
  | { ip_cidr: string[]; outbound: string };

export interface VisualRulesAndProvidersResult {
  rules: Array<string | SingboxVisualRule>;
  clashProviders: Record<string, ClashRuleProviderDefinition>;
  singboxRuleSets: SingboxRuleSetDefinition[];
}

const CLASH_PROTECTED_KEYS = new Set(['proxies', 'proxy-groups', 'rules', 'rule-providers']);
const SINGBOX_PROTECTED_KEYS = new Set(['outbounds']);
const SURGE_PROTECTED_SECTIONS = new Set(['proxy', 'proxy group', 'rule']);

function resolveAcl4ssrUrl(relativePath: string | undefined, options: PinRemoteRuleUrlOptions = {}): string {
  if (!relativePath) return '';
  const stripped = String(relativePath).replace(/^ACL4SSR\//i, '');
  return pinRemoteRuleUrl(`${ACL4SSR_BASE}/${stripped}`, options);
}

function buildGroupCandidates({
  action = 'proxy',
  includeAutoSelect = true,
  regionNames = [],
  isRelay = false,
  includeDirect = true,
}: {
  action?: string;
  includeAutoSelect?: boolean;
  regionNames?: string[];
  isRelay?: boolean;
  includeDirect?: boolean;
}): string[] {
  const proxyCandidates = [
    ...(isRelay ? [RELAY_CHAIN_GROUP, '🚀 常用节点'] : []),
    ...(includeAutoSelect ? [AUTO_SELECT_GROUP] : []),
    ...regionNames,
    MANUAL_SELECT_GROUP,
  ];
  if (action === 'reject') {
    return ['REJECT', 'DIRECT', ...proxyCandidates];
  }
  if (action === 'direct') {
    return ['DIRECT', ...proxyCandidates];
  }
  return includeDirect ? [...proxyCandidates, 'DIRECT'] : proxyCandidates;
}

/**
 * 构建可视化规则对应的策略组（供 Clash / Sing-Box / Surge / Loon / QuanX 统一复用）
 */
export function buildVisualPolicyGroups(
  proxies: RegionGroupNode[],
  options: VisualRulesOptions = {},
): RegionPolicyGroup[] {
  const smartPreset = String(options.smartPreset || 'balanced').toLowerCase();
  const isRelay = Boolean(options.enableRelay);
  const cvr = normalizeCustomVisualRules(options.customVisualRules, { smartPreset });
  const proxyNames = proxies.map((p) => p.tag || p.name);
  const nodeCandidates = proxyNames.length > 0 ? proxyNames : ['DIRECT'];

  const { regionSelectGroups, regionSupportGroups, regionNames } = cvr.groupByCountry
    ? buildRegionPolicyGroups(proxies, { ...options, includeAutoSelect: cvr.includeAutoSelect })
    : {
        regionSelectGroups: [] as RegionPolicyGroup[],
        regionSupportGroups: [] as RegionPolicyGroup[],
        regionNames: [] as string[],
      };

  const groups: RegionPolicyGroup[] = [
    {
      name: DNS_PROXY_GROUP,
      type: 'url-test',
      proxies: proxyNames.length > 0 ? proxyNames : ['REJECT'],
      hidden: true,
      options: { url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50 },
    },
  ];

  if (isRelay) {
    groups.push(
      {
        name: DEFAULT_RELAY_GROUP,
        type: 'select',
        proxies: [
          RELAY_CHAIN_GROUP,
          ...(cvr.includeAutoSelect ? [AUTO_SELECT_GROUP] : []),
          FALLBACK_GROUP,
          MANUAL_SELECT_GROUP,
          '🚀 常用节点',
          ...regionNames,
          'DIRECT',
        ],
      },
      {
        name: RELAY_CHAIN_GROUP,
        type: 'select',
        proxies: [
          RELAY_ENTRY_GROUP,
          ...(cvr.includeAutoSelect ? [AUTO_SELECT_GROUP] : []),
          MANUAL_SELECT_GROUP,
          'DIRECT',
          ...proxyNames,
        ],
      },
      {
        name: RELAY_ENTRY_GROUP,
        type: 'select',
        proxies: [...(cvr.includeAutoSelect ? [AUTO_SELECT_GROUP] : []), MANUAL_SELECT_GROUP, 'DIRECT', ...proxyNames],
      },
      {
        name: '🚀 常用节点',
        type: 'select',
        proxies: [
          ...(cvr.includeAutoSelect ? [AUTO_SELECT_GROUP] : []),
          FALLBACK_GROUP,
          MANUAL_SELECT_GROUP,
          ...regionNames,
          'DIRECT',
        ],
      },
    );
  } else {
    groups.push({
      name: DEFAULT_SELECT_GROUP,
      type: 'select',
      proxies: [
        ...(cvr.includeAutoSelect ? [AUTO_SELECT_GROUP] : []),
        FALLBACK_GROUP,
        MANUAL_SELECT_GROUP,
        ...regionNames,
        'DIRECT',
      ],
    });
  }

  if (cvr.includeAutoSelect) {
    groups.push({ name: AUTO_SELECT_GROUP, type: 'url-test', proxies: nodeCandidates });
  }
  groups.push({ name: FALLBACK_GROUP, type: 'fallback', proxies: nodeCandidates });
  groups.push({ name: MANUAL_SELECT_GROUP, type: 'select', proxies: nodeCandidates });
  groups.push(...regionSelectGroups);

  const seenGroupNames = new Set(groups.map((g) => g.name));

  // 自定义规则策略组优先展示
  for (const rule of cvr.customRules) {
    if (seenGroupNames.has(rule.name)) continue;
    seenGroupNames.add(rule.name);
    groups.push({
      name: rule.name,
      type: 'select',
      proxies: buildGroupCandidates({
        action: rule.action,
        includeAutoSelect: cvr.includeAutoSelect,
        regionNames,
        isRelay,
      }),
    });
  }

  // 勾选的内置分类策略组
  for (const ruleId of cvr.selectedRules) {
    const cat = VISUAL_RULE_MAP[ruleId];
    if (!cat || seenGroupNames.has(cat.groupName)) continue;
    seenGroupNames.add(cat.groupName);
    groups.push({
      name: cat.groupName,
      type: 'select',
      proxies: buildGroupCandidates({
        action: cat.defaultAction,
        includeAutoSelect: cvr.includeAutoSelect,
        regionNames,
        isRelay,
        includeDirect: cat.id !== 'ai_services',
      }),
    });
  }

  groups.push(...regionSupportGroups);
  return pruneProxyGroups(groups, proxies);
}

/**
 * 构建可视化规则对应的规则列表与远程 Provider 定义
 */
export function buildVisualRulesAndProviders(
  format: string,
  options: VisualRulesOptions = {},
): VisualRulesAndProvidersResult {
  const smartPreset = String(options.smartPreset || 'balanced').toLowerCase();
  const isRelay = Boolean(options.enableRelay);
  const finalGroup = isRelay ? DEFAULT_RELAY_GROUP : DEFAULT_SELECT_GROUP;
  const cvr = normalizeCustomVisualRules(options.customVisualRules, { smartPreset });
  const normalizedFormat = String(format || 'clash').toLowerCase();

  const rules: Array<string | SingboxVisualRule> = [];
  const clashProviders: Record<string, ClashRuleProviderDefinition> = {};
  const singboxRuleSets = new Map<string, SingboxRuleSetDefinition>();

  const addSingboxGeosite = (tagName: string): string => {
    const tag = `geosite-${tagName}`;
    if (!singboxRuleSets.has(tag)) {
      singboxRuleSets.set(tag, {
        tag,
        type: 'remote',
        format: 'binary',
        url: pinRemoteRuleUrl(`${SING_GEOSITE_BASE}/geosite-${tagName}.srs`, options),
        update_interval: '24h',
        download_detour: DNS_PROXY_GROUP,
      });
    }
    return tag;
  };

  const addSingboxGeoip = (tagName: string): string => {
    const tag = `geoip-${tagName}`;
    if (!singboxRuleSets.has(tag)) {
      singboxRuleSets.set(tag, {
        tag,
        type: 'remote',
        format: 'binary',
        url: resolveSingboxGeoipRuleSetUrl(tagName, options),
        update_interval: '24h',
        download_detour: DNS_PROXY_GROUP,
      });
    }
    return tag;
  };

  // 1. 自定义规则（高优先级：SRC-IP-CIDR -> 域名 -> 规则集 -> IP-CIDR）
  for (const custom of cvr.customRules) {
    const target = custom.name;
    if (normalizedFormat === 'singbox' || normalizedFormat === 'sing-box') {
      if (custom.srcIpCidr.length) {
        rules.push({ source_ip_cidr: custom.srcIpCidr, outbound: target });
      }
      if (custom.domainSuffix.length) {
        rules.push({ domain_suffix: custom.domainSuffix, outbound: target });
      }
      if (custom.domainKeyword.length) {
        rules.push({ domain_keyword: custom.domainKeyword, outbound: target });
      }
      if (custom.ruleSet.length) {
        const tags = custom.ruleSet.map((site) => addSingboxGeosite(site));
        rules.push({ rule_set: tags, outbound: target });
      }
      if (custom.ipCidr.length) {
        rules.push({ ip_cidr: custom.ipCidr, outbound: target });
      }
    } else if (normalizedFormat === 'surge' || normalizedFormat === 'loon') {
      custom.srcIpCidr.forEach((cidr) => rules.push(`SRC-IP-CIDR,${cidr},${target}`));
      custom.domainSuffix.forEach((d) => rules.push(`DOMAIN-SUFFIX,${d},${target}`));
      custom.domainKeyword.forEach((k) => rules.push(`DOMAIN-KEYWORD,${k},${target}`));
      custom.ipCidr.forEach((cidr) => rules.push(`IP-CIDR,${cidr},${target},no-resolve`));
    } else if (normalizedFormat === 'quanx') {
      custom.domainSuffix.forEach((d) => rules.push(`HOST-SUFFIX,${d},${target}`));
      custom.domainKeyword.forEach((k) => rules.push(`HOST-KEYWORD,${k},${target}`));
      custom.ipCidr.forEach((cidr) => rules.push(`IP-CIDR,${cidr},${target}`));
    } else {
      // Clash / Mihomo
      custom.srcIpCidr.forEach((cidr) => rules.push(`SRC-IP-CIDR,${cidr},${target}`));
      custom.domainSuffix.forEach((d) => rules.push(`DOMAIN-SUFFIX,${d},${target}`));
      custom.domainKeyword.forEach((k) => rules.push(`DOMAIN-KEYWORD,${k},${target}`));
      custom.ruleSet.forEach((site) => rules.push(`GEOSITE,${site},${target}`));
      custom.ipCidr.forEach((cidr) => rules.push(`IP-CIDR,${cidr},${target},no-resolve`));
    }
  }

  // 2. 勾选的内置分类规则：两阶段收集（Pass 1 域名优先 -> Pass 2 IP/GeoIP 兜底并附加 no-resolve）
  const domainRules: Array<string | SingboxVisualRule> = [];
  const ipRules: Array<string | SingboxVisualRule> = [];
  const supplementalDomainCategories = new Set(['ai_services', 'social_media', 'finance', 'cloud', 'education']);
  const useMrs = options.preferMrs !== false;
  const seenClashRuleKeys = new Set<string>();

  for (const ruleId of cvr.selectedRules) {
    const cat = VISUAL_RULE_MAP[ruleId];
    if (!cat) continue;
    const target = cat.groupName;

    if (normalizedFormat === 'singbox' || normalizedFormat === 'sing-box') {
      const geositeTags = (cat.geosite || []).map((s) => addSingboxGeosite(s));
      if (geositeTags.length > 0) {
        domainRules.push({ rule_set: geositeTags, outbound: target });
      }
      if (cat.domains?.length && cat.id !== 'private') {
        domainRules.push({ domain_suffix: [...cat.domains], outbound: target });
      }
      const geoipTags = (cat.geoip || []).map((g) => addSingboxGeoip(g));
      if (geoipTags.length > 0) {
        ipRules.push({ rule_set: geoipTags, outbound: target });
      }
      if (cat.ipCidrs?.length) {
        ipRules.push({ ip_cidr: [...cat.ipCidrs], outbound: target });
      }
    } else if (normalizedFormat === 'surge' || normalizedFormat === 'loon') {
      if (cat.surgeList) {
        domainRules.push(`RULE-SET,${resolveAcl4ssrUrl(cat.surgeList, options)},${target}`);
      } else {
        (cat.domains || []).forEach((d) => domainRules.push(`DOMAIN-SUFFIX,${d},${target}`));
        (cat.ipCidrs || []).forEach((cidr) => ipRules.push(`IP-CIDR,${cidr},${target},no-resolve`));
      }
      if (cat.id === 'cn_services') {
        ipRules.push(`GEOIP,CN,${target},no-resolve`);
      }
    } else if (normalizedFormat === 'quanx') {
      if (cat.surgeList) {
        domainRules.push(
          `filter_remote, ${resolveAcl4ssrUrl(cat.surgeList, options)}, tag=${cat.groupName}, force-policy=${target}, update-interval=86400`,
        );
      } else {
        (cat.domains || []).forEach((d) => domainRules.push(`HOST-SUFFIX,${d},${target}`));
        (cat.ipCidrs || []).forEach((cidr) => ipRules.push(`IP-CIDR,${cidr},${target}`));
      }
      if (cat.id === 'cn_services') {
        ipRules.push(`GEOIP,CN,${target}`);
      }
    } else if (useMrs) {
      for (const site of cat.geosite || []) {
        const providerKey = `geosite-${site}`;
        if (!clashProviders[providerKey]) {
          clashProviders[providerKey] = buildMetaMrsProvider('geosite', site);
        }
        const line = `RULE-SET,${providerKey},${target}`;
        if (!seenClashRuleKeys.has(line)) {
          seenClashRuleKeys.add(line);
          domainRules.push(line);
        }
      }
      if ((!cat.geosite?.length || supplementalDomainCategories.has(cat.id)) && cat.domains?.length) {
        for (const d of cat.domains) {
          const line = `DOMAIN-SUFFIX,${d},${target}`;
          if (!seenClashRuleKeys.has(line)) {
            seenClashRuleKeys.add(line);
            domainRules.push(line);
          }
        }
      }
      for (const g of cat.geoip || []) {
        const providerKey = `geoip-${g}`;
        if (!clashProviders[providerKey]) {
          clashProviders[providerKey] = buildMetaMrsProvider('geoip', g);
        }
        const line = `RULE-SET,${providerKey},${target},no-resolve`;
        if (!seenClashRuleKeys.has(line)) {
          seenClashRuleKeys.add(line);
          ipRules.push(line);
        }
      }
      if (!cat.geoip?.length && cat.ipCidrs?.length) {
        for (const cidr of cat.ipCidrs) {
          const line = `IP-CIDR,${cidr},${target},no-resolve`;
          if (!seenClashRuleKeys.has(line)) {
            seenClashRuleKeys.add(line);
            ipRules.push(line);
          }
        }
      }
    } else {
      if (cat.clashProvider) {
        const providerKey = `VIS_${cat.id.toUpperCase()}`;
        const providerUrl = resolveAcl4ssrUrl(cat.clashProvider, options);
        const isTextList = /\.(list|txt)$/i.test(providerUrl);
        clashProviders[providerKey] = {
          type: 'http',
          behavior: 'classical',
          url: providerUrl,
          path: `./ruleset/${providerKey}.${isTextList ? 'list' : 'yaml'}`,
          interval: 86400,
          ...(isTextList ? { format: 'text' } : {}),
        };
        domainRules.push(`RULE-SET,${providerKey},${target}`);
      } else {
        (cat.domains || []).forEach((d) => domainRules.push(`DOMAIN-SUFFIX,${d},${target}`));
        (cat.ipCidrs || []).forEach((cidr) => ipRules.push(`IP-CIDR,${cidr},${target},no-resolve`));
      }
      if (cat.id === 'cn_services') {
        ipRules.push(`GEOIP,CN,${target},no-resolve`);
      }
    }
  }

  rules.push(...domainRules, ...ipRules);

  if (normalizedFormat === 'clash') {
    rules.push(`MATCH,${finalGroup}`);
  }

  return {
    rules,
    clashProviders,
    singboxRuleSets: Array.from(singboxRuleSets.values()),
  };
}

/**
 * 安全合并基础配置覆写（Clash YAML / Sing-Box JSON / Surge INI）
 */
export function applyClashBaseConfigOverride<T extends Record<string, unknown>>(
  generatedConfig: T,
  rawYaml: string | null | undefined,
): T {
  const trimmed = String(rawYaml || '').trim();
  if (!trimmed) return generatedConfig;

  try {
    const parsed: unknown = yaml.load(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return generatedConfig;
    }
    const merged: Record<string, unknown> = { ...generatedConfig };
    for (const [key, value] of Object.entries(parsed)) {
      if (CLASH_PROTECTED_KEYS.has(key)) continue;
      merged[key] = value;
    }
    return merged as T;
  } catch {
    return generatedConfig;
  }
}

export function applySingboxBaseConfigOverride<T extends { route?: Record<string, unknown>; [key: string]: unknown }>(
  generatedConfig: T,
  rawJson: string | null | undefined,
): T {
  const trimmed = String(rawJson || '').trim();
  if (!trimmed) return generatedConfig;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return generatedConfig;
    }
    const merged: Record<string, unknown> = { ...generatedConfig };
    for (const [key, value] of Object.entries(parsed)) {
      if (SINGBOX_PROTECTED_KEYS.has(key)) continue;
      if (key === 'route' && value && typeof value === 'object' && !Array.isArray(value)) {
        const routeObj = value as Record<string, unknown>;
        const { rules: _r, rule_set: _rs, ...safeRouteFields } = routeObj;
        const baseRoute =
          generatedConfig.route && typeof generatedConfig.route === 'object' && !Array.isArray(generatedConfig.route)
            ? (generatedConfig.route as Record<string, unknown>)
            : undefined;
        merged.route = { ...baseRoute, ...safeRouteFields };
      } else {
        merged[key] = value;
      }
    }
    return merged as T;
  } catch {
    return generatedConfig;
  }
}

export function applySurgeBaseConfigOverride(
  generatedSections: string[],
  rawIni: string | null | undefined,
  managedLine = '',
): string[] {
  const trimmed = String(rawIni || '').trim();
  if (!trimmed) return generatedSections;

  const customSections = new Map<string, string[]>();
  let currentSection: string | null = null;
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    const headerMatch = line.match(/^\[([^\]]+)\]$/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      if (!customSections.has(currentSection)) {
        customSections.set(currentSection, []);
      }
      continue;
    }
    if (currentSection && line && !line.startsWith('#!MANAGED-CONFIG')) {
      customSections.get(currentSection)?.push(rawLine);
    }
  }

  if (customSections.size === 0) return generatedSections;

  const result = [...generatedSections];
  for (const [sectionName, lines] of customSections.entries()) {
    const lower = sectionName.toLowerCase();
    if (SURGE_PROTECTED_SECTIONS.has(lower)) continue;
    if (lower === 'general') {
      result[0] = `${managedLine}[General]\n${lines.join('\n')}`;
    } else {
      result.push(`[${sectionName}]\n${lines.join('\n')}`);
    }
  }
  return result;
}

/**
 * 动态生成可供外部 Subconverter 使用的 [custom] INI 配置文件
 */
export function generateSubconverterIniConfig(
  options: Partial<CustomVisualRulesConfig> | Record<string, unknown> = {},
): string {
  const cvr = normalizeCustomVisualRules(options);
  const selectedIds = cvr.selectedRules.length > 0 ? cvr.selectedRules : VISUAL_RULE_PRESETS.balanced;
  const lines = ['[custom]'];

  for (const custom of cvr.customRules) {
    custom.srcIpCidr.forEach((cidr) => lines.push(`ruleset=${custom.name},[]SRC-IP-CIDR,${cidr}`));
    custom.domainSuffix.forEach((d) => lines.push(`ruleset=${custom.name},[]DOMAIN-SUFFIX,${d}`));
    custom.domainKeyword.forEach((k) => lines.push(`ruleset=${custom.name},[]DOMAIN-KEYWORD,${k}`));
    custom.ruleSet.forEach((site) => lines.push(`ruleset=${custom.name},[]GEOSITE,${site}`));
    custom.ipCidr.forEach((cidr) => lines.push(`ruleset=${custom.name},[]IP-CIDR,${cidr},no-resolve`));
  }

  const domainIniLines: string[] = [];
  const ipIniLines: string[] = [];
  for (const ruleId of selectedIds) {
    const cat = VISUAL_RULE_MAP[ruleId];
    if (!cat) continue;
    if (cat.surgeList) {
      domainIniLines.push(`ruleset=${cat.groupName},${resolveAcl4ssrUrl(cat.surgeList)}`);
    } else {
      (cat.domains || []).forEach((d) => domainIniLines.push(`ruleset=${cat.groupName},[]DOMAIN-SUFFIX,${d}`));
      (cat.ipCidrs || []).forEach((cidr) => ipIniLines.push(`ruleset=${cat.groupName},[]IP-CIDR,${cidr},no-resolve`));
    }
    if (cat.id === 'cn_services') {
      ipIniLines.push(`ruleset=${cat.groupName},[]GEOIP,CN`);
    }
  }

  lines.push(...domainIniLines, ...ipIniLines);
  lines.push(`ruleset=${DEFAULT_SELECT_GROUP},[]FINAL`);
  lines.push('');

  const REGION_REGEX_GROUPS = [
    { name: '🇭🇰 香港节点', regex: '(港|HK|Hong Kong|HongKong)' },
    { name: '🇹🇼 台湾节点', regex: '(台|TW|Taiwan|新北|彰化)' },
    { name: '🇸🇬 狮城节点', regex: '(新加坡|坡|狮城|SG|Singapore)' },
    { name: '🇯🇵 日本节点', regex: '(日本|川日|东京|大阪|泉日|埼玉|沪日|深日|JP|Japan)' },
    {
      name: '🇺🇸 美国节点',
      regex:
        '(美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|US|United States)',
    },
    { name: '🇰🇷 韩国节点', regex: '(KR|Korea|KOR|首尔|韩|韓)' },
  ];

  const regionRefs = cvr.groupByCountry ? REGION_REGEX_GROUPS.map((r) => `[]${r.name}`).join('`') : '';
  const autoRef = cvr.includeAutoSelect ? `[]${AUTO_SELECT_GROUP}` : '';
  const commonProxyRefs = [autoRef, regionRefs, `[]${MANUAL_SELECT_GROUP}`].filter(Boolean).join('`');

  lines.push(
    `custom_proxy_group=${DEFAULT_SELECT_GROUP}\`select\`${[commonProxyRefs, '[]DIRECT'].filter(Boolean).join('`')}`,
  );
  if (cvr.includeAutoSelect) {
    lines.push(`custom_proxy_group=${AUTO_SELECT_GROUP}\`url-test\`.*\`http://www.gstatic.com/generate_204\`300,,50`);
  }
  lines.push(`custom_proxy_group=${MANUAL_SELECT_GROUP}\`select\`.*`);

  const emittedGroups = new Set([DEFAULT_SELECT_GROUP, AUTO_SELECT_GROUP, MANUAL_SELECT_GROUP]);
  for (const custom of cvr.customRules) {
    if (emittedGroups.has(custom.name)) continue;
    emittedGroups.add(custom.name);
    const members =
      custom.action === 'reject'
        ? `[]REJECT\`[]DIRECT\`${commonProxyRefs}`
        : custom.action === 'direct'
          ? `[]DIRECT\`${commonProxyRefs}`
          : `${commonProxyRefs}\`[]DIRECT`;
    lines.push(`custom_proxy_group=${custom.name}\`select\`${members}`);
  }

  for (const ruleId of selectedIds) {
    const cat = VISUAL_RULE_MAP[ruleId];
    if (!cat || emittedGroups.has(cat.groupName)) continue;
    emittedGroups.add(cat.groupName);
    const members =
      cat.defaultAction === 'reject'
        ? `[]REJECT\`[]DIRECT\`${commonProxyRefs}`
        : cat.defaultAction === 'direct'
          ? `[]DIRECT\`${commonProxyRefs}`
          : `${commonProxyRefs}\`[]DIRECT`;
    lines.push(`custom_proxy_group=${cat.groupName}\`select\`${members}`);
  }

  if (cvr.groupByCountry) {
    for (const region of REGION_REGEX_GROUPS) {
      lines.push(
        `custom_proxy_group=${region.name}\`url-test\`${region.regex}\`http://www.gstatic.com/generate_204\`300,,50`,
      );
    }
  }

  lines.push('');
  lines.push('enable_rule_generator=true');
  lines.push('overwrite_original_rules=true');

  return `${lines.join('\n')}\n`;
}

export { normalizeCustomVisualRules, VISUAL_RULE_PRESETS };
