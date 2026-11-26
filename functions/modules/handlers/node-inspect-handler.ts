/**
 * 节点网络探测与服务端 TCPing 处理器
 * - POST /api/nodes/inspect: 批量域名 DoH 解析 + IP 地理信息 + CDN/中转/直连识别
 * - POST /api/nodes/tcping: 利用 Cloudflare Workers `cloudflare:sockets` 探测 TCP 连通性与握手耗时
 */

import type { Env } from '../../types.js';
import { createErrorResponse, createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from '../utils.js';
import { inspectNodes, isIpAddress, isPrivateOrReservedIp } from '../../services/node-inspect-service.js';
import { NodeRepository } from '../../repositories/node-repository.js';

const MAX_INSPECT_NODES = 200;
const MAX_TCPING_TARGETS = 30;
const DEFAULT_TCPING_TIMEOUT_MS = 3000;
const MAX_TCPING_TIMEOUT_MS = 8000;

interface SocketAddress {
  hostname: string;
  port: number;
}

interface SocketOptions {
  secureTransport?: 'off' | 'on' | 'starttls';
  allowHalfOpen?: boolean;
}

interface SocketHandle {
  opened: Promise<unknown>;
  close(): Promise<void>;
}

type ConnectFn = (address: string | SocketAddress, options?: SocketOptions) => SocketHandle;

interface CloudflareSocketsModule {
  connect?: ConnectFn;
}

export interface TcpingResultEntry {
  status: 'ok' | 'timeout' | 'error';
  latency: number;
  mode: 'tcping';
  message?: string;
}

export interface NodeTcpingOptions {
  connectFn?: ConnectFn;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function handleNodeInspectRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  let body: Record<string, unknown>;
  try {
    const rawBody = (await readJsonWithLimit(request, JSON_BODY_LIMITS.normal)) as unknown;
    body = isRecord(rawBody) ? rawBody : {};
  } catch (e: unknown) {
    const status = isRecord(e) && typeof e.status === 'number' ? e.status : 400;
    const message = e instanceof Error ? e.message : 'Invalid JSON format';
    return createErrorResponse(status === 413 ? message : 'Invalid JSON format', status);
  }

  const rawNodes = Array.isArray(body?.nodes) ? body.nodes : [];
  if (rawNodes.length === 0) {
    return createJsonResponse({ success: true, results: {} });
  }

  const nodes = rawNodes
    .slice(0, MAX_INSPECT_NODES)
    .filter(
      (item): item is { id: string; url: string } =>
        isRecord(item) && typeof item.id === 'string' && typeof item.url === 'string',
    );

  try {
    const results = await inspectNodes(nodes, env, {
      forceRefresh: Boolean(body?.forceRefresh),
    });

    return createJsonResponse({
      success: true,
      results,
      count: Object.keys(results).length,
    });
  } catch (error: unknown) {
    console.error('[NodeInspect] Failed to inspect nodes:', error);
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`节点信息探测失败: ${message}`, 500);
  }
}

function isUnsafeTcpingHost(host: string): boolean {
  const cleaned = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!cleaned) return true;
  if (cleaned === 'localhost' || cleaned.endsWith('.local') || cleaned.endsWith('.internal')) {
    return true;
  }
  if (isIpAddress(cleaned) && isPrivateOrReservedIp(cleaned)) {
    return true;
  }
  return false;
}

async function probeTcpOnce(
  connectFn: ConnectFn,
  host: string,
  port: number,
  timeoutMs: number,
): Promise<TcpingResultEntry> {
  const start = Date.now();
  let socket: SocketHandle | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    const cleanHost = String(host || '')
      .trim()
      .replace(/^\[|\]$/g, '');
    socket = connectFn({ hostname: cleanHost, port: Number(port) });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error('TCPing timeout') as Error & { code?: string };
        err.code = 'TIMEOUT';
        reject(err);
      }, timeoutMs);
    });

    await Promise.race([socket.opened, timeoutPromise]);
    const latency = Math.max(1, Date.now() - start);
    return { status: 'ok', latency, mode: 'tcping' };
  } catch (error: unknown) {
    if (isRecord(error) && error.code === 'TIMEOUT') {
      return { status: 'timeout', latency: timeoutMs, mode: 'tcping' };
    }
    const message = error instanceof Error && error.message ? error.message : 'TCP connection failed';
    return {
      status: 'error',
      latency: -1,
      mode: 'tcping',
      message,
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (socket && typeof socket.close === 'function') {
      try {
        await socket.close();
      } catch {}
    }
  }
}

export async function handleNodeTcpingRequest(
  request: Request,
  env: Env,
  options: NodeTcpingOptions = {},
): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  let body: Record<string, unknown>;
  try {
    const rawBody = (await readJsonWithLimit(request, JSON_BODY_LIMITS.normal)) as unknown;
    body = isRecord(rawBody) ? rawBody : {};
  } catch (e: unknown) {
    const status = isRecord(e) && typeof e.status === 'number' ? e.status : 400;
    const message = e instanceof Error ? e.message : 'Invalid JSON format';
    return createErrorResponse(status === 413 ? message : 'Invalid JSON format', status);
  }

  const rawTargets = Array.isArray(body?.targets) ? body.targets : [];
  if (rawTargets.length === 0) {
    return createJsonResponse({ success: true, results: {} });
  }

  let connectFn: ConnectFn | null = options.connectFn || null;
  if (!connectFn) {
    try {
      const mod = (await import('cloudflare:sockets')) as CloudflareSocketsModule;
      connectFn = mod?.connect || null;
    } catch {
      connectFn = null;
    }
  }

  if (typeof connectFn !== 'function') {
    return createJsonResponse(
      {
        success: false,
        unsupported: true,
        error: '当前运行环境不支持 Cloudflare Sockets TCPing',
      },
      501,
    );
  }

  const resolvedConnectFn = connectFn;
  const timeoutMs = Math.min(
    Math.max(Number(body?.timeoutMs) || DEFAULT_TCPING_TIMEOUT_MS, 500),
    MAX_TCPING_TIMEOUT_MS,
  );
  const targets = rawTargets.slice(0, MAX_TCPING_TARGETS);
  const results: Record<string, TcpingResultEntry> = {};

  const CONCURRENCY = 10;
  let cursor = 0;

  const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
    while (cursor < targets.length) {
      const rawTarget = targets[cursor++];
      const target = isRecord(rawTarget) ? rawTarget : {};
      const id = String(target?.id || '');
      const host = String(target?.host || '').trim();
      const port = Number(target?.port);

      if (!id) continue;
      if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
        results[id] = { status: 'error', latency: -1, mode: 'tcping', message: 'Invalid host or port' };
        continue;
      }
      if (isUnsafeTcpingHost(host)) {
        results[id] = { status: 'error', latency: -1, mode: 'tcping', message: 'Private or restricted address' };
        continue;
      }

      results[id] = await probeTcpOnce(resolvedConnectFn, host, port, timeoutMs);
    }
  });

  await Promise.allSettled(workers);

  let persistedCount = 0;
  if (body?.persist === true && env) {
    const updates = Object.entries(results).map(([id, item]) => ({
      id,
      latency: item.latency,
      status: item.status,
      mode: item.mode,
    }));
    if (updates.length > 0) {
      try {
        const nodeRepo = new NodeRepository({ env });
        if (nodeRepo.isAvailable()) {
          const updated = await nodeRepo.batchUpdateLatencyStatus(updates);
          persistedCount = updated.length;
        }
      } catch (persistError: unknown) {
        const msg = persistError instanceof Error ? persistError.message : String(persistError);
        console.warn('[NodeInspect] Failed to batch persist tcping results:', msg);
      }
    }
  }

  return createJsonResponse({
    success: true,
    results,
    ...(body?.persist === true ? { persistedCount } : {}),
  });
}
