import DOMPurify from 'dompurify';
import { escapeCustomPageText, parseCustomPageSource, renderCustomPageHtml } from '@/utils/custom-page-source.js';

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
  const heroTitle2 = options.heroTitle2?.trim() || (isZh ? 'Subscription Hub' : 'Subscription Hub');
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

  // Inject mock component previews AFTER DOMPurify sanitization, mirroring production Teleport slots.
  const populatedHtml = sanitizedUserHtml.replace(
    /<div([^>]*?\bdata-slot=["']([a-z_]+)["'][^>]*)><\/div>/gi,
    (_match, attrs: string, slotName: string) => {
      const mockContent = mockSlots[slotName.toLowerCase()] ?? '';
      return `<div${attrs}>${mockContent}</div>`;
    },
  );

  const headerHtml = !options.hideHeader
    ? `<header class="misub-preview-header">
  <div class="misub-preview-header-inner">
    ${
      options.hideBranding
        ? '<span class="misub-preview-header-spacer"></span>'
        : `<span class="misub-preview-brand"><span class="misub-preview-brand-dot"></span>${escapeCustomPageText(siteTitle)}</span>`
    }
    <nav class="misub-preview-nav">
      <span>${escapeCustomPageText(isZh ? '公开订阅' : 'Profiles')}</span>
      <span>${escapeCustomPageText(isZh ? '客户端' : 'Clients')}</span>
    </nav>
  </div>
</header>`
    : '';

  const footerHtml = !options.hideFooter
    ? `<footer class="misub-preview-footer">
  <span>${
    options.hideBranding
      ? escapeCustomPageText(isZh ? '公开订阅服务' : 'Public Subscription Page')
      : `Powered by MiSub · v${escapeCustomPageText(options.version || '1.0.0')}`
  }</span>
</footer>`
    : '';

  const safeCss = (parsed.css || '').replace(/<\/style/gi, '<\\/style');
  const htmlClass = options.theme === 'dark' ? 'dark' : '';
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
</style>
<style data-custom-page-preview="true">
${safeCss}
</style>
</head>
<body>
<div class="misub-preview-shell">
${headerHtml}
<main class="misub-preview-main ${options.useDefaultLayout ? 'misub-preview-default-layout' : 'misub-preview-custom-layout'}">
  <div class="custom-public-renderer">
    <div class="custom-html-container">${populatedHtml}</div>
  </div>
</main>
${footerHtml}
</div>
</body>
</html>`;
}
