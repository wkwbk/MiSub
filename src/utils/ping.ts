import { t } from '@/i18n/index.js';
import { api, APIError } from '@/lib/http.js';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';
import { isUdpOnlyProtocol } from '@misub/core/protocols/constants.js';

export { isUdpOnlyProtocol };

export interface PingNodeOptions {
  url?: string;
}

export interface PingNodeResult {
  status: 'ok' | 'timeout' | 'error' | 'unsupported';
  latency: number;
  mode: 'local';
  message?: string;
}

export interface TcpingTarget {
  id: string;
  host: string;
  port: number | string;
}

export interface TcpingEntry {
  status?: string;
  latency?: number;
  message?: string;
  [key: string]: unknown;
}

export interface TcpingResult {
  results: Record<string, TcpingEntry>;
  unsupported?: boolean;
}

/**
 * 代理节点连通性测试工具
 * 1. 本地浏览器模式（pingNode）：利用浏览器的 Fetch API 发送 no-cors 请求触发目标端口 TCP/TLS 握手耗时
 * 2. 服务端 TCPing 模式（tcpingNodes）：利用 Cloudflare Workers `cloudflare:sockets` 探测 TCP 端口连通性
 */

function formatHostForUrl(host: string): string {
  const cleaned = String(host || '')
    .trim()
    .replace(/^\[|\]$/g, '');
  if (!cleaned) return '';
  return cleaned.includes(':') ? `[${cleaned}]` : cleaned;
}

/**
 * 测试单个节点的本地浏览器 HTTP/TLS 握手延迟
 */
export async function pingNode(
  host: string,
  port: number | string,
  timeoutMs = 3000,
  options: PingNodeOptions = {},
): Promise<PingNodeResult> {
  if (!host || !port) {
    return { status: 'error', latency: -1, mode: 'local', message: t('utils.invalidAddressOrPort') };
  }

  if (options?.url && isUdpOnlyProtocol(options.url)) {
    return {
      status: 'unsupported',
      latency: -1,
      mode: 'local',
      message: t('manualNodes.udpPingUnsupported'),
    };
  }

  const formattedHost = formatHostForUrl(host);

  return new Promise((resolve) => {
    const start = performance.now();
    const controller = new AbortController();

    const timeoutId = setTimeout(() => {
      controller.abort();
      resolve({ status: 'timeout', latency: timeoutMs, mode: 'local' });
    }, timeoutMs);

    // 如果我们在 HTTPS 环境下，浏览器强迫阻止发送 http:// 请求（Mixed Content Blocked），
    // 且此拦截不触发正常网络请求耗时。所以必须统一使用 https:// 探测。
    const protocol = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? 'https:' : 'http:';

    // 规避浏览器缓存
    const cacheBuster = Date.now() + Math.random().toString(36).substring(7);
    const testUrl = `${protocol}//${formattedHost}:${port}/__ping_${cacheBuster}`;

    fetch(testUrl, {
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    })
      .then(() => {
        clearTimeout(timeoutId);
        const latency = Math.round(performance.now() - start);
        resolve({ status: 'ok', latency, mode: 'local' });
      })
      .catch((err: unknown) => {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') {
          resolve({ status: 'timeout', latency: timeoutMs, mode: 'local' });
        } else {
          // Fetch failed 意味着端口拒绝连接，或者 TLS 握手失败/被主动断开（如 Vmess/SS 服务器收到不合规请求）
          // 这个拒绝的耗时代表了我们到对方的真实 TCP(或加TLS) 的 RTT
          const latency = Math.round(performance.now() - start);
          resolve({ status: 'ok', latency, mode: 'local' });
        }
      });
  });
}

/**
 * 通过 CF Workers `cloudflare:sockets` 批量执行服务端 TCPing
 */
export async function tcpingNodes(
  targets: TcpingTarget[],
  timeoutMs = 3000,
): Promise<TcpingResult> {
  if (!Array.isArray(targets) || targets.length === 0) {
    return { results: {} };
  }

  try {
    const data = await api.post<{ results?: Record<string, TcpingEntry>; unsupported?: boolean }>(
      API_ENDPOINTS.NODES_TCPING,
      {
        targets,
        timeoutMs,
      },
    );
    return {
      results: data?.results || {},
      unsupported: Boolean(data?.unsupported),
    };
  } catch (error: unknown) {
    const status =
      error instanceof APIError
        ? error.status
        : typeof error === 'object' && error !== null
          ? (error as { status?: unknown }).status
          : undefined;
    const unsupported =
      error instanceof APIError
        ? error.data?.unsupported
        : typeof error === 'object' && error !== null
          ? (error as { data?: { unsupported?: unknown } }).data?.unsupported
          : undefined;
    if (status === 501 || unsupported) {
      return { results: {}, unsupported: true };
    }
    throw error;
  }
}
