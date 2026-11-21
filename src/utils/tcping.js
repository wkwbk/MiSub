import { api } from '@/lib/http.js';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';

const UDP_ONLY_SCHEMES = new Set(['hysteria', 'hysteria2', 'hy', 'hy2', 'tuic', 'wireguard', 'wg']);

/**
 * 判断节点链接是否为纯 UDP 协议（浏览器 Fetch 与 Workers TCPing 均无法直接探测 UDP）
 * @param {string} url
 * @returns {boolean}
 */
export function isUdpOnlyProtocol(url) {
  if (!url || typeof url !== 'string') return false;
  const match = url.trim().match(/^([a-z0-9+.-]+):\/\//i);
  if (!match) return false;
  return UDP_ONLY_SCHEMES.has(match[1].toLowerCase());
}

/**
 * 通过 CF Workers `cloudflare:sockets` 批量执行服务端 TCPing
 * @param {Array<{id: string, host: string, port: number|string}>} targets
 * @param {number} timeoutMs
 * @returns {Promise<{results: Record<string, any>, unsupported?: boolean}>}
 */
export async function tcpingNodes(targets, timeoutMs = 3000) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return { results: {} };
  }

  try {
    const data = await api.post(API_ENDPOINTS.NODES_TCPING, {
      targets,
      timeoutMs,
    });
    return {
      results: data?.results || {},
      unsupported: Boolean(data?.unsupported),
    };
  } catch (error) {
    if (error?.status === 501 || error?.data?.unsupported) {
      return { results: {}, unsupported: true };
    }
    throw error;
  }
}
