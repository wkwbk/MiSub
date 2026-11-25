import { getClientAdapter } from './adapter-registry.js';

/**
 * 内置订阅配置转换统一入口（基于 ClientAdapter 注册表按需懒加载，避免冷启动全量解析）
 * @param {string} nodeList
 * @param {string} targetFormat
 * @param {Record<string, any>} [options]
 * @returns {Promise<string | null>}
 */
export async function transformBuiltinSubscription(nodeList, targetFormat, options = {}) {
  const adapter = getClientAdapter(targetFormat);
  if (!adapter) return null;
  return await adapter.generateBuiltin(nodeList, options);
}
