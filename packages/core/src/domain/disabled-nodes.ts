/**
 * 订阅源节点禁用列表（disabledNodes）规范化与集合构建工具。
 * 用于在预览弹窗按单节点开关停用特定节点，并在输出/组合订阅组预览时剔除它们。
 */

import type { SubscriptionItem } from '../types.js';

/**
 * 规范化停用节点 URL 列表（去空白、去重）
 */
export function normalizeDisabledNodes(raw: unknown): string[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of list) {
    const value = typeof item === 'string' ? item.trim() : '';
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

/**
 * 获取订阅源停用节点 URL 的 Set 集合
 */
export function getDisabledNodeSet(subscription: Partial<SubscriptionItem> | null | undefined): Set<string> {
  return new Set(normalizeDisabledNodes(subscription?.disabledNodes));
}
