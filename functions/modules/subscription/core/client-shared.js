import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import { cleanControlChars, getUniqueName } from './name-utils.js';
import { DEFAULT_SELECT_GROUP, POLICY_GROUPS, pruneProxyGroups } from '../templates/builtin-rules-provider.js';
import {
  applyGeneralGroupToggles,
  buildVisualPolicyGroups,
  normalizeBuiltinTransform,
} from './visual-rules-builder.js';
import { DNS_PROXY_GROUP } from '../security/safe-dns.js';
import { cloneSnifferConfig } from './sniffing-config.js';

export const DEFAULT_TEST_URL = 'http://www.gstatic.com/generate_204';
export const QURE_ICON_REPO = 'https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color';

export const POLICY_GROUP_ICONS = Object.freeze({
  [DEFAULT_SELECT_GROUP]: `${QURE_ICON_REPO}/Proxy.png`,
  '🌍 总出口': `${QURE_ICON_REPO}/Proxy.png`,
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
  quotingType: '"',
  forceQuotes: false,
});

export const SINGBOX_TUN_INBOUND = Object.freeze({
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

/**
 * 解析换行分隔的节点 URL 列表
 * @param {string} nodeList
 * @param {{ stripControl?: boolean }} [options]
 * @returns {string[]}
 */
export function parseNodeUrlLines(nodeList, { stripControl = true } = {}) {
  const raw = stripControl ? cleanControlChars(nodeList) : String(nodeList || '');
  return String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/**
 * 解析统一模板模型中的代理列表（若模型未内联代理则回退解析 options.nodeList）
 * @param {Record<string, any>} normalizedModel
 * @param {Record<string, any>} [options]
 * @returns {Object[]}
 */
export function resolveModelProxies(normalizedModel, options = {}) {
  if (Array.isArray(normalizedModel.proxies) && normalizedModel.proxies.length > 0) {
    return normalizedModel.proxies;
  }
  const nodeList = typeof options.nodeList === 'string' ? options.nodeList : '';
  return urlsToClashProxies(parseNodeUrlLines(nodeList, { stripControl: false }));
}

/**
 * 原地为代理数组生成唯一名称
 * @param {Object[]} proxies
 */
export function deduplicateProxyNames(proxies) {
  if (!Array.isArray(proxies)) return;
  const usedNames = new Map();
  proxies.forEach((proxy) => {
    if (proxy && proxy.name) {
      proxy.name = getUniqueName(proxy.name, usedNames);
    }
  });
}

/**
 * 移除仅供内部分组使用的 metadata 字段
 * @param {Object[]} proxies
 * @returns {Object[]}
 */
export function stripInternalProxyFields(proxies) {
  return (Array.isArray(proxies) ? proxies : []).map((proxy) => {
    if (!proxy || typeof proxy !== 'object' || !('metadata' in proxy)) return proxy;
    const { metadata: _metadata, ...publicProxy } = proxy;
    return publicProxy;
  });
}

/**
 * 清理 INI 格式中的非法节点名字符
 * @param {string} name
 * @param {{ stripQuotesAndSemicolon?: boolean }} [options]
 * @returns {string}
 */
export function sanitizeIniNodeName(name, { stripQuotesAndSemicolon = false } = {}) {
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
 * @param {unknown} value
 * @param {{ emptyForFalsy?: boolean }} [options]
 * @returns {string}
 */
export function quoteIniValue(value, { emptyForFalsy = false } = {}) {
  if (emptyForFalsy ? !value : value === undefined || value === null) return '';
  const strValue = String(value);
  if (/[,\s"=]/.test(strValue)) {
    return `"${strValue.replace(/"/g, '\\"')}"`;
  }
  return strValue;
}

/**
 * 过滤自动测速/负载均衡策略组中不允许出现的直连/拒绝策略
 * @param {string} type
 * @param {string[]} members
 * @returns {string[]}
 */
export function filterAutoGroupMembers(type, members) {
  const list = Array.isArray(members) ? members.filter(Boolean) : [];
  if (!AUTO_GROUP_TYPES.has(String(type || '').toLowerCase())) {
    return list;
  }
  return list.filter((member) => !DIRECT_POLICY_TOKENS.has(String(member).toUpperCase()));
}

/**
 * 统一解析内置策略组拓扑（支持可视化分流与通用开关）
 * @param {Object[]} proxies
 * @param {Record<string, any>} [options]
 * @param {{ allowVisualRules?: boolean }} [config]
 */
export function resolveBuiltinPolicyGroups(proxies, options = {}, { allowVisualRules = true } = {}) {
  const levelKey = (options.ruleLevel || 'std').toUpperCase();
  const bt = options.builtinTransform ? normalizeBuiltinTransform(options.builtinTransform) : null;
  const useVisualRules = allowVisualRules && Boolean(bt?.visualRulesEnabled);

  let proxyGroups;
  if (useVisualRules) {
    proxyGroups = buildVisualPolicyGroups(proxies, { ...options, builtinTransform: bt });
  } else {
    const policyFactory = POLICY_GROUPS[levelKey] || POLICY_GROUPS.STD;
    proxyGroups = policyFactory(proxies, options);
    if (bt) {
      proxyGroups = applyGeneralGroupToggles(proxyGroups, { builtinTransform: bt });
    }
    proxyGroups = pruneProxyGroups(proxyGroups, proxies);
  }

  return { levelKey, bt, useVisualRules, proxyGroups };
}

/**
 * 为 Loon / Surge INI 渲染注入 RELAY 链式代理「入口节点 + 落地节点」分组对
 * @param {Object[]} groups
 * @param {Object[]} proxies
 * @returns {Object[]}
 */
export function applyIniRelayGroupPair(groups, proxies) {
  const nextGroups = groups.map((group) =>
    group.name === '🔗 链式代理' ? { ...group, type: 'relay', proxies: ['入口节点', '落地节点'] } : group,
  );
  if (!nextGroups.some((group) => group.name === '落地节点')) {
    const proxyNames = proxies.map((proxy) => proxy.name);
    nextGroups.splice(nextGroups.findIndex((group) => group.name === '入口节点') + 1, 0, {
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
export function materializeRelayChainNodes({
  nameKey,
  linkKey,
  linkTarget = '入口节点',
  publicItems,
  proxyGroups,
  allProxiesForPrune,
}) {
  const chainItems = publicItems.map((item) => ({
    ...item,
    [nameKey]: `🔗 链式代理 - ${item[nameKey]}`,
    [linkKey]: linkTarget,
  }));
  const chainNames = chainItems.map((item) => item[nameKey]);

  const nextProxyGroups = proxyGroups
    .map((group) => (group.name === '🔗 链式代理' ? { ...group, type: 'select', proxies: chainNames } : group))
    .filter(Boolean);

  return {
    items: [...publicItems, ...chainItems],
    proxyGroups: pruneProxyGroups(nextProxyGroups, [...allProxiesForPrune, ...chainItems]),
  };
}

/**
 * 格式化 Loon / Surge INI `[Proxy Group]` 行
 */
export function formatIniProxyGroupLine(
  group,
  { iconMap = null, fallbackEmptyDirect = false, includeFilters = false, useMembersField = false } = {},
) {
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
}) {
  return {
    'mixed-port': 7890,
    'allow-lan': false,
    'bind-address': '127.0.0.1',
    ipv6: false,
    mode: 'rule',
    'log-level': 'info',
    ...extraTopLevel,
    sniffer: cloneSnifferConfig(),
    dns,
    proxies,
    'proxy-groups': proxyGroups,
    ...(ruleProviders && Object.keys(ruleProviders).length > 0 ? { 'rule-providers': ruleProviders } : {}),
    rules,
    profile: {
      'store-selected': true,
      'subscription-url': managedConfigUrl || '',
    },
  };
}

/**
 * 构建 Sing-Box Shadowsocks SIP003 plugin_opts
 */
export function applySingboxShadowsocksPlugin(outbound, proxy) {
  const plugin = proxy.plugin || '';
  const opts = proxy['plugin-opts'] || proxy.pluginOpts || {};
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
export function applySingboxTuicExtraFields(outbound, proxy) {
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
}) {
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
  proxy,
  {
    name,
    sectionName,
    defaultDns = null,
    defaultAllowedIps = null,
    quoteSingleAllowedIp = true,
    includeClientId = true,
  } = {},
) {
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

  const peerParts = [];
  if (proxy['public-key']) {
    peerParts.push(`public-key = ${proxy['public-key']}`);
  }

  const allowedIps = proxy['allowed-ips']
    ? Array.isArray(proxy['allowed-ips'])
      ? proxy['allowed-ips'].join(', ')
      : proxy['allowed-ips']
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

function normalizeQxVmessMethod(method) {
  const normalized = String(method || '')
    .trim()
    .toLowerCase();
  if (!normalized || normalized === 'auto') return 'none';
  return normalized;
}

/**
 * 构建 Quantumult X 单行代理配置（供内置生成器与模板渲染器共用）
 * @param {Record<string, any>} proxy
 * @param {{ sanitizeTag?: boolean, includeFastOpen?: boolean }} [options]
 * @returns {string|null}
 */
export function buildQuanxProxyLine(proxy, { sanitizeTag = false, includeFastOpen = false } = {}) {
  if (!proxy || !proxy.server || !proxy.port) return null;

  const name = sanitizeTag
    ? sanitizeIniNodeName(proxy.name, { stripQuotesAndSemicolon: true })
    : proxy.name || 'Untitled';
  const type = String(proxy.type || '').toLowerCase();
  const server = proxy.server;
  const port = proxy.port;
  const skipCert = proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true;
  const sni = proxy.servername ?? proxy.sni;

  if (type === 'ss' || type === 'shadowsocks') {
    const extraParts = [];
    const plugin = proxy.plugin || '';
    const opts = proxy['plugin-opts'] || proxy.pluginOpts || {};
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
    const extraParts = [];
    const hasTlsLayer = sanitizeTag ? Boolean(proxy.tls || sni) : proxy.tls || sni !== undefined;
    if (proxy.network === 'ws' || (sanitizeTag && proxy['ws-opts'])) {
      extraParts.push(hasTlsLayer ? 'obfs=wss' : 'obfs=ws');
      const wsOpts = proxy['ws-opts'] || proxy.wsOpts;
      if (wsOpts?.path) extraParts.push(`obfs-uri=${wsOpts.path}`);
      if (wsOpts?.headers?.Host) extraParts.push(`obfs-host=${wsOpts.headers.Host}`);
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
    const extraParts = [];
    if (proxy.network === 'ws' || (sanitizeTag && proxy['ws-opts'])) {
      extraParts.push('obfs=ws');
      const wsOpts = proxy['ws-opts'] || proxy.wsOpts;
      if (wsOpts?.path) extraParts.push(`obfs-uri=${wsOpts.path}`);
      if (wsOpts?.headers?.Host) extraParts.push(`obfs-host=${wsOpts.headers.Host}`);
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
    const hasTlsLayer = proxy.tls || isReality;
    const hostValue = proxy.sni ?? proxy.servername;

    if (transport === 'ws' || proxy['ws-opts']) {
      extraParts.push(hasTlsLayer ? 'obfs=wss' : 'obfs=ws');
      const wsOpts = proxy['ws-opts'] || proxy.wsOpts;
      if (wsOpts?.headers?.Host) extraParts.push(`obfs-host=${wsOpts.headers.Host}`);
      else if (sanitizeTag ? hostValue : hostValue !== undefined) extraParts.push(`obfs-host=${hostValue}`);
      if (wsOpts?.path) extraParts.push(`obfs-uri=${wsOpts.path}`);
    } else if (transport === 'grpc' || proxy['grpc-opts']) {
      extraParts.push(hasTlsLayer ? 'obfs=over-tls' : 'obfs=grpc');
      if (sanitizeTag ? hostValue : hostValue !== undefined) extraParts.push(`obfs-host=${hostValue}`);
      const grpcOpts = proxy['grpc-opts'] || proxy.grpcOpts;
      if (!hasTlsLayer && grpcOpts?.['grpc-service-name']) extraParts.push(`obfs-uri=${grpcOpts['grpc-service-name']}`);
    } else if (transport === 'xhttp' || proxy['xhttp-opts']) {
      extraParts.push(hasTlsLayer ? 'obfs=over-tls' : 'obfs=http');
      const xhttpOpts = proxy['xhttp-opts'] || proxy.xhttpOpts;
      if (xhttpOpts?.host) extraParts.push(`obfs-host=${xhttpOpts.host}`);
      else if (sanitizeTag ? hostValue : hostValue !== undefined) extraParts.push(`obfs-host=${hostValue}`);
      if (!hasTlsLayer && xhttpOpts?.path) extraParts.push(`obfs-uri=${xhttpOpts.path}`);
    } else if (hasTlsLayer) {
      extraParts.push('obfs=over-tls');
      if (sanitizeTag ? hostValue : hostValue !== undefined) extraParts.push(`obfs-host=${hostValue}`);
    }

    if (isReality) {
      const realityOpts = proxy['reality-opts'] || {};
      if (realityOpts['public-key']) extraParts.push(`reality-base64-pubkey=${realityOpts['public-key']}`);
      if (realityOpts['short-id']) extraParts.push(`reality-hex-shortid=${realityOpts['short-id']}`);
    }
    if (proxy.flow) extraParts.push(`vless-flow=${proxy.flow}`);
    if (skipCert) extraParts.push('tls-verification=false');
    return `vless=${server}:${port}, password=${proxy.uuid || ''}${extraParts.length > 0 ? `, ${extraParts.join(', ')}` : ''}, tag=${name}`;
  }

  if (type === 'http' || type === 'https') {
    const extraParts = [];
    if (type === 'https') extraParts.push('over-tls=true');
    if (sanitizeTag ? sni : sni !== undefined) extraParts.push(`tls-host=${sni}`);
    if (includeFastOpen && skipCert) extraParts.push('tls-verification=false');
    return `http=${server}:${port}, username=${proxy.username || ''}, password=${proxy.password || ''}${extraParts.length > 0 ? `, ${extraParts.join(', ')}` : ''}, tag=${name}`;
  }

  if (type === 'hysteria2' || type === 'hy2') {
    return null;
  }

  if (type === 'tuic') {
    const parts = [];
    if (proxy.uuid) parts.push(proxy.uuid || '');
    if (proxy.password) parts.push(proxy.password || '');
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
      const realityOpts = proxy['reality-opts'] || {};
      if (realityOpts['public-key']) extraParts.push(`reality-base64-pubkey=${realityOpts['public-key']}`);
      if (realityOpts['short-id']) extraParts.push(`reality-hex-shortid=${realityOpts['short-id']}`);
    }
    extraParts.push(`fast-open=${proxy.tfo ? 'true' : 'false'}`);
    extraParts.push(`udp-relay=${proxy.udp ? 'true' : 'false'}`);
    return `anytls=${server}:${port}, ${extraParts.join(', ')}, tag=${name}`;
  }

  return null;
}

export { DNS_PROXY_GROUP };
