import type {
  DslStep,
  NodeRecord,
  OperatorContext,
  OperatorDedupParams,
  OperatorFilterParams,
  OperatorRenameParams,
  OperatorRule,
  OperatorScriptParams,
  OperatorSortKey,
  RegexRuleItem,
} from '../types.js';
import * as NodeUtils from './node-transformer.js';
import { matchesDslCondition, renderDslTemplate } from './expression-dsl.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * 辅助函数：将规则模式规范化为正则表达式数组
 */
function normalizeRules(rules: unknown): RegexRuleItem[] {
  if (!rules) return [];
  if (!Array.isArray(rules)) {
    if (typeof rules === 'string')
      return rules
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    return [];
  }

  const normalized: RegexRuleItem[] = [];
  for (const rule of rules) {
    if (typeof rule === 'string') {
      // 支持在单个算子输入中通过 | 或 换行符 传递多个子规则
      const parts = rule
        .split(/\r?\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      normalized.push(...parts);
    } else if (isRecord(rule) && typeof rule.pattern === 'string' && rule.pattern) {
      normalized.push(rule as RegexRuleItem);
    }
  }
  return normalized;
}

const normalizeProto = (p: unknown): string => {
  const lower = String(p || '').toLowerCase();
  if (lower === 'hy2') return 'hysteria2';
  if (lower === 'hy') return 'hysteria';
  if (lower === 'socks5') return 'socks';
  return lower;
};

function opFilter(nodes: NodeRecord[], params?: OperatorFilterParams): NodeRecord[] {
  if (!params) return nodes;
  const { include, exclude, protocols, regions } = params;
  let result = [...nodes];

  if (include?.enabled) {
    const rules = normalizeRules(include.rules);
    if (rules.length > 0) {
      result = result.filter((r) => {
        const enriched = NodeUtils.ensureRegionInfo(r, true); // 强制获取元数据
        const matchRaw = NodeUtils.matchesRegexRules(r.name, rules);
        const matchClean = r.metadata?.cleanName ? NodeUtils.matchesRegexRules(r.metadata.cleanName, rules) : false;
        const matchRegion =
          NodeUtils.matchesRegexRules(enriched.regionZh || '', rules) ||
          NodeUtils.matchesRegexRules(enriched.region, rules) ||
          NodeUtils.matchesRegexRules(enriched.regionCode || '', rules); // [新增] ISO 代码匹配

        return matchRaw || matchClean || matchRegion;
      });
    }
  }
  if (exclude?.enabled) {
    const rules = normalizeRules(exclude.rules);
    if (rules.length > 0) {
      result = result.filter((r) => {
        const enriched = NodeUtils.ensureRegionInfo(r, true); // 强制获取元数据
        const matchRaw = NodeUtils.matchesRegexRules(r.name, rules);
        const matchClean = r.metadata?.cleanName ? NodeUtils.matchesRegexRules(r.metadata.cleanName, rules) : false;
        const matchRegion =
          NodeUtils.matchesRegexRules(enriched.regionZh || '', rules) ||
          NodeUtils.matchesRegexRules(enriched.region, rules) ||
          NodeUtils.matchesRegexRules(enriched.regionCode || '', rules); // [新增] ISO 代码匹配

        return !(matchRaw || matchClean || matchRegion);
      });
    }
  }
  if (protocols?.enabled && Array.isArray(protocols.values)) {
    const allowed = new Set(protocols.values.map(normalizeProto));
    result = result.filter((r) => allowed.has(normalizeProto(r.protocol)));
  }
  if (regions?.enabled && Array.isArray(regions.values)) {
    result = result.map((r) => NodeUtils.ensureRegionInfo(r, true));
    const allowed = new Set(regions.values);
    result = result.filter((r) => allowed.has(r.regionZh || '') || allowed.has(r.region));
  }
  return result;
}

function opRename(nodes: NodeRecord[], params?: OperatorRenameParams): NodeRecord[] {
  if (!params) return nodes;
  const { regex, template } = params;
  let result = [...nodes];

  if (regex?.enabled) {
    const rules = normalizeRules(regex.rules);
    if (rules.length > 0) {
      result = result.map((r) => {
        const enriched = NodeUtils.ensureRegionInfo(r, true);
        const vars = {
          name: r.name,
          protocol: r.protocol,
          region: enriched.region,
          regionZh: enriched.regionZh,
          emoji: enriched.emoji,
          server: r.server,
          port: r.port,
        };

        // 核心增强：允许在正则替换中使用 {regionZh} 等变量
        const processedRules = rules.map((rule): RegexRuleItem => {
          if (typeof rule === 'object' && rule.replacement && rule.replacement.includes('{')) {
            return {
              ...rule,
              replacement: NodeUtils.renderTemplate(rule.replacement, vars, r),
            };
          }
          return rule;
        });

        const newName = NodeUtils.applyRegexRename(r.name, processedRules, r);
        if (newName !== r.name) {
          return {
            ...r,
            name: newName,
            url: NodeUtils.setNodeName(r.url, r.protocol, newName),
            region: '',
            regionZh: '',
            emoji: '',
          };
        }
        return r;
      });
    }
  }

  if (template?.enabled && template.template) {
    const templateStr = template.template;
    const counters = new Map<string, number>();
    const scope = template.indexScope || template.scope || 'region'; // 默认按地区分组计数，符合用户直觉

    result = result.map((r, index) => {
      const enriched = NodeUtils.ensureRegionInfo(r, true);

      // 确定索引分组键
      let groupKey = 'global';
      if (scope === 'region') groupKey = `r:${enriched.regionZh || 'Other'}`;
      else if (scope === 'protocol') groupKey = `p:${r.protocol}`;
      else if (scope === 'regionProtocol') groupKey = `rp:${enriched.regionZh || 'Other'}|${r.protocol}`;

      const groupIndex = (counters.get(groupKey) || 0) + 1;
      counters.set(groupKey, groupIndex);

      const vars = {
        name: r.name,
        protocol: r.protocol,
        region: enriched.region,
        regionZh: enriched.regionZh,
        emoji: enriched.emoji,
        server: r.server,
        port: r.port,
        index: groupIndex + (Number(template.offset || template.indexStart) || 1) - 1,
        globalIndex: index + (Number(template.offset || template.indexStart) || 1),
      };
      const newName = NodeUtils.renderTemplate(templateStr, vars, r);

      if (newName !== r.name) {
        return {
          ...r,
          name: newName,
          url: NodeUtils.setNodeName(r.url, r.protocol, newName),
        };
      }
      return r;
    });
  }

  return result;
}

async function opScript(
  nodes: NodeRecord[],
  params: OperatorScriptParams = {},
  context?: OperatorContext,
): Promise<NodeRecord[]> {
  const dsl: DslStep[] = Array.isArray(params.dsl)
    ? params.dsl
    : params.action
      ? [params as DslStep]
      : [];

  if (!dsl.length) {
    if (params.code || params.url) {
      console.warn('[Operator] Legacy script code is disabled; use params.dsl instead.');
    }
    return nodes;
  }

  let result = nodes.map((r) => NodeUtils.ensureRegionInfo(r, true));

  for (const step of dsl) {
    if (!isRecord(step)) continue;
    const action = String(step.action || '').toLowerCase();
    if (action === 'filter') {
      result = result.filter((node, index) =>
        matchesDslCondition({ ...node, index: index + 1 }, step as { field?: string; value?: unknown; op?: string; flags?: string }),
      );
      continue;
    }
    if (action === 'rename') {
      const template = step.template || step.expression;
      if (!template) continue;
      result = result.map((node, index) => {
        const nextName =
          renderDslTemplate(template, {
            ...node,
            index: index + 1,
            target: context?.target || '',
          }) || node.name;
        if (nextName === node.name) return node;
        return {
          ...node,
          name: nextName,
          url: NodeUtils.setNodeName(node.url, node.protocol, nextName),
          metadata: node.metadata ? { ...node.metadata, cleanName: nextName } : node.metadata,
        };
      });
    }
  }

  return result;
}

export async function runOperatorChain(
  nodeUrls: string[],
  operators: OperatorRule[],
  context: OperatorContext = {},
): Promise<string[]> {
  if (!Array.isArray(operators) || operators.length === 0) {
    return nodeUrls;
  }

  let records = NodeUtils.nodeUrlsToRecords(nodeUrls, {
    needServerPort: true,
    ensureRegion: false,
  });
  const metadataByUrl =
    context.nodeMetadataByUrl instanceof Map
      ? context.nodeMetadataByUrl
      : new Map(Object.entries(context.nodeMetadataByUrl || {}));
  if (metadataByUrl.size > 0) {
    records = records.map((record) => ({
      ...record,
      ...metadataByUrl.get(record.url),
    }));
  }

  const ua = (context.userAgent || '').toLowerCase();
  const platform: OperatorContext = {
    isClash: /clash|mihomo|stash|meta|verge/i.test(ua),
    isSurge: /surge/i.test(ua),
    isQuanX: /quantumult/i.test(ua),
    isLoon: /loon/i.test(ua),
    isShadowrocket: /shadowrocket/i.test(ua),
    isSingBox: /sing-box|singbox/i.test(ua),
    userAgent: context.userAgent,
    target: context.target || 'base64',
  };

  const enrichedContext: OperatorContext = { ...context, ...platform };

  for (const op of operators) {
    const { type, params, enabled } = op;
    if (enabled === false) continue;

    switch (type) {
      case 'filter':
        records = opFilter(records, params as OperatorFilterParams);
        break;
      case 'rename':
        records = opRename(records, params as OperatorRenameParams);
        break;
      case 'script':
        records = await opScript(records, params as OperatorScriptParams, enrichedContext);
        break;
      case 'sort':
        if (params && Array.isArray(params.keys)) {
          const sortKeys = params.keys as OperatorSortKey[];
          const needsRegion = sortKeys.some((k) => k.key === 'region' || k.key === 'regionZh');
          if (needsRegion) {
            records = records.map((r) => NodeUtils.ensureRegionInfo(r, true));
          }
          records.sort(NodeUtils.makeComparator({ keys: sortKeys }));
        }
        break;
      case 'dedup': {
        const dedupParams = (params || {}) as OperatorDedupParams;
        const mode = dedupParams.mode === 'url' ? 'url' : 'serverPort';
        const includeProtocol = dedupParams.includeProtocol !== false;
        const protocolOrder = Array.isArray(dedupParams.prefer?.protocolOrder)
          ? dedupParams.prefer.protocolOrder.map(normalizeProto)
          : [];
        const getProtocolRank = (protocol: string) => {
          const idx = protocolOrder.indexOf(normalizeProto(protocol));
          return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
        };
        const seenNodes = new Map<string, NodeRecord>();
        for (const r of records) {
          const hasHostPort = Boolean(r.server && r.port);
          const key =
            mode === 'url' || !hasHostPort
              ? String(r.url || '').split('#')[0]
              : includeProtocol
                ? `${normalizeProto(r.protocol)}|${r.server}:${r.port}`
                : `${r.server}:${r.port}`;
          const existing = seenNodes.get(key);
          if (!existing) {
            seenNodes.set(key, r);
          } else {
            if (protocolOrder.length > 0) {
              const nextRank = getProtocolRank(r.protocol);
              const existingRank = getProtocolRank(existing.protocol);
              if (nextRank < existingRank) {
                seenNodes.set(key, r);
                continue;
              }
              if (nextRank > existingRank) {
                continue;
              }
            }
            if ((r.name || '').length > (existing.name || '').length) {
              seenNodes.set(key, r);
            }
          }
        }
        records = Array.from(seenNodes.values());
        break;
      }
    }
  }

  return NodeUtils.recordsToNodeUrls(records);
}
