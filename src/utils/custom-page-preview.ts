import DOMPurify from 'dompurify';
import {
  PORTAL_PAGE_COMPONENT_PLACEHOLDERS,
  PORTAL_PAGE_SLOT_ALIASES,
  escapeCustomPageText,
  parseCustomPageSource,
  renderCustomPageHtml,
} from '@/utils/custom-page-source.js';

export interface CustomPagePreviewOptions {
  content: string;
  css: string;
  theme: 'light' | 'dark';
  useDefaultLayout: boolean;
  hideBranding: boolean;
  hideHeader: boolean;
  hideFooter: boolean;
  locale: string;
  siteTitle?: string;
  siteDescription?: string;
  heroTitle2?: string;
  announcement?: {
    enabled?: boolean;
    title?: string;
    content?: string;
    type?: string;
  };
  version: string;
}

export interface PortalCustomPagePreviewOptions {
  content: string;
  css: string;
  theme: 'light' | 'dark';
  useDefaultLayout: boolean;
  hideBranding: boolean;
  hideHeader: boolean;
  hideFooter: boolean;
  locale: string;
  portalTitle?: string;
  portalNotice?: string;
  portalStartPort?: number;
  portalListen?: string;
  version: string;
}

const ANNOUNCEMENT_ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'li', 'code', 'pre'];
const ANNOUNCEMENT_ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

function buildMockProfilesHtml(isZh: boolean): string {
  const sampleProfiles = isZh
    ? [
        {
          name: '高速专线订阅',
          tags: ['IPLC', '流媒体', '低延迟'],
          desc: '覆盖香港、新加坡、日本与美国骨干节点，支持 Clash / Sing-box / Shadowrocket 自动适配。',
        },
        {
          name: '轻量日常节点',
          tags: ['日常', 'IPv6'],
          desc: '稳定均衡线路，适合网页浏览、开发文档检索与常规跨区访问。',
        },
        {
          name: 'AI 工具专用组',
          tags: ['Claude', 'GPT', '原生 IP'],
          desc: '纯净住宅与机房原生出口，保障常见 AI 接口与开发服务稳定连通。',
        },
      ]
    : [
        {
          name: 'Premium Express Route',
          tags: ['IPLC', 'Streaming', 'Low Latency'],
          desc: 'Multi-region backbone nodes across HK, SG, JP and US with automatic multi-client formatting.',
        },
        {
          name: 'Daily Balanced Pack',
          tags: ['Daily', 'IPv6'],
          desc: 'Reliable everyday routes optimized for browsing, docs and remote workflows.',
        },
        {
          name: 'AI Workspace Group',
          tags: ['Claude', 'GPT', 'Clean IP'],
          desc: 'Clean residential and native exits tailored for AI assistants and developer APIs.',
        },
      ];

  const quickImportLabel = isZh ? '一键导入' : 'Quick Import';
  const previewTitle = isZh ? '预览节点' : 'Preview nodes';
  const copyTitle = isZh ? '复制链接' : 'Copy link';
  const qrTitle = isZh ? '二维码' : 'QR code';

  const cards = sampleProfiles
    .map((profile) => {
      const tagsHtml = profile.tags
        .map(
          (tag) =>
            `<span class="misub-mock-tag rounded-md border border-line bg-elevated-card text-fg-muted">${escapeCustomPageText(tag)}</span>`,
        )
        .join('');

      return `<div class="group misub-mock-card rounded-md border border-line bg-surface p-5">
  <div class="misub-mock-card-head">
    <div class="misub-mock-card-title-wrap">
      <span class="misub-mock-status-dot"></span>
      <h3 class="misub-mock-card-title text-fg">${escapeCustomPageText(profile.name)}</h3>
    </div>
    <button type="button" class="misub-mock-icon-btn rounded-md border border-line text-fg-subtle" title="${escapeCustomPageText(qrTitle)}" aria-label="${escapeCustomPageText(qrTitle)}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>
    </button>
  </div>
  <div class="misub-mock-tags">${tagsHtml}</div>
  <p class="misub-mock-card-desc text-fg-subtle">${escapeCustomPageText(profile.desc)}</p>
  <div class="misub-mock-card-actions border-line">
    <button type="button" class="misub-mock-primary-btn rounded-md bg-accent text-accent-fg">${escapeCustomPageText(quickImportLabel)}</button>
    <button type="button" class="misub-mock-icon-btn rounded-md border border-line text-fg-subtle" title="${escapeCustomPageText(previewTitle)}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
    </button>
    <button type="button" class="misub-mock-icon-btn rounded-md border border-line text-fg-subtle" title="${escapeCustomPageText(copyTitle)}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
    </button>
  </div>
</div>`;
    })
    .join('');

  return `<div class="misub-mock-profiles-grid">${cards}</div>`;
}

function buildMockAnnouncementHtml(options: CustomPagePreviewOptions, isZh: boolean): string {
  const useConfigured = options.announcement?.enabled !== false && Boolean(options.announcement?.title?.trim());
  const title = useConfigured
    ? options.announcement?.title?.trim() || ''
    : isZh
      ? '系统公告 · 节点路由已更新'
      : 'Announcement · Route Schedule Updated';

  const rawBody =
    useConfigured && options.announcement?.content?.trim()
      ? options.announcement.content
      : isZh
        ? '已完成边缘节点健康检查与订阅格式同步，推荐使用 <b>Clash Meta</b> 或 <b>Sing-box</b> 获取最佳体验。'
        : 'Edge health checks and format synchronization completed. <b>Clash Meta</b> and <b>Sing-box</b> are recommended.';

  const sanitizedBody = DOMPurify.sanitize(rawBody, {
    ALLOWED_TAGS: ANNOUNCEMENT_ALLOWED_TAGS,
    ALLOWED_ATTR: ANNOUNCEMENT_ALLOWED_ATTR,
  });

  const typeDotColor =
    options.announcement?.type === 'success'
      ? '#10b981'
      : options.announcement?.type === 'warning'
        ? '#f59e0b'
        : options.announcement?.type === 'error'
          ? '#ef4444'
          : '#71717a';

  return `<div class="misub-mock-announcement-wrap">
  <div class="misub-mock-announcement rounded-md border border-line bg-surface">
    <div class="misub-mock-announcement-head">
      <span class="misub-mock-announcement-dot" style="background:${typeDotColor}"></span>
      <h3 class="misub-mock-announcement-title text-fg">${escapeCustomPageText(title)}</h3>
    </div>
    <div class="misub-mock-announcement-body text-fg-muted">${sanitizedBody}</div>
  </div>
</div>`;
}

function buildMockHeroHtml(
  siteTitle: string,
  heroTitle2: string,
  siteDescription: string,
): string {
  return `<div class="misub-mock-hero">
  <h1 class="misub-mock-hero-title">
    <span class="misub-mock-hero-t1 text-fg">${escapeCustomPageText(siteTitle)}</span>
    <span class="misub-mock-hero-t2">${escapeCustomPageText(heroTitle2)}</span>
  </h1>
  <p class="misub-mock-hero-desc text-fg-subtle">${escapeCustomPageText(siteDescription)}</p>
</div>`;
}

function buildMockGuestbookHtml(isZh: boolean): string {
  const label = isZh ? '留言反馈' : 'Guestbook';
  return `<button type="button" class="misub-mock-guestbook-btn rounded-md bg-accent text-accent-fg border border-accent">${escapeCustomPageText(label)}</button>`;
}

function buildMockThemeToggleHtml(theme: 'light' | 'dark', isZh: boolean): string {
  const label = isZh ? '切换主题' : 'Toggle theme';
  const icon =
    theme === 'dark'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  return `<button type="button" class="theme-toggle-btn rounded-md border border-line bg-surface text-fg" title="${escapeCustomPageText(label)}" aria-label="${escapeCustomPageText(label)}">${icon}</button>`;
}

export function buildCustomPagePreviewSrcdoc(options: CustomPagePreviewOptions): string {
  const isZh = (options.locale || 'zh-CN').toLowerCase().startsWith('zh');
  const siteTitle = options.siteTitle?.trim() || 'MiSub';
  const heroTitle2 = options.heroTitle2?.trim() || 'Subscription Hub';
  const siteDescription =
    options.siteDescription?.trim() ||
    (isZh
      ? '轻量化订阅聚合与公开分发中心，支持多客户端自适应转换与节点在线预览。'
      : 'Lightweight subscription aggregator and public hub with multi-client adaptation and node inspection.');

  const parsed = parseCustomPageSource(options.content, options.css);
  const sanitizedUserHtml = renderCustomPageHtml(parsed.html || '', {
    version: options.version || '1.0.0',
    title: siteTitle,
    description: siteDescription,
    profile_count: 3,
    node_count: 68,
  });

  const mockSlots: Record<string, string> = {
    profiles: buildMockProfilesHtml(isZh),
    announcements: buildMockAnnouncementHtml(options, isZh),
    hero: buildMockHeroHtml(siteTitle, heroTitle2, siteDescription),
    guestbook: buildMockGuestbookHtml(isZh),
    theme_toggle: buildMockThemeToggleHtml(options.theme, isZh),
  };

  return assemblePreviewHtml({
    sanitizedUserHtml,
    mockSlots,
    parsedCss: parsed.css,
    theme: options.theme,
    useDefaultLayout: options.useDefaultLayout,
    hideBranding: options.hideBranding,
    hideHeader: options.hideHeader,
    hideFooter: options.hideFooter,
    isZh,
    headerTitle: siteTitle,
    navLabels: [isZh ? '公开订阅' : 'Profiles', isZh ? '客户端' : 'Clients'],
    version: options.version || '1.0.0',
  });
}

function buildMockPortalOverviewHtml(portalTitle: string, portalNotice: string, isZh: boolean): string {
  const overviewTitle = isZh ? '订阅概览' : 'Subscription Overview';
  const subLabel = isZh ? `订阅名称：${portalTitle}` : `Profile: ${portalTitle}`;
  const statusLabel = isZh ? '正常' : 'Active';

  const noticeHtml = portalNotice
    ? `<div class="misub-portal-notice">
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-primary-500);flex-shrink:0;margin-top:1px"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M22 8c0-2.3-.8-4.3-2-6"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/></svg>
  <div>${escapeCustomPageText(portalNotice)}</div>
</div>`
    : '';

  return `<section class="misub-portal-card">
  <div class="misub-portal-card-head">
    <div style="min-width:0">
      <h2 class="misub-portal-card-title">${escapeCustomPageText(overviewTitle)}</h2>
      <p class="misub-portal-card-sub">${escapeCustomPageText(subLabel)}</p>
    </div>
    <span class="misub-portal-status-badge">
      <span class="misub-portal-status-dot"></span>
      <span>${escapeCustomPageText(statusLabel)}</span>
    </span>
  </div>
  ${noticeHtml}
  <div class="misub-portal-stats-grid">
    <div class="misub-portal-stat-box">
      <div class="misub-portal-stat-top">
        <span>${escapeCustomPageText(isZh ? '总剩余流量' : 'Remaining Traffic')}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>
      </div>
      <div class="misub-portal-stat-value">428.5 GB / 500 GB</div>
      <div class="misub-portal-progress-track"><div class="misub-portal-progress-fill" style="width:86%"></div></div>
      <div class="misub-portal-stat-hint">${escapeCustomPageText(isZh ? '已用 71.5 GB · 剩余 86%' : 'Used 71.5 GB · 86% left')}</div>
    </div>
    <div class="misub-portal-stat-box">
      <div class="misub-portal-stat-top">
        <span>${escapeCustomPageText(isZh ? '最近过期时间' : 'Nearest Expiration')}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
      </div>
      <div class="misub-portal-stat-value">2027-01-01</div>
      <div class="misub-portal-stat-hint">${escapeCustomPageText(isZh ? `当前状态：${statusLabel}` : `Status: ${statusLabel}`)}</div>
    </div>
    <div class="misub-portal-stat-box">
      <div class="misub-portal-stat-top">
        <span>${escapeCustomPageText(isZh ? '当前可用节点数' : 'Available Nodes')}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></svg>
      </div>
      <div class="misub-portal-stat-value">68</div>
      <div class="misub-portal-stat-hint">${escapeCustomPageText(isZh ? '已排除信息展示虚拟节点' : 'Excludes virtual info nodes')}</div>
    </div>
  </div>
</section>`;
}

function buildMockPortalQuickImportHtml(isZh: boolean): string {
  const linkIcon =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
  const copyIcon =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
  const mockQrSvg =
    '<svg width="96" height="96" viewBox="0 0 29 29" shape-rendering="crispEdges"><rect width="29" height="29" fill="#ffffff"/><path fill="#111111" d="M1 1h7v7H1zM2 2v5h5V2zM3 3h3v3H3zM21 1h7v7h-7zM22 2v5h5V2zM23 3h3v3h-3zM1 21h7v7H1zM2 22v5h5v-5zM3 23h3v3H3zM10 2h2v2h-2zM14 2h3v2h-3zM10 6h2v2h-2zM14 6h4v2h-4zM2 10h2v3H2zM6 10h3v2H6zM11 10h3v3h-3zM16 10h2v2h-2zM20 10h3v2h-3zM25 10h3v3h-3zM2 15h4v2H2zM8 14h2v3H8zM12 15h2v2h-2zM16 14h4v3h-4zM22 15h2v2h-2zM26 15h2v3h-2zM10 19h3v2h-3zM15 19h2v3h-2zM19 19h3v2h-3zM24 20h4v2h-4zM10 23h2v4h-2zM14 23h4v2h-4zM20 23h2v5h-2zM24 24h3v4h-3z"/></svg>';

  return `<section class="misub-portal-card">
  <div class="misub-portal-quick-grid">
    <div class="misub-portal-quick-left">
      <div>
        <h2 class="misub-portal-card-title">${escapeCustomPageText(isZh ? '快捷接入' : 'Quick Import')}</h2>
        <p class="misub-portal-card-sub">${escapeCustomPageText(
          isZh
            ? '复制订阅链接或点击下方客户端快捷导入，也可通过代理客户端直接拉取本链接。'
            : 'Copy the subscription URL, scan the QR code, or launch a client directly.',
        )}</p>
      </div>
      <div class="misub-portal-url-row">
        <input class="misub-portal-url-input" type="text" readonly value="https://example.com/sub/token/vip" />
        <button type="button" class="misub-portal-primary-btn">${copyIcon}<span>${escapeCustomPageText(isZh ? '复制链接' : 'Copy URL')}</span></button>
      </div>
      <div class="misub-portal-import-links">
        <span class="misub-portal-client-btn">${linkIcon}<span>${escapeCustomPageText(isZh ? '导入 Clash Verge' : 'Import Clash Verge')}</span></span>
        <span class="misub-portal-client-btn">${linkIcon}<span>${escapeCustomPageText(isZh ? '导入 Mihomo' : 'Import Mihomo')}</span></span>
        <span class="misub-portal-client-btn">${linkIcon}<span>${escapeCustomPageText(isZh ? '导入 Shadowrocket' : 'Import Shadowrocket')}</span></span>
      </div>
    </div>
    <div class="misub-portal-qr-panel">
      <div class="misub-portal-qr-inner">${mockQrSvg}</div>
      <span class="misub-portal-qr-caption">${escapeCustomPageText(isZh ? '扫码导入客户端' : 'Scan QR to Import')}</span>
    </div>
  </div>
</section>`;
}

function buildMockPortalMultiSocksHtml(startPort: number, listen: string, isZh: boolean): string {
  const copyIcon =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
  const downloadIcon =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>';
  const searchIcon =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';

  const sampleRows = [
    { port: startPort, listen, name: 'HK-BGP-01', region: isZh ? '香港 (HK)' : 'HK' },
    { port: startPort + 1, listen, name: 'SG-Edge-02', region: isZh ? '新加坡 (SG)' : 'SG' },
    { port: startPort + 2, listen, name: 'JP-Tokyo-03', region: isZh ? '日本 (JP)' : 'JP' },
  ];
  const rowsHtml = sampleRows
    .map(
      (r) =>
        `<tr>
          <td class="misub-portal-mono-bold">${r.port}</td>
          <td class="misub-portal-mono-muted">${escapeCustomPageText(r.listen)}</td>
          <td><span class="misub-portal-table-tag">SOCKS5</span></td>
          <td style="color:var(--fg)">${escapeCustomPageText(r.name)}</td>
          <td><span class="misub-portal-table-tag">${escapeCustomPageText(r.region)}</span></td>
          <td style="text-align:right"><span class="misub-portal-row-copy-btn">${copyIcon}<span>${escapeCustomPageText(`${r.listen}:${r.port}`)}</span></span></td>
        </tr>`,
    )
    .join('');

  return `<section class="misub-portal-card">
  <div class="misub-portal-card-head">
    <div style="min-width:0">
      <h2 class="misub-portal-card-title">${escapeCustomPageText(isZh ? '多端口 SOCKS5 映射表' : 'Multi-Port SOCKS5 Mapping')}</h2>
      <p class="misub-portal-card-sub">${escapeCustomPageText(
        isZh ? '每个本地端口确定性绑定到一个出站节点，与 Mihomo listeners 配置一致。' : 'Deterministic local port bindings matching Mihomo listeners configuration.',
      )}</p>
    </div>
    <div class="misub-portal-action-group">
      <button type="button" class="misub-portal-secondary-btn">${copyIcon}<span>${escapeCustomPageText(isZh ? '复制全部（IP:Port）' : 'Copy All (IP:Port)')}</span></button>
      <button type="button" class="misub-portal-primary-btn">${downloadIcon}<span>${escapeCustomPageText(isZh ? '导出指纹浏览器 CSV' : 'Export Browser CSV')}</span></button>
    </div>
  </div>

  <div class="misub-portal-meta-strip">
    <div class="misub-portal-meta-cell">
      <span class="misub-portal-meta-label">${escapeCustomPageText(isZh ? '已映射端口：' : 'Mapped ports:')}</span>
      <span class="misub-portal-meta-val">3</span>
    </div>
    <div class="misub-portal-meta-cell">
      <span class="misub-portal-meta-label">${escapeCustomPageText(isZh ? '端口区间：' : 'Port range:')}</span>
      <span class="misub-portal-meta-val">${startPort} - ${startPort + 2}</span>
    </div>
    <div class="misub-portal-meta-cell">
      <span class="misub-portal-meta-label">${escapeCustomPageText(isZh ? '监听地址：' : 'Listen:')}</span>
      <span class="misub-portal-meta-val">${escapeCustomPageText(listen)}</span>
    </div>
    <div class="misub-portal-meta-cell">
      <span class="misub-portal-meta-label">${escapeCustomPageText(isZh ? '鉴权：' : 'Auth:')}</span>
      <span class="misub-portal-meta-val">${escapeCustomPageText(isZh ? '无密码' : 'None')}</span>
    </div>
  </div>

  <div class="misub-portal-search-row">
    <div class="misub-portal-search-box">
      <span class="misub-portal-search-icon">${searchIcon}</span>
      <input class="misub-portal-search-input" type="search" readonly placeholder="${escapeCustomPageText(
        isZh ? '按节点名称、地区、国家代码或端口号实时搜索过滤...' : 'Filter by node name, region, country code, or port...',
      )}" />
    </div>
    <span class="misub-portal-filter-count">3 / 3</span>
  </div>

  <div class="misub-portal-table-wrap">
    <table class="misub-portal-table">
      <thead>
        <tr>
          <th>${escapeCustomPageText(isZh ? '本地端口' : 'Local Port')}</th>
          <th>${escapeCustomPageText(isZh ? '监听地址' : 'Listen')}</th>
          <th>${escapeCustomPageText(isZh ? '协议' : 'Protocol')}</th>
          <th>${escapeCustomPageText(isZh ? '对应出站节点名' : 'Outbound Proxy Name')}</th>
          <th>${escapeCustomPageText(isZh ? '地区标签' : 'Region')}</th>
          <th style="text-align:right">${escapeCustomPageText(isZh ? '操作' : 'Action')}</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
</section>`;
}

export function buildPortalCustomPagePreviewSrcdoc(options: PortalCustomPagePreviewOptions): string {
  const isZh = (options.locale || 'zh-CN').toLowerCase().startsWith('zh');
  const portalTitle = options.portalTitle?.trim() || (isZh ? 'VIP 专线订阅门户' : 'VIP Subscription Portal');
  const portalNotice =
    options.portalNotice?.trim() ||
    (isZh ? '欢迎使用订阅门户，支持一键客户端导入与 SOCKS5 多端口导出。' : 'Welcome to the subscription portal.');
  const rawStartPort = Number(options.portalStartPort);
  const sampleStartPort =
    Number.isInteger(rawStartPort) && rawStartPort >= 1024 && rawStartPort <= 60000 ? rawStartPort : 42001;
  const sampleListen = options.portalListen === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1';

  const parsed = parseCustomPageSource(options.content, options.css);
  const sanitizedUserHtml = renderCustomPageHtml(
    parsed.html || '',
    {
      version: options.version || '1.0.0',
      title: portalTitle,
      sub_name: portalTitle,
      notice: portalNotice,
      remaining_traffic: '428.5 GB',
      used_traffic: '71.5 GB',
      total_traffic: '500 GB',
      remaining_percent: 86,
      expire_time: '2027-01-01',
      expire_status: isZh ? '正常' : 'Active',
      node_count: 68,
      subscription_url: 'https://example.com/sub/token/vip',
      socks_port_count: 3,
      socks_listen: sampleListen,
    },
    {
      componentPlaceholders: PORTAL_PAGE_COMPONENT_PLACEHOLDERS,
      slotAliases: PORTAL_PAGE_SLOT_ALIASES,
    },
  );

  const mockSlots: Record<string, string> = {
    overview: buildMockPortalOverviewHtml(portalTitle, portalNotice, isZh),
    quick_import: buildMockPortalQuickImportHtml(isZh),
    multi_socks: buildMockPortalMultiSocksHtml(sampleStartPort, sampleListen, isZh),
    theme_toggle: buildMockThemeToggleHtml(options.theme, isZh),
  };

  return assemblePreviewHtml({
    sanitizedUserHtml,
    mockSlots,
    parsedCss: parsed.css,
    theme: options.theme,
    useDefaultLayout: options.useDefaultLayout,
    hideBranding: options.hideBranding,
    hideHeader: options.hideHeader,
    hideFooter: options.hideFooter,
    isZh,
    headerTitle: portalTitle,
    navLabels: [isZh ? '订阅概览' : 'Overview', isZh ? '快捷接入' : 'Import'],
    version: options.version || '1.0.0',
  });
}

function assemblePreviewHtml(params: {
  sanitizedUserHtml: string;
  mockSlots: Record<string, string>;
  parsedCss: string;
  theme: 'light' | 'dark';
  useDefaultLayout: boolean;
  hideBranding: boolean;
  hideHeader: boolean;
  hideFooter: boolean;
  isZh: boolean;
  headerTitle: string;
  navLabels: [string, string];
  version: string;
}): string {
  const {
    sanitizedUserHtml,
    mockSlots,
    parsedCss,
    theme,
    useDefaultLayout,
    hideBranding,
    hideHeader,
    hideFooter,
    isZh,
    headerTitle,
    navLabels,
    version,
  } = params;

  // Inject mock component previews AFTER DOMPurify sanitization, mirroring production Teleport slots.
  const populatedHtml = sanitizedUserHtml.replace(
    /<div([^>]*?\bdata-slot=["']([a-z_]+)["'][^>]*)><\/div>/gi,
    (_match, attrs: string, slotName: string) => {
      const mockContent = mockSlots[slotName.toLowerCase()] ?? '';
      return `<div${attrs}>${mockContent}</div>`;
    },
  );

  const headerHtml = !hideHeader
    ? `<header class="misub-preview-header">
  <div class="misub-preview-header-inner">
    ${
      hideBranding
        ? '<span class="misub-preview-header-spacer"></span>'
        : `<span class="misub-preview-brand"><span class="misub-preview-brand-dot"></span>${escapeCustomPageText(headerTitle)}</span>`
    }
    <nav class="misub-preview-nav">
      <span>${escapeCustomPageText(navLabels[0])}</span>
      <span>${escapeCustomPageText(navLabels[1])}</span>
    </nav>
  </div>
</header>`
    : '';

  const footerHtml = !hideFooter
    ? `<footer class="misub-preview-footer">
  <span>${
    hideBranding
      ? escapeCustomPageText(isZh ? '公开订阅服务' : 'Subscription Service')
      : `Powered by MiSub · v${escapeCustomPageText(version || '1.0.0')}`
  }</span>
</footer>`
    : '';

  const safeCss = (parsedCss || '').replace(/<\/style/gi, '<\\/style');
  const htmlClass = theme === 'dark' ? 'dark' : '';
  const lang = isZh ? 'zh-CN' : 'en-US';

  return `<!DOCTYPE html>
<html lang="${escapeCustomPageText(lang)}" class="${htmlClass}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style data-misub-preview-base="true">
:root {
  --canvas: #f4f4f4;
  --surface: #ffffff;
  --elevated: #ffffff;
  --elevated-card: #f5f5f5;
  --inset: #ffffff;
  --active: #e8e8e8;
  --hover: #f0f0f0;
  --accent: #171717;
  --accent-fg: #ffffff;
  --fg: #0a0a0a;
  --fg-muted: #525252;
  --fg-subtle: #737373;
  --line: rgba(0, 0, 0, 0.1);
  --line-strong: rgba(0, 0, 0, 0.2);
  --line-subtle: rgba(0, 0, 0, 0.06);
  --status-success-fg: #065f46;
  --status-success-bg: #ecfdf5;
  --status-success-border: #a7f3d0;
  --color-primary: #7170ff;
  --color-primary-500: #7170ff;
  --color-primary-600: #5e6ad2;
  --font-display: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-body: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --misub-radius-md: 0.375rem;
  --shadow-card: 0 0 13px rgba(0, 0, 0, 0.11);
}
html.dark {
  --canvas: #0a0a0a;
  --surface: #141414;
  --elevated: #181818;
  --elevated-card: #212121;
  --inset: #111111;
  --active: #282828;
  --hover: #222222;
  --accent: #f5f5f5;
  --accent-fg: #0a0a0a;
  --fg: #fafafa;
  --fg-muted: #a3a3a3;
  --fg-subtle: #737373;
  --line: rgba(255, 255, 255, 0.11);
  --line-strong: rgba(255, 255, 255, 0.2);
  --line-subtle: rgba(255, 255, 255, 0.055);
  --status-success-fg: #6ee7b7;
  --status-success-bg: rgba(16, 185, 129, 0.08);
  --status-success-border: rgba(16, 185, 129, 0.25);
  --shadow-card: 0 2px 12px rgba(0, 0, 0, 0.42);
}
*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background: var(--canvas);
  color: var(--fg);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
}
.misub-preview-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.misub-preview-header {
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.misub-preview-header-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}
.misub-preview-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--fg);
}
.misub-preview-brand-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: var(--color-primary-500);
}
.misub-preview-nav {
  display: flex;
  gap: 16px;
  color: var(--fg-muted);
  font-size: 12px;
}
.misub-preview-main {
  flex: 1;
  width: 100%;
}
.misub-preview-default-layout {
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 24px;
}
.misub-preview-custom-layout {
  width: 100%;
  min-height: 100%;
}
.misub-preview-footer {
  border-top: 1px solid var(--line);
  padding: 16px 24px;
  text-align: center;
  font-size: 12px;
  color: var(--fg-subtle);
  font-family: var(--font-mono);
}
.custom-public-renderer { width: 100%; min-height: 100dvh; }
.custom-html-container { width: 100%; min-height: inherit; }
[data-slot]:empty { min-height: 0; }

/* Built-in mock slot component defaults matching Tailwind utility classes */
.rounded-md { border-radius: var(--misub-radius-md); }
.border { border-width: 1px; border-style: solid; }
.border-line { border-color: var(--line); }
.bg-surface { background-color: var(--surface); }
.bg-elevated-card { background-color: var(--elevated-card); }
.bg-accent { background-color: var(--accent); }
.text-accent-fg { color: var(--accent-fg); }
.text-fg { color: var(--fg); }
.text-fg-muted { color: var(--fg-muted); }
.text-fg-subtle { color: var(--fg-subtle); }
.p-5 { padding: 1.25rem; }

.misub-mock-profiles-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  width: 100%;
}
@media (max-width: 960px) {
  .misub-mock-profiles-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .misub-mock-profiles-grid { grid-template-columns: 1fr; }
}
.misub-mock-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: var(--shadow-card);
}
.misub-mock-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.misub-mock-card-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.misub-mock-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #10b981;
  flex-shrink: 0;
}
.misub-mock-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.misub-mock-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.misub-mock-tag {
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 500;
}
.misub-mock-card-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  flex: 1;
}
.misub-mock-card-actions {
  margin-top: auto;
  padding-top: 12px;
  border-top-width: 1px;
  border-top-style: solid;
  display: flex;
  align-items: center;
  gap: 8px;
}
.misub-mock-primary-btn {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--accent);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.misub-mock-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px;
  background: transparent;
  cursor: pointer;
}
.misub-mock-announcement {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.misub-mock-announcement-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.misub-mock-announcement-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  flex-shrink: 0;
}
.misub-mock-announcement-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.misub-mock-announcement-body {
  padding-left: 14px;
  font-size: 12px;
  line-height: 1.65;
}
.misub-mock-hero {
  padding: 28px 16px;
}
.misub-mock-hero-title {
  margin: 0 0 16px;
  font-size: clamp(28px, 5vw, 52px);
  font-weight: 900;
  line-height: 1.1;
}
.misub-mock-hero-t1 { display: block; }
.misub-mock-hero-t2 {
  display: block;
  margin-top: 6px;
  font-size: 0.72em;
  background: linear-gradient(90deg, var(--color-primary-600), #a855f7, #6366f1);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.misub-mock-hero-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  max-width: 64ch;
}
.misub-mock-guestbook-btn {
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.theme-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  cursor: pointer;
}

/* Mock Portal Slot Cards aligned 1:1 with SubscriptionPortalView components */
.misub-portal-card {
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  padding: 20px;
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.misub-portal-card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.misub-portal-card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
  letter-spacing: -0.01em;
}
.misub-portal-card-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--fg-muted);
}
.misub-portal-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--status-success-border);
  background: var(--status-success-bg);
  color: var(--status-success-fg);
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
}
.misub-portal-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #10b981;
}
.misub-portal-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--inset);
  font-size: 12px;
  line-height: 1.6;
  color: var(--fg);
}
.misub-portal-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.misub-portal-stat-box {
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--inset);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.misub-portal-stat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--fg-muted);
}
.misub-portal-stat-value {
  font-size: 16px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--fg);
}
.misub-portal-progress-track {
  height: 6px;
  width: 100%;
  border-radius: 9999px;
  background: var(--active);
  overflow: hidden;
}
.misub-portal-progress-fill {
  height: 100%;
  border-radius: 9999px;
  background: #10b981;
}
.misub-portal-stat-hint {
  font-size: 11px;
  color: var(--fg-subtle);
}
.misub-portal-quick-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 156px;
  gap: 16px;
  align-items: stretch;
}
.misub-portal-quick-left {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}
.misub-portal-url-row {
  display: flex;
  gap: 8px;
}
.misub-portal-url-input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--inset);
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: 12px;
}
.misub-portal-import-links,
.misub-portal-action-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.misub-portal-primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.misub-portal-secondary-btn,
.misub-portal-client-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--inset);
  color: var(--fg);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
.misub-portal-qr-panel {
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--inset);
  padding: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.misub-portal-qr-inner {
  width: 112px;
  height: 112px;
  padding: 8px;
  border-radius: 4px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.misub-portal-qr-caption {
  font-size: 11px;
  font-weight: 500;
  color: var(--fg-muted);
}
.misub-portal-meta-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--inset);
}
.misub-portal-meta-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-left: 1px solid var(--line);
}
.misub-portal-meta-cell:first-child { border-left: 0; }
.misub-portal-meta-label { font-size: 11px; color: var(--fg-muted); }
.misub-portal-meta-val { font-size: 12px; font-weight: 600; font-family: var(--font-mono); color: var(--fg); }
.misub-portal-search-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.misub-portal-search-box {
  position: relative;
  flex: 1;
  min-width: 0;
}
.misub-portal-search-icon {
  position: absolute;
  left: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--fg-subtle);
  display: inline-flex;
}
.misub-portal-search-input {
  width: 100%;
  padding: 8px 12px 8px 32px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--inset);
  color: var(--fg);
  font-size: 12px;
}
.misub-portal-filter-count {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg-muted);
  white-space: nowrap;
}
.misub-portal-table-wrap {
  overflow-x: auto;
  border-radius: 6px;
  border: 1px solid var(--line);
}
.misub-portal-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 12px;
}
.misub-portal-table thead tr {
  background: var(--inset);
  border-bottom: 1px solid var(--line);
  font-size: 11px;
  color: var(--fg-muted);
}
.misub-portal-table th,
.misub-portal-table td {
  padding: 10px 12px;
  white-space: nowrap;
}
.misub-portal-table tbody tr { border-bottom: 1px solid var(--line); }
.misub-portal-table tbody tr:last-child { border-bottom: 0; }
.misub-portal-mono-bold { font-family: var(--font-mono); font-weight: 600; color: var(--fg); }
.misub-portal-mono-muted { font-family: var(--font-mono); color: var(--fg-muted); }
.misub-portal-table-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--line);
  background: var(--inset);
  font-size: 11px;
  color: var(--fg-muted);
}
.misub-portal-row-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--line);
  background: var(--inset);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg);
}
@media (max-width: 720px) {
  .misub-portal-stats-grid { grid-template-columns: 1fr; }
  .misub-portal-quick-grid { grid-template-columns: 1fr; }
  .misub-portal-qr-panel { max-width: 168px; margin: 0 auto; }
  .misub-portal-meta-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .misub-portal-meta-cell:nth-child(odd) { border-left: 0; }
  .misub-portal-meta-cell:nth-child(n+3) { border-top: 1px solid var(--line); }
}
@media (max-width: 520px) {
  .misub-portal-url-row { flex-direction: column; }
}
</style>
<style data-custom-page-preview="true">
${safeCss}
</style>
</head>
<body>
<div class="misub-preview-shell">
${headerHtml}
<main class="misub-preview-main ${useDefaultLayout ? 'misub-preview-default-layout' : 'misub-preview-custom-layout'}">
  <div class="custom-public-renderer">
    <div class="custom-html-container">${populatedHtml}</div>
  </div>
</main>
${footerHtml}
</div>
</body>
</html>`;
}
