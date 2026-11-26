import type { MisubItem, NodeMetadata, NodeRecord, OperatorRule, ParsedNodeInfo, SettingsConfig, SubscriptionItem } from '@misub/core/types.js';
import type { Env } from '../../../types.js';
import { StorageFactory } from '../../../storage-adapter.js';
import { createJsonResponse } from '../../utils.js';
import { parseNodeInfo } from '@misub/core/node/geo-utils.js';
import { calculateProtocolStats, calculateRegionStats } from '@misub/core/node/node-parser.js';
import { applyNodeTransformPipeline } from '@misub/core/operators/node-transformer.js';
import { runOperatorChain } from '@misub/core/operators/operator-runner.js';
import { DEFAULT_SETTINGS, STORAGE_KEY_SETTINGS } from '../../config.js';
import { createConcurrencyLimiter } from '../../../services/fetch-utils.js';
import { fetchSubscriptionNodes, type FetchSubscriptionNodesResult } from '../security/node-fetcher.js';
import { applyManualNodeName } from '@misub/core/node/node-cleaner.js';
import { adaptLegacyTransform } from '@misub/core/operators/legacy-adapter.js';
import { getDisabledNodeSet } from '@misub/core/domain/disabled-nodes.js';

const PROFILE_FETCH_CONCURRENCY = 4;

export type ProfileNodeItem = ParsedNodeInfo & {
  subscriptionName?: string;
  tags?: string[];
  metadata?: NodeMetadata;
  warning?: Record<string, unknown>;
};

export interface ProfileSubscriptionEntry {
  subscriptionName: string;
  url: string;
  success: boolean;
  nodes: ProfileNodeItem[];
  error: string | null;
  tags?: string[];
  isManualNode?: boolean;
  isSubProfile?: boolean;
  fromCache?: boolean;
  cacheUpdatedAt?: string | number | null;
}

export interface HandleProfileModeResult {
  success: boolean;
  profileName?: string;
  subscriptions: ProfileSubscriptionEntry[];
  nodes: ProfileNodeItem[];
  totalCount: number;
  stats: {
    protocols: Record<string, { count: number; percentage: number }>;
    regions: Record<string, { count: number; percentage: number }>;
  };
  error?: string;
}

function ensureArray<T = unknown>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data === 'string') {
    try {
      const parsed: unknown = JSON.parse(data);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * 处理订阅组模式的节点获取
 */
export async function handleProfileMode(
  // oxlint-disable-next-line oxc/only-used-in-recursion
  request: Request,
  env: Env,
  profileId: string,
  userAgent: string,
  applyTransform = false,
  skipCertVerify = false,
  depth = 0,
  visited: Set<string> = new Set(),
): Promise<HandleProfileModeResult | Response> {
  if (depth > 3 || (profileId && visited.has(profileId))) {
    console.warn(`[Profile Nesting] 触发深度超限或循环引用保护: profileId=${profileId}, depth=${depth}`);
    return {
      success: false,
      subscriptions: [],
      nodes: [],
      totalCount: 0,
      stats: { protocols: {}, regions: {} },
      error: '循环引用或嵌套层级过深',
    };
  }

  const storageAdapter = StorageFactory.createAdapter(env);

  const profile = await storageAdapter.getProfileById(profileId);
  const rawSettings = await storageAdapter.get<Partial<SettingsConfig>>(STORAGE_KEY_SETTINGS);
  const settings: SettingsConfig & Record<string, unknown> = { ...DEFAULT_SETTINGS, ...rawSettings };

  if (!profile || !profile.enabled) {
    return createJsonResponse({ error: '订阅组不存在或已禁用' }, 404);
  }

  const subSourceIds = Array.isArray(profile.subscriptions)
    ? profile.subscriptions
        .map((item) => (typeof item === 'object' && item !== null ? item.id : item))
        .filter((id): id is string => Boolean(id))
    : [];
  const manualNodeIds = Array.isArray(profile.manualNodes) ? profile.manualNodes.filter(Boolean) : [];
  let relatedSubs: MisubItem[] = [];
  if (typeof storageAdapter.getProfileSources === 'function') {
    relatedSubs = await storageAdapter.getProfileSources(subSourceIds, manualNodeIds);
  } else if (typeof storageAdapter.getSubscriptionsByIds === 'function') {
    relatedSubs = await storageAdapter.getSubscriptionsByIds(Array.from(new Set([...subSourceIds, ...manualNodeIds])));
  } else {
    relatedSubs = (await storageAdapter.getAllSubscriptions()) || [];
  }
  const misubMap = new Map(relatedSubs.map((item) => [item.id, item]));

  const targetMisubs: MisubItem[] = [];
  const profileSubIds = (profile.subscriptions || []).map((item) =>
    typeof item === 'object' && item !== null ? item.id : item,
  );
  profileSubIds.forEach((id) => {
    const sub = misubMap.get(id);
    if (sub && sub.enabled && /^https?:\/\//i.test(sub.url)) {
      targetMisubs.push(sub);
    }
  });

  const targetManualNodes: MisubItem[] = [];
  const profileNodeIds = profile.manualNodes || [];
  if (Array.isArray(profileNodeIds)) {
    profileNodeIds.forEach((id) => {
      const node = misubMap.get(id);
      if (node && node.enabled) targetManualNodes.push(node);
    });
  }

  const httpProxyPattern = /^https?:\/\/[^/?#]+:\d+(?:[/?#]|$)/i;
  const targetSubscriptions = targetMisubs.filter((sub) => !httpProxyPattern.test(sub.url));
  const httpProxyNodes = targetMisubs.filter((sub) => httpProxyPattern.test(sub.url));
  const seenManualIds = new Set<string>();
  const allManualNodes: MisubItem[] = [];
  for (const node of [...httpProxyNodes, ...targetManualNodes]) {
    const key = node?.id || node?.url;
    if (!node || (key && seenManualIds.has(key))) continue;
    if (key) seenManualIds.add(key);
    allManualNodes.push(node);
  }
  // 处理手工节点（直接解析节点URL），并将用户自定义名称写入 URL。
  const manualNodeResults: ProfileSubscriptionEntry[] = allManualNodes.map((node) => {
    const customName = typeof node.name === 'string' ? node.name.trim() : '';
    const effectiveUrl = customName ? applyManualNodeName(node.url, customName) : node.url;

    const nodeTags = Array.isArray(node.tags) ? node.tags.map((item) => String(item || '').trim()).filter(Boolean) : [];

    const nodeInfo = parseNodeInfo(effectiveUrl);
    return {
      subscriptionName: node.name || '手工节点',
      tags: nodeTags,
      url: effectiveUrl,
      success: true,
      nodes: [
        {
          ...nodeInfo,
          url: effectiveUrl,
          subscriptionName: node.name || '手工节点',
          tags: nodeTags,
        },
      ],
      error: null,
      isManualNode: true,
    };
  });

  // 并行获取HTTP订阅节点（限流并发 <= 4，开启保护性缓存时上游失败回退缓存节点）
  const limiter = createConcurrencyLimiter(PROFILE_FETCH_CONCURRENCY);
  const rawSubscriptionResults: FetchSubscriptionNodesResult[] = await Promise.all(
    targetSubscriptions.map((sub) =>
      limiter(() => {
        const subItem = sub as Partial<SubscriptionItem> & Record<string, unknown>;
        return fetchSubscriptionNodes(
          sub.url,
          sub.name,
          userAgent,
          typeof subItem.customUserAgent === 'string' ? subItem.customUserAgent : undefined,
          false,
          typeof subItem.exclude === 'string' ? subItem.exclude : undefined,
          typeof subItem.fetchProxy === 'string' ? subItem.fetchProxy : undefined,
          skipCertVerify,
          Boolean(subItem.plusAsSpace),
          subItem.enableNodeCache === true,
          storageAdapter,
          subItem,
        );
      }),
    ),
  );

  // 过滤订阅源内手动停用的节点
  const subscriptionResults: ProfileSubscriptionEntry[] = rawSubscriptionResults.map((res, index) => {
    const sub = targetSubscriptions[index];
    const disabledSet = getDisabledNodeSet(sub as SubscriptionItem);
    if (!res?.success || !Array.isArray(res.nodes) || disabledSet.size === 0) {
      return res;
    }
    return {
      ...res,
      nodes: res.nodes.filter((node) => !disabledSet.has(String(node?.url || '').trim())),
    };
  });

  // 3. 处理嵌套的组合订阅 (Sub-Profiles)
  const profileSubProfileIds = profile.subProfiles || [];
  const nestedSubProfileResults: ProfileSubscriptionEntry[] = [];
  if (Array.isArray(profileSubProfileIds) && profileSubProfileIds.length > 0 && depth < 3) {
    const nextVisited = new Set(visited);
    if (profile.id) nextVisited.add(profile.id);
    if (profile.customId) nextVisited.add(profile.customId);

    for (const subProfileId of profileSubProfileIds) {
      if (!subProfileId || nextVisited.has(subProfileId)) {
        console.warn(`[Profile Nesting] 跳过循环引用或空子订阅组: ${subProfileId}`);
        continue;
      }
      try {
        const subResult = await handleProfileMode(
          request,
          env,
          subProfileId,
          userAgent,
          true, // 应用子订阅自身的算子与清洗规则
          skipCertVerify,
          depth + 1,
          nextVisited,
        );
        if (!(subResult instanceof Response) && subResult.success && Array.isArray(subResult.nodes)) {
          nestedSubProfileResults.push({
            subscriptionName: subResult.profileName || '组合订阅',
            tags: [subResult.profileName || '组合订阅'],
            url: `profile://${subProfileId}`,
            success: true,
            nodes: subResult.nodes,
            error: null,
            isSubProfile: true,
          });
        }
      } catch (err) {
        console.error(`[Profile Nesting] 拉取子订阅组异常 ${subProfileId}:`, err);
      }
    }
  }

  // 合并所有结果
  const allResults: ProfileSubscriptionEntry[] = [
    ...subscriptionResults,
    ...manualNodeResults,
    ...nestedSubProfileResults,
  ];

  // 统计所有节点
  const allNodes: ProfileNodeItem[] = [];
  allResults.forEach((result) => {
    if (result.success) {
      allNodes.push(...result.nodes);
    }
  });

  // 如果需要应用转换规则，则处理节点名称
  let processedNodes: ProfileNodeItem[] = allNodes;
  const presets = Array.isArray(settings.nodeTransformPresets)
    ? (settings.nodeTransformPresets as Array<{ id?: string; config?: Record<string, unknown> }>)
    : [];
  const presetNodeTransform = profile.nodeTransformPresetId
    ? presets.find((item) => item?.id === profile.nodeTransformPresetId)?.config || null
    : null;
  const profileNodeTransform =
    profile.nodeTransform && typeof profile.nodeTransform === 'object'
      ? (profile.nodeTransform as Record<string, unknown>)
      : null;
  const effectiveNodeTransform = profileNodeTransform?.enabled ? profileNodeTransform : presetNodeTransform;

  if (applyTransform) {
    const nodeUrls = allNodes.map((node) => node.url);
    const nodeMetadataByUrl = new Map<string, Partial<NodeRecord>>(
      allNodes.map((node) => [node.url, { tags: Array.isArray(node.tags) ? node.tags : [] }]),
    );

    let activeOperators = ensureArray<OperatorRule>(profile?.operators);
    if (!activeOperators.length && profileNodeTransform?.enabled && profileNodeTransform?.operators) {
      activeOperators = ensureArray<OperatorRule>(profileNodeTransform.operators);
    }
    if (!activeOperators.length && settings?.defaultOperators) {
      activeOperators = ensureArray<OperatorRule>(settings.defaultOperators);
    }
    if (!activeOperators.length && effectiveNodeTransform?.enabled) {
      activeOperators = adaptLegacyTransform({
        ...effectiveNodeTransform,
        enableEmoji: settings.enableFlagEmoji !== false,
      });
    }

    let transformedUrls = nodeUrls;
    if (activeOperators.length > 0) {
      transformedUrls = await runOperatorChain(nodeUrls, activeOperators, {
        subName: profile?.name,
        userAgent,
        config: settings,
        nodeMetadataByUrl,
      });
    } else if (effectiveNodeTransform?.enabled) {
      const defaultTemplate = '{emoji}{region}-{protocol}-{index}';
      const renameObj =
        effectiveNodeTransform.rename && typeof effectiveNodeTransform.rename === 'object'
          ? (effectiveNodeTransform.rename as { template?: { template?: string } })
          : null;
      const effectiveTemplate = renameObj?.template?.template || defaultTemplate;
      transformedUrls = applyNodeTransformPipeline(nodeUrls, {
        ...effectiveNodeTransform,
        enableEmoji: settings.enableFlagEmoji !== false && effectiveTemplate.includes('{emoji}'),
      });
    }

    processedNodes = transformedUrls.map((transformedUrl) => {
      const nodeInfo = parseNodeInfo(transformedUrl);
      const originalNode = allNodes.find((n) => {
        try {
          const origUrl = new URL(n.url);
          const transUrl = new URL(transformedUrl);
          return origUrl.hostname === transUrl.hostname && origUrl.port === transUrl.port;
        } catch {
          return false;
        }
      });
      return {
        ...nodeInfo,
        subscriptionName: originalNode?.subscriptionName || '未知',
      };
    });
  }

  // 生成统计信息（使用处理后的节点）
  const protocolStats = calculateProtocolStats(processedNodes);
  const regionStats = calculateRegionStats(processedNodes);

  return {
    success: true,
    profileName: profile.name || '',
    subscriptions: allResults,
    nodes: processedNodes,
    totalCount: processedNodes.length,
    stats: {
      protocols: protocolStats,
      regions: regionStats,
    },
  };
}
