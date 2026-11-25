/**
 * 从订阅组引用项中提取订阅 ID。
 * 兼容纯字符串 ID 与带覆盖配置的对象格式（如 { id, exclude, operators, ... }）。
 *
 * @param {string|Object|null|undefined} entry
 * @returns {string}
 */
export function getProfileSubscriptionId(entry) {
  if (typeof entry === 'string') {
    return entry.trim();
  }
  if (entry && typeof entry === 'object' && typeof entry.id === 'string') {
    return entry.id.trim();
  }
  return '';
}
