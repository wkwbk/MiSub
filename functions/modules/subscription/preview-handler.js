import { StorageFactory } from '../../storage-adapter.js';
import { createErrorResponse, createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from '../utils.js';
import { DEFAULT_SETTINGS, STORAGE_KEY_SETTINGS } from '../config.js';
import { enforcePublicApiAccess } from '../access-control.js';
import { handleProfileMode } from './profile-handler.js';
import { handleDirectUrlMode, handleSingleSubscriptionMode } from './single-subscription.js';

/**
 * 确定请求模式
 * @param {Object} requestData - 请求数据
 * @returns {string} 请求模式
 */
export function determineRequestMode(requestData) {
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
 * @param {Object} request - HTTP请求对象
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
export async function handlePublicPreviewRequest(request, env) {
  if (request.method !== 'POST') {
    return createJsonResponse('Method Not Allowed', 405);
  }

  try {
    const requestData = await readJsonWithLimit(request, JSON_BODY_LIMITS.normal);
    const { profileId, userAgent = 'MiSub-Public-Preview/1.0' } = requestData;

    if (!profileId) {
      return createJsonResponse({ error: 'Missing profile ID' }, 400);
    }

    // 验证公开页开关与目标订阅组
    const storageAdapter = StorageFactory.createAdapter(env);
    const rawSettings = await storageAdapter.get(STORAGE_KEY_SETTINGS);
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

    // 调用 handleProfileMode 获取节点（公开页默认显示处理后的结果）
    const shouldSkipCertificateVerify = Boolean(
      profile?.builtinSkipCertVerify ||
      profile?.transformBackendScv ||
      profile?.skipCertVerify ||
      profile?.skipCertificateVerify ||
      profile?.settings?.builtinSkipCertVerify ||
      profile?.settings?.transformBackendScv,
    );
    const result = await handleProfileMode(request, env, profile.id, userAgent, true, shouldSkipCertificateVerify);
    if (result instanceof Response) return result;

    return createJsonResponse(result);
  } catch (e) {
    return createErrorResponse(`Preview failed: ${e.message}`, e.status || 500);
  }
}

/**
 * 处理订阅节点请求的主要入口
 * @param {Object} request - HTTP请求对象
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
export async function handleSubscriptionNodesRequest(request, env) {
  if (request.method !== 'POST') {
    return createJsonResponse('Method Not Allowed', 405);
  }

  try {
    const requestData = await readJsonWithLimit(request, JSON_BODY_LIMITS.normal);
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

    let result;
    switch (mode) {
      case 'profile':
        result = await handleProfileMode(
          request,
          env,
          profileId,
          userAgent,
          requestData.applyTransform !== undefined ? requestData.applyTransform : true,
          skipCertVerify,
        );
        break;
      case 'subscription':
        result = await handleSingleSubscriptionMode(request, env, subscriptionId, userAgent, skipCertVerify);
        break;
      case 'direct':
        result = await handleDirectUrlMode(subscriptionUrl, userAgent, skipCertVerify, plusAsSpace);
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
        error: `获取节点列表失败: ${e.message}`,
      },
      e.status || 500,
    );
  }
}
