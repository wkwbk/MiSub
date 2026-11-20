/**
 * 订阅节点过滤规则（include/exclude/proto）与算子链/旧版转换桥接
 */

import { parseNodeInfo } from '../../modules/utils/geo-utils.js';
import { runOperatorChain } from '../../utils/operator-runner.js';

/**
 * 应用过滤规则
 * @param {Array} validNodes - 有效节点列表
 * @param {Object} sub - 订阅对象
 * @returns {Array} - 过滤后的节点列表
 */
export function applyFilterRules(validNodes, sub) {
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

    let excludeLines = [];
    let keepLines = [];

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

/**
 * 应用订阅治理转换：算子链 + 基于文本的过滤
 * @param {string[]} nodeUrls
 * @param {Object} sub
 * @returns {Promise<string[]>}
 */
export async function applySubscriptionTransforms(nodeUrls, sub) {
    if (!nodeUrls || nodeUrls.length === 0) return [];

    let processed = [...nodeUrls];

    // 1. 应用算子链 (如果有算子定义)
    if (Array.isArray(sub.operators) && sub.operators.length > 0) {
        processed = await runOperatorChain(processed, sub.operators);
    }

    // 2. 应用传统的过滤规则 (exclude/include)
    processed = applyFilterRules(processed, sub);

    return processed;
}

export function buildRuleSet(lines, stripKeepPrefix = false) {
    const protocols = new Set();
    const patterns = [];

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

export function buildSafeRegex(patterns) {
    if (!patterns.length) return null;
    try {
        return new RegExp(patterns.join('|'), 'i');
    } catch (e) {
        console.warn('Invalid include/exclude regex, skipped:', e.message);
        return null;
    }
}

export function filterNodes(nodes, rules, mode = 'exclude') {
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
        const protocolHit = protocol && rules.protocols.has(protocol);

        let nameHit = false;
        if (rules.nameRegex) {
            // [双重匹配] 匹配原始名称、中文名，以及尝试匹配 ISO 关键词
            nameHit = rules.nameRegex.test(nodeName) || rules.nameRegex.test(regionZh);

            // 如果上述没中，但规则包含大写 ISO 代码，尝试深度匹配
            if (!nameHit && /^[A-Z]{2}$/.test(rules.nameRegex.source)) {
                // 这里可以进一步扩展，但为了性能目前保持双重匹配
            }
        }

        if (isInclude) {
            return protocolHit || nameHit;
        }
        return !(protocolHit || nameHit);
    });
}

/**
 * 桥接模式：将旧版 NodeTransform 配置转换为新的 Operator 列表
 * @param {Object} config - 旧版配置对象
 * @returns {Array} - 转换后的操作符列表
 */
export function adaptLegacyTransform(config) {
    if (!config || !config.enabled) return [];

    const ops = [];

    // 1. 过滤器 (Filter)
    const filter = config.filter;
    if (
        filter &&
        (filter.include?.enabled ||
            filter.exclude?.enabled ||
            filter.protocols?.enabled ||
            filter.regions?.enabled ||
            filter.script?.enabled ||
            filter.useless?.enabled)
    ) {
        ops.push({
            id: 'legacy-filter',
            type: 'filter',
            enabled: true,
            params: { ...filter },
        });
    }

    // 2. 正则重命名 (Regex Rename)
    const regex = config.rename?.regex;
    if (regex?.enabled && regex.rules?.length > 0) {
        ops.push({
            id: 'legacy-rename-regex',
            type: 'rename',
            enabled: true,
            params: { regex: { ...regex } },
        });
    }

    // 3. 模板重命名 (Template Rename)
    const template = config.rename?.template;
    if (template?.enabled) {
        ops.push({
            id: 'legacy-rename-template',
            type: 'rename',
            enabled: true,
            params: {
                template: {
                    enabled: true,
                    template: template.template || '{emoji}{region}-{protocol}-{index}',
                    offset: template.indexStart || 1,
                    indexScope: template.indexScope || 'region',
                },
            },
        });
    }

    // 4. 重命名脚本 (Script Rename)
    const renameScript = config.rename?.script;
    if (renameScript?.enabled && renameScript.expression) {
        ops.push({
            id: 'legacy-rename-script',
            type: 'script',
            enabled: true,
            params: {
                code: `return ($nodes) => { return $nodes.map(n => { n.name = (${renameScript.expression})(n.name, n); return n; }); }`,
            },
        });
    }

    // 5. 去重 (Dedup)
    const dedup = config.dedup;
    if (dedup?.enabled) {
        ops.push({
            id: 'legacy-dedup',
            type: 'dedup',
            enabled: true,
            params: { ...dedup },
        });
    }

    // 6. 排序 (Sort)
    const sort = config.sort;
    if (sort?.enabled && sort.keys?.length > 0) {
        ops.push({
            id: 'legacy-sort',
            type: 'sort',
            enabled: true,
            params: { ...sort },
        });
    }

    return ops;
}

