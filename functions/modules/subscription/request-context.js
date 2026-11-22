import { normalizeSubPath } from '../../../shared/reserved-paths.js';

/**
 * 解析订阅请求路径中的路径前缀与目标标识
 *
 * 唯一支持的 URL 格式：
 *   /{subPath}/{identifier}
 *     - identifier === config.mytoken → 默认订阅（全部启用节点）
 *     - 否则 → 订阅组（按 profileId 或 customId 查找）
 *
 * @param {URL} url - 请求 URL
 * @param {Object} config - 全局配置
 * @returns {{token: string, profileIdentifier: (string|null)}}
 */
export function resolveRequestContext(url, config) {
  const subPath = normalizeSubPath(config?.profileToken, 'sub');
  const pathSegments = url.pathname.split('/').filter(Boolean);

  if (pathSegments.length !== 2 || pathSegments[0] !== subPath) {
    return { token: '', profileIdentifier: null };
  }

  const identifier = pathSegments[1];
  const mytoken = typeof config?.mytoken === 'string' ? config.mytoken.trim() : '';

  if (mytoken && identifier === mytoken) {
    return { token: identifier, profileIdentifier: null };
  }

  return { token: subPath, profileIdentifier: identifier };
}
