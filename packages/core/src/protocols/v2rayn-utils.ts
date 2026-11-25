/**
 * v2rayN 专有分享格式（v2rayn://）工具模块（前后端共享）
 *
 * 链接结构: v2rayn://<协议>/<URL-Safe Base64(JSON 序列化的 ProfileItem)>
 * 节点名称存放在 JSON 的 Remarks 字段（不在 # 片段中），因此改名、加前缀、
 * 添加/移除 Emoji 都必须改写 Base64 载荷本身，绝不能往链接尾部拼接 # 片段。
 */

import { base64ToUtf8, utf8ToBase64 } from '../utils/base64.js';

const V2RAYN_SCHEME = 'v2rayn://';

export interface DecodedV2raynNode {
  protocol: string;
  config: Record<string, unknown>;
}

export function isV2raynUrl(url: unknown): boolean {
  return typeof url === 'string' && url.trim().toLowerCase().startsWith(V2RAYN_SCHEME);
}

/**
 * 解析 v2rayn:// 分享链接
 */
export function decodeV2raynNodeUrl(url: string): DecodedV2raynNode | null {
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

    const parsed: unknown = JSON.parse(base64ToUtf8(payload));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return { protocol, config: parsed as Record<string, unknown> };
  } catch (e) {
    console.debug('[v2rayn] decode failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * 将 ProfileItem 配置编码为 v2rayn:// 链接
 */
function encodeV2raynNodeUrl(protocol: string, config: Record<string, unknown>): string {
  return `${V2RAYN_SCHEME}${protocol}/${utf8ToBase64(JSON.stringify(config))}`;
}

/**
 * 读取 v2rayn:// 链接的节点名称（Remarks 字段）
 */
export function getV2raynRemarks(url: string): string {
  const decoded = decodeV2raynNodeUrl(url);
  return String(decoded?.config?.Remarks || '');
}

/**
 * 修改 v2rayn:// 链接的节点名称（Remarks 字段）
 * 任何失败都原样返回，不破坏链接结构
 */
export function renameV2raynNodeUrl(url: string, newName: string): string {
  if (!isV2raynUrl(url) || !newName) return url;
  const decoded = decodeV2raynNodeUrl(url);
  if (!decoded) return url;
  try {
    const config = { ...decoded.config, Remarks: newName };
    return encodeV2raynNodeUrl(decoded.protocol, config);
  } catch (e) {
    console.debug('[v2rayn] rename failed:', e instanceof Error ? e.message : e);
    return url;
  }
}
