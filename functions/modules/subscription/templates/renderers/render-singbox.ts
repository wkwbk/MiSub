import {
  normalizeUnifiedTemplateModel,
  type TemplateGroup,
  type TemplateRule,
  type UnifiedTemplateModelInput,
} from '../template-model.js';
import { buildSingboxDnsConfig, DNS_PROXY_GROUP, SINGBOX_CN_RULE_SET } from '../../security/safe-dns.js';
import {
  getSingboxDnsRuleSet,
  GH_PROXY_BASE,
  pinRemoteRuleUrl,
  resolveSingboxGeoipRuleSetUrl,
  SING_GEOSITE_BASE,
  type SingboxRuleSetDefinition,
} from '../builtin-rules-provider.js';
import { SINGBOX_SNIFF_RULE } from '../../core/sniffing-config.js';
import {
  buildSingboxConfigEnvelope,
  buildSingboxOutbound,
  DEFAULT_TEST_URL,
  filterAutoGroupMembers,
  resolveModelProxies,
} from '../../core/client-shared.js';

export interface RenderSingboxOptions {
  nodeList?: string;
  isChinaClient?: boolean;
  [key: string]: unknown;
}

function sanitizeTag(value: unknown): string {
  return String(value || '').trim() || 'Untitled';
}

function mapGroupType(type: unknown): 'selector' | 'urltest' {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'select') return 'selector';
  if (normalized === 'url-test') return 'urltest';
  if (normalized === 'load-balance') return 'selector';
  return 'selector';
}

function buildGroupOutbounds(
  groups: TemplateGroup[],
  skippedProxyTags: Set<string> = new Set(),
): Array<Record<string, unknown>> {
  const candidates = groups.map((group) => {
    const mappedType = mapGroupType(group.type);
    const filteredMembers = group.members.filter(
      (member) => !skippedProxyTags.has(member) && !skippedProxyTags.has(sanitizeTag(member)),
    );
    return {
      group,
      tag: sanitizeTag(group.name),
      mappedType,
      outbounds: filterAutoGroupMembers(mappedType, filteredMembers),
    };
  });

  // 迭代剔除因全部节点被跳过而变成空列表的 urltest 分组及其上级引用
  const droppedGroupTags = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of candidates) {
      if (droppedGroupTags.has(item.tag)) continue;
      item.outbounds = item.outbounds.filter(
        (member) => !droppedGroupTags.has(member) && !droppedGroupTags.has(sanitizeTag(member)),
      );
      if (item.mappedType === 'urltest' && item.outbounds.length === 0) {
        droppedGroupTags.add(item.tag);
        changed = true;
      }
    }
  }

  return candidates
    .filter((item) => !droppedGroupTags.has(item.tag))
    .map(({ group, tag, mappedType, outbounds }) => {
      const finalOutbounds = mappedType === 'selector' && outbounds.length === 0 ? ['DIRECT'] : outbounds;
      const outbound: Record<string, unknown> = {
        tag,
        type: mappedType,
        outbounds: finalOutbounds,
      };

      if (mappedType === 'urltest') {
        outbound.url = group.options?.url || DEFAULT_TEST_URL;
        outbound.interval = `${group.options?.interval || 300}s`;
        outbound.idle_timeout = '30m';
      }

      if (mappedType === 'selector' && finalOutbounds.length > 0) {
        outbound.default = finalOutbounds[0];
      }

      return outbound;
    });
}

const CLASH_LIST_TO_SINGBOX_SRS: Readonly<Record<string, { geosite?: readonly string[]; geoip?: readonly string[] }>> =
  Object.freeze({
    localareanetwork: { geosite: ['private'], geoip: ['private'] },
    banad: { geosite: ['category-ads-all'] },
    banprogramad: { geosite: ['category-ads-all'] },
    telegram: { geosite: ['telegram'], geoip: ['telegram'] },
    openai: { geosite: ['openai'] },
    claude: { geosite: ['anthropic'] },
    ai: { geosite: ['category-ai-!cn'] },
    youtube: { geosite: ['youtube'] },
    netflix: { geosite: ['netflix'], geoip: ['netflix'] },
    steam: { geosite: ['steam'] },
    steamcn: { geosite: ['steam@cn'] },
    epic: { geosite: ['epicgames'] },
    sony: { geosite: ['sony'] },
    proxygfwlist: { geosite: ['geolocation-!cn'] },
    proxylite: { geosite: ['geolocation-!cn'] },
    proxymedia: { geosite: ['category-entertainment@!cn'] },
    chinadomain: { geosite: ['cn'] },
    chinamedia: { geosite: ['category-entertainment@cn'] },
    apple: { geosite: ['apple'] },
    microsoft: { geosite: ['microsoft'] },
    onedrive: { geosite: ['onedrive'] },
    bing: { geosite: ['bing'] },
    googlecn: { geosite: ['google@cn'] },
    googlefcm: { geosite: ['google'] },
    google: { geosite: ['google'] },
    bilibili: { geosite: ['bilibili'] },
    bilibilihmt: { geosite: ['bilibili'] },
    bahamut: { geosite: ['bahamut'] },
    neteasemusic: { geosite: ['netease'] },
    nintendo: { geosite: ['nintendo'] },
    origin: { geosite: ['ea'] },
    github: { geosite: ['github'] },
    playstore: { geosite: ['google-play'] },
    chinacompanyip: { geoip: ['cn'] },
    chinaip: { geoip: ['cn'] },
    chinaipv6: { geoip: ['cn'] },
    cloudflarecidr: { geoip: ['cloudflare'] },
  });

function stripGhProxyPrefix(sourceUrl: string): string {
  return sourceUrl.startsWith(GH_PROXY_BASE) ? sourceUrl.slice(GH_PROXY_BASE.length) : sourceUrl;
}

function extractPathname(rawUrl: string): string {
  const clean = stripGhProxyPrefix(String(rawUrl || '').trim());
  if (!clean) return '';
  try {
    return new URL(clean).pathname;
  } catch {
    return clean.split('#')[0].split('?')[0];
  }
}

function resolveRemoteRuleSetForSingbox(
  rawUrl: string,
  policy: string,
  isChinaClient: boolean,
): { tags: string[]; ruleSets: SingboxRuleSetDefinition[] } | null {
  const pathname = extractPathname(rawUrl);

  if (/\.srs$/i.test(pathname)) {
    const tag = sanitizeTag(`${policy}_${rawUrl}`);
    return {
      tags: [tag],
      ruleSets: [
        {
          tag,
          type: 'remote',
          format: 'binary',
          url: pinRemoteRuleUrl(rawUrl, { isChinaClient }),
          update_interval: '24h',
          download_detour: DNS_PROXY_GROUP,
        },
      ],
    };
  }

  if (/\.json$/i.test(pathname)) {
    const tag = sanitizeTag(`${policy}_${rawUrl}`);
    return {
      tags: [tag],
      ruleSets: [
        {
          tag,
          type: 'remote',
          format: 'source',
          url: pinRemoteRuleUrl(rawUrl, { isChinaClient }),
          update_interval: '24h',
          download_detour: DNS_PROXY_GROUP,
        },
      ],
    };
  }

  if (/\.(list|txt|yaml|yml|conf)$/i.test(pathname)) {
    const stem = (pathname.split('/').pop() || '').replace(/\.(list|txt|yaml|yml|conf)$/i, '').toLowerCase();
    const mapping = CLASH_LIST_TO_SINGBOX_SRS[stem];
    if (!mapping) return null;

    const tags: string[] = [];
    const ruleSets: SingboxRuleSetDefinition[] = [];

    for (const site of mapping.geosite || []) {
      const tag = `geosite-${site}`;
      tags.push(tag);
      ruleSets.push({
        tag,
        type: 'remote',
        format: 'binary',
        url: pinRemoteRuleUrl(`${SING_GEOSITE_BASE}/geosite-${site}.srs`, { isChinaClient }),
        update_interval: '24h',
        download_detour: DNS_PROXY_GROUP,
      });
    }

    for (const ip of mapping.geoip || []) {
      const tag = `geoip-${ip}`;
      tags.push(tag);
      ruleSets.push({
        tag,
        type: 'remote',
        format: 'binary',
        url: resolveSingboxGeoipRuleSetUrl(ip, { isChinaClient }),
        update_interval: '24h',
        download_detour: DNS_PROXY_GROUP,
      });
    }

    return tags.length > 0 ? { tags, ruleSets } : null;
  }

  const tag = sanitizeTag(`${policy}_${rawUrl}`);
  return {
    tags: [tag],
    ruleSets: [
      {
        tag,
        type: 'remote',
        format: 'source',
        url: pinRemoteRuleUrl(rawUrl, { isChinaClient }),
        update_interval: '24h',
        download_detour: DNS_PROXY_GROUP,
      },
    ],
  };
}

function mapRuleToSingbox(
  rule: TemplateRule,
  { isChinaClient = false }: { isChinaClient?: boolean } = {},
): Record<string, unknown> | null {
  if (typeof rule === 'string') return null;
  const type = String(rule.type || '').toLowerCase();
  if (type === 'rule-set') {
    const val = String(rule.value || '');
    if (rule.source === 'remote' || /^https?:\/\//i.test(val)) {
      const resolved = resolveRemoteRuleSetForSingbox(val, String(rule.policy || ''), isChinaClient);
      if (!resolved) return null;
      return {
        rule_set: resolved.tags,
        outbound: rule.policy,
      };
    }
    return {
      rule_set: [sanitizeTag(`${rule.policy}_${val}`)],
      outbound: rule.policy,
    };
  }
  if (type === 'geoip') {
    const value = String(rule.value || 'cn').toLowerCase();
    return {
      rule_set: [`geoip-${value}`],
      outbound: rule.policy,
    };
  }
  if (type === 'geosite') {
    const value = String(rule.value || 'cn').toLowerCase();
    return {
      rule_set: [`geosite-${value}`],
      outbound: rule.policy,
    };
  }
  if (type === 'match' || type === 'final') {
    return {
      outbound: rule.policy,
    };
  }
  if (type === 'domain-suffix') {
    return {
      domain_suffix: [rule.value],
      outbound: rule.policy,
    };
  }
  if (type === 'domain-keyword') {
    return {
      domain_keyword: [rule.value],
      outbound: rule.policy,
    };
  }
  return null;
}

function buildRuleSets(
  rules: TemplateRule[],
  { isChinaClient = false }: { isChinaClient?: boolean } = {},
): SingboxRuleSetDefinition[] {
  const seen = new Set<string>();
  const ruleSets: SingboxRuleSetDefinition[] = [];

  const addRuleSet = (entry: SingboxRuleSetDefinition) => {
    if (seen.has(entry.tag)) return;
    seen.add(entry.tag);
    ruleSets.push(entry);
  };

  rules.forEach((rule) => {
    if (typeof rule !== 'object' || rule === null) return;
    const type = String(rule.type || '').toLowerCase();
    if (type === 'rule-set') {
      const val = String(rule.value || '');
      if (rule.source !== 'remote' && !/^https?:\/\//i.test(val)) return;
      const resolved = resolveRemoteRuleSetForSingbox(val, String(rule.policy || ''), isChinaClient);
      if (!resolved) return;
      resolved.ruleSets.forEach(addRuleSet);
      return;
    }

    if (type === 'geoip' || type === 'geosite') {
      const value = String(rule.value || 'cn').toLowerCase();
      const tag = `${type}-${value}`;
      addRuleSet({
        tag,
        type: 'remote',
        format: 'binary',
        url:
          type === 'geoip'
            ? resolveSingboxGeoipRuleSetUrl(value, { isChinaClient })
            : pinRemoteRuleUrl(`${SING_GEOSITE_BASE}/geosite-${value}.srs`, { isChinaClient }),
        update_interval: '24h',
        download_detour: DNS_PROXY_GROUP,
      });
    }
  });

  return ruleSets;
}

export function renderSingboxFromTemplateModel(
  model: UnifiedTemplateModelInput,
  options: RenderSingboxOptions = {},
): string {
  const normalizedModel = normalizeUnifiedTemplateModel(model);
  const proxies = resolveModelProxies(normalizedModel, options);
  const proxyOutbounds: Array<Record<string, unknown>> = [];
  const skippedProxyTags = new Set<string>();
  for (const proxy of proxies) {
    const outbound = buildSingboxOutbound(proxy);
    if (outbound) {
      proxyOutbounds.push(outbound);
    } else if (proxy && typeof proxy === 'object') {
      const rawTag = proxy.name || (proxy as { tag?: unknown }).tag;
      if (rawTag) skippedProxyTags.add(sanitizeTag(rawTag));
    }
  }
  for (const outbound of proxyOutbounds) {
    if (typeof outbound.tag === 'string') skippedProxyTags.delete(outbound.tag);
  }
  const groupOutbounds = buildGroupOutbounds(
    normalizedModel.groups.filter((g) => Array.isArray(g.members) && g.members.length > 0),
    skippedProxyTags,
  );
  const ruleSetObjects = [
    getSingboxDnsRuleSet({ isChinaClient: options.isChinaClient }),
    ...buildRuleSets(normalizedModel.rules, { isChinaClient: options.isChinaClient }).filter(
      (ruleSet) => ruleSet.tag !== SINGBOX_CN_RULE_SET,
    ),
  ];
  // 首条为域名嗅探：还原硬编码 IP 直连流量的真实域名后再进入模板分流规则
  const routeRules = [
    { ...SINGBOX_SNIFF_RULE },
    ...normalizedModel.rules
      .map((rule) => mapRuleToSingbox(rule, { isChinaClient: options.isChinaClient }))
      .filter((item): item is Record<string, unknown> => Boolean(item)),
  ];
  const defaultOutbound = normalizedModel.groups.find((group) => group.name !== DNS_PROXY_GROUP)?.name || 'DIRECT';
  const dnsConfig = buildSingboxDnsConfig(normalizedModel.settings?.customDnsOverride, {
    mode: normalizedModel.settings?.dnsMode,
    proxyGroup: DNS_PROXY_GROUP,
  });

  const config = buildSingboxConfigEnvelope({
    dnsConfig,
    proxyOutbounds,
    groupOutbounds,
    finalOutbound: defaultOutbound,
    ruleSets: ruleSetObjects,
    routeRules,
  });

  return JSON.stringify(config, null, 2) + '\n';
}
