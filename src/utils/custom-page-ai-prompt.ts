export function buildCustomPageAiPrompt(locale = 'zh-CN'): string {
  const isZh = (locale || 'zh-CN').toLowerCase().startsWith('zh');

  if (isZh) {
    return `请帮我为 MiSub「自定义公开页」生成一份完整、可直接使用的 HTML + CSS 源码。

### 1. 输出格式要求
- 请输出 **单个完整的 HTML 文件**（包含 \`<!DOCTYPE html>\`、\`<style>...</style>\` 和 \`<body>...</body>\`），方便我直接通过「导入 .html」上传或粘贴使用（MiSub 会自动拆分提取 \`<style>\` 与页面主体结构）。

### 2. 支持的内置占位符（必须按需嵌入）
**组件类占位符**（会被渲染为 \`<div data-slot="占位符名"></div>\` 并挂载真实交互组件）：
- \`{{profiles}}\`：公开订阅组卡片网格（建议外层包裹容器，可用 \`.your-profiles-wrap\` 覆写卡片 CSS 变量）
- \`{{announcements}}\`：系统公告卡片（无公告时内部为空，建议配合 \`.section:has([data-slot="announcements"]:empty) { display: none; }\` 自动隐藏）
- \`{{hero}}\`：系统默认巨幕标题区域
- \`{{guestbook}}\`：留言板触发按钮（禁用时内部为空，可配合 \`:has([data-slot="guestbook"]:empty)\` 隐藏）
- \`{{theme_toggle}}\`：浅色 / 深色主题切换按钮（渲染为 \`.theme-toggle-btn\`）

**数据类占位符**（会被自动转义并替换为文本）：
- \`{{title}}\`：站点主标题
- \`{{description}}\`：站点简介描述
- \`{{profile_count}}\`：公开订阅组数量
- \`{{node_count}}\`：公开节点总数
- \`{{version}}\`：当前 MiSub 应用版本号

### 3. 内置 CSS 变量与暗黑模式约定
- 浅色主题在 \`:root\`、深色主题在 \`html.dark\` 下生效。
- 内置组件使用的核心语义化 CSS 变量：
  - 背景层级：\`--canvas\`（画布背景）、\`--surface\`（卡片表面）、\`--elevated\`、\`--elevated-card\`、\`--inset\`（输入框/内嵌区）、\`--active\`、\`--hover\`
  - 主色与强调：\`--accent\`、\`--accent-fg\`、\`--color-primary\`、\`--color-primary-500\`、\`--color-primary-600\`
  - 文字颜色：\`--fg\`（主文本）、\`--fg-muted\`（次要文本）、\`--fg-subtle\`（弱化文本）
  - 边框与圆角：\`--line\`、\`--line-strong\`、\`--line-subtle\`、\`--misub-radius-md\`、\`--shadow-card\`
  - 字体变量：\`--font-display\`、\`--font-body\`、\`--font-mono\`
- 如需定制 \`{{profiles}}\` 内卡片配色，请在 \`{{profiles}}\` 的父容器上覆写上述变量（例如 \`--surface\`、\`--fg\`、\`--line\`、\`--accent\`、\`--accent-fg\`），并可针对 \`[data-slot="profiles"] .rounded-md\` 等调整圆角或边框。

### 4. 安全清洗规范（DOMPurify 严格限制，务必遵守）
- **严禁**任何 \`<script>\` 标签或 \`onclick\` / \`onload\` / \`onerror\` 等内联事件属性（会被直接清除）。
- **严禁**在 HTML 标签上写内联 \`style="..."\` 属性（会被直接清除，所有样式必须写在 \`<style>\` 中用 class 控制）。
- **严禁**外链 \`<link rel="stylesheet">\`、外部 CDN 字体或 CSS \`@import\`（外链样式会被安全禁用）。
- **严禁**使用 \`<object>\`、\`<embed>\` 标签。
- 请使用统一的类名前缀（例如 \`.cp-custom-\`）隔离样式，避免使用全局 \`* { ... }\` 覆盖外部容器布局。
- 确保响应式适配桌面端与移动端（390px 宽度）。

### 5. [你的定制需求]
- 风格偏好：（例如：极简科技风 / 赛博终端 / 玻璃拟态 / 瑞士网格排版）
- 配色倾向：（例如：深色模式为主 / 跟随系统浅深色切换）
- 页面区块需求：（例如：顶部导航 + Hero 统计 + 公告 + 订阅组 + 接入步骤 + 留言板 + 页脚）`;
  }

  return `Please generate a complete, ready-to-use HTML + CSS source file for my MiSub Custom Public Page.

### 1. Output Format
- Return **a single self-contained HTML document** (with \`<!DOCTYPE html>\`, \`<style>...</style>\`, and \`<body>...</body>\`) so I can upload it directly via "Import .html" or paste it (MiSub automatically splits \`<style>\` and body structure).

### 2. Supported Built-in Placeholders
**Component placeholders** (rendered as \`<div data-slot="..."></div>\` with interactive UI mounted inside):
- \`{{profiles}}\`: Public profile cards grid (wrap in a parent container to override card CSS variables if needed)
- \`{{announcements}}\`: System announcement card (empty when disabled; hide wrapper with \`.section:has([data-slot="announcements"]:empty) { display: none; }\`)
- \`{{hero}}\`: Default hero section
- \`{{guestbook}}\`: Guestbook trigger button (empty when disabled; hide with \`:has([data-slot="guestbook"]:empty)\`)
- \`{{theme_toggle}}\`: Light/dark theme toggle button (rendered as \`.theme-toggle-btn\`)

**Data placeholders** (escaped and replaced with plain text):
- \`{{title}}\`: Configured site title
- \`{{description}}\`: Configured site description
- \`{{profile_count}}\`: Total public profiles
- \`{{node_count}}\`: Total public nodes
- \`{{version}}\`: Current MiSub version

### 3. Built-in CSS Variables & Theme Convention
- Light mode tokens live on \`:root\` and dark mode tokens live on \`html.dark\`.
- Core semantic CSS variables used by built-in components:
  - Surfaces: \`--canvas\`, \`--surface\`, \`--elevated\`, \`--elevated-card\`, \`--inset\`, \`--active\`, \`--hover\`
  - Accent & Brand: \`--accent\`, \`--accent-fg\`, \`--color-primary\`, \`--color-primary-500\`, \`--color-primary-600\`
  - Typography colors: \`--fg\`, \`--fg-muted\`, \`--fg-subtle\`
  - Borders & Radius: \`--line\`, \`--line-strong\`, \`--line-subtle\`, \`--misub-radius-md\`, \`--shadow-card\`
  - Fonts: \`--font-display\`, \`--font-body\`, \`--font-mono\`
- To theme cards inside \`{{profiles}}\`, override those CSS variables on a parent wrapper around \`{{profiles}}\` and optionally target \`[data-slot="profiles"] .rounded-md\`.

### 4. Security Sanitization Rules (Strict DOMPurify Policy)
- **NO** \`<script>\` tags or inline event handlers (\`onclick\`, \`onload\`, \`onerror\`, etc.) — they are stripped.
- **NO** inline \`style="..."\` attributes on HTML elements — they are stripped; put all styles inside \`<style>\` using classes.
- **NO** external \`<link rel="stylesheet">\`, external font links, or CSS \`@import\` rules — external stylesheets are disabled.
- **NO** \`<object>\` or \`<embed>\` tags.
- Scope all selectors under a unique class prefix (e.g. \`.cp-custom-\`) and avoid global \`*\` resets.
- Ensure clean responsiveness on both desktop and mobile (390px width).

### 5. [Your Customization Requirements]
- Visual style: (e.g., Minimalist SaaS / Terminal / Swiss Editorial / Bento Grid)
- Theme preference: (e.g., Dark-first / Adaptive light & dark)
- Desired sections: (e.g., Sticky nav + Hero stats + Announcements + Profiles + Setup steps + Guestbook + Footer)`;
}
