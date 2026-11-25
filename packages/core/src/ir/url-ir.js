import { urlToClashProxy } from '../protocols/url-to-clash.js';
import { convertClashProxyToUrl } from '../protocols/clash-to-url.js';
import { extractName, parseHostPort, parseQueryParams } from '../protocols/clash-parsers/common.js';
import { extractValidNodes } from '../node/node-parser.js';
import { extractNodeMetadata } from '../node/metadata-extractor.js';
import { isLocalProxyEndpoint } from '../node/node-cleaner.js';
import { clashProxyToNodeIR, nodeIRToClashProxy } from './clash-ir.js';

const HAS_EMOJI_REGEX = /([\u{1F1E6}-\u{1F1FF}]{2}|[\u{1F30D}-\u{1F30F}])/u;

function parseAuthorityAndHost(url, schemeLength) {
  const body = url.slice(schemeLength);
  const hashIndex = body.indexOf('#');
  const beforeHash = hashIndex === -1 ? body : body.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  const authorityAndHost = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  const atIndex = authorityAndHost.lastIndexOf('@');
  const userInfo = atIndex === -1 ? '' : authorityAndHost.slice(0, atIndex);
  const serverPart = atIndex === -1 ? authorityAndHost : authorityAndHost.slice(atIndex + 1);
  const { server, port } = parseHostPort(serverPart);
  return { userInfo, server, port };
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return value || '';
  }
}

function parseNaiveToClashLikeProxy(url, scheme) {
  const { userInfo, server, port } = parseAuthorityAndHost(url, `${scheme}://`.length);
  if (!server || !port) return null;
  const colonIndex = userInfo.indexOf(':');
  const username = colonIndex === -1 ? safeDecode(userInfo) : safeDecode(userInfo.slice(0, colonIndex));
  const password = colonIndex === -1 ? '' : safeDecode(userInfo.slice(colonIndex + 1));
  const params = parseQueryParams(url);
  const name = extractName(url) || `Naive-${server}`;

  const proxy = {
    name,
    type: 'naive',
    scheme,
    server,
    port,
    username,
    password,
    quic: scheme === 'naive+quic',
    tls: scheme !== 'naive+http',
  };
  if (params.get('padding') !== null) {
    const rawPadding = params.get('padding');
    proxy.padding = rawPadding === 'true' ? true : rawPadding === 'false' ? false : rawPadding;
  }
  if (params.get('extra-headers')) proxy['extra-headers'] = params.get('extra-headers');
  const sni = params.get('sni') || params.get('peer');
  if (sni) {
    proxy.sni = sni;
    proxy.servername = sni;
  }
  if (params.get('allowInsecure') === '1' || params.get('insecure') === '1') {
    proxy['skip-cert-verify'] = true;
  }
  return proxy;
}

function parseHysteriaV1ToClashLikeProxy(url) {
  const { userInfo, server, port } = parseAuthorityAndHost(url, 'hysteria://'.length);
  if (!server || !port) return null;
  const params = parseQueryParams(url);
  const password = safeDecode(userInfo) || params.get('auth') || '';
  const name = extractName(url) || `Hysteria-${server}`;

  const proxy = {
    name,
    type: 'hysteria',
    server,
    port,
    password,
    auth: password,
    udp: true,
  };
  if (params.get('protocol')) proxy.protocol = params.get('protocol');
  const sni = params.get('sni') || params.get('peer');
  if (sni) {
    proxy.sni = sni;
    proxy.servername = sni;
  }
  if (params.get('insecure') === '1' || params.get('allowInsecure') === '1') {
    proxy['skip-cert-verify'] = true;
  }
  const up = params.get('up') || (params.get('upmbps') ? `${params.get('upmbps')} Mbps` : '');
  const down = params.get('down') || (params.get('downmbps') ? `${params.get('downmbps')} Mbps` : '');
  if (up) proxy.up = up;
  if (down) proxy.down = down;
  if (params.get('obfs')) proxy.obfs = params.get('obfs');
  const alpn = params.get('alpn');
  if (alpn) proxy.alpn = alpn.split(',');
  return proxy;
}

/**
 * 将单条代理 URI 解析为标准化 NodeIR
 * @param {string} url
 * @param {{ validate?: boolean, extractMetadata?: boolean }} [options]
 * @returns {import('../types.js').NodeIR | null}
 */
export function parseUrlToNodeIR(url, options = {}) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  let clashLikeProxy = null;
  if (lower.startsWith('naive+https://')) {
    clashLikeProxy = parseNaiveToClashLikeProxy(trimmed, 'naive+https');
  } else if (lower.startsWith('naive+quic://')) {
    clashLikeProxy = parseNaiveToClashLikeProxy(trimmed, 'naive+quic');
  } else if (lower.startsWith('naive+http://')) {
    clashLikeProxy = parseNaiveToClashLikeProxy(trimmed, 'naive+http');
  } else if (lower.startsWith('hysteria://')) {
    clashLikeProxy = parseHysteriaV1ToClashLikeProxy(trimmed);
  } else {
    clashLikeProxy = urlToClashProxy(trimmed);
  }

  if (!clashLikeProxy) return null;
  if (options.extractMetadata && !clashLikeProxy.metadata) {
    clashLikeProxy.metadata = extractNodeMetadata(clashLikeProxy.name);
  }
  return clashProxyToNodeIR(clashLikeProxy, {
    validate: options.validate,
    sourceUrl: trimmed,
  });
}

/**
 * 将标准 NodeIR 序列化为代理 URI
 * @param {import('../types.js').NodeIR} ir
 * @returns {string | null}
 */
export function nodeIRToUrl(ir) {
  if (!ir || typeof ir !== 'object') return null;
  const proxy = nodeIRToClashProxy(ir);
  if (!proxy) return null;

  if (ir.protocol === 'socks5' && (proxy.type === 'socks5-tls' || ir.tls?.enabled)) {
    const plainProxy = { ...proxy, type: 'socks5' };
    const baseUrl = convertClashProxyToUrl(plainProxy);
    if (!baseUrl) return null;
    const hashIdx = baseUrl.indexOf('#');
    const beforeHash = hashIdx === -1 ? baseUrl : baseUrl.slice(0, hashIdx);
    const fragment = hashIdx === -1 ? '' : baseUrl.slice(hashIdx);
    const params = new URLSearchParams();
    params.set('tls', '1');
    if (ir.tls?.sni) params.set('sni', ir.tls.sni);
    if (ir.tls?.skipCertVerify) params.set('allowInsecure', '1');
    return `${beforeHash}?${params.toString()}${fragment}`;
  }

  const url = convertClashProxyToUrl(proxy);
  if (!url) return null;

  if (ir.protocol === 'naive+http' && url.startsWith('naive+https://')) {
    return `naive+http://${url.slice('naive+https://'.length)}`;
  }

  return url;
}

/**
 * @typedef {{ enableTfo?: boolean, enableUdp?: boolean, skipCertVerify?: boolean, supportX25519mlkem768?: boolean, addFlagEmoji?: boolean, extractMetadata?: boolean }} NodeIRBatchParseOptions
 */

/**
 * 批量将节点 URL 列表解析并增强为标准 NodeIR 数组
 * @param {string[]} urls
 * @param {NodeIRBatchParseOptions} [options]
 * @returns {import('../types.js').NodeIR[]}
 */
export function parseUrlsToNodeIRs(urls, options = {}) {
  if (!Array.isArray(urls)) return [];

  return /** @type {import('../types.js').NodeIR[]} */ (
    urls
      .map((url) => {
        const ir = parseUrlToNodeIR(url, { extractMetadata: true });
        if (!ir) return null;
        if (isLocalProxyEndpoint(ir)) return null;

        if (options.enableTfo !== undefined) ir.tfo = options.enableTfo;
        if (options.enableUdp !== undefined) {
          const isNativeUdp = ['hysteria2', 'tuic', 'hysteria', 'wireguard'].includes(ir.protocol);
          ir.udp = isNativeUdp ? true : Boolean(options.enableUdp);
        }
        if (options.skipCertVerify) {
          ir.tls = {
            ...(ir.tls || { enabled: false, security: 'none' }),
            skipCertVerify: true,
          };
        }
        if (options.supportX25519mlkem768 !== undefined && ir.tls?.reality) {
          if (options.supportX25519mlkem768) {
            ir.tls.reality.supportX25519mlkem768 = true;
          } else {
            delete ir.tls.reality.supportX25519mlkem768;
          }
        }

        if (options.addFlagEmoji !== false && ir.metadata?.flag && !HAS_EMOJI_REGEX.test(ir.name)) {
          ir.name = `${ir.metadata.flag} ${ir.name}`;
        }

        return ir;
      })
      .filter(Boolean)
  );
}

/**
 * 批量将 NodeIR 数组导出为节点 URI 数组
 * @param {import('../types.js').NodeIR[]} irs
 * @returns {string[]}
 */
export function nodeIRsToUrls(irs) {
  if (!Array.isArray(irs)) return [];
  return /** @type {string[]} */ (irs.map((ir) => nodeIRToUrl(ir)).filter(Boolean));
}

/**
 * 从任意订阅文本（Clash YAML / Sing-box JSON / Base64 / Surge / Quantumult X / URI 列表）提取标准 NodeIR[]
 * @param {string} text
 * @param {NodeIRBatchParseOptions} [options]
 * @returns {import('../types.js').NodeIR[]}
 */
export function parseTextToNodeIRs(text, options = {}) {
  const urls = extractValidNodes(text);
  return parseUrlsToNodeIRs(urls, options);
}
