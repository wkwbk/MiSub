const minimalNavTemplate = {
  id: 'minimal-nav',
  nameKey: 'settings.customPageTemplateMinimalNav',
  descKey: 'settings.customPageTemplateMinimalNavDesc',
  badgeKey: 'settings.customPageTemplateMinimalNavBadge',
  layoutPreset: {
    useDefaultLayout: false,
    hideHeader: true,
    hideFooter: true,
    hideBranding: true,
  },
  content: `<div class="cp-nav">
  <div class="cp-nav-backdrop" aria-hidden="true"></div>
  <div class="cp-nav-theme">{{theme_toggle}}</div>

  <main class="cp-nav-stage">
    <header class="cp-nav-hero">
      <div class="cp-nav-kicker">
        <span class="cp-nav-dot" aria-hidden="true"></span>
        <span>PERSONAL START PAGE</span>
      </div>
      <h1 class="cp-nav-title">Start.</h1>
      <p class="cp-nav-subtitle">安静、快速、无干扰的日常入口</p>
    </header>

    <form
      class="cp-nav-search"
      action="https://www.google.com/search"
      method="get"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span class="cp-nav-search-icon" aria-hidden="true">⌘</span>
      <input
        class="cp-nav-search-input"
        type="search"
        name="q"
        placeholder="输入关键词，按 Enter 前往 Google 搜索..."
        autocomplete="off"
        aria-label="Search"
      />
      <button class="cp-nav-search-btn" type="submit">搜索</button>
    </form>

    <div class="cp-nav-shortcuts" aria-label="Quick tools">
      <a href="https://github.com/trending" target="_blank" rel="noopener noreferrer">GitHub Trending ↗</a>
      <a href="https://news.ycombinator.com" target="_blank" rel="noopener noreferrer">Hacker News ↗</a>
      <a href="https://translate.google.com" target="_blank" rel="noopener noreferrer">Google Translate ↗</a>
      <a href="https://developer.mozilla.org" target="_blank" rel="noopener noreferrer">MDN Docs ↗</a>
    </div>

    <section class="cp-nav-grid" aria-label="Pinned bookmarks">
      <a class="cp-nav-card" href="https://github.com" target="_blank" rel="noopener noreferrer">
        <div class="cp-nav-icon">
          <img src="https://www.google.com/s2/favicons?sz=64&domain=github.com" alt="GitHub" />
        </div>
        <div class="cp-nav-meta">
          <span class="cp-nav-name">GitHub</span>
          <span class="cp-nav-host">github.com</span>
        </div>
      </a>

      <a class="cp-nav-card" href="https://www.google.com" target="_blank" rel="noopener noreferrer">
        <div class="cp-nav-icon">
          <img src="https://www.google.com/s2/favicons?sz=64&domain=google.com" alt="Google" />
        </div>
        <div class="cp-nav-meta">
          <span class="cp-nav-name">Google</span>
          <span class="cp-nav-host">google.com</span>
        </div>
      </a>

      <a class="cp-nav-card" href="https://chatgpt.com" target="_blank" rel="noopener noreferrer">
        <div class="cp-nav-icon">
          <img src="https://www.google.com/s2/favicons?sz=64&domain=openai.com" alt="ChatGPT" />
        </div>
        <div class="cp-nav-meta">
          <span class="cp-nav-name">ChatGPT</span>
          <span class="cp-nav-host">chatgpt.com</span>
        </div>
      </a>

      <a class="cp-nav-card" href="https://www.youtube.com" target="_blank" rel="noopener noreferrer">
        <div class="cp-nav-icon">
          <img src="https://www.google.com/s2/favicons?sz=64&domain=youtube.com" alt="YouTube" />
        </div>
        <div class="cp-nav-meta">
          <span class="cp-nav-name">YouTube</span>
          <span class="cp-nav-host">youtube.com</span>
        </div>
      </a>

      <a class="cp-nav-card" href="https://www.notion.so" target="_blank" rel="noopener noreferrer">
        <div class="cp-nav-icon">
          <img src="https://www.google.com/s2/favicons?sz=64&domain=notion.so" alt="Notion" />
        </div>
        <div class="cp-nav-meta">
          <span class="cp-nav-name">Notion</span>
          <span class="cp-nav-host">notion.so</span>
        </div>
      </a>

      <a class="cp-nav-card" href="https://www.figma.com" target="_blank" rel="noopener noreferrer">
        <div class="cp-nav-icon">
          <img src="https://www.google.com/s2/favicons?sz=64&domain=figma.com" alt="Figma" />
        </div>
        <div class="cp-nav-meta">
          <span class="cp-nav-name">Figma</span>
          <span class="cp-nav-host">figma.com</span>
        </div>
      </a>

      <a class="cp-nav-card" href="https://x.com" target="_blank" rel="noopener noreferrer">
        <div class="cp-nav-icon">
          <img src="https://www.google.com/s2/favicons?sz=64&domain=x.com" alt="X" />
        </div>
        <div class="cp-nav-meta">
          <span class="cp-nav-name">X</span>
          <span class="cp-nav-host">x.com</span>
        </div>
      </a>

      <a class="cp-nav-card" href="https://www.bilibili.com" target="_blank" rel="noopener noreferrer">
        <div class="cp-nav-icon">
          <img src="https://www.google.com/s2/favicons?sz=64&domain=bilibili.com" alt="Bilibili" />
        </div>
        <div class="cp-nav-meta">
          <span class="cp-nav-name">Bilibili</span>
          <span class="cp-nav-host">bilibili.com</span>
        </div>
      </a>
    </section>

    <footer class="cp-nav-footer">
      <span>Designed for focus · v{{version}}</span>
    </footer>
  </main>
</div>`,
  css: `.cp-nav {
  --nav-bg: #f6f7fb;
  --nav-glass: rgba(255, 255, 255, 0.72);
  --nav-glass-hover: rgba(255, 255, 255, 0.92);
  --nav-border: rgba(15, 23, 42, 0.08);
  --nav-border-hover: rgba(99, 102, 241, 0.34);
  --nav-fg: #0f172a;
  --nav-muted: #475569;
  --nav-subtle: #64748b;
  --nav-dot: rgba(15, 23, 42, 0.07);
  --nav-shadow: 0 12px 32px -12px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.85);
  --nav-shadow-hover: 0 20px 40px -14px rgba(79, 70, 229, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.95);
  position: relative;
  min-height: 100dvh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 56px 20px 44px;
  overflow: hidden;
  background: var(--nav-bg);
  color: var(--nav-fg);
}

.dark .cp-nav {
  --nav-bg: #07080d;
  --nav-glass: rgba(255, 255, 255, 0.04);
  --nav-glass-hover: rgba(255, 255, 255, 0.08);
  --nav-border: rgba(255, 255, 255, 0.09);
  --nav-border-hover: rgba(129, 140, 248, 0.42);
  --nav-fg: #f8fafc;
  --nav-muted: #94a3b8;
  --nav-subtle: #64748b;
  --nav-dot: rgba(255, 255, 255, 0.06);
  --nav-shadow: 0 16px 40px -16px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.07);
  --nav-shadow-hover: 0 24px 48px -16px rgba(99, 102, 241, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.cp-nav *,
.cp-nav *::before,
.cp-nav *::after {
  box-sizing: border-box;
}

.cp-nav-backdrop {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(60% 45% at 50% 0%, rgba(99, 102, 241, 0.18), transparent 72%),
    radial-gradient(40% 35% at 85% 20%, rgba(56, 189, 248, 0.12), transparent 70%),
    radial-gradient(var(--nav-dot) 1px, transparent 1px);
  background-size: 100% 100%, 100% 100%, 24px 24px;
}

.cp-nav-theme {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 20;
}

.cp-nav-stage {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 880px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
}

.cp-nav-hero {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.cp-nav-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--nav-glass);
  border: 1px solid var(--nav-border);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--nav-muted);
}

.cp-nav-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #10b981;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.75);
}

.cp-nav-title {
  margin: 0;
  font-size: clamp(44px, 7vw, 68px);
  font-weight: 800;
  line-height: 1.04;
  letter-spacing: -0.045em;
  background: linear-gradient(180deg, var(--nav-fg) 25%, var(--nav-muted) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.cp-nav-subtitle {
  margin: 0;
  font-size: 15px;
  color: var(--nav-muted);
}

.cp-nav-search {
  width: 100%;
  max-width: 600px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 7px 7px 18px;
  border-radius: 18px;
  background: var(--nav-glass);
  border: 1px solid var(--nav-border);
  box-shadow: var(--nav-shadow);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  transition: border-color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease;
}

.cp-nav-search:focus-within {
  border-color: var(--nav-border-hover);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.16), var(--nav-shadow-hover);
  transform: translateY(-1px);
}

.cp-nav-search-icon {
  font-size: 14px;
  color: var(--nav-subtle);
  user-select: none;
}

.cp-nav-search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--nav-fg);
  font-size: 15px;
  padding: 9px 0;
}

.cp-nav-search-input::placeholder {
  color: var(--nav-subtle);
}

.cp-nav-search-btn {
  flex-shrink: 0;
  border: 0;
  border-radius: 12px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  color: #ffffff;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  box-shadow: 0 6px 16px -4px rgba(79, 70, 229, 0.55);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.cp-nav-search-btn:hover {
  opacity: 0.94;
  transform: translateY(-1px);
}

.cp-nav-shortcuts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.cp-nav-shortcuts a {
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--nav-glass);
  border: 1px solid var(--nav-border);
  font-size: 12px;
  color: var(--nav-muted);
  text-decoration: none;
  transition: color 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
}

.cp-nav-shortcuts a:hover {
  color: var(--nav-fg);
  border-color: var(--nav-border-hover);
  background: var(--nav-glass-hover);
}

.cp-nav-grid {
  width: 100%;
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.cp-nav-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 15px 16px;
  border-radius: 16px;
  background: var(--nav-glass);
  border: 1px solid var(--nav-border);
  box-shadow: var(--nav-shadow);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  text-decoration: none;
  color: var(--nav-fg);
  transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.22s ease, background-color 0.22s ease, box-shadow 0.22s ease;
}

.cp-nav-card:hover {
  transform: translateY(-4px);
  background: var(--nav-glass-hover);
  border-color: var(--nav-border-hover);
  box-shadow: var(--nav-shadow-hover);
}

.cp-nav-icon {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(128, 128, 128, 0.08);
  border: 1px solid var(--nav-border);
}

.cp-nav-icon img {
  width: 22px;
  height: 22px;
  display: block;
  border-radius: 5px;
}

.cp-nav-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cp-nav-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--nav-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cp-nav-host {
  font-size: 12px;
  color: var(--nav-subtle);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cp-nav-footer {
  margin-top: 16px;
  font-size: 12px;
  color: var(--nav-subtle);
}

@media (max-width: 768px) {
  .cp-nav-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .cp-nav {
    padding: 64px 16px 36px;
  }

  .cp-nav-grid {
    grid-template-columns: 1fr;
  }
}`,
};

const personalHomeTemplate = {
  id: 'personal-home',
  nameKey: 'settings.customPageTemplatePersonalHome',
  descKey: 'settings.customPageTemplatePersonalHomeDesc',
  badgeKey: 'settings.customPageTemplatePersonalHomeBadge',
  layoutPreset: {
    useDefaultLayout: false,
    hideHeader: true,
    hideFooter: true,
    hideBranding: true,
  },
  content: `<div class="cp-bento">
  <div class="cp-bento-glow" aria-hidden="true"></div>

  <div class="cp-bento-shell">
    <header class="cp-bento-topbar">
      <a class="cp-bento-brand" href="#cp-top">
        <span class="cp-bento-brand-mark">M</span>
        <span class="cp-bento-brand-name">Personal Space</span>
      </a>
      <nav class="cp-bento-nav" aria-label="Primary">
        <a href="#cp-about">关于</a>
        <a href="#cp-profiles">订阅库</a>
        <a href="#cp-guestbook">留言</a>
        <div class="cp-bento-theme">{{theme_toggle}}</div>
      </nav>
    </header>

    <section id="cp-top" class="cp-bento-grid">
      <article class="cp-bento-card cp-bento-hero">
        <div class="cp-bento-hero-aura" aria-hidden="true"></div>

        <div class="cp-bento-hero-head">
          <div class="cp-bento-avatar">
            <span>M</span>
            <span class="cp-bento-status" aria-hidden="true"></span>
          </div>
          <span class="cp-bento-eyebrow">DIGITAL CREATOR · CURATOR</span>
        </div>

        <div class="cp-bento-hero-body">
          <h1 class="cp-bento-title">探索、整理与分享<br />值得信赖的数字资源</h1>
          <p class="cp-bento-desc">{{description}}</p>
        </div>

        <div class="cp-bento-hero-foot">
          <div class="cp-bento-actions">
            <a class="cp-bento-btn-primary" href="#cp-profiles">浏览精选订阅 ↓</a>
            <a class="cp-bento-btn-ghost" href="#cp-guestbook">联系留言</a>
          </div>
          <div class="cp-bento-stats-inline">
            <span><strong>{{profile_count}}</strong> 订阅组</span>
            <span class="cp-bento-sep" aria-hidden="true">/</span>
            <span><strong>{{node_count}}</strong> 节点</span>
            <span class="cp-bento-sep" aria-hidden="true">/</span>
            <span>v{{version}}</span>
          </div>
        </div>
      </article>

      <aside id="cp-about" class="cp-bento-side">
        <article class="cp-bento-card cp-bento-feature">
          <span class="cp-bento-label">HIGHLIGHTS</span>
          <h2 class="cp-bento-card-title">开箱即用，持续维护</h2>
          <p class="cp-bento-card-text">
            所有公开订阅均经过整理与测试，适配主流客户端，随时获取最新可用配置。
          </p>
          <div class="cp-bento-tags">
            <span>一键导入</span>
            <span>节点预览</span>
            <span>扫码订阅</span>
          </div>
        </article>

        <article class="cp-bento-card cp-bento-links">
          <span class="cp-bento-label">CONNECT</span>
          <div class="cp-bento-link-grid">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">
              <span>GitHub</span>
              <span aria-hidden="true">↗</span>
            </a>
            <a href="#cp-profiles">
              <span>订阅集合</span>
              <span aria-hidden="true">↓</span>
            </a>
            <a href="#cp-guestbook">
              <span>给我留言</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </article>
      </aside>
    </section>

    <section class="cp-bento-announcements">
      {{announcements}}
    </section>

    <section id="cp-profiles" class="cp-bento-section">
      <div class="cp-bento-section-head">
        <span class="cp-bento-label">CURATED COLLECTION</span>
        <h2 class="cp-bento-section-title">精选订阅库</h2>
        <p class="cp-bento-section-desc">挑选需要的订阅组，支持复制链接、预览节点与客户端一键导入。</p>
      </div>
      {{profiles}}
    </section>

    <section id="cp-guestbook" class="cp-bento-guestbook">
      <div class="cp-bento-guestbook-copy">
        <span class="cp-bento-label">FEEDBACK</span>
        <h2>有建议或想反馈节点状态？</h2>
        <p>欢迎在留言板告诉我，我会定期查看并持续优化。</p>
      </div>
      <div class="cp-bento-guestbook-action">{{guestbook}}</div>
    </section>

    <footer class="cp-bento-footer">
      <span>Crafted with Personal Space · v{{version}}</span>
    </footer>
  </div>
</div>`,
  css: `.cp-bento {
  --bt-bg: #f8fafc;
  --bt-card: rgba(255, 255, 255, 0.82);
  --bt-card-soft: rgba(15, 23, 42, 0.03);
  --bt-border: rgba(15, 23, 42, 0.08);
  --bt-border-hover: rgba(99, 102, 241, 0.32);
  --bt-fg: #0f172a;
  --bt-muted: #475569;
  --bt-subtle: #64748b;
  --bt-accent: #4f46e5;
  --bt-shadow: 0 12px 32px -14px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  position: relative;
  min-height: 100dvh;
  width: 100%;
  padding: 24px 20px 56px;
  background: var(--bt-bg);
  color: var(--bt-fg);
  overflow-x: hidden;
}

.dark .cp-bento {
  --bt-bg: #08090d;
  --bt-card: rgba(20, 22, 30, 0.74);
  --bt-card-soft: rgba(255, 255, 255, 0.04);
  --bt-border: rgba(255, 255, 255, 0.09);
  --bt-border-hover: rgba(129, 140, 248, 0.38);
  --bt-fg: #f8fafc;
  --bt-muted: #94a3b8;
  --bt-subtle: #64748b;
  --bt-accent: #818cf8;
  --bt-shadow: 0 18px 44px -18px rgba(0, 0, 0, 0.72), inset 0 1px 0 rgba(255, 255, 255, 0.07);
}

.cp-bento *,
.cp-bento *::before,
.cp-bento *::after {
  box-sizing: border-box;
}

.cp-bento-glow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 460px;
  pointer-events: none;
  background:
    radial-gradient(50% 60% at 20% 0%, rgba(99, 102, 241, 0.18), transparent 72%),
    radial-gradient(45% 55% at 85% 5%, rgba(16, 185, 129, 0.11), transparent 70%);
}

.cp-bento-shell {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.cp-bento-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px 10px 16px;
  border-radius: 16px;
  background: var(--bt-card);
  border: 1px solid var(--bt-border);
  box-shadow: var(--bt-shadow);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.cp-bento-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--bt-fg);
}

.cp-bento-brand-mark {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 800;
}

.cp-bento-brand-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.cp-bento-nav {
  display: flex;
  align-items: center;
  gap: 18px;
}

.cp-bento-nav a {
  font-size: 13px;
  font-weight: 500;
  color: var(--bt-muted);
  text-decoration: none;
  transition: color 0.18s ease;
}

.cp-bento-nav a:hover {
  color: var(--bt-fg);
}

.cp-bento-grid {
  display: grid;
  grid-template-columns: minmax(0, 7.5fr) minmax(0, 4.5fr);
  gap: 16px;
}

.cp-bento-card {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  padding: 28px;
  background: var(--bt-card);
  border: 1px solid var(--bt-border);
  box-shadow: var(--bt-shadow);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  transition: border-color 0.22s ease;
}

.cp-bento-card:hover {
  border-color: var(--bt-border-hover);
}

.cp-bento-hero {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 24px;
}

.cp-bento-hero-aura {
  position: absolute;
  top: -80px;
  right: -80px;
  width: 280px;
  height: 280px;
  border-radius: 999px;
  pointer-events: none;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.22), transparent 68%);
}

.cp-bento-hero-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cp-bento-avatar {
  position: relative;
  width: 54px;
  height: 54px;
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1 0%, #3b82f6 100%);
  color: #ffffff;
  font-size: 22px;
  font-weight: 800;
  box-shadow: 0 10px 24px -8px rgba(79, 70, 229, 0.65);
}

.cp-bento-status {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: #10b981;
  border: 3px solid var(--bt-bg);
}

.cp-bento-eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--bt-accent);
  background: var(--bt-card-soft);
  border: 1px solid var(--bt-border);
  padding: 5px 11px;
  border-radius: 999px;
}

.cp-bento-hero-body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cp-bento-title {
  margin: 0;
  font-size: clamp(28px, 3.6vw, 42px);
  font-weight: 800;
  line-height: 1.16;
  letter-spacing: -0.035em;
  color: var(--bt-fg);
}

.cp-bento-desc {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  color: var(--bt-muted);
  max-width: 54ch;
}

.cp-bento-desc:empty::before {
  content: "精选日常维护的公开订阅组合，一站式获取并快速导入常用客户端。";
}

.cp-bento-hero-foot {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 8px;
}

.cp-bento-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.cp-bento-btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  border-radius: 11px;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  box-shadow: 0 8px 20px -6px rgba(79, 70, 229, 0.55);
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.cp-bento-btn-primary:hover {
  transform: translateY(-1px);
  opacity: 0.94;
}

.cp-bento-btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border-radius: 11px;
  background: var(--bt-card-soft);
  border: 1px solid var(--bt-border);
  color: var(--bt-fg);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: border-color 0.18s ease;
}

.cp-bento-btn-ghost:hover {
  border-color: var(--bt-border-hover);
}

.cp-bento-stats-inline {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--bt-muted);
}

.cp-bento-stats-inline strong {
  color: var(--bt-fg);
  font-weight: 700;
}

.cp-bento-sep {
  opacity: 0.35;
}

.cp-bento-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cp-bento-feature {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cp-bento-label {
  display: block;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.1em;
  color: var(--bt-accent);
}

.cp-bento-card-title {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  color: var(--bt-fg);
}

.cp-bento-card-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--bt-muted);
}

.cp-bento-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding-top: 6px;
}

.cp-bento-tags span {
  font-size: 12px;
  font-weight: 500;
  color: var(--bt-muted);
  background: var(--bt-card-soft);
  border: 1px solid var(--bt-border);
  padding: 4px 10px;
  border-radius: 999px;
}

.cp-bento-links {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cp-bento-link-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.cp-bento-link-grid a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bt-card-soft);
  border: 1px solid var(--bt-border);
  color: var(--bt-fg);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: border-color 0.18s ease, transform 0.18s ease;
}

.cp-bento-link-grid a:hover {
  border-color: var(--bt-border-hover);
  transform: translateY(-2px);
}

.cp-bento-announcements:has([data-slot="announcements"]:empty) {
  display: none;
}

.cp-bento-section {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-top: 8px;
}

.cp-bento-section-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cp-bento-section-title {
  margin: 0;
  font-size: 24px;
  font-weight: 750;
  letter-spacing: -0.025em;
  color: var(--bt-fg);
}

.cp-bento-section-desc {
  margin: 0;
  font-size: 14px;
  color: var(--bt-muted);
}

.cp-bento-guestbook {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 26px 28px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, var(--bt-card) 60%);
  border: 1px solid var(--bt-border);
  box-shadow: var(--bt-shadow);
}

.cp-bento-guestbook:has([data-slot="guestbook"]:empty) {
  display: none;
}

.cp-bento-guestbook-copy h2 {
  margin: 6px 0;
  font-size: 19px;
  font-weight: 700;
  color: var(--bt-fg);
}

.cp-bento-guestbook-copy p {
  margin: 0;
  font-size: 13px;
  color: var(--bt-muted);
}

.cp-bento-footer {
  text-align: center;
  padding-top: 8px;
  font-size: 12px;
  color: var(--bt-subtle);
}

@media (max-width: 900px) {
  .cp-bento-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .cp-bento {
    padding: 16px 14px 40px;
  }

  .cp-bento-card {
    padding: 20px;
  }

  .cp-bento-link-grid {
    grid-template-columns: 1fr;
  }

  .cp-bento-guestbook {
    flex-direction: column;
    align-items: flex-start;
    padding: 20px;
  }
}`,
};

const subPortalTemplate = {
  id: 'sub-portal',
  nameKey: 'settings.customPageTemplateSubPortal',
  descKey: 'settings.customPageTemplateSubPortalDesc',
  badgeKey: 'settings.customPageTemplateSubPortalBadge',
  layoutPreset: {
    useDefaultLayout: false,
    hideHeader: false,
    hideFooter: false,
    hideBranding: false,
  },
  content: `<div class="cp-portal">
  <section class="cp-portal-hero">
    <div class="cp-portal-hero-bg" aria-hidden="true"></div>
    <div class="cp-portal-hero-inner">
      <div class="cp-portal-pill">
        <span class="cp-portal-pulse" aria-hidden="true"></span>
        <span>服务运行正常 · v{{version}}</span>
      </div>

      <h1 class="cp-portal-title">高速、稳定的精选订阅分发中心</h1>
      <p class="cp-portal-desc">{{description}}</p>

      <div class="cp-portal-cta-row">
        <a class="cp-portal-cta-main" href="#cp-portal-profiles">浏览可用订阅</a>
        <a class="cp-portal-cta-sub" href="#cp-portal-feedback">问题反馈</a>
      </div>

      <div class="cp-portal-metrics">
        <div class="cp-portal-metric">
          <span class="cp-portal-metric-num">{{profile_count}}</span>
          <span class="cp-portal-metric-lbl">公开订阅组</span>
        </div>
        <div class="cp-portal-divider" aria-hidden="true"></div>
        <div class="cp-portal-metric">
          <span class="cp-portal-metric-num">{{node_count}}</span>
          <span class="cp-portal-metric-lbl">可用节点数</span>
        </div>
        <div class="cp-portal-divider" aria-hidden="true"></div>
        <div class="cp-portal-metric">
          <span class="cp-portal-metric-num">多客户端</span>
          <span class="cp-portal-metric-lbl">一键导入支持</span>
        </div>
      </div>
    </div>
  </section>

  <div class="cp-portal-body">
    <section class="cp-portal-announcements">
      {{announcements}}
    </section>

    <section id="cp-portal-profiles" class="cp-portal-section">
      <div class="cp-portal-section-head">
        <div>
          <span class="cp-portal-eyebrow">AVAILABLE SUBSCRIPTIONS</span>
          <h2>可用订阅列表</h2>
        </div>
        <p>支持直接复制链接、预览节点列表与二维码扫码导入</p>
      </div>
      {{profiles}}
    </section>

    <section id="cp-portal-feedback" class="cp-portal-feedback">
      <div class="cp-portal-feedback-text">
        <h3>需要帮助或反馈节点异常？</h3>
        <p>通过留言板提交反馈，管理员会及时跟进处理。</p>
      </div>
      <div class="cp-portal-feedback-btn">{{guestbook}}</div>
    </section>
  </div>
</div>`,
  css: `.cp-portal {
  --pt-surface: var(--surface, #ffffff);
  --pt-fg: var(--fg, #0a0a0a);
  --pt-muted: var(--fg-muted, #525252);
  --pt-subtle: var(--fg-subtle, #737373);
  --pt-line: var(--line, rgba(0, 0, 0, 0.1));
  --pt-glass: rgba(255, 255, 255, 0.78);
  --pt-grid: rgba(15, 23, 42, 0.05);
  width: 100%;
  color: var(--pt-fg);
}

.dark .cp-portal {
  --pt-glass: rgba(20, 20, 24, 0.72);
  --pt-grid: rgba(255, 255, 255, 0.045);
}

.cp-portal *,
.cp-portal *::before,
.cp-portal *::after {
  box-sizing: border-box;
}

.cp-portal-hero {
  position: relative;
  width: 100%;
  padding: 72px 20px 56px;
  overflow: hidden;
  border-bottom: 1px solid var(--pt-line);
}

.cp-portal-hero-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(55% 75% at 50% 0%, rgba(113, 112, 255, 0.22), transparent 72%),
    radial-gradient(35% 50% at 80% 10%, rgba(56, 189, 248, 0.12), transparent 70%),
    linear-gradient(to right, var(--pt-grid) 1px, transparent 1px),
    linear-gradient(to bottom, var(--pt-grid) 1px, transparent 1px);
  background-size: 100% 100%, 100% 100%, 40px 40px, 40px 40px;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.95) 45%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.95) 45%, transparent 100%);
}

.cp-portal-hero-inner {
  position: relative;
  z-index: 1;
  max-width: 820px;
  margin: 0 auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.cp-portal-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--pt-glass);
  border: 1px solid var(--pt-line);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-size: 12px;
  font-weight: 500;
  color: var(--pt-muted);
}

.cp-portal-pulse {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #10b981;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.2);
}

.cp-portal-title {
  margin: 0;
  font-size: clamp(32px, 5vw, 52px);
  font-weight: 800;
  line-height: 1.12;
  letter-spacing: -0.04em;
  background: linear-gradient(180deg, var(--pt-fg) 30%, var(--pt-muted) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.cp-portal-desc {
  margin: 0;
  font-size: 16px;
  line-height: 1.7;
  color: var(--pt-muted);
  max-width: 58ch;
}

.cp-portal-desc:empty::before {
  content: "精选多地区低延迟节点订阅，支持一键导入主流客户端，随时保持稳定连接。";
}

.cp-portal-cta-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 4px;
}

.cp-portal-cta-main {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 11px 24px;
  border-radius: 12px;
  background: linear-gradient(135deg, #7170ff 0%, #4f46e5 100%);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  box-shadow: 0 10px 24px -8px rgba(79, 70, 229, 0.6);
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.cp-portal-cta-main:hover {
  transform: translateY(-1px);
  opacity: 0.94;
}

.cp-portal-cta-sub {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 11px 20px;
  border-radius: 12px;
  background: var(--pt-glass);
  border: 1px solid var(--pt-line);
  color: var(--pt-fg);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: border-color 0.18s ease;
}

.cp-portal-cta-sub:hover {
  border-color: rgba(113, 112, 255, 0.45);
}

.cp-portal-metrics {
  margin-top: 16px;
  width: 100%;
  max-width: 620px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 16px 20px;
  border-radius: 16px;
  background: var(--pt-glass);
  border: 1px solid var(--pt-line);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.cp-portal-metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.cp-portal-metric-num {
  font-size: 20px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--pt-fg);
}

.cp-portal-metric-lbl {
  font-size: 12px;
  color: var(--pt-subtle);
}

.cp-portal-divider {
  width: 1px;
  height: 28px;
  background: var(--pt-line);
}

.cp-portal-body {
  max-width: 1160px;
  margin: 0 auto;
  padding: 40px 20px 64px;
  display: flex;
  flex-direction: column;
  gap: 36px;
}

.cp-portal-announcements:has([data-slot="announcements"]:empty) {
  display: none;
}

.cp-portal-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cp-portal-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.cp-portal-eyebrow {
  display: block;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.1em;
  color: #7170ff;
  margin-bottom: 4px;
}

.cp-portal-section-head h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--pt-fg);
}

.cp-portal-section-head p {
  margin: 0;
  font-size: 13px;
  color: var(--pt-subtle);
}

.cp-portal-feedback {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 24px 28px;
  border-radius: 16px;
  background: var(--pt-surface);
  border: 1px solid var(--pt-line);
}

.cp-portal-feedback:has([data-slot="guestbook"]:empty) {
  display: none;
}

.cp-portal-feedback-text h3 {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 650;
  color: var(--pt-fg);
}

.cp-portal-feedback-text p {
  margin: 0;
  font-size: 13px;
  color: var(--pt-muted);
}

@media (max-width: 640px) {
  .cp-portal-hero {
    padding: 48px 16px 40px;
  }

  .cp-portal-metrics {
    flex-direction: column;
    gap: 14px;
  }

  .cp-portal-divider {
    width: 60%;
    height: 1px;
  }

  .cp-portal-feedback {
    flex-direction: column;
    align-items: flex-start;
    padding: 20px;
  }
}`,
};

export const CUSTOM_PAGE_TEMPLATES = [minimalNavTemplate, personalHomeTemplate, subPortalTemplate];
