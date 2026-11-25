/**
 * API路由处理模块 (基于 Hono + Zod 契约校验)
 */

import { Hono } from 'hono';
import { MisubsSaveRequestSchema, NodeCountRequestSchema, ParseSubscriptionRequestSchema } from '@misub/core/schemas';
import { encodeArrayBufferToBase64 } from '@misub/core/utils/base64.js';
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
import { handlePublicPreviewRequest, handleSubscriptionNodesRequest } from './subscription/core/preview-handler.js';
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
import {
  handleClientRequest,
  handlePublicCoresRequest,
  handlePublicLinksRequest,
} from './handlers/public-collection-handler.js';
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
import { redactUrl, safeFetchPublicNetworkUrl, safeFetchPublicUrl, validatePublicFetchUrl } from './security-utils.js';
import { normalizeSubconverterBackend } from './subscription/core/main-handler.js';
import { generateSubconverterIniConfig, VISUAL_RULE_PRESETS } from './subscription/core/visual-rules-builder.js';
import { StorageFactory } from '../storage-adapter.js';
import { STORAGE_KEY_SETTINGS } from './config.js';
import { handleExternalApiRequest } from './external-api/external-api-router.js';
import { ensureStandardRequest, getBoundContext, setBoundContext } from '../middleware/request-context-store.js';
import { adminAuthMiddleware, zodJsonValidator } from '../middleware/hono-middlewares.js';

function isAuthDiagnosticsEnabled(env) {
  return String(env?.ENABLE_AUTH_DIAGNOSTICS || '').toLowerCase() === 'true';
}

async function handleSubconverterConfigRequest(request, env, context) {
  const url = new URL(request.url);
  const rawSelected = url.searchParams.get('selectedRules');
  const rawCustom = url.searchParams.get('customRules');
  const rawGroupByCountry = url.searchParams.get('group_by_country');
  const rawIncludeAuto = url.searchParams.get('include_auto_select');

  let options = {};
  const hasQueryOverrides =
    rawSelected !== null || rawCustom !== null || rawGroupByCountry !== null || rawIncludeAuto !== null;

  if (!hasQueryOverrides) {
    try {
      const savedSettings =
        context?.settings !== undefined
          ? context.settings || {}
          : (await (context?.storage || StorageFactory.createAdapter(env)).get(STORAGE_KEY_SETTINGS)) || {};
      if (savedSettings.builtinTransform) {
        options = savedSettings.builtinTransform;
      }
    } catch {
      // 无存储绑定时回退默认配置
    }
  } else {
    let selectedRules;
    if (!rawSelected) {
      selectedRules = VISUAL_RULE_PRESETS.balanced;
    } else if (VISUAL_RULE_PRESETS[rawSelected]) {
      selectedRules = VISUAL_RULE_PRESETS[rawSelected];
    } else {
      try {
        const parsed = JSON.parse(rawSelected);
        if (!Array.isArray(parsed)) {
          return new Response('Invalid selectedRules parameter', { status: 400 });
        }
        selectedRules = parsed;
      } catch {
        selectedRules = rawSelected
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    let customRules = [];
    if (rawCustom) {
      try {
        const parsedCustom = JSON.parse(rawCustom);
        if (Array.isArray(parsedCustom)) customRules = parsedCustom;
      } catch {
        return new Response('Invalid customRules JSON parameter', { status: 400 });
      }
    }

    options = {
      selectedRules,
      customRules,
      groupByCountry: rawGroupByCountry !== 'false',
      includeAutoSelect: rawIncludeAuto !== 'false',
    };
  }

  const iniContent = generateSubconverterIniConfig(options);
  return new Response(iniContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

/**
 * 构建 /api 子路由（不含 CORS/CSRF 外壳，便于单元测试直接调用与根 Hono 应用挂载）
 */
export function createApiRouter() {
  const apiApp = /** @type {Hono<{ Bindings: Record<string, any>; Variables: Record<string, any> }>} */ (new Hono());

  // 对外开放 API (/api/ext/v1/*) 使用独立 Bearer Token 鉴权
  apiApp.all('/ext/v1', (c) => handleExternalApiRequest(c.req.raw, c.env));
  apiApp.all('/ext/v1/*', (c) => handleExternalApiRequest(c.req.raw, c.env));

  // --- 公开接口 ---
  apiApp.all('/login', (c) => handleLogin(c.req.raw, c.env));
  apiApp.all('/logout', (c) => handleLogout(c.req.raw));
  apiApp.all('/public_config', (c) => handlePublicConfig(c.req.raw, c.env, getBoundContext(c.req.raw, c.env)));
  apiApp.get('/subconverter-config', (c) =>
    handleSubconverterConfigRequest(c.req.raw, c.env, getBoundContext(c.req.raw, c.env)),
  );
  apiApp.all('/public/profiles', (c) =>
    handlePublicProfilesRequest(c.req.raw, c.env, getBoundContext(c.req.raw, c.env)),
  );
  apiApp.all('/public/preview', (c) => handlePublicPreviewRequest(c.req.raw, c.env));

  apiApp.get('/public/guestbook', (c) => handleGuestbookGet(c.req.raw, c.env));
  apiApp.post('/public/guestbook', (c) => handleGuestbookPost(c.req.raw, c.env));
  apiApp.all('/public/guestbook', () => createErrorResponse('Method Not Allowed', 405));

  apiApp.all('/telegram/webhook', async (c) => {
    const { handleTelegramWebhook } = await import('./handlers/telegram-webhook-handler.js');
    return await handleTelegramWebhook(c.req.raw, c.env);
  });

  apiApp.all('/system/error_report', (c) => handleErrorReportRequest(c.req.raw, c.env));
  apiApp.get('/clients', (c) => handleClientRequest(c.req.raw, c.env));
  apiApp.get('/clients/*', (c) => handleClientRequest(c.req.raw, c.env));
  apiApp.get('/public_cores', (c) => handlePublicCoresRequest(c.req.raw, c.env));
  apiApp.get('/public_cores/*', (c) => handlePublicCoresRequest(c.req.raw, c.env));
  apiApp.get('/public_links', (c) => handlePublicLinksRequest(c.req.raw, c.env));
  apiApp.get('/public_links/*', (c) => handlePublicLinksRequest(c.req.raw, c.env));

  apiApp.all('/data', async (c) => {
    if (!(await authMiddleware(c.req.raw, c.env))) {
      return createJsonResponse({
        authenticated: false,
        message: 'Not logged in',
      });
    }
    return await handleDataRequest(c.env, getBoundContext(c.req.raw, c.env) || { env: c.env });
  });

  apiApp.all('/github/release', (c) => handleGithubReleaseRequest(c.req.raw, c.env));
  apiApp.all('/appstore/release', (c) => handleAppStoreReleaseRequest(c.req.raw, c.env));

  apiApp.all('/auth_debug', async (c) => {
    if (!isAuthDiagnosticsEnabled(c.env)) {
      return createErrorResponse('Not Found', 404);
    }
    const debugInfo = await getAuthDebugInfo(c.env);
    const authDiagnostic = await getAuthSessionDiagnostic(c.req.raw, c.env);
    return createJsonResponse({
      success: true,
      auth: authDiagnostic,
      runtime: debugInfo,
    });
  });

  apiApp.post('/auth_check', async (c) => {
    if (!isAuthDiagnosticsEnabled(c.env)) {
      return createErrorResponse('Not Found', 404);
    }
    const diagnostic = await getLoginPasswordDiagnostic(c.req.raw, c.env);
    return createJsonResponse(diagnostic, diagnostic.success ? 200 : 400);
  });
  apiApp.all('/auth_check', (c) => {
    if (!isAuthDiagnosticsEnabled(c.env)) {
      return createErrorResponse('Not Found', 404);
    }
    return createJsonResponse({ error: 'Method Not Allowed' }, 405);
  });

  // --- 以下为管理员会话保护路由 ---
  apiApp.use('*', adminAuthMiddleware);

  apiApp.all('/clients', (c) => handleClientRequest(c.req.raw, c.env));
  apiApp.all('/clients/*', (c) => handleClientRequest(c.req.raw, c.env));
  apiApp.all('/public_cores', (c) => handlePublicCoresRequest(c.req.raw, c.env));
  apiApp.all('/public_cores/*', (c) => handlePublicCoresRequest(c.req.raw, c.env));
  apiApp.all('/public_links', (c) => handlePublicLinksRequest(c.req.raw, c.env));
  apiApp.all('/public_links/*', (c) => handlePublicLinksRequest(c.req.raw, c.env));

  apiApp.all('/test_notification', (c) => handleTestNotificationRequest(c.req.raw, c.env));
  apiApp.all('/telegram/setup', async (c) => {
    const { handleTelegramSetupRequest } = await import('./handlers/telegram/client.js');
    return await handleTelegramSetupRequest(c.req.raw, c.env);
  });

  apiApp.post(
    '/misubs',
    zodJsonValidator(MisubsSaveRequestSchema, {
      maxBytes: JSON_BODY_LIMITS.large,
      skipIf: (c) => {
        const ctx = getBoundContext(c.req.raw, c.env);
        const storage = ctx?.storage || StorageFactory.createAdapter(c.env);
        return !storage || storage.type === 'noop';
      },
      onParseError: (parseError) =>
        createJsonResponse(
          {
            success: false,
            message: parseError.status === 413 ? parseError.message : '请求数据格式错误，请检查数据格式',
          },
          parseError.status || 400,
        ),
      onValidationError: (_error, /** @type {Record<string, any>} */ raw) => {
        if (
          !raw ||
          typeof raw !== 'object' ||
          typeof raw.misubs === 'undefined' ||
          typeof raw.profiles === 'undefined'
        ) {
          return createJsonResponse(
            {
              success: false,
              message: '请求体中缺少 misubs 或 profiles 字段',
            },
            400,
          );
        }
        return createJsonResponse(
          {
            success: false,
            message: 'misubs 和 profiles 必须是数组格式',
          },
          400,
        );
      },
    }),
    (c) => handleMisubsSave(c.req.raw, c.env, getBoundContext(c.req.raw, c.env)),
  );
  apiApp.all('/misubs', (c) => handleMisubsSave(c.req.raw, c.env, getBoundContext(c.req.raw, c.env)));

  apiApp.all('/rule_templates', (c) => handleRuleTemplatesRequest(c.req.raw, c.env));
  apiApp.all('/backup/export', (c) => handleBackupExport(c.req.raw, c.env));
  apiApp.all('/backup/restore', (c) => handleBackupRestore(c.req.raw, c.env));
  apiApp.all('/backup/webdav/test', (c) => handleWebdavBackupTest(c.req.raw, c.env));
  apiApp.all('/backup/webdav/run', (c) => handleManualWebdavBackup(c.req.raw, c.env));
  apiApp.all('/backup/webdav/list', (c) => handleWebdavBackupList(c.req.raw, c.env));
  apiApp.all('/backup/webdav/restore', (c) => handleWebdavRestore(c.req.raw, c.env));

  apiApp.post(
    '/node_count',
    zodJsonValidator(NodeCountRequestSchema, {
      maxBytes: JSON_BODY_LIMITS.normal,
      onValidationError: () => createErrorResponse('Invalid or missing subscription URL', 400),
    }),
    (c) => handleLegacyNodeCountRequest(c.req.raw, c.env),
  );
  apiApp.all('/node_count', (c) => handleLegacyNodeCountRequest(c.req.raw, c.env));

  apiApp.post('/detect_airport_name', async (c) => {
    try {
      const body = await readJsonWithLimit(c.req.raw, JSON_BODY_LIMITS.normal);
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
  });
  apiApp.all('/detect_airport_name', () => createErrorResponse('Method Not Allowed', 405));

  apiApp.all('/nodes/inspect', (c) => handleNodeInspectRequest(c.req.raw, c.env));
  apiApp.all('/nodes/tcping', (c) => handleNodeTcpingRequest(c.req.raw, c.env));
  apiApp.all('/fetch_external_url', (c) => handleExternalFetchRequest(c.req.raw, c.env));
  apiApp.all('/batch_update_nodes', (c) => handleBatchUpdateNodesRequest(c.req.raw, c.env));
  apiApp.all('/subscription_nodes', (c) => handleSubscriptionNodesRequest(c.req.raw, c.env));

  apiApp.post(
    '/parse_subscription',
    zodJsonValidator(ParseSubscriptionRequestSchema, {
      maxBytes: JSON_BODY_LIMITS.large,
      onParseError: (err) =>
        createJsonResponse({ success: false, error: `解析失败: ${err.message}` }, err.status || 400),
      onValidationError: () => createJsonResponse({ success: false, error: '请提供有效的订阅内容' }, 400),
    }),
    (c) => handleParseSubscription(c.req.raw, c.env),
  );
  apiApp.all('/parse_subscription', (c) => handleParseSubscription(c.req.raw, c.env));

  apiApp.all('/subconverter/test', (c) => handleSubconverterTestRequest(c.req.raw, c.env));
  apiApp.all('/shortlink/test', (c) => handleShortLinkTest(c.req.raw, c.env));
  apiApp.all('/shortlink/create', (c) => handleShortLinkCreate(c.req.raw, c.env));

  apiApp.get('/logs', async (c) => {
    const { LogService } = await import('../services/log-service.js');
    const logs = await LogService.getLogs(c.env);
    return createJsonResponse({ success: true, data: logs }, 200, {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    });
  });
  apiApp.delete('/logs', async (c) => {
    const { LogService } = await import('../services/log-service.js');
    const profileId = (c.req.query('profileId') || '').trim();
    const profileName = (c.req.query('profileName') || '').trim();
    await LogService.clearLogs(c.env, { profileId, profileName });
    const storageAdapter = StorageFactory.createAdapter(c.env);
    await storageAdapter.resetProfileDownloadCounts?.(profileId ? { profileId } : {});
    return createJsonResponse({ success: true });
  });
  apiApp.all('/logs', () => createErrorResponse('Method Not Allowed', 405));

  apiApp.get('/settings', (c) => handleSettingsGet(c.env, getBoundContext(c.req.raw, c.env)));
  apiApp.post('/settings', (c) => handleSettingsSave(c.req.raw, c.env, getBoundContext(c.req.raw, c.env)));
  apiApp.all('/settings', () => createJsonResponse('Method Not Allowed', 405));

  apiApp.post('/settings/reset', (c) => handleSettingsReset(c.env));
  apiApp.all('/settings/reset', () => createErrorResponse('Method Not Allowed', 405));

  apiApp.post('/settings/rotate_token', async (c) => {
    const { rotateSubscriptionToken } = await import('./handlers/rotate-token.js');
    const result = await rotateSubscriptionToken(c.env, {
      request: c.req.raw,
      force: true,
      source: 'admin-ui',
    });
    return createJsonResponse({ success: Boolean(result?.rotated), data: result }, result?.rotated ? 200 : 503);
  });
  apiApp.all('/settings/rotate_token', () => createErrorResponse('Method Not Allowed', 405));

  apiApp.get('/guestbook/manage', (c) => handleGuestbookManageGet(c.env));
  apiApp.post('/guestbook/manage', (c) => handleGuestbookManageAction(c.req.raw, c.env));
  apiApp.all('/guestbook/manage', () => createErrorResponse('Method Not Allowed', 405));

  apiApp.notFound(() => createErrorResponse('API route not found', 404));
  apiApp.onError((/** @type {any} */ error) => {
    console.error('[API Router Error]', error);
    return createErrorResponse(error, error?.status || 500);
  });

  return apiApp;
}

export const apiApp = createApiRouter();
const apiRootApp = new Hono().route('/api', apiApp);

/**
 * 处理主要的API请求（向后兼容直接调用入口）
 * @param {Object} request - HTTP请求对象
 * @param {Object} env - Cloudflare环境对象
 * @param {Object|null} [context] - 可选请求上下文
 * @returns {Promise<Response>} HTTP响应
 */
export async function handleApiRequest(request, env, context = null) {
  const stdReq = ensureStandardRequest(request);
  if (context) {
    setBoundContext(stdReq, context);
  }
  return await apiRootApp.fetch(stdReq, env);
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
  /** @type {URL | undefined} */
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
    const response = await safeFetchPublicNetworkUrl(endpoint.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'MiSub/Backend-Test',
        Accept: '*/*',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });
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
    if (error?.status === 400) {
      return createJsonResponse(
        {
          success: false,
          available: false,
          endpoint: endpoint ? `${endpoint.origin}${endpoint.pathname}` : null,
          error: error.message,
          errorType: 'blocked',
        },
        400,
      );
    }
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
 * @param {Object} _env - Cloudflare环境对象
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
  const normalizedTimeout = Math.min(Math.max(Number(timeout) || 15000, 1000), 30000);

  if (!externalUrl || typeof externalUrl !== 'string') {
    return createErrorResponse('Invalid or missing URL parameter. Must be a valid HTTP/HTTPS URL.', 400);
  }

  // 检查URL长度限制
  if (externalUrl.length > 2048) {
    return createErrorResponse('URL too long (max 2048 characters)', 400);
  }

  const urlValidation = validatePublicFetchUrl(externalUrl);
  if (!urlValidation.ok || !urlValidation.url) {
    return createErrorResponse(urlValidation.error || 'Invalid URL', 400);
  }

  try {
    // 创建带超时的请求
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), normalizedTimeout);

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
      errorMessage = `Request timeout after ${normalizedTimeout}ms`;
      errorDetails = { type: 'timeout', timeout: normalizedTimeout };
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
