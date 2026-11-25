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
}

`,
};

const editorialZineTemplate = {
  id: 'editorial-zine',
  nameKey: 'settings.customPageTemplateEditorialZine',
  descKey: 'settings.customPageTemplateEditorialZineDesc',
  badgeKey: 'settings.customPageTemplateEditorialZineBadge',
  layoutPreset: {
    useDefaultLayout: false,
    hideHeader: true,
    hideFooter: true,
    hideBranding: true,
  },
  content: `<div id="cp-ed-top" class="cp-ed">
  <div class="cp-ed-grid-overlay" aria-hidden="true">
    <span></span>
    <span></span>
    <span></span>
    <span></span>
  </div>

  <header class="cp-ed-nav">
    <div class="cp-ed-nav-inner">
      <a class="cp-ed-brand" href="#cp-ed-top">
        <span class="cp-ed-brand-mark">{{title}}</span>
        <span class="cp-ed-brand-sep">/</span>
        <span class="cp-ed-brand-sub">SUBSCRIPTION HUB</span>
      </a>

      <nav class="cp-ed-nav-links" aria-label="Section navigation">
        <a href="#cp-ed-profiles">(01) 订阅</a>
        <a href="#cp-ed-speed">(02) 效率</a>
        <a href="#cp-ed-features">(03) 特性</a>
        <a href="#cp-ed-steps">(04) 接入</a>
      </nav>

      <div class="cp-ed-nav-right">
        <span class="cp-ed-status-pill">
          <span class="cp-ed-status-dot" aria-hidden="true"></span>
          <span>ONLINE · v{{version}}</span>
        </span>
        <a class="cp-ed-nav-ext" href="#cp-ed-profiles">订阅 ↘</a>
      </div>
    </div>
  </header>

  <main class="cp-ed-main">
    <section class="cp-ed-hero">
      <div class="cp-ed-hero-grid">
        <div class="cp-ed-hero-left">
          <div class="cp-ed-mono-label">FIG. 01 — 字</div>
          <div class="cp-ed-glyph-wrap">
            <div class="cp-ed-glyph-char cp-ed-stipple" aria-hidden="true">快</div>
            <div class="cp-ed-glyph-callout">
              <span class="cp-ed-glyph-arrow">↙</span>
              <span class="cp-ed-glyph-tag">1-Click</span>
            </div>
          </div>
        </div>

        <div class="cp-ed-hero-right">
          <div class="cp-ed-mono-label">专业的订阅聚合与分发服务</div>
          <div class="cp-ed-phonetic">
            <span class="cp-ed-phonetic-ipa">[ kuài ]</span>
            <span class="cp-ed-phonetic-pos">〔形〕 ADJ.</span>
          </div>

          <ol class="cp-ed-defs">
            <li><span class="cp-ed-def-num">1</span><span>极速同步，多格式原生转换。</span></li>
            <li><span class="cp-ed-def-num">2</span><span>清晰可控，节点预览与分组管理。</span></li>
            <li><span class="cp-ed-def-num">3</span><span>爽快接入，扫码或一键导入客户端。</span></li>
          </ol>

          <div class="cp-ed-example">
            <span class="cp-ed-example-tag">例</span>
            <span>用了 <strong>{{title}}</strong> 之后，订阅管理 <span class="cp-ed-chalk-circle">快</span> 多了。</span>
          </div>

          <p class="cp-ed-hero-desc">{{description}}</p>

          <div class="cp-ed-cta-row">
            <a class="cp-ed-btn-primary" href="#cp-ed-profiles">获取可用订阅 →</a>
            <a class="cp-ed-btn-ghost" href="#cp-ed-steps">查看接入步骤 ↘</a>
          </div>
        </div>
      </div>

      <div class="cp-ed-kpi-strip">
        <div class="cp-ed-kpi-cell">
          <span class="cp-ed-kpi-label">PROFILES</span>
          <span class="cp-ed-kpi-value">{{profile_count}} <small>组</small></span>
        </div>
        <div class="cp-ed-kpi-cell">
          <span class="cp-ed-kpi-label">NODES</span>
          <span class="cp-ed-kpi-value">{{node_count}} <small>个</small></span>
        </div>
        <div class="cp-ed-kpi-cell">
          <span class="cp-ed-kpi-label">VERSION</span>
          <span class="cp-ed-kpi-value cp-ed-gold">v{{version}}</span>
        </div>
        <div class="cp-ed-kpi-cell">
          <span class="cp-ed-kpi-label">FORMAT</span>
          <span class="cp-ed-kpi-value">Multi-Client</span>
        </div>
      </div>
    </section>

    <section class="cp-ed-announcements">
      {{announcements}}
    </section>

    <section id="cp-ed-profiles" class="cp-ed-section">
      <div class="cp-ed-section-bar">
        <span>(01) PROFILES</span>
        <span>公开订阅</span>
      </div>

      <div class="cp-ed-split-head">
        <div class="cp-ed-split-left">
          <h2 class="cp-ed-h2">一个入口，全部搞定。</h2>
          <p class="cp-ed-muted">支持一键导入主流客户端、导入前实时预览节点，以及移动端二维码扫码直连。</p>
        </div>
        <div class="cp-ed-split-counters">
          <div class="cp-ed-counter-block">
            <span class="cp-ed-counter-num">{{profile_count}}</span>
            <span class="cp-ed-counter-lbl">AVAILABLE PROFILES</span>
          </div>
          <div class="cp-ed-counter-block">
            <span class="cp-ed-counter-num cp-ed-gold">{{node_count}}</span>
            <span class="cp-ed-counter-lbl">TOTAL NODES</span>
          </div>
        </div>
      </div>

      <div class="cp-ed-profiles-wrap">
        {{profiles}}
      </div>
    </section>

    <div class="cp-ed-marquee" aria-hidden="true">
      <div class="cp-ed-marquee-track">
        <span>极速</span><span class="cp-ed-star">✳</span>
        <span class="cp-ed-outline">稳定</span><span class="cp-ed-star">✳</span>
        <span>聚合</span><span class="cp-ed-star">✳</span>
        <span class="cp-ed-outline">多端</span><span class="cp-ed-star">✳</span>
        <span>安全</span><span class="cp-ed-star">✳</span>
        <span class="cp-ed-outline">简单</span><span class="cp-ed-star">✳</span>
        <span>极速</span><span class="cp-ed-star">✳</span>
        <span class="cp-ed-outline">稳定</span><span class="cp-ed-star">✳</span>
        <span>聚合</span><span class="cp-ed-star">✳</span>
        <span class="cp-ed-outline">多端</span><span class="cp-ed-star">✳</span>
        <span>安全</span><span class="cp-ed-star">✳</span>
        <span class="cp-ed-outline">简单</span><span class="cp-ed-star">✳</span>
      </div>
    </div>

    <section id="cp-ed-speed" class="cp-ed-section">
      <div class="cp-ed-section-bar">
        <span>(02) EFFICIENCY</span>
        <span>接入效率</span>
      </div>

      <div class="cp-ed-compare">
        <div class="cp-ed-compare-side">
          <div class="cp-ed-compare-big cp-ed-compare-old">手动</div>
          <span class="cp-ed-mono-label">逐条复制导入 / MANUAL</span>
        </div>

        <div class="cp-ed-compare-mid">
          <span class="cp-ed-compare-arrow">→</span>
          <span class="cp-ed-compare-mult">×4 FASTER</span>
        </div>

        <div class="cp-ed-compare-side">
          <div class="cp-ed-compare-big cp-ed-compare-new cp-ed-stipple">一键</div>
          <span class="cp-ed-mono-label">MiSub 聚合 / OPTIMIZED</span>
        </div>
      </div>

      <h2 class="cp-ed-compare-headline">同样的节点资源，少折腾 90% 的配置时间。</h2>

      <div class="cp-ed-stats-4">
        <div class="cp-ed-stat-box">
          <span class="cp-ed-stat-num">1-Click</span>
          <span class="cp-ed-stat-desc">主流客户端一键拉起导入</span>
        </div>
        <div class="cp-ed-stat-box">
          <span class="cp-ed-stat-num">Preview</span>
          <span class="cp-ed-stat-desc">导入前在线预览全部节点</span>
        </div>
        <div class="cp-ed-stat-box">
          <span class="cp-ed-stat-num">QR Code</span>
          <span class="cp-ed-stat-desc">桌面端与移动端无缝扫码</span>
        </div>
        <div class="cp-ed-stat-box">
          <span class="cp-ed-stat-num">24/7</span>
          <span class="cp-ed-stat-desc">边缘节点全天候实时分发</span>
        </div>
      </div>
    </section>

    <section id="cp-ed-features" class="cp-ed-section">
      <div class="cp-ed-section-bar">
        <span>(03) FEATURES</span>
        <span>特性</span>
      </div>

      <div class="cp-ed-features-layout">
        <div class="cp-ed-features-sticky">
          <h2 class="cp-ed-features-title cp-ed-stipple">八个<br />理由。</h2>
          <p class="cp-ed-muted">为日常订阅管理与团队/个人公开分发而设计的克制架构。</p>
          <div class="cp-ed-features-zero8" aria-hidden="true">08</div>
        </div>

        <div class="cp-ed-features-list">
          <div class="cp-ed-feature-item">
            <span class="cp-ed-feature-idx">01</span>
            <div class="cp-ed-feature-body">
              <div class="cp-ed-feature-head"><h3>多源聚合</h3><span>AGGREGATE</span></div>
              <p>将多个订阅链接与自建节点统一整合为清晰的公开订阅组，告别零散管理。</p>
            </div>
          </div>
          <div class="cp-ed-feature-item">
            <span class="cp-ed-feature-idx">02</span>
            <div class="cp-ed-feature-body">
              <div class="cp-ed-feature-head"><h3>格式自适应</h3><span>TRANSFORM</span></div>
              <p>根据客户端请求自动输出 Clash、Sing-box、Surge、Shadowrocket 等格式。</p>
            </div>
          </div>
          <div class="cp-ed-feature-item">
            <span class="cp-ed-feature-idx">03</span>
            <div class="cp-ed-feature-body">
              <div class="cp-ed-feature-head"><h3>节点预览</h3><span>INSPECT</span></div>
              <p>无需先导入客户端，直接在页面内查看订阅组包含的节点地区与协议详情。</p>
            </div>
          </div>
          <div class="cp-ed-feature-item">
            <span class="cp-ed-feature-idx">04</span>
            <div class="cp-ed-feature-body">
              <div class="cp-ed-feature-head"><h3>一键导入</h3><span>QUICK IMPORT</span></div>
              <p>内置常用客户端 Deep Link 协议，点击即可直接唤起本地客户端完成订阅添加。</p>
            </div>
          </div>
          <div class="cp-ed-feature-item">
            <span class="cp-ed-feature-idx">05</span>
            <div class="cp-ed-feature-body">
              <div class="cp-ed-feature-head"><h3>扫码直连</h3><span>QR SCAN</span></div>
              <p>每张订阅卡片均支持即时生成高清二维码，手机相机扫码即可快速同步。</p>
            </div>
          </div>
          <div class="cp-ed-feature-item">
            <span class="cp-ed-feature-idx">06</span>
            <div class="cp-ed-feature-body">
              <div class="cp-ed-feature-head"><h3>短链支持</h3><span>SHORT LINK</span></div>
              <p>配合自定义短链与固定 Token 路径，链接更简洁，便于分享与长期记忆。</p>
            </div>
          </div>
          <div class="cp-ed-feature-item">
            <span class="cp-ed-feature-idx">07</span>
            <div class="cp-ed-feature-body">
              <div class="cp-ed-feature-head"><h3>边缘驱动</h3><span>EDGE READY</span></div>
              <p>基于轻量边缘网络与静态资源分离架构，全球各地访问均保持毫秒级响应。</p>
            </div>
          </div>
          <div class="cp-ed-feature-item">
            <span class="cp-ed-feature-idx">08</span>
            <div class="cp-ed-feature-body">
              <div class="cp-ed-feature-head"><h3>简单易用</h3><span>SIMPLE</span></div>
              <p>无需复杂教程，打开页面、选择订阅、导入客户端，三步即可完成全部配置。</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="cp-ed-steps" class="cp-ed-section">
      <div class="cp-ed-section-bar">
        <span>(04) GET STARTED</span>
        <span>开始使用</span>
      </div>

      <div class="cp-ed-start-top">
        <div class="cp-ed-start-left">
          <h2 class="cp-ed-features-title cp-ed-stipple">三步，<br />接入。</h2>
          <p class="cp-ed-muted">从选定订阅组到客户端拉取节点，全程不到 30 秒。</p>
        </div>

        <div class="cp-ed-start-right">
          <div class="cp-ed-code-box">
            <div class="cp-ed-code-head">SUBSCRIPTION FLOW</div>
            <div class="cp-ed-code-row"><span>Step 01</span><span>Select Profile</span><span class="cp-ed-gold">{{profile_count}} Available</span></div>
            <div class="cp-ed-code-row"><span>Step 02</span><span>Action</span><span class="cp-ed-gold">Quick Import / Copy / QR</span></div>
            <div class="cp-ed-code-row"><span>Step 03</span><span>Sync</span><span>Auto-Update Enabled</span></div>
          </div>

          <div class="cp-ed-cta-row">
            <a class="cp-ed-btn-primary" href="#cp-ed-profiles">立即获取订阅 →</a>
            <a class="cp-ed-btn-ghost" href="#cp-ed-feedback">问题反馈 ↘</a>
          </div>
        </div>
      </div>

      <div class="cp-ed-steps-3">
        <div class="cp-ed-step-card">
          <span class="cp-ed-step-num">1</span>
          <h3>选择订阅组</h3>
          <p>在上方列表中找到所需订阅组，可先点击预览查看节点分布。</p>
        </div>
        <div class="cp-ed-step-card">
          <span class="cp-ed-step-num">2</span>
          <h3>一键导入或扫码</h3>
          <p>点击「一键导入」唤起客户端，或展开二维码使用手机扫码。</p>
        </div>
        <div class="cp-ed-step-card">
          <span class="cp-ed-step-num">3</span>
          <h3>完成接入</h3>
          <p>客户端拉取配置后即可使用，后续节点变更将自动同步更新。</p>
        </div>
      </div>
    </section>

    <section id="cp-ed-feedback" class="cp-ed-feedback">
      <div class="cp-ed-feedback-copy">
        <span class="cp-ed-mono-label">(05) FEEDBACK · 留言反馈</span>
        <h3>遇到节点异常或需要协助？</h3>
        <p>欢迎通过留言板向管理员提交反馈，我们会及时核查处理。</p>
      </div>
      <div class="cp-ed-feedback-slot">{{guestbook}}</div>
    </section>
  </main>

  <footer class="cp-ed-footer">
    <div class="cp-ed-footer-bar">
      <span>POWERED BY MISUB · v{{version}}</span>
      <div class="cp-ed-footer-links">
        <a href="#cp-ed-profiles">订阅列表 ↑</a>
        <a href="#cp-ed-steps">接入指南 ↑</a>
        <a href="#cp-ed-top">回到顶部 ↑</a>
      </div>
    </div>
    <div class="cp-ed-watermark cp-ed-stipple" aria-hidden="true">MISUB</div>
  </footer>
</div>`,
  css: `.cp-ed {
  --ed-bg: #0a0a0a;
  --ed-surface: #111111;
  --ed-surface-alt: #161616;
  --ed-fg: #f0ede6;
  --ed-muted: #8a867e;
  --ed-subtle: #66625b;
  --ed-gold: #d4b46a;
  --ed-gold-bright: #e2c074;
  --ed-coral: #c97b7b;
  --ed-emerald: #34d399;
  --ed-line: rgba(240, 237, 230, 0.14);
  --ed-line-strong: rgba(240, 237, 230, 0.28);
  --ed-v-dash: repeating-linear-gradient(to bottom, rgba(240, 237, 230, 0.11) 0 2px, transparent 2px 6px);
  --ed-h-dash: repeating-linear-gradient(to right, rgba(240, 237, 230, 0.14) 0 2px, transparent 2px 6px);
  --ed-serif: 'Noto Serif SC', 'Songti SC', 'STSong', Georgia, 'Times New Roman', serif;
  --ed-mono: var(--font-mono, 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace);
  --ed-grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E");
  position: relative;
  width: 100%;
  min-height: 100dvh;
  background-color: var(--ed-bg);
  background-image: var(--ed-grain);
  color: var(--ed-fg);
  font-family: var(--font-body, system-ui, -apple-system, sans-serif);
  overflow-x: clip;
}

.cp-ed *,
.cp-ed *::before,
.cp-ed *::after {
  box-sizing: border-box;
}

.cp-ed-gold {
  color: var(--ed-gold-bright);
}

.cp-ed-stipple {
  color: var(--ed-fg);
  background-image:
    radial-gradient(rgba(240, 237, 230, 0.94) 1px, transparent 1px),
    radial-gradient(rgba(240, 237, 230, 0.42) 1px, transparent 1px),
    linear-gradient(170deg, rgba(240, 237, 230, 0.92) 0%, rgba(162, 155, 143, 0.58) 100%);
  background-size: 3px 3px, 5px 5px, 100% 100%;
  background-position: 0 0, 2px 2px, 0 0;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.cp-ed-muted {
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--ed-muted);
}

.cp-ed-mono-label {
  font-family: var(--ed-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ed-muted);
}

/* 4-column persistent micro-dashed grid (single source of truth for vertical lines) */
.cp-ed-grid-overlay {
  position: fixed;
  inset: 0;
  max-width: 1280px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  pointer-events: none;
  z-index: 0;
}

.cp-ed-grid-overlay span {
  position: relative;
  height: 100%;
}

.cp-ed-grid-overlay span::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1px;
  background-image: var(--ed-v-dash);
}

.cp-ed-grid-overlay span:last-child::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 1px;
  background-image: var(--ed-v-dash);
}

/* Sticky frosted-glass header */
.cp-ed-nav {
  position: sticky;
  top: 0;
  z-index: 40;
  width: 100%;
  background: rgba(10, 10, 10, 0.84);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.cp-ed-nav::after {
  content: '';
  display: block;
  width: 100%;
  height: 1px;
  background-image: var(--ed-h-dash);
}

.cp-ed-nav-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.cp-ed-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--ed-fg);
}

.cp-ed-brand-mark {
  font-family: var(--ed-serif);
  font-style: italic;
  font-weight: 700;
  font-size: 18px;
  letter-spacing: 0.04em;
}

.cp-ed-brand-sep {
  color: var(--ed-subtle);
  font-family: var(--ed-mono);
}

.cp-ed-brand-sub {
  font-family: var(--ed-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--ed-muted);
}

.cp-ed-nav-links {
  display: flex;
  align-items: center;
  gap: 24px;
}

.cp-ed-nav-links a,
.cp-ed-nav-ext {
  font-family: var(--ed-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--ed-muted);
  text-decoration: none;
  transition: color 0.18s ease;
}

.cp-ed-nav-links a:hover,
.cp-ed-nav-ext:hover {
  color: var(--ed-fg);
}

.cp-ed-nav-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.cp-ed-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px dashed var(--ed-line);
  font-family: var(--ed-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ed-fg);
}

.cp-ed-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--ed-emerald);
  box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.55);
  animation: cp-ed-pulse 2.2s ease-out infinite;
}

/* Main container */
.cp-ed-main {
  position: relative;
  z-index: 1;
  max-width: 1280px;
  margin: 0 auto;
}

/* Hero dictionary spread (strictly 50/50 aligned to 4-column grid) */
.cp-ed-hero {
  position: relative;
}

.cp-ed-hero::after {
  content: '';
  display: block;
  width: 100%;
  height: 1px;
  background-image: var(--ed-h-dash);
}

.cp-ed-hero-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 520px;
}

.cp-ed-hero-left {
  padding: 48px 36px 44px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
}

.cp-ed-glyph-wrap {
  position: relative;
  margin: auto;
  padding: 20px 64px 32px 0;
  animation: cp-ed-fade-up 0.75s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.cp-ed-glyph-char {
  font-family: var(--ed-serif);
  font-size: clamp(175px, 23vw, 296px);
  font-weight: 900;
  line-height: 0.92;
  position: relative;
}

.cp-ed-glyph-char::after {
  content: '';
  position: absolute;
  left: 2%;
  right: 2%;
  bottom: -10px;
  height: 7px;
  border-top: 2.5px solid var(--ed-gold);
  border-bottom: 1.5px solid var(--ed-gold);
  transform-origin: left center;
  transform: rotate(-1.2deg) scaleX(1);
  animation: cp-ed-draw-line 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.25s both;
}

.cp-ed-glyph-callout {
  position: absolute;
  top: 16%;
  right: -12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--ed-serif);
  font-style: italic;
  font-size: 20px;
  color: var(--ed-gold-bright);
  white-space: nowrap;
  transform: rotate(-6deg);
  animation: cp-ed-fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.4s both;
}

.cp-ed-hero-right {
  padding: 52px 36px 48px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 20px;
  animation: cp-ed-fade-up 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both;
}

.cp-ed-phonetic {
  display: flex;
  align-items: baseline;
  gap: 14px;
}

.cp-ed-phonetic-ipa {
  font-family: var(--ed-serif);
  font-style: italic;
  font-size: 26px;
  color: var(--ed-fg);
}

.cp-ed-phonetic-pos {
  font-family: var(--ed-mono);
  font-size: 12px;
  letter-spacing: 0.1em;
  color: var(--ed-muted);
}

.cp-ed-defs {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cp-ed-defs li {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 16px;
  line-height: 1.6;
  color: var(--ed-fg);
}

.cp-ed-def-num {
  font-family: var(--ed-serif);
  font-style: italic;
  font-weight: 700;
  color: var(--ed-gold-bright);
  min-width: 14px;
}

.cp-ed-example {
  position: relative;
  padding: 16px 0;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: var(--ed-fg);
  background-image: var(--ed-h-dash), var(--ed-h-dash);
  background-size: 100% 1px, 100% 1px;
  background-position: top left, bottom left;
  background-repeat: no-repeat;
}

.cp-ed-example-tag {
  font-family: var(--ed-mono);
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--ed-line-strong);
  color: var(--ed-muted);
}

.cp-ed-chalk-circle {
  display: inline-block;
  padding: 1px 8px;
  border: 1.5px solid var(--ed-gold);
  border-radius: 50%;
  color: var(--ed-gold-bright);
  font-family: var(--ed-serif);
  font-weight: 700;
  transform: rotate(-4deg);
}

.cp-ed-hero-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--ed-muted);
}

.cp-ed-cta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
  margin-top: 4px;
}

.cp-ed-btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 22px;
  background: var(--ed-fg);
  color: var(--ed-bg);
  border: 1px solid var(--ed-fg);
  border-radius: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-decoration: none;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.cp-ed-btn-primary:hover {
  background: var(--ed-gold-bright);
  border-color: var(--ed-gold-bright);
  color: var(--ed-bg);
}

.cp-ed-btn-ghost {
  font-family: var(--ed-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
  color: var(--ed-muted);
  text-decoration: none;
  border-bottom: 1px dashed var(--ed-line-strong);
  padding-bottom: 3px;
  transition: color 0.18s ease, border-color 0.18s ease;
}

.cp-ed-btn-ghost:hover {
  color: var(--ed-fg);
  border-color: var(--ed-gold);
}

/* 4-Column KPI strip (uses background 4-col grid for vertical dividers) */
.cp-ed-kpi-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background-image: var(--ed-h-dash);
  background-size: 100% 1px;
  background-position: top left;
  background-repeat: no-repeat;
}

.cp-ed-kpi-cell {
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cp-ed-kpi-label {
  font-family: var(--ed-mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--ed-subtle);
}

.cp-ed-kpi-value {
  font-family: var(--ed-serif);
  font-style: italic;
  font-size: 24px;
  font-weight: 700;
  color: var(--ed-fg);
}

.cp-ed-kpi-value small {
  font-family: var(--font-body, sans-serif);
  font-style: normal;
  font-size: 12px;
  font-weight: 400;
  color: var(--ed-muted);
}

/* Announcements slot */
.cp-ed-announcements {
  padding: 24px 24px 0;
}

.cp-ed-announcements:has([data-slot="announcements"]:empty) {
  display: none;
}

.cp-ed [data-slot="announcements"] > * {
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
}

.cp-ed [data-slot="announcements"] .rounded-md {
  border-radius: 0 !important;
  border-style: dashed !important;
  border-color: var(--ed-line-strong) !important;
  background: var(--ed-surface) !important;
  color: var(--ed-fg) !important;
}

/* Section chrome */
.cp-ed-section {
  position: relative;
  padding: 56px 24px;
  background-image: var(--ed-h-dash);
  background-size: 100% 1px;
  background-position: bottom left;
  background-repeat: no-repeat;
}

.cp-ed-section-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 40px;
  font-family: var(--ed-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--ed-muted);
  background-image: var(--ed-h-dash);
  background-size: 100% 1px;
  background-position: center;
  background-repeat: no-repeat;
}

.cp-ed-section-bar span {
  background: var(--ed-bg);
}

.cp-ed-section-bar span:first-child {
  padding-right: 14px;
  color: var(--ed-gold-bright);
}

.cp-ed-section-bar span:last-child {
  padding-left: 14px;
}

.cp-ed-split-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 36px;
}

.cp-ed-split-left {
  max-width: 560px;
}

.cp-ed-h2 {
  margin: 0 0 10px;
  font-family: var(--ed-serif);
  font-size: clamp(28px, 3.6vw, 40px);
  font-weight: 700;
  line-height: 1.2;
  color: var(--ed-fg);
}

.cp-ed-split-counters {
  display: flex;
  gap: 36px;
}

.cp-ed-counter-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cp-ed-counter-num {
  font-family: var(--ed-serif);
  font-style: italic;
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
  color: var(--ed-fg);
}

.cp-ed-counter-lbl {
  font-family: var(--ed-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--ed-subtle);
}

/* Profiles slot theme overrides (match dark editorial sharp-corner style) */
.cp-ed-profiles-wrap {
  --surface: #111111;
  --elevated-card: #181818;
  --inset: #0d0d0d;
  --hover: #1d1d1d;
  --accent: #f0ede6;
  --accent-fg: #0a0a0a;
  --fg: #f0ede6;
  --fg-muted: #9a958c;
  --fg-subtle: #78746c;
  --line: rgba(240, 237, 230, 0.16);
  --line-strong: rgba(212, 180, 106, 0.55);
}

.cp-ed [data-slot="profiles"] .rounded-md {
  border-radius: 0 !important;
}

.cp-ed [data-slot="profiles"] .border-line {
  border-style: dashed !important;
}

.cp-ed [data-slot="profiles"] .bg-surface {
  transition: border-color 0.22s ease, transform 0.22s ease !important;
}

.cp-ed [data-slot="profiles"] .bg-surface:hover,
.cp-ed [data-slot="profiles"] .group:hover {
  border-color: var(--ed-gold) !important;
}

/* Marquee */
.cp-ed-marquee {
  padding: 26px 0;
  overflow: hidden;
  white-space: nowrap;
  background-image: var(--ed-h-dash);
  background-size: 100% 1px;
  background-position: bottom left;
  background-repeat: no-repeat;
}

.cp-ed-marquee-track {
  display: flex;
  width: max-content;
  align-items: center;
  gap: 28px;
  font-family: var(--ed-serif);
  font-size: clamp(32px, 5vw, 56px);
  font-weight: 700;
  color: var(--ed-fg);
  will-change: transform;
  animation: cp-ed-scroll 24s linear infinite;
}

.cp-ed-marquee:hover .cp-ed-marquee-track {
  animation-play-state: paused;
}

.cp-ed-outline {
  color: transparent;
  -webkit-text-stroke: 1px rgba(240, 237, 230, 0.55);
}

.cp-ed-star {
  font-size: 24px;
  color: var(--ed-gold);
}

@keyframes cp-ed-scroll {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

/* Compare section */
.cp-ed-compare {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 24px;
  padding: 20px 0 36px;
}

.cp-ed-compare-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.cp-ed-compare-big {
  font-family: var(--ed-serif);
  font-size: clamp(56px, 9vw, 112px);
  font-weight: 900;
  line-height: 1;
}

.cp-ed-compare-old {
  position: relative;
  color: transparent;
  -webkit-text-stroke: 1px rgba(240, 237, 230, 0.45);
  padding: 0 10px;
}

.cp-ed-compare-old::before,
.cp-ed-compare-old::after {
  content: '';
  position: absolute;
  left: -6%;
  right: -6%;
  top: 50%;
  height: 3px;
  background: var(--ed-coral);
  opacity: 0.9;
}

.cp-ed-compare-old::before {
  transform: rotate(-9deg);
}

.cp-ed-compare-old::after {
  transform: rotate(8deg);
}

.cp-ed-compare-new {
  padding: 10px 30px;
  border: 2px solid var(--ed-gold);
  border-radius: 54% 46% 52% 48% / 46% 56% 44% 54%;
  transform: rotate(-3deg);
  transition: transform 0.25s ease;
}

.cp-ed-compare-new:hover {
  transform: rotate(0deg) scale(1.03);
}

.cp-ed-compare-mid {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.cp-ed-compare-arrow {
  font-size: 24px;
  color: var(--ed-muted);
}

.cp-ed-compare-mult {
  font-family: var(--ed-serif);
  font-style: italic;
  font-size: 16px;
  font-weight: 700;
  color: var(--ed-gold-bright);
}

.cp-ed-compare-headline {
  margin: 0 0 32px;
  text-align: center;
  font-family: var(--ed-serif);
  font-size: clamp(22px, 3vw, 32px);
  font-weight: 700;
  color: var(--ed-fg);
}

.cp-ed-stats-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin: 0 -24px;
  background-image: var(--ed-h-dash), var(--ed-h-dash);
  background-size: 100% 1px, 100% 1px;
  background-position: top left, bottom left;
  background-repeat: no-repeat;
}

.cp-ed-stat-box {
  padding: 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cp-ed-stat-num {
  font-family: var(--ed-serif);
  font-style: italic;
  font-size: 24px;
  font-weight: 700;
  color: var(--ed-gold-bright);
}

.cp-ed-stat-desc {
  font-size: 13px;
  line-height: 1.5;
  color: var(--ed-muted);
}

/* Features 08 layout (aligned to 1/4 + 3/4 columns of the 4-col grid) */
.cp-ed-features-layout {
  display: grid;
  grid-template-columns: 1fr 3fr;
  gap: 32px;
  align-items: start;
}

.cp-ed-features-sticky {
  position: sticky;
  top: 84px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cp-ed-features-title {
  margin: 0;
  font-family: var(--ed-serif);
  font-size: clamp(38px, 5vw, 56px);
  font-weight: 900;
  line-height: 1.08;
  color: var(--ed-fg);
}

.cp-ed-features-zero8 {
  margin-top: 12px;
  font-family: var(--ed-serif);
  font-style: italic;
  font-size: clamp(96px, 12vw, 150px);
  font-weight: 900;
  line-height: 0.9;
  color: transparent;
  -webkit-text-stroke: 1px rgba(240, 237, 230, 0.28);
}

.cp-ed-features-list {
  display: flex;
  flex-direction: column;
}

.cp-ed-feature-item {
  display: flex;
  gap: 20px;
  padding: 20px 12px;
  background-image: var(--ed-h-dash);
  background-size: 100% 1px;
  background-position: top left;
  background-repeat: no-repeat;
  border-left: 2px solid transparent;
  transition: background-color 0.2s ease, border-left-color 0.2s ease, padding-left 0.2s ease;
}

.cp-ed-feature-item:hover {
  background-color: rgba(240, 237, 230, 0.025);
  border-left-color: var(--ed-gold);
  padding-left: 18px;
}

.cp-ed-feature-item:last-child {
  background-image: var(--ed-h-dash), var(--ed-h-dash);
  background-size: 100% 1px, 100% 1px;
  background-position: top left, bottom left;
  background-repeat: no-repeat;
}

.cp-ed-feature-idx {
  font-family: var(--ed-serif);
  font-style: italic;
  font-size: 20px;
  font-weight: 700;
  color: var(--ed-gold-bright);
  min-width: 30px;
  padding-top: 2px;
}

.cp-ed-feature-body {
  flex: 1;
  display: grid;
  grid-template-columns: 165px 1fr;
  align-items: baseline;
  gap: 16px;
}

.cp-ed-feature-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cp-ed-feature-head h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--ed-fg);
}

.cp-ed-feature-head span {
  font-family: var(--ed-mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--ed-subtle);
}

.cp-ed-feature-body p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--ed-muted);
}

/* Get started 3 steps (50/50 aligned to 4-col grid) */
.cp-ed-start-top {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  align-items: end;
  margin-bottom: 40px;
}

.cp-ed-start-left {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cp-ed-start-right {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cp-ed-code-box {
  border: 1px dashed var(--ed-line-strong);
  background: var(--ed-surface);
  padding: 18px 20px;
  font-family: var(--ed-mono);
  font-size: 12px;
}

.cp-ed-code-head {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--ed-subtle);
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px dashed var(--ed-line);
}

.cp-ed-code-row {
  display: grid;
  grid-template-columns: 90px 1fr auto;
  gap: 12px;
  padding: 6px 0;
  color: var(--ed-fg);
}

.cp-ed-steps-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  padding-top: 28px;
  background-image: var(--ed-h-dash);
  background-size: 100% 1px;
  background-position: top left;
  background-repeat: no-repeat;
}

.cp-ed-step-card {
  padding: 8px 4px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cp-ed-step-num {
  font-family: var(--ed-serif);
  font-style: italic;
  font-size: 32px;
  font-weight: 700;
  color: var(--ed-gold-bright);
  line-height: 1;
}

.cp-ed-step-card h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--ed-fg);
}

.cp-ed-step-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: var(--ed-muted);
}

/* Feedback / Guestbook */
.cp-ed-feedback {
  padding: 40px 24px;
  background-image: var(--ed-h-dash);
  background-size: 100% 1px;
  background-position: bottom left;
  background-repeat: no-repeat;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.cp-ed-feedback:has([data-slot="guestbook"]:empty) {
  display: none;
}

.cp-ed-feedback-copy h3 {
  margin: 8px 0 6px;
  font-family: var(--ed-serif);
  font-size: 22px;
  font-weight: 700;
  color: var(--ed-fg);
}

.cp-ed-feedback-copy p {
  margin: 0;
  font-size: 13.5px;
  color: var(--ed-muted);
}

.cp-ed [data-slot="guestbook"] button {
  border-radius: 0 !important;
  background: var(--ed-fg) !important;
  color: var(--ed-bg) !important;
  border-color: var(--ed-fg) !important;
  font-weight: 600 !important;
  padding: 11px 22px !important;
}

.cp-ed [data-slot="guestbook"] button:hover {
  background: var(--ed-gold-bright) !important;
  border-color: var(--ed-gold-bright) !important;
  opacity: 1 !important;
}

/* Footer */
.cp-ed-footer {
  position: relative;
  z-index: 1;
  max-width: 1280px;
  margin: 0 auto;
  overflow: hidden;
}

.cp-ed-footer-bar {
  padding: 22px 24px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  font-family: var(--ed-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--ed-subtle);
}

.cp-ed-footer-links {
  display: flex;
  gap: 20px;
}

.cp-ed-footer-links a {
  color: var(--ed-muted);
  text-decoration: none;
}

.cp-ed-footer-links a:hover {
  color: var(--ed-fg);
}

.cp-ed-watermark {
  font-family: var(--ed-serif);
  font-style: italic;
  font-weight: 900;
  font-size: clamp(72px, 19vw, 240px);
  line-height: 0.78;
  letter-spacing: -0.02em;
  text-align: center;
  color: rgba(240, 237, 230, 0.08);
  user-select: none;
  padding-top: 8px;
}

/* Responsive */
@media (max-width: 900px) {
  .cp-ed-hero-grid,
  .cp-ed-features-layout,
  .cp-ed-start-top {
    grid-template-columns: 1fr;
  }

  .cp-ed-hero-left {
    padding: 40px 20px;
    background-image: var(--ed-h-dash);
    background-size: 100% 1px;
    background-position: bottom left;
    background-repeat: no-repeat;
  }

  .cp-ed-hero-right {
    padding: 36px 20px;
  }

  .cp-ed-features-sticky {
    position: static;
  }

  .cp-ed-kpi-strip,
  .cp-ed-stats-4 {
    grid-template-columns: repeat(2, 1fr);
  }

  .cp-ed-kpi-cell:nth-child(-n + 2),
  .cp-ed-stat-box:nth-child(-n + 2) {
    background-image: var(--ed-h-dash);
    background-size: 100% 1px;
    background-position: bottom left;
    background-repeat: no-repeat;
  }

  .cp-ed-steps-3 {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .cp-ed-grid-overlay {
    grid-template-columns: repeat(2, 1fr);
  }

  .cp-ed-grid-overlay span:nth-child(n + 3) {
    display: none;
  }

  .cp-ed-nav-links,
  .cp-ed-brand-sep,
  .cp-ed-brand-sub,
  .cp-ed-status-pill {
    display: none;
  }

  .cp-ed-compare {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .cp-ed-feedback {
    flex-direction: column;
    align-items: flex-start;
  }

  .cp-ed-code-row {
    grid-template-columns: 72px 1fr;
  }

  .cp-ed-code-row span:last-child {
    grid-column: 1 / -1;
  }

  .cp-ed-feature-body {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}

/* Keyframes & Scroll-Driven Animations */
@keyframes cp-ed-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.55);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(52, 211, 153, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(52, 211, 153, 0);
  }
}

@keyframes cp-ed-fade-up {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes cp-ed-draw-line {
  from {
    transform: rotate(-1.2deg) scaleX(0);
  }
  to {
    transform: rotate(-1.2deg) scaleX(1);
  }
}

@keyframes cp-ed-reveal {
  from {
    opacity: 0;
    transform: translateY(28px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@supports (animation-timeline: view()) {
  .cp-ed-section,
  .cp-ed-stat-box,
  .cp-ed-feature-item,
  .cp-ed-step-card,
  .cp-ed-watermark {
    animation: cp-ed-reveal linear both;
    animation-timeline: view();
    animation-range: entry 4% cover 26%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cp-ed-marquee-track,
  .cp-ed-status-dot,
  .cp-ed-glyph-wrap,
  .cp-ed-glyph-char::after,
  .cp-ed-glyph-callout,
  .cp-ed-hero-right,
  .cp-ed-section,
  .cp-ed-stat-box,
  .cp-ed-feature-item,
  .cp-ed-step-card,
  .cp-ed-watermark {
    animation: none !important;
  }
}`,
};

export const CUSTOM_PAGE_TEMPLATES = [
  minimalNavTemplate,
  personalHomeTemplate,
  subPortalTemplate,
  editorialZineTemplate,
];
