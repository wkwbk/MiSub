import { DEFAULT_GROUP_KEY } from '@/composables/manual-nodes/groups.js';

export { DEFAULT_GROUP_KEY };

/**
 * 规范化机场订阅分组名称。空字符串或默认占位名统一视作未分组。
 */
export function normalizeSubscriptionGroupName(groupName) {
    const trimmed = typeof groupName === 'string' ? groupName.trim() : '';
    if (!trimmed || trimmed === DEFAULT_GROUP_KEY || trimmed === 'Default') {
        return '';
    }
    return trimmed;
}

/**
 * 读取订阅所属分组：优先使用 `sub.group`，仅当 `sub.group` 未定义时兼容旧版 `airportIdentity.name`。
 */
export function getSubscriptionGroup(sub) {
    if (!sub || typeof sub !== 'object') return '';
    if (sub.group !== undefined) {
        return normalizeSubscriptionGroupName(sub.group);
    }
    return normalizeSubscriptionGroupName(sub.airportIdentity?.name);
}

/**
 * 从订阅列表中提取去重后的分组名称列表（保持首次出现顺序）。
 */
export function collectSubscriptionGroups(subscriptions = []) {
    const seen = new Set();
    const groups = [];
    for (const sub of subscriptions || []) {
        const group = getSubscriptionGroup(sub);
        if (group && !seen.has(group)) {
            seen.add(group);
            groups.push(group);
        }
    }
    return groups;
}
