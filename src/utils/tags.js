/**
 * 统一标签（Tags）工具函数
 *
 * 全面替代原有的单值分组（group），支持：
 * - 多标签规范化与去重
 * - 旧版 `group` / `airportIdentity.name` 无缝兼容迁移
 * - 多选标签交集筛选（含「全部」与「无标签」语言无关哨兵）
 * - 批量追加 / 覆盖 / 移除 / 清空标签
 * - 标签重命名、删除与自定义排序
 */

/**
 * 「无标签」过滤器的固定哨兵值（与界面语言解耦，绝不使用本地化显示文案比较）。
 */
export const UNTAGGED_KEY = '__untagged__';

/**
 * 兼容旧版「默认」哨兵常量，仅用于识别历史传入值。
 */
const LEGACY_UNTAGGED_SENTINELS = new Set([UNTAGGED_KEY, '默认', 'Default']);

/**
 * 规范化单个标签名：去除首尾空白，排除空字符串与「无标签/默认」占位词。
 * @param {unknown} rawTag
 * @returns {string}
 */
export function normalizeTagName(rawTag) {
    const trimmed = typeof rawTag === 'string' ? rawTag.trim() : '';
    if (!trimmed || LEGACY_UNTAGGED_SENTINELS.has(trimmed)) {
        return '';
    }
    return trimmed;
}

/**
 * 规范化标签数组（支持传入字符串数组，或逗号分隔字符串），去重并保持首次出现顺序。
 * @param {unknown} rawTags
 * @returns {string[]}
 */
export function normalizeTagList(rawTags) {
    let source = [];
    if (Array.isArray(rawTags)) {
        source = rawTags;
    } else if (typeof rawTags === 'string') {
        source = rawTags.split(/[,，]/);
    }

    const seen = new Set();
    const result = [];
    for (const item of source) {
        const tag = normalizeTagName(item);
        if (tag && !seen.has(tag)) {
            seen.add(tag);
            result.push(tag);
        }
    }
    return result;
}

/**
 * 读取任意实体（节点 / 订阅 / 分享组合）的标签列表。
 * - 若实体已有非空 `tags` 数组，使用规范化后的 `tags`
 * - 若实体尚未写入 `tags`（或旧版外部映射为空数组）但仍保留旧版 `group` / `airportIdentity.name`，自动兼容提取为标签
 * @param {Record<string, any> | null | undefined} item
 * @returns {string[]}
 */
export function getItemTags(item) {
    if (!item || typeof item !== 'object') return [];

    if (Array.isArray(item.tags) && item.tags.length > 0) {
        return normalizeTagList(item.tags);
    }

    // 若显式设置过空 tags 且 group 已同步为空，直接返回 []
    const legacyGroup = normalizeTagName(
        item.group !== undefined ? item.group : item.airportIdentity?.name
    );
    if (Array.isArray(item.tags)) {
        return legacyGroup ? [legacyGroup] : [];
    }

    return legacyGroup ? [legacyGroup] : [];
}

/**
 * 获取实体的首个标签（用于「节点名前添加首个标签前缀」及后端兼容字段）。
 * @param {Record<string, any> | null | undefined} item
 * @returns {string}
 */
export function getPrimaryTag(item) {
    const tags = getItemTags(item);
    return tags[0] || '';
}

/**
 * 将标签列表应用到实体副本上，同时同步 `group = tags[0] || ''`（供首个标签前缀与外部接口向后兼容）并清理旧版 `airportIdentity`。
 * @template {Record<string, any>} T
 * @param {T} item
 * @param {unknown} nextTags
 * @returns {T}
 */
export function applyItemTags(item, nextTags) {
    if (!item || typeof item !== 'object') return item;
    const tags = normalizeTagList(nextTags);
    const updated = {
        ...item,
        tags,
        group: tags[0] || '',
    };
    if ('airportIdentity' in updated) {
        updated.airportIdentity = null;
    }
    return updated;
}

/**
 * 水合时统一规范化实体的 `tags` 字段（保留原有自定义字段，旧数据自动把 `group` 提升进 `tags`）。
 * @template {Record<string, any>} T
 * @param {T} item
 * @returns {T}
 */
export function hydrateItemTags(item) {
    if (!item || typeof item !== 'object') return item;
    const tags = getItemTags(item);
    return {
        ...item,
        tags,
        group: tags[0] || '',
    };
}

/**
 * 从实体集合中收集所有去重后的标签列表。
 * 若提供 `customOrder`，优先按自定义顺序排列，新出现的标签按首次出现顺序追加在末尾。
 * @param {Array<Record<string, any>>} items
 * @param {string[]} [customOrder=[]]
 * @returns {string[]}
 */
export function collectTags(items = [], customOrder = []) {
    const seen = new Set();
    const allTags = [];

    for (const item of items || []) {
        for (const tag of getItemTags(item)) {
            if (!seen.has(tag)) {
                seen.add(tag);
                allTags.push(tag);
            }
        }
    }

    if (Array.isArray(customOrder) && customOrder.length > 0) {
        const ordered = [];
        const remaining = new Set(allTags);

        for (const raw of customOrder) {
            const tag = normalizeTagName(raw);
            if (tag && remaining.has(tag)) {
                ordered.push(tag);
                remaining.delete(tag);
            }
        }

        for (const tag of allTags) {
            if (remaining.has(tag)) {
                ordered.push(tag);
                remaining.delete(tag);
            }
        }

        return ordered;
    }

    return allTags;
}

/**
 * 规范化当前激活的标签筛选条件：
 * - 空值 / 空数组 => `[]`（表示「全部」）
 * - 包含 `UNTAGGED_KEY` 或旧版「默认」哨兵 => `[UNTAGGED_KEY]`（表示「无标签」）
 * - 其余标签列表 => 去重规范化后的标签数组（多选交集）
 * @param {unknown} rawFilter
 * @returns {string[]}
 */
export function normalizeActiveTagFilters(rawFilter) {
    if (!rawFilter) return [];
    const list = Array.isArray(rawFilter) ? rawFilter : [rawFilter];
    if (list.some((item) => item === UNTAGGED_KEY || item === '默认')) {
        return [UNTAGGED_KEY];
    }
    return normalizeTagList(list);
}

/**
 * 切换标签筛选条件（支持多选组合交集）：
 * - 点击 `null` / `''`（「全部」）：清空所有已选标签，返回 `[]`
 * - 点击 `UNTAGGED_KEY`（「无标签」）：若当前已是「无标签」则恢复「全部」，否则切换为 `[UNTAGGED_KEY]`
 * - 点击具体标签：自动互斥移除「无标签」，并在已选集合中切换该标签（全部取消后自动回到 `[]`）
 * @param {unknown} currentFilters
 * @param {string | null | undefined} targetTag
 * @returns {string[]}
 */
export function toggleTagFilterValue(currentFilters, targetTag) {
    const current = normalizeActiveTagFilters(currentFilters);

    if (!targetTag) {
        return [];
    }

    if (targetTag === UNTAGGED_KEY || targetTag === '默认') {
        return current.length === 1 && current[0] === UNTAGGED_KEY ? [] : [UNTAGGED_KEY];
    }

    const normalizedTarget = normalizeTagName(targetTag);
    if (!normalizedTarget) return current;

    const withoutUntagged = current.filter((t) => t !== UNTAGGED_KEY);
    if (withoutUntagged.includes(normalizedTarget)) {
        return withoutUntagged.filter((t) => t !== normalizedTarget);
    }
    return [...withoutUntagged, normalizedTarget];
}

/**
 * 判断单个实体是否命中当前多选标签筛选（交集匹配）：
 * - `activeFilters` 为空：命中全部
 * - `activeFilters` 为 `[UNTAGGED_KEY]`：仅命中无任何标签的实体
 * - `activeFilters` 为多个标签：实体必须同时包含所有选中标签（AND 交集）
 * @param {Record<string, any>} item
 * @param {unknown} activeFilters
 * @returns {boolean}
 */
export function matchesTagFilter(item, activeFilters) {
    const filters = normalizeActiveTagFilters(activeFilters);
    if (filters.length === 0) return true;

    const itemTags = getItemTags(item);
    if (filters[0] === UNTAGGED_KEY) {
        return itemTags.length === 0;
    }

    const tagSet = new Set(itemTags);
    return filters.every((tag) => tagSet.has(tag));
}

/**
 * 计算重命名某个标签后的新标签数组（若新名称已存在则自动合并去重）。
 * @param {string[]} tags
 * @param {string} oldName
 * @param {string} newName
 * @returns {{ nextTags: string[], changed: boolean }}
 */
export function renameTagInList(tags, oldName, newName) {
    const normalizedOld = normalizeTagName(oldName);
    const normalizedNew = normalizeTagName(newName);
    const current = normalizeTagList(tags);

    if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew) {
        return { nextTags: current, changed: false };
    }
    if (!current.includes(normalizedOld)) {
        return { nextTags: current, changed: false };
    }

    const replaced = normalizeTagList(
        current.map((tag) => (tag === normalizedOld ? normalizedNew : tag))
    );
    return { nextTags: replaced, changed: true };
}

/**
 * 计算移除某个标签后的新标签数组。
 * @param {string[]} tags
 * @param {string} targetTag
 * @returns {{ nextTags: string[], changed: boolean }}
 */
export function removeTagFromList(tags, targetTag) {
    const normalizedTarget = normalizeTagName(targetTag);
    const current = normalizeTagList(tags);
    if (!normalizedTarget || !current.includes(normalizedTarget)) {
        return { nextTags: current, changed: false };
    }
    return {
        nextTags: current.filter((tag) => tag !== normalizedTarget),
        changed: true,
    };
}

/**
 * 根据批量模式计算单个实体的目标标签列表。
 * @param {string[]} existingTags
 * @param {unknown} inputTags
 * @param {'append' | 'replace' | 'remove' | 'clear'} [mode='append']
 * @returns {{ nextTags: string[], changed: boolean }}
 */
export function computeBatchUpdatedTags(existingTags, inputTags, mode = 'append') {
    const current = normalizeTagList(existingTags);
    const incoming = normalizeTagList(inputTags);

    let nextTags = current;
    switch (mode) {
        case 'clear':
            nextTags = [];
            break;
        case 'replace':
            nextTags = incoming;
            break;
        case 'remove': {
            const removeSet = new Set(incoming);
            nextTags = current.filter((tag) => !removeSet.has(tag));
            break;
        }
        case 'append':
        default:
            nextTags = normalizeTagList([...current, ...incoming]);
            break;
    }

    const changed =
        nextTags.length !== current.length || nextTags.some((tag, idx) => tag !== current[idx]);
    return { nextTags, changed };
}
