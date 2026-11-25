import {
  normalizeUnifiedTemplateModel,
  type TemplateGroup,
  type TemplateProxy,
  type TemplateRule,
  type UnifiedTemplateModelInput,
} from '../template-model.js';
import { pinRemoteRuleUrl } from '../builtin-rules-provider.js';
import { formatIniProxyGroupLine, resolveModelProxies } from '../../core/client-shared.js';

export interface RenderLoonOptions {
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

  const sni = proxy.servername ?? proxy.sni;

  if (type === 'trojan') {
    const extras: string[] = [String(proxy.password || '')];
    if (proxy.network === 'ws') {
      extras.push('transport=ws');
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      if (wsOpts?.path) extras.push(`path=${wsOpts.path}`);
      if (wsHeaders?.Host) extras.push(`host=${wsHeaders.Host}`);
    }
    if (sni !== undefined) extras.push(`sni=${sni}`);
    if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) extras.push('skip-cert-verify=true');
    return `${name} = trojan, ${server}, ${port}, ${extras.join(', ')}`;
  }
  if (type === 'ss' || type === 'shadowsocks') {
    const extras: string[] = [];
    const plugin = proxy.plugin || '';
    const opts = asRecord(proxy['plugin-opts']) || asRecord(proxy.pluginOpts) || {};
    if (plugin === 'obfs-local' || proxy.obfs) {
      extras.push(`obfs-name=${proxy.obfs || opts.mode}`);
      const host = proxy['obfs-host'] || opts.host;
      if (host) extras.push(`obfs-host=${host}`);
      const uri = proxy['obfs-uri'] || opts.uri;
      if (uri) extras.push(`obfs-uri=${uri}`);
    } else if (plugin === 'v2ray-plugin' || opts.mode === 'websocket') {
      extras.push('transport=ws');
      if (opts.path) extras.push(`path=${opts.path}`);
      if (opts.host) extras.push(`host=${opts.host}`);
      if (opts.tls || opts.mode === 'websocket-tls') extras.push('over-tls=true');
    }
    if (proxy.udp) extras.push('udp-relay=true');
    return `${name} = Shadowsocks, ${server}, ${port}, ${proxy.cipher || 'aes-128-gcm'}, ${proxy.password || ''}${extras.length ? `, ${extras.join(', ')}` : ''}`;
  }
  if (type === 'vmess') {
    const cipher = proxy.cipher || 'auto';
    const uuid = `"${proxy.uuid || ''}"`;
    const alterId = proxy.alterId || 0;
    const extras: string[] = [];

    if (proxy.tls || sni !== undefined) extras.push('over-tls=true');
    if (proxy.network === 'ws') {
      extras.push('transport=ws');
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      if (wsOpts?.path) extras.push(`path=${wsOpts.path}`);
      if (wsHeaders?.Host) extras.push(`host=${wsHeaders.Host}`);
    }
    if (sni !== undefined) extras.push(`sni=${sni}`);
    if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) extras.push('skip-cert-verify=true');

    const extraStr = extras.length > 0 ? `, ${extras.join(', ')}` : '';
    return `${name} = vmess, ${server}, ${port}, ${cipher}, ${uuid}, ${alterId}${extraStr}`;
  }
  if (type === 'vless') {
    const extras: string[] = [String(proxy.uuid || '')];
    if (proxy.network) extras.push(`transport=${proxy.network}`);
    if (proxy.network === 'ws') {
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      if (wsOpts?.path) extras.push(`path=${wsOpts.path}`);
      if (wsHeaders?.Host) extras.push(`host=${wsHeaders.Host}`);
    }
    if (proxy.network === 'grpc') {
      const grpcOpts = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts);
      if (grpcOpts?.['grpc-service-name']) extras.push(`grpc-service-name=${grpcOpts['grpc-service-name']}`);
    }
    if (proxy.flow) extras.push(`flow=${proxy.flow}`);
    if (proxy.tls || sni !== undefined) extras.push('over-tls=true');
    const realityOpts = asRecord(proxy['reality-opts']) || asRecord(proxy.realityOpts);
    if (realityOpts) {
      extras.push('reality=true');
      if (realityOpts['public-key']) extras.push(`public-key=${realityOpts['public-key']}`);
      if (realityOpts['short-id']) extras.push(`short-id=${realityOpts['short-id']}`);
    }
    if (sni !== undefined) extras.push(`sni=${sni}`);
    if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) extras.push('skip-cert-verify=true');
    return `${name} = vless, ${server}, ${port}, ${extras.join(', ')}`;
  }
  if (type === 'hysteria2' || type === 'hy2') {
    const extras: string[] = [String(proxy.password || '')];
    if (sni !== undefined) extras.push(`sni=${sni}`);
    if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) extras.push('skip-cert-verify=true');
    if (proxy.alpn) {
      const alpn = Array.isArray(proxy.alpn) ? proxy.alpn.join(',') : proxy.alpn;
      if (alpn) extras.push(`alpn=${alpn}`);
    }
    return `${name} = hysteria2, ${server}, ${port}, ${extras.join(', ')}`;
  }
  if (type === 'tuic') {
    const extras = ['version=5'];

    if (sni !== undefined) extras.push(`sni=${sni}`);

    if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) extras.push('skip-cert-verify=true');

    if (proxy.alpn) {
      const alpn = Array.isArray(proxy.alpn) ? proxy.alpn.join(',') : proxy.alpn;
      extras.push(`alpn=${alpn}`);
    }

    // 拥塞控制 (Loon 标准写法是 congestion-control)
    const cg = proxy['congestion-control'] || proxy['congestion-controller'] || 'bbr';
    extras.push(`congestion-control=${cg}`);

    if (proxy['udp-relay-mode']) extras.push(`udp-relay-mode=${proxy['udp-relay-mode']}`);

    // 性能优化参数
    extras.push('reduce-rtt=true');
    if (proxy['fast-open']) extras.push('fast-open=true');

    // Loon TUIC 语法: Name = tuic, Server, Port, Password, UUID, key=value, ...
    return `${name} = tuic, ${server}, ${port}, ${proxy.password || ''}, ${proxy.uuid || ''}, ${extras.join(', ')}`;
  }
  if (type === 'wireguard') {
    if (!proxy['private-key'] || !proxy['public-key']) {
      return null;
    }
    const extras: string[] = [];
    if (proxy.ip) {
      const ipv4 = Array.isArray(proxy.ip) ? proxy.ip.find((ip) => !String(ip).includes(':')) : proxy.ip;

      if (ipv4) {
        extras.push(`interface-ip=${ipv4}`);
      }
    }

    if (proxy.ipv6) {
      const ipv6 = Array.isArray(proxy.ipv6) ? proxy.ipv6.find(Boolean) : proxy.ipv6;

      if (ipv6) {
        extras.push(`interface-ipV6=${ipv6}`);
      }
    }

    extras.push(`private-key="${proxy['private-key']}"`);

    if (proxy.mtu) {
      extras.push(`mtu=${proxy.mtu}`);
    }

    if (proxy.dns) {
      const dnsList = Array.isArray(proxy.dns) ? proxy.dns.filter(Boolean) : [proxy.dns];

      const dns4 = dnsList.find((dns) => !String(dns).includes(':'));
      const dns6 = dnsList.find((dns) => String(dns).includes(':'));

      if (dns4) {
        extras.push(`dns=${dns4}`);
      }

      if (dns6) {
        extras.push(`dnsV6=${dns6}`);
      }
    }

    const peer: string[] = [];

    peer.push(`public-key="${proxy['public-key']}"`);

    if (proxy['preshared-key']) {
      peer.push(`preshared-key="${proxy['preshared-key']}"`);
    }

    if (proxy.reserved) {
      const reserved = Array.isArray(proxy.reserved)
        ? proxy.reserved
        : String(proxy.reserved)
            .split(/[/,]/)
            .map((v) => Number(v.trim()))
            .filter(Number.isFinite);

      if (reserved.length) {
        peer.push(`reserved=[${reserved.join(',')}]`);
      }
    }

    if (proxy['allowed-ips']) {
      const allowedIps = Array.isArray(proxy['allowed-ips']) ? proxy['allowed-ips'].join(', ') : proxy['allowed-ips'];

      peer.push(`allowed-ips="${allowedIps}"`);
    } else {
      peer.push(proxy.ipv6 ? 'allowed-ips="0.0.0.0/0, ::/0"' : 'allowed-ips="0.0.0.0/0"');
    }

    // IPv6 endpoint 加 []
    const endpointHost = String(server).includes(':') && !String(server).startsWith('[') ? `[${server}]` : server;

    peer.push(`endpoint=${endpointHost}:${port}`);

    extras.push(`peers=[{${peer.join(',')}}]`);

    return `${name} = wireguard,${extras.join(',')}`;
  }
  if (type === 'anytls') {
    const extras: string[] = [String(proxy.password || '')];
    if (sni !== undefined) extras.push(`sni=${sni}`);
    if (proxy.alpn) {
      const alpn = Array.isArray(proxy.alpn) ? proxy.alpn.join(',') : proxy.alpn;
      if (alpn) extras.push(`alpn=${alpn}`);
    }
    if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) extras.push('skip-cert-verify=true');
    return `${name} = anytls, ${server}, ${port}, ${extras.join(', ')}`;
  }
  return null;
}

function buildGroupLine(group: TemplateGroup): string {
  return formatIniProxyGroupLine(group, { includeFilters: true, useMembersField: true });
}

function buildRuleLine(rule: TemplateRule): string | null {
  if (typeof rule === 'string') return rule;
  const type = String(rule.type || '').toUpperCase();
  if (!type || type === 'RULE-SET') return null;
  if (type === 'MATCH' || type === 'FINAL') {
    return `FINAL,${rule.policy}`;
  }
  if (type === 'GEOIP') {
    return `GEOIP,${rule.value || 'CN'},${rule.policy}`;
  }
  return `${type},${rule.value},${rule.policy}`;
}

function buildRemoteRuleLine(rule: TemplateRule, { isChinaClient = false }: { isChinaClient?: boolean } = {}): string | null {
  if (typeof rule === 'string') return null;
  const type = String(rule.type || '').toUpperCase();
  if (type !== 'RULE-SET') return null;
  if (!rule.value || !rule.policy) return null;
  return `${pinRemoteRuleUrl(rule.value, { isChinaClient })}, policy=${rule.policy}, enabled=true`;
}

export function renderLoonFromTemplateModel(
  model: UnifiedTemplateModelInput,
  options: RenderLoonOptions = {},
): string {
  const normalizedModel = normalizeUnifiedTemplateModel(model);
  const proxies = resolveModelProxies(normalizedModel, options);
  const ruleLines = normalizedModel.rules
    .filter((rule) => typeof rule !== 'object' || rule === null || String(rule.type || '').toUpperCase() !== 'RULE-SET')
    .map(buildRuleLine)
    .filter((line): line is string => Boolean(line));

  const remoteRuleLines = normalizedModel.rules
    .filter(
      (rule) =>
        typeof rule === 'object' &&
        rule !== null &&
        (rule.source === 'remote' || String(rule.type || '').toUpperCase() === 'RULE-SET'),
    )
    .map((rule) => buildRemoteRuleLine(rule, { isChinaClient: options.isChinaClient }))
    .filter((line): line is string => Boolean(line));

  return [
    '[General]',
    'ip-mode = ipv4-preferred',
    'dns-server = 223.5.5.5, 119.29.29.29',
    'doh-server = https://223.5.5.5/resolve,https://sm2.doh.pub/dns-query',
    'skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, localhost, *.local, elpass.app, e.crashlytics.com, captive.apple.com, ::ffff:0:0:0:0/1, ::ffff:128:0:0:0/1, fe80::/10, fc00::/7, ::1/128',
    'bypass-tun = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10',
    'interface-mode = auto',
    'disable-stun = true',
    'allow-udp-proxy = true',
    'allow-wifi-access = false',
    'wifi-access-http-port = 7222',
    'wifi-access-socks5-port = 7221',
    'resource-parser = https://github.com/sub-store-org/Sub-Store/releases/latest/download/sub-store-parser.loon.min.js',
    'geoip-url = https://gitlab.com/Masaiki/GeoIP2-CN/-/raw/release/Country.mmdb',
    'proxy-test-url = http://www.gstatic.com/generate_204',
    'internet-test-url = http://www.apple.com/library/test/success.html',

    '',
    '[Proxy]',
    ...proxies.map(buildProxyLine).filter((line): line is string => Boolean(line)),
    '',
    '[Proxy Group]',
    ...normalizedModel.groups
      .filter((group) => Array.isArray(group.members) && group.members.length > 0)
      .map(buildGroupLine)
      .filter(Boolean),
    '',
    '[Rule]',
    ...ruleLines,
    '',
    '[Remote Rule]',
    ...remoteRuleLines,
    '',
  ].join('\n');
}
