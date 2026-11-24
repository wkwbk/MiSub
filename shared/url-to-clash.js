/**
 * 节点 URL 转 Clash 代理对象（前后端共享纯协议解析层）
 * 支持特殊参数：dialer-proxy、reality-opts 等
 */

import { extractName } from './clash-parsers/common.js';
import { parseTrojanUrl, parseVlessUrl, parseVmessUrl } from './clash-parsers/v2ray.js';
import { parseSsdUrl, parseSsrUrl, parseSsUrl } from './clash-parsers/shadowsocks.js';
import {
  parseAnytlsUrl,
  parseHysteria2Url,
  parseSnellUrl,
  parseTuicUrl,
  parseWireguardUrl,
} from './clash-parsers/modern.js';
import { parseHttpsUrl, parseSocks5Url } from './clash-parsers/basic.js';
import { decodeV2raynNodeUrl } from './v2rayn-utils.js';

const V2RAYN_CLASH_PROTOCOL_ALIAS = {
  hy2: 'hysteria2',
  hy: 'hysteria2',
  hysteria: 'hysteria2',
  hysteria2: 'hysteria2',
  tuic: 'tuic',
  trojan: 'trojan',
  vless: 'vless',
  anytls: 'anytls',
  ss: 'ss',
  shadowsocks: 'ss',
};

/**
 * 解析 v2rayN 专有分享格式（v2rayn://）为 Clash (mihomo) 代理对象
 */
function parseV2raynClashProxy(url) {
  const decoded = decodeV2raynNodeUrl(url);
  if (!decoded) return null;

  const { protocol: rawProtocol, config } = decoded;
  const protocol =
    V2RAYN_CLASH_PROTOCOL_ALIAS[String(config.Protocol || config.protocol || rawProtocol || '').toLowerCase()];
  if (!protocol) return null;

  const server = String(config.Address || config.address || config.Server || config.server || '');
  const port = Number(config.Port || config.port);
  if (!server || !port) return null;

  const name = String(config.Remarks || config.remarks || config.Name || '').trim() || `${protocol}-${server}`;
  const shouldSkipCertVerify =
    config.AllowInsecure === true ||
    config.AllowInsecure === 'true' ||
    config.AllowInsecure === 1 ||
    config.AllowInsecure === '1' ||
    Boolean(config.Cert || config.cert);

  const rawNetwork = String(config.Network || config.network || '').toLowerCase();
  const network = rawNetwork === 'raw' ? 'tcp' : rawNetwork;

  const streamSecurity = String(config.StreamSecurity || config.streamSecurity || '').toLowerCase();
  const tlsEnabled = streamSecurity === 'tls' || streamSecurity === 'reality';

  let proxy = null;

  switch (protocol) {
    case 'hysteria2': {
      const password = String(config.Password || config.password || config.Auth || config.auth || '');
      if (!password) return null;
      proxy = {
        name,
        type: 'hysteria2',
        server,
        port,
        password,
        auth: password,
      };
      const extra = config.ProtoExtraObj || {};
      const upMbps = config.UpMbps ?? extra.UpMbps ?? config.upMbps;
      const downMbps = config.DownMbps ?? extra.DownMbps ?? config.downMbps;
      if (upMbps) proxy.up = `${upMbps} Mbps`;
      if (downMbps) proxy.down = `${downMbps} Mbps`;
      break;
    }
    case 'tuic': {
      proxy = {
        name,
        type: 'tuic',
        server,
        port,
        uuid: String(config.Username || config.Id || config.id || config.UUID || ''),
        password: String(config.Password || config.password || ''),
        udp: true,
      };
      if (config.Alpn) {
        proxy.alpn = String(config.Alpn)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }
      const congestion =
        config.ProtoExtraObj?.CongestionControl || config.CongestionControl || config.congestionControl;
      if (congestion) proxy['congestion-controller'] = String(congestion);
      break;
    }
    case 'trojan': {
      proxy = {
        name,
        type: 'trojan',
        server,
        port,
        password: String(config.Password || config.password || config.Id || ''),
      };
      break;
    }
    case 'vless': {
      const uuid = String(config.Id || config.id || config.UUID || config.Password || '');
      if (!uuid) return null;
      proxy = {
        name,
        type: 'vless',
        server,
        port,
        uuid,
      };
      if (config.Flow || config.flow) proxy.flow = String(config.Flow || config.flow);
      if (network && network !== 'tcp') proxy.network = network;
      if (network === 'ws') {
        const wsOpts = {};
        if (config.Path || config.path) wsOpts.path = String(config.Path || config.path);
        const host = config.RequestHost || config.Host || config.host;
        if (host) wsOpts.headers = { Host: String(host) };
        if (Object.keys(wsOpts).length > 0) proxy['ws-opts'] = wsOpts;
      } else if (network === 'grpc') {
        const grpcOpts = {};
        if (config.Path || config.path) grpcOpts['grpc-service-name'] = String(config.Path || config.path);
        if (Object.keys(grpcOpts).length > 0) proxy['grpc-opts'] = grpcOpts;
      }
      if (streamSecurity === 'reality') {
        proxy.tls = true;
        const realityOpts = {};
        if (config.PublicKey) realityOpts['public-key'] = String(config.PublicKey);
        if (config.ShortId) realityOpts['short-id'] = String(config.ShortId);
        if (Object.keys(realityOpts).length > 0) proxy['reality-opts'] = realityOpts;
      } else if (tlsEnabled) {
        proxy.tls = true;
      }
      break;
    }
    case 'anytls': {
      proxy = {
        name,
        type: 'anytls',
        server,
        port,
        password: String(config.Password || config.password || ''),
        udp: true,
      };
      break;
    }
    case 'ss': {
      const cipher = String(config.Method || config.method || '');
      const password = String(config.Password || config.password || '');
      if (!cipher || !password) return null;
      proxy = {
        name,
        type: 'ss',
        server,
        port,
        cipher,
        password,
        udp: true,
      };
      break;
    }
    default:
      return null;
  }

  const sni = config.Sni || config.sni || config.ServerName;
  if (sni) {
    proxy.servername = String(sni);
    proxy.sni = String(sni);
  }
  const fingerprint = config.Fingerprint || config.fingerprint;
  if (fingerprint) {
    proxy['client-fingerprint'] = String(fingerprint);
  }
  if (shouldSkipCertVerify) {
    proxy['skip-cert-verify'] = true;
  }

  return proxy;
}

/**
 * 将节点 URL 转换为 Clash 代理对象
 * @param {string} url - 节点 URL
 * @returns {Object|null} Clash 代理对象
 */
export function urlToClashProxy(url) {
  if (!url || typeof url !== 'string') return null;

  if (/^v2rayn:\/\//i.test(url)) {
    return parseV2raynClashProxy(url);
  }

  if (/^mierus:\/\//i.test(url)) {
    try {
      const body = url.slice(url.indexOf('//') + 2);
      const hashIndex = body.indexOf('#');
      const beforeHash = hashIndex < 0 ? body : body.slice(0, hashIndex);
      const queryIndex = beforeHash.indexOf('?');
      const authority = queryIndex < 0 ? beforeHash : beforeHash.slice(0, queryIndex);
      const query = new URLSearchParams(queryIndex < 0 ? '' : beforeHash.slice(queryIndex + 1));
      let server;
      let port;
      if (authority.startsWith('[')) {
        const end = authority.indexOf(']');
        server = authority.slice(1, end);
        port = Number(authority.slice(end + 2));
      } else {
        const split = authority.lastIndexOf(':');
        server = authority.slice(0, split);
        port = Number(authority.slice(split + 1));
      }
      const proxy = {
        name: extractName(url) || `Mieru-${server}`,
        type: 'mieru',
        server,
        port,
      };
      for (const key of ['username', 'password', 'transport', 'handshake-mode', 'profile'])
        if (query.has(key)) proxy[key] = query.get(key);
      for (const key of ['udp', 'multiplexing']) if (query.has(key)) proxy[key] = query.get(key) === 'true';
      if (query.has('mtu')) proxy.mtu = Number(query.get('mtu'));
      return proxy;
    } catch {
      return null;
    }
  }

  const lowerUrl = url.toLowerCase();

  if (lowerUrl.startsWith('vless://')) {
    return parseVlessUrl(url);
  } else if (lowerUrl.startsWith('trojan://')) {
    return parseTrojanUrl(url);
  } else if (lowerUrl.startsWith('vmess://')) {
    return parseVmessUrl(url);
  } else if (lowerUrl.startsWith('ssr://')) {
    return parseSsrUrl(url);
  } else if (lowerUrl.startsWith('ssd://')) {
    return parseSsdUrl(url);
  } else if (lowerUrl.startsWith('ss://')) {
    return parseSsUrl(url);
  } else if (lowerUrl.startsWith('hysteria2://') || lowerUrl.startsWith('hy2://')) {
    return parseHysteria2Url(url);
  } else if (lowerUrl.startsWith('tuic://')) {
    return parseTuicUrl(url);
  } else if (lowerUrl.startsWith('snell://')) {
    return parseSnellUrl(url);
  } else if (lowerUrl.startsWith('wireguard://')) {
    return parseWireguardUrl(url);
  } else if (lowerUrl.startsWith('anytls://')) {
    return parseAnytlsUrl(url);
  } else if (lowerUrl.startsWith('https://')) {
    return parseHttpsUrl(url);
  } else if (lowerUrl.startsWith('http://')) {
    return parseHttpsUrl(url, false);
  } else if (lowerUrl.startsWith('socks5://')) {
    return parseSocks5Url(url);
  }

  // 不支持的协议
  return null;
}
