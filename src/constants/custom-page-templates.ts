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
        {{theme_toggle}}
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
  --ed-bg: #f7f4ee;
  --ed-surface: #ffffff;
  --ed-surface-alt: #efebe2;
  --ed-fg: #181715;
  --ed-muted: #5c5850;
  --ed-subtle: #7c776d;
  --ed-gold: #9a7428;
  --ed-gold-bright: #b0852d;
  --ed-coral: #b84b4b;
  --ed-emerald: #10b981;
  --ed-line: rgba(24, 23, 21, 0.14);
  --ed-line-strong: rgba(24, 23, 21, 0.28);
  --ed-v-dash: repeating-linear-gradient(to bottom, rgba(24, 23, 21, 0.11) 0 2px, transparent 2px 6px);
  --ed-h-dash: repeating-linear-gradient(to right, rgba(24, 23, 21, 0.14) 0 2px, transparent 2px 6px);
  --ed-nav-bg: rgba(247, 244, 238, 0.86);
  --ed-stipple-dot-1: rgba(24, 23, 21, 0.92);
  --ed-stipple-dot-2: rgba(24, 23, 21, 0.36);
  --ed-stipple-grad-start: rgba(24, 23, 21, 0.92);
  --ed-stipple-grad-end: rgba(92, 88, 80, 0.62);
  --ed-outline-stroke: rgba(24, 23, 21, 0.48);
  --ed-compare-stroke: rgba(24, 23, 21, 0.42);
  --ed-zero8-stroke: rgba(24, 23, 21, 0.22);
  --ed-feature-hover-bg: rgba(24, 23, 21, 0.035);
  --ed-watermark-color: rgba(24, 23, 21, 0.08);
  --ed-btn-hover-fg: #ffffff;
  --ed-serif: 'Noto Serif SC', 'Songti SC', 'STSong', Georgia, 'Times New Roman', serif;
  --ed-mono: var(--font-mono, 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace);
  --ed-grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  position: relative;
  width: 100%;
  min-height: 100dvh;
  background-color: var(--ed-bg);
  background-image: var(--ed-grain);
  color: var(--ed-fg);
  font-family: var(--font-body, system-ui, -apple-system, sans-serif);
  overflow-x: clip;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.dark .cp-ed {
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
  --ed-nav-bg: rgba(10, 10, 10, 0.84);
  --ed-stipple-dot-1: rgba(240, 237, 230, 0.94);
  --ed-stipple-dot-2: rgba(240, 237, 230, 0.42);
  --ed-stipple-grad-start: rgba(240, 237, 230, 0.92);
  --ed-stipple-grad-end: rgba(162, 155, 143, 0.58);
  --ed-outline-stroke: rgba(240, 237, 230, 0.55);
  --ed-compare-stroke: rgba(240, 237, 230, 0.45);
  --ed-zero8-stroke: rgba(240, 237, 230, 0.28);
  --ed-feature-hover-bg: rgba(240, 237, 230, 0.025);
  --ed-watermark-color: rgba(240, 237, 230, 0.08);
  --ed-btn-hover-fg: #0a0a0a;
  --ed-grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E");
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
    radial-gradient(var(--ed-stipple-dot-1) 1px, transparent 1px),
    radial-gradient(var(--ed-stipple-dot-2) 1px, transparent 1px),
    linear-gradient(170deg, var(--ed-stipple-grad-start) 0%, var(--ed-stipple-grad-end) 100%);
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
  background: var(--ed-nav-bg);
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
  gap: 12px;
}

.cp-ed [data-slot="theme_toggle"]:empty {
  display: none;
}

.cp-ed [data-slot="theme_toggle"] .theme-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 0 !important;
  border: 1px dashed var(--ed-line) !important;
  background: transparent !important;
  color: var(--ed-muted) !important;
  transition: color 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
}

.cp-ed [data-slot="theme_toggle"] .theme-toggle-btn:hover {
  color: var(--ed-fg) !important;
  border-color: var(--ed-gold) !important;
  background: var(--ed-feature-hover-bg) !important;
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
  color: var(--ed-btn-hover-fg);
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

/* Profiles slot theme overrides (match editorial sharp-corner style in light & dark modes) */
.cp-ed-profiles-wrap {
  --surface: #ffffff;
  --elevated-card: #efebe2;
  --inset: #f4f0e8;
  --hover: #eae5da;
  --accent: #181715;
  --accent-fg: #f7f4ee;
  --fg: #181715;
  --fg-muted: #5c5850;
  --fg-subtle: #7c776d;
  --line: rgba(24, 23, 21, 0.16);
  --line-strong: rgba(154, 116, 40, 0.55);
}

.dark .cp-ed-profiles-wrap {
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
  -webkit-text-stroke: 1px var(--ed-outline-stroke);
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
  -webkit-text-stroke: 1px var(--ed-compare-stroke);
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
  -webkit-text-stroke: 1px var(--ed-zero8-stroke);
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
  background-color: var(--ed-feature-hover-bg);
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
  color: var(--ed-btn-hover-fg) !important;
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
  color: var(--ed-watermark-color);
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

export const CUSTOM_PAGE_TEMPLATES = [editorialZineTemplate];
