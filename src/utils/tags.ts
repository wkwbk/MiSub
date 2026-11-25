/**
 * 统一标签（Tags）工具函数
 *
 * 支持：
 * - 多标签规范化与去重
 * - 多选标签交集筛选（含「全部」与「无标签」语言无关哨兵）
 * - 批量追加 / 覆盖 / 移除 / 清空标签
 * - 标签重命名、删除与自定义排序
 */

export interface TaggableItem {
  tags?: unknown;
}

export type TagBatchMode = 'append' | 'add' | 'replace' | 'remove' | 'clear';

export interface TagListChangeResult {
  nextTags: string[];
  changed: boolean;
}

/**
 * 「无标签」过滤器的固定哨兵值（与界面语言解耦，绝不使用本地化显示文案比较）。
 */
export const UNTAGGED_KEY = '__untagged__';

/**
 * 规范化单个标签名：去除首尾空白，排除空字符串与无标签哨兵。
 */
export function normalizeTagName(rawTag: unknown): string {
  const trimmed = typeof rawTag === 'string' ? rawTag.trim() : '';
  if (!trimmed || trimmed === UNTAGGED_KEY) {
    return '';
  }
  return trimmed;
}

/**
 * 规范化标签数组（支持传入字符串数组，或逗号分隔字符串），去重并保持首次出现顺序。
 */
export function normalizeTagList(rawTags: unknown): string[] {
  let source: unknown[] = [];
  if (Array.isArray(rawTags)) {
    source = rawTags;
  } else if (typeof rawTags === 'string') {
    source = rawTags.split(/[,，]/);
  }

  const seen = new Set<string>();
  const result: string[] = [];
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
 */
export function getItemTags(item: TaggableItem | null | undefined): string[] {
  if (!item || typeof item !== 'object' || !Array.isArray(item.tags)) return [];
  return normalizeTagList(item.tags);
}

/**
 * 获取实体的首个标签（用于「节点名前添加首个标签前缀」及标签排序）。
 */
export function getPrimaryTag(item: TaggableItem | null | undefined): string {
  const tags = getItemTags(item);
  return tags[0] || '';
}

/**
 * 将标签列表应用到实体副本上。
 */
export function applyItemTags<T extends object>(item: T, nextTags: unknown): T & { tags: string[] } {
  if (!item || typeof item !== 'object') return item as T & { tags: string[] };
  return {
    ...item,
    tags: normalizeTagList(nextTags),
  };
}

/**
 * 水合时统一规范化实体的 `tags` 字段。
 */
export function hydrateItemTags<T extends TaggableItem>(item: T): T & { tags: string[] } {
  if (!item || typeof item !== 'object') return item as T & { tags: string[] };
  return {
    ...item,
    tags: getItemTags(item),
  };
}

/**
 * 从实体集合中收集所有去重后的标签列表。
 * 若提供 `customOrder`，优先按自定义顺序排列，新出现的标签按首次出现顺序追加在末尾。
 */
export function collectTags(
  items: Array<TaggableItem | null | undefined> = [],
  customOrder: string[] = [],
): string[] {
  const seen = new Set<string>();
  const allTags: string[] = [];

  for (const item of items || []) {
    for (const tag of getItemTags(item)) {
      if (!seen.has(tag)) {
        seen.add(tag);
        allTags.push(tag);
      }
    }
  }

  if (Array.isArray(customOrder) && customOrder.length > 0) {
    const ordered: string[] = [];
    const remaining = new Set<string>(allTags);

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
 * - 包含 `UNTAGGED_KEY` => `[UNTAGGED_KEY]`（表示「无标签」）
 * - 其余标签列表 => 去重规范化后的标签数组（多选交集）
 */
export function normalizeActiveTagFilters(rawFilter: unknown): string[] {
  if (!rawFilter) return [];
  const list: unknown[] = Array.isArray(rawFilter) ? rawFilter : [rawFilter];
  if (list.some((item) => item === UNTAGGED_KEY)) {
    return [UNTAGGED_KEY];
  }
  return normalizeTagList(list);
}

/**
 * 切换标签筛选条件（支持多选组合交集）：
 * - 点击 `null` / `''`（「全部」）：清空所有已选标签，返回 `[]`
 * - 点击 `UNTAGGED_KEY`（「无标签」）：若当前已是「无标签」则恢复「全部」，否则切换为 `[UNTAGGED_KEY]`
 * - 点击具体标签：自动互斥移除「无标签」，并在已选集合中切换该标签（全部取消后自动回到 `[]`）
 */
export function toggleTagFilterValue(
  currentFilters: unknown,
  targetTag: string | null | undefined,
): string[] {
  const current = normalizeActiveTagFilters(currentFilters);

  if (!targetTag) {
    return [];
  }

  if (targetTag === UNTAGGED_KEY) {
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
 */
export function matchesTagFilter(
  item: TaggableItem | null | undefined,
  activeFilters: unknown,
): boolean {
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
 */
export function renameTagInList(
  tags: unknown,
  oldName: string,
  newName: string,
): TagListChangeResult {
  const normalizedOld = normalizeTagName(oldName);
  const normalizedNew = normalizeTagName(newName);
  const current = normalizeTagList(tags);

  if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew) {
    return { nextTags: current, changed: false };
  }
  if (!current.includes(normalizedOld)) {
    return { nextTags: current, changed: false };
  }

  const replaced = normalizeTagList(current.map((tag) => (tag === normalizedOld ? normalizedNew : tag)));
  return { nextTags: replaced, changed: true };
}

/**
 * 计算移除某个标签后的新标签数组。
 */
export function removeTagFromList(tags: unknown, targetTag: string): TagListChangeResult {
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
 */
export function computeBatchUpdatedTags(
  existingTags: unknown,
  inputTags: unknown,
  mode: TagBatchMode = 'append',
): TagListChangeResult {
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

  const changed = nextTags.length !== current.length || nextTags.some((tag, idx) => tag !== current[idx]);
  return { nextTags, changed };
}
