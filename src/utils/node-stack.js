/**
 * 同 IP 节点卡片堆叠分组工具
 * - 按解析后的 IP 字段分组，当同一 IP 节点数 > 1 时合并为堆叠卡片
 * - 自动过滤 CDN IP（networkType === 'cdn' 或 stackable === false），避免优选域名/CDN 节点误堆叠
 * - 保持节点原有首次出现顺序
 */

/**
 * 判断节点是否允许参与同 IP 堆叠
 * @param {Object|null|undefined} inspectInfo
 * @returns {boolean}
 */
export function isNodeStackable(inspectInfo) {
  if (!inspectInfo || typeof inspectInfo !== 'object') return false;
  if (!inspectInfo.ip) return false;
  if (inspectInfo.networkType === 'cdn') return false;
  if (inspectInfo.stackable === false) return false;
  return true;
}

/**
 * 将节点列表按同 IP 分组（非 CDN IP 且数量 > 1 时合并为 stack，其余保持 single）
 * @param {Array<Object>} nodes
 * @param {Record<string, Object>} inspectMap
 * @param {boolean} enabled
 * @returns {Array<{type: 'single', key: string, node: Object} | {type: 'stack', key: string, ip: string, info: Object, nodes: Array<Object>}>}
 */
export function groupNodesByIp(nodes, inspectMap = {}, enabled = true) {
  const list = Array.isArray(nodes) ? nodes : [];
  if (!enabled) {
    return list.map((node) => ({
      type: 'single',
      key: node.id,
      node,
    }));
  }

  const ipBuckets = new Map();
  for (const node of list) {
    const info = inspectMap?.[node.id];
    if (isNodeStackable(info)) {
      const ip = String(info.ip).trim().toLowerCase();
      if (!ipBuckets.has(ip)) {
        ipBuckets.set(ip, { ip: info.ip, info, nodes: [] });
      }
      ipBuckets.get(ip).nodes.push(node);
    }
  }

  const emittedIps = new Set();
  const grouped = [];

  for (const node of list) {
    const info = inspectMap?.[node.id];
    if (isNodeStackable(info)) {
      const ipKey = String(info.ip).trim().toLowerCase();
      const bucket = ipBuckets.get(ipKey);
      if (bucket && bucket.nodes.length > 1) {
        if (!emittedIps.has(ipKey)) {
          emittedIps.add(ipKey);
          grouped.push({
            type: 'stack',
            key: `ip:${bucket.ip}`,
            ip: bucket.ip,
            info: bucket.info,
            nodes: bucket.nodes,
          });
        }
        continue;
      }
    }

    grouped.push({
      type: 'single',
      key: node.id,
      node,
    });
  }

  return grouped;
}
