import * as yaml from 'js-yaml';
import {
  buildMihomoSocksListeners,
  buildMultiSocksBindings,
  type EffectiveMultiSocksConfig,
} from '@misub/core/domain/multi-socks.js';
import {
  normalizeUnifiedTemplateModel,
  type TemplateRule,
  type TemplateRuleObject,
  type UnifiedTemplateModelInput,
} from '../template-model.js';
import { DNS_PROXY_GROUP, resolveSafeDnsConfig } from '../../security/safe-dns.js';
import { applyMihomoChainProxy } from '../../core/mihomo-chain-proxy.js';
import { GEOX_URLS, GH_PROXY_BASE, pinRemoteRuleUrl } from '../builtin-rules-provider.js';
import {
  CLASH_YAML_DUMP_OPTIONS,
  createBaseClashConfig,
  filterAutoGroupMembers,
  stripInternalProxyFields,
} from '../../core/client-shared.js';

export interface RenderClashOptions {
  isChinaClient?: boolean;
  multiSocks?: EffectiveMultiSocksConfig | null;
  [key: string]: unknown;
}

function asRuleObject(rule: TemplateRule): TemplateRuleObject | null {
  return typeof rule === 'object' && rule !== null ? rule : null;
}

function mapGroupType(type: unknown): 'url-test' | 'fallback' | 'load-balance' | 'select' {
  const normalized = String(type || '')
    .trim()
    .toLowerCase();
  if (
    normalized === 'url-test' ||
    normalized === 'fallback' ||
    normalized === 'load-balance' ||
    normalized === 'select'
  ) {
    return normalized;
  }
  return 'select';
}

const ACL4SSR_ROOT_PROVIDER_FILES = new Set([
  'apple',
  'banad',
  'baneasylist',
  'baneasylistchina',
  'baneasyprivacy',
  'banprogramad',
  'chinacompanyip',
  'chinadomain',
  'chinaip',
  'chinaipv6',
  'chinamedia',
  'download',
  'localareanetwork',
  'mjj',
  'proxylite',
  'proxygfwlist',
  'proxymedia',
  'unban',
]);

const ACL4SSR_IPCIDR_PROVIDER_FILES = new Set(['amazonip', 'chinacompanyip', 'chinaip', 'chinaipv6', 'netflixip']);

const ACL4SSR_ROOT_LIST_ONLY_FILES = new Set([
  'localareanetwork',
  'banad',
  'banprogramad',
  'chinamedia',
  'proxymedia',
  'chinadomain',
  'download',
  'unban',
]);

function stripGhProxyPrefix(sourceUrl: unknown): string {
  const raw = String(sourceUrl || '');
  return raw.startsWith(GH_PROXY_BASE) ? raw.slice(GH_PROXY_BASE.length) : raw;
}

function toClashRuleProviderUrl(sourceUrl: string): string {
  const cleanSourceUrl = stripGhProxyPrefix(sourceUrl);
  if (!/^https?:\/\//i.test(cleanSourceUrl)) return sourceUrl;

  try {
    const url = new URL(cleanSourceUrl);
    // 兼容已被 CDN 镜像重写过的地址（cdn.jsdelivr.net/gh/OWNER/REPO@REF/PATH）。
    // 若只认 raw.githubusercontent.com，镜像后的链接会跳过 .list -> .yaml 映射，
    // 导致规则源指向不存在的 provider 文件。
    const mirrorMatch =
      url.hostname === 'cdn.jsdelivr.net' ? url.pathname.match(/^\/gh\/([^/@]+)\/([^/@]+)@([^/]+)\/(.+)$/) : null;
    const pathParts = mirrorMatch
      ? [mirrorMatch[1], mirrorMatch[2], mirrorMatch[3], ...mirrorMatch[4].split('/')]
      : url.pathname.split('/').filter(Boolean);

    const isGithubRaw = /raw\.githubusercontent\.com$/i.test(url.hostname);
    if (!isGithubRaw && !mirrorMatch) return sourceUrl;

    const owner = pathParts[0] || '';
    const repo = pathParts[1] || '';
    if (owner.toLowerCase() !== 'acl4ssr' || repo.toLowerCase() !== 'acl4ssr') return sourceUrl;

    // 统一以「仓库内路径」为基准判断与改写，避免镜像前缀干扰
    const repoPath = '/' + pathParts.slice(3).join('/');
    if (!/\/Clash\/.*\.(list|txt)$/i.test(repoPath)) return sourceUrl;

    const fileName =
      repoPath
        .split('/')
        .pop()
        ?.replace(/\.(list|txt)$/i, '') || '';
    if (/\/Clash\/[^/]+\.(list|txt)$/i.test(repoPath) && ACL4SSR_ROOT_LIST_ONLY_FILES.has(fileName.toLowerCase())) {
      return sourceUrl;
    }

    let newPath: string;
    if (/\/Clash\/Ruleset\//i.test(repoPath)) {
      newPath = repoPath.replace(/\/Clash\/Ruleset\//i, '/Clash/Providers/Ruleset/').replace(/\.(list|txt)$/i, '.yaml');
    } else if (ACL4SSR_ROOT_PROVIDER_FILES.has(fileName.toLowerCase())) {
      newPath = repoPath.replace(/\/Clash\//i, '/Clash/Providers/').replace(/\.(list|txt)$/i, '.yaml');
    } else {
      newPath = repoPath.replace(/\/Clash\//i, '/Clash/Providers/Ruleset/').replace(/\.(list|txt)$/i, '.yaml');
    }

    if (mirrorMatch) {
      return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${mirrorMatch[3]}${newPath}`;
    }
    return `https://raw.githubusercontent.com/${owner}/${repo}/${pathParts[2]}${newPath}`;
  } catch {
    return sourceUrl;
  }
}

function isMrsProviderUrl(providerUrl: string): boolean {
  try {
    return /\.mrs$/i.test(new URL(stripGhProxyPrefix(providerUrl)).pathname);
  } catch {
    return false;
  }
}

function getRuleProviderBehavior(providerUrl: string): 'ipcidr' | 'domain' | 'classical' {
  try {
    const pathname = new URL(stripGhProxyPrefix(providerUrl)).pathname;
    // Mihomo 的 mrs 仅支持 domain / ipcidr，配 classical 会在运行期报
    // ErrInvalidFormat，因此按规则来源路径推断：geoip 走 ipcidr，其余走 domain。
    if (/\.mrs$/i.test(pathname)) {
      return /\/geoip\//i.test(pathname) ? 'ipcidr' : 'domain';
    }
    const fileName =
      pathname
        .split('/')
        .pop()
        ?.replace(/\.(yaml|yml|list|txt|conf)$/i, '') || '';
    if (ACL4SSR_IPCIDR_PROVIDER_FILES.has(fileName.toLowerCase())) return 'ipcidr';
  } catch {}
  return 'classical';
}

function mapRule(rule: TemplateRule, ruleProviderMap: Map<string, string>): string | null {
  if (typeof rule === 'string') return rule;
  const type = String(rule.type || '').toUpperCase();
  if (!type) return null;
  if (type === 'MATCH' || type === 'FINAL') return `MATCH,${rule.policy}`;
  if (type === 'GEOIP') return `GEOIP,${rule.value || 'CN'},${rule.policy}`;
  if (type === 'RULE-SET') {
    const providerName = rule.value ? ruleProviderMap.get(rule.value) : undefined;
    return `RULE-SET,${providerName || rule.value},${rule.policy}`;
  }
  return `${type},${rule.value},${rule.policy}`;
}

export function renderClashFromTemplateModel(
  model: UnifiedTemplateModelInput,
  options: RenderClashOptions = {},
): string {
  const { isChinaClient = false } = options;
  const normalizedModel = normalizeUnifiedTemplateModel(model);

  // 所有客户端都保留链式策略组；仅 Mihomo/Meta 展开节点级 dialer-proxy。
  if (Array.isArray(normalizedModel.extras?.chainProxy)) {
    applyMihomoChainProxy(normalizedModel, {
      enableDialerProxy: Boolean(normalizedModel.meta?.isMeta),
    });
  }

  const ruleProviders: Record<string, Record<string, unknown>> = {};
  const ruleProviderMap = new Map<string, string>();
  let providerCounter = 0;

  normalizedModel.rules.forEach((rawRule) => {
    const rule = asRuleObject(rawRule);
    if (!rule) return;
    const type = String(rule.type || '').toUpperCase();
    if (type !== 'RULE-SET' || !rule.value || !/^https?:\/\//i.test(rule.value)) return;

    // 按请求方地理位置解析规则源下载链路（国内 gh-proxy 加速 / 国外直连）
    const providerUrl = pinRemoteRuleUrl(toClashRuleProviderUrl(rule.value), { isChinaClient });
    if (ruleProviderMap.has(providerUrl)) return;

    let nameHint = 'rs';
    try {
      const urlPath = new URL(stripGhProxyPrefix(providerUrl)).pathname;
      const fileName =
        urlPath
          .split('/')
          .pop()
          ?.replace(/\.(yaml|yml|list|txt|conf|mrs)$/i, '') || '';
      if (fileName) {
        nameHint = fileName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      }
    } catch {}

    const providerName = `${nameHint}_${providerCounter++}`;
    ruleProviderMap.set(providerUrl, providerName);
    const usesTextList = /\.(list|txt)$/i.test(providerUrl);
    const usesMrs = isMrsProviderUrl(providerUrl);
    ruleProviders[providerName] = {
      type: 'http',
      behavior: getRuleProviderBehavior(providerUrl),
      url: providerUrl,
      path: `./ruleset/${providerName}.${usesTextList ? 'list' : usesMrs ? 'mrs' : 'yaml'}`,
      interval: 86400,
      ...(usesTextList ? { format: 'text' } : {}),
      ...(usesMrs ? { format: 'mrs' } : {}),
    };
  });

  const multiSocksListeners = options.multiSocks?.enabled
    ? buildMihomoSocksListeners(buildMultiSocksBindings(normalizedModel.proxies || [], options.multiSocks))
    : [];

  const config = createBaseClashConfig({
    dns: resolveSafeDnsConfig(normalizedModel.settings?.customDnsOverride, {
      mode: normalizedModel.settings?.dnsMode,
      proxyGroup: DNS_PROXY_GROUP,
    }),
    proxies: stripInternalProxyFields(normalizedModel.proxies || []),
    proxyGroups: normalizedModel.groups
      .filter(
        (group) =>
          (Array.isArray(group.members) && group.members.length > 0) ||
          (Array.isArray(group.filters) && group.filters.length > 0),
      )
      .map((group) => {
        const mappedType = mapGroupType(group.type);
        return {
          name: group.name,
          type: mappedType,
          proxies: filterAutoGroupMembers(mappedType, group.members),
          filter: Array.isArray(group.filters) && group.filters.length > 0 ? group.filters.join('|') : undefined,
          ...group.options,
        };
      }),
    ruleProviders,
    rules: normalizedModel.rules
      .map((rawRule) => {
        const rule = asRuleObject(rawRule);
        if (!rule || String(rule.type || '').toUpperCase() !== 'RULE-SET' || !rule.value) {
          return mapRule(rawRule, ruleProviderMap);
        }
        return mapRule(
          { ...rule, value: pinRemoteRuleUrl(toClashRuleProviderUrl(rule.value), { isChinaClient }) },
          ruleProviderMap,
        );
      })
      .filter((r): r is string => Boolean(r)),
    managedConfigUrl: normalizedModel.settings.managedConfigUrl || '',
    extraTopLevel: {
      'external-controller': '127.0.0.1:9090',
      // GEO 数据库走 jsDelivr 镜像，保证模板中 GEOIP/GEOSITE 规则与 geosite:* DNS 策略在大陆可用
      'geox-url': { ...GEOX_URLS },
      ...(multiSocksListeners.length > 0 ? { listeners: multiSocksListeners } : {}),
    },
  });

  return yaml.dump(config, CLASH_YAML_DUMP_OPTIONS);
}
