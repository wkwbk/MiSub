/**
 * 短链服务处理模块（支持 Sink 短链服务）
 */

import type { Env, StorageAdapter } from '../../types.js';
import { StorageFactory } from '../../storage-adapter.js';
import { DEFAULT_SETTINGS, STORAGE_KEY_SETTINGS } from '../config.js';
import { createErrorResponse, createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from '../utils.js';

const SHORT_LINK_TIMEOUT_MS = 10000;
const SLUG_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

interface ShortLinkConfig {
  enabled?: boolean;
  apiUrl?: string;
  apiToken?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeSinkApiUrl(rawUrl: unknown): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('请填写 Sink 服务地址');
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  const withProtocol = hasScheme ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('Sink 服务地址格式无效，请填写合法的域名或 URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Sink 服务地址仅支持 http 或 https 协议');
  }

  if (!parsed.hostname) {
    throw new Error('Sink 服务地址缺少有效域名');
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${normalizedPath}`;
}

export function validateShortSlug(rawSlug: unknown): string {
  const slug = String(rawSlug || '').trim();
  if (!slug) return '';
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error('自定义后缀仅支持 1-64 位字母、数字、连字符(-)和下划线(_)');
  }
  return slug;
}

function normalizeTargetUrl(rawUrl: unknown): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('目标链接不能为空');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('目标链接格式无效');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('目标链接仅支持 http 或 https 协议');
  }
  return parsed.toString();
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = SHORT_LINK_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求 Sink 服务超时，请检查服务地址和网络连通性');
    }
    const message = error instanceof Error && error.message ? error.message : '网络异常';
    throw new Error(`连接 Sink 服务失败: ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function safeParseJson(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : { raw: parsed };
  } catch {
    return { rawText: text.slice(0, 200) };
  }
}

async function loadSavedShortLinkConfig(
  env: Env,
): Promise<{ storageAdapter: StorageAdapter; config: ShortLinkConfig }> {
  const storageAdapter = StorageFactory.createAdapter(env) as unknown as StorageAdapter;
  const loadedSettings = await storageAdapter.get<Record<string, unknown>>(STORAGE_KEY_SETTINGS, 'json', {
    fresh: true,
  });
  const rawSettings = isRecord(loadedSettings) ? loadedSettings : {};
  const rawShortLink = isRecord(rawSettings.shortLink) ? (rawSettings.shortLink as ShortLinkConfig) : {};
  const merged: ShortLinkConfig = {
    ...DEFAULT_SETTINGS.shortLink,
    ...rawShortLink,
  };
  return { storageAdapter, config: merged };
}

/**
 * 测试 Sink 连接与 Token 有效性
 * POST /api/shortlink/test
 */
export async function handleShortLinkTest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  let body: Record<string, unknown>;
  try {
    const rawBody = (await readJsonWithLimit(request, JSON_BODY_LIMITS.normal)) as unknown;
    body = isRecord(rawBody) ? rawBody : {};
  } catch (error: unknown) {
    const status = isRecord(error) && typeof error.status === 'number' ? error.status : 400;
    const message = error instanceof Error ? error.message : '请求格式错误';
    return createErrorResponse(status === 413 ? message : '请求格式错误', status);
  }

  try {
    const { config: savedConfig } = await loadSavedShortLinkConfig(env);
    const incoming = isRecord(body?.shortLink) ? body.shortLink : body || {};
    const apiUrl = normalizeSinkApiUrl(incoming.apiUrl ?? savedConfig.apiUrl);
    const apiToken = String(incoming.apiToken || '').trim() || String(savedConfig.apiToken || '').trim();

    if (!apiToken) {
      return createJsonResponse({ success: false, message: '请填写 Sink API Token' }, 400);
    }

    const response = await fetchWithTimeout(`${apiUrl}/api/link/list?limit=1`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
        'User-Agent': 'MiSub/ShortLink',
      },
    });

    if (response.status === 401 || response.status === 403) {
      return createJsonResponse(
        { success: false, message: 'Sink Token 验证失败，请检查 NUXT_SITE_TOKEN 是否正确' },
        400,
      );
    }

    if (!response.ok) {
      const errData = await safeParseJson(response);
      const detail =
        (typeof errData?.statusMessage === 'string' && errData.statusMessage) ||
        (typeof errData?.message === 'string' && errData.message) ||
        `HTTP ${response.status}`;
      return createJsonResponse({ success: false, message: `Sink 服务返回异常: ${detail}` }, 502);
    }

    return createJsonResponse({
      success: true,
      message: `连接成功 (${apiUrl})`,
      apiUrl,
    });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : '连接测试失败';
    return createJsonResponse({ success: false, message }, 400);
  }
}

/**
 * 通过 Sink 创建短链（支持随机或自定义后缀，可选同步保存到订阅组）
 * POST /api/shortlink/create
 */
export async function handleShortLinkCreate(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  let body: Record<string, unknown>;
  try {
    const rawBody = (await readJsonWithLimit(request, JSON_BODY_LIMITS.normal)) as unknown;
    body = isRecord(rawBody) ? rawBody : {};
  } catch (error: unknown) {
    const status = isRecord(error) && typeof error.status === 'number' ? error.status : 400;
    const message = error instanceof Error ? error.message : '请求格式错误';
    return createErrorResponse(status === 413 ? message : '请求格式错误', status);
  }

  let targetUrl: string;
  let customSlug: string;
  try {
    targetUrl = normalizeTargetUrl(body?.url);
    customSlug = validateShortSlug(body?.slug);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return createJsonResponse({ success: false, message }, 400);
  }

  try {
    const { storageAdapter, config } = await loadSavedShortLinkConfig(env);
    if (!config.enabled) {
      return createJsonResponse({ success: false, message: '短链服务未启用，请先在「服务设置」中开启' }, 400);
    }

    const apiUrl = normalizeSinkApiUrl(config.apiUrl);
    const apiToken = String(config.apiToken || '').trim();
    if (!apiToken) {
      return createJsonResponse({ success: false, message: '未配置 Sink API Token，请先在「服务设置」中保存' }, 400);
    }

    const payload: { url: string; slug?: string } = { url: targetUrl };
    if (customSlug) {
      payload.slug = customSlug;
    }

    const response = await fetchWithTimeout(`${apiUrl}/api/link/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'MiSub/ShortLink',
      },
      body: JSON.stringify(payload),
    });

    const data = await safeParseJson(response);

    if (response.status === 401 || response.status === 403) {
      return createJsonResponse(
        { success: false, message: 'Sink Token 无效或已过期，请检查「服务设置」中的短链配置' },
        400,
      );
    }

    if (response.status === 409) {
      return createJsonResponse(
        { success: false, message: `自定义后缀 "${customSlug}" 已被占用，请更换其他后缀` },
        409,
      );
    }

    if (!response.ok) {
      const rawMessage = String(data?.statusMessage || data?.message || data?.error || '').trim();
      if (/exist|conflict|duplicate|already/i.test(rawMessage) && customSlug) {
        return createJsonResponse(
          { success: false, message: `自定义后缀 "${customSlug}" 已被占用，请更换其他后缀` },
          409,
        );
      }
      return createJsonResponse(
        {
          success: false,
          message: rawMessage ? `生成短链失败: ${rawMessage}` : `Sink 服务返回错误 (HTTP ${response.status})`,
        },
        502,
      );
    }

    const linkObj = isRecord(data?.link) ? data.link : null;
    const resolvedSlug = String(linkObj?.slug || data?.slug || customSlug || '').trim();
    if (!resolvedSlug) {
      return createJsonResponse({ success: false, message: 'Sink 未返回有效的短链后缀' }, 502);
    }

    const shortUrl = `${apiUrl}/${resolvedSlug}`;

    let savedToProfile = false;
    const profileId = String(body?.profileId || '').trim();
    if (body?.saveToProfile === true && profileId && storageAdapter && storageAdapter.type !== 'noop') {
      try {
        const profiles = await storageAdapter.getAllProfiles();
        const targetIndex = profiles.findIndex(
          (p) => p && (p.id === profileId || p.customId === profileId || p.linkId === profileId),
        );
        if (targetIndex !== -1) {
          const updatedProfiles = profiles.map((p, idx) =>
            idx === targetIndex ? { ...p, shortLink: shortUrl, updatedAt: new Date().toISOString() } : p,
          );
          await storageAdapter.syncAllProfiles(updatedProfiles);
          savedToProfile = true;
        }
      } catch (saveError: unknown) {
        const message = saveError instanceof Error ? saveError.message : String(saveError);
        console.warn('[ShortLink] Failed to persist shortLink to profile:', message);
      }
    }

    return createJsonResponse({
      success: true,
      shortUrl,
      slug: resolvedSlug,
      url: targetUrl,
      savedToProfile,
    });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : '生成短链失败';
    return createJsonResponse({ success: false, message }, 400);
  }
}
