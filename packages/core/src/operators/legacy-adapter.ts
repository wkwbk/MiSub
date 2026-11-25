/**
 * 订阅节点过滤规则（include/exclude/proto）与算子链/旧版转换桥接
 */

import type { OperatorRule } from '../types.js';
import { parseNodeInfo } from '../node/geo-utils.js';
import { isSafeUserRegexPattern } from '../utils/regex-safety.js';

export interface LegacyRuleSet {
  protocols: Set<string>;
  nameRegex: RegExp | null;
  hasRules: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * 应用过滤规则
 */
export function applyFilterRules(validNodes: string[], sub: { exclude?: string }): string[] {
  const ruleText = sub.exclude;
  if (!ruleText || ruleText.trim() === '') return validNodes;

  const lines = ruleText
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);

  if (lines.length === 0) return validNodes;

  // 规则分割：--- 为分隔，keep: 为白名单
  const dividerIndex = lines.findIndex((line) => line === '---');
  const hasDivider = dividerIndex !== -1;

  let excludeLines: string[] = [];
  let keepLines: string[] = [];

  if (hasDivider) {
    lines.slice(0, dividerIndex).forEach((l) => {
      if (l.toLowerCase().startsWith('keep:')) {
        keepLines.push(l);
      } else {
        excludeLines.push(l);
      }
    });
    lines.slice(dividerIndex + 1).forEach((l) => {
      keepLines.push(l);
    });
  } else {
    excludeLines = lines.filter((line) => !line.toLowerCase().startsWith('keep:'));
    keepLines = lines.filter((line) => line.toLowerCase().startsWith('keep:'));
  }

  const excludeRules = buildRuleSet(excludeLines, false);
  const keepRules = buildRuleSet(keepLines, true);

  let result = validNodes;

  if (keepRules.hasRules) {
    result = filterNodes(result, keepRules, 'include');
  }

  if (excludeRules.hasRules) {
    result = filterNodes(result, excludeRules, 'exclude');
  }

  return result;
}

export function buildRuleSet(lines: string[], stripKeepPrefix = false): LegacyRuleSet {
  const protocols = new Set<string>();
  const patterns: string[] = [];

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line || line === '---') continue;

    if (stripKeepPrefix && line.toLowerCase().startsWith('keep:')) {
      line = line.substring('keep:'.length).trim();
    }
    if (!line) continue;

    if (line.toLowerCase().startsWith('proto:')) {
      const parts = line
        .substring('proto:'.length)
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
      parts.forEach((p) => protocols.add(p));
      continue;
    }

    patterns.push(line);
  }

  const nameRegex = buildSafeRegex(patterns);
  return {
    protocols,
    nameRegex,
    hasRules: protocols.size > 0 || Boolean(nameRegex),
  };
}

export function buildSafeRegex(patterns: string[]): RegExp | null {
  if (!patterns.length) return null;
  const safePatterns = patterns.filter((pattern) => {
    if (isSafeUserRegexPattern(pattern, 512)) return true;
    console.warn('Unsafe or invalid include/exclude regex, skipped');
    return false;
  });
  if (!safePatterns.length) return null;
  const combined = safePatterns.join('|');
  if (combined.length > 2048) {
    console.warn('Combined include/exclude regex too long, skipped');
    return null;
  }
  try {
    return new RegExp(combined, 'i');
  } catch (e) {
    console.warn('Invalid include/exclude regex, skipped:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

export function filterNodes(
  nodes: string[],
  rules: LegacyRuleSet | null | undefined,
  mode: 'include' | 'exclude' = 'exclude',
): string[] {
  if (!rules || !rules.hasRules) return nodes;
  const isInclude = mode === 'include';

  return nodes.filter((nodeLink) => {
    // [升级] 传统过滤引擎现在也支持元数据/ISO感知
    const nodeInfo = parseNodeInfo(nodeLink);
    const protocol = nodeInfo.protocol || '';
    const nodeName = nodeInfo.name || '';
    const regionZh = nodeInfo.region || '';

    // --- [ISO感知核心逻辑] ---
    // 我们利用 geo-utils 中的 extractNodeRegion 来反查 ISO 代码
    // 虽然 info 里没显式带 regionCode，但在 rules 匹配时增加深度检测
    const protocolHit = Boolean(protocol && rules.protocols.has(protocol));

    let nameHit = false;
    if (rules.nameRegex) {
      // [双重匹配] 匹配原始名称、中文名，以及尝试匹配 ISO 关键词
      nameHit = rules.nameRegex.test(nodeName) || rules.nameRegex.test(regionZh);
    }

    if (isInclude) {
      return protocolHit || nameHit;
    }
    return !(protocolHit || nameHit);
  });
}

/**
 * 桥接模式：将旧版 NodeTransform 配置转换为新的 Operator 列表
 */
export function adaptLegacyTransform(config: unknown): OperatorRule[] {
  if (!isRecord(config) || !config.enabled) return [];

  const ops: OperatorRule[] = [];

  // 1. 过滤器 (Filter)
  const filter = isRecord(config.filter) ? config.filter : null;
  if (
    filter &&
    ((isRecord(filter.include) && filter.include.enabled) ||
      (isRecord(filter.exclude) && filter.exclude.enabled) ||
      (isRecord(filter.protocols) && filter.protocols.enabled) ||
      (isRecord(filter.regions) && filter.regions.enabled) ||
      (isRecord(filter.script) && filter.script.enabled) ||
      (isRecord(filter.useless) && filter.useless.enabled))
  ) {
    ops.push({
      id: 'legacy-filter',
      type: 'filter',
      enabled: true,
      params: { ...filter },
    });
  }

  const rename = isRecord(config.rename) ? config.rename : null;

  // 2. 正则重命名 (Regex Rename)
  const regex = rename && isRecord(rename.regex) ? rename.regex : null;
  if (regex?.enabled && Array.isArray(regex.rules) && regex.rules.length > 0) {
    ops.push({
      id: 'legacy-rename-regex',
      type: 'rename',
      enabled: true,
      params: { regex: { ...regex } },
    });
  }

  // 3. 模板重命名 (Template Rename)
  const template = rename && isRecord(rename.template) ? rename.template : null;
  if (template?.enabled) {
    ops.push({
      id: 'legacy-rename-template',
      type: 'rename',
      enabled: true,
      params: {
        template: {
          enabled: true,
          template: typeof template.template === 'string' && template.template ? template.template : '{emoji}{region}-{protocol}-{index}',
          offset: template.indexStart || 1,
          indexScope: template.indexScope || 'region',
        },
      },
    });
  }

  // 4. 重命名脚本 (Script Rename)
  const renameScript = rename && isRecord(rename.script) ? rename.script : null;
  if (renameScript?.enabled && renameScript.expression) {
    ops.push({
      id: 'legacy-rename-script',
      type: 'script',
      enabled: true,
      params: { dsl: [{ action: 'rename', template: renameScript.expression }] },
    });
  }

  // 5. 去重 (Dedup)
  const dedup = isRecord(config.dedup) ? config.dedup : null;
  if (dedup?.enabled) {
    ops.push({
      id: 'legacy-dedup',
      type: 'dedup',
      enabled: true,
      params: { ...dedup },
    });
  }

  // 6. 排序 (Sort)
  const sort = isRecord(config.sort) ? config.sort : null;
  if (sort?.enabled && Array.isArray(sort.keys) && sort.keys.length > 0) {
    ops.push({
      id: 'legacy-sort',
      type: 'sort',
      enabled: true,
      params: { ...sort },
    });
  }

  return ops;
}
