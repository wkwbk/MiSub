import {
  normalizeUnifiedTemplateModel,
  type TemplateGroup,
  type TemplateProxy,
  type TemplateRule,
  type UnifiedTemplateModelInput,
} from '../template-model.js';
import { pinRemoteRuleUrl } from '../builtin-rules-provider.js';
import { buildIniWireGuardSection, formatIniProxyGroupLine, resolveModelProxies } from '../../core/client-shared.js';

export interface RenderSurgeOptions {
  nodeList?: string;
  isChinaClient?: boolean;
  [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function buildProxyLine(proxy: TemplateProxy): string | null {
  const type = String(proxy.type || '').toLowerCase();
  const name = proxy.name || 'Untitled';
  const server = proxy.server;
  const port = proxy.port;
  if (!server || !port) return null;

  if (type === 'trojan') {
    const extras = [`password=${proxy.password || ''}`];
    const sni = proxy.servername ?? proxy.sni;
    if (sni !== undefined) extras.push(`sni=${sni}`);
    if (proxy.network === 'ws') {
      extras.push('ws=true');
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      if (wsOpts?.path) extras.push(`ws-path=${wsOpts.path}`);
      if (wsHeaders?.Host) extras.push(`ws-headers=Host:${wsHeaders.Host}`);
    }
    if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) extras.push('skip-cert-verify=true');
    return `${name} = trojan, ${server}, ${port}, ${extras.join(', ')}`;
  }
  if (type === 'ss' || type === 'shadowsocks') {
    const extras = [`encrypt-method=${proxy.cipher || 'aes-128-gcm'}`, `password=${proxy.password || ''}`];
    const plugin = proxy.plugin || '';
    const opts = asRecord(proxy['plugin-opts']) || asRecord(proxy.pluginOpts) || {};
    if (plugin === 'obfs-local' || proxy.obfs) {
      const obfsMode = opts.mode || proxy.obfs;
      if (obfsMode) extras.push(`obfs=${obfsMode}`);
      const obfsHost = opts.host || proxy['obfs-host'];
      if (obfsHost) extras.push(`obfs-host=${obfsHost}`);
      const obfsUri = opts.uri || proxy['obfs-uri'];
      if (obfsUri) extras.push(`obfs-uri=${obfsUri}`);
    } else if (plugin === 'v2ray-plugin' || opts.mode === 'websocket') {
      extras.push('ws=true');
      if (opts.path) extras.push(`ws-path=${opts.path}`);
      if (opts.host) extras.push(`ws-headers=Host:${opts.host}`);
      if (opts.tls || opts.mode === 'websocket-tls') extras.push('tls=true');
    }
    if (proxy.udp) extras.push('udp-relay=true');
    return `${name} = ss, ${server}, ${port}, ${extras.join(', ')}`;
  }
  if (type === 'vmess') {
    const extras = [`username=${proxy.uuid || ''}`];
    const network = proxy.network || '';

    if (network === 'ws' || proxy['ws-opts']) {
      extras.push('ws=true');
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      if (wsOpts?.path) extras.push(`ws-path=${wsOpts.path}`);
      if (wsHeaders?.Host) extras.push(`ws-headers=Host:${wsHeaders.Host}`);
    } else if (network === 'grpc') {
      extras.push('transport=grpc');
      const grpcOpts = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts);
      if (grpcOpts?.['grpc-service-name']) extras.push(`grpc-service-name=${grpcOpts['grpc-service-name']}`);
    } else if (network === 'h2') {
      extras.push('transport=h2');
      const h2Opts = asRecord(proxy['h2-opts']) || asRecord(proxy.h2Opts);
      if (h2Opts?.path) extras.push(`h2-path=${h2Opts.path}`);
      if (h2Opts?.host) {
        const host = Array.isArray(h2Opts.host) ? h2Opts.host[0] : h2Opts.host;
        extras.push(`h2-host=${host}`);
      }
    }

    if (proxy.alterId === 0 || proxy.alterId === undefined || proxy.alterId === null) extras.push('vmess-aead=true');
    const sni = proxy.servername ?? proxy.sni;
    if (proxy.tls || sni !== undefined) extras.push('tls=true');
    if (sni !== undefined) extras.push(`sni=${sni}`);
    if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) extras.push('skip-cert-verify=true');
    return `${name} = vmess, ${server}, ${port}, ${extras.join(', ')}`;
  }
  if (type === 'vless') return null;
  if (type === 'hysteria2' || type === 'hy2') {
    const extras = [`password=${proxy.password || ''}`];
    const sni = proxy.servername ?? proxy.sni;
    if (sni !== undefined) extras.push(`sni=${sni}`);
    // Surge 用 salamander-password 表达 Hysteria2 Salamander 混淆 (Mac 6.4.4+ / iOS 5.17.0+)
    if (String(proxy.obfs || '').toLowerCase() === 'salamander' && proxy['obfs-password'])
      extras.push('salamander-password=' + proxy['obfs-password']);
    return `${name} = hysteria2, ${server}, ${port}, ${extras.join(', ')}`;
  }
  if (type === 'tuic') {
    const extras: string[] = [];
    const sni = proxy.servername ?? proxy.sni;
    if (sni !== undefined) extras.push(`sni=${sni}`);
    if (proxy['congestion-control']) extras.push(`congestion-control=${proxy['congestion-control']}`);
    if (proxy['congestion-controller']) extras.push(`congestion-control=${proxy['congestion-controller']}`);
    if (proxy['udp-relay-mode'] === 'native') extras.push(`udp-relay=true`);
    if (proxy.alpn) {
      const alpn = Array.isArray(proxy.alpn) ? proxy.alpn.join(',') : proxy.alpn;
      extras.push(`alpn=${alpn}`);
    }
    if (proxy.uuid) {
      const token = proxy.password ? `${proxy.uuid}:${proxy.password}` : proxy.uuid;
      extras.unshift(`token=${token}`);
    } else if (proxy.password) {
      extras.unshift(`token=${proxy.password}`);
    }
    if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) extras.push('skip-cert-verify=true');
    return `${name} = tuic, ${server}, ${port}, ${extras.join(', ')}`;
  }
  if (type === 'wireguard') {
    if (!proxy['private-key'] || !proxy['public-key'] || (!proxy.ip && !proxy.ipv6)) {
      return null;
    }

    const sectionName = getWireGuardSectionName(name);
    return `${name} = wireguard, section-name=${sectionName}`;
  }
  if (type === 'http' || type === 'https' || type === 'socks5') {
    const extras: string[] = [];
    if (proxy.username) extras.push(`username=${proxy.username}`);
    if (proxy.password) extras.push(`password=${proxy.password}`);
    if (type === 'https') extras.push('tls=true');
    return `${name} = ${type === 'socks5' ? 'socks5' : 'http'}, ${server}, ${port}${extras.length ? `, ${extras.join(', ')}` : ''}`;
  }
  if (type === 'anytls') {
    const extras = [`password=${proxy.password || ''}`];
    const sni = proxy.servername ?? proxy.sni;
    if (sni !== undefined) extras.push(`sni=${sni}`);
    if (proxy.alpn) {
      const alpn = Array.isArray(proxy.alpn) ? proxy.alpn.join(',') : proxy.alpn;
      extras.push(`alpn=${alpn}`);
    }
    if (proxy['skip-cert-verify'] === true) extras.push('skip-cert-verify=true');
    return `${name} = anytls, ${server}, ${port}, ${extras.join(', ')}`;
  }

  return null;
}

function getWireGuardSectionName(name: string): string {
  const safeName = String(name || 'WireGuard').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');

  return `WG_${safeName}`;
}
function buildWireGuardSection(proxy: TemplateProxy): string | null {
  if (!proxy || String(proxy.type || '').toLowerCase() !== 'wireguard') {
    return null;
  }

  if (!proxy.server || !proxy.port || !proxy['private-key'] || !proxy['public-key'] || (!proxy.ip && !proxy.ipv6)) {
    return null;
  }

  const name = proxy.name || 'Untitled';
  return buildIniWireGuardSection(proxy, {
    name,
    sectionName: getWireGuardSectionName(name),
    defaultDns: null,
    defaultAllowedIps: proxy.ipv6 ? '0.0.0.0/0, ::/0' : '0.0.0.0/0',
    quoteSingleAllowedIp: false,
    includeClientId: true,
  });
}

function buildProxyGroupLine(group: TemplateGroup): string {
  return formatIniProxyGroupLine(group, { fallbackEmptyDirect: true, useMembersField: true });
}

function buildRuleLine(rule: TemplateRule, { isChinaClient = false }: { isChinaClient?: boolean } = {}): string | null {
  if (typeof rule === 'string') return rule;
  const type = String(rule.type || '').toUpperCase();
  if (!type) return null;
  if (type === 'RULE-SET') return `RULE-SET,${pinRemoteRuleUrl(String(rule.value || ''), { isChinaClient })},${rule.policy}`;
  if (type === 'MATCH' || type === 'FINAL') return `FINAL,${rule.policy}`;
  if (type === 'GEOIP') return `GEOIP,${rule.value || 'CN'},${rule.policy}`;
  return `${type},${rule.value},${rule.policy}`;
}

export function renderSurgeFromTemplateModel(
  model: UnifiedTemplateModelInput,
  options: RenderSurgeOptions = {},
): string {
  const normalizedModel = normalizeUnifiedTemplateModel(model);
  const proxies = resolveModelProxies(normalizedModel, options);

  const proxyLines = proxies.map(buildProxyLine).filter((line): line is string => Boolean(line));

  const wireguardSections = proxies
    .filter((proxy) => String(proxy.type || '').toLowerCase() === 'wireguard')
    .map(buildWireGuardSection)
    .filter((section): section is string => Boolean(section));

  const wireguardBlock = wireguardSections.join('\n\n');
  const groupLines = normalizedModel.groups
    .filter((group) => Array.isArray(group.members) && group.members.length > 0)
    .map(buildProxyGroupLine)
    .filter(Boolean);
  const ruleLines = normalizedModel.rules
    .map((rule) => buildRuleLine(rule, { isChinaClient: options.isChinaClient }))
    .filter((line): line is string => Boolean(line));

  return [
    '[General]',
    'loglevel = notify',
    'dns-server = 223.5.5.5, 119.29.29.29',
    'encrypted-dns-server = h3://223.6.6.6/dns-query',
    'skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, localhost, *.local, elpass.app, e.crashlytics.com, captive.apple.com, ::ffff:0:0:0:0/1, ::ffff:128:0:0:0/1, fe80::/10, fc00::/7, ::1/128',
    'bypass-tun = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10',
    'ipv6 = true',
    'ipv6-vif = auto',
    'internet-test-url = http://www.apple.com/library/test/success.html',
    'proxy-test-url = http://www.gstatic.com/generate_204',
    'test-timeout = 5',
    '',
    '[Proxy]',
    ...proxyLines,
    '',
    ...(wireguardBlock ? [wireguardBlock, ''] : []),
    '[Proxy Group]',
    ...groupLines,
    '',
    '[Rule]',
    ...ruleLines,
    '',
  ].join('\n');
}
