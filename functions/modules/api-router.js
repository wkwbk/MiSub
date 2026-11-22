/**
 * API路由处理模块
 * 处理所有API请求的路由分发
 */

import { encodeArrayBufferToBase64 } from '../../shared/base64.js';
import {
  createErrorResponse,
  createJsonResponse,
  getAuthDebugInfo,
  JSON_BODY_LIMITS,
  readJsonWithLimit,
} from './utils.js';
import {
  authMiddleware,
  getAuthSessionDiagnostic,
  getLoginPasswordDiagnostic,
  handleLogin,
  handleLogout,
} from './auth-middleware.js';
import {
  handleDataRequest,
  handleMisubsSave,
  handlePublicConfig,
  handlePublicProfilesRequest,
  handleSettingsGet,
  handleSettingsReset,
  handleSettingsSave,
} from './api-handler.js';
import { handleRuleTemplatesRequest } from './handlers/rule-template-handler.js';
import { handlePublicPreviewRequest, handleSubscriptionNodesRequest } from './subscription/preview-handler.js';
import {
  handleBackupExport,
  handleBackupRestore,
  handleManualWebdavBackup,
  handleWebdavBackupList,
  handleWebdavBackupTest,
  handleWebdavRestore,
} from './handlers/webdav-backup-handler.js';
import { handleTestNotificationRequest } from './notifications.js';
import {
  handleBatchUpdateNodesRequest,
  handleNodeCountRequest as handleLegacyNodeCountRequest,
} from './handlers/node-handler.js';
import { handleNodeInspectRequest, handleNodeTcpingRequest } from './handlers/node-inspect-handler.js';
import { handleClientRequest } from './handlers/client-handler.js';
import { handleErrorReportRequest } from './handlers/error-report-handler.js';
import {
  handleGuestbookGet,
  handleGuestbookManageAction,
  handleGuestbookManageGet,
  handleGuestbookPost,
} from './handlers/guestbook-handler.js';
import { handleAppStoreReleaseRequest, handleGithubReleaseRequest } from './handlers/github-proxy-handler.js';
import { handleParseSubscription } from './handlers/parse-subscription-handler.js';
import { handleShortLinkCreate, handleShortLinkTest } from './handlers/shortlink-handler.js';
import { redactUrl, safeFetchPublicUrl, validatePublicFetchUrl } from './security-utils.js';
import { normalizeSubconverterBackend } from './subscription/main-handler.js';
import { handleExternalApiRequest } from './external-api/external-api-router.js';

function isAuthDiagnosticsEnabled(env) {
  return String(env?.ENABLE_AUTH_DIAGNOSTICS || '').toLowerCase() === 'true';
}

/**
 * 处理主要的API请求
 * @param {Object} request - HTTP请求对象
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
export async function handleApiRequest(request, env, context = null) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '');

  if (path.startsWith('/ext/v1')) {
    return await handleExternalApiRequest(request, env);
  }

  if (path === '/login') {
    return await handleLogin(request, env);
  }

  if (path === '/public_config') {
    return await handlePublicConfig(request, env);
  }

  if (path === '/public/profiles') {
    return await handlePublicProfilesRequest(request, env);
  }

  if (path === '/public/preview') {
    return await handlePublicPreviewRequest(request, env);
  }

  // 留言板公开接口
  if (path === '/public/guestbook') {
    if (request.method === 'GET') {
      return await handleGuestbookGet(request, env);
    }
    if (request.method === 'POST') {
      return await handleGuestbookPost(request, env);
    }
    return createErrorResponse('Method Not Allowed', 405);
  }

  // Telegram Push Bot Webhook (公开接口，内部验证)
  if (path === '/telegram/webhook') {
    const { handleTelegramWebhook } = await import('./handlers/telegram-webhook-handler.js');
    return await handleTelegramWebhook(request, env);
  }

  if (path === '/system/error_report') {
    return await handleErrorReportRequest(request, env);
  }

  if (path.startsWith('/clients') && request.method === 'GET') {
    return await handleClientRequest(request, env);
  }

  if (path === '/data') {
    if (!(await authMiddleware(request, env))) {
      return createJsonResponse({
        authenticated: false,
        message: 'Not logged in',
      });
    }

    return await handleDataRequest(env, context || { env });
  }

  if (path === '/github/release') {
    return await handleGithubReleaseRequest(request, env);
  }

  if (path === '/appstore/release') {
    return await handleAppStoreReleaseRequest(request, env);
  }

  // Logout 无需认证（cookie 过期时也需能正常登出）
  if (path === '/logout') {
    return await handleLogout(request);
  }

  // 认证调试端点（默认关闭，不返回敏感值）
  if (path === '/auth_debug') {
    if (!isAuthDiagnosticsEnabled(env)) {
      return createErrorResponse('Not Found', 404);
    }
    const debugInfo = await getAuthDebugInfo(env);
    const authDiagnostic = await getAuthSessionDiagnostic(request, env);

    return createJsonResponse({
      success: true,
      auth: authDiagnostic,
      runtime: debugInfo,
    });
  }

  // 登录密码调试端点（默认关闭，不返回敏感值）
  if (path === '/auth_check') {
    if (!isAuthDiagnosticsEnabled(env)) {
      return createErrorResponse('Not Found', 404);
    }
    if (request.method !== 'POST') {
      return createJsonResponse({ error: 'Method Not Allowed' }, 405);
    }
    const diagnostic = await getLoginPasswordDiagnostic(request, env);
    return createJsonResponse(diagnostic, diagnostic.success ? 200 : 400);
  }

  if (!(await authMiddleware(request, env))) {
    return createJsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (path.startsWith('/clients')) {
    return await handleClientRequest(request, env);
  }

  if (path === '/test_notification') {
    return await handleTestNotificationRequest(request, env);
  }

  if (path === '/telegram/setup') {
    const { handleTelegramSetupRequest } = await import('./handlers/telegram/client.js');
    return await handleTelegramSetupRequest(request, env);
  }

  switch (path) {
    case '/misubs':
      return await handleMisubsSave(request, env, context);

    case '/rule_templates':
      return await handleRuleTemplatesRequest(request, env);

    case '/backup/export':
      return await handleBackupExport(request, env);

    case '/backup/restore':
      return await handleBackupRestore(request, env);

    case '/backup/webdav/test':
      return await handleWebdavBackupTest(request, env);

    case '/backup/webdav/run':
      return await handleManualWebdavBackup(request, env);

    case '/backup/webdav/list':
      return await handleWebdavBackupList(request, env);

    case '/backup/webdav/restore':
      return await handleWebdavRestore(request, env);

    case '/node_count':
      return await handleLegacyNodeCountRequest(request, env);

    case '/detect_airport_name': {
      if (request.method !== 'POST') return createErrorResponse('Method Not Allowed', 405);
      try {
        const body = await readJsonWithLimit(request, JSON_BODY_LIMITS.normal);
        const { inferAirportRootDomain, fetchAirportSiteTitle } = await import('../services/subscription-service.js');
        const rootDomain = inferAirportRootDomain(body?.url || '');
        if (!rootDomain) {
          return createJsonResponse({ success: true, name: '', rootDomain: '' });
        }
        const name = await fetchAirportSiteTitle(rootDomain, { timeout: 5000 });
        return createJsonResponse({ success: true, name, rootDomain });
      } catch (error) {
        return createErrorResponse(`识别失败: ${error.message}`, 400);
      }
    }

    case '/nodes/inspect':
      return await handleNodeInspectRequest(request, env);

    case '/nodes/tcping':
      return await handleNodeTcpingRequest(request, env);

    case '/fetch_external_url':
      return await handleExternalFetchRequest(request, env);

    case '/batch_update_nodes':
      return await handleBatchUpdateNodesRequest(request, env);

    case '/subscription_nodes':
      return await handleSubscriptionNodesRequest(request, env);

    case '/parse_subscription':
      return await handleParseSubscription(request, env);

    case '/subconverter/test':
      return await handleSubconverterTestRequest(request, env);

    case '/shortlink/test':
      return await handleShortLinkTest(request, env);

    case '/shortlink/create':
      return await handleShortLinkCreate(request, env);

    case '/logs':
      if (request.method === 'GET') {
        const { LogService } = await import('../services/log-service.js');
        const logs = await LogService.getLogs(env);
        return createJsonResponse({ success: true, data: logs }, 200, {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        });
      }
      if (request.method === 'DELETE') {
        const { LogService } = await import('../services/log-service.js');
        const profileName = url.searchParams.get('profileName') || '';
        await LogService.clearLogs(env, profileName ? { profileName } : {});
        return createJsonResponse({ success: true });
      }
      return createErrorResponse('Method Not Allowed', 405);

    case '/settings':
      if (request.method === 'GET') {
        return await handleSettingsGet(env);
      }
      if (request.method === 'POST') {
        return await handleSettingsSave(request, env);
      }
      return createJsonResponse('Method Not Allowed', 405);

    case '/settings/reset':
      if (request.method === 'POST') {
        return await handleSettingsReset(env);
      }
      return createErrorResponse('Method Not Allowed', 405);

    case '/guestbook/manage':
      if (request.method === 'GET') {
        return await handleGuestbookManageGet(env);
      }
      if (request.method === 'POST') {
        return await handleGuestbookManageAction(request, env);
      }
      return createErrorResponse('Method Not Allowed', 405);

    default:
      return createErrorResponse('API route not found', 404);
  }
}

export async function handleSubconverterTestRequest(request, _env) {
  if (request.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  let requestData;
  try {
    requestData = await readJsonWithLimit(request, JSON_BODY_LIMITS.normal);
  } catch (e) {
    return createErrorResponse(e.status === 413 ? e.message : 'Invalid JSON format', e.status || 400);
  }

  const { backend, target = 'clash', timeout = 15000 } = requestData || {};
  let endpoint;
  try {
    endpoint = normalizeSubconverterBackend(backend);
  } catch (error) {
    return createJsonResponse(
      {
        success: false,
        error: '转换后端地址无效，请填写域名或 http(s) URL。',
        details: error.message,
      },
      400,
    );
  }

  const safeTarget = /^[a-z0-9_-]{2,32}$/i.test(String(target || '')) ? String(target).toLowerCase() : 'clash';
  const controller = new AbortController();
  const normalizedTimeout = Math.min(Math.max(Number(timeout) || 15000, 3000), 30000);
  const timeoutId = setTimeout(() => controller.abort(), normalizedTimeout);

  try {
    // 使用公开测试节点内容直接传给后端，避免探测时依赖用户订阅链接或 MiSub 回调 URL。
    endpoint.searchParams.set('target', safeTarget);
    endpoint.searchParams.set(
      'url',
      'trojan://password@example.com:443?allowInsecure=1&sni=example.com#MiSub-Test-Node',
    );
    endpoint.searchParams.set('insert', 'false');
    endpoint.searchParams.set('emoji', 'false');
    endpoint.searchParams.set('list', 'false');
    endpoint.searchParams.set('udp', 'true');
    endpoint.searchParams.set('tfo', 'false');
    endpoint.searchParams.set('scv', 'true');
    endpoint.searchParams.set('sort', 'false');

    const startedAt = Date.now();
    const response = await fetch(
      new Request(endpoint.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'MiSub/Backend-Test',
          Accept: '*/*',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      }),
    );
    const elapsedMs = Date.now() - startedAt;
    clearTimeout(timeoutId);

    const text = await response.text();
    const sample = text.slice(0, 200);
    const hasUsableOutput = response.ok && /MiSub-Test-Node|proxies:|proxy-groups:|trojan/i.test(text);

    return createJsonResponse(
      {
        success: hasUsableOutput,
        available: hasUsableOutput,
        status: response.status,
        statusText: response.statusText,
        endpoint: `${endpoint.origin}${endpoint.pathname}`,
        elapsedMs,
        sample,
        message: hasUsableOutput
          ? `第三方转换后端可用，响应 ${response.status}，耗时 ${elapsedMs}ms。`
          : `后端已响应但未返回有效转换结果（HTTP ${response.status}）。`,
      },
      response.ok ? 200 : 502,
    );
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error.name === 'AbortError';
    console.error('[Subconverter Test] Error:', {
      backend: endpoint ? `${endpoint.origin}${endpoint.pathname}` : '[invalid]',
      error: error.message,
      type: isTimeout ? 'timeout' : 'network',
    });
    return createJsonResponse(
      {
        success: false,
        available: false,
        endpoint: endpoint ? `${endpoint.origin}${endpoint.pathname}` : null,
        error: isTimeout ? `测试超时（${normalizedTimeout}ms）` : `无法连接转换后端：${error.message}`,
        errorType: isTimeout ? 'timeout' : 'network',
      },
      502,
    );
  }
}

/**
 * 处理外部URL获取请求
 * @param {Object} request - HTTP请求对象
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
export async function handleExternalFetchRequest(request, _env) {
  if (request.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  let requestData;
  try {
    requestData = await readJsonWithLimit(request, JSON_BODY_LIMITS.normal);
  } catch (e) {
    return createErrorResponse(e.status === 413 ? e.message : 'Invalid JSON format', e.status || 400);
  }

  const { url: externalUrl, timeout = 15000 } = requestData;

  if (!externalUrl || typeof externalUrl !== 'string') {
    return createErrorResponse('Invalid or missing URL parameter. Must be a valid HTTP/HTTPS URL.', 400);
  }

  // 检查URL长度限制
  if (externalUrl.length > 2048) {
    return createErrorResponse('URL too long (max 2048 characters)', 400);
  }

  const urlValidation = validatePublicFetchUrl(externalUrl);
  if (!urlValidation.ok) {
    return createErrorResponse(urlValidation.error, 400);
  }

  try {
    // 创建带超时的请求
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await safeFetchPublicUrl(urlValidation.url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'v2rayN/7.23',
        Accept: '*/*',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[External Fetch] HTTP ${response.status}: ${errorText.substring(0, 200)}`);

      return createJsonResponse(
        {
          error: `Failed to fetch external URL: HTTP ${response.status} ${response.statusText}`,
          status: response.status,
          statusText: response.statusText,
        },
        response.status,
      );
    }

    // 检查内容类型和大小
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
      return createErrorResponse('Content too large (max 10MB limit)', 413);
    }

    const contentType = response.headers.get('content-type') || '';

    // 读取响应体并生成 Base64 兜底内容
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 10 * 1024 * 1024) {
      return createErrorResponse('Response content too large (max 10MB limit)', 413);
    }

    const content = new TextDecoder('utf-8').decode(buffer);
    const contentBase64 = encodeArrayBufferToBase64(buffer);

    // 返回包含原文与 Base64 的结果
    return new Response(
      JSON.stringify({
        content,
        contentBase64,
        contentType,
        size: buffer.byteLength,
        url: externalUrl,
        success: true,
      }),
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      },
    );
  } catch (error) {
    let errorMessage = 'Unknown error occurred';
    let errorDetails = {};

    if (error.name === 'AbortError') {
      errorMessage = `Request timeout after ${timeout}ms`;
      errorDetails = { type: 'timeout', timeout };
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      errorMessage = 'Network error - unable to reach the server';
      errorDetails = { type: 'network', originalError: error.message };
    } else if (error.message.includes('DNS')) {
      errorMessage = 'DNS resolution failed';
      errorDetails = { type: 'dns', originalError: error.message };
    } else {
      errorMessage = `Request failed: ${error.message}`;
      errorDetails = { type: 'unknown', originalError: error.message };
    }

    console.error(`[External Fetch] Error:`, {
      url: redactUrl(externalUrl),
      error: error.message,
      errorType: errorDetails.type,
    });

    return createErrorResponse(errorMessage, error.status || 500);
  }
}
