import { base64ToUtf8 } from '@misub/core/utils/base64.js';
import type { StoreMisubItem } from '@/queries/useAppDataQueries.js';
import { getItemTags } from '@/utils/tags.js';

export type DedupNodeItem = StoreMisubItem & { __index: number };

export interface DedupPlan {
  totalNodes: number;
  keepCount: number;
  removeCount: number;
  removeNodes: DedupNodeItem[];
}

const safeBase64Decode = (input: string): string => {
  try {
    return base64ToUtf8(input);
  } catch {
    return '';
  }
};

const buildSortedQuery = (params: URLSearchParams): string => {
  const items = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
  return items.length ? `?${items.map(([k, v]) => `${k}=${v}`).join('&')}` : '';
};

const normalizeUrlForDedup = (url: string): string => {
  try {
    const raw = String(url || '').trim();
    if (!raw) return '';

    if (raw.startsWith('vmess://')) {
      const payload = raw.substring('vmess://'.length);
      const decoded = safeBase64Decode(payload);
      if (!decoded) return raw;
      const nodeConfig = JSON.parse(decoded) as Record<string, unknown>;
      delete nodeConfig.ps;
      delete nodeConfig.remark;
      delete nodeConfig.remarks;
      delete nodeConfig.name;
      const sorted = Object.keys(nodeConfig)
        .sort()
        .reduce<Record<string, unknown>>((obj, key) => {
          obj[key] = nodeConfig[key];
          return obj;
        }, {});
      return `vmess://${JSON.stringify(sorted)}`;
    }

    if (raw.startsWith('ssr://')) {
      const payload = raw.substring('ssr://'.length);
      const decoded = safeBase64Decode(payload);
      if (!decoded) return raw.split('#')[0];
      const parts = decoded.split('/?');
      const base = parts[0] || decoded;
      const query = parts[1] || '';
      const params = new URLSearchParams(query);
      params.delete('remarks');
      params.delete('remark');
      params.delete('group');
      params.delete('name');
      const normalizedQuery = buildSortedQuery(params).replace('?', '');
      return normalizedQuery ? `ssr://${base}/?${normalizedQuery}` : `ssr://${base}`;
    }

    const hashIndex = raw.indexOf('#');
    const withoutHash = hashIndex !== -1 ? raw.substring(0, hashIndex) : raw;

    let parsed: URL;
    try {
      parsed = new URL(withoutHash);
    } catch {
      return withoutHash;
    }

    const params = new URLSearchParams(parsed.search);
    params.delete('remarks');
    params.delete('remark');
    params.delete('name');
    params.delete('ps');
    params.delete('desc');

    const protocol = parsed.protocol.toLowerCase();
    const username = parsed.username ? decodeURIComponent(parsed.username) : '';
    const password = parsed.password ? decodeURIComponent(parsed.password) : '';
    const host = parsed.hostname;
    const port = parsed.port || params.get('port') || '';
    const path = parsed.pathname || '';
    const query = buildSortedQuery(params);
    const auth = username || password ? `${username}:${password}@` : '';

    return `${protocol}//${auth}${host}${port ? `:${port}` : ''}${path}${query}`;
  } catch {
    return url;
  }
};

const getNodePriorityScore = (node: StoreMisubItem): number => {
  let score = 0;
  if (node.enabled) score += 8;
  if (node.name && node.name.trim()) score += 4;
  if (getItemTags(node).length > 0) score += 2;
  if (node.colorTag) score += 1;
  if (node.notes && node.notes.trim()) score += 1;
  return score;
};

export function buildDedupPlan(nodes: StoreMisubItem[]): DedupPlan {
  const enrichedNodes: DedupNodeItem[] = nodes.map((node, index) => ({ ...node, __index: index }));
  const bucket = new Map<string, DedupNodeItem[]>();

  for (const node of enrichedNodes) {
    const key = normalizeUrlForDedup(node.url);
    if (!key) continue;
    const list = bucket.get(key) || [];
    list.push(node);
    bucket.set(key, list);
  }

  const removeNodes: DedupNodeItem[] = [];
  const keepNodes: DedupNodeItem[] = [];

  for (const list of bucket.values()) {
    if (list.length === 1) {
      keepNodes.push(list[0]);
      continue;
    }
    const sorted = [...list].sort((a, b) => {
      const scoreDiff = getNodePriorityScore(b) - getNodePriorityScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      const nameDiff = (b.name || '').length - (a.name || '').length;
      if (nameDiff !== 0) return nameDiff;
      return a.__index - b.__index;
    });
    keepNodes.push(sorted[0]);
    removeNodes.push(...sorted.slice(1));
  }

  return {
    totalNodes: enrichedNodes.length,
    keepCount: keepNodes.length,
    removeCount: removeNodes.length,
    removeNodes,
  };
}
