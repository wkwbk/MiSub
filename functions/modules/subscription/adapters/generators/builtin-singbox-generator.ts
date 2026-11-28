/**
 * 内置 Sing-Box 配置生成器
 * 将节点 URL 列表转换为基础可用的 sing-box JSON 配置。
 */

import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import { getUniqueName } from '../../core/name-utils.js';
import {
  FINAL_FALLBACK_GROUP,
  getSingboxDnsRuleSet,
  type SingboxRuleSetDefinition,
} from '../../templates/builtin-rules-provider.js';
import { buildSingboxDnsConfig, DNS_PROXY_GROUP } from '../../security/safe-dns.js';
import { SINGBOX_SNIFF_RULE } from '../../core/sniffing-config.js';
import {
  applySingboxBaseConfigOverride,
  buildVisualRulesAndProviders,
  type SingboxVisualRule,
} from '../../core/visual-rules-builder.js';
import {
  buildSingboxConfigEnvelope,
  buildSingboxOutbound,
  DEFAULT_TEST_URL,
  materializeRelayChainNodes,
  parseNodeUrlLines,
  resolveBuiltinPolicyGroups,
  SINGBOX_LOCAL_ROUTE_RULES,
  type BuiltinGeneratorOptions,
  type SingboxOutbound,
} from '../../core/client-shared.js';

function sanitizeName(name: string | undefined | null): string {
  if (!name) return 'Untitled';
  const safe = String(name)
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
  return safe || 'Untitled';
}

export function generateBuiltinSingboxConfig(nodeList: string, options: BuiltinGeneratorOptions = {}): string {
  const nodeUrls = parseNodeUrlLines(nodeList);

  const outbounds: SingboxOutbound[] = [];
  const usedNames = new Map<string, number>();
  const nodeEntries: Array<{ tag: string; outbound: SingboxOutbound }> = [];

  const proxies = urlsToClashProxies(nodeUrls, options);

  // 应用 UDP 开关
  // (已在 urlsToClashProxies 中全局处理)

  for (const clashProxy of proxies) {
    const baseName = sanitizeName(clashProxy.name);
    clashProxy.name = getUniqueName(baseName, usedNames);

    const outbound = buildSingboxOutbound(clashProxy);
    if (outbound) {
      outbounds.push(outbound);
      nodeEntries.push({ tag: outbound.tag, outbound });
    }
  }

  if (outbounds.length === 0) {
    outbounds.push({ tag: 'DIRECT', type: 'direct' });
  }

  const resolved = resolveBuiltinPolicyGroups(
    outbounds.map((o) => ({ ...o, name: o.tag })),
    options,
  );
  const { smartPreset, isRelay, customVisualRules, advancedBaseConfig } = resolved;
  let proxyGroups = resolved.proxyGroups;

  if (isRelay) {
    const relay = materializeRelayChainNodes({
      nameKey: 'tag',
      linkKey: 'detour',
      publicItems: nodeEntries.map(({ outbound }) => outbound),
      proxyGroups,
      allProxiesForPrune: outbounds.map((o) => ({ ...o, name: o.tag })),
    });
    if (relay.items.length > 0) {
      outbounds.splice(0, outbounds.length, ...(relay.items as SingboxOutbound[]));
    }
    proxyGroups = relay.proxyGroups;
  }

  // 将抽象分组转换为 Sing-Box Outbounds
  const groupOutbounds = proxyGroups.map((group) => {
    let type = 'selector';
    if (group.type === 'url-test') type = 'urltest';
    if (group.type === 'fallback') type = 'urltest'; // Sing-Box 暂时映射为 urltest

    return {
      tag: group.name,
      type: type,
      outbounds: group.proxies,
      ...(type === 'selector' && group.proxies.length > 0 ? { default: group.proxies[0] } : {}),
      ...(type === 'urltest'
        ? {
            url: DEFAULT_TEST_URL,
            interval: '10m',
            tolerance: 50,
            idle_timeout: '30m',
          }
        : {}),
    };
  });

  const visualOutput = buildVisualRulesAndProviders('singbox', {
    ...options,
    smartPreset,
    enableRelay: isRelay,
    customVisualRules,
  });
  const dnsCnRuleSet = getSingboxDnsRuleSet(options);
  const seenTags = new Set([dnsCnRuleSet.tag]);
  const ruleSets: SingboxRuleSetDefinition[] = [
    dnsCnRuleSet,
    ...visualOutput.singboxRuleSets.filter((item) => {
      if (seenTags.has(item.tag)) return false;
      seenTags.add(item.tag);
      return true;
    }),
  ];
  const routeRules: Array<Record<string, unknown>> = [
    { ...SINGBOX_SNIFF_RULE },
    ...SINGBOX_LOCAL_ROUTE_RULES.map((r): Record<string, unknown> => ({ ...r })),
    ...visualOutput.rules
      .filter((r): r is SingboxVisualRule => typeof r === 'object' && r !== null)
      .map((r): Record<string, unknown> => ({ ...r })),
  ];

  const dnsConfig = buildSingboxDnsConfig(options.customDnsOverride || '', {
    mode: options.dnsMode,
    proxyGroup: DNS_PROXY_GROUP,
  });

  let config: Record<string, unknown> = buildSingboxConfigEnvelope({
    dnsConfig,
    proxyOutbounds: outbounds,
    groupOutbounds,
    finalOutbound: FINAL_FALLBACK_GROUP,
    ruleSets,
    routeRules,
    clashApi: advancedBaseConfig?.enableClashApi
      ? {
          external_controller: advancedBaseConfig.externalController || '0.0.0.0:9090',
          external_ui: 'ui',
          ...(advancedBaseConfig.externalUiDownloadUrl
            ? { external_ui_download_url: advancedBaseConfig.externalUiDownloadUrl }
            : {}),
        }
      : null,
  });

  if (advancedBaseConfig?.baseConfig?.singbox) {
    config = applySingboxBaseConfigOverride(
      config as { route?: Record<string, unknown>; [key: string]: unknown },
      advancedBaseConfig.baseConfig.singbox,
    );
  }

  return JSON.stringify(config, null, 2) + '\n';
}
