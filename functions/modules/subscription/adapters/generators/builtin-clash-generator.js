/**
 * 内置 Clash 配置生成器
 * 不依赖外部 subconverter，直接将节点 URL 转换为完整 Clash 配置
 * 支持 dialer-proxy、reality-opts 等特殊参数
 */

import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import { cleanControlChars } from '../../core/name-utils.js';
import { isMetaCore } from '../../core/user-agent-utils.js';
import { DNS_PROXY_GROUP, resolveSafeDnsConfig } from '../../security/safe-dns.js';
import {
  CLASH_YAML_DUMP_OPTIONS,
  createBaseClashConfig,
  deduplicateProxyNames,
  DEFAULT_TEST_URL,
  materializeRelayChainNodes,
  parseNodeUrlLines,
  resolveBuiltinPolicyGroups,
  stripInternalProxyFields,
} from '../../core/client-shared.js';
import {
  DEFAULT_RELAY_GROUP,
  DEFAULT_SELECT_GROUP,
  GEOX_URLS,
  getBuiltinRules,
  getRemoteProviderDefinitions,
} from '../../templates/builtin-rules-provider.js';
import { applyClashBaseConfigOverride, buildVisualRulesAndProviders } from '../../core/visual-rules-builder.js';
import * as yaml from 'js-yaml';

/**
 * 递归清理对象中所有字符串的控制字符
 * @param {any} obj - 输入对象
 * @returns {any} 清理后的对象
 */
function deepCleanControlChars(obj) {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return cleanControlChars(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepCleanControlChars(item));
  }

  if (typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      cleaned[cleanControlChars(key)] = deepCleanControlChars(value);
    }
    return cleaned;
  }

  return obj;
}

/**
 * 将内部策略组规范化为标准 Clash/Mihomo 顶层字段。
 * 内置策略组工厂使用 `options: { url, interval, tolerance }` 作为跨内核中间结构，
 * 输出到 Clash YAML 时必须拍平到顶层，且为 url-test / fallback 补齐默认测速参数。
 * @param {Object[]} proxyGroups
 * @returns {Object[]}
 */
function normalizeClashProxyGroups(proxyGroups) {
  return proxyGroups.map((group) => {
    const { options: groupOptions, ...rest } = group;
    const normalized = { ...rest };
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
    }
    return normalized;
  });
}

/**
 * 生成内置 Clash 配置
 * @param {string} nodeList - 节点列表（换行分隔的 URL）
 * @param {Object} options - 配置选项
 * @returns {string} Clash YAML 配置
 */
export function generateBuiltinClashConfig(nodeList, options = {}) {
  const {
    ruleLevel = 'std', // [New] 支持 base, std, full
    userAgent = '',
    hiddifyCompatible = false,
  } = options;
  const enableMihomoSyntax = Boolean(options.isMeta) || isMetaCore(userAgent, options.searchParams);
  const isHiddifyClient = hiddifyCompatible || /hiddify/i.test(userAgent || '');
  // Stash 通过 #SUBSCRIBED <url> 注释行识别订阅地址以支持自动更新
  const isStashClient = /stash/i.test(userAgent || '');

  const nodeUrls = parseNodeUrlLines(nodeList);
  let proxies = deepCleanControlChars(urlsToClashProxies(nodeUrls, options));
  deduplicateProxyNames(proxies);

  if (proxies.length === 0) {
    return '# No valid proxies found\nproxies: []\n';
  }

  // 生成 YAML
  try {
    const {
      levelKey,
      bt,
      useVisualRules,
      proxyGroups: resolvedGroups,
    } = resolveBuiltinPolicyGroups(proxies, options, { allowVisualRules: !isHiddifyClient });

    let proxyGroups = resolvedGroups;
    let ruleProviders;
    let clashRules;

    if (useVisualRules) {
      const visualOutput = buildVisualRulesAndProviders('clash', { ...options, builtinTransform: bt });
      ruleProviders = visualOutput.clashProviders;
      clashRules = visualOutput.rules;
    } else {
      const rawRules = isHiddifyClient ? ['MATCH,🚀 节点选择'] : getBuiltinRules(levelKey, 'clash', options);

      // 提取远程 Provider 定义。Hiddify 4.x 的 Clash 转 sing-box 解析对 rule-providers 兼容性较差，
      // 自动识别为 Hiddify 时降级为纯 MATCH 规则，避免导入时报 unable to determine config format。
      ruleProviders = isHiddifyClient ? {} : getRemoteProviderDefinitions('clash', rawRules, options);

      // 转换规则行为最终字符串
      clashRules = rawRules
        .map((r) => {
          if (typeof r === 'string') return r;
          if (r.type === 'rule-provider') return `RULE-SET,${r.provider},${r.target}`;
          return null;
        })
        .filter(Boolean);
    }

    let publicProxies = stripInternalProxyFields(proxies);
    if (!useVisualRules && levelKey === 'RELAY' && enableMihomoSyntax) {
      const relayGroup = proxyGroups.find((group) => group.name === '🔗 链式代理');
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

    const clashApiFields = bt?.enableClashApi
      ? {
          'external-controller': bt.externalController || '0.0.0.0:9090',
          'external-ui': 'ui',
          ...(bt.externalUiDownloadUrl ? { 'external-ui-url': bt.externalUiDownloadUrl } : {}),
        }
      : {
          'external-controller': '127.0.0.1:9090',
        };

    let config = createBaseClashConfig({
      dns: dnsConfig,
      proxies: publicProxies,
      proxyGroups: normalizeClashProxyGroups(proxyGroups),
      ruleProviders,
      rules: clashRules,
      managedConfigUrl: options.managedConfigUrl,
      extraTopLevel: {
        ...clashApiFields,
        // GEO 数据库改走 jsDelivr 镜像，避免默认 GitHub 地址在大陆不可达时 GEOIP,CN,DIRECT 静默失效
        'geox-url': { ...GEOX_URLS },
      },
    });

    if (bt?.baseConfig?.clash) {
      config = applyClashBaseConfigOverride(config, bt.baseConfig.clash);
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
    const selectGroup = (ruleLevel || '').toUpperCase() === 'RELAY' ? DEFAULT_RELAY_GROUP : DEFAULT_SELECT_GROUP;
    const fallbackYaml =
      `proxies:\n${fallbackProxies.map((p) => `  - ${JSON.stringify(p)}`).join('\n')}\n` +
      `proxy-groups:\n  - name: ${selectGroup}\n    type: select\n    proxies: ${JSON.stringify(fallbackProxies.map((p) => p.name))}\n` +
      `rules:\n  - MATCH,${selectGroup}\n`;
    return fallbackYaml;
  }
}

/**
 * 仅生成代理列表（不包含完整配置）
 * @param {string} nodeList - 节点列表
 * @returns {string} 仅包含 proxies 部分的 YAML
 */
export function generateProxiesOnly(nodeList) {
  let proxies = deepCleanControlChars(urlsToClashProxies(parseNodeUrlLines(nodeList)));
  deduplicateProxyNames(proxies);

  try {
    const publicProxies = stripInternalProxyFields(proxies);
    let yamlStr = yaml.dump(
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
