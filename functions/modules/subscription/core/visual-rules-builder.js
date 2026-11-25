/**
 * 可视化分流规则、通用开关、Subconverter 外部配置与基础配置覆写构建器（MiSub 原生实现）
 */

import * as yaml from 'js-yaml';
import {
  DEFAULT_BUILTIN_TRANSFORM,
  normalizeBuiltinTransform,
  VISUAL_RULE_CATEGORIES,
  VISUAL_RULE_MAP,
  VISUAL_RULE_PRESETS,
} from '@misub/core/domain/visual-rules-catalog.js';
import {
  AUTO_SELECT_GROUP,
  DEFAULT_SELECT_GROUP,
  FALLBACK_GROUP,
  MANUAL_SELECT_GROUP,
  PINNED_RULE_REVISIONS,
  pinRemoteRuleUrl,
  pruneProxyGroups,
} from '../templates/builtin-rules-provider.js';
import { groupNodeLinesByRegion } from './region-groups.js';
import { DNS_PROXY_GROUP } from '../security/safe-dns.js';

const ACL4SSR_BASE = `https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/${PINNED_RULE_REVISIONS.ACL4SSR}`;
const SING_GEOSITE_BASE = `https://raw.githubusercontent.com/SagerNet/sing-geosite/${PINNED_RULE_REVISIONS.SING_GEOSITE}`;
const SING_GEOIP_BASE = `https://raw.githubusercontent.com/SagerNet/sing-geoip/${PINNED_RULE_REVISIONS.SING_GEOIP}`;

const CLASH_PROTECTED_KEYS = new Set(['proxies', 'proxy-groups', 'rules', 'rule-providers']);
const SINGBOX_PROTECTED_KEYS = new Set(['outbounds']);
const SURGE_PROTECTED_SECTIONS = new Set(['proxy', 'proxy group', 'rule']);

function resolveAcl4ssrUrl(relativePath, options = {}) {
  if (!relativePath) return '';
  const stripped = String(relativePath).replace(/^ACL4SSR\//i, '');
  return pinRemoteRuleUrl(`${ACL4SSR_BASE}/${stripped}`, options);
}

function buildRegionGroupsForVisual(proxies, options = {}) {
  const regions = groupNodeLinesByRegion(proxies, options);
  const regionSelectGroups = [];
  const regionSupportGroups = [];
  const regionNames = [];

  regions.forEach((region) => {
    const autoGroupName = `⚡️ ${region.name.replace('节点', '')} - 自动测速`;
    regionNames.push(region.name);

    const includeAuto = options.includeAutoSelect !== false;
    regionSelectGroups.push({
      name: region.name,
      type: 'select',
      proxies: includeAuto ? [autoGroupName, ...region.tags] : [...region.tags],
    });

    if (includeAuto) {
      regionSupportGroups.push({
        name: autoGroupName,
        type: 'url-test',
        proxies: region.tags,
        hidden: true,
        options: { url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50 },
      });
    }
  });

  return { regionSelectGroups, regionSupportGroups, regionNames };
}

/**
 * @param {{ action?: string, includeAutoSelect?: boolean, regionNames?: string[], includeDirect?: boolean }} options
 * @returns {string[]}
 */
function buildGroupCandidates({ action = 'proxy', includeAutoSelect = true, regionNames = [], includeDirect = true }) {
  const proxyCandidates = [...(includeAutoSelect ? [AUTO_SELECT_GROUP] : []), ...regionNames, MANUAL_SELECT_GROUP];
  if (action === 'reject') {
    return ['REJECT', 'DIRECT', ...proxyCandidates];
  }
  if (action === 'direct') {
    return ['DIRECT', ...proxyCandidates];
  }
  return includeDirect ? [...proxyCandidates, 'DIRECT'] : proxyCandidates;
}

/**
 * 构建可视化规则对应的策略组（供 Clash / Sing-Box / Surge 复用）
 */
export function buildVisualPolicyGroups(proxies, options = {}) {
  const bt = normalizeBuiltinTransform(options.builtinTransform);
  const proxyNames = proxies.map((p) => p.tag || p.name);
  const nodeCandidates = proxyNames.length > 0 ? proxyNames : ['DIRECT'];

  const { regionSelectGroups, regionSupportGroups, regionNames } = bt.groupByCountry
    ? buildRegionGroupsForVisual(proxies, { ...options, includeAutoSelect: bt.includeAutoSelect })
    : { regionSelectGroups: [], regionSupportGroups: [], regionNames: [] };

  /** @type {Array<Record<string, any>>} */
  const groups = [
    {
      name: DNS_PROXY_GROUP,
      type: 'url-test',
      proxies: proxyNames.length > 0 ? proxyNames : ['REJECT'],
      hidden: true,
      options: { url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50 },
    },
    {
      name: DEFAULT_SELECT_GROUP,
      type: 'select',
      proxies: [
        ...(bt.includeAutoSelect ? [AUTO_SELECT_GROUP] : []),
        FALLBACK_GROUP,
        MANUAL_SELECT_GROUP,
        ...regionNames,
        'DIRECT',
      ],
    },
  ];

  if (bt.includeAutoSelect) {
    groups.push({ name: AUTO_SELECT_GROUP, type: 'url-test', proxies: nodeCandidates });
  }
  groups.push({ name: FALLBACK_GROUP, type: 'fallback', proxies: nodeCandidates });
  groups.push({ name: MANUAL_SELECT_GROUP, type: 'select', proxies: nodeCandidates });
  groups.push(...regionSelectGroups);

  const seenGroupNames = new Set(groups.map((g) => g.name));

  // 自定义规则策略组优先展示
  for (const rule of bt.customRules) {
    if (seenGroupNames.has(rule.name)) continue;
    seenGroupNames.add(rule.name);
    groups.push({
      name: rule.name,
      type: 'select',
      proxies: buildGroupCandidates({
        action: rule.action,
        includeAutoSelect: bt.includeAutoSelect,
        regionNames,
      }),
    });
  }

  // 勾选的内置分类策略组
  for (const ruleId of bt.selectedRules) {
    const cat = VISUAL_RULE_MAP[ruleId];
    if (!cat || seenGroupNames.has(cat.groupName)) continue;
    seenGroupNames.add(cat.groupName);
    groups.push({
      name: cat.groupName,
      type: 'select',
      proxies: buildGroupCandidates({
        action: cat.defaultAction,
        includeAutoSelect: bt.includeAutoSelect,
        regionNames,
      }),
    });
  }

  groups.push(...regionSupportGroups);
  return pruneProxyGroups(groups, proxies);
}

/**
 * 构建可视化规则对应的规则列表与远程 Provider 定义
 */
export function buildVisualRulesAndProviders(format, options = {}) {
  const bt = normalizeBuiltinTransform(options.builtinTransform);
  const normalizedFormat = String(format || 'clash').toLowerCase();

  const rules = [];
  const clashProviders = {};
  const singboxRuleSets = new Map();

  const addSingboxGeosite = (tagName) => {
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

  const addSingboxGeoip = (tagName) => {
    const tag = `geoip-${tagName}`;
    if (!singboxRuleSets.has(tag)) {
      singboxRuleSets.set(tag, {
        tag,
        type: 'remote',
        format: 'binary',
        url: pinRemoteRuleUrl(`${SING_GEOIP_BASE}/geoip-${tagName}.srs`, options),
        update_interval: '24h',
        download_detour: DNS_PROXY_GROUP,
      });
    }
    return tag;
  };

  // 1. 自定义规则（高优先级：SRC-IP-CIDR -> 域名 -> 规则集 -> IP-CIDR）
  for (const custom of bt.customRules) {
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
    } else {
      // Clash / Mihomo
      custom.srcIpCidr.forEach((cidr) => rules.push(`SRC-IP-CIDR,${cidr},${target}`));
      custom.domainSuffix.forEach((d) => rules.push(`DOMAIN-SUFFIX,${d},${target}`));
      custom.domainKeyword.forEach((k) => rules.push(`DOMAIN-KEYWORD,${k},${target}`));
      custom.ruleSet.forEach((site) => rules.push(`GEOSITE,${site},${target}`));
      custom.ipCidr.forEach((cidr) => rules.push(`IP-CIDR,${cidr},${target},no-resolve`));
    }
  }

  // 2. 勾选的内置分类规则
  for (const ruleId of bt.selectedRules) {
    const cat = VISUAL_RULE_MAP[ruleId];
    if (!cat) continue;
    const target = cat.groupName;

    if (normalizedFormat === 'singbox' || normalizedFormat === 'sing-box') {
      const ruleSetTags = [];
      (cat.geosite || []).forEach((s) => ruleSetTags.push(addSingboxGeosite(s)));
      (cat.geoip || []).forEach((g) => ruleSetTags.push(addSingboxGeoip(g)));
      if (ruleSetTags.length > 0) {
        rules.push({ rule_set: ruleSetTags, outbound: target });
      }
      if (cat.domains?.length) {
        rules.push({ domain_suffix: cat.domains, outbound: target });
      }
      if (cat.ipCidrs?.length) {
        rules.push({ ip_cidr: cat.ipCidrs, outbound: target });
      }
    } else if (normalizedFormat === 'surge' || normalizedFormat === 'loon') {
      if (cat.surgeList) {
        rules.push(`RULE-SET,${resolveAcl4ssrUrl(cat.surgeList, options)},${target}`);
      } else {
        (cat.domains || []).forEach((d) => rules.push(`DOMAIN-SUFFIX,${d},${target}`));
        (cat.ipCidrs || []).forEach((cidr) => rules.push(`IP-CIDR,${cidr},${target},no-resolve`));
      }
    } else {
      // Clash / Mihomo
      if (cat.clashProvider) {
        const providerKey = `VIS_${cat.id.toUpperCase()}`;
        clashProviders[providerKey] = {
          type: 'http',
          behavior: 'classical',
          url: resolveAcl4ssrUrl(cat.clashProvider, options),
          path: `./ruleset/${providerKey}.yaml`,
          interval: 86400,
        };
        rules.push(`RULE-SET,${providerKey},${target}`);
      } else {
        (cat.domains || []).forEach((d) => rules.push(`DOMAIN-SUFFIX,${d},${target}`));
        (cat.ipCidrs || []).forEach((cidr) => rules.push(`IP-CIDR,${cidr},${target},no-resolve`));
      }
      if (cat.id === 'cn_services') {
        rules.push(`GEOIP,CN,${target}`);
      }
    }
  }

  // 兜底规则
  if (normalizedFormat === 'clash') {
    rules.push(`MATCH,${DEFAULT_SELECT_GROUP}`);
  }

  return {
    rules,
    clashProviders,
    singboxRuleSets: Array.from(singboxRuleSets.values()),
  };
}

/**
 * 过滤掉内置策略组中的地区组 / 自动选择组（用于未开启 visualRulesEnabled 但调整了通用开关的场景）
 */
export function applyGeneralGroupToggles(proxyGroups, options = {}) {
  const bt = normalizeBuiltinTransform(options.builtinTransform);
  let nextGroups = Array.isArray(proxyGroups)
    ? proxyGroups.map((g) => ({ ...g, proxies: [...(g.proxies || [])] }))
    : [];

  if (!bt.includeAutoSelect) {
    const removedNames = new Set(
      nextGroups
        .filter((g) => g.name === AUTO_SELECT_GROUP || String(g.name || '').startsWith('⚡️ '))
        .map((g) => g.name),
    );
    nextGroups = nextGroups
      .filter((g) => !removedNames.has(g.name))
      .map((g) => ({
        ...g,
        proxies: g.proxies.filter((member) => !removedNames.has(member)),
      }));
  }

  if (!bt.groupByCountry) {
    const removedRegions = new Set(
      nextGroups
        .filter(
          (g) =>
            String(g.name || '').endsWith('节点') &&
            g.name !== '入口节点' &&
            g.name !== '落地节点' &&
            g.name !== '🚀 常用节点',
        )
        .map((g) => g.name),
    );
    const removedRegionAuto = new Set(
      nextGroups.filter((g) => String(g.name || '').startsWith('⚡️ ')).map((g) => g.name),
    );
    const allRemoved = new Set([...removedRegions, ...removedRegionAuto]);
    nextGroups = nextGroups
      .filter((g) => !allRemoved.has(g.name))
      .map((g) => ({
        ...g,
        proxies: g.proxies.filter((member) => !allRemoved.has(member)),
      }));
  }

  return nextGroups;
}

/**
 * 安全合并基础配置覆写（Clash YAML / Sing-Box JSON / Surge INI）
 */
export function applyClashBaseConfigOverride(generatedConfig, rawYaml) {
  const trimmed = String(rawYaml || '').trim();
  if (!trimmed) return generatedConfig;

  try {
    const parsed = yaml.load(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return generatedConfig;
    }
    const merged = { ...generatedConfig };
    for (const [key, value] of Object.entries(parsed)) {
      if (CLASH_PROTECTED_KEYS.has(key)) continue;
      merged[key] = value;
    }
    return merged;
  } catch {
    return generatedConfig;
  }
}

export function applySingboxBaseConfigOverride(generatedConfig, rawJson) {
  const trimmed = String(rawJson || '').trim();
  if (!trimmed) return generatedConfig;

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return generatedConfig;
    }
    const merged = { ...generatedConfig };
    for (const [key, value] of Object.entries(parsed)) {
      if (SINGBOX_PROTECTED_KEYS.has(key)) continue;
      if (key === 'route' && value && typeof value === 'object' && !Array.isArray(value)) {
        const { rules: _r, rule_set: _rs, ...safeRouteFields } = value;
        merged.route = { ...merged.route, ...safeRouteFields };
      } else {
        merged[key] = value;
      }
    }
    return merged;
  } catch {
    return generatedConfig;
  }
}

export function applySurgeBaseConfigOverride(generatedSections, rawIni, managedLine = '') {
  const trimmed = String(rawIni || '').trim();
  if (!trimmed) return generatedSections;

  // 解析用户基础配置 INI 的各个 [Section]
  const customSections = new Map();
  let currentSection = null;
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
      customSections.get(currentSection).push(rawLine);
    }
  }

  if (customSections.size === 0) return generatedSections;

  const result = [...generatedSections];
  // 替换 [General]
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
export function generateSubconverterIniConfig(options = {}) {
  const bt = normalizeBuiltinTransform(options);
  const selectedIds = bt.selectedRules.length > 0 ? bt.selectedRules : VISUAL_RULE_PRESETS.balanced;
  const lines = ['[custom]'];

  // 1. 自定义规则
  for (const custom of bt.customRules) {
    custom.srcIpCidr.forEach((cidr) => lines.push(`ruleset=${custom.name},[]SRC-IP-CIDR,${cidr}`));
    custom.domainSuffix.forEach((d) => lines.push(`ruleset=${custom.name},[]DOMAIN-SUFFIX,${d}`));
    custom.domainKeyword.forEach((k) => lines.push(`ruleset=${custom.name},[]DOMAIN-KEYWORD,${k}`));
    custom.ruleSet.forEach((site) => lines.push(`ruleset=${custom.name},[]GEOSITE,${site}`));
    custom.ipCidr.forEach((cidr) => lines.push(`ruleset=${custom.name},[]IP-CIDR,${cidr},no-resolve`));
  }

  // 2. 勾选的内置规则
  for (const ruleId of selectedIds) {
    const cat = VISUAL_RULE_MAP[ruleId];
    if (!cat) continue;
    if (cat.surgeList) {
      lines.push(`ruleset=${cat.groupName},${resolveAcl4ssrUrl(cat.surgeList)}`);
    } else {
      (cat.domains || []).forEach((d) => lines.push(`ruleset=${cat.groupName},[]DOMAIN-SUFFIX,${d}`));
      (cat.ipCidrs || []).forEach((cidr) => lines.push(`ruleset=${cat.groupName},[]IP-CIDR,${cidr},no-resolve`));
    }
    if (cat.id === 'cn_services') {
      lines.push(`ruleset=${cat.groupName},[]GEOIP,CN`);
    }
  }

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

  const regionRefs = bt.groupByCountry ? REGION_REGEX_GROUPS.map((r) => `[]${r.name}`).join('`') : '';
  const autoRef = bt.includeAutoSelect ? `[]${AUTO_SELECT_GROUP}` : '';
  const commonProxyRefs = [autoRef, regionRefs, `[]${MANUAL_SELECT_GROUP}`].filter(Boolean).join('`');

  // 顶层策略组
  lines.push(
    `custom_proxy_group=${DEFAULT_SELECT_GROUP}\`select\`${[commonProxyRefs, '[]DIRECT'].filter(Boolean).join('`')}`,
  );
  if (bt.includeAutoSelect) {
    lines.push(`custom_proxy_group=${AUTO_SELECT_GROUP}\`url-test\`.*\`http://www.gstatic.com/generate_204\`300,,50`);
  }
  lines.push(`custom_proxy_group=${MANUAL_SELECT_GROUP}\`select\`.*`);

  // 自定义规则组
  const emittedGroups = new Set([DEFAULT_SELECT_GROUP, AUTO_SELECT_GROUP, MANUAL_SELECT_GROUP]);
  for (const custom of bt.customRules) {
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

  // 勾选分类组
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

  // 地区分组
  if (bt.groupByCountry) {
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

export { DEFAULT_BUILTIN_TRANSFORM, normalizeBuiltinTransform, VISUAL_RULE_CATEGORIES, VISUAL_RULE_PRESETS };
