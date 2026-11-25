import type { SettingsConfig } from '@misub/core/types.js';
import type { Env } from '../../../types.js';
import { StorageFactory } from '../../../storage-adapter.js';
import { createErrorResponse, createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from '../../utils.js';
import { DEFAULT_SETTINGS, STORAGE_KEY_SETTINGS } from '../../config.js';
import { enforcePublicApiAccess } from '../../access-control.js';
import { handleProfileMode } from './profile-handler.js';
import { handleDirectUrlMode, handleSingleSubscriptionMode } from './single-subscription.js';

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
export async function handlePublicPreviewRequest(request: Request, env: Env): Promise<Response> {
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

    const profile =
      typeof storageAdapter.getPublicProfileByIdentifier === 'function'
        ? (await storageAdapter.getPublicProfileByIdentifier(profileId)) ||
          (await storageAdapter.getProfileById(profileId))
        : await storageAdapter.getProfileById(profileId);

    if (!profile || !profile.enabled || !profile.isPublic) {
      return createJsonResponse({ error: 'Profile not found or not public' }, 404);
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
    const result = await handleProfileMode(request, env, profile.id, userAgent, true, shouldSkipCertificateVerify);
    if (result instanceof Response) return result;

    return createJsonResponse(result);
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
