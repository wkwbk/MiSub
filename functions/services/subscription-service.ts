/**
 * 订阅处理服务
 * @author MiSub Team
 */

import type {
  ManualNodeItem,
  OperatorRule,
  ProfilePrefixSettings,
  SettingsConfig,
  SubscriptionItem,
} from '@misub/core/types.js';
import type { BoundRequestContext } from '../types.js';
import { isAutoUpdateEnabled } from '@misub/core/domain/auto-update.js';
import { getDisabledNodeSet } from '@misub/core/domain/disabled-nodes.js';
import { parseNodeList } from '@misub/core/node/node-parser.js';
import { tryDecodeBase64Utf8 } from '@misub/core/utils/base64.js';
import { getProcessedUserAgent } from '@misub/core/utils/format-utils.js';
import { buildFetchProxyUrl } from '../utils/fetch-proxy-utils.js';
import {
  addFlagEmoji,
  applyManualNodeName,
  fixNodeUrlEncoding,
  prependNodeName,
  removeFlagEmoji,
  sanitizeNodeForYaml,
} from '@misub/core/node/node-cleaner.js';
import { runOperatorChain } from '@misub/core/operators/operator-runner.js';
import { createConcurrencyLimiter, fetchWithRetry } from './fetch-utils.js';
import { assertPublicNetworkUrl } from '../modules/security-utils.js';
import { isSuspiciousNodeCountDrop } from './node-cache-service.js';
import { inferAirportRootDomain } from '@misub/core/domain/airport-domain.js';
import {
  fetchAirportSiteTitle,
  isRealProxyNode,
  parseSubscriptionProfileTitle,
  parseSubscriptionUserInfoHeader,
} from './subscription/airport-metadata.js';
import {
  buildSubscriptionFilterFingerprint,
  buildSubscriptionNodeCacheKey,
  readSubscriptionNodeCache,
  recordCurrentRequestRuntimeInfo,
  scheduleSubscriptionRuntimeInfoUpdate,
  writeSubscriptionNodeCache,
  type SubscriptionNodeCacheEntry,
  type SubscriptionRuntimeInfo,
} from './subscription/runtime-cache.js';
import { adaptLegacyTransform, applyFilterRules } from '@misub/core/operators/legacy-adapter.js';

export { inferAirportRootDomain };

export type SubscriptionSourceItem = Partial<SubscriptionItem> &
  Partial<ManualNodeItem> & {
    id?: string;
    name?: string;
    url?: string;
    exclude?: string;
    include?: string;
    isFromSubProfile?: boolean;
    plusAsSpace?: boolean;
    tags?: string[];
    [key: string]: unknown;
  };

export interface ProfileGenerationSettings extends Partial<ProfilePrefixSettings> {
  name?: string;
  operators?: OperatorRule[] | string;
  exclude?: string;
  include?: string;
  nodeTransform?: {
    enabled?: boolean;
    addFlagEmoji?: boolean;
    operators?: OperatorRule[] | string;
    rename?: {
      template?: {
        enabled?: boolean;
        template?: string;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface RequestLogMetadata {
  clientIp?: string;
  geoInfo?: Record<string, unknown>;
  format?: string;
  token?: string;
  type?: string;
  domain?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 订阅获取配置常量
 */
const FETCH_CONFIG = {
  TIMEOUT: 18000, // 单次请求超时 18 秒
  MAX_RETRIES: 2, // 最多重试 2 次
  BASE_DELAY: 1000, // 重试基础延迟 1 秒
  CONCURRENCY: 4, // 最大并发数
  RETRYABLE_STATUS: [500, 502, 503, 504, 429], // 可重试的 HTTP 状态码
};

export {
  isRealProxyNode,
  fetchAirportSiteTitle,
  parseSubscriptionUserInfoHeader,
  buildSubscriptionNodeCacheKey,
  buildSubscriptionFilterFingerprint,
  readSubscriptionNodeCache,
  applyFilterRules,
};

/**
 * 确保配置是数组格式（处理 D1 数据库可能返回的 JSON 字符串）
 */
function ensureArray<T = OperatorRule>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * 生成组合节点列表
 */
export async function generateCombinedNodeList(
  context: BoundRequestContext | null | undefined,
  config: Partial<SettingsConfig> & Record<string, unknown>,
  userAgent: string,
  misubs: SubscriptionSourceItem[],
  prependedContent = '',
  profilePrefixSettings: ProfileGenerationSettings | null = null,
  debug = false,
  skipCertVerify = false,
): Promise<string> {
  // 判断是否启用手动节点前缀
  const shouldPrependManualNodes = profilePrefixSettings?.enableManualNodes ?? true;

  // 判断是否在节点名称前添加首个标签前缀
  const prependTagName = profilePrefixSettings?.prependTagName ?? false;

  // [修复] 多级 Emoji 开关控制逻辑
  const nodeTransformConfig = profilePrefixSettings?.nodeTransform;
  const templateEnabled = nodeTransformConfig?.enabled && nodeTransformConfig?.rename?.template?.enabled;
  const defaultTemplate = '{emoji}{region}-{protocol}-{index}';
  const effectiveTemplate = nodeTransformConfig?.rename?.template?.template || defaultTemplate;
  const templateContainsEmoji = templateEnabled && effectiveTemplate.includes('{emoji}');

  // 确定最终是否保留/添加 Emoji
  // 优先级：nodeTransform.addFlagEmoji (来自 URL 或组件设置) > config.enableFlagEmoji (全局设置)
  const emojiEnabledByConfig = config.enableFlagEmoji !== false;
  const emojiExplicitlyDisabled = nodeTransformConfig?.addFlagEmoji === false;
  const emojiExplicitlyEnabled = nodeTransformConfig?.addFlagEmoji === true;

  let shouldKeepEmoji = emojiEnabledByConfig;
  if (emojiExplicitlyDisabled) shouldKeepEmoji = false;
  if (emojiExplicitlyEnabled) shouldKeepEmoji = true;

  // 强制约束：如果启用了模板命名且模板不含 {emoji}，则必须移除
  if (templateEnabled && !templateContainsEmoji) {
    shouldKeepEmoji = false;
  }

  // 手动节点前缀文本
  const manualNodePrefix = profilePrefixSettings?.manualNodePrefix ?? '\u624b\u52a8\u8282\u70b9';

  // [重要] 当智能重命名模板启用时，跳过前缀添加，因为智能重命名会完全覆盖节点名称
  // 用户可以在模板中使用 {name} 变量来保留原始信息
  const skipPrefixDueToRenaming = nodeTransformConfig?.enabled && nodeTransformConfig?.rename?.template?.enabled;

  // --- 阶段 1: 数据准备与手动节点处理 ---

  // [增强修复] 定义统一的订阅源级转换中枢
  const applySubscriptionTransforms = async (nodes: string[], subSource: SubscriptionSourceItem): Promise<string[]> => {
    if (!nodes || nodes.length === 0) return [];

    let currentNodes = [...nodes];

    // 0. 过滤用户在预览面板中手动停用的单节点（先于算子/过滤执行，且不影响上游真实节点数基线）
    const disabledSet = getDisabledNodeSet(subSource);
    if (disabledSet.size > 0) {
      currentNodes = currentNodes.filter((nodeUrl) => !disabledSet.has(String(nodeUrl || '').trim()));
      if (currentNodes.length === 0) return [];
    }

    // 1. [配置水合] 执行 Workflow 算子 (操作符)
    let subOperators = ensureArray<OperatorRule>(subSource?.operators);
    if (!subOperators.length && isRecord(subSource?.nodeTransform) && subSource.nodeTransform.enabled && subSource.nodeTransform.operators) {
      subOperators = ensureArray<OperatorRule>(subSource.nodeTransform.operators);
    }

    if (subOperators.length > 0) {
      currentNodes = await runOperatorChain(currentNodes, subOperators, {
        subName: subSource?.name,
        userAgent,
        config,
      });
    }

    // 2. 应用传统的文本过滤规则 (exclude/include)
    currentNodes = applyFilterRules(currentNodes, subSource);

    return currentNodes;
  };

  // 重构后的手动节点处理逻辑
  const manualSubSourceGroups = misubs.filter((sub) => {
    if (sub?.isFromSubProfile) return true;
    const url = typeof sub?.url === 'string' ? sub.url.trim() : '';
    return Boolean(url) && !/^https?:\/\//i.test(url);
  });

  const manualProcessedLines: string[] = [];
  for (const sub of manualSubSourceGroups) {
    try {
      const rawUrl = typeof sub?.url === 'string' ? sub.url.trim() : '';
      if (!rawUrl) continue;

      let processedUrl = fixNodeUrlEncoding(rawUrl, {
        plusAsSpace: Boolean(sub?.plusAsSpace),
      });
      const customNodeName = typeof sub.name === 'string' ? sub.name.trim() : '';
      if (customNodeName && !sub?.isFromSubProfile) processedUrl = applyManualNodeName(processedUrl, customNodeName);

      const primaryTag = Array.isArray(sub.tags) && sub.tags.length > 0 ? String(sub.tags[0] || '').trim() : '';
      if (prependTagName && primaryTag && !skipPrefixDueToRenaming)
        processedUrl = prependNodeName(processedUrl, primaryTag);

      const shouldAddPrefix = shouldPrependManualNodes && !skipPrefixDueToRenaming && !sub?.isFromSubProfile;
      const finalRawUrl = shouldAddPrefix ? prependNodeName(processedUrl, manualNodePrefix) : processedUrl;

      // [核心对齐] 对手动节点应用订阅源级转换（算子+过滤 + 组级诊断）
      const transformed = await applySubscriptionTransforms([finalRawUrl], sub);
      if (transformed.length > 0) {
        manualProcessedLines.push(...transformed);
      }
    } catch {}
  }

  const processedManualNodeList = manualProcessedLines.join('\n');

  const httpSubs = misubs.filter(
    (sub) =>
      !sub?.isFromSubProfile &&
      sub &&
      sub.url &&
      /^https?:\/\//i.test(sub.url) &&
      !/^https?:\/\/[^/?#]+:\d+\/?#/i.test(sub.url),
  );
  const limiter = createConcurrencyLimiter(FETCH_CONFIG.CONCURRENCY);
  let upstreamSuccessCount = 0; // 追踪真正从远程拉取成功的订阅数（不含 per-sub 缓存回退）

  /**
   * 获取单个订阅内容
   */
  const fetchSingleSubscription = async (sub: SubscriptionSourceItem): Promise<string> => {
    const cacheEnabled = sub?.enableNodeCache === true;
    const shouldPersistRuntimeInfo = isAutoUpdateEnabled(sub);
    const storage = context?.storage;
    const recordEmptyRuntimeInfo = () => {
      if (cacheEnabled) return;
      const runtimeInfo: SubscriptionRuntimeInfo = {
        nodeCount: 0,
        userInfo: null,
      };
      recordCurrentRequestRuntimeInfo(context, sub, runtimeInfo);
      if (shouldPersistRuntimeInfo) {
        scheduleSubscriptionRuntimeInfoUpdate(context, storage, sub, runtimeInfo);
      }
    };
    const readCachedNodes = async (): Promise<string[]> => {
      if (!cacheEnabled) return [];
      const cached = await readSubscriptionNodeCache(storage, sub);
      return cached?.nodes || [];
    };
    const readCacheEntry = async (): Promise<SubscriptionNodeCacheEntry | null> => {
      if (!cacheEnabled) return null;
      return readSubscriptionNodeCache(storage, sub);
    };
    // 旧缓存没有指纹时视为"配置未变化"，保持原有的截断保护行为
    const hasFilterConfigChanged = (cached: SubscriptionNodeCacheEntry | null): boolean =>
      Boolean(cached) &&
      typeof cached?.filterFingerprint === 'string' &&
      cached.filterFingerprint !== buildSubscriptionFilterFingerprint(sub);

    try {
      const subUrl = typeof sub.url === 'string' ? sub.url : '';
      const customUserAgent = typeof sub.customUserAgent === 'string' ? sub.customUserAgent.trim() : '';
      const processedUserAgent = customUserAgent || getProcessedUserAgent(userAgent, subUrl);
      const requestHeaders = { 'User-Agent': processedUserAgent };

      // [Fetch Proxy] 获取单点订阅专属拉取代理前缀
      assertPublicNetworkUrl(subUrl);
      let requestUrl = subUrl;

      // 只有开启保护性缓存节点时才加时间戳绕过强缓存 (如 Cloudflare Edge Cache)
      if (cacheEnabled) {
        try {
          const parsedUrl = new URL(requestUrl);
          parsedUrl.searchParams.set('_t', Date.now().toString());
          requestUrl = parsedUrl.toString();
        } catch {
          requestUrl += (requestUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
        }
      }

      if (sub.fetchProxy && typeof sub.fetchProxy === 'string' && sub.fetchProxy.trim()) {
        requestUrl = buildFetchProxyUrl(sub.fetchProxy, requestUrl, processedUserAgent);
      }
      requestUrl = assertPublicNetworkUrl(requestUrl).toString();

      const response = await fetchWithRetry(
        requestUrl,
        {
          headers: requestHeaders,
          redirect: 'follow',
          ...(skipCertVerify
            ? {
                cf: {
                  insecureSkipVerify: true,
                  allowUntrusted: true,
                  validateCertificate: false,
                },
              }
            : {}),
        },
        {
          timeout: FETCH_CONFIG.TIMEOUT,
          maxRetries: FETCH_CONFIG.MAX_RETRIES,
          baseDelay: FETCH_CONFIG.BASE_DELAY,
          retryableStatus: FETCH_CONFIG.RETRYABLE_STATUS,
        },
      );

      if (!response.ok) {
        recordEmptyRuntimeInfo();
        return (await readCachedNodes()).join('\n');
      }
      const buffer = await response.arrayBuffer();
      let text = new TextDecoder('utf-8').decode(buffer);

      text = tryDecodeBase64Utf8(text);

      // 使用统一的 node-parser 解析，确保与预览一致的过滤规则 (UUID校验, Hysteria1过滤, SS加密校验等)
      const parsedObjects = parseNodeList(text, { plusAsSpace: Boolean(sub?.plusAsSpace) });

      let validNodes = parsedObjects.map((node) => node.url);

      // [截断检测基线] 骤降保护必须基于"过滤前"的上游真实节点数：
      // 用户配置的 include/exclude 过滤与算子链造成的缩减是预期行为，
      // 若基于过滤后的数量比较，开启仅包含过滤会导致输出被整体清空。
      const upstreamRealNodeCount = validNodes.filter(isRealProxyNode).length;

      // --- 统一转换治理 (算子 + 过滤 + 组级诊断) ---
      validNodes = await applySubscriptionTransforms(validNodes, sub);

      const realNodes = validNodes.filter(isRealProxyNode);
      const knownNodeCount = Math.max(Number(sub?.lastGoodNodeCount) || 0, Number(sub?.nodeCount) || 0);
      if (Number.isFinite(knownNodeCount) && isSuspiciousNodeCountDrop(knownNodeCount, upstreamRealNodeCount)) {
        const cachedNodes = await readCachedNodes();
        console.warn(
          `[Subscription] Rejecting suspicious node-count drop for ${sub.id || sub.url} (${knownNodeCount} known -> ${upstreamRealNodeCount} fetched)`,
        );
        if (cachedNodes.length > 0) return cachedNodes.join('\n');
        return '';
      }
      if (cacheEnabled && realNodes.length === 0) {
        // 过滤条件变化后命中 0 节点是配置的预期结果，不能回退旧配置的缓存节点
        const cached = await readCacheEntry();
        if (!hasFilterConfigChanged(cached)) return (cached?.nodes || []).join('\n');
      } else if (cacheEnabled) {
        const cached = await readCacheEntry();
        if (
          cached &&
          Array.isArray(cached.nodes) &&
          !hasFilterConfigChanged(cached) &&
          isSuspiciousNodeCountDrop(cached.nodes.length || 0, realNodes.length)
        ) {
          console.warn(
            `[SubscriptionCache] Refusing suspicious node-count drop for ${sub.id || sub.url} (${cached.nodes.length} -> ${realNodes.length})`,
          );
          return cached.nodes.join('\n');
        }
      }
      if (!cacheEnabled && realNodes.length === 0) {
        recordEmptyRuntimeInfo();
      }

      if (cacheEnabled) {
        await writeSubscriptionNodeCache(storage, sub, realNodes);
      }

      if (realNodes.length > 0) {
        upstreamSuccessCount++;
        const userInfo = parseSubscriptionUserInfoHeader(response.headers.get('subscription-userinfo') || '');
        // 机场识别：仅使用响应头自报名称（零额外请求）。
        // 官网标题兜底改为「按需触发」——见 /api/detect_airport_name，
        // 避免每次刷新订阅都多发一次外部请求（拖慢整体、增加失败面）。
        const detectedName = parseSubscriptionProfileTitle(response.headers);
        const runtimeInfo: SubscriptionRuntimeInfo = {
          nodeCount: realNodes.length,
          userInfo,
          ...(detectedName ? { detectedName } : {}),
          ...(realNodes.length >= 10 ? { lastGoodNodeCount: realNodes.length } : {}),
        };
        recordCurrentRequestRuntimeInfo(context, sub, runtimeInfo);
        if (shouldPersistRuntimeInfo) {
          scheduleSubscriptionRuntimeInfoUpdate(context, storage, sub, runtimeInfo);
        }
      }

      // 判断是否启用订阅前缀（智能重命名启用时跳过）
      const shouldPrependSubscriptions = profilePrefixSettings?.enableSubscriptions ?? true;
      const shouldAddSubPrefix = shouldPrependSubscriptions && !skipPrefixDueToRenaming;

      return shouldAddSubPrefix && sub.name
        ? validNodes.map((node) => prependNodeName(node, sub.name as string)).join('\n')
        : validNodes.join('\n');
    } catch {
      recordEmptyRuntimeInfo();
      return (await readCachedNodes()).join('\n');
    }
  };

  // 使用并发控制器限制同时请求数量，避免网络拥塞
  const subPromises = httpSubs.map((sub) => limiter(() => fetchSingleSubscription(sub)));
  const processedSubContents = await Promise.all(subPromises);

  // --- 阶段 1: 原始数据汇聚 (Raw Data Aggregation) ---
  const rawCombinedLines = (processedManualNodeList + '\n' + processedSubContents.join('\n'))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  // 去重，保留原始顺序中的第一次出现
  let currentLines = [...new Set(rawCombinedLines)];

  if (!shouldKeepEmoji) {
    currentLines = currentLines.map((line) => removeFlagEmoji(line));
  }

  // --- 阶段 2: 核心转换引擎 (Logic Transformation Engine) ---
  // 优先级: 订阅组 Operator Chain > 全局默认 Operator Chain > 旧版 Node Pipeline (桥接模式)

  let activeOperators: OperatorRule[] = [];

  // 获取工作流配置（支持字符串自动解析）
  if (profilePrefixSettings?.operators) {
    activeOperators = ensureArray<OperatorRule>(profilePrefixSettings.operators);
  }

  if (!activeOperators.length && config.defaultOperators) {
    activeOperators = ensureArray<OperatorRule>(config.defaultOperators);
  }

  if (!activeOperators.length && nodeTransformConfig?.enabled) {
    activeOperators = adaptLegacyTransform(nodeTransformConfig);
  }

  // 2.1 执行 Workflow 链式处理 (算子操作)
  if (activeOperators.length > 0) {
    currentLines = await runOperatorChain(currentLines, activeOperators, {
      subName: profilePrefixSettings?.name,
      userAgent,
      config,
    });
  }

  // 2.2 [安全保险] 再次应用订阅组级别的全局过滤逻辑 (Profile-level)
  if (profilePrefixSettings && (profilePrefixSettings.exclude || profilePrefixSettings.include)) {
    currentLines = applyFilterRules(currentLines, profilePrefixSettings);
  }

  // 2.3 [兜底] 应用 Worker 级别的全局过滤逻辑 (Global-level)
  if (config && (config.exclude || config.include)) {
    currentLines = applyFilterRules(currentLines, {
      exclude: typeof config.exclude === 'string' ? config.exclude : undefined,
    });
  }

  // --- 阶段 3: 后置格式化与增强 (Post-Formatting & Enhancement) ---

  // 3.1 YAML 兼容性净化
  currentLines = currentLines.map((line) => sanitizeNodeForYaml(line));

  // 3.2 最终智能化补齐 (Flag Emoji)
  const finalLines = shouldKeepEmoji ? currentLines.map((line) => addFlagEmoji(line)) : currentLines;

  // --- 阶段 4: 结果拼装与返回 ---
  const finalNodeList = finalLines.join('\n');
  let result = finalNodeList.length > 0 ? (finalNodeList.endsWith('\n') ? finalNodeList : finalNodeList + '\n') : '';

  // 将虚假节点（如果存在）插入到列表最前面
  if (prependedContent) {
    result = `${prependedContent}\n${result}`;
  }

  // --- 日志记录 ---
  try {
    const endTime = Date.now();
    const totalNodes = finalLines.length;
    const successCount = processedSubContents.filter((c) => c.length > 0).length;
    const failCount = httpSubs.length - successCount;
    const startTime = typeof context?.startTime === 'number' ? context.startTime : Date.now();

    if (context) {
      context.generationStats = {
        totalNodes,
        sourceCount: httpSubs.length,
        successCount,
        failCount,
        upstreamSuccessCount,
        duration: endTime - startTime,
      };
    }

    const isInternalRequest = userAgent.includes('MiSub-Backend') || userAgent.includes('TelegramBot');
    if (!debug && config.enableAccessLog && !isInternalRequest) {
      // 避免递归调试日志，并遵循全局日志设置
      const { LogService } = await import('./log-service.js');

      // 提取客户信息
      let clientIp = 'Unknown';
      let geoInfo: Record<string, unknown> = {};
      const logMetadata = isRecord(context?.logMetadata) ? (context.logMetadata as RequestLogMetadata) : null;
      if (logMetadata) {
        clientIp = logMetadata.clientIp || clientIp;
        geoInfo = logMetadata.geoInfo || geoInfo;
      } else if (context && context.request) {
        const reqWithCf = context.request as Request & { cf?: Record<string, unknown> };
        const cf = reqWithCf.cf;
        clientIp =
          context.request.headers.get('CF-Connecting-IP') ||
          context.request.headers.get('X-Real-IP') ||
          context.request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
          'Unknown';
        if (cf) {
          geoInfo = {
            country: cf.country,
            city: cf.city,
            isp: cf.asOrganization,
            asn: cf.asn,
          };
        }
      }

      await LogService.addLog(context?.env, {
        profileName: profilePrefixSettings?.name || 'Unknown Profile',
        clientIp,
        geoInfo,
        userAgent: userAgent || 'Unknown',
        status: failCount === 0 ? 'success' : successCount > 0 ? 'partial' : 'error',
        ...(logMetadata
          ? {
              format: logMetadata.format,
              token: logMetadata.token,
              type: logMetadata.type,
              domain: logMetadata.domain,
            }
          : {}),
        details: {
          totalNodes,
          sourceCount: httpSubs.length,
          successCount,
          failCount,
          duration: endTime - startTime, // 需要在上层记录 startTime
        },
        summary: `生成 ${totalNodes} 个节点 (成功: ${successCount}, 失败: ${failCount})`,
      });
    }
  } catch (e) {
    console.error('Failed to save access log:', e);
  }

  return result;
}
