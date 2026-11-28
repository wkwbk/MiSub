import type {
  AdvancedBaseConfig,
  ClashProxy,
  CustomVisualRulesConfig,
  NodeIRBatchParseOptions,
  NormalizedCustomVisualRules,
  SmartPreset,
} from '@misub/core/types.js';
import type { BoundRequestContext, StorageAdapter } from '../../../types.js';
import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import {
  deduplicateNamesCollisionFree,
  type EffectiveMultiSocksConfig,
  type MihomoSocksListener,
  type MultiSocksListen,
} from '@misub/core/domain/multi-socks.js';
import { cleanControlChars } from './name-utils.js';
import {
  DEFAULT_RELAY_GROUP,
  DEFAULT_SELECT_GROUP,
  pruneProxyGroups,
  RELAY_CHAIN_GROUP,
  RELAY_ENTRY_GROUP,
  type BuiltinRuleEntry,
  type ClashRuleProviderDefinition,
  type SingboxRuleSetDefinition,
} from '../templates/builtin-rules-provider.js';
import { buildVisualPolicyGroups, type VisualRulesOptions } from './visual-rules-builder.js';
import { normalizeAdvancedBaseConfig, normalizeCustomVisualRules } from '@misub/core/domain/visual-rules-catalog.js';
import type { SingboxDnsConfig, SubscriptionDnsPolicyEntry } from '../security/safe-dns.js';
import { cloneSnifferConfig } from './sniffing-config.js';
import type { RegionGroupNode, RegionPolicyGroup } from './region-groups.js';
import type { RegionOverrideRule, TemplateProxy, UnifiedTemplateModel } from '../templates/template-model.js';
import type { ShadowrocketSourceItem } from './shadowrocket-order.js';
import type { ShadowrocketRuleBundleEntry } from './shadowrocket-rule-bundle.js';

export interface BuiltinGeneratorOptions extends NodeIRBatchParseOptions {
  injectSmartGroups?: boolean;
  smartPreset?: SmartPreset | string;
  enableRelay?: boolean;
  customVisualRules?: Partial<CustomVisualRulesConfig> | Record<string, unknown> | null;
  advancedBaseConfig?: Partial<AdvancedBaseConfig> | Record<string, unknown> | null;
  userAgent?: string;
  hiddifyCompatible?: boolean;
  searchParams?: URLSearchParams;
  isMeta?: boolean;
  customDnsOverride?: string;
  dnsMode?: string;
  subscriptionDnsPolicies?: SubscriptionDnsPolicyEntry[];
  managedConfigUrl?: string;
  interval?: number;
  fileName?: string;
  isChinaClient?: boolean;
  regionOverrides?: RegionOverrideRule[] | Record<string, unknown>;
  sources?: ShadowrocketSourceItem[];
  preferredProxyKeys?: string[];
  compactNames?: boolean;
  ruleBundle?: ShadowrocketRuleBundleEntry[] | null;
  multiSocks?: EffectiveMultiSocksConfig | null;
  preferMrsRules?: boolean;
  storageAdapter?: StorageAdapter | null;
  waitUntil?: BoundRequestContext['waitUntil'] | null;
  [key: string]: unknown;
}

export const DEFAULT_TEST_URL = 'http://www.gstatic.com/generate_204';
export const QURE_ICON_REPO = 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color';

export const POLICY_GROUP_ICONS: Readonly<Record<string, string>> = Object.freeze({
  [DEFAULT_SELECT_GROUP]: `${QURE_ICON_REPO}/Proxy.png`,
  [DEFAULT_RELAY_GROUP]: `${QURE_ICON_REPO}/Proxy.png`,
  [RELAY_CHAIN_GROUP]: `${QURE_ICON_REPO}/Proxy.png`,
  [RELAY_ENTRY_GROUP]: `${QURE_ICON_REPO}/Airport.png`,
  '♻️ 自动选择': `${QURE_ICON_REPO}/Speedtest.png`,
  '🔯 故障转移': `${QURE_ICON_REPO}/Relay.png`,
  '🎬 视频广告': `${QURE_ICON_REPO}/Reject.png`,
  '🎥 流媒体': `${QURE_ICON_REPO}/Video.png`,
  '🍎 Apple': `${QURE_ICON_REPO}/Apple.png`,
  'Ⓜ️ Microsoft': `${QURE_ICON_REPO}/Microsoft.png`,
  '📲 Telegram': `${QURE_ICON_REPO}/Telegram.png`,
  '🎧 Spotify': `${QURE_ICON_REPO}/Spotify.png`,
  '🇭🇰 香港节点': `${QURE_ICON_REPO}/Hong_Kong.png`,
  '🇹🇼 台湾节点': `${QURE_ICON_REPO}/Taiwan.png`,
  '🇯🇵 日本节点': `${QURE_ICON_REPO}/Japan.png`,
  '🇸🇬 狮城节点': `${QURE_ICON_REPO}/Singapore.png`,
  '🇺🇸 美国节点': `${QURE_ICON_REPO}/United_States.png`,
  '🇰🇷 韩国节点': `${QURE_ICON_REPO}/South_Korea.png`,
  '🇬🇧 英国节点': `${QURE_ICON_REPO}/United_Kingdom.png`,
});

export const CLASH_YAML_DUMP_OPTIONS = Object.freeze({
  indent: 2,
  lineWidth: -1,
  noRefs: true,
  quotingType: '"' as const,
  forceQuotes: false,
});

const SINGBOX_TUN_INBOUND = Object.freeze({
  type: 'tun',
  tag: 'tun-in',
  address: ['172.19.0.1/30'],
  auto_route: true,
  strict_route: true,
  stack: 'mixed',
});

export const SINGBOX_LOCAL_ROUTE_RULES = Object.freeze([
  { ip_cidr: ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'], outbound: 'DIRECT' },
  { domain_suffix: ['localhost'], outbound: 'DIRECT' },
]);

const AUTO_GROUP_TYPES = new Set(['url-test', 'fallback', 'load-balance', 'urltest']);
const DIRECT_POLICY_TOKENS = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * 解析换行分隔的节点 URL 列表
 */
export function parseNodeUrlLines(
  nodeList: string,
  { stripControl = true }: { stripControl?: boolean } = {},
): string[] {
  const raw = stripControl ? cleanControlChars(nodeList) : String(nodeList || '');
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/**
 * 解析统一模板模型中的代理列表（若模型未内联代理则回退解析 options.nodeList）
 */
export function resolveModelProxies(
  normalizedModel: UnifiedTemplateModel,
  options: { nodeList?: string; [key: string]: unknown } = {},
): TemplateProxy[] {
  if (Array.isArray(normalizedModel.proxies) && normalizedModel.proxies.length > 0) {
    return normalizedModel.proxies;
  }
  const nodeList = typeof options.nodeList === 'string' ? options.nodeList : '';
  return urlsToClashProxies(parseNodeUrlLines(nodeList, { stripControl: false })) as TemplateProxy[];
}

/**
 * 原地为代理数组生成唯一名称
 */
export function deduplicateProxyNames<T extends { name?: string }>(proxies: T[]): void {
  deduplicateNamesCollisionFree(proxies);
}

/**
 * 移除仅供内部分组使用的 metadata 字段
 */
export function stripInternalProxyFields<T extends Record<string, unknown>>(proxies: T[]): Array<Omit<T, 'metadata'>> {
  return (Array.isArray(proxies) ? proxies : []).map((proxy) => {
    if (!proxy || typeof proxy !== 'object' || !('metadata' in proxy)) return proxy;
    const { metadata: _metadata, ...publicProxy } = proxy;
    return publicProxy;
  });
}

/**
 * 清理 Clash/Mihomo 输出节点：移除内部 metadata，并在开启 ECH 时剔除冲突的 uTLS client-fingerprint
 */
export function sanitizeClashProxiesForOutput<T extends Record<string, unknown>>(
  proxies: T[],
  { stripEchFingerprintConflict = true }: { stripEchFingerprintConflict?: boolean } = {},
): Array<Record<string, unknown>> {
  return stripInternalProxyFields(proxies).map((proxy) => {
    if (!stripEchFingerprintConflict || !proxy || typeof proxy !== 'object') return proxy;
    const echOpts = asRecord(proxy['ech-opts']) || asRecord(proxy.echOpts);
    if (echOpts?.enable && ('client-fingerprint' in proxy || 'clientFingerprint' in proxy)) {
      const { 'client-fingerprint': _cf, clientFingerprint: _cfCamel, ...rest } = proxy as Record<string, unknown>;
      return rest;
    }
    return proxy;
  });
}

/**
 * 清理 INI 格式中的非法节点名字符
 */
export function sanitizeIniNodeName(
  name: string | undefined | null,
  { stripQuotesAndSemicolon = false }: { stripQuotesAndSemicolon?: boolean } = {},
): string {
  if (!name) return 'Untitled';
  let safe = cleanControlChars(name).replace(/,/g, ' ').replace(/=/g, '-');
  if (stripQuotesAndSemicolon) {
    safe = safe.replace(/;/g, ' ').replace(/["']/g, '');
  }
  safe = safe.replace(/\s+/g, ' ').trim();
  return safe || 'Untitled';
}

/**
 * 对 INI 参数值按需加双引号
 */
export function quoteIniValue(value: unknown, { emptyForFalsy = false }: { emptyForFalsy?: boolean } = {}): string {
  if (emptyForFalsy ? !value : value === undefined || value === null) return '';
  const strValue = String(value);
  if (/[,\s"=]/.test(strValue)) {
    return `"${strValue.replace(/"/g, '\\"')}"`;
  }
  return strValue;
}

/**
 * 过滤自动测速/负载均衡策略组中不允许出现的直连/拒绝策略
 */
export function filterAutoGroupMembers(type: string, members: unknown): string[] {
  const list = Array.isArray(members) ? members.filter((m): m is string => typeof m === 'string' && Boolean(m)) : [];
  if (!AUTO_GROUP_TYPES.has(String(type || '').toLowerCase())) {
    return list;
  }
  return list.filter((member) => !DIRECT_POLICY_TOKENS.has(String(member).toUpperCase()));
}

export interface ResolveBuiltinPolicyGroupsOptions extends VisualRulesOptions {}

export interface ResolveBuiltinPolicyGroupsResult {
  smartPreset: string;
  isRelay: boolean;
  customVisualRules: NormalizedCustomVisualRules;
  advancedBaseConfig: AdvancedBaseConfig;
  proxyGroups: RegionPolicyGroup[];
}

/**
 * 统一解析内置策略组拓扑（基于 smartPreset + customVisualRules 构建）
 */
export function resolveBuiltinPolicyGroups(
  proxies: RegionGroupNode[],
  options: ResolveBuiltinPolicyGroupsOptions & {
    advancedBaseConfig?: Partial<AdvancedBaseConfig> | Record<string, unknown> | null;
  } = {},
): ResolveBuiltinPolicyGroupsResult {
  const rawPreset = String(options.smartPreset || 'balanced')
    .trim()
    .toLowerCase();
  const smartPreset =
    rawPreset === 'minimal' || rawPreset === 'balanced' || rawPreset === 'full' ? rawPreset : 'balanced';
  const isRelay = Boolean(options.enableRelay);
  const customVisualRules = normalizeCustomVisualRules(options.customVisualRules, { smartPreset });
  const advancedBaseConfig = normalizeAdvancedBaseConfig(options.advancedBaseConfig);
  const proxyGroups = buildVisualPolicyGroups(proxies, {
    ...options,
    smartPreset,
    enableRelay: isRelay,
    customVisualRules,
  });

  return { smartPreset, isRelay, customVisualRules, advancedBaseConfig, proxyGroups };
}

/**
 * 为 Loon / Surge INI 渲染注入 RELAY 链式代理「🔗 中转节点 + 落地节点」分组对
 */
export function applyIniRelayGroupPair(groups: RegionPolicyGroup[], proxies: RegionGroupNode[]): RegionPolicyGroup[] {
  const nextGroups = groups.map((group) =>
    group.name === RELAY_CHAIN_GROUP ? { ...group, type: 'relay', proxies: [RELAY_ENTRY_GROUP, '落地节点'] } : group,
  );
  if (!nextGroups.some((group) => group.name === '落地节点')) {
    const proxyNames = proxies.map((proxy) => proxy.name);
    const entryIndex = nextGroups.findIndex((group) => group.name === RELAY_ENTRY_GROUP);
    const insertAt = entryIndex >= 0 ? entryIndex + 1 : nextGroups.length;
    nextGroups.splice(insertAt, 0, {
      name: '落地节点',
      type: 'select',
      proxies: ['♻️ 自动选择', '👋 手动切换', 'DIRECT', ...proxyNames],
    });
  }
  return pruneProxyGroups(nextGroups, proxies);
}

/**
 * 为 Clash/Mihomo 与 Sing-Box 展开链式代理落地副本
 */
export function materializeRelayChainNodes<T extends Record<string, unknown>>({
  nameKey,
  linkKey,
  linkTarget = RELAY_ENTRY_GROUP,
  publicItems,
  proxyGroups,
  allProxiesForPrune,
}: {
  nameKey: string;
  linkKey: string;
  linkTarget?: string;
  publicItems: T[];
  proxyGroups: RegionPolicyGroup[];
  allProxiesForPrune: RegionGroupNode[];
}): { items: T[]; proxyGroups: RegionPolicyGroup[] } {
  const chainItems = publicItems.map((item) => ({
    ...item,
    [nameKey]: `${RELAY_CHAIN_GROUP} - ${String(item[nameKey] || '')}`,
    [linkKey]: linkTarget,
  }));
  const chainNames = chainItems.map((item) => String(item[nameKey] || ''));

  const nextProxyGroups = proxyGroups
    .map((group) => (group.name === RELAY_CHAIN_GROUP ? { ...group, type: 'select', proxies: chainNames } : group))
    .filter(Boolean);

  const pruneCandidates: RegionGroupNode[] = [
    ...allProxiesForPrune,
    ...chainItems.map((item) => ({ ...item, name: String(item[nameKey] || '') })),
  ];

  return {
    items: [...publicItems, ...chainItems],
    proxyGroups: pruneProxyGroups(nextProxyGroups, pruneCandidates),
  };
}

export interface IniProxyGroupLike {
  name: string;
  type?: string;
  members?: string[];
  proxies?: string[];
  filters?: string[];
  options?: {
    url?: unknown;
    interval?: unknown;
    tolerance?: unknown;
    [key: string]: unknown;
  };
}

/**
 * 格式化 Loon / Surge INI `[Proxy Group]` 行
 */
export function formatIniProxyGroupLine(
  group: IniProxyGroupLike,
  {
    iconMap = null,
    fallbackEmptyDirect = false,
    includeFilters = false,
    useMembersField = false,
  }: {
    iconMap?: Readonly<Record<string, string>> | null;
    fallbackEmptyDirect?: boolean;
    includeFilters?: boolean;
    useMembersField?: boolean;
  } = {},
): string {
  const rawType = String(group.type || 'select').toLowerCase();
  let type = 'select';
  if (rawType === 'url-test') type = 'url-test';
  else if (rawType === 'fallback') type = 'fallback';
  else if (rawType === 'relay') type = 'relay';
  else if (rawType === 'load-balance') type = 'load-balance';

  const rawMembers = useMembersField ? group.members : group.proxies;
  const filtered = useMembersField
    ? filterAutoGroupMembers(type, rawMembers)
    : Array.isArray(rawMembers)
      ? rawMembers
      : [];
  const membersList = fallbackEmptyDirect && filtered.length === 0 ? ['DIRECT'] : filtered;
  const members = membersList.join(', ');

  const testUrl = group.options?.url || DEFAULT_TEST_URL;
  const interval = group.options?.interval || 300;
  const tolerance = group.options?.tolerance;
  const filter =
    includeFilters && Array.isArray(group.filters) && group.filters.length > 0 ? group.filters.join('|') : '';
  const icon = iconMap && iconMap[group.name] ? `, icon=${iconMap[group.name]}` : '';

  if (useMembersField) {
    if (type === 'url-test' || type === 'fallback') {
      const base = filter
        ? `${group.name} = ${type}, ${members}, url=${testUrl}, interval=${interval}, filter=${filter}`
        : `${group.name} = ${type}, ${members}, url=${testUrl}, interval=${interval}`;
      return tolerance ? `${base}, tolerance=${tolerance}` : base;
    }
    if (type === 'load-balance') {
      return filter
        ? `${group.name} = load-balance, ${members}, filter=${filter}, url=${testUrl}, interval=${interval}`
        : `${group.name} = load-balance, ${members}`;
    }
    return `${group.name} = select, ${members}`;
  }

  const extra =
    type === 'url-test' || type === 'fallback' ? `, url=${DEFAULT_TEST_URL}, interval=300, tolerance=50` : '';
  return `${group.name} = ${type}, ${members}${extra}${icon}`;
}

export interface BaseClashConfigInput {
  dns: Record<string, unknown>;
  proxies: Array<Record<string, unknown>>;
  proxyGroups: Array<Record<string, unknown>>;
  ruleProviders?: Record<string, ClashRuleProviderDefinition | Record<string, unknown>>;
  rules: Array<string | BuiltinRuleEntry>;
  managedConfigUrl?: string;
  extraTopLevel?: Record<string, unknown>;
}

/**
 * 构建 Clash / Mihomo 基础配置骨架
 */
export function createBaseClashConfig({
  dns,
  proxies,
  proxyGroups,
  ruleProviders,
  rules,
  managedConfigUrl = '',
  extraTopLevel = {},
}: BaseClashConfigInput): Record<string, unknown> {
  return {
    'mixed-port': 7890,
    'allow-lan': false,
    'bind-address': '127.0.0.1',
    ipv6: false,
    mode: 'rule',
    'log-level': 'info',
    'unified-delay': true,
    'tcp-concurrent': true,
    'find-process-mode': 'strict',
    'geodata-mode': true,
    'geodata-loader': 'memconservative',
    'geo-auto-update': true,
    'geo-update-interval': 24,
    ...extraTopLevel,
    sniffer: cloneSnifferConfig(),
    dns,
    proxies,
    'proxy-groups': proxyGroups,
    ...(ruleProviders && Object.keys(ruleProviders).length > 0 ? { 'rule-providers': ruleProviders } : {}),
    rules,
    profile: {
      'store-selected': true,
      'store-fake-ip': true,
      'subscription-url': managedConfigUrl || '',
    },
  };
}

/**
 * 构建纯多端口 SOCKS5 极简减重配置（移除远程规则集、嗅探与后台自动测速轮询）
 */
export function buildLiteMultiSocksClashConfig({
  proxies,
  listeners,
  listen = '127.0.0.1',
  clashApiFields = { 'external-controller': '127.0.0.1:9090' },
  managedConfigUrl = '',
}: {
  proxies: Array<Record<string, unknown>>;
  listeners: MihomoSocksListener[];
  listen?: MultiSocksListen;
  clashApiFields?: Record<string, unknown>;
  managedConfigUrl?: string;
}): Record<string, unknown> {
  const sanitizedProxies = sanitizeClashProxiesForOutput(proxies);
  const proxyNames = sanitizedProxies
    .map((proxy) => (typeof proxy.name === 'string' ? proxy.name : ''))
    .filter(Boolean);
  const allowLan = listen === '0.0.0.0';

  return {
    'mixed-port': 7890,
    'allow-lan': allowLan,
    'bind-address': allowLan ? '*' : '127.0.0.1',
    ipv6: false,
    mode: 'rule',
    'log-level': 'warning',
    'unified-delay': true,
    'tcp-concurrent': true,
    'find-process-mode': 'off',
    ...clashApiFields,
    dns: {
      enable: true,
      ipv6: false,
      'cache-algorithm': 'arc',
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.18.0.1/16',
      'default-nameserver': ['223.5.5.5', '119.29.29.29'],
      'proxy-server-nameserver': ['https://223.5.5.5/dns-query', 'https://120.53.53.53/dns-query'],
      nameserver: ['https://223.5.5.5/dns-query', 'https://120.53.53.53/dns-query'],
    },
    proxies: sanitizedProxies,
    'proxy-groups': [
      {
        name: DEFAULT_SELECT_GROUP,
        type: 'select',
        proxies: ['DIRECT', ...proxyNames],
      },
    ],
    rules: ['MATCH,DIRECT'],
    profile: {
      'store-selected': true,
      'store-fake-ip': true,
      'subscription-url': managedConfigUrl || '',
    },
    ...(listeners.length > 0 ? { listeners } : {}),
  };
}

export interface SingboxTlsConfig {
  enabled?: boolean;
  server_name?: string;
  insecure?: boolean;
  alpn?: unknown[];
  utls?: { enabled: boolean; fingerprint: unknown };
  reality?: { enabled: boolean; public_key: unknown; short_id: unknown };
  ech?: { enabled: boolean; query_server_name?: unknown; config?: string[] };
}

export interface SingboxOutbound extends Record<string, unknown> {
  tag: string;
  type: string;
  name?: string;
  tls?: SingboxTlsConfig;
  transport?: Record<string, unknown>;
}

function sanitizeSingboxTag(name: string | undefined | null): string {
  if (!name) return 'Untitled';
  const safe = cleanControlChars(name)
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
  return safe || 'Untitled';
}

function parseSingboxPort(port: unknown): number | undefined {
  const num = Number.parseInt(String(port), 10);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * 将内部 Clash/Template 代理对象统一转换为 Sing-Box outbound 对象
 */
export function buildSingboxOutbound(
  proxy: ClashProxy | TemplateProxy | Record<string, unknown>,
): SingboxOutbound | null {
  if (!proxy || !proxy.server || !proxy.port) return null;

  const type = String(proxy.type || '').toLowerCase();
  const tag = sanitizeSingboxTag(typeof proxy.name === 'string' ? proxy.name : undefined);
  const server = String(proxy.server);
  const port = parseSingboxPort(proxy.port);
  if (!port) return null;

  const outbound: SingboxOutbound = { tag, type: 'direct' };

  if (type === 'ss' || type === 'shadowsocks') {
    outbound.type = 'shadowsocks';
    outbound.server = server;
    outbound.server_port = port;
    outbound.method = proxy.cipher || 'aes-128-gcm';
    outbound.password = proxy.password || '';
    if (proxy.udp) outbound.udp_over_tcp = false;
    applySingboxShadowsocksPlugin(outbound, proxy);
  } else if (type === 'vmess') {
    outbound.type = 'vmess';
    outbound.server = server;
    outbound.server_port = port;
    outbound.uuid = proxy.uuid || '';
    outbound.security = proxy.cipher || 'auto';
    outbound.alter_id = Number.isFinite(Number(proxy.alterId)) ? Number(proxy.alterId) : 0;
    if (proxy.tls || proxy.sni || proxy.servername || proxy['skip-cert-verify'] || proxy.skipCertVerify) {
      outbound.tls = {
        enabled: true,
        server_name: String(proxy.sni || proxy.servername || server),
      };
      if (proxy.alpn) outbound.tls.alpn = Array.isArray(proxy.alpn) ? proxy.alpn : [proxy.alpn];
    }
    if (proxy.network === 'ws') {
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      outbound.transport = { type: 'ws' };
      if (wsOpts?.path) outbound.transport.path = wsOpts.path;
      if (wsHeaders?.Host) outbound.transport.headers = { Host: wsHeaders.Host };
    } else if (proxy.network === 'grpc') {
      const grpcOpts = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts);
      outbound.transport = {
        type: 'grpc',
        ...(grpcOpts?.['grpc-service-name'] || grpcOpts?.serviceName
          ? { service_name: grpcOpts?.['grpc-service-name'] || grpcOpts?.serviceName }
          : {}),
      };
    } else if (proxy.network === 'h2' || proxy.network === 'http') {
      const h2Opts = asRecord(proxy[`${proxy.network}-opts`]) || asRecord(proxy[`${proxy.network}Opts`]);
      outbound.transport = {
        type: 'http',
        ...(h2Opts?.host ? { host: Array.isArray(h2Opts.host) ? h2Opts.host : [h2Opts.host] } : {}),
        ...(h2Opts?.path ? { path: h2Opts.path } : {}),
      };
    } else if (proxy.network === 'httpupgrade') {
      const huOpts = asRecord(proxy['httpupgrade-opts']) || asRecord(proxy.httpupgradeOpts);
      outbound.transport = {
        type: 'httpupgrade',
        ...(huOpts?.path ? { path: huOpts.path } : {}),
        ...(huOpts?.host ? { host: huOpts.host } : {}),
      };
    }
  } else if (type === 'vless') {
    outbound.type = 'vless';
    outbound.server = server;
    outbound.server_port = port;
    outbound.uuid = proxy.uuid || '';
    const vlessNet = String(proxy.network || '').toLowerCase();
    if (vlessNet && vlessNet !== 'tcp' && vlessNet !== 'raw') {
      if (vlessNet === 'ws') {
        outbound.transport = { type: 'ws' };
        const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
        const wsHeaders = asRecord(wsOpts?.headers);
        if (wsOpts?.path) outbound.transport.path = wsOpts.path;
        if (wsHeaders?.Host) outbound.transport.headers = { Host: wsHeaders.Host };
      } else if (vlessNet === 'grpc') {
        outbound.transport = { type: 'grpc' };
        const grpcOpts = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts);
        const serviceName = grpcOpts?.['grpc-service-name'] || grpcOpts?.serviceName;
        if (serviceName) outbound.transport.service_name = serviceName;
      } else if (vlessNet === 'h2' || vlessNet === 'http') {
        const h2Opts = asRecord(proxy[`${vlessNet}-opts`]) || asRecord(proxy[`${vlessNet}Opts`]);
        outbound.transport = {
          type: 'http',
          ...(h2Opts?.host ? { host: Array.isArray(h2Opts.host) ? h2Opts.host : [h2Opts.host] } : {}),
          ...(h2Opts?.path ? { path: h2Opts.path } : {}),
        };
      } else if (vlessNet === 'httpupgrade') {
        const huOpts = asRecord(proxy['httpupgrade-opts']) || asRecord(proxy.httpupgradeOpts);
        outbound.transport = {
          type: 'httpupgrade',
          ...(huOpts?.path ? { path: huOpts.path } : {}),
          ...(huOpts?.host ? { host: huOpts.host } : {}),
        };
      } else if (vlessNet === 'xhttp') {
        // sing-box 暂不支持 xhttp transport，跳过该节点避免整份配置无法加载
        return null;
      }
    }
    if (proxy.flow) outbound.flow = proxy.flow;
    const reality = asRecord(proxy.reality_opts) || asRecord(proxy['reality-opts']) || asRecord(proxy.realityOpts);
    if (reality) {
      outbound.tls = {
        enabled: true,
        server_name: String(proxy.sni || proxy.servername || server),
        utls: {
          enabled: true,
          fingerprint: proxy['client-fingerprint'] || proxy.clientFingerprint || proxy.fp || 'chrome',
        },
        reality: {
          enabled: true,
          public_key: reality['public-key'] || reality.public_key || reality.publicKey,
          short_id: reality['short-id'] || reality.short_id || reality.shortId,
        },
      };
    } else if (proxy.tls || proxy.sni || proxy.servername || proxy['skip-cert-verify'] || proxy.skipCertVerify) {
      outbound.tls = {
        enabled: true,
        server_name: String(proxy.sni || proxy.servername || server),
      };
      if (proxy.alpn) outbound.tls.alpn = Array.isArray(proxy.alpn) ? proxy.alpn : [proxy.alpn];
    }
  } else if (type === 'trojan') {
    outbound.type = 'trojan';
    outbound.server = server;
    outbound.server_port = port;
    outbound.password = proxy.password || '';
    outbound.tls = {
      enabled: true,
      server_name: String(proxy.sni || proxy.servername || server),
    };
    if (proxy.network === 'ws') {
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      outbound.transport = {
        type: 'ws',
        path: wsOpts?.path || '/',
        headers: asRecord(wsOpts?.headers) || {},
      };
    } else if (proxy.network === 'grpc') {
      const grpcOpts = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts);
      const serviceName = grpcOpts?.['grpc-service-name'] || grpcOpts?.serviceName;
      outbound.transport = {
        type: 'grpc',
        ...(serviceName ? { service_name: serviceName } : {}),
      };
    }
  } else if (type === 'hysteria2' || type === 'hy2') {
    outbound.type = 'hysteria2';
    outbound.server = server;
    outbound.server_port = port;
    outbound.password = proxy.password || '';
    if (String(proxy.obfs || '').toLowerCase() === 'salamander' && proxy['obfs-password']) {
      outbound.obfs = {
        type: 'salamander',
        password: String(proxy['obfs-password']),
      };
    }
    const rawPorts = proxy.ports || proxy['port-hopping'];
    if (rawPorts) {
      const ranges = String(rawPorts)
        .split(',')
        .map((r) => r.trim().replace('-', ':'))
        .filter(Boolean);
      if (ranges.length > 0) outbound.server_ports = ranges;
    }
    const upVal = Number.parseInt(String(proxy.up || ''), 10);
    if (Number.isFinite(upVal) && upVal > 0) outbound.up_mbps = upVal;
    const downVal = Number.parseInt(String(proxy.down || proxy['download-bandwidth'] || ''), 10);
    if (Number.isFinite(downVal) && downVal > 0) outbound.down_mbps = downVal;
    outbound.tls = {
      enabled: true,
      server_name: String(proxy.sni || proxy.servername || server),
    };
  } else if (type === 'tuic') {
    outbound.type = 'tuic';
    outbound.server = server;
    outbound.server_port = port;
    outbound.uuid = proxy.uuid || '';
    outbound.password = proxy.password || '';
    applySingboxTuicExtraFields(outbound, proxy);
    outbound.tls = {
      enabled: true,
      server_name: String(proxy.sni || proxy.servername || server),
    };
    if (proxy.alpn) outbound.tls.alpn = Array.isArray(proxy.alpn) ? proxy.alpn : [proxy.alpn];
  } else if (type === 'anytls') {
    outbound.type = 'anytls';
    outbound.server = server;
    outbound.server_port = port;
    outbound.password = proxy.password || '';
    outbound.tls = {
      enabled: true,
      server_name: String(proxy.sni || proxy.servername || server),
    };
    if (proxy.alpn) outbound.tls.alpn = Array.isArray(proxy.alpn) ? proxy.alpn : [proxy.alpn];
  } else if (type === 'snell') {
    outbound.type = 'snell';
    outbound.server = server;
    outbound.server_port = port;
    outbound.psk = proxy.psk || proxy.password || '';
    if (proxy.version) outbound.version = Number(proxy.version);
  } else if (type === 'wireguard') {
    outbound.type = 'wireguard';
    outbound.server = server;
    outbound.server_port = port;
    outbound.private_key = proxy['private-key'] || '';
    outbound.local_address = Array.isArray(proxy.ip) ? proxy.ip : proxy.ip ? [proxy.ip] : [];
    outbound.peer_public_key = proxy['public-key'] || '';
    outbound.pre_shared_key = proxy['preshared-key'] || '';
    if (proxy.reserved !== undefined) outbound.reserved = proxy.reserved;
  } else if (type === 'http' || type === 'https') {
    outbound.type = 'http';
    outbound.server = server;
    outbound.server_port = port;
    if (proxy.username) outbound.username = proxy.username;
    if (proxy.password) outbound.password = proxy.password;
    if (type === 'https' || proxy.tls || proxy.sni || proxy.servername) {
      outbound.tls = {
        enabled: true,
        server_name: String(proxy.sni || proxy.servername || server),
        insecure: proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true,
      };
    }
  } else if (type === 'socks5' || type === 'socks5-tls') {
    outbound.type = 'socks';
    outbound.server = server;
    outbound.server_port = port;
    if (proxy.username) outbound.username = proxy.username;
    if (proxy.password) outbound.password = proxy.password;
    if (type === 'socks5-tls') {
      outbound.tls = {
        enabled: true,
        server_name: String(proxy.sni || proxy.servername || server),
      };
    }
  } else {
    return null;
  }

  if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) {
    outbound.tls = outbound.tls || {};
    outbound.tls.enabled = true;
    outbound.tls.insecure = true;
  }
  if (
    (proxy.sni || proxy.servername) &&
    ((type !== 'ss' && type !== 'shadowsocks') || proxy.tls || outbound.tls?.enabled)
  ) {
    outbound.tls = outbound.tls || {};
    outbound.tls.server_name = String(proxy.sni || proxy.servername);
  }
  const fingerprint = proxy['client-fingerprint'] || proxy.clientFingerprint || proxy.fp;
  if (fingerprint) {
    outbound.tls = outbound.tls || {};
    outbound.tls.utls = { enabled: true, fingerprint };
  }
  const echOpts = asRecord(proxy['ech-opts']) || asRecord(proxy.echOpts);
  if (echOpts?.enable && outbound.tls?.enabled) {
    const ech: NonNullable<SingboxTlsConfig['ech']> = { enabled: true };
    if (echOpts['query-server-name']) {
      ech.query_server_name = echOpts['query-server-name'];
    } else if (echOpts.config) {
      ech.config = [`-----BEGIN ECH CONFIGS-----\n${echOpts.config}\n-----END ECH CONFIGS-----`];
    }
    outbound.tls.ech = ech;
  }

  if (proxy.tfo) {
    outbound.tcp_fast_open = true;
  }

  return outbound;
}

/**
 * 构建 Sing-Box Shadowsocks SIP003 plugin_opts
 */
export function applySingboxShadowsocksPlugin(
  outbound: Record<string, unknown>,
  proxy: ClashProxy | Record<string, unknown>,
): void {
  const plugin = typeof proxy.plugin === 'string' ? proxy.plugin : '';
  const opts = asRecord(proxy['plugin-opts']) || asRecord(proxy.pluginOpts) || {};
  if (plugin === 'v2ray-plugin' || opts.mode === 'websocket') {
    outbound.plugin = 'v2ray-plugin';
    const pluginOptions = ['mode=websocket'];
    if (opts.host) pluginOptions.push(`host=${opts.host}`);
    if (opts.path) pluginOptions.push(`path=${opts.path}`);
    if (opts.tls || opts.mode === 'websocket-tls') pluginOptions.push('tls');
    outbound.plugin_opts = pluginOptions.join(';');
  }
}

/**
 * 填充 Sing-Box TUIC 通用可选字段
 */
export function applySingboxTuicExtraFields(
  outbound: Record<string, unknown>,
  proxy: ClashProxy | Record<string, unknown>,
): void {
  const congestionControl = proxy['congestion-controller'] || proxy['congestion-control'] || proxy.congestion;
  if (congestionControl) outbound.congestion_control = congestionControl;
  if (proxy['udp-over-stream'] !== undefined) outbound.udp_over_stream = Boolean(proxy['udp-over-stream']);
  if (proxy['zero-rtt-handshake'] !== undefined || proxy['reduce-rtt'] !== undefined) {
    outbound.zero_rtt_handshake = Boolean(proxy['zero-rtt-handshake'] ?? proxy['reduce-rtt']);
  }
  if (proxy.heartbeat) outbound.heartbeat = String(proxy.heartbeat);
  if (proxy.network) outbound.network = proxy.network;
}

/**
 * 构建 Sing-Box 顶层配置对象
 */
export function buildSingboxConfigEnvelope({
  dnsConfig,
  proxyOutbounds,
  groupOutbounds,
  finalOutbound,
  ruleSets,
  routeRules,
  clashApi = null,
}: {
  dnsConfig: SingboxDnsConfig;
  proxyOutbounds: Array<Record<string, unknown>>;
  groupOutbounds: Array<Record<string, unknown>>;
  finalOutbound: string;
  ruleSets: Array<SingboxRuleSetDefinition | Record<string, unknown>>;
  routeRules: Array<Record<string, unknown>>;
  clashApi?: Record<string, unknown> | null;
}): {
  log: { level: string };
  dns: SingboxDnsConfig;
  inbounds: Array<Record<string, unknown>>;
  outbounds: Array<Record<string, unknown>>;
  route: {
    auto_detect_interface: boolean;
    default_domain_resolver: string;
    final: string;
    rule_set: Array<SingboxRuleSetDefinition | Record<string, unknown>>;
    rules: Array<Record<string, unknown>>;
  };
  experimental?: { clash_api: Record<string, unknown> };
} {
  return {
    log: { level: 'info' },
    dns: dnsConfig,
    inbounds: [{ ...SINGBOX_TUN_INBOUND, address: [...SINGBOX_TUN_INBOUND.address] }],
    outbounds: [
      { tag: 'DIRECT', type: 'direct' },
      { tag: 'REJECT', type: 'block' },
      ...proxyOutbounds,
      ...groupOutbounds,
    ],
    route: {
      auto_detect_interface: true,
      default_domain_resolver: dnsConfig.servers[0]?.tag || 'dns-cn-1',
      final: finalOutbound,
      rule_set: ruleSets,
      rules: routeRules,
    },
    ...(clashApi ? { experimental: { clash_api: clashApi } } : {}),
  };
}

/**
 * 构造 WireGuard 节点在 Surge / Shadowrocket INI 中的 `[WireGuard ...]` 区块
 */
export function buildIniWireGuardSection(
  proxy: ClashProxy | Record<string, unknown>,
  {
    name,
    sectionName,
    defaultDns = null,
    defaultAllowedIps = null,
    quoteSingleAllowedIp = true,
    includeClientId = true,
  }: {
    name?: string;
    sectionName?: string;
    defaultDns?: string | null;
    defaultAllowedIps?: string | null;
    quoteSingleAllowedIp?: boolean;
    includeClientId?: boolean;
  } = {},
): string {
  const wgLines = [
    `[WireGuard ${sectionName || `WG_${String(name || 'WireGuard').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')}`}]`,
  ];

  if (proxy['private-key']) {
    wgLines.push(`private-key = ${proxy['private-key']}`);
  }
  if (proxy.ip) {
    const ipv4 = Array.isArray(proxy.ip) ? proxy.ip.find((ip) => !String(ip).includes(':')) : proxy.ip;
    if (ipv4) wgLines.push(`self-ip = ${ipv4}`);
  }
  if (proxy.ipv6) {
    const ipv6 = Array.isArray(proxy.ipv6) ? proxy.ipv6.find(Boolean) : proxy.ipv6;
    if (ipv6) wgLines.push(`self-ip-v6 = ${ipv6}`);
  }

  if (proxy.dns) {
    const dnsServers = Array.isArray(proxy.dns) ? proxy.dns.join(', ') : proxy.dns;
    if (dnsServers) wgLines.push(`dns-server = ${dnsServers}`);
  } else if (defaultDns) {
    wgLines.push(`dns-server = ${defaultDns}`);
  }

  if (proxy.mtu) {
    wgLines.push(`mtu = ${proxy.mtu}`);
  }

  const peerParts: string[] = [];
  if (proxy['public-key']) {
    peerParts.push(`public-key = ${proxy['public-key']}`);
  }

  const allowedIps = proxy['allowed-ips']
    ? Array.isArray(proxy['allowed-ips'])
      ? proxy['allowed-ips'].join(', ')
      : String(proxy['allowed-ips'])
    : (defaultAllowedIps ?? (proxy.ipv6 === undefined || proxy.ipv6 ? '0.0.0.0/0, ::/0' : '0.0.0.0/0'));
  peerParts.push(
    quoteSingleAllowedIp || allowedIps.includes(',') ? `allowed-ips = "${allowedIps}"` : `allowed-ips = ${allowedIps}`,
  );

  const server = String(proxy.server);
  const endpointHost = server.includes(':') && !server.startsWith('[') ? `[${server}]` : server;
  peerParts.push(`endpoint = ${endpointHost}:${proxy.port}`);

  if (proxy['preshared-key']) {
    peerParts.push(`preshared-key = ${proxy['preshared-key']}`);
  }
  if (proxy['persistent-keepalive']) {
    peerParts.push(`keepalive = ${proxy['persistent-keepalive']}`);
  }
  if (includeClientId && proxy.reserved) {
    const reserved = Array.isArray(proxy.reserved) ? proxy.reserved.join('/') : proxy.reserved;
    peerParts.push(`client-id = ${reserved}`);
  }

  if (peerParts.length > 0) {
    wgLines.push(`peer = (${peerParts.join(', ')})`);
  }

  return wgLines.join('\n');
}

function normalizeQxVmessMethod(method: unknown): string {
  const normalized = String(method || '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized === 'auto') return 'none';
  return normalized;
}

/**
 * 构建 Quantumult X 单行代理配置（供内置生成器与模板渲染器共用）
 */
export function buildQuanxProxyLine(
  proxy: ClashProxy | Record<string, unknown> | null | undefined,
  { sanitizeTag = false, includeFastOpen = false }: { sanitizeTag?: boolean; includeFastOpen?: boolean } = {},
): string | null {
  if (!proxy || !proxy.server || !proxy.port) return null;

  const rawName = typeof proxy.name === 'string' ? proxy.name : undefined;
  const name = sanitizeTag ? sanitizeIniNodeName(rawName, { stripQuotesAndSemicolon: true }) : rawName || 'Untitled';
  const type = String(proxy.type || '').toLowerCase();
  const server = proxy.server;
  const port = proxy.port;
  const skipCert = proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true;
  const sni = proxy.servername ?? proxy.sni;

  if (type === 'ss' || type === 'shadowsocks') {
    const extraParts: string[] = [];
    const plugin = proxy.plugin || '';
    const opts = asRecord(proxy['plugin-opts']) || asRecord(proxy.pluginOpts) || {};
    if (plugin === 'obfs-local' || proxy.obfs) {
      extraParts.push(`obfs=${proxy.obfs || opts.mode}`);
      if (proxy['obfs-host'] || opts.host) extraParts.push(`obfs-host=${proxy['obfs-host'] || opts.host}`);
    } else if (plugin === 'v2ray-plugin' || opts.mode === 'websocket') {
      extraParts.push(opts.tls || opts.mode === 'websocket-tls' ? 'obfs=wss' : 'obfs=ws');
      if (opts.path) extraParts.push(`obfs-uri=${opts.path}`);
      if (opts.host) extraParts.push(`obfs-host=${opts.host}`);
    }
    if (proxy.udp) extraParts.push('udp-relay=true');
    if (includeFastOpen && proxy.tfo) extraParts.push('fast-open=true');
    return `shadowsocks=${server}:${port}, method=${proxy.cipher || 'aes-128-gcm'}, password=${proxy.password || ''}${extraParts.length > 0 ? `, ${extraParts.join(', ')}` : ''}, tag=${name}`;
  }

  if (type === 'vmess') {
    const extraParts: string[] = [];
    const hasTlsLayer = sanitizeTag ? Boolean(proxy.tls || sni) : Boolean(proxy.tls) || sni !== undefined;
    if (proxy.network === 'ws' || (sanitizeTag && proxy['ws-opts'])) {
      extraParts.push(hasTlsLayer ? 'obfs=wss' : 'obfs=ws');
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      if (wsOpts?.path) extraParts.push(`obfs-uri=${wsOpts.path}`);
      if (wsHeaders?.Host) extraParts.push(`obfs-host=${wsHeaders.Host}`);
      else if (sanitizeTag ? sni : sni !== undefined) extraParts.push(`obfs-host=${sni}`);
    } else {
      if (hasTlsLayer) extraParts.push('over-tls=true');
      if (sanitizeTag ? sni : sni !== undefined) extraParts.push(`tls-host=${sni}`);
    }
    if (includeFastOpen && proxy.tfo) extraParts.push('fast-open=true');
    if (skipCert) extraParts.push('tls-verification=false');
    return `vmess=${server}:${port}, method=${normalizeQxVmessMethod(proxy.cipher)}, password=${proxy.uuid || ''}${extraParts.length > 0 ? `, ${extraParts.join(', ')}` : ''}, tag=${name}`;
  }

  if (type === 'trojan') {
    const extraParts: string[] = [];
    if (proxy.network === 'ws' || (sanitizeTag && proxy['ws-opts'])) {
      extraParts.push('obfs=ws');
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      if (wsOpts?.path) extraParts.push(`obfs-uri=${wsOpts.path}`);
      if (wsHeaders?.Host) extraParts.push(`obfs-host=${wsHeaders.Host}`);
    } else {
      extraParts.push('over-tls=true');
    }
    if (sanitizeTag ? sni : sni !== undefined) extraParts.push(`tls-host=${sni}`);
    if (includeFastOpen && proxy.obfs) extraParts.push(`obfs=${proxy.obfs}, obfs-host=${proxy['obfs-host'] || ''}`);
    if (includeFastOpen && proxy.tfo) extraParts.push('fast-open=true');
    if (skipCert) extraParts.push('tls-verification=false');
    return `trojan=${server}:${port}, password=${proxy.password || ''}${extraParts.length > 0 ? `, ${extraParts.join(', ')}` : ''}, tag=${name}`;
  }

  if (type === 'vless') {
    const extraParts = ['method=none'];
    const transport = proxy.network || 'tcp';
    const isReality = proxy.security === 'reality' || !!proxy['reality-opts'];
    const hasTlsLayer = Boolean(proxy.tls) || isReality;
    const hostValue = proxy.sni ?? proxy.servername;

    if (transport === 'ws' || proxy['ws-opts']) {
      extraParts.push(hasTlsLayer ? 'obfs=wss' : 'obfs=ws');
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      if (wsHeaders?.Host) extraParts.push(`obfs-host=${wsHeaders.Host}`);
      else if (sanitizeTag ? hostValue : hostValue !== undefined) extraParts.push(`obfs-host=${hostValue}`);
      if (wsOpts?.path) extraParts.push(`obfs-uri=${wsOpts.path}`);
    } else if (transport === 'grpc' || proxy['grpc-opts']) {
      extraParts.push(hasTlsLayer ? 'obfs=over-tls' : 'obfs=grpc');
      if (sanitizeTag ? hostValue : hostValue !== undefined) extraParts.push(`obfs-host=${hostValue}`);
      const grpcOpts = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts);
      if (!hasTlsLayer && grpcOpts?.['grpc-service-name']) extraParts.push(`obfs-uri=${grpcOpts['grpc-service-name']}`);
    } else if (transport === 'xhttp' || proxy['xhttp-opts']) {
      extraParts.push(hasTlsLayer ? 'obfs=over-tls' : 'obfs=http');
      const xhttpOpts = asRecord(proxy['xhttp-opts']) || asRecord(proxy.xhttpOpts);
      if (xhttpOpts?.host) extraParts.push(`obfs-host=${xhttpOpts.host}`);
      else if (sanitizeTag ? hostValue : hostValue !== undefined) extraParts.push(`obfs-host=${hostValue}`);
      if (!hasTlsLayer && xhttpOpts?.path) extraParts.push(`obfs-uri=${xhttpOpts.path}`);
    } else if (hasTlsLayer) {
      extraParts.push('obfs=over-tls');
      if (sanitizeTag ? hostValue : hostValue !== undefined) extraParts.push(`obfs-host=${hostValue}`);
    }

    if (isReality) {
      const realityOpts = asRecord(proxy['reality-opts']) || {};
      if (realityOpts['public-key']) extraParts.push(`reality-base64-pubkey=${realityOpts['public-key']}`);
      if (realityOpts['short-id']) extraParts.push(`reality-hex-shortid=${realityOpts['short-id']}`);
    }
    if (proxy.flow) extraParts.push(`vless-flow=${proxy.flow}`);
    if (skipCert) extraParts.push('tls-verification=false');
    return `vless=${server}:${port}, password=${proxy.uuid || ''}${extraParts.length > 0 ? `, ${extraParts.join(', ')}` : ''}, tag=${name}`;
  }

  if (type === 'http' || type === 'https') {
    const extraParts: string[] = [];
    if (type === 'https') extraParts.push('over-tls=true');
    if (sanitizeTag ? sni : sni !== undefined) extraParts.push(`tls-host=${sni}`);
    if (includeFastOpen && skipCert) extraParts.push('tls-verification=false');
    return `http=${server}:${port}, username=${proxy.username || ''}, password=${proxy.password || ''}${extraParts.length > 0 ? `, ${extraParts.join(', ')}` : ''}, tag=${name}`;
  }

  if (type === 'hysteria2' || type === 'hy2') {
    return null;
  }

  if (type === 'tuic') {
    const parts: string[] = [];
    if (proxy.uuid) parts.push(String(proxy.uuid || ''));
    if (proxy.password) parts.push(String(proxy.password || ''));
    if (sanitizeTag ? sni : sni !== undefined) parts.push(`sni=${sni}`);
    const congestionControl = proxy['congestion-control'] || proxy['congestion-controller'];
    if (congestionControl) parts.push(`congestion-controller=${congestionControl}`);
    if (proxy['udp-relay-mode']) parts.push(`udp-relay=${proxy['udp-relay-mode']}`);
    if (proxy.alpn) {
      const alpn = Array.isArray(proxy.alpn) ? proxy.alpn.join(',') : proxy.alpn;
      parts.push(`alpn=${alpn}`);
    }
    if (skipCert) parts.push('tls-verification=false');
    return `tuic=${server}:${port}, ${parts.join(', ')}, tag=${name}`;
  }

  if (type === 'anytls') {
    const extraParts = [`password=${proxy.password || ''}`, 'over-tls=true'];
    extraParts.push(skipCert ? 'tls-verification=false' : 'tls-verification=true');
    if (sanitizeTag ? sni : sni !== undefined) extraParts.push(`tls-host=${sni}`);
    if (proxy.security === 'reality' || proxy['reality-opts']) {
      const realityOpts = asRecord(proxy['reality-opts']) || {};
      if (realityOpts['public-key']) extraParts.push(`reality-base64-pubkey=${realityOpts['public-key']}`);
      if (realityOpts['short-id']) extraParts.push(`reality-hex-shortid=${realityOpts['short-id']}`);
    }
    extraParts.push(`fast-open=${proxy.tfo ? 'true' : 'false'}`);
    extraParts.push(`udp-relay=${proxy.udp ? 'true' : 'false'}`);
    return `anytls=${server}:${port}, ${extraParts.join(', ')}, tag=${name}`;
  }

  return null;
}
