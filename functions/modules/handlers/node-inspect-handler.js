/**
 * 节点网络探测与服务端 TCPing 处理器
 * - POST /api/nodes/inspect: 批量域名 DoH 解析 + IP 地理信息 + CDN/中转/直连识别
 * - POST /api/nodes/tcping: 利用 Cloudflare Workers `cloudflare:sockets` 探测 TCP 连通性与握手耗时
 */

import { createErrorResponse, createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from '../utils.js';
import { inspectNodes, isIpAddress, isPrivateOrReservedIp } from '../../services/node-inspect-service.js';

const MAX_INSPECT_NODES = 200;
const MAX_TCPING_TARGETS = 30;
const DEFAULT_TCPING_TIMEOUT_MS = 3000;
const MAX_TCPING_TIMEOUT_MS = 8000;

/**
 * POST /api/nodes/inspect
 * Body: { nodes: [{ id, url }], forceRefresh?: boolean }
 */
export async function handleNodeInspectRequest(request, env) {
  if (request.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  let body;
  try {
    body = await readJsonWithLimit(request, JSON_BODY_LIMITS.normal);
  } catch (e) {
    return createErrorResponse(e.status === 413 ? e.message : 'Invalid JSON format', e.status || 400);
  }

  const rawNodes = Array.isArray(body?.nodes) ? body.nodes : [];
  if (rawNodes.length === 0) {
    return createJsonResponse({ success: true, results: {} });
  }

  const nodes = rawNodes
    .slice(0, MAX_INSPECT_NODES)
    .filter((item) => item && typeof item.id === 'string' && typeof item.url === 'string');

  try {
    const results = await inspectNodes(nodes, env, {
      forceRefresh: Boolean(body?.forceRefresh),
    });

    return createJsonResponse({
      success: true,
      results,
      count: Object.keys(results).length,
    });
  } catch (error) {
    console.error('[NodeInspect] Failed to inspect nodes:', error);
    return createErrorResponse(`节点信息探测失败: ${error.message}`, 500);
  }
}

function isUnsafeTcpingHost(host) {
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

async function probeTcpOnce(connectFn, host, port, timeoutMs) {
  const start = Date.now();
  let socket = null;
  let timer = null;

  try {
    const cleanHost = String(host || '')
      .trim()
      .replace(/^\[|\]$/g, '');
    socket = connectFn({ hostname: cleanHost, port: Number(port) });

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error('TCPing timeout');
        err.code = 'TIMEOUT';
        reject(err);
      }, timeoutMs);
    });

    await Promise.race([socket.opened, timeoutPromise]);
    const latency = Math.max(1, Date.now() - start);
    return { status: 'ok', latency, mode: 'tcping' };
  } catch (error) {
    if (error?.code === 'TIMEOUT') {
      return { status: 'timeout', latency: timeoutMs, mode: 'tcping' };
    }
    return {
      status: 'error',
      latency: -1,
      mode: 'tcping',
      message: error?.message || 'TCP connection failed',
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (socket && typeof socket.close === 'function') {
      try {
        await socket.close();
      } catch {
        // ignore close errors
      }
    }
  }
}

/**
 * POST /api/nodes/tcping
 * Body: { targets: [{ id, host, port }], timeoutMs?: number }
 */
export async function handleNodeTcpingRequest(request, _env, options = {}) {
  if (request.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  let body;
  try {
    body = await readJsonWithLimit(request, JSON_BODY_LIMITS.normal);
  } catch (e) {
    return createErrorResponse(e.status === 413 ? e.message : 'Invalid JSON format', e.status || 400);
  }

  const rawTargets = Array.isArray(body?.targets) ? body.targets : [];
  if (rawTargets.length === 0) {
    return createJsonResponse({ success: true, results: {} });
  }

  let connectFn = options.connectFn || null;
  if (!connectFn) {
    try {
      const cfSocketsSpecifier = ['cloudflare', 'sockets'].join(':');
      const mod = await import(/* @vite-ignore */ cfSocketsSpecifier);
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

  const timeoutMs = Math.min(
    Math.max(Number(body?.timeoutMs) || DEFAULT_TCPING_TIMEOUT_MS, 500),
    MAX_TCPING_TIMEOUT_MS,
  );
  const targets = rawTargets.slice(0, MAX_TCPING_TARGETS);
  const results = {};

  const CONCURRENCY = 10;
  let cursor = 0;

  const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
    while (cursor < targets.length) {
      const target = targets[cursor++];
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

      results[id] = await probeTcpOnce(connectFn, host, port, timeoutMs);
    }
  });

  await Promise.allSettled(workers);

  return createJsonResponse({
    success: true,
    results,
  });
}
