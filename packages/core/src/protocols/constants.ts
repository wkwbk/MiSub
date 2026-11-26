/**
 * 统一节点协议常量与基础判定（Single Source of Truth）
 */

export const COMMON_NODE_PROTOCOLS = [
  'ss',
  'ssr',
  'vmess',
  'vless',
  'trojan',
  'hysteria',
  'hysteria2',
  'hy',
  'hy2',
  'tuic',
  'anytls',
  'socks5',
  'socks',
  'snell',
  'naive+https',
  'naive+quic',
  'naive+http',
  'http',
  'https',
  'wireguard',
  'wg',
  'mierus',
  'v2rayn',
];

const UDP_ONLY_SCHEMES = new Set(['hysteria', 'hysteria2', 'hy', 'hy2', 'tuic', 'wireguard', 'wg']);

export function createProtocolRegex(protocols: readonly string[], caseInsensitive = true): RegExp {
  const escaped = protocols.map((protocol) => protocol.replace(/\+/g, '\\+'));
  return new RegExp(`^(${escaped.join('|')}):\\/\\/`, caseInsensitive ? 'i' : '');
}

export const NODE_PROTOCOL_PREFIXES = COMMON_NODE_PROTOCOLS.map((protocol) => `${protocol}://`);
export const NODE_PROTOCOL_REGEX = createProtocolRegex(COMMON_NODE_PROTOCOLS);
export const NODE_PROTOCOL_GLOBAL_REGEX = new RegExp(
  `^(${COMMON_NODE_PROTOCOLS.map((protocol) => protocol.replace(/\+/g, '\\+')).join('|')}):\\/\\/`,
  'gm',
);

/**
 * 判断节点链接是否为纯 UDP 协议（浏览器 Fetch 与 Workers TCPing 均无法直接探测 UDP）
 */
export function isUdpOnlyProtocol(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const match = url.trim().match(/^([a-z0-9+.-]+):\/\//i);
  if (!match) return false;
  return UDP_ONLY_SCHEMES.has(match[1].toLowerCase());
}

/**
 * 识别并规范化节点链接的协议名称
 */
export function detectNodeProtocol(url: string): string {
  if (!url || typeof url !== 'string') return 'unknown';
  const match = url.trim().match(/^([a-z0-9+.-]+):\/\//i);
  if (!match) return 'unknown';
  const scheme = match[1].toLowerCase();
  if (scheme === 'hy2') return 'hysteria2';
  if (scheme === 'hy') return 'hysteria';
  if (scheme === 'socks') return 'socks5';
  if (scheme === 'wg') return 'wireguard';
  if (scheme.startsWith('naive+')) return 'naive';
  return scheme;
}
