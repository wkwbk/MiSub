import type { ProfileSubscriptionRef } from '../types.js';

/**
 * 从订阅组引用项中提取订阅 ID。
 * 兼容纯字符串 ID 与带覆盖配置的对象格式（如 { id, exclude, operators, ... }）。
 */
export function getProfileSubscriptionId(entry: ProfileSubscriptionRef | null | undefined): string {
  if (typeof entry === 'string') {
    return entry.trim();
  }
  if (entry && typeof entry === 'object' && typeof entry.id === 'string') {
    return entry.id.trim();
  }
  return '';
}
