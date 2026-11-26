import type { SettingsConfig } from '@misub/core/types.js';
import type { BoundRequestContext, Env, StorageAdapter } from '../../../types.js';
import { StorageFactory } from '../../../storage-adapter.js';
import { createErrorResponse, createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from '../../utils.js';
import { DEFAULT_SETTINGS, STORAGE_KEY_SETTINGS } from '../../config.js';
import { enforcePublicApiAccess } from '../../access-control.js';
import { getEdgeCacheVersion } from '../../../services/node-cache-service.js';
import { readEdgeCachedResponse, writeEdgeCachedResponse } from '../security/fetch-guard.js';
import { handleProfileMode, type HandleProfileModeResult } from './profile-handler.js';
import { handleDirectUrlMode, handleSingleSubscriptionMode } from './single-subscription.js';

const PUBLIC_PREVIEW_RATE_WINDOW_MS = 60 * 1000;
const PUBLIC_PREVIEW_RATE_LIMIT_MAX = 20;
const PUBLIC_PREVIEW_RATE_LIMIT_ENTRIES = 500;
const PUBLIC_PREVIEW_CACHE_TTL_SECONDS = 60;
const DEFAULT_PREVIEW_SCOPE = Object.freeze({ __misubPublicPreviewScope: true });

interface PublicPreviewRateLimitEntry {
  count: number;
  resetAt: number;
}

let publicPreviewRateLimits = new WeakMap<object, Map<string, PublicPreviewRateLimitEntry>>();
let publicPreviewInflight = new WeakMap<object, Map<string, Promise<HandleProfileModeResult | Response>>>();

function getPreviewScopeTarget(storageAdapter: StorageAdapter | Record<string, unknown> | null | undefined): object {
  if (!storageAdapter || typeof storageAdapter !== 'object') {
    return DEFAULT_PREVIEW_SCOPE;
  }
  const db = 'db' in storageAdapter ? storageAdapter.db : undefined;
  return db && typeof db === 'object' ? db : storageAdapter;
}

function getPreviewClientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Real-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function pruneRateLimitMap(map: Map<string, PublicPreviewRateLimitEntry>, now: number): void {
  if (map.size <= PUBLIC_PREVIEW_RATE_LIMIT_ENTRIES) return;
  for (const [key, entry] of map.entries()) {
    if (entry.resetAt <= now) {
      map.delete(key);
    }
  }
  while (map.size > PUBLIC_PREVIEW_RATE_LIMIT_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

function checkPublicPreviewRateLimit(
  scopeTarget: object,
  clientIp: string,
  now = Date.now(),
): { limited: boolean; retryAfterSeconds: number } {
  let map = publicPreviewRateLimits.get(scopeTarget);
  if (!map) {
    map = new Map();
    publicPreviewRateLimits.set(scopeTarget, map);
  }

  const existing = map.get(clientIp);
  if (!existing || existing.resetAt <= now) {
    map.set(clientIp, { count: 1, resetAt: now + PUBLIC_PREVIEW_RATE_WINDOW_MS });
    pruneRateLimitMap(map, now);
    return { limited: false, retryAfterSeconds: 0 };
  }

  if (existing.count >= PUBLIC_PREVIEW_RATE_LIMIT_MAX) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { limited: false, retryAfterSeconds: 0 };
}

export function resetPublicPreviewProtectionForTests(): void {
  publicPreviewRateLimits = new WeakMap();
  publicPreviewInflight = new WeakMap();
}

interface PreviewRequestPayload {
  profileId?: string;
  subscriptionId?: string;
  url?: string;
  userAgent?: string;
  skipCertVerify?: boolean;
  plusAsSpace?: boolean;
  applyTransform?: boolean;
  [key: string]: unknown;
}

function asPreviewPayload(data: unknown): PreviewRequestPayload {
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as PreviewRequestPayload) : {};
}

function getErrorStatus(err: unknown): number {
  if (err && typeof err === 'object' && 'status' in err && typeof err.status === 'number') {
    return err.status;
  }
  return 500;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 确定请求模式
 */
function determineRequestMode(requestData: PreviewRequestPayload): 'profile' | 'subscription' | 'direct' | 'unknown' {
  if (requestData.profileId) {
    return 'profile';
  } else if (requestData.subscriptionId) {
    return 'subscription';
  } else if (requestData.url) {
    return 'direct';
  }
  return 'unknown';
}

/**
 * 处理公开订阅组预览请求
 */
export async function handlePublicPreviewRequest(
  request: Request,
  env: Env,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  if (request.method !== 'POST') {
    return createJsonResponse('Method Not Allowed', 405);
  }

  try {
    const requestData = asPreviewPayload(await readJsonWithLimit(request, JSON_BODY_LIMITS.normal));
    const { profileId, userAgent = 'MiSub-Public-Preview/1.0' } = requestData;

    if (!profileId) {
      return createJsonResponse({ error: 'Missing profile ID' }, 400);
    }

    // 验证公开页开关与目标订阅组
    const storageAdapter = StorageFactory.createAdapter(env);
    const rawSettings = await storageAdapter.get<Partial<SettingsConfig>>(STORAGE_KEY_SETTINGS);
    const settings = { ...DEFAULT_SETTINGS, ...rawSettings };
    const blocked = await enforcePublicApiAccess(request, env, settings);
    if (blocked) return blocked;

    const scopeTarget = getPreviewScopeTarget(storageAdapter);
    const rateStatus = checkPublicPreviewRateLimit(scopeTarget, getPreviewClientIp(request));
    if (rateStatus.limited) {
      return createJsonResponse(
        {
          error: 'Too many preview requests. Please try again later.',
          retryAfter: rateStatus.retryAfterSeconds,
        },
        429,
        {
          'Cache-Control': 'no-store, no-cache',
          'Retry-After': String(rateStatus.retryAfterSeconds),
          'X-MiSub-Rate-Limit': 'public-preview',
        },
      );
    }

    const profile =
      typeof storageAdapter.getPublicProfileByIdentifier === 'function'
        ? (await storageAdapter.getPublicProfileByIdentifier(profileId)) ||
          (await storageAdapter.getProfileById(profileId))
        : await storageAdapter.getProfileById(profileId);

    if (!profile || !profile.enabled || !profile.isPublic) {
      return createJsonResponse({ error: 'Profile not found or not public' }, 404);
    }

    const baseVersion = await getEdgeCacheVersion(storageAdapter);
    const cacheVersion = profile.updatedAt ? `${baseVersion}:${String(profile.updatedAt)}` : baseVersion;
    const requestOrigin = new URL(request.url).origin;
    const previewCacheRequest = new Request(
      `${requestOrigin}/__misub_public_preview/${encodeURIComponent(profile.id)}?__v=${encodeURIComponent(cacheVersion)}`,
      { method: 'GET' },
    );

    const cachedResponse = await readEdgeCachedResponse(previewCacheRequest, storageAdapter);
    if (cachedResponse) {
      return cachedResponse;
    }

    const profileRecord = profile as Record<string, unknown>;
    const profileSettings =
      profileRecord.settings && typeof profileRecord.settings === 'object'
        ? (profileRecord.settings as Record<string, unknown>)
        : null;
    // 调用 handleProfileMode 获取节点（公开页默认显示处理后的结果）
    const shouldSkipCertificateVerify = Boolean(
      profileRecord.builtinSkipCertVerify ||
        profileRecord.transformBackendScv ||
        profileRecord.skipCertVerify ||
        profileRecord.skipCertificateVerify ||
        profileSettings?.builtinSkipCertVerify ||
        profileSettings?.transformBackendScv,
    );

    let inflightMap = publicPreviewInflight.get(scopeTarget);
    if (!inflightMap) {
      inflightMap = new Map();
      publicPreviewInflight.set(scopeTarget, inflightMap);
    }

    const inflightKey = previewCacheRequest.url;
    let inflightPromise = inflightMap.get(inflightKey);
    let isLeader = false;
    if (!inflightPromise) {
      isLeader = true;
      inflightPromise = handleProfileMode(request, env, profile.id, userAgent, true, shouldSkipCertificateVerify);
      inflightMap.set(inflightKey, inflightPromise);
    }

    let result: HandleProfileModeResult | Response;
    try {
      result = await inflightPromise;
    } finally {
      if (isLeader && inflightMap.get(inflightKey) === inflightPromise) {
        inflightMap.delete(inflightKey);
      }
    }

    if (result instanceof Response) return result;

    const response = createJsonResponse(result, 200, {
      'X-MiSub-Edge-Cache': 'MISS',
    });
    if (isLeader && result.success) {
      writeEdgeCachedResponse(context, previewCacheRequest, response, PUBLIC_PREVIEW_CACHE_TTL_SECONDS, storageAdapter);
    }
    return response;
  } catch (e) {
    return createErrorResponse(`Preview failed: ${getErrorMessage(e)}`, getErrorStatus(e));
  }
}

/**
 * 处理订阅节点请求的主要入口
 */
export async function handleSubscriptionNodesRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createJsonResponse('Method Not Allowed', 405);
  }

  try {
    const requestData = asPreviewPayload(await readJsonWithLimit(request, JSON_BODY_LIMITS.normal));
    const {
      url: subscriptionUrl,
      subscriptionId,
      profileId,
      userAgent = 'MiSub-Node-Preview/1.0',
      skipCertVerify = false,
      plusAsSpace = false,
    } = requestData;

    // 验证必需参数
    if (!subscriptionUrl && !subscriptionId && !profileId) {
      return createJsonResponse(
        {
          error: '请提供订阅URL、订阅ID或订阅组ID',
        },
        400,
      );
    }

    // 根据参数确定请求模式
    const mode = determineRequestMode(requestData);

    let result: unknown;
    switch (mode) {
      case 'profile':
        result = await handleProfileMode(
          request,
          env,
          String(profileId || ''),
          userAgent,
          requestData.applyTransform !== undefined ? Boolean(requestData.applyTransform) : true,
          Boolean(skipCertVerify),
        );
        break;
      case 'subscription':
        result = await handleSingleSubscriptionMode(
          request,
          env,
          String(subscriptionId || ''),
          userAgent,
          Boolean(skipCertVerify),
        );
        break;
      case 'direct':
        result = await handleDirectUrlMode(
          String(subscriptionUrl || ''),
          userAgent,
          Boolean(skipCertVerify),
          Boolean(plusAsSpace),
        );
        break;
      default:
        return createJsonResponse(
          {
            error: '无效的请求参数',
          },
          400,
        );
    }

    if (result instanceof Response) return result;
    return createJsonResponse(result);
  } catch (e) {
    return createJsonResponse(
      {
        error: `获取节点列表失败: ${getErrorMessage(e)}`,
      },
      getErrorStatus(e),
    );
  }
}
