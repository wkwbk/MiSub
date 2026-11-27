/**
 * 订阅浏览器门户页渲染模块
 * - 生产/运行时将脱敏后的订阅门户载荷（__MISUB_PORTAL_DATA__）注入 SPA 入口 index.html，由 Vue 门户页接管渲染；
 * - 测试或无静态资产环境下回退为精简 HTML 壳，同样严格保证零上游节点敏感信息泄露。
 */

import type { MultiSocksBinding } from '@misub/core/domain/multi-socks.js';
import type { PortalCustomPageConfig } from '@misub/core/types.js';
import { SYSTEM_CONSTANTS } from '../../config.js';
import { escapeHtml } from '../../utils.js';

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
  portalCustomPage?: PortalCustomPageConfig;
}

export interface SubscriptionPortalRenderParams {
  version?: string;
  title: string;
  subName: string;
  siteTitle?: string;
  notice?: string;
  subscriptionUrl: string;
  pathname?: string;
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
  defaultLocale?: string;
  multiSocks: {
    enabled: boolean;
    listen: string;
    startPort: number;
    maxPorts: number;
    hasAuth: boolean;
    totalRealNodes: number;
    bindings: MultiSocksBinding[];
  };
  portalCustomPage?: Partial<PortalCustomPageConfig> | null;
}

const PORTAL_RESPONSE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store, no-cache',
  'X-MiSub-Mode': 'subscription-portal',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const;

function sanitizeBindings(bindings: MultiSocksBinding[] = []): MultiSocksBinding[] {
  // 严格只保留门户展示所需的非敏感字段，绝不输出上游 server/port/uuid/password
  return bindings.map((item) => ({
    port: Number(item.port),
    listen: item.listen === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
    protocol: 'socks5',
    proxyName: String(item.proxyName || ''),
    region: String(item.region || ''),
    countryCode: String(item.countryCode || ''),
    ...(item.username && item.password
      ? { username: String(item.username), password: String(item.password) }
      : {}),
  }));
}

function normalizePortalCustomPage(
  raw: Partial<PortalCustomPageConfig> | null | undefined,
): PortalCustomPageConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    enabled: raw.enabled === true,
    type: 'html',
    content: typeof raw.content === 'string' ? raw.content : '',
    css: typeof raw.css === 'string' ? raw.css : '',
    useDefaultLayout: raw.useDefaultLayout !== false,
    hideBranding: raw.hideBranding === true,
    hideHeader: raw.hideHeader === true,
    hideFooter: raw.hideFooter === true,
  };
}

export function buildSubscriptionPortalPayload(params: SubscriptionPortalRenderParams): SubscriptionPortalPayload {
  const safeSubName = String(params.subName || params.title || 'MiSub').trim() || 'MiSub';
  const safeTitle = String(params.title || safeSubName).trim() || safeSubName;
  let pathname = String(params.pathname || '').trim();
  if (!pathname && params.subscriptionUrl) {
    try {
      pathname = new URL(params.subscriptionUrl).pathname;
    } catch {
      pathname = '';
    }
  }

  return {
    version: String(params.version || SYSTEM_CONSTANTS.VERSION),
    title: safeTitle,
    subName: safeSubName,
    siteTitle: String(params.siteTitle || 'MiSub').trim() || 'MiSub',
    notice: String(params.notice || ''),
    subscriptionUrl: String(params.subscriptionUrl || ''),
    pathname,
    isExpired: Boolean(params.isExpired),
    traffic: {
      upload: Math.max(0, Number(params.traffic?.upload) || 0),
      download: Math.max(0, Number(params.traffic?.download) || 0),
      total: Math.max(0, Number(params.traffic?.total) || 0),
      remaining: Math.max(0, Number(params.traffic?.remaining) || 0),
    },
    expireText: String(params.expireText || ''),
    expireStatus: String(params.expireStatus || ''),
    nodeCount: Math.max(0, Number(params.nodeCount) || 0),
    defaultLocale: String(params.defaultLocale || 'zh-CN'),
    multiSocks: {
      enabled: Boolean(params.multiSocks?.enabled),
      listen: String(params.multiSocks?.listen || '127.0.0.1'),
      startPort: Number(params.multiSocks?.startPort) || 42001,
      maxPorts: Number(params.multiSocks?.maxPorts) || 300,
      hasAuth: Boolean(params.multiSocks?.hasAuth),
      totalRealNodes: Math.max(0, Number(params.multiSocks?.totalRealNodes) || 0),
      bindings: params.multiSocks?.enabled ? sanitizeBindings(params.multiSocks.bindings) : [],
    },
    ...(params.portalCustomPage ? { portalCustomPage: normalizePortalCustomPage(params.portalCustomPage) } : {}),
  };
}

function serializePayloadJson(payload: SubscriptionPortalPayload): string {
  return JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/-->/g, '--\\u003e');
}

function buildDocumentTitle(payload: SubscriptionPortalPayload): string {
  const hideBranding = Boolean(payload.portalCustomPage?.enabled && payload.portalCustomPage?.hideBranding);
  return hideBranding ? escapeHtml(payload.title) : `${escapeHtml(payload.title)} - MiSub`;
}

function injectPortalDataIntoSpaHtml(spaHtml: string, payload: SubscriptionPortalPayload, serializedPayload: string): string {
  const documentTitle = buildDocumentTitle(payload);
  const injection = `<meta name="referrer" content="no-referrer" />\n  <script id="__MISUB_PORTAL_DATA__" type="application/json">${serializedPayload}</script>`;

  let result = spaHtml;
  if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(result)) {
    result = result.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, () => `<title>${documentTitle}</title>`);
  } else if (/<\/head>/i.test(result)) {
    result = result.replace(/<\/head>/i, () => `<title>${documentTitle}</title>\n</head>`);
  }

  return /<\/head>/i.test(result)
    ? result.replace(/<\/head>/i, () => `${injection}\n</head>`)
    : `${injection}\n${result}`;
}

function renderMinimalTestShell(payload: SubscriptionPortalPayload, serializedPayload: string): string {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(payload.defaultLocale || 'zh-CN')}">
<head>
  <meta charset="UTF-8" />
  <meta name="referrer" content="no-referrer" />
  <title>${buildDocumentTitle(payload)}</title>
  <script id="__MISUB_PORTAL_DATA__" type="application/json">${serializedPayload}</script>
</head>
<body><div id="app"></div></body>
</html>`;
}

/**
 * 渲染独立订阅门户页响应：向 SPA 入口 HTML 注入脱敏载荷；无静态资产上下文（纯 Node 单测）时返回最小测试壳。
 */
export async function renderSubscriptionPortalPage(
  params: SubscriptionPortalRenderParams,
  options: { fetchSpaEntry?: () => Promise<Response> } = {},
): Promise<Response> {
  const payload = buildSubscriptionPortalPayload(params);
  const serializedPayload = serializePayloadJson(payload);

  if (typeof options.fetchSpaEntry === 'function') {
    try {
      const spaResponse = await options.fetchSpaEntry();
      const contentType = spaResponse?.headers?.get?.('content-type') || '';
      if (spaResponse?.ok && contentType.includes('text/html')) {
        const spaHtml = await spaResponse.text();
        return new Response(injectPortalDataIntoSpaHtml(spaHtml, payload, serializedPayload), {
          status: 200,
          headers: PORTAL_RESPONSE_HEADERS,
        });
      }
    } catch (error) {
      console.warn('[MiSub Portal] Failed to fetch SPA entry, falling back to minimal test shell:', error);
    }
  }

  return new Response(renderMinimalTestShell(payload, serializedPayload), {
    status: 200,
    headers: PORTAL_RESPONSE_HEADERS,
  });
}
