export const PORTAL_PAGE_TEMPLATES = [
  {
    id: 'portal-console',
    nameKey: 'settings.portalCustomPageTemplateConsole',
    descKey: 'settings.portalCustomPageTemplateConsoleDesc',
    badgeKey: 'settings.portalCustomPageTemplateConsoleBadge',
    layoutPreset: {
      useDefaultLayout: false,
      hideHeader: true,
      hideFooter: true,
      hideBranding: false,
    },
    content: `<div class="mp-console">
  <header class="mp-nav">
    <div class="mp-nav-inner">
      <div class="mp-brand">
        <span class="mp-dot" aria-hidden="true"></span>
        <span class="mp-title">{{title}}</span>
        <span class="mp-badge">{{expire_status}}</span>
      </div>
      <div class="mp-nav-right">
        <span class="mp-chip">{{node_count}} NODES</span>
        {{theme_toggle}}
      </div>
    </div>
  </header>

  <main class="mp-main">
    <section class="mp-hero">
      <div class="mp-hero-meta">SUBSCRIPTION PORTAL · v{{version}}</div>
      <h1 class="mp-hero-title">{{title}}</h1>
      <p class="mp-hero-sub">{{sub_name}} · {{node_count}} 节点 · {{expire_status}}</p>
    </section>

    <section class="mp-slot">{{overview}}</section>
    <section class="mp-slot">{{quick_import}}</section>
    <section class="mp-slot mp-slot-optional">{{multi_socks}}</section>
  </main>

  <footer class="mp-footer">
    <span>MISUB SUBSCRIPTION PORTAL · v{{version}}</span>
  </footer>
</div>`,
    css: `.mp-console {
  --mp-bg: var(--canvas, #f4f4f4);
  --mp-surface: var(--surface, #ffffff);
  --mp-fg: var(--fg, #0a0a0a);
  --mp-muted: var(--fg-muted, #525252);
  --mp-line: var(--line, rgba(0, 0, 0, 0.1));
  min-height: 100dvh;
  background: var(--mp-bg);
  color: var(--mp-fg);
  font-family: var(--font-body, system-ui, -apple-system, sans-serif);
}

.mp-nav {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--mp-surface);
  border-bottom: 1px solid var(--mp-line);
}

.mp-nav-inner {
  max-width: 1024px;
  margin: 0 auto;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mp-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.mp-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #10b981;
  flex-shrink: 0;
}

.mp-title {
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mp-badge,
.mp-chip {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--mp-line);
  color: var(--mp-muted);
}

.mp-nav-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mp-main {
  max-width: 1024px;
  margin: 0 auto;
  padding: 24px 20px 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mp-hero {
  padding: 20px;
  border-radius: 8px;
  border: 1px solid var(--mp-line);
  background: var(--mp-surface);
}

.mp-hero-meta {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--mp-muted);
}

.mp-hero-title {
  margin: 6px 0 4px;
  font-size: 22px;
  font-weight: 700;
}

.mp-hero-sub {
  margin: 0;
  font-size: 13px;
  color: var(--mp-muted);
}

.mp-slot-optional:has([data-slot="multi_socks"]:empty) {
  display: none;
}

.mp-footer {
  border-top: 1px solid var(--mp-line);
  padding: 16px 20px;
  text-align: center;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--mp-muted);
}`,
  },
] as const;
