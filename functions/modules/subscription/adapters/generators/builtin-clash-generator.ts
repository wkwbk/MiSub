/**
 * 内置 Clash 配置生成器
 * 不依赖外部 subconverter，直接将节点 URL 转换为完整 Clash 配置
 * 支持 dialer-proxy、reality-opts 等特殊参数
 */

import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import { buildMihomoSocksListeners, buildMultiSocksBindings } from '@misub/core/domain/multi-socks.js';
import { cleanControlChars } from '../../core/name-utils.js';
import { isMetaCore } from '../../core/user-agent-utils.js';
import { DNS_PROXY_GROUP, resolveSafeDnsConfig } from '../../security/safe-dns.js';
import {
  buildLiteMultiSocksClashConfig,
  CLASH_YAML_DUMP_OPTIONS,
  createBaseClashConfig,
  deduplicateProxyNames,
  DEFAULT_TEST_URL,
  materializeRelayChainNodes,
  parseNodeUrlLines,
  resolveBuiltinPolicyGroups,
  sanitizeClashProxiesForOutput,
  stripInternalProxyFields,
  type BuiltinGeneratorOptions,
} from '../../core/client-shared.js';
import {
  DEFAULT_RELAY_GROUP,
  DEFAULT_SELECT_GROUP,
  GEOX_URLS,
  RELAY_CHAIN_GROUP,
} from '../../templates/builtin-rules-provider.js';
import type { RegionPolicyGroup } from '../../core/region-groups.js';
import { applyClashBaseConfigOverride, buildVisualRulesAndProviders } from '../../core/visual-rules-builder.js';
import * as yaml from 'js-yaml';

/**
 * 递归清理对象中所有字符串的控制字符
 */
function deepCleanControlChars<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return cleanControlChars(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepCleanControlChars(item)) as T;
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      cleaned[cleanControlChars(key)] = deepCleanControlChars(value);
    }
    return cleaned as T;
  }

  return obj;
}

/**
 * 将内部策略组规范化为标准 Clash/Mihomo 顶层字段。
 * 内置策略组工厂使用 `options: { url, interval, tolerance }` 作为跨内核中间结构，
 * 输出到 Clash YAML 时必须拍平到顶层，且为 url-test / fallback 补齐默认测速参数。
 */
function normalizeClashProxyGroups(proxyGroups: RegionPolicyGroup[]): Array<Record<string, unknown>> {
  return proxyGroups.map((group) => {
    const { options: groupOptions, ...rest } = group;
    const normalized: Record<string, unknown> = { ...rest };
    if (groupOptions && typeof groupOptions === 'object') {
      if (groupOptions.url !== undefined && normalized.url === undefined) normalized.url = groupOptions.url;
      if (groupOptions.interval !== undefined && normalized.interval === undefined) {
        normalized.interval = groupOptions.interval;
      }
      if (groupOptions.tolerance !== undefined && normalized.tolerance === undefined) {
        normalized.tolerance = groupOptions.tolerance;
      }
      if (groupOptions.lazy !== undefined && normalized.lazy === undefined) normalized.lazy = groupOptions.lazy;
    }
    if (normalized.type === 'url-test' || normalized.type === 'fallback') {
      if (!normalized.url) normalized.url = DEFAULT_TEST_URL;
      if (!normalized.interval) normalized.interval = 300;
      if (normalized.lazy === undefined) normalized.lazy = true;
      if (normalized.type === 'url-test' && normalized.tolerance === undefined) normalized.tolerance = 50;
    }
    return normalized;
  });
}

/**
 * 生成内置 Clash 配置
 */
export function generateBuiltinClashConfig(nodeList: string, options: BuiltinGeneratorOptions = {}): string {
  const { userAgent = '', hiddifyCompatible = false } = options;
  const enableMihomoSyntax = Boolean(options.isMeta) || isMetaCore(userAgent, options.searchParams);
  const isHiddifyClient = hiddifyCompatible || /hiddify/i.test(userAgent || '');
  // Stash 通过 #SUBSCRIBED <url> 注释行识别订阅地址以支持自动更新
  const isStashClient = /stash/i.test(userAgent || '');
  const isLegacyClashClient = /clashforwindows|clash[-.]for[-.]windows|\bcfw\b|clashx(?!\.meta)/i.test(userAgent || '');
  const preferMrsRules =
    options.preferMrsRules !== undefined ? Boolean(options.preferMrsRules) : !isStashClient && !isLegacyClashClient;

  const nodeUrls = parseNodeUrlLines(nodeList);
  const proxies = deepCleanControlChars(urlsToClashProxies(nodeUrls, options));
  deduplicateProxyNames(proxies);

  if (proxies.length === 0) {
    return '# No valid proxies found\nproxies: []\n';
  }

  // 生成 YAML
  try {
    const {
      smartPreset,
      isRelay,
      customVisualRules,
      advancedBaseConfig,
      proxyGroups: resolvedGroups,
    } = resolveBuiltinPolicyGroups(proxies, options);

    const clashApiFields: Record<string, unknown> = advancedBaseConfig?.enableClashApi
      ? {
          'external-controller': advancedBaseConfig.externalController || '0.0.0.0:9090',
          'external-ui': 'ui',
          ...(advancedBaseConfig.externalUiDownloadUrl
            ? { 'external-ui-url': advancedBaseConfig.externalUiDownloadUrl }
            : {}),
        }
      : {
          'external-controller': '127.0.0.1:9090',
        };

    if (options.multiSocks?.enabled && options.multiSocks.lite && !isHiddifyClient) {
      const bindings = buildMultiSocksBindings(proxies, options.multiSocks);
      const listeners = buildMihomoSocksListeners(bindings);
      const liteConfig = buildLiteMultiSocksClashConfig({
        proxies,
        listeners,
        listen: options.multiSocks.listen,
        clashApiFields,
        managedConfigUrl: options.managedConfigUrl,
      });
      let liteYaml = yaml.dump(liteConfig, CLASH_YAML_DUMP_OPTIONS);
      if (isStashClient && options.managedConfigUrl && String(options.managedConfigUrl).trim()) {
        liteYaml = `#SUBSCRIBED ${options.managedConfigUrl}\n${liteYaml}`;
      }
      return cleanControlChars(liteYaml);
    }

    let proxyGroups = resolvedGroups;
    let ruleProviders: Record<string, unknown>;
    let clashRules: string[];

    if (isHiddifyClient) {
      // Hiddify 4.x 的 Clash 转 sing-box 解析对 rule-providers 兼容性较差，
      // 自动识别为 Hiddify 时降级为纯 MATCH 规则，避免导入时报 unable to determine config format。
      ruleProviders = {};
      clashRules = [`MATCH,${isRelay ? DEFAULT_RELAY_GROUP : DEFAULT_SELECT_GROUP}`];
    } else {
      const visualOutput = buildVisualRulesAndProviders('clash', {
        ...options,
        smartPreset,
        enableRelay: isRelay,
        customVisualRules,
        preferMrs: preferMrsRules,
      });
      ruleProviders = visualOutput.clashProviders;
      clashRules = visualOutput.rules.filter((r): r is string => typeof r === 'string');
    }

    let publicProxies: Array<Record<string, unknown>> = sanitizeClashProxiesForOutput(proxies);
    if (isRelay && enableMihomoSyntax) {
      const relayGroup = proxyGroups.find((group) => group.name === RELAY_CHAIN_GROUP);
      if (relayGroup) {
        const relayConfig = materializeRelayChainNodes({
          nameKey: 'name',
          linkKey: 'dialer-proxy',
          publicItems: publicProxies,
          proxyGroups,
          allProxiesForPrune: proxies,
        });
        publicProxies = relayConfig.items;
        proxyGroups = relayConfig.proxyGroups;
      }
    }

    if (options.customDnsOverride && String(options.customDnsOverride).trim()) {
      const hasDnsExit = String(options.customDnsOverride).includes(DNS_PROXY_GROUP);
      if (!hasDnsExit) {
        proxyGroups = proxyGroups.filter((g) => g.name !== DNS_PROXY_GROUP);
      }
    }

    // 基础配置：安全默认值，不再依赖外部配置覆盖即可避免 DNS 递归。
    const dnsConfig = resolveSafeDnsConfig(options.customDnsOverride || '', {
      mode: options.dnsMode,
      proxyGroup: DNS_PROXY_GROUP,
      subscriptionDnsPolicies: options.subscriptionDnsPolicies || [],
    });

    let config = createBaseClashConfig({
      dns: dnsConfig,
      proxies: publicProxies,
      proxyGroups: normalizeClashProxyGroups(proxyGroups),
      ruleProviders: ruleProviders as Record<string, Record<string, unknown>>,
      rules: clashRules,
      managedConfigUrl: options.managedConfigUrl,
      extraTopLevel: {
        ...clashApiFields,
        // GEO 数据库改走 jsDelivr 镜像，避免默认 GitHub 地址在大陆不可达时 GEOIP,CN,DIRECT 静默失效
        'geox-url': { ...GEOX_URLS },
      },
    });

    if (advancedBaseConfig?.baseConfig?.clash) {
      config = applyClashBaseConfigOverride(config, advancedBaseConfig.baseConfig.clash);
    }

    if (options.multiSocks?.enabled) {
      const bindings = buildMultiSocksBindings(proxies, options.multiSocks);
      const listeners = buildMihomoSocksListeners(bindings);
      if (listeners.length > 0) {
        config.listeners = listeners;
      }
      if (options.multiSocks.listen === '0.0.0.0') {
        config['allow-lan'] = true;
        config['bind-address'] = '*';
      }
    }

    let yamlStr = yaml.dump(config, CLASH_YAML_DUMP_OPTIONS);

    // Stash 首行输出 #SUBSCRIBED <订阅 URL> 以启用订阅自动更新
    if (isStashClient && options.managedConfigUrl && String(options.managedConfigUrl).trim()) {
      yamlStr = `#SUBSCRIBED ${options.managedConfigUrl}\n${yamlStr}`;
    }

    // 最终清理，确保输出没有控制字符
    return cleanControlChars(yamlStr);
  } catch (e) {
    console.error('[BuiltinClash] Generation failed:', e);
    // Fallback: 至少返回包含节点的有效 YAML 结构，而不是传回会导致 Clash 报错的 Base64
    const fallbackProxies = Array.isArray(proxies) ? stripInternalProxyFields(proxies) : [];
    const selectGroup = options.enableRelay ? DEFAULT_RELAY_GROUP : DEFAULT_SELECT_GROUP;
    const fallbackYaml =
      `proxies:\n${fallbackProxies.map((p) => `  - ${JSON.stringify(p)}`).join('\n')}\n` +
      `proxy-groups:\n  - name: ${selectGroup}\n    type: select\n    proxies: ${JSON.stringify(fallbackProxies.map((p) => p.name))}\n` +
      `rules:\n  - MATCH,${selectGroup}\n`;
    return fallbackYaml;
  }
}

/**
 * 仅生成代理列表（不包含完整配置）
 */
export function generateProxiesOnly(nodeList: string): string {
  const proxies = deepCleanControlChars(urlsToClashProxies(parseNodeUrlLines(nodeList)));
  deduplicateProxyNames(proxies);

  try {
    const publicProxies = stripInternalProxyFields(proxies);
    const yamlStr = yaml.dump(
      { proxies: publicProxies },
      {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      },
    );

    return cleanControlChars(yamlStr);
  } catch {
    const fallbackProxies = Array.isArray(proxies) ? stripInternalProxyFields(proxies) : [];
    return `proxies:\n${fallbackProxies.map((p) => `  - ${JSON.stringify(p)}`).join('\n')}\n`;
  }
}
