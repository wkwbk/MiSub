import type { ManualNodeItem, ProfileConfig, SubscriptionItem, SubscriptionUserInfo } from '@misub/core/types.js';
import { getProfileShareIdentifier } from '@misub/core/domain/profile-link.js';

const NODE_PROTOCOLS = [
  'ss',
  'ssr',
  'vmess',
  'vless',
  'trojan',
  'hysteria',
  'hysteria2',
  'hy',
  'hy2',
  'tuic',
  'anytls',
  'socks5',
  'socks',
  'snell',
  'naive+https',
  'naive+quic',
  'naive+http',
  'wireguard',
  'v2rayn',
];

const NODE_PROTOCOL_REGEX = new RegExp(
  `^(${NODE_PROTOCOLS.map((protocol) => protocol.replace('+', '\\+')).join('|')}):\\/\\/`,
  'i',
);

export interface ExternalSubscriptionDto {
  id: string;
  type: 'subscription';
  name: string;
  url: string;
  enabled: boolean;
  autoUpdate: boolean;
  tags: string[];
  userAgent: string;
  proxy: string;
  nodeCount: number;
  userInfo: SubscriptionUserInfo | null;
  lastError: string;
  lastUpdate: string | null;
  sortIndex: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ExternalManualNodeDto {
  id: string;
  type: 'manual_node';
  name: string;
  url: string;
  protocol: string;
  enabled: boolean;
  tags: string[];
  remarks: string;
  sortIndex: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ExternalProfileDto {
  id: string;
  name: string;
  description: string;
  tags: string[];
  enabled: boolean;
  isPublic: boolean;
  customId: string;
  linkId: string;
  shareId: string;
  subscriptionIds: string[];
  manualNodeIds: string[];
  target: string;
  sortIndex: number;
  createdAt: string | null;
  updatedAt: string | null;
}

type SubscriptionRecordLike = Partial<SubscriptionItem> & {
  id: string;
  userAgent?: string;
  proxy?: string;
};

type ManualNodeRecordLike = Partial<ManualNodeItem> & {
  id: string;
};

type ProfileRecordLike = Partial<ProfileConfig> & {
  id: string;
};

export function isRemoteSubscription(item: unknown): item is SubscriptionItem {
  if (typeof item !== 'object' || item === null) return false;
  const candidate = item as { url?: unknown };
  return typeof candidate.url === 'string' && /^https?:\/\//i.test(candidate.url.trim());
}

export function isManualNode(item: unknown): item is ManualNodeItem {
  if (typeof item !== 'object' || item === null) return false;
  const candidate = item as { url?: unknown };
  if (typeof candidate.url !== 'string') return false;
  const url = candidate.url.trim();
  if (!url || /^https?:\/\//i.test(url)) return false;
  return NODE_PROTOCOL_REGEX.test(url);
}

export function detectNodeProtocol(url = ''): string {
  const match = String(url || '')
    .trim()
    .match(/^([a-z0-9+]+):\/\//i);
  return match ? match[1].toLowerCase() : '';
}

export function toExternalSubscription(item: SubscriptionRecordLike): ExternalSubscriptionDto {
  return {
    id: item.id,
    type: 'subscription',
    name: item.name || '',
    url: item.url || '',
    enabled: item.enabled !== false,
    autoUpdate: item.autoUpdate !== false,
    tags: Array.isArray(item.tags) ? item.tags : [],
    userAgent: item.userAgent || item.customUserAgent || '',
    proxy: item.proxy || item.fetchProxy || '',
    nodeCount: Number(item.nodeCount) || 0,
    userInfo: item.userInfo || null,
    lastError: item.lastError || '',
    lastUpdate: item.lastUpdate || null,
    sortIndex: Number(item.sortIndex) || 0,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
  };
}

export function toExternalManualNode(item: ManualNodeRecordLike): ExternalManualNodeDto {
  return {
    id: item.id,
    type: 'manual_node',
    name: item.name || '',
    url: item.url || '',
    protocol: detectNodeProtocol(item.url),
    enabled: item.enabled !== false,
    tags: Array.isArray(item.tags) ? item.tags : [],
    remarks: item.remarks || '',
    sortIndex: Number(item.sortIndex) || 0,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
  };
}

export function toExternalProfile(profile: ProfileRecordLike): ExternalProfileDto {
  return {
    id: profile.id,
    name: profile.name || '',
    description: profile.description || '',
    tags: Array.isArray(profile.tags) ? profile.tags : [],
    enabled: profile.enabled !== false,
    isPublic: profile.isPublic === true,
    customId: profile.customId || '',
    linkId: profile.linkId || '',
    shareId: getProfileShareIdentifier(profile),
    subscriptionIds: Array.isArray(profile.subscriptions)
      ? profile.subscriptions
          .map((item) => (typeof item === 'object' && item !== null ? item.id : item))
          .filter((val): val is string => Boolean(val))
      : [],
    manualNodeIds: Array.isArray(profile.manualNodes) ? profile.manualNodes.filter(Boolean) : [],
    target: profile.target || 'clash',
    sortIndex: Number(profile.sortIndex) || 0,
    createdAt: profile.createdAt || null,
    updatedAt: profile.updatedAt || null,
  };
}
