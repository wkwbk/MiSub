/**
 * sing-box 出站配置 → 节点链接 的最小实现。
 *
 * 仅覆盖可无损映射回 URL 的代理类型（vless / vmess / trojan / shadowsocks /
 * hysteria2 / tuic / anytls）。selector / urltest / direct / block / dns 等
 * 非节点出站会被忽略。
 *
 * 返回链接数组；无法识别的出站跳过。
 */

import { utf8ToBase64 } from '../utils/base64.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function b64url(input: unknown): string {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return utf8ToBase64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function tlsParams(outbound: Record<string, unknown>): Array<[string, string]> {
  const tls = isRecord(outbound.tls) ? outbound.tls : {};
  const params: Array<[string, string]> = [];
  if (tls.enabled) {
    if (tls.server_name) params.push(['sni', String(tls.server_name)]);
    if (tls.insecure) params.push(['allowInsecure', '1']);
    if (tls.alpn) params.push(['alpn', toArray(tls.alpn).map(String).join(',')]);
    if (isRecord(tls.utls) && tls.utls.fingerprint) params.push(['fp', String(tls.utls.fingerprint)]);
    const reality = isRecord(tls.reality) ? tls.reality : {};
    if (reality.enabled) {
      params.push(['security', 'reality']);
      if (reality.public_key) params.push(['pbk', String(reality.public_key)]);
      if (reality.short_id) params.push(['sid', String(reality.short_id)]);
    } else {
      params.push(['security', 'tls']);
    }
  }
  if (outbound.flow) params.push(['flow', String(outbound.flow)]);
  const transport = isRecord(outbound.transport) ? outbound.transport : {};
  if (transport.type && transport.type !== 'tcp') {
    params.push(['type', String(transport.type)]);
    if (transport.path) params.push(['path', String(transport.path)]);
    const headers = isRecord(transport.headers) ? transport.headers : {};
    const transportHost = Array.isArray(transport.host)
      ? transport.host[0]
      : transport.host || headers.Host || headers.host;
    if (transportHost) params.push(['host', String(transportHost)]);
    if (transport.service_name) params.push(['serviceName', String(transport.service_name)]);
  }
  return params;
}

function buildQuery(params: Array<[string, string]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of params) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/**
 * 将单个 sing-box outbound 转为标准 URI，不支持返回 null
 */
export function singboxOutboundToUrl(ob: unknown): string | null {
  if (!isRecord(ob)) return null;
  const type = String(ob.type || '').toLowerCase();
  const server = ob.server ? String(ob.server) : '';
  const port = ob.server_port ?? ob.port;
  const name = ob.tag ? String(ob.tag) : '';
  if (!server || !port) return null;

  const uriServer = server.includes(':') && !server.startsWith('[') ? `[${server}]` : server;
  const hash = name ? `#${encodeURIComponent(name)}` : '';

  switch (type) {
    case 'vless': {
      const params = tlsParams(ob);
      if (ob.encryption) params.push(['encryption', String(ob.encryption)]);
      else params.push(['encryption', 'none']);
      return `vless://${String(ob.uuid || '')}@${uriServer}:${port}${buildQuery(params)}${hash}`;
    }
    case 'vmess': {
      const transport = isRecord(ob.transport) ? ob.transport : {};
      const headers = isRecord(transport.headers) ? transport.headers : {};
      const tls = isRecord(ob.tls) ? ob.tls : {};
      const transportHost = Array.isArray(transport.host)
        ? transport.host[0]
        : transport.host || headers.Host || headers.host || '';
      const obj = {
        v: '2',
        ps: name,
        add: server,
        port: String(port),
        id: ob.uuid,
        aid: String(ob.alter_id ?? 0),
        scy: ob.security || 'auto',
        net: transport.type || 'tcp',
        type: 'none',
        host: transportHost,
        path: transport.path || '',
        tls: tls.enabled ? 'tls' : '',
        sni: tls.server_name || '',
      };
      return `vmess://${b64url(JSON.stringify(obj))}`;
    }
    case 'trojan': {
      const params = tlsParams(ob);
      return `trojan://${encodeURIComponent(String(ob.password || ''))}@${uriServer}:${port}${buildQuery(params)}${hash}`;
    }
    case 'shadowsocks': {
      const method = String(ob.method || 'aes-256-gcm');
      const pwd = String(ob.password || '');
      const userinfo = utf8ToBase64(`${method}:${pwd}`).replace(/=+$/, '');
      return `ss://${userinfo}@${uriServer}:${port}${hash}`;
    }
    case 'hysteria2':
    case 'hy2': {
      const params = tlsParams(ob);
      if (isRecord(ob.obfs) && ob.obfs.type) {
        params.push(['obfs', String(ob.obfs.type)]);
        if (ob.obfs.password) params.push(['obfs-password', String(ob.obfs.password)]);
      }
      return `hysteria2://${encodeURIComponent(String(ob.password || ''))}@${uriServer}:${port}${buildQuery(params)}${hash}`;
    }
    case 'tuic': {
      const params = tlsParams(ob);
      if (ob.congestion_control) params.push(['congestion_control', String(ob.congestion_control)]);
      const auth = `${encodeURIComponent(String(ob.uuid || ''))}:${encodeURIComponent(String(ob.password || ''))}`;
      return `tuic://${auth}@${uriServer}:${port}${buildQuery(params)}${hash}`;
    }
    case 'anytls': {
      const params = tlsParams(ob);
      return `anytls://${encodeURIComponent(String(ob.password || ''))}@${uriServer}:${port}${buildQuery(params)}${hash}`;
    }
    default:
      return null;
  }
}

/**
 * 从 sing-box 配置对象中提取节点链接。
 */
export function extractSingboxNodes(config: unknown): string[] {
  if (!isRecord(config)) return [];
  const outbounds = toArray(config.outbounds);
  return outbounds.map(singboxOutboundToUrl).filter((url): url is string => Boolean(url));
}
