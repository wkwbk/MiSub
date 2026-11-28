import {
  normalizeUnifiedTemplateModel,
  type TemplateGroup,
  type TemplateRule,
  type UnifiedTemplateModelInput,
} from '../template-model.js';
import { buildSingboxDnsConfig, DNS_PROXY_GROUP, SINGBOX_CN_RULE_SET } from '../../security/safe-dns.js';
import { getSingboxDnsRuleSet, pinRemoteRuleUrl, type SingboxRuleSetDefinition } from '../builtin-rules-provider.js';
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

function mapRuleToSingbox(rule: TemplateRule): Record<string, unknown> | null {
  if (typeof rule === 'string') return null;
  const type = String(rule.type || '').toLowerCase();
  if (type === 'rule-set') {
    return {
      rule_set: sanitizeTag(`${rule.policy}_${rule.value}`),
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

function detectRuleSetFormat(url: unknown): 'binary' | 'source' {
  const raw = String(url || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'source';
  return raw.endsWith('.srs') ? 'binary' : 'source';
}

function buildRuleSets(
  rules: TemplateRule[],
  { isChinaClient = false }: { isChinaClient?: boolean } = {},
): SingboxRuleSetDefinition[] {
  const seenRemote = new Set<string>();
  const remoteRuleSets: SingboxRuleSetDefinition[] = [];
  rules.forEach((rule) => {
    if (typeof rule !== 'object' || rule === null) return;
    if (String(rule.type || '').toLowerCase() !== 'rule-set' || rule.source !== 'remote') return;
    const val = String(rule.value || '');
    const tag = sanitizeTag(`${rule.policy}_${val}`);
    if (seenRemote.has(tag)) return;
    seenRemote.add(tag);
    remoteRuleSets.push({
      tag,
      type: 'remote',
      format: detectRuleSetFormat(val),
      url: pinRemoteRuleUrl(val, { isChinaClient }),
      update_interval: '24h',
      download_detour: DNS_PROXY_GROUP,
    });
  });

  const implicitRuleSets: SingboxRuleSetDefinition[] = [];
  const seen = new Set<string>();

  rules.forEach((rule) => {
    if (typeof rule !== 'object' || rule === null) return;
    const type = String(rule.type || '').toLowerCase();
    if (type === 'geoip' || type === 'geosite') {
      const value = String(rule.value || 'cn').toLowerCase();
      const tag = `${type}-${value}`;
      if (!seen.has(tag)) {
        seen.add(tag);
        implicitRuleSets.push({
          tag,
          type: 'remote',
          format: 'binary',
          url:
            type === 'geoip'
              ? pinRemoteRuleUrl(`https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-${value}.srs`, {
                  isChinaClient,
                })
              : pinRemoteRuleUrl(
                  `https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-${value}.srs`,
                  { isChinaClient },
                ),
          update_interval: '24h',
          download_detour: DNS_PROXY_GROUP,
        });
      }
    }
  });

  return [...remoteRuleSets, ...implicitRuleSets];
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
    ...normalizedModel.rules.map(mapRuleToSingbox).filter((item): item is Record<string, unknown> => Boolean(item)),
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
