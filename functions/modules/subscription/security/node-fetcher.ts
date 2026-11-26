import { parseNodeList, type ParsedNodeItem } from '@misub/core/node/node-parser.js';
import type { SubscriptionItem } from '@misub/core/types.js';
import type { StorageAdapter } from '../../../types.js';
import { fetchWithRetry } from '../../../services/fetch-utils.js';
import { assertPublicNetworkUrl } from '../../security-utils.js';
import { buildFetchProxyUrl } from '../../../utils/fetch-proxy-utils.js';
import {
  buildSubscriptionFilterFingerprint,
  readSubscriptionNodeCache,
} from '../../../services/subscription-service.js';
import { encodeArrayBufferToBase64, filterNodeObjects, parseFilterRuleText } from '@misub/core/node/node-cleaner.js';

const NODE_FETCH_CONFIG = {
  TIMEOUT: 15000,
  MAX_RETRIES: 2,
  BASE_DELAY: 1000,
  RETRYABLE_STATUS: [500, 502, 503, 504, 429],
};

export interface FetchSubscriptionNodesResult {
  subscriptionName: string;
  url: string;
  success: boolean;
  nodes: ParsedNodeItem[];
  error: string | null;
  fromCache?: boolean;
  cacheUpdatedAt?: string | number | null;
}

/**
 * 获取单个订阅的节点
 */
export async function fetchSubscriptionNodes(
  url: string,
  subscriptionName: string | undefined,
  userAgent: string,
  customUserAgent: string | null | undefined = null,
  debug = false,
  excludeRules: string | undefined = '',
  fetchProxy: string | null | undefined = null,
  skipCertVerify = false,
  plusAsSpace = false,
  enableNodeCache = false,
  storageAdapter: StorageAdapter | null = null,
  subscription: (Partial<SubscriptionItem> & Record<string, unknown>) | null = null,
): Promise<FetchSubscriptionNodesResult> {
  const resolvedSubName = subscriptionName || '';
  const shouldDebug = Boolean(debug);

  /**
   * 上游拉取失败或无有效节点时，回退到保护性缓存（与订阅输出链路行为一致）。
   */
  const fallbackToNodeCache = async (
    upstreamError: string | null,
    requireFingerprintMatch: boolean,
  ): Promise<FetchSubscriptionNodesResult | null> => {
    if (!enableNodeCache || !storageAdapter || !subscription) return null;
    try {
      const cached = await readSubscriptionNodeCache(storageAdapter, subscription);
      if (!cached || cached.nodes.length === 0) return null;
      if (
        requireFingerprintMatch &&
        typeof cached.filterFingerprint === 'string' &&
        cached.filterFingerprint !== buildSubscriptionFilterFingerprint(subscription)
      ) {
        return null;
      }
      // 缓存中是节点 URL 字符串，重新解析为预览节点对象（附 name/protocol/region 元数据）
      const parsedNodes = parseNodeList(cached.nodes.join('\n'), { plusAsSpace });
      if (parsedNodes.length === 0) return null;
      return {
        subscriptionName: resolvedSubName,
        url,
        success: true,
        nodes: parsedNodes,
        error: upstreamError,
        fromCache: true,
        cacheUpdatedAt: cached.updatedAt || null,
      };
    } catch (error) {
      console.warn('[NodeFetcher] Failed to read protective node cache:', error);
      return null;
    }
  };

  let requestUrl = '';
  try {
    const effectiveUserAgent = customUserAgent && customUserAgent.trim() !== '' ? customUserAgent : userAgent;
    assertPublicNetworkUrl(url);

    // 当配置了 fetchProxy 时，使用代理拉取订阅
    requestUrl = url;

    // 只有开启保护性缓存节点时才加时间戳绕过强缓存 (如 Cloudflare Edge Cache)
    if (enableNodeCache) {
      try {
        const parsedUrl = new URL(requestUrl);
        parsedUrl.searchParams.set('_t', Date.now().toString());
        requestUrl = parsedUrl.toString();
      } catch {
        requestUrl += (requestUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
      }
    }

    if (fetchProxy && typeof fetchProxy === 'string' && fetchProxy.trim()) {
      requestUrl = buildFetchProxyUrl(fetchProxy, url, effectiveUserAgent);
    }

    requestUrl = assertPublicNetworkUrl(requestUrl).toString();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      subscriptionName: resolvedSubName,
      url,
      success: false,
      nodes: [],
      error: message,
    };
  }

  try {
    const effectiveUserAgent = customUserAgent && customUserAgent.trim() !== '' ? customUserAgent : userAgent;

    // 使用统一的 Fetch 工具，复用重试与单源超时控制
    const response = await fetchWithRetry(
      requestUrl,
      {
        headers: { 'User-Agent': effectiveUserAgent },
        redirect: 'follow',
        ...(skipCertVerify ? { cf: { insecureSkipVerify: true } } : {}),
      },
      {
        timeout: NODE_FETCH_CONFIG.TIMEOUT,
        maxRetries: NODE_FETCH_CONFIG.MAX_RETRIES,
        baseDelay: NODE_FETCH_CONFIG.BASE_DELAY,
        retryableStatus: NODE_FETCH_CONFIG.RETRYABLE_STATUS,
      },
    );

    if (!response.ok) {
      const upstreamError = `HTTP ${response.status}: ${response.statusText}`;
      await response.body?.cancel?.().catch(() => {});
      const cachedResult = await fallbackToNodeCache(upstreamError, false);
      if (cachedResult) return cachedResult;
      return {
        subscriptionName: resolvedSubName,
        url,
        success: false,
        nodes: [],
        error: upstreamError,
      };
    }

    const buffer = await response.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer);

    let parsedNodes = parseNodeList(text, { plusAsSpace });

    if (parsedNodes.length === 0) {
      const fallbackBase64 = encodeArrayBufferToBase64(buffer);
      const fallbackNodes = parseNodeList(fallbackBase64, { plusAsSpace });
      if (fallbackNodes.length > 0) {
        parsedNodes = fallbackNodes;
      }
    }

    if (excludeRules && excludeRules.trim()) {
      parsedNodes = applyExcludeRulesToNodes(parsedNodes, excludeRules);
    }

    // 订阅过期/失效时上游可能返回 200 + 无有效节点（如过期提示页），
    // 此时与输出链路一致：过滤配置未变化则回退保护性缓存
    if (parsedNodes.length === 0) {
      const cachedResult = await fallbackToNodeCache(null, true);
      if (cachedResult) return cachedResult;
    }

    return {
      subscriptionName: resolvedSubName,
      url,
      success: true,
      nodes: parsedNodes,
      error: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (shouldDebug) {
      console.debug(`[DEBUG PREVIEW] Error: ${message}`);
    }
    const cachedResult = await fallbackToNodeCache(message, false);
    if (cachedResult) return cachedResult;
    return {
      subscriptionName: resolvedSubName,
      url,
      success: false,
      nodes: [],
      error: message,
    };
  }
}

/**
 * 应用过滤规则 (使用 node-cleaner 的重构逻辑)
 */
function applyExcludeRulesToNodes(nodes: ParsedNodeItem[], ruleText: string): ParsedNodeItem[] {
  if (!ruleText || !ruleText.trim()) return nodes;
  const { includeRules, excludeRules } = parseFilterRuleText(ruleText);

  let resultNodes = nodes;

  // 使用 node-cleaner 中导出的 filterNodeObjects
  if (includeRules.hasRules) {
    resultNodes = filterNodeObjects(resultNodes, includeRules, 'include');
  }
  if (excludeRules.hasRules) {
    resultNodes = filterNodeObjects(resultNodes, excludeRules, 'exclude');
  }

  return resultNodes;
}
