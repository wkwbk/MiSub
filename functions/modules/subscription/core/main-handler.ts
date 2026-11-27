import type { MisubItem, OperatorRule, ProfileConfig, SettingsConfig, SubscriptionItem } from '@misub/core/types.js';
import type { BoundRequestContext } from '../../../types.js';
import type { RenderOutputBuiltinOptions } from '../../../services/processor-service.js';
import { StorageFactory } from '../../../storage-adapter.js';
import { createRepositories } from '../../../repositories/index.js';
import { base64EncodeUtf8, migrateConfigSettings } from '../../utils.js';
import { formatBytes } from '@misub/core/utils/format-utils.js';
import { generateCombinedNodeList } from '../../../services/subscription-service.js';
import { sendEnhancedTgNotification, tgEscape } from '../../notifications.js';
import { DEFAULT_SETTINGS as defaultSettings } from '../../config.js';
import { normalizeSubPath } from '@misub/core/domain/reserved-paths.js';
import { getProfileSubscriptionId } from '@misub/core/domain/profile-subscription-ref.js';
import {
  createBlockedResponse,
  isBrowserSubAccessAllowed,
  isCrawlerSubAccessBlocked,
} from '../../access-control.js';
import { isSafeUserRegexPattern } from '../../security-utils.js';
import {
  generateCacheKey,
  getEdgeCacheVersion,
  isLikelyPartialAggregateNodeList,
  isSuspiciousNodeCountDrop,
  setCache,
} from '../../../services/node-cache-service.js';
import {
  buildEdgeCacheRequest,
  checkStrictFetchCooldown,
  createStrictRateLimitResponse,
  readEdgeCachedResponse,
  recordStrictFetchCooldown,
  resolveFetchGuardPolicy,
  writeEdgeCachedResponse,
} from '../security/fetch-guard.js';
import { resolveRequestContext } from './request-context.js';
import { resolveNodeListWithCache, type CachedNodeEntry } from '../cache/cache-manager.js';
import { ProcessorService } from '../../../services/processor-service.js';
import { logAccessSuccess, shouldSkipLogging as shouldSkipAccessLog } from '../cache/access-logger.js';
import {
  buildMultiSocksBindings,
  prepareClashProxiesFromNodeList,
  resolveEffectiveMultiSocksConfig,
  resolveEffectivePortalConfig,
  type EffectiveMultiSocksConfig,
  type EffectivePortalConfig,
} from '@misub/core/domain/multi-socks.js';
import { isVirtualInfoProxy } from '@misub/core/protocols/clash-parsers/common.js';
import {
  determineTargetFormat,
  isBrowserAgent,
  isCrawlerOrImAgent,
  isMetaCore,
  shouldRouteToBrowserPortal,
} from './user-agent-utils.js';
import { renderSubscriptionPortalPage } from './portal-page.js';
import { getClientAdapter } from '../adapters/adapter-registry.js';
import { handleProfileMode } from './profile-handler.js';
import { manualProxyKeys, sortShadowrocketNodeList } from './shadowrocket-order.js';

import {
  buildManagedConfigUrl,
  buildUserInfoHeaderFromSubscriptions,
  countSubscriptionNodes,
  extractProxySectionFromBuiltin,
  formatNotificationExpireStatus,
  formatNotificationExpireTime,
  formatSubscriptionExpireTime,
  getCurrentRequestUserInfo,
  maskSensitiveLogValue,
  mergeSubscriptionUserInfo,
  resolveProfileUpdateInterval,
  type SubscriptionRuntimeContext,
} from './userinfo-formatters.js';
import {
  buildExternalSubconverterUrl,
  normalizeSubconverterBackend,
  resolveAddFlagEmoji,
  resolveBuiltinEngineFlags,
  resolveBuiltinRequestOptions,
  resolveEffectiveBuiltinTransform,
  resolveEffectiveEngine,
  resolveEffectiveNodeTransform,
  resolveExternalTemplateConfigUrl,
  resolveTemplateSource,
  resolveTemplateUrl,
  shouldRenderClashYamlProfileTemplateLocally,
  type SubconverterOptionsContainer,
} from './engine-options.js';

export {
  extractProxySectionFromBuiltin,
  buildManagedConfigUrl,
  resolveProfileUpdateInterval,
  formatNotificationExpireTime,
  formatNotificationExpireStatus,
  resolveTemplateUrl,
  resolveTemplateSource,
  resolveExternalTemplateConfigUrl,
  normalizeSubconverterBackend,
  buildExternalSubconverterUrl,
  resolveBuiltinEngineFlags,
  resolveEffectiveEngine,
  resolveBuiltinRequestOptions,
  resolveEffectiveNodeTransform,
  resolveAddFlagEmoji,
  shouldRenderClashYamlProfileTemplateLocally,
};

type RequestWithCf = Request & {
  cf?: {
    country?: string;
    city?: string;
    asOrganization?: string;
    asn?: number;
    [key: string]: unknown;
  };
};

type MisubRuntimeContext = SubscriptionRuntimeContext & {
  request: RequestWithCf;
  env: NonNullable<BoundRequestContext['env']>;
  accessLogPersistenceMode?: string;
  url?: URL;
  startTime?: number;
  logMetadata?: Record<string, unknown>;
  generationStats?: {
    totalNodes?: number;
    sourceCount?: number;
    successCount?: number;
    failCount?: number;
    duration?: number;
    upstreamSuccessCount?: number;
  };
};

type TargetMisubEntry = Partial<MisubItem> & {
  id: string;
  url: string;
  isExpiredNode?: boolean;
  isFromSubProfile?: boolean;
  excludeTraffic?: boolean;
  lastGoodNodeCount?: number;
  nodeCount?: number;
  [key: string]: unknown;
};

function sanitizeQueryRegexRuleText(rawRuleText: string, maxLineLength = 256): string {
  if (typeof rawRuleText !== 'string' || !rawRuleText.trim()) return rawRuleText;
  const lines = rawRuleText.split(/\r?\n/);
  return lines
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '---') return true;
      let body = trimmed;
      if (body.toLowerCase().startsWith('keep:')) {
        body = body.slice('keep:'.length).trim();
      }
      if (!body || body.toLowerCase().startsWith('proto:')) return true;
      const safe = isSafeUserRegexPattern(body, maxLineLength);
      if (!safe) {
        console.warn('[MiSub] Rejected unsafe URL filter regex pattern');
      }
      return safe;
    })
    .join('\n');
}

/**
 * 处理MiSub订阅请求
 */
export async function handleMisubRequest(context: BoundRequestContext): Promise<Response> {
  const ctx = context as MisubRuntimeContext;
  const request = ctx.request;
  const env = ctx.env || {};
  const url = new URL(request.url);
  const userAgentHeader = request.headers.get('User-Agent') || 'Unknown';

  console.log(`\n[MiSub Request] ${request.method} ${maskSensitiveLogValue(url.pathname)}${url.search ? ' ?…' : ''}`);
  console.log(`[MiSub UA] ${userAgentHeader}`);

  const storageAdapter = ctx.storage || StorageFactory.createAdapter(env);
  ctx.storage = storageAdapter;
  const repos = createRepositories(env, ctx);
  const settings = await repos.settings.getMain();

  // 关键：我们在这里定义了 `config`，后续都应该使用它
  const config = migrateConfigSettings({ ...defaultSettings, ...settings }) as SettingsConfig &
    Record<string, unknown>;
  ctx.config = config;
  ctx.accessLogPersistenceMode =
    typeof config.accessLogPersistenceMode === 'string' ? config.accessLogPersistenceMode : 'light';

  // [Subconverter API] 提取 URL 控制参数，用于覆盖默认设置
  const urlInclude = url.searchParams.get('include');
  const urlExclude = url.searchParams.get('exclude');
  const urlRename = url.searchParams.get('rename');
  const urlEmoji = url.searchParams.get('emoji');
  const urlUdp = url.searchParams.get('udp');
  const urlTfo = url.searchParams.get('tfo');
  const urlScv = url.searchParams.get('scv');
  const urlList = url.searchParams.get('list') === 'true';

  const isCrawlerOrIm = isCrawlerOrImAgent(userAgentHeader);
  const blockCrawlerSub = isCrawlerSubAccessBlocked(config);
  const isBrowser = isBrowserAgent(userAgentHeader);

  const allowBrowserSub = isBrowserSubAccessAllowed(config);
  console.log(
    `[MiSub Logic] isCrawlerOrIm: ${isCrawlerOrIm}, BlockCrawlerSub: ${blockCrawlerSub}, isBrowser: ${isBrowser}, AllowBrowserSub: ${allowBrowserSub}`,
  );

  // 开启「拦截 IM 与链接预览爬虫」后，微信/QQ/钉钉/飞书/Telegram 等预览爬虫一律返回伪装响应，且不触发日志与通知
  if (blockCrawlerSub && isCrawlerOrIm && !url.searchParams.has('callback_token')) {
    return createBlockedResponse(config.disguise as Parameters<typeof createBlockedResponse>[0], request.url);
  }

  // 关闭「允许浏览器打开订阅链接」后，任何浏览器直连订阅 URL 一律拦截，代理客户端不受影响
  if (!allowBrowserSub && isBrowser && !url.searchParams.has('callback_token')) {
    return createBlockedResponse(config.disguise as Parameters<typeof createBlockedResponse>[0], request.url);
  }

  context.url = url; // [核心修复] 将 url 挂载到 context，确保后续服务能获取到 debug 参数
  const { token, profileIdentifier } = resolveRequestContext(url, config);

  console.log(
    `[MiSub Parse] Token: ${maskSensitiveLogValue(token)}, Profile: ${maskSensitiveLogValue(profileIdentifier)}`,
  );
  const shouldSkipLogging = shouldSkipAccessLog(userAgentHeader);

  let targetMisubs: TargetMisubEntry[] = [];
  let subName = config.fileName || 'MiSub';
  let isProfileExpired = false;

  const DEFAULT_EXPIRED_NODE = `trojan://00000000-0000-0000-0000-000000000000@127.0.0.1:443#${encodeURIComponent('您的订阅已到期')}`;

  let currentProfile: (ProfileConfig & Record<string, unknown>) | null = null;
  let isExternalMode = false;
  let useBuiltin = true;
  let shouldSkipCertificateVerify = false;
  let shouldEnableUdp = true;

  const initEngineFlags = (targetProf: (ProfileConfig & Record<string, unknown>) | null) => {
    const profileSub = (targetProf?.subconverter || {}) as { engineMode?: string } & SubconverterOptionsContainer;
    const globalSub = (config.subconverter || {}) as { engineMode?: string } & SubconverterOptionsContainer;
    const effectiveEngine = resolveEffectiveEngine({
      searchParams: url.searchParams,
      userAgent: userAgentHeader,
      profileEngineMode: profileSub.engineMode,
      globalEngineMode: globalSub.engineMode,
    });
    isExternalMode = effectiveEngine === 'external';
    useBuiltin = !isExternalMode;
    const flags = resolveBuiltinEngineFlags(config, isExternalMode);
    shouldSkipCertificateVerify = flags.shouldSkipCertificateVerify;
    shouldEnableUdp = flags.shouldEnableUdp;
  };

  // 使用统一的确定目标格式的方法（此方法中包含了处理各类客户端如 Surge 等对应版本的最新支持规则）
  let targetFormat = determineTargetFormat(userAgentHeader, url.searchParams);
  if (url.searchParams.get('client') === 'shadowrocket' && targetFormat !== 'shadowrocket') {
    targetFormat = 'shadowrocket';
  }

  // 检查是否强制刷新（通过 URL 参数）
  const forceRefresh =
    url.searchParams.has('refresh') || url.searchParams.has('nocache') || url.searchParams.has('debug');

  const requestClientIp =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Real-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'N/A';

  // 按请求方地理位置决定规则源下载链路：国内走 gh-proxy 加速，国外直连 GitHub。
  // 缺失地理位置（如本地开发）时按国内处理，gh-proxy 对国外请求同样可用。
  const clientCountryCode = String(request.cf?.country || request.headers.get('CF-IPCountry') || '')
    .trim()
    .toUpperCase();
  const isChinaClient = clientCountryCode ? clientCountryCode === 'CN' : true;

  let fetchGuardPolicy = resolveFetchGuardPolicy(null, config);
  let edgeCacheRequest: Request | null = null;
  const bypassFetchGuard = forceRefresh || url.searchParams.has('callback_token') || shouldSkipLogging;
  const fetchGuardScopeBase = profileIdentifier ? `profile:${profileIdentifier}` : `token:${token}`;
  let fetchGuardScopeKey = fetchGuardScopeBase;

  const wantsBrowserPortal = shouldRouteToBrowserPortal(request, url);
  let effectivePortal: EffectivePortalConfig = resolveEffectivePortalConfig({
    profile: null,
    settings: config,
    subName,
  });
  let effectiveMultiSocks: EffectiveMultiSocksConfig = resolveEffectiveMultiSocksConfig({
    searchParams: url.searchParams,
    profile: null,
    settings: config,
  });
  let isPortalHtmlResponse = false;

  const applyResolvedProfileContext = (
    activeProfile: (ProfileConfig & Record<string, unknown>) | null,
  ): Response | null => {
    effectivePortal = resolveEffectivePortalConfig({
      profile: activeProfile,
      settings: config,
      subName,
    });
    effectiveMultiSocks = resolveEffectiveMultiSocksConfig({
      searchParams: url.searchParams,
      profile: activeProfile,
      settings: config,
    });

    if (wantsBrowserPortal && effectivePortal.mode === 'redirect' && effectivePortal.redirectUrl) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: effectivePortal.redirectUrl,
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'CDN-Cache-Control': 'no-store',
          'Surrogate-Control': 'no-store',
          'X-MiSub-Mode': 'subscription-portal-redirect',
        },
      });
    }

    isPortalHtmlResponse =
      wantsBrowserPortal &&
      (effectivePortal.mode === 'portal' || (effectivePortal.mode === 'redirect' && !effectivePortal.redirectUrl));

    if (
      !isPortalHtmlResponse &&
      effectiveMultiSocks.explicitByQuery &&
      targetFormat === 'base64' &&
      !url.searchParams.has('target') &&
      !url.searchParams.has('base64') &&
      !url.searchParams.has('v2ray') &&
      !url.searchParams.has('trojan')
    ) {
      targetFormat = 'clash';
    }

    return null;
  };

  const isEffectiveMetaCore = (): boolean =>
    isMetaCore(userAgentHeader, url.searchParams) ||
    (effectiveMultiSocks.enabled && effectiveMultiSocks.explicitByQuery && targetFormat === 'clash');

  const evaluateFetchGuard = async (
    activeProfile: (ProfileConfig & Record<string, unknown>) | null,
    expired: boolean,
  ): Promise<Response | null> => {
    fetchGuardPolicy = resolveFetchGuardPolicy(activeProfile, config);
    if (!fetchGuardPolicy.enabled || bypassFetchGuard) {
      return null;
    }

    if (fetchGuardPolicy.mode === 'strict') {
      const strictStatus = await checkStrictFetchCooldown({
        origin: url.origin,
        scopeKey: fetchGuardScopeKey,
        clientIp: requestClientIp,
        minIntervalMs: fetchGuardPolicy.minIntervalMs,
      });
      if (strictStatus.limited) {
        return createStrictRateLimitResponse(strictStatus.retryAfterSeconds, fetchGuardPolicy.minIntervalMinutes);
      }
      return null;
    }

    const baseVersion = await getEdgeCacheVersion(storageAdapter);
    const profileUpdatedAt = activeProfile?.updatedAt ? String(activeProfile.updatedAt) : '';
    const cacheVersion = profileUpdatedAt ? `${baseVersion}:${profileUpdatedAt}` : baseVersion;
    edgeCacheRequest = buildEdgeCacheRequest({
      requestUrl: request.url,
      targetFormat: isPortalHtmlResponse ? 'portal-html' : targetFormat,
      isMeta: isEffectiveMetaCore(),
      isChinaClient,
      cacheVersion,
      isProfileExpired: expired,
    });
    return await readEdgeCachedResponse(edgeCacheRequest, storageAdapter);
  };

  const finalizeGuardedResponse = (response: Response): Response => {
    if (!fetchGuardPolicy.enabled || bypassFetchGuard) {
      return response;
    }
    if (fetchGuardPolicy.mode === 'strict') {
      recordStrictFetchCooldown({
        context,
        origin: url.origin,
        scopeKey: fetchGuardScopeKey,
        clientIp: requestClientIp,
        minIntervalMs: fetchGuardPolicy.minIntervalMs,
      });
    } else if (edgeCacheRequest && response?.status === 200) {
      writeEdgeCachedResponse(context, edgeCacheRequest, response, fetchGuardPolicy.minIntervalSeconds, storageAdapter);
    }
    return response;
  };

  if (profileIdentifier) {
    const expectedSubPath = normalizeSubPath(typeof config.profileToken === 'string' ? config.profileToken : undefined, 'sub');
    if (!token || token !== expectedSubPath) {
      // [伪装加固] 不使用裸 403 响应，统一走访问控制拦截响应
      return createBlockedResponse(config.disguise as Parameters<typeof createBlockedResponse>[0], request.url);
    }
    currentProfile = (await repos.profiles.getPublicByIdentifier(profileIdentifier)) as
      | (ProfileConfig & Record<string, unknown>)
      | null;
    if (currentProfile?.id) {
      fetchGuardScopeKey = `profile:${currentProfile.id}`;
    }
    initEngineFlags(currentProfile);
    const profile = currentProfile;
    if (profile && profile.enabled) {
      subName = profile.name || subName;
      const portalRedirectResponse = applyResolvedProfileContext(profile);
      if (portalRedirectResponse) {
        return portalRedirectResponse;
      }

      if (profile.expiresAt) {
        const expiryDate = new Date(profile.expiresAt);
        const now = new Date();
        if (now > expiryDate) {
          isProfileExpired = true;
        }
      }

      const guardedResponse = await evaluateFetchGuard(profile, isProfileExpired);
      if (guardedResponse) {
        return guardedResponse;
      }

      if (isProfileExpired) {
        subName = profile.name || subName;
        targetMisubs = [
          {
            id: 'expired-node',
            url: DEFAULT_EXPIRED_NODE,
            name: '您的订阅已到期',
            isExpiredNode: true,
          },
        ];
      } else {
        subName = profile.name || subName;
        targetMisubs = [];
        const subSourceIds = Array.isArray(profile.subscriptions)
          ? profile.subscriptions.map((item) => getProfileSubscriptionId(item)).filter((id): id is string => Boolean(id))
          : [];
        const manualNodeIds = Array.isArray(profile.manualNodes) ? profile.manualNodes.filter(Boolean) : [];
        const relatedSubs = await repos.profiles.getSources(subSourceIds, manualNodeIds);
        const misubMap = new Map(relatedSubs.map((item) => [item.id, item]));

        const profileSubIds = profile.subscriptions || [];
        if (Array.isArray(profileSubIds)) {
          profileSubIds.forEach((item) => {
            // 支持两种格式：纯字符串 ID 或 带有覆盖配置的对象 { id, exclude, operators, ... }
            const isObject = Boolean(item && typeof item === 'object');
            const id = getProfileSubscriptionId(item);
            if (!id) return;

            const baseSub = misubMap.get(id);
            if (baseSub && baseSub.enabled && typeof baseSub.url === 'string' && baseSub.url.startsWith('http')) {
              // 如果是对象，则合并覆盖配置（Profile 级别的设置优先级更高）
              const sub = isObject ? { ...baseSub, ...(item as Record<string, unknown>) } : baseSub;
              targetMisubs.push(sub);
            }
          });
        }

        const profileNodeIds = profile.manualNodes || [];
        if (Array.isArray(profileNodeIds)) {
          profileNodeIds.forEach((id) => {
            const node = misubMap.get(id);
            if (node && node.enabled && typeof node.url === 'string' && !node.url.startsWith('http')) {
              targetMisubs.push(node);
            }
          });
        }

        // 3. Add sub-profiles in order defined by profile (嵌套组合订阅，并发解析并保持顺序)
        const profileSubProfileIds = profile.subProfiles || [];
        if (Array.isArray(profileSubProfileIds) && profileSubProfileIds.length > 0) {
          const validSubProfileIds = profileSubProfileIds.filter(
            (subProfileId) => subProfileId && subProfileId !== profile.id && subProfileId !== profile.customId,
          );
          const visitedBase = [profile.id, profile.customId].filter((v): v is string => Boolean(v));
          const nestedResults = await Promise.all(
            validSubProfileIds.map(async (subProfileId) => {
              try {
                const subResult = await handleProfileMode(
                  request,
                  env,
                  subProfileId,
                  userAgentHeader,
                  true,
                  shouldSkipCertificateVerify,
                  1,
                  new Set(visitedBase),
                );
                return { subProfileId, subResult };
              } catch (err) {
                console.error(`[MainHandler] Failed to resolve sub-profile ${subProfileId}:`, err);
                return { subProfileId, subResult: null };
              }
            }),
          );
          nestedResults.forEach(({ subProfileId, subResult }) => {
            if (subResult && !(subResult instanceof Response) && subResult.success && Array.isArray(subResult.nodes)) {
              subResult.nodes.forEach((node) => {
                targetMisubs.push({
                  id: `nested-${subProfileId}-${node.url}`,
                  name: node.name,
                  url: node.url,
                  tags: [subResult.profileName || '组合订阅'],
                  isFromSubProfile: true,
                  enabled: true,
                });
              });
            }
          });
        }
      }
      // [新增] 增加订阅组下载计数
      // 仅在非回调请求时及非内部请求时增加计数(避免重复计数)
      // 且仅当开启访问日志时才计数
      if (!url.searchParams.has('callback_token') && !shouldSkipLogging && config.enableAccessLog) {
        try {
          context.waitUntil?.(
            Promise.resolve(repos.profiles.incrementDownloadCount(profile.id)).catch((err) =>
              console.error('[Download Count] Failed to update:', err),
            ),
          );
        } catch (err) {
          // 计数失败不影响订阅服务
          console.error('[Download Count] Error:', err);
        }
      }
    } else {
      return new Response('Profile not found or disabled', { status: 404 });
    }
  } else {
    if (!config.myToken || !token || token !== config.myToken) {
      // [伪装加固] 同 profile token：统一走访问控制拦截响应
      return createBlockedResponse(config.disguise as Parameters<typeof createBlockedResponse>[0], request.url);
    }
    const portalRedirectResponse = applyResolvedProfileContext(null);
    if (portalRedirectResponse) {
      return portalRedirectResponse;
    }
    const guardedResponse = await evaluateFetchGuard(null, false);
    if (guardedResponse) {
      return guardedResponse;
    }
    const allMisubs = (await repos.subscriptions.getAll()) || [];
    targetMisubs = allMisubs.filter((s) => s.enabled);
    initEngineFlags(null);
  }

  const updateIntervalHours = resolveProfileUpdateInterval(currentProfile, config);
  const updateIntervalSeconds = (updateIntervalHours || 24) * 3600;

  let prependedContentForSubconverter = '';

  if (isProfileExpired) {
    prependedContentForSubconverter = '';
  } else {
    if (config.enableTrafficNode !== false) {
      const totalUserInfo = mergeSubscriptionUserInfo(context, targetMisubs);
      const profileExpireTimestamp = currentProfile?.expiresAt
        ? Math.floor(new Date(currentProfile.expiresAt).getTime() / 1000)
        : 0;
      const expireTimestamp = profileExpireTimestamp > 0 ? profileExpireTimestamp : totalUserInfo.expire;
      const virtualNodes: string[] = [];

      const totalRemainingBytes = targetMisubs.reduce((acc, sub) => {
        if (!sub?.enabled || sub?.excludeTraffic) return acc;
        const userInfo = getCurrentRequestUserInfo(context, sub);
        if (userInfo && (userInfo.total ?? 0) > 0) {
          const totalBytes = userInfo.total ?? 0;
          const used = (userInfo.upload || 0) + (userInfo.download || 0);
          return acc + Math.max(0, totalBytes - used);
        }
        return acc;
      }, 0);
      if (totalRemainingBytes > 0) {
        const fakeNodeName = `流量剩余 ≫ ${formatBytes(totalRemainingBytes)}`;
        virtualNodes.push(
          `trojan://00000000-0000-0000-0000-000000000000@127.0.0.1:443#${encodeURIComponent(fakeNodeName)}`,
        );
      }

      const expireText = formatSubscriptionExpireTime(expireTimestamp);
      if (expireText) {
        const fakeNodeName = `到期时间 ≫ ${expireText}`;
        virtualNodes.push(
          `trojan://00000000-0000-0000-0000-000000000000@127.0.0.1:443#${encodeURIComponent(fakeNodeName)}`,
        );
      }

      prependedContentForSubconverter = virtualNodes.join('\n');
    }
  }

  const profileSub = (currentProfile?.subconverter || {}) as SubconverterOptionsContainer & { backend?: string };
  const globalSub = (config.subconverter || {}) as SubconverterOptionsContainer & { defaultBackend?: string };

  const globalTemplateUrl = resolveTemplateUrl(config.transformConfigMode, config.transformConfig, '');
  const templateUrl = currentProfile
    ? resolveTemplateUrl(currentProfile.transformConfigMode, currentProfile.transformConfig, globalTemplateUrl)
    : globalTemplateUrl;
  const templateSource = resolveTemplateSource(templateUrl);

  // [逻辑统一] 规则等级：URL 参数 > 订阅组设置 > 全局设置 > 默认值 (std)
  // [重要变更] 如果使用了远程自定义配置 (templateSource.kind === 'remote')，则完全禁用内置等级 (强制为 none)
  const resolvedProfileLevel = String(currentProfile?.ruleLevel || currentProfile?.clashRuleLevel || '');
  const resolvedGlobalLevel = String(config.ruleLevel || config.clashRuleLevel || 'std');

  let ruleLevel: string;
  if (templateSource.kind === 'remote' || templateSource.kind === 'custom') {
    ruleLevel = 'none';
  } else {
    ruleLevel =
      url.searchParams.get('level') || url.searchParams.get('ruleLevel') || resolvedProfileLevel || resolvedGlobalLevel;
  }

  // === 缓存机制：快速响应客户端请求 ===
  const cacheKey = generateCacheKey(profileIdentifier ? 'profile' : 'token', profileIdentifier || token);

  // 定义刷新函数（用于后台刷新）
  const refreshNodes = async (_isBackground = false): Promise<string> => {
    // 组合节点列表
    // 传递 context 对象以获取请求信息用于日志记录
    context.startTime = Date.now();

    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Real-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'N/A';
    const country = request.headers.get('CF-IPCountry') || 'N/A';
    const domain = url.hostname;

    context.logMetadata = {
      clientIp,
      geoInfo: {
        country,
        city: request.cf?.city,
        isp: request.cf?.asOrganization,
        asn: request.cf?.asn,
      },
      format: targetFormat,
      token: profileIdentifier ? profileIdentifier : token,
      type: profileIdentifier ? 'profile' : 'token',
      domain,
    };

    const activeProfile = profileIdentifier ? currentProfile : null;

    // 设置优先级：订阅组设置 > 全局设置 > 内置默认值
    // prefixSettings 回退逻辑
    const globalPrefixSettings = (config.defaultPrefixSettings || {}) as Record<string, unknown>;
    const profilePrefixSettings = activeProfile?.prefixSettings || null;
    const effectivePrefixSettings: Record<string, unknown> = { ...globalPrefixSettings };

    if (profilePrefixSettings && typeof profilePrefixSettings === 'object') {
      if (profilePrefixSettings.enableManualNodes !== null && profilePrefixSettings.enableManualNodes !== undefined) {
        effectivePrefixSettings.enableManualNodes = profilePrefixSettings.enableManualNodes;
      }
      if (
        profilePrefixSettings.enableSubscriptions !== null &&
        profilePrefixSettings.enableSubscriptions !== undefined
      ) {
        effectivePrefixSettings.enableSubscriptions = profilePrefixSettings.enableSubscriptions;
      }
      if (profilePrefixSettings.manualNodePrefix && profilePrefixSettings.manualNodePrefix.trim() !== '') {
        effectivePrefixSettings.manualNodePrefix = profilePrefixSettings.manualNodePrefix;
      }
      if (profilePrefixSettings.prependTagName !== null && profilePrefixSettings.prependTagName !== undefined) {
        effectivePrefixSettings.prependTagName = profilePrefixSettings.prependTagName;
      }
    }

    // 复用统一解析函数（订阅组 > 预设 > 空对象），同时承载 URL emoji 参数透传
    const effectiveNodeTransform = resolveEffectiveNodeTransform(activeProfile, config);

    const operatorsList: OperatorRule[] = Array.isArray(activeProfile?.operators) ? [...activeProfile.operators] : [];
    const nodeTransformObj: Record<string, unknown> = { ...effectiveNodeTransform };
    const generationSettings: Record<string, unknown> & {
      operators: OperatorRule[];
      nodeTransform: Record<string, unknown>;
      ruleLevel?: string;
    } = {
      ...effectivePrefixSettings,
      nodeTransform: nodeTransformObj,
      name: subName,
      operators: operatorsList,
      exclude: urlExclude ? sanitizeQueryRegexRuleText(urlExclude) : activeProfile?.exclude,
      include: urlInclude ? sanitizeQueryRegexRuleText(urlInclude) : activeProfile?.include,
      // [Issue #345] 透传 emoji 开关到内置生成器
      addFlagEmoji: effectiveNodeTransform.addFlagEmoji,
    };

    // [Subconverter API] 动态注入更名算子 (rename=old@new|A@B)
    if (urlRename) {
      const renameGroups = urlRename.split('|').slice(0, 20);
      renameGroups.forEach((group) => {
        const [regex, replace] = group.split('@');
        if (regex) {
          if (!isSafeUserRegexPattern(regex, 256)) {
            console.warn('[MiSub] Rejected unsafe URL rename regex pattern');
            return;
          }
          generationSettings.operators.push({
            type: 'rename',
            enabled: true,
            params: {
              regex: {
                enabled: true,
                rules: [
                  {
                    pattern: regex,
                    replacement: replace || '',
                    flags: 'gi',
                  },
                ],
              },
            },
          });
        }
      });
    }

    // [Subconverter API] 控制 Emoji 注入
    if (urlEmoji === 'false') {
      generationSettings.nodeTransform.addFlagEmoji = false;
      generationSettings.nodeTransform.removeFlagEmoji = true;
    } else if (urlEmoji === 'true') {
      generationSettings.nodeTransform.addFlagEmoji = true;
    }

    const freshNodes = await generateCombinedNodeList(
      context, // 传入完整 context
      { ...config, enableAccessLog: false },
      userAgentHeader,
      targetMisubs as SubscriptionItem[],
      prependedContentForSubconverter,
      {
        ...generationSettings,
        // [强制透传] 确保 ruleLevel 在订阅组内能够生效
        ruleLevel: ruleLevel || generationSettings.ruleLevel,
      },
    );
    const sourceNames = targetMisubs
      .filter((s) => typeof s?.url === 'string' && s.url.startsWith('http'))
      .map((s) => s.name || s.url);
    // 仅在至少一个订阅源真正从远程拉取成功时才刷新缓存时间
    // 如果没有 HTTP 订阅源（纯手动节点/过期订阅组），则始终写入缓存
    const stats = ctx.generationStats;
    if (!stats?.sourceCount || (stats.upstreamSuccessCount ?? 0) > 0) {
      const cacheSaved = await setCache(storageAdapter, cacheKey, freshNodes, sourceNames);
      const freshNodeCount = freshNodes.split('\n').filter((line) => line.trim()).length;
      const existingCache = cacheSaved ? null : await storageAdapter.get<CachedNodeEntry>(cacheKey);
      const existingNodeCount =
        existingCache?.nodeCount ||
        String(existingCache?.nodes || '')
          .split('\n')
          .filter((line) => line.trim()).length;
      if (
        !cacheSaved &&
        (isSuspiciousNodeCountDrop(existingNodeCount, freshNodeCount) || isLikelyPartialAggregateNodeList(freshNodes))
      ) {
        if (
          existingCache?.nodes &&
          String(existingCache.nodes).trim() &&
          !isLikelyPartialAggregateNodeList(existingCache.nodes)
        ) {
          console.warn('[MiSub Cache] Serving preserved aggregate cache after rejecting a suspicious refresh');
          return existingCache.nodes;
        }
      }
    }
    return freshNodes;
  };

  const expectedRemoteNodeCount =
    targetMisubs.reduce((total, sub) => {
      if (!sub?.enabled || typeof sub?.url !== 'string' || !sub.url.startsWith('http')) return total;
      const knownCount = Math.max(Number(sub.lastGoodNodeCount) || 0, Number(sub.nodeCount) || 0);
      return total + (Number.isFinite(knownCount) && knownCount > 0 ? knownCount : 0);
    }, 0) +
    targetMisubs.filter((sub) => sub?.enabled && typeof sub?.url === 'string' && !sub.url.startsWith('http')).length;

  const { combinedNodeList, cacheHeaders } = await resolveNodeListWithCache({
    storageAdapter,
    cacheKey,
    forceRefresh,
    refreshNodes,
    context,
    targetMisubsCount: targetMisubs.length,
    expectedNodeCount: expectedRemoteNodeCount,
    freshTtlMs: fetchGuardPolicy.enabled ? fetchGuardPolicy.minIntervalMs : undefined,
  });

  console.log(`[MiSub Nodes] Count/Length: ${combinedNodeList ? combinedNodeList.length : 0}`);

  const domain = url.hostname;
  const mergedExpireTimestamp = mergeSubscriptionUserInfo(context, targetMisubs).expire;
  const expireTime = formatNotificationExpireTime(currentProfile?.expiresAt, mergedExpireTimestamp);
  const expireStatus = formatNotificationExpireStatus(
    currentProfile?.expiresAt,
    mergedExpireTimestamp,
    Date.now(),
    config.notifyThresholdDays,
  );
  const profileExpireText = `<b>状态:</b> <code>${tgEscape(expireStatus)}</code>\n<b>到期时间:</b> <code>${tgEscape(expireTime)}</code>`;
  const nodeCount = isProfileExpired ? 0 : countSubscriptionNodes(combinedNodeList, prependedContentForSubconverter);
  const nodeCountText = `<b>节点数:</b> <code>${nodeCount}</code>`;

  if (isPortalHtmlResponse) {
    const finalAddFlagEmoji =
      urlEmoji === 'false' ? false : urlEmoji === 'true' ? true : resolveAddFlagEmoji(currentProfile, config);
    const finalPortalSkipCertVerify =
      urlScv !== null ? urlScv === 'true' || urlScv === '1' : shouldSkipCertificateVerify;
    const finalPortalEnableUdp = urlUdp !== null ? urlUdp === 'true' || urlUdp === '1' : shouldEnableUdp;
    const finalPortalEnableTfo = urlTfo === 'true' || urlTfo === '1';

    const mergedInfo = mergeSubscriptionUserInfo(context, targetMisubs);
    const usedBytes = (mergedInfo.upload || 0) + (mergedInfo.download || 0);
    const remainingBytes = Math.max(0, (mergedInfo.total || 0) - usedBytes);
    const preparedProxies = isProfileExpired
      ? []
      : prepareClashProxiesFromNodeList(combinedNodeList, {
          addFlagEmoji: finalAddFlagEmoji,
          skipCertVerify: finalPortalSkipCertVerify,
          enableUdp: finalPortalEnableUdp,
          enableTfo: finalPortalEnableTfo,
        });
    const realProxies = preparedProxies.filter((proxy) => !isVirtualInfoProxy(proxy));
    const bindings = effectiveMultiSocks.enabled ? buildMultiSocksBindings(realProxies, effectiveMultiSocks) : [];

    const portalResponse = await renderSubscriptionPortalPage(
      {
        title: effectivePortal.title,
        subName,
        siteTitle: typeof config.hero?.title1 === 'string' && config.hero.title1 ? config.hero.title1 : config.fileName || 'MiSub',
        notice: effectivePortal.notice,
        subscriptionUrl: buildManagedConfigUrl(request.url),
        pathname: url.pathname,
        isExpired: isProfileExpired,
        traffic: {
          upload: mergedInfo.upload || 0,
          download: mergedInfo.download || 0,
          total: mergedInfo.total || 0,
          remaining: remainingBytes,
        },
        expireText: expireTime,
        expireStatus,
        nodeCount: isProfileExpired ? 0 : realProxies.length,
        defaultLocale: typeof config.defaultLocale === 'string' ? config.defaultLocale : 'zh-CN',
        portalCustomPage: config.portalCustomPage as Record<string, unknown> | undefined,
        multiSocks: {
          enabled: effectiveMultiSocks.enabled,
          listen: effectiveMultiSocks.listen,
          startPort: effectiveMultiSocks.startPort,
          maxPorts: effectiveMultiSocks.maxPorts,
          hasAuth: Boolean(effectiveMultiSocks.username && effectiveMultiSocks.password),
          totalRealNodes: realProxies.length,
          bindings,
        },
      },
      {
        fetchSpaEntry: context.fetchSpaEntry,
      },
    );
    return finalizeGuardedResponse(portalResponse);
  }

  if (targetFormat === 'nodes') {
    const contentToReturn = isProfileExpired ? DEFAULT_EXPIRED_NODE + '\n' : combinedNodeList;
    const userInfoHeader = buildUserInfoHeaderFromSubscriptions(
      context,
      targetMisubs,
      currentProfile?.expiresAt || undefined,
    );
    const nodeHeaders: Record<string, string> = {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-cache',
      'X-MiSub-Mode': 'node-export-plain',
    };
    if (userInfoHeader) {
      nodeHeaders['Subscription-Userinfo'] = userInfoHeader;
    }
    if (updateIntervalHours !== null) {
      nodeHeaders['Profile-Update-Interval'] = String(updateIntervalHours);
    }
    // [兼容性优化] 第三方转换后端对明文列表的支持通常比 Base64 更好。
    // 同时对于 Cloudflare 而言，明文输出更有利于其边缘节点的流式处理。
    return finalizeGuardedResponse(
      new Response(contentToReturn, {
        headers: nodeHeaders,
      }),
    );
  }

  if (isExternalMode && targetFormat !== 'base64') {
    if (
      shouldRenderClashYamlProfileTemplateLocally({
        isExternalMode,
        targetFormat,
        templateSource,
      })
    ) {
      try {
        const userInfoHeader = buildUserInfoHeaderFromSubscriptions(
          context,
          targetMisubs,
          currentProfile?.expiresAt || undefined,
        );
        const finalYamlSkipCertVerify =
          urlScv !== null ? urlScv === 'true' || urlScv === '1' : shouldSkipCertificateVerify;
        const finalYamlEnableUdp = urlUdp !== null ? urlUdp === 'true' || urlUdp === '1' : shouldEnableUdp;
        const finalYamlAddFlagEmoji =
          urlEmoji === 'false' ? false : urlEmoji === 'true' ? true : resolveAddFlagEmoji(currentProfile, config);
        const managedUrl = buildManagedConfigUrl(request.url);
        const builtinOptions: RenderOutputBuiltinOptions = {
          ...resolveBuiltinRequestOptions({
            searchParams: url.searchParams,
            userAgent: userAgentHeader,
          }),
          // 透传 emoji 开关到内置生成器（url-to-clash.js 读 options.addFlagEmoji）。
          // 漏传时 `undefined !== false` 恒为 true，导致无条件加国旗。
          addFlagEmoji: finalYamlAddFlagEmoji,
          fileName: subName,
          managedConfigUrl: managedUrl,
          interval: updateIntervalSeconds,
          skipCertVerify: finalYamlSkipCertVerify,
          enableUdp: finalYamlEnableUdp,
          enableTfo: urlTfo === 'true' || urlTfo === '1',
          ruleLevel,
          regionOverrides: (Array.isArray(config.regionOverrides)
            ? config.regionOverrides
            : []) as unknown as RenderOutputBuiltinOptions['regionOverrides'],
          isMeta: isEffectiveMetaCore(),
          multiSocks: effectiveMultiSocks.enabled && targetFormat === 'clash' ? effectiveMultiSocks : null,
          customDnsOverride: typeof config.customDnsOverride === 'string' ? config.customDnsOverride : '',
          dnsMode:
            url.searchParams.get('dns-mode') ||
            url.searchParams.get('dnsMode') ||
            (typeof config.dnsMode === 'string' ? config.dnsMode : '') ||
            'clean',
          isChinaClient,
          builtinTransform: resolveEffectiveBuiltinTransform(currentProfile, config),
        };
        const rendered = await ProcessorService.renderOutput({
          targetFormat,
          combinedNodeList: isProfileExpired ? DEFAULT_EXPIRED_NODE + '\n' : combinedNodeList,
          subName,
          config,
          builtinOptions,
          templateSource,
          managedConfigUrl: managedUrl,
          storageAdapter,
          userInfoHeader: userInfoHeader || undefined,
        });

        if (rendered.headers?.['X-MiSub-Template-Mode'] === 'clash-yaml-profile') {
          const responseHeaders = new Headers({
            'Content-Type': rendered.contentType || 'application/x-yaml; charset=utf-8',
            'Cache-Control': 'no-store, no-cache',
            'X-MiSub-Mode': 'local-clash-yaml-profile-template',
          });
          if (userInfoHeader) {
            responseHeaders.set('Subscription-Userinfo', userInfoHeader);
          }
          if (updateIntervalHours !== null) {
            responseHeaders.set('Profile-Update-Interval', String(updateIntervalHours));
          }
          Object.entries(rendered.headers || {}).forEach(([key, value]) => responseHeaders.set(key, value));
          return finalizeGuardedResponse(new Response(rendered.content, { headers: responseHeaders }));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[ExternalTemplate] Local Clash YAML profile render failed, falling back to external redirect:', msg);
      }
    }

    const backend = url.searchParams.get('backend') || profileSub.backend || globalSub.defaultBackend;
    const externalNodeList = isProfileExpired ? DEFAULT_EXPIRED_NODE + '\n' : combinedNodeList;
    const externalUrl = buildExternalSubconverterUrl({
      backend,
      targetFormat,
      nodeList: externalNodeList,
      requestUrl: request.url,
      profileSub,
      globalSub,
      userAgent: userAgentHeader,
      searchParams: url.searchParams,
      templateSource,
      subName,
    });

    if (!url.searchParams.has('callback_token') && !shouldSkipLogging && config.enableAccessLog) {
      const clientIp =
        request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Real-IP') ||
        request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
        'N/A';
      context.waitUntil?.(
        sendEnhancedTgNotification(
          config,
          '🛰️ <b>订阅被访问</b> (第三方转换)',
          clientIp,
          `<b>域名:</b> <code>${tgEscape(domain)}</code>\n<b>请求格式:</b> <code>${tgEscape(targetFormat)}</code>\n<b>客户端:</b> <code>${tgEscape(userAgentHeader)}</code>\n<b>订阅组:</b> <code>${tgEscape(subName)}</code>\n${nodeCountText}\n${profileExpireText}`,
        ),
      );
    }

    // [重要修复] 使用手动构建出的 302 响应，以确保头部是可变的 (Mutable)
    const redirectHeaders: Record<string, string> = {
      Location: externalUrl.toString(),
      'Cache-Control': 'no-store, no-cache',
      'X-MiSub-Mode': 'external-redirect-v2',
      ...(templateSource.kind === 'builtin'
        ? { 'X-MiSub-Template-Warning': 'external-engine-ignores-builtin-template' }
        : {}),
    };
    const userInfoHeader = buildUserInfoHeaderFromSubscriptions(
      context,
      targetMisubs,
      currentProfile?.expiresAt || undefined,
    );
    if (userInfoHeader) {
      redirectHeaders['Subscription-Userinfo'] = userInfoHeader;
    }
    if (updateIntervalHours !== null) {
      redirectHeaders['Profile-Update-Interval'] = String(updateIntervalHours);
    }
    return finalizeGuardedResponse(
      new Response(null, {
        status: 302,
        headers: redirectHeaders,
      }),
    );
  }

  if (targetFormat === 'base64') {
    const isShadowrocketOrderedFeed = url.searchParams.get('node-order') === 'manual-region';
    let contentToEncode: string;
    if (isProfileExpired) {
      contentToEncode = DEFAULT_EXPIRED_NODE + '\n';
    } else if (isShadowrocketOrderedFeed) {
      contentToEncode = sortShadowrocketNodeList(combinedNodeList, manualProxyKeys(targetMisubs), {
        compactNames: url.searchParams.get('compact') === '1',
      });
    } else {
      contentToEncode = combinedNodeList;
    }
    const userInfoHeader = buildUserInfoHeaderFromSubscriptions(
      context,
      targetMisubs,
      currentProfile?.expiresAt || undefined,
    );
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-cache',
    };
    if (userInfoHeader) {
      headers['Subscription-Userinfo'] = userInfoHeader;
    }
    if (updateIntervalHours !== null) {
      headers['Profile-Update-Interval'] = String(updateIntervalHours);
    }
    Object.entries(cacheHeaders).forEach(([key, value]) => {
      headers[key] = value;
    });

    if (!url.searchParams.has('callback_token') && !shouldSkipLogging) {
      // 发送 Telegram 通知（独立于访问日志开关，只需配置 BotToken 和 ChatID）
      const clientIp =
        request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Real-IP') ||
        request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
        'N/A';
      context.waitUntil?.(
        sendEnhancedTgNotification(
          config,
          '🛰️ <b>订阅被访问</b>',
          clientIp,
          `<b>域名:</b> <code>${tgEscape(domain)}</code>\n<b>请求格式:</b> <code>${tgEscape(targetFormat)}</code>\n<b>客户端:</b> <code>${tgEscape(userAgentHeader)}</code>\n<b>订阅组:</b> <code>${tgEscape(subName)}</code>\n${nodeCountText}\n${profileExpireText}`,
        ),
      );

      // 访问日志（需要 enableAccessLog 开关）
      if (config.enableAccessLog) {
        logAccessSuccess({
          context,
          env,
          request,
          userAgentHeader,
          targetFormat,
          token,
          profileIdentifier,
          profileId: currentProfile?.id || null,
          subName,
          domain,
        });
      }
    }

    return finalizeGuardedResponse(new Response(base64EncodeUtf8(contentToEncode), { headers }));
  }

  // [Subconverter API] URL 参数优先级高于全局/Profile 设置
  const finalSkipCertVerify = urlScv !== null ? urlScv === 'true' || urlScv === '1' : shouldSkipCertificateVerify;
  const finalEnableUdp = urlUdp !== null ? urlUdp === 'true' || urlUdp === '1' : shouldEnableUdp;
  const finalEnableTfo = urlTfo === 'true' || urlTfo === '1';

  const finalAddFlagEmoji =
    urlEmoji === 'false' ? false : urlEmoji === 'true' ? true : resolveAddFlagEmoji(currentProfile, config);

  const builtinOptions: RenderOutputBuiltinOptions = {
    ...resolveBuiltinRequestOptions({
      searchParams: url.searchParams,
      userAgent: userAgentHeader,
    }),
    // 透传 emoji 开关到内置生成器（url-to-clash.js 读 options.addFlagEmoji）。
    // 漏传时 `undefined !== false` 恒为 true，导致无条件加国旗。
    addFlagEmoji: finalAddFlagEmoji,
    fileName: subName,
    managedConfigUrl: '',
    interval: updateIntervalSeconds,
    skipCertVerify: finalSkipCertVerify,
    enableUdp: finalEnableUdp,
    enableTfo: finalEnableTfo,
    ruleLevel: ruleLevel, // 统一后的规则等级
    regionOverrides: (Array.isArray(config.regionOverrides)
      ? config.regionOverrides
      : []) as unknown as RenderOutputBuiltinOptions['regionOverrides'],
    isMeta: isEffectiveMetaCore(),
    multiSocks: effectiveMultiSocks.enabled && targetFormat === 'clash' ? effectiveMultiSocks : null,
    customDnsOverride: typeof config.customDnsOverride === 'string' ? config.customDnsOverride : '',
    dnsMode:
      url.searchParams.get('dns-mode') ||
      url.searchParams.get('dnsMode') ||
      (typeof config.dnsMode === 'string' ? config.dnsMode : '') ||
      'clean',
    isChinaClient,
    builtinTransform: resolveEffectiveBuiltinTransform(currentProfile, config),
    ...(targetFormat === 'shadowrocket'
      ? {
          preferredProxyKeys: manualProxyKeys(targetMisubs),
          compactNames: url.searchParams.get('compact') !== '0',
        }
      : {}),
  };

  const managedConfigUrl = buildManagedConfigUrl(request.url);

  const shouldUseBuiltin = useBuiltin && Boolean(getClientAdapter(targetFormat));

  if (shouldUseBuiltin) {
    try {
      const userInfoHeader = buildUserInfoHeaderFromSubscriptions(
        context,
        targetMisubs,
        currentProfile?.expiresAt || undefined,
      );

      let {
        content: finalContent,
        contentType,
        headers: resultHeaders,
        fileName: resultFileName,
      } = await ProcessorService.renderOutput({
        targetFormat,
        combinedNodeList,
        subName,
        config,
        builtinOptions,
        templateSource,
        managedConfigUrl,
        storageAdapter,
        userInfoHeader: userInfoHeader || undefined,
        ruleBundleContext:
          targetFormat === 'shadowrocket'
            ? {
                storageAdapter,
                isChinaClient,
                waitUntil:
                  typeof context.waitUntil === 'function' ? (p: Promise<unknown>) => context.waitUntil?.(p) : undefined,
              }
            : undefined,
      });

      // [Subconverter API] 处理 list=true 逻辑：仅输出节点片段
      if (urlList) {
        const extracted = extractProxySectionFromBuiltin(finalContent, targetFormat);
        if (extracted) {
          finalContent = extracted;
          contentType = 'text/plain; charset=utf-8';
        }
      }

      const downloadName = resultFileName || subName;
      const asciiSubName = downloadName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
      const encodedSubName = encodeURIComponent(downloadName)
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A');

      const responseHeaders = new Headers({
        'Content-Disposition': `attachment; filename="${asciiSubName}"; filename*=utf-8''${encodedSubName}`,
        'Content-Type': contentType || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache',
        'X-MiSub-Mode': `builtin-${targetFormat}`,
      });

      if (userInfoHeader) {
        responseHeaders.set('Subscription-Userinfo', userInfoHeader);
      }
      if (updateIntervalHours !== null) {
        responseHeaders.set('Profile-Update-Interval', String(updateIntervalHours));
      }

      Object.entries(resultHeaders).forEach(([k, v]) => responseHeaders.set(k, v));
      Object.entries(cacheHeaders).forEach(([key, value]) => responseHeaders.set(key, value));

      if (!url.searchParams.has('callback_token') && !shouldSkipLogging) {
        const clientIp =
          request.headers.get('CF-Connecting-IP') ||
          request.headers.get('X-Real-IP') ||
          request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
          'N/A';
        context.waitUntil?.(
          sendEnhancedTgNotification(
            config,
            '🛰️ <b>订阅被访问</b> (内置转换)',
            clientIp,
            `<b>域名:</b> <code>${tgEscape(domain)}</code>\n<b>请求格式:</b> <code>${tgEscape(targetFormat)}</code>\n<b>客户端:</b> <code>${tgEscape(userAgentHeader)}</code>\n<b>订阅组:</b> <code>${tgEscape(subName)}</code>\n${nodeCountText}\n${profileExpireText}`,
          ),
        );

        if (config.enableAccessLog) {
          logAccessSuccess({
            context,
            env,
            request,
            userAgentHeader,
            targetFormat: `builtin-${targetFormat}`,
            token,
            profileIdentifier,
            profileId: currentProfile?.id || null,
            subName,
            domain,
          });
        }
      }

      return finalizeGuardedResponse(new Response(finalContent || '', { headers: responseHeaders }));
    } catch (e) {
      console.error(`[Builtin${targetFormat}] Generation failed:`, e);
    }
  }

  const base64Headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store, no-cache',
  };
  const userInfoHeader = buildUserInfoHeaderFromSubscriptions(
    context,
    targetMisubs,
    currentProfile?.expiresAt || undefined,
  );
  if (userInfoHeader) {
    base64Headers['Subscription-Userinfo'] = userInfoHeader;
  }
  if (updateIntervalHours !== null) {
    base64Headers['Profile-Update-Interval'] = String(updateIntervalHours);
  }
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    base64Headers[key] = value;
  });

  return finalizeGuardedResponse(new Response(base64EncodeUtf8(combinedNodeList), { headers: base64Headers }));
}
