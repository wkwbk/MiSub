import { getClientAdapter, type ClientAdapterOptions } from './adapter-registry.js';

/**
 * 内置订阅配置转换统一入口（基于 ClientAdapter 注册表按需懒加载，避免冷启动全量解析）
 */
export async function transformBuiltinSubscription(
  nodeList: string,
  targetFormat: string,
  options: ClientAdapterOptions = {},
): Promise<string | null> {
  const adapter = getClientAdapter(targetFormat);
  if (!adapter) return null;
  return await adapter.generateBuiltin(nodeList, options);
}
