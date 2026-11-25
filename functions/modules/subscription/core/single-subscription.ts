import type { ParsedNodeItem } from '@misub/core/node/node-parser.js';
import type { NodeMetadata, ParsedNodeInfo } from '@misub/core/types.js';
import type { Env } from '../../../types.js';
import { StorageFactory } from '../../../storage-adapter.js';
import { createJsonResponse } from '../../utils.js';
import { parseNodeInfo } from '@misub/core/node/geo-utils.js';
import { calculateProtocolStats, calculateRegionStats } from '@misub/core/node/node-parser.js';
import { fetchSubscriptionNodes, type FetchSubscriptionNodesResult } from '../security/node-fetcher.js';
import { getDisabledNodeSet } from '@misub/core/domain/disabled-nodes.js';

export type AnnotatedNodeItem = ParsedNodeInfo & {
  subscriptionName?: string;
  enabled?: boolean;
  metadata?: NodeMetadata;
  warning?: Record<string, unknown>;
};

export interface SubscriptionModeResponse {
  success: boolean;
  subscriptions: Array<
    Omit<FetchSubscriptionNodesResult, 'nodes'> & {
      nodes: AnnotatedNodeItem[];
      isManualNode?: boolean;
    }
  >;
  nodes: AnnotatedNodeItem[];
  totalCount: number;
  disabledCount?: number;
  stats: {
    protocols: Record<string, number | { count: number; percentage: number }>;
    regions: Record<string, number | { count: number; percentage: number }>;
  };
}

/**
 * 处理单个订阅模式的节点获取
 */
export async function handleSingleSubscriptionMode(
  _request: Request,
  env: Env,
  subscriptionId: string,
  userAgent: string,
  skipCertVerify = false,
): Promise<SubscriptionModeResponse | Response> {
  const storageAdapter = StorageFactory.createAdapter(env);

  // 查找订阅
  const subscription = await storageAdapter.getSubscriptionById(subscriptionId);

  if (!subscription || !subscription.enabled) {
    return createJsonResponse({ error: '订阅不存在或已禁用' }, 404);
  }

  // 检查是否为手工节点
  if (!subscription.url.startsWith('http')) {
    // 手工节点：直接解析节点URL
    const nodeInfo = parseNodeInfo(subscription.url);
    const manualNode: AnnotatedNodeItem = {
      ...nodeInfo,
      subscriptionName: subscription.name || '手工节点',
    };
    const manualNodeResult = {
      subscriptionName: subscription.name || '手工节点',
      url: subscription.url,
      success: true,
      nodes: [manualNode],
      error: null,
      isManualNode: true,
    };

    return {
      success: true,
      subscriptions: [manualNodeResult],
      nodes: manualNodeResult.nodes,
      totalCount: manualNodeResult.nodes.length,
      stats: {
        protocols: { [nodeInfo.protocol]: 1 },
        regions: { [nodeInfo.region || '其他']: 1 },
      },
    };
  }

  // HTTP订阅：获取节点（开启保护性缓存时，上游失败回退缓存节点，与输出链路一致）
  const result = await fetchSubscriptionNodes(
    subscription.url,
    subscription.name,
    userAgent,
    typeof subscription.customUserAgent === 'string' ? subscription.customUserAgent : undefined,
    false,
    typeof subscription.exclude === 'string' ? subscription.exclude : undefined,
    typeof subscription.fetchProxy === 'string' ? subscription.fetchProxy : undefined,
    skipCertVerify,
    Boolean(subscription?.plusAsSpace),
    subscription?.enableNodeCache === true,
    storageAdapter,
    subscription,
  );

  const disabledSet = getDisabledNodeSet(subscription);
  const annotatedNodes: AnnotatedNodeItem[] = (result.nodes || []).map((node: ParsedNodeItem) => ({
    ...node,
    enabled: !disabledSet.has(String(node?.url || '').trim()),
  }));
  const disabledCount = annotatedNodes.filter((node) => node.enabled === false).length;

  return {
    success: true,
    subscriptions: [{ ...result, nodes: annotatedNodes }],
    nodes: annotatedNodes,
    totalCount: annotatedNodes.length,
    disabledCount,
    stats: {
      protocols: calculateProtocolStats(annotatedNodes),
      regions: calculateRegionStats(annotatedNodes),
    },
  };
}

/**
 * 处理直接URL模式的节点获取
 */
export async function handleDirectUrlMode(
  subscriptionUrl: string,
  userAgent: string,
  skipCertVerify = false,
  plusAsSpace = false,
): Promise<SubscriptionModeResponse> {
  const result = await fetchSubscriptionNodes(
    subscriptionUrl,
    '预览订阅',
    userAgent,
    null,
    false,
    '',
    null,
    skipCertVerify,
    plusAsSpace,
  );

  return {
    success: true,
    subscriptions: [result],
    nodes: result.nodes,
    totalCount: result.nodes.length,
    stats: {
      protocols: calculateProtocolStats(result.nodes),
      regions: calculateRegionStats(result.nodes),
    },
  };
}
