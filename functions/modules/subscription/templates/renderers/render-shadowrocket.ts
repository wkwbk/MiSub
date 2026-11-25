import type { ClashProxy } from '@misub/core/types.js';
import { pinRemoteRuleUrl } from '../builtin-rules-provider.js';
import {
  normalizeUnifiedTemplateModel,
  type ShadowrocketClashGroup,
  type ShadowrocketClashSource,
  type TemplateRule,
  type UnifiedTemplateModelInput,
} from '../template-model.js';
import { applyMihomoChainProxy } from '../../core/mihomo-chain-proxy.js';
import { shadowrocketProxyNames, sortShadowrocketProxies } from '../../core/shadowrocket-order.js';
import { formatShadowrocketRuleBundle, type ShadowrocketRuleBundleEntry } from '../../core/shadowrocket-rule-bundle.js';
import { buildIniWireGuardSection, stripInternalProxyFields } from '../../core/client-shared.js';

export type { ShadowrocketClashGroup, ShadowrocketClashSource };

export interface RenderShadowrocketOptions {
  managedConfigUrl?: string;
  interval?: number;
  preferredProxyKeys?: string[];
  compactNames?: boolean;
  isChinaClient?: boolean;
  ruleBundle?: ShadowrocketRuleBundleEntry[] | null;
  [key: string]: unknown;
}

interface ParsedShadowrocketRule {
  type: string;
  value: string;
  policy: string;
  extras: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const YOUTUBE_API_HOSTS = new Set([
  'youtube.googleapis.com',
  'youtubeembeddedplayer.googleapis.com',
  'youtubei.googleapis.com',
]);

const PROTECTED_POLICY_PATTERN =
  /(?:-|_|\s)US$|人工智能|(?:^|[^a-z])(ai|claude|openai|gemini|grok|mistral|deepseek|perplexity|copilot)(?=$|[^a-z])/i;

function isProtectedPolicy(name = ''): boolean {
  return PROTECTED_POLICY_PATTERN.test(String(name || ''));
}

function scalar(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n]/g, ' ')
    .replace(/[,="\\]/g, ' ')
    .trim();
}

function policyName(value: unknown): string {
  const name = scalar(value);
  return name || 'Untitled';
}

function appendCommonTls(parts: string[], proxy: ClashProxy, defaultTls = false): void {
  const hasTls = Boolean(proxy.tls || defaultTls);
  if (hasTls) parts.push('tls=true');
  const peer = proxy.sni || proxy.servername;
  if (peer) parts.push(`peer=${scalar(peer)}`);
  if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) {
    parts.push('allowInsecure=1');
  }
  const alpn = Array.isArray(proxy.alpn) ? proxy.alpn[0] : proxy.alpn;
  if (alpn) parts.push(`alpn=${scalar(alpn)}`);
  if (proxy['client-fingerprint']) {
    parts.push(`fp=${scalar(proxy['client-fingerprint'])}`);
  }
}

export function renderShadowrocketProxy(
  proxy: ClashProxy | null | undefined,
  displayName: string | undefined = proxy?.name,
): { proxyLine: string; wireguardSection?: string } | null {
  if (!proxy || !proxy.server || !proxy.port) return null;
  const type = String(proxy.type || '').toLowerCase();
  const server = scalar(proxy.server);
  const port = Number(proxy.port);
  if (!server || !Number.isInteger(port) || port < 1 || port > 65535) return null;

  const name = policyName(displayName);
  const parts: string[] = [];

  if (type === 'ss' || type === 'shadowsocks') {
    if (!proxy.cipher || !proxy.password) return null;
    parts.push('ss', server, String(port), `method=${scalar(proxy.cipher)}`, `password=${proxy.password}`);
    const opts = asRecord(proxy['plugin-opts']) || asRecord(proxy.pluginOpts) || {};
    if (proxy.plugin === 'obfs-local' || opts.mode === 'http' || opts.mode === 'tls' || proxy.obfs) {
      const mode = opts.mode || proxy.obfs;
      if (mode) parts.push(`obfs=${scalar(mode)}`);
      const host = opts.host || proxy['obfs-host'];
      if (host) parts.push(`obfs-host=${scalar(host)}`);
      const uri = opts.uri || proxy['obfs-uri'];
      if (uri) parts.push(`obfs-uri=${scalar(uri)}`);
    } else if (proxy.plugin === 'v2ray-plugin' || opts.mode === 'websocket') {
      parts.push('obfs=websocket');
      if (opts.path) parts.push(`obfs-uri=${scalar(opts.path)}`);
      if (opts.host) parts.push(`obfs-host=${scalar(opts.host)}`);
      if (opts.tls || opts.mode === 'websocket-tls') parts.push('tls=true');
    }
  } else if (type === 'ssr') {
    parts.push(
      'ssr',
      server,
      String(port),
      `protocol=${scalar(proxy.protocol || 'origin')}`,
      `method=${scalar(proxy.cipher || 'aes-256-cfb')}`,
      `obfs=${scalar(proxy.obfs || 'plain')}`,
      `password=${proxy.password || ''}`,
    );
    if (proxy['protocol-param']) parts.push(`protocol-param=${scalar(proxy['protocol-param'])}`);
    if (proxy['obfs-param']) parts.push(`obfs-param=${scalar(proxy['obfs-param'])}`);
  } else if (type === 'vmess') {
    if (!proxy.uuid) return null;
    parts.push(
      'vmess',
      server,
      String(port),
      `method=${scalar(proxy.cipher || 'auto')}`,
      `password=${proxy.uuid}`,
      `alterId=${Number(proxy.alterId) || 0}`,
    );
    appendCommonTls(parts, proxy, false);
    const network = proxy.network || 'tcp';
    if (network === 'ws') {
      const ws = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts) || {};
      const wsHeaders = asRecord(ws.headers);
      parts.push('obfs=websocket', `obfs-uri=${scalar(ws.path || '/')}`);
      if (wsHeaders?.Host) parts.push(`obfs-host=${scalar(wsHeaders.Host)}`);
    } else if (network === 'grpc') {
      const grpc = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts) || {};
      parts.push('obfs=grpc', `obfs-uri=${scalar(grpc['grpc-service-name'] || '')}`);
    }
  } else if (type === 'vless') {
    if (!proxy.uuid) return null;
    parts.push('vless', server, String(port), `password=${proxy.uuid}`);
    appendCommonTls(parts, proxy, false);
    if (proxy.flow === 'xtls-rprx-vision') {
      parts.push('xtls=2');
    }
    const reality = asRecord(proxy['reality-opts']);
    if (reality && reality['public-key']) {
      parts.push(`pbk=${scalar(reality['public-key'])}`);
      if (reality['short-id']) parts.push(`sid=${scalar(reality['short-id'])}`);
      if (reality['spider-x']) parts.push(`spx=${scalar(reality['spider-x'])}`);
    }
    const network = proxy.network || 'tcp';
    if (network === 'ws') {
      const ws = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts) || {};
      const wsHeaders = asRecord(ws.headers);
      parts.push('obfs=websocket', `obfs-uri=${scalar(ws.path || '/')}`);
      if (wsHeaders?.Host) parts.push(`obfs-host=${scalar(wsHeaders.Host)}`);
    } else if (network === 'grpc') {
      const grpc = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts) || {};
      parts.push('obfs=grpc', `obfs-uri=${scalar(grpc['grpc-service-name'] || '')}`);
    }
  } else if (type === 'trojan') {
    if (!proxy.password) return null;
    parts.push('trojan', server, String(port), `password=${proxy.password}`);
    appendCommonTls(parts, proxy, true);
    const network = proxy.network || 'tcp';
    if (network === 'ws') {
      const ws = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts) || {};
      const wsHeaders = asRecord(ws.headers);
      parts.push('obfs=websocket', `obfs-uri=${scalar(ws.path || '/')}`);
      if (wsHeaders?.Host) parts.push(`obfs-host=${scalar(wsHeaders.Host)}`);
    } else if (network === 'grpc') {
      const grpc = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts) || {};
      parts.push('obfs=grpc', `obfs-uri=${scalar(grpc['grpc-service-name'] || '')}`);
    }
  } else if (type === 'hysteria2' || type === 'hy2') {
    parts.push('hysteria2', server, String(port), `password=${proxy.password || ''}`);
    appendCommonTls(parts, proxy, true);
    if (String(proxy.obfs || '').toLowerCase() === 'salamander' && proxy['obfs-password']) {
      parts.push(`obfs=salamander`, `obfs-password=${proxy['obfs-password']}`);
    }
    if (proxy.ports || proxy['port-hopping']) {
      parts.push(`mport=${scalar(proxy.ports || proxy['port-hopping'])}`);
    }
    if (proxy.down) parts.push(`download-bandwidth=${scalar(proxy.down)}`);
  } else if (type === 'tuic') {
    parts.push('tuic', server, String(port));
    if (proxy.uuid) {
      parts.push(`uuid=${proxy.uuid}`);
      if (proxy.password) parts.push(`password=${proxy.password}`);
    } else if (proxy.token) {
      parts.push(`token=${proxy.token}`);
    } else if (proxy.password) {
      parts.push(`password=${proxy.password}`);
    }
    appendCommonTls(parts, proxy, true);
    if (proxy['congestion-controller'] || proxy['congestion-control']) {
      parts.push(`congestion-controller=${scalar(proxy['congestion-controller'] || proxy['congestion-control'])}`);
    }
  } else if (type === 'anytls') {
    parts.push('anytls', server, String(port), `password=${proxy.password || ''}`);
    appendCommonTls(parts, proxy, true);
  } else if (type === 'http' || type === 'https' || type === 'socks5' || type === 'socks5-tls') {
    const scheme = type === 'http' && proxy.tls ? 'https' : type === 'socks5' && proxy.tls ? 'socks5-tls' : type;
    parts.push(scheme, server, String(port));
    if (proxy.username || proxy.password) {
      parts.push(scalar(proxy.username || ''), String(proxy.password || ''));
    }
    if ((scheme === 'https' || scheme === 'socks5-tls') && (proxy['skip-cert-verify'] || proxy.skipCertVerify)) {
      parts.push('skip-common-name-verify=true');
    }
  } else if (type === 'wireguard') {
    const sectionName = `WG_${name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')}`;
    return {
      proxyLine: `${name} = wireguard, section-name=${sectionName}`,
      wireguardSection: buildIniWireGuardSection(proxy, {
        name,
        sectionName,
        defaultDns: '8.8.8.8, 1.1.1.1',
        defaultAllowedIps: '0.0.0.0/0, ::/0',
        quoteSingleAllowedIp: true,
        includeClientId: false,
      }),
    };
  } else {
    return null;
  }

  if (proxy.tfo !== undefined) parts.push(`tfo=${proxy.tfo ? 1 : 0}`);
  if (!['http', 'https', 'socks5', 'socks5-tls'].includes(type) && proxy.udp !== undefined) {
    parts.push(`udp=${proxy.udp ? 1 : 0}`);
  }

  return { proxyLine: `${name} = ${parts.join(', ')}` };
}

function parseRuleString(rawRule: TemplateRule): ParsedShadowrocketRule | null {
  if (rawRule && typeof rawRule === 'object') {
    return {
      type: String(rawRule.type || '').toLowerCase(),
      value: typeof rawRule.value === 'string' ? rawRule.value : '',
      policy: typeof rawRule.policy === 'string' && rawRule.policy ? rawRule.policy : 'DIRECT',
      extras: Array.isArray(rawRule.extras) ? rawRule.extras : [],
    };
  }
  const parts = String(rawRule || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const type = parts[0].toLowerCase();
  if (type === 'match' || type === 'final') {
    return {
      type,
      value: '',
      policy: parts[1],
      extras: parts.slice(2),
    };
  }
  return {
    type,
    value: parts[1] || '',
    policy: parts[2] || parts[1],
    extras: parts.slice(3),
  };
}

function orderYouTubeApiRules(rules: ParsedShadowrocketRule[]): ParsedShadowrocketRule[] {
  const googleRule = rules.findIndex(
    (rule) => rule.type === 'domain-suffix' && rule.value === 'googleapis.com' && /google/i.test(rule.policy || ''),
  );
  if (googleRule < 0) return rules;

  const youtubeRules: ParsedShadowrocketRule[] = [];
  const youtubeSet = new Set<ParsedShadowrocketRule>();
  for (const rule of rules.slice(googleRule + 1)) {
    if (rule.type === 'domain' && /youtube/i.test(rule.policy || '') && YOUTUBE_API_HOSTS.has(rule.value)) {
      youtubeRules.push(rule);
      youtubeSet.add(rule);
    }
  }
  if (youtubeRules.length === 0) return rules;
  return [...rules.slice(0, googleRule), ...youtubeRules, ...rules.slice(googleRule).filter((r) => !youtubeSet.has(r))];
}

function resolveDirectResolvers(dnsConfig: Record<string, unknown> = {}): string[] {
  const rawList = Array.isArray(dnsConfig?.['direct-nameserver']) ? dnsConfig['direct-nameserver'] : [];
  const cleaned = rawList
    .map((val) =>
      String(val || '')
        .replace(/#.*$/i, '')
        .replace(/^udp:\/\//i, '')
        .trim(),
    )
    .filter((val) => /^(?:https:\/\/|tls:\/\/|quic:\/\/|\d+\.\d+\.\d+\.\d+(?::\d+)?$)/i.test(val));
  return cleaned.length > 0 ? cleaned : ['https://223.5.5.5/dns-query', 'https://1.12.12.12/dns-query'];
}

export function renderShadowrocketConfigFromClash(
  source: ShadowrocketClashSource = {},
  options: RenderShadowrocketOptions = {},
): string {
  const {
    managedConfigUrl = '',
    interval = 86400,
    preferredProxyKeys = [],
    compactNames = true,
    isChinaClient = false,
    ruleBundle = null,
  } = options;

  const rawProxies = Array.isArray(source.proxies) ? source.proxies : [];
  const rawGroups = Array.isArray(source['proxy-groups']) ? source['proxy-groups'] : [];
  const rawRules = Array.isArray(source.rules) ? source.rules : [];
  const ruleProviders = source['rule-providers'] || {};

  const parsedRules = rawRules.map(parseRuleString).filter((item): item is ParsedShadowrocketRule => Boolean(item));
  const sortedProxies = sortShadowrocketProxies(rawProxies, preferredProxyKeys);

  // 为每条代理生成安全且唯一的 Shadowrocket 名称（建立原名 -> 输出名映射）
  const groupNames = rawGroups.map((group) => group?.name).filter((name): name is string => Boolean(name));
  const targetProxyNames = shadowrocketProxyNames(sortedProxies, groupNames, { compact: compactNames });
  const aliases = new Map<string, string>();
  sortedProxies.forEach((proxy, index) => {
    if (proxy?.name) aliases.set(proxy.name, targetProxyNames[index]);
  });

  const occupied = new Set([...targetProxyNames, ...groupNames]);
  for (const original of groupNames) {
    if (/^(?:PROXY|DIRECT|REJECT|REJECT-DROP|PASS|COMPATIBLE)$/i.test(original)) {
      let alias = /^proxy$/i.test(original) ? 'MiSub 默认代理' : `MiSub ${original}`;
      while (occupied.has(alias)) alias += ' 2';
      aliases.set(original, alias);
      occupied.add(alias);
      continue;
    }
    const clean = scalar(original);
    if (clean !== original) {
      let alias = clean || 'Group';
      while (occupied.has(alias)) alias += ' 2';
      aliases.set(original, alias);
      occupied.add(alias);
    }
  }

  const resolvePolicy = (value: unknown): string => {
    const key = String(value || '');
    return aliases.get(key) ?? policyName(key);
  };

  const proxyLines: string[] = [];
  const wireguardSections: string[] = [];
  const validOriginalProxyNames = new Set<string>();

  sortedProxies.forEach((proxy, index) => {
    const outName = targetProxyNames[index];
    const rendered = renderShadowrocketProxy(proxy, outName);
    if (!rendered) return;
    proxyLines.push(rendered.proxyLine);
    if (rendered.wireguardSection) wireguardSections.push(rendered.wireguardSection);
    if (proxy?.name) validOriginalProxyNames.add(proxy.name);
  });

  const primaryDnsGroup =
    rawGroups.find((g) => /DNS.*出口/i.test(g?.name || ''))?.name ||
    rawGroups.find((g) => isProtectedPolicy(g?.name || ''))?.name ||
    groupNames[0] ||
    '';
  const foreignDns = primaryDnsGroup
    ? ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query']
        .map((resolver) => `${resolver}#proxy=${encodeURIComponent(resolvePolicy(primaryDnsGroup))}`)
        .join(',')
    : 'https://1.1.1.1/dns-query,https://8.8.8.8/dns-query';
  const directDnsList = resolveDirectResolvers(source.dns);

  const managedLine = managedConfigUrl
    ? `#!MANAGED-CONFIG ${managedConfigUrl} interval=${interval} strict=false\n`
    : '';

  const sections = [
    ...(managedLine ? [managedLine.trimEnd()] : []),
    '# MiSub native Shadowrocket configuration',
    '[General]',
    'ipv6 = false',
    'prefer-ipv6 = false',
    'dns-direct-system = false',
    `dns-server = ${foreignDns}`,
    `direct-dns-server = ${directDnsList.join(',')}`,
    `proxy-dns-server = ${directDnsList.join(',')}`,
    `fallback-dns-server = ${foreignDns}`,
    'udp-policy-not-supported-behaviour = REJECT',
    '',
    '[Proxy]',
    'DIRECT = direct',
    ...proxyLines,
    '',
  ];

  if (wireguardSections.length > 0) {
    sections.push(...wireguardSections, '');
  }

  // [Proxy Group]
  sections.push('[Proxy Group]');
  const ranks = new Map(sortedProxies.map((proxy, index) => [proxy.name, index]));
  const priorityOrder = ['OpenAI-US', 'Claude-US', 'Gemini-US', 'Google-US', 'PROXY', '🚀 节点选择'];
  const groupRank = (g: ShadowrocketClashGroup): number => {
    const idx = priorityOrder.indexOf(g?.name || '');
    return idx >= 0 ? idx : priorityOrder.length;
  };
  const validGroupNameSet = new Set(groupNames);
  const orderedGroups = [...rawGroups].sort((a, b) => groupRank(a) - groupRank(b));

  for (const group of orderedGroups) {
    if (!group?.name) continue;
    const rawType = String(group.type || 'select').toLowerCase();
    const srType =
      rawType === 'url-test' || rawType === 'load-balance'
        ? 'url-test'
        : rawType === 'fallback'
          ? 'fallback'
          : 'select';

    let members = (Array.isArray(group.proxies) ? group.proxies : []).filter((m) => {
      if (!m) return false;
      const upper = String(m).toUpperCase();
      if (['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS'].includes(upper)) {
        return srType === 'select';
      }
      return validOriginalProxyNames.has(m) || validGroupNameSet.has(m);
    });

    members = [...members].sort((a, b) => (ranks.get(a) ?? 10000) - (ranks.get(b) ?? 10000));
    if (members.length === 0) {
      members = isProtectedPolicy(group.name) ? ['REJECT'] : ['DIRECT'];
    }

    const extras = [`hidden=${group.hidden ? 1 : 0}`];
    if (srType === 'select' && members.length > 0) {
      extras.push(`policy-select-name=${resolvePolicy(members[0])}`);
    }
    if (srType === 'url-test' || srType === 'fallback') {
      extras.push(`url=${scalar(group.url || 'http://www.gstatic.com/generate_204')}`);
      extras.push(`interval=${Number(group.interval) || 300}`);
      if (group.tolerance !== undefined) extras.push(`tolerance=${Number(group.tolerance) || 50}`);
    }
    if (group.timeout !== undefined) {
      extras.push(`timeout=${Math.max(1, Math.ceil(Number(group.timeout) / 1000))}`);
    }

    sections.push(
      `${resolvePolicy(group.name)} = ${srType}, ${members.map(resolvePolicy).join(', ')}, ${extras.join(', ')}`,
    );
  }

  // [Rule]
  sections.push('', '[Rule]');
  const renderedRules: string[] = [];
  for (const rule of orderYouTubeApiRules(parsedRules)) {
    const type = String(rule.type || '').toLowerCase();
    if (!type) continue;
    // 跳过 Shadowrocket 不支持的进程级规则与 Clash 独有规则类型
    if (type.startsWith('process-')) continue;

    let value = rule.value;
    if (type === 'rule-set') {
      const provider = ruleProviders?.[value];
      if (provider?.format === 'mrs' || /\.mrs$/i.test(String(provider?.url || value || ''))) {
        continue;
      }
      if (provider?.url) {
        value = pinRemoteRuleUrl(provider.url, { isChinaClient });
      } else if (/^https?:\/\//i.test(value)) {
        value = pinRemoteRuleUrl(value, { isChinaClient });
      } else {
        continue;
      }
    }

    const rawPolicy = String(rule.policy || 'DIRECT');
    const ruleExtras = Array.isArray(rule.extras) ? rule.extras : [];
    const useSelectedProxy = ruleExtras.includes('use-selected-proxy');
    const filteredExtras = ruleExtras.filter((extra) => extra !== 'use-selected-proxy');

    if (
      ['domain', 'domain-suffix', 'domain-keyword'].includes(type) &&
      (isProtectedPolicy(rawPolicy) || /youtube/i.test(rawPolicy)) &&
      !filteredExtras.includes('force-remote-dns')
    ) {
      filteredExtras.push('force-remote-dns');
    }

    const outPolicy = useSelectedProxy
      ? 'PROXY'
      : ['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS'].includes(rawPolicy.toUpperCase())
        ? rawPolicy.toUpperCase()
        : resolvePolicy(rawPolicy);

    if (type === 'match' || type === 'final') {
      renderedRules.push(`FINAL,${outPolicy}`);
    } else if (type === 'geoip') {
      renderedRules.push(['GEOIP', scalar(value || 'CN'), outPolicy, ...filteredExtras].join(','));
    } else {
      renderedRules.push([type.toUpperCase(), scalar(value), outPolicy, ...filteredExtras].join(','));
    }
  }

  if (renderedRules.length === 0) {
    const fallbackGroup = groupNames[0] ? resolvePolicy(groupNames[0]) : 'DIRECT';
    renderedRules.push(`FINAL,${fallbackGroup}`);
  }

  if (Array.isArray(ruleBundle) && ruleBundle.length > 0) {
    const hasProxyGroup = groupNames.includes('PROXY') || groupNames.includes('🚀 节点选择');
    const managedProxyName = groupNames.includes('PROXY') ? resolvePolicy('PROXY') : resolvePolicy('🚀 节点选择');
    if (hasProxyGroup) {
      const finalIndex = renderedRules.findIndex((line) => /^FINAL,/i.test(line));
      const existingKeys = new Set(renderedRules.map((line) => line.split(',').slice(0, 2).join(',')));
      const bundledText = formatShadowrocketRuleBundle(ruleBundle, managedProxyName, existingKeys);
      if (bundledText) {
        if (finalIndex >= 0) {
          renderedRules.splice(finalIndex, 0, bundledText);
        } else {
          renderedRules.push(bundledText);
        }
      }
    }
  }

  sections.push(...renderedRules);
  return sections.join('\n') + '\n';
}

export function renderShadowrocketFromTemplateModel(
  model: UnifiedTemplateModelInput,
  options: RenderShadowrocketOptions = {},
): string {
  const normalizedModel = normalizeUnifiedTemplateModel(model);
  if (Array.isArray(normalizedModel.extras?.chainProxy)) {
    applyMihomoChainProxy(normalizedModel, {
      enableDialerProxy: false,
    });
  }

  const ruleProviders: NonNullable<ShadowrocketClashSource['rule-providers']> = {};
  const ruleProviderMap = new Map<string, string>();
  let providerCounter = 0;

  normalizedModel.rules.forEach((rawRule) => {
    if (typeof rawRule !== 'object' || rawRule === null) return;
    const type = String(rawRule.type || '').toUpperCase();
    const val = typeof rawRule.value === 'string' ? rawRule.value : '';
    if (type !== 'RULE-SET' || !val || !/^https?:\/\//i.test(val)) return;
    const providerUrl = pinRemoteRuleUrl(val, { isChinaClient: options.isChinaClient });
    if (ruleProviderMap.has(providerUrl)) return;
    const providerName = `sr_rs_${providerCounter++}`;
    ruleProviderMap.set(providerUrl, providerName);
    ruleProviders[providerName] = {
      type: 'http',
      behavior: 'classical',
      url: providerUrl,
      format: 'text',
    };
  });

  const clashLikeConfig: ShadowrocketClashSource = {
    proxies: stripInternalProxyFields(normalizedModel.proxies || []) as ClashProxy[],
    'proxy-groups': (normalizedModel.groups || [])
      .filter(
        (group) =>
          (Array.isArray(group.members) && group.members.length > 0) ||
          (Array.isArray(group.filters) && group.filters.length > 0),
      )
      .map((group) => ({
        name: group.name,
        type: String(group.type || 'select').toLowerCase(),
        proxies: Array.isArray(group.members) ? group.members : [],
        ...group.options,
      })),
    'rule-providers': ruleProviders,
    rules: normalizedModel.rules.map((rule) => {
      if (
        typeof rule === 'object' &&
        rule !== null &&
        String(rule.type || '').toUpperCase() === 'RULE-SET' &&
        typeof rule.value === 'string' &&
        rule.value
      ) {
        const providerUrl = pinRemoteRuleUrl(rule.value, { isChinaClient: options.isChinaClient });
        return {
          ...rule,
          value: ruleProviderMap.get(providerUrl) || providerUrl,
        };
      }
      return rule;
    }),
  };

  return renderShadowrocketConfigFromClash(clashLikeConfig, {
    ...options,
    managedConfigUrl: normalizedModel.settings?.managedConfigUrl || options.managedConfigUrl || '',
    interval: normalizedModel.settings?.interval || options.interval || 86400,
  });
}
