/**
 * 生成唯一节点名称（统一 _1, _2 后缀策略）
 */
export function getUniqueName(baseName: string, usedNames: Map<string, number>): string {
  const count = (usedNames.get(baseName) || 0) + 1;
  usedNames.set(baseName, count);
  return count === 1 ? baseName : `${baseName}_${count - 1}`;
}

/**
 * 清理字符串中的控制字符（保留换行、回车与制表符）
 */
export function cleanControlChars<T>(str: T): T {
  if (typeof str !== 'string') return str;
  // oxlint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') as T;
}
