/**
 * Clash 协议解析公共工具函数
 */
import { base64ToUtf8 } from '../../utils/base64.js';

const VIRTUAL_INFO_NODE_PASSWORD = '00000000-0000-0000-0000-000000000000';

export function isVirtualInfoProxy(proxy: unknown): boolean {
  if (!proxy || typeof proxy !== 'object') return false;
  const p = proxy as Record<string, unknown>;

  const type = String(p.type || '').toLowerCase();
  const server = String(p.server || '')
    .trim()
    .toLowerCase();
  const password = String(p.password || '').trim();
  const name = String(p.name || '').trim();

  return (
    type === 'trojan' &&
    server === '127.0.0.1' &&
    Number(p.port) === 443 &&
    password === VIRTUAL_INFO_NODE_PASSWORD &&
    /(?:流量剩余|到期时间|您的订阅已到期)/.test(name)
  );
}

/**
 * 解析 URL 查询参数
 */
export function parseQueryParams(url: string): URLSearchParams {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return new URLSearchParams();

  const hashIndex = url.indexOf('#');
  const queryString = hashIndex > queryIndex ? url.substring(queryIndex + 1, hashIndex) : url.substring(queryIndex + 1);

  return new URLSearchParams(queryString);
}

/**
 * 从 URL 提取节点名称
 */
export function extractName(url: string): string {
  const hashIndex = url.lastIndexOf('#');
  if (hashIndex === -1) return '';
  try {
    return decodeURIComponent(url.substring(hashIndex + 1));
  } catch {
    return url.substring(hashIndex + 1);
  }
}

/**
 * Base64 解码支持 (处理 URL Safe)
 */
export function base64Decode(str: string): string {
  try {
    return base64ToUtf8(str);
  } catch {
    // 回退到纯 atob
    try {
      return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    } catch {
      return str;
    }
  }
}

/**
 * 解析服务器和端口
 */
export function parseHostPort(hostPort: string): { server: string; port: number } {
  // 处理 IPv6: [::1]:port
  if (hostPort.startsWith('[')) {
    const closeBracket = hostPort.indexOf(']');
    if (closeBracket !== -1) {
      const server = hostPort.substring(1, closeBracket);
      const after = hostPort.substring(closeBracket + 1);
      const port = after.startsWith(':') ? parseInt(after.substring(1)) : 443;
      return { server, port };
    }
  }

  const parts = hostPort.split(':');
  if (parts.length > 2 && parts[0] === '') {
    const port = parseInt(parts[parts.length - 1]) || 443;
    return { server: parts.slice(0, -1).join(':'), port };
  }
  return {
    server: parts[0],
    port: parseInt(parts[1]) || 443,
  };
}
