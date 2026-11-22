import { StorageFactory } from '../../storage-adapter.js';
import { base64EncodeUtf8, migrateConfigSettings } from '../utils.js';
import { formatBytes } from '../../../shared/format-utils.js';
import { generateCombinedNodeList } from '../../services/subscription-service.js';
import { sendEnhancedTgNotification, tgEscape } from '../notifications.js';
import { DEFAULT_SETTINGS as defaultSettings, STORAGE_KEY_SETTINGS } from '../config.js';
import { normalizeSubPath } from '../../../shared/reserved-paths.js';
import { createBlockedResponse, isBrowserSubAccessAllowed } from '../access-control.js';
import {
  generateCacheKey,
  isLikelyPartialAggregateNodeList,
  isSuspiciousNodeCountDrop,
  setCache,
} from '../../services/node-cache-service.js';
import { resolveRequestContext } from './request-context.js';
import { resolveNodeListWithCache } from './cache-manager.js';
import { ProcessorService } from '../../services/processor-service.js';
import { logAccessSuccess, shouldSkipLogging as shouldSkipAccessLog } from './access-logger.js';
import { determineTargetFormat, isBrowserAgent, isMetaCore } from './user-agent-utils.js';
import { handleProfileMode } from './profile-handler.js';

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
} from './userinfo-formatters.js';
import {
  buildExternalSubconverterUrl,
  normalizeExternalTemplateConfigUrl,
  normalizeSubconverterBackend,
  resolveAddFlagEmoji,
  resolveBuiltinEngineFlags,
  resolveBuiltinRequestOptions,
  resolveEffectiveEngine,
  resolveEffectiveNodeTransform,
  resolveExternalTemplateConfigUrl,
  resolveTemplateSource,
  resolveTemplateUrl,
  shouldRenderClashYamlProfileTemplateLocally,
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
  normalizeExternalTemplateConfigUrl,
  normalizeSubconverterBackend,
  buildExternalSubconverterUrl,
  resolveBuiltinEngineFlags,
  resolveEffectiveEngine,
  resolveBuiltinRequestOptions,
  resolveEffectiveNodeTransform,
  resolveAddFlagEmoji,
  shouldRenderClashYamlProfileTemplateLocally,
};

/**
 * 处理MiSub订阅请求
 * @param {Object} context - Cloudflare上下文
 * @returns {Promise<Response>} HTTP响应
 */
export async function handleMisubRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const userAgentHeader = request.headers.get('User-Agent') || 'Unknown';

  console.log(`\n[MiSub Request] ${request.method} ${maskSensitiveLogValue(url.pathname)}${url.search ? ' ?…' : ''}`);
  console.log(`[MiSub UA] ${userAgentHeader}`);

  const storageAdapter = StorageFactory.createAdapter(env);
  context.storage = storageAdapter;
  const settingsData =
    context.settings !== undefined ? context.settings : await storageAdapter.get(STORAGE_KEY_SETTINGS);
  const settings = settingsData || {};

  // 关键：我们在这里定义了 `config`，后续都应该使用它
  const config = migrateConfigSettings({ ...defaultSettings, ...settings });
  context.config = config;
  context.accessLogPersistenceMode = config.accessLogPersistenceMode || 'light';

  // [Subconverter API] 提取 URL 控制参数，用于覆盖默认设置
  const urlInclude = url.searchParams.get('include');
  const urlExclude = url.searchParams.get('exclude');
  const urlRename = url.searchParams.get('rename');
  const urlEmoji = url.searchParams.get('emoji');
  const urlUdp = url.searchParams.get('udp');
  const urlTfo = url.searchParams.get('tfo');
  const urlScv = url.searchParams.get('scv');
  const urlList = url.searchParams.get('list') === 'true';

  const isBrowser = isBrowserAgent(userAgentHeader);

  const allowBrowserSub = isBrowserSubAccessAllowed(config);
  console.log(`[MiSub Logic] isBrowser: ${isBrowser}, AllowBrowserSub: ${allowBrowserSub}`);

  // 关闭「允许浏览器打开订阅链接」后，任何浏览器直连订阅 URL 一律拦截，代理客户端不受影响
  if (!allowBrowserSub && isBrowser && !url.searchParams.has('callback_token')) {
    return createBlockedResponse(config.disguise, request.url);
  }

  context.url = url; // [核心修复] 将 url 挂载到 context，确保后续服务能获取到 debug 参数
  const { token, profileIdentifier } = resolveRequestContext(url, config);

  console.log(
    `[MiSub Parse] Token: ${maskSensitiveLogValue(token)}, Profile: ${maskSensitiveLogValue(profileIdentifier)}`,
  );
  const shouldSkipLogging = shouldSkipAccessLog(userAgentHeader);

  let targetMisubs;
  let subName = config.FileName;
  let isProfileExpired = false;

  const DEFAULT_EXPIRED_NODE = `trojan://00000000-0000-0000-0000-000000000000@127.0.0.1:443#${encodeURIComponent('您的订阅已到期')}`;

  let currentProfile = null;
  let isExternalMode = false;
  let useBuiltin = true;
  let shouldSkipCertificateVerify = false;
  let shouldEnableUdp = true;

  const initEngineFlags = (targetProf) => {
    const profileSub = targetProf?.subconverter || {};
    const globalSub = config.subconverter || {};
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

  if (profileIdentifier) {
    const expectedSubPath = normalizeSubPath(config.profileToken, 'sub');
    if (!token || token !== expectedSubPath) {
      // [伪装加固] 不使用裸 403 响应，统一走访问控制拦截响应
      return createBlockedResponse(config.disguise, request.url);
    }
    currentProfile = await storageAdapter.getProfileById(profileIdentifier);
    initEngineFlags(currentProfile);
    const profile = currentProfile;
    if (profile && profile.enabled) {
      if (profile.expiresAt) {
        const expiryDate = new Date(profile.expiresAt);
        const now = new Date();
        if (now > expiryDate) {
          isProfileExpired = true;
        }
      }

      if (isProfileExpired) {
        subName = profile.name;
        targetMisubs = [
          {
            id: 'expired-node',
            url: DEFAULT_EXPIRED_NODE,
            name: '您的订阅已到期',
            isExpiredNode: true,
          },
        ];
      } else {
        subName = profile.name;
        targetMisubs = [];
        const subSourceIds = Array.isArray(profile.subscriptions)
          ? profile.subscriptions.map((item) => (typeof item === 'object' ? item.id : item)).filter(Boolean)
          : [];
        const manualNodeIds = Array.isArray(profile.manualNodes) ? profile.manualNodes.filter(Boolean) : [];
        let relatedSubs = [];
        if (typeof storageAdapter.getProfileSources === 'function') {
          relatedSubs = await storageAdapter.getProfileSources(subSourceIds, manualNodeIds);
        } else if (typeof storageAdapter.getSubscriptionsByIds === 'function') {
          relatedSubs = await storageAdapter.getSubscriptionsByIds(
            Array.from(new Set([...subSourceIds, ...manualNodeIds])),
          );
        } else {
          relatedSubs = (await storageAdapter.getAllSubscriptions()) || [];
        }
        const misubMap = new Map(relatedSubs.map((item) => [item.id, item]));

        const profileSubIds = profile.subscriptions || [];
        if (Array.isArray(profileSubIds)) {
          profileSubIds.forEach((item) => {
            // 支持两种格式：纯字符串 ID 或 带有覆盖配置的对象 { id, exclude, operators, ... }
            const isObject = item && typeof item === 'object';
            const id = isObject ? item.id : item;

            const baseSub = misubMap.get(id);
            if (baseSub && baseSub.enabled && typeof baseSub.url === 'string' && baseSub.url.startsWith('http')) {
              // 如果是对象，则合并覆盖配置（Profile 级别的设置优先级更高）
              const sub = isObject ? { ...baseSub, ...item } : baseSub;
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
          const visitedBase = [profile.id, profile.customId].filter(Boolean);
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
            if (subResult?.success && Array.isArray(subResult.nodes)) {
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
          context.waitUntil(
            Promise.resolve(storageAdapter.incrementProfileDownloadCount?.(profile.id || profile.customId)).catch(
              (err) => console.error('[Download Count] Failed to update:', err),
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
    if (!config.mytoken || !token || token !== config.mytoken) {
      // [伪装加固] 同 profile token：统一走访问控制拦截响应
      return createBlockedResponse(config.disguise, request.url);
    }
    const allMisubs = (await storageAdapter.getAllSubscriptions()) || [];
    targetMisubs = allMisubs.filter((s) => s.enabled);
    initEngineFlags(null);
  }

  // 使用统一的确定目标格式的方法（此方法中包含了处理各类客户端如 Surge 等对应版本的最新支持规则）
  let targetFormat = determineTargetFormat(userAgentHeader, url.searchParams);

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
      const virtualNodes = [];

      const totalRemainingBytes = targetMisubs.reduce((acc, sub) => {
        if (!sub?.enabled || sub?.excludeTraffic) return acc;
        const userInfo = getCurrentRequestUserInfo(context, sub);
        if (userInfo && userInfo.total > 0) {
          const used = (userInfo.upload || 0) + (userInfo.download || 0);
          return acc + Math.max(0, userInfo.total - used);
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

  const profileSub = currentProfile?.subconverter || {};
  const globalSub = config.subconverter || {};

  const globalTemplateUrl = resolveTemplateUrl(config.transformConfigMode, config.transformConfig, '');
  const templateUrl = currentProfile
    ? resolveTemplateUrl(currentProfile.transformConfigMode, currentProfile.transformConfig, globalTemplateUrl)
    : globalTemplateUrl;
  const templateSource = resolveTemplateSource(templateUrl);

  // [逻辑统一] 规则等级：URL 参数 > 订阅组设置 > 全局设置 > 默认值 (std)
  // [重要变更] 如果使用了远程自定义配置 (templateSource.kind === 'remote')，则完全禁用内置等级 (强制为 none)
  const resolvedProfileLevel = currentProfile?.ruleLevel || currentProfile?.clashRuleLevel || '';
  const resolvedGlobalLevel = config.ruleLevel || config.clashRuleLevel || 'std';

  let ruleLevel;
  if (templateSource.kind === 'remote' || templateSource.kind === 'custom') {
    ruleLevel = 'none';
  } else {
    ruleLevel =
      url.searchParams.get('level') || url.searchParams.get('ruleLevel') || resolvedProfileLevel || resolvedGlobalLevel;
  }

  // === 缓存机制：快速响应客户端请求 ===
  const cacheKey = generateCacheKey(profileIdentifier ? 'profile' : 'token', profileIdentifier || token);

  // 检查是否强制刷新（通过 URL 参数）
  const forceRefresh =
    url.searchParams.has('refresh') || url.searchParams.has('nocache') || url.searchParams.has('debug');

  // 定义刷新函数（用于后台刷新）
  const refreshNodes = async (_isBackground = false) => {
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
    const globalPrefixSettings = config.defaultPrefixSettings || {};
    const profilePrefixSettings = activeProfile?.prefixSettings || null;
    const effectivePrefixSettings = { ...globalPrefixSettings };

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

    const generationSettings = {
      ...effectivePrefixSettings,
      nodeTransform: { ...effectiveNodeTransform },
      name: subName,
      operators: Array.isArray(activeProfile?.operators) ? [...activeProfile.operators] : [],
      exclude: urlExclude || activeProfile?.exclude,
      include: urlInclude || activeProfile?.include,
      // [Issue #345] 透传 emoji 开关到内置生成器
      addFlagEmoji: effectiveNodeTransform.addFlagEmoji,
    };

    // [Subconverter API] 动态注入更名算子 (rename=old@new|A@B)
    if (urlRename) {
      const renameGroups = urlRename.split('|');
      renameGroups.forEach((group) => {
        const [regex, replace] = group.split('@');
        if (regex) {
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
      targetMisubs,
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
    const stats = context.generationStats;
    if (!stats?.sourceCount || stats.upstreamSuccessCount > 0) {
      const cacheSaved = await setCache(storageAdapter, cacheKey, freshNodes, sourceNames);
      const freshNodeCount = freshNodes.split('\n').filter((line) => line.trim()).length;
      const existingCache = cacheSaved ? null : await storageAdapter.get(cacheKey);
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
  });

  console.log(`[MiSub Nodes] Count/Length: ${combinedNodeList ? combinedNodeList.length : 0}`);

  const domain = url.hostname;
  const mergedExpireTimestamp = mergeSubscriptionUserInfo(context, targetMisubs).expire;
  const expireTime = formatNotificationExpireTime(currentProfile?.expiresAt, mergedExpireTimestamp);
  const expireStatus = formatNotificationExpireStatus(
    currentProfile?.expiresAt,
    mergedExpireTimestamp,
    Date.now(),
    config.NotifyThresholdDays,
  );
  const profileExpireText = `<b>状态:</b> <code>${tgEscape(expireStatus)}</code>\n<b>到期时间:</b> <code>${tgEscape(expireTime)}</code>`;
  const nodeCount = isProfileExpired ? 0 : countSubscriptionNodes(combinedNodeList, prependedContentForSubconverter);
  const nodeCountText = `<b>节点数:</b> <code>${nodeCount}</code>`;

  if (targetFormat === 'nodes') {
    const contentToReturn = isProfileExpired ? DEFAULT_EXPIRED_NODE + '\n' : combinedNodeList;
    const userInfoHeader = buildUserInfoHeaderFromSubscriptions(context, targetMisubs, currentProfile?.expiresAt);
    const nodeHeaders = {
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
    return new Response(contentToReturn, {
      headers: nodeHeaders,
    });
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
        const userInfoHeader = buildUserInfoHeaderFromSubscriptions(context, targetMisubs, currentProfile?.expiresAt);
        const finalYamlSkipCertVerify =
          urlScv !== null ? urlScv === 'true' || urlScv === '1' : shouldSkipCertificateVerify;
        const finalYamlEnableUdp = urlUdp !== null ? urlUdp === 'true' || urlUdp === '1' : shouldEnableUdp;
        const finalYamlAddFlagEmoji =
          urlEmoji === 'false' ? false : urlEmoji === 'true' ? true : resolveAddFlagEmoji(currentProfile, config);
        const builtinOptions = {
          ...resolveBuiltinRequestOptions({
            searchParams: url.searchParams,
            userAgent: userAgentHeader,
          }),
          // 透传 emoji 开关到内置生成器（url-to-clash.js 读 options.addFlagEmoji）。
          // 漏传时 `undefined !== false` 恒为 true，导致无条件加国旗。
          addFlagEmoji: finalYamlAddFlagEmoji,
          fileName: subName,
          managedConfigUrl: buildManagedConfigUrl(request.url),
          interval: updateIntervalSeconds,
          skipCertVerify: finalYamlSkipCertVerify,
          enableUdp: finalYamlEnableUdp,
          enableTfo: urlTfo === 'true' || urlTfo === '1',
          ruleLevel,
          regionOverrides: Array.isArray(config.regionOverrides) ? config.regionOverrides : [],
          isMeta: isMetaCore(userAgentHeader, url.searchParams),
          customDnsOverride: config.customDnsOverride || '',
          dnsMode: url.searchParams.get('dns-mode') || url.searchParams.get('dnsMode') || config.dnsMode || 'clean',
        };
        const rendered = await ProcessorService.renderOutput({
          targetFormat,
          combinedNodeList: isProfileExpired ? DEFAULT_EXPIRED_NODE + '\n' : combinedNodeList,
          subName,
          config,
          builtinOptions,
          templateSource,
          managedConfigUrl: builtinOptions.managedConfigUrl,
          storageAdapter,
          userInfoHeader,
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
          return new Response(rendered.content, { headers: responseHeaders });
        }
      } catch (err) {
        console.warn(
          '[ExternalTemplate] Local Clash YAML profile render failed, falling back to external redirect:',
          err?.message || err,
        );
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
      context.waitUntil(
        sendEnhancedTgNotification(
          config,
          '🛰️ <b>订阅被访问</b> (第三方转换)',
          clientIp,
          `<b>域名:</b> <code>${tgEscape(domain)}</code>\n<b>请求格式:</b> <code>${tgEscape(targetFormat)}</code>\n<b>客户端:</b> <code>${tgEscape(userAgentHeader)}</code>\n<b>订阅组:</b> <code>${tgEscape(subName)}</code>\n${nodeCountText}\n${profileExpireText}`,
        ),
      );
    }

    // [重要修复] 使用手动构建出的 302 响应，以确保头部是可变的 (Mutable)
    const redirectHeaders = {
      Location: externalUrl.toString(),
      'Cache-Control': 'no-store, no-cache',
      'X-MiSub-Mode': 'external-redirect-v2',
      ...(templateSource.kind === 'builtin'
        ? { 'X-MiSub-Template-Warning': 'external-engine-ignores-builtin-template' }
        : {}),
    };
    const userInfoHeader = buildUserInfoHeaderFromSubscriptions(context, targetMisubs, currentProfile?.expiresAt);
    if (userInfoHeader) {
      redirectHeaders['Subscription-Userinfo'] = userInfoHeader;
    }
    if (updateIntervalHours !== null) {
      redirectHeaders['Profile-Update-Interval'] = String(updateIntervalHours);
    }
    return new Response(null, {
      status: 302,
      headers: redirectHeaders,
    });
  }

  if (targetFormat === 'base64') {
    let contentToEncode;
    if (isProfileExpired) {
      contentToEncode = DEFAULT_EXPIRED_NODE + '\n';
    } else {
      contentToEncode = combinedNodeList;
    }
    const userInfoHeader = buildUserInfoHeaderFromSubscriptions(context, targetMisubs, currentProfile?.expiresAt);
    const headers = {
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
      context.waitUntil(
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
          subName,
          domain,
        });
      }
    }

    return new Response(base64EncodeUtf8(contentToEncode), { headers });
  }

  // [Subconverter API] URL 参数优先级高于全局/Profile 设置
  const finalSkipCertVerify = urlScv !== null ? urlScv === 'true' || urlScv === '1' : shouldSkipCertificateVerify;
  const finalEnableUdp = urlUdp !== null ? urlUdp === 'true' || urlUdp === '1' : shouldEnableUdp;
  const finalEnableTfo = urlTfo === 'true' || urlTfo === '1';

  const finalAddFlagEmoji =
    urlEmoji === 'false' ? false : urlEmoji === 'true' ? true : resolveAddFlagEmoji(currentProfile, config);

  const builtinOptions = {
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
    regionOverrides: Array.isArray(config.regionOverrides) ? config.regionOverrides : [],
    isMeta: isMetaCore(userAgentHeader, url.searchParams),
    customDnsOverride: config.customDnsOverride || '',
    dnsMode: url.searchParams.get('dns-mode') || url.searchParams.get('dnsMode') || config.dnsMode || 'clean',
  };

  const managedConfigUrl = buildManagedConfigUrl(request.url);

  const shouldUseBuiltin =
    useBuiltin &&
    (targetFormat === 'clash' ||
      targetFormat === 'egern' ||
      targetFormat.startsWith('surge') ||
      targetFormat === 'loon' ||
      targetFormat === 'quanx' ||
      targetFormat === 'singbox' ||
      targetFormat === 'sing-box');

  if (shouldUseBuiltin) {
    try {
      const userInfoHeader = buildUserInfoHeaderFromSubscriptions(context, targetMisubs, currentProfile?.expiresAt);

      let {
        content: finalContent,
        contentType,
        headers: resultHeaders,
      } = await ProcessorService.renderOutput({
        targetFormat,
        combinedNodeList,
        subName,
        config,
        builtinOptions,
        templateSource,
        managedConfigUrl,
        storageAdapter,
        userInfoHeader,
      });

      // [Subconverter API] 处理 list=true 逻辑：仅输出节点片段
      if (urlList) {
        const extracted = extractProxySectionFromBuiltin(finalContent, targetFormat);
        if (extracted) {
          finalContent = extracted;
          contentType = 'text/plain; charset=utf-8';
        }
      }

      const asciiSubName = subName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
      const encodedSubName = encodeURIComponent(subName)
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
        context.waitUntil(
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
            subName,
            domain,
          });
        }
      }

      return new Response(finalContent || '', { headers: responseHeaders });
    } catch (e) {
      console.error(`[Builtin${targetFormat}] Generation failed:`, e);
    }
  }

  const base64Headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store, no-cache',
  };
  const userInfoHeader = buildUserInfoHeaderFromSubscriptions(context, targetMisubs, currentProfile?.expiresAt);
  if (userInfoHeader) {
    base64Headers['Subscription-Userinfo'] = userInfoHeader;
  }
  if (updateIntervalHours !== null) {
    base64Headers['Profile-Update-Interval'] = String(updateIntervalHours);
  }
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    base64Headers[key] = value;
  });

  return new Response(base64EncodeUtf8(combinedNodeList), { headers: base64Headers });
}
