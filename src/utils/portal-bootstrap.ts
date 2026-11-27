import type { MultiSocksBinding } from '@misub/core/domain/multi-socks.js';
import type { PortalCustomPageConfig } from '@misub/core/types.js';

export interface SubscriptionPortalPayload {
  version: string;
  title: string;
  subName: string;
  siteTitle: string;
  notice: string;
  subscriptionUrl: string;
  pathname: string;
  isExpired: boolean;
  traffic: {
    upload: number;
    download: number;
    total: number;
    remaining: number;
  };
  expireText: string;
  expireStatus: string;
  nodeCount: number;
  defaultLocale: string;
  multiSocks: {
    enabled: boolean;
    listen: string;
    startPort: number;
    maxPorts: number;
    hasAuth: boolean;
    totalRealNodes: number;
    bindings: MultiSocksBinding[];
  };
  portalCustomPage?: Partial<PortalCustomPageConfig>;
}

const PORTAL_DATA_SCRIPT_ID = '__MISUB_PORTAL_DATA__';

function normalizePath(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

/**
 * 读取服务端注入到 SPA HTML 中的订阅门户初始载荷。
 */
export function readBootstrappedPortalData(): SubscriptionPortalPayload | null {
  if (typeof document === 'undefined') return null;
  const scriptEl = document.getElementById(PORTAL_DATA_SCRIPT_ID);
  const rawJson = scriptEl?.textContent?.trim();
  if (!rawJson) return null;

  try {
    const parsed = JSON.parse(rawJson) as Partial<SubscriptionPortalPayload> | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.subscriptionUrl !== 'string') {
      return null;
    }

    if (typeof window !== 'undefined' && parsed.pathname && window.location?.pathname) {
      if (normalizePath(parsed.pathname) !== normalizePath(window.location.pathname)) {
        return null;
      }
    }

    return {
      version: String(parsed.version || '1.0.0'),
      title: String(parsed.title || parsed.subName || 'MiSub'),
      subName: String(parsed.subName || parsed.title || 'MiSub'),
      siteTitle: String(parsed.siteTitle || 'MiSub'),
      notice: String(parsed.notice || ''),
      subscriptionUrl: parsed.subscriptionUrl,
      pathname: String(parsed.pathname || ''),
      isExpired: Boolean(parsed.isExpired),
      traffic: {
        upload: Math.max(0, Number(parsed.traffic?.upload) || 0),
        download: Math.max(0, Number(parsed.traffic?.download) || 0),
        total: Math.max(0, Number(parsed.traffic?.total) || 0),
        remaining: Math.max(0, Number(parsed.traffic?.remaining) || 0),
      },
      expireText: String(parsed.expireText || ''),
      expireStatus: String(parsed.expireStatus || ''),
      nodeCount: Math.max(0, Number(parsed.nodeCount) || 0),
      defaultLocale: String(parsed.defaultLocale || 'zh-CN'),
      multiSocks: {
        enabled: Boolean(parsed.multiSocks?.enabled),
        listen: String(parsed.multiSocks?.listen || '127.0.0.1'),
        startPort: Number(parsed.multiSocks?.startPort) || 42001,
        maxPorts: Number(parsed.multiSocks?.maxPorts) || 300,
        hasAuth: Boolean(parsed.multiSocks?.hasAuth),
        totalRealNodes: Math.max(0, Number(parsed.multiSocks?.totalRealNodes) || 0),
        bindings: Array.isArray(parsed.multiSocks?.bindings) ? parsed.multiSocks.bindings : [],
      },
      portalCustomPage:
        parsed.portalCustomPage && typeof parsed.portalCustomPage === 'object' ? parsed.portalCustomPage : undefined,
    };
  } catch {
    return null;
  }
}
