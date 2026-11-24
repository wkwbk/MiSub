/**
 * v2rayN 专有分享格式（v2rayn://）工具模块（前后端共享）
 *
 * 链接结构: v2rayn://<协议>/<URL-Safe Base64(JSON 序列化的 ProfileItem)>
 * 节点名称存放在 JSON 的 Remarks 字段（不在 # 片段中），因此改名、加前缀、
 * 添加/移除 Emoji 都必须改写 Base64 载荷本身，绝不能往链接尾部拼接 # 片段。
 */

import { base64ToUtf8, utf8ToBase64 } from './base64.js';

const V2RAYN_SCHEME = 'v2rayn://';

export function isV2raynUrl(url) {
  return typeof url === 'string' && url.trim().toLowerCase().startsWith(V2RAYN_SCHEME);
}

/**
 * 解析 v2rayn:// 分享链接
 * @param {string} url - v2rayn:// 链接
 * @returns {{protocol: string, config: Object}|null} 内层协议与 ProfileItem 配置；解析失败返回 null
 */
export function decodeV2raynNodeUrl(url) {
  if (!isV2raynUrl(url)) return null;
  try {
    let body = url.trim().substring(V2RAYN_SCHEME.length);
    const hashIndex = body.indexOf('#');
    if (hashIndex !== -1) body = body.substring(0, hashIndex);
    const queryIndex = body.indexOf('?');
    if (queryIndex !== -1) body = body.substring(0, queryIndex);

    const slashIndex = body.indexOf('/');
    if (slashIndex <= 0) return null;
    const protocol = body.substring(0, slashIndex);
    const payload = body.substring(slashIndex + 1).replace(/\s+/g, '');
    if (!protocol || !payload) return null;

    const config = JSON.parse(base64ToUtf8(payload));
    if (!config || typeof config !== 'object') return null;
    return { protocol, config };
  } catch (e) {
    console.debug('[v2rayn] decode failed:', e?.message || e);
    return null;
  }
}

/**
 * 将 ProfileItem 配置编码为 v2rayn:// 链接
 * @param {string} protocol - 内层协议
 * @param {Object} config - ProfileItem 配置对象
 * @returns {string} v2rayn:// 链接
 */
export function encodeV2raynNodeUrl(protocol, config) {
  return `${V2RAYN_SCHEME}${protocol}/${utf8ToBase64(JSON.stringify(config))}`;
}

/**
 * 读取 v2rayn:// 链接的节点名称（Remarks 字段）
 * @param {string} url - v2rayn:// 链接
 * @returns {string} 节点名称；解析失败返回空字符串
 */
export function getV2raynRemarks(url) {
  const decoded = decodeV2raynNodeUrl(url);
  return String(decoded?.config?.Remarks || '');
}

/**
 * 修改 v2rayn:// 链接的节点名称（Remarks 字段）
 * 任何失败都原样返回，不破坏链接结构
 * @param {string} url - v2rayn:// 链接
 * @param {string} newName - 新节点名称
 * @returns {string} 改名后的链接；失败时返回原始链接
 */
export function renameV2raynNodeUrl(url, newName) {
  if (!isV2raynUrl(url) || !newName) return url;
  const decoded = decodeV2raynNodeUrl(url);
  if (!decoded) return url;
  try {
    const config = { ...decoded.config, Remarks: newName };
    return encodeV2raynNodeUrl(decoded.protocol, config);
  } catch (e) {
    console.debug('[v2rayn] rename failed:', e?.message || e);
    return url;
  }
}
