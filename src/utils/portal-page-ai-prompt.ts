export function buildPortalCustomPageAiPrompt(locale = 'zh-CN'): string {
  const isZh = (locale || 'zh-CN').toLowerCase().startsWith('zh');

  if (isZh) {
    return `请帮我为 MiSub「自定义订阅门户页」生成一份完整、可直接使用的 HTML + CSS 源码。

### 1. 输出格式要求
- 请输出 **单个完整的 HTML 文件**（包含 \`<!DOCTYPE html>\`、\`<style>...</style>\` 和 \`<body>...</body>\`），方便直接通过「导入 .html」上传或粘贴使用（MiSub 会自动拆分 \`<style>\` 与页面主体结构）。

### 2. 支持的订阅门户占位符
**交互组件占位符**（会被挂载为真实的 Vue 门户组件）：
- \`{{overview}}\`：订阅概览卡片（订阅名、公告、总剩余流量进度条、过期时间、可用节点数）
- \`{{quick_import}}\`：快捷接入区（复制订阅链接、二维码、Clash Verge / Mihomo / Shadowrocket 一键导入）
- \`{{multi_socks}}\`：多端口 SOCKS5 映射表（未开启多端口时内部为空，可配合 \`.section:has([data-slot="multi_socks"]:empty) { display: none; }\` 自动隐藏）
- \`{{theme_toggle}}\`：浅色 / 深色主题切换按钮（渲染为 \`.theme-toggle-btn\`）

**纯文本数据占位符**（自动 HTML 转义）：
- \`{{title}}\`：门户标题
- \`{{sub_name}}\`：订阅组名称
- \`{{notice}}\`：门户公告文本
- \`{{remaining_traffic}}\` / \`{{used_traffic}}\` / \`{{total_traffic}}\` / \`{{remaining_percent}}\`：流量文本与百分比
- \`{{expire_time}}\` / \`{{expire_status}}\`：到期时间与状态
- \`{{node_count}}\`：当前可用节点数
- \`{{subscription_url}}\`：当前订阅链接
- \`{{socks_port_count}}\` / \`{{socks_listen}}\`：SOCKS5 映射端口数量与监听地址
- \`{{version}}\`：当前 MiSub 版本号

### 3. 内置 CSS 变量与安全规范（DOMPurify）
- 浅色变量定义在 \`:root\`，深色模式通过 \`html.dark\` 生效，常用变量：\`--canvas\`、\`--surface\`、\`--inset\`、\`--fg\`、\`--fg-muted\`、\`--line\`、\`--accent\`、\`--accent-fg\`、\`--font-mono\`。
- **严禁** \`<script>\` 标签、内联事件属性（\`onclick\` 等）、HTML 行内 \`style="..."\` 属性及外链样式表（会被 DOMPurify 清理）。
- 请使用统一类名前缀（如 \`.mp-custom-\`）隔离样式，并兼容桌面与移动端（390px）。`;
  }

  return `Please generate a complete, self-contained HTML + CSS template for my MiSub Custom Subscription Portal Page.

### 1. Output Format
- Return **one complete HTML document** (\`<!DOCTYPE html>\`, \`<style>...</style>\`, \`<body>...</body>\`) so it can be imported via "Import .html".

### 2. Supported Portal Placeholders
**Interactive Component Placeholders** (mounted with real Vue portal components):
- \`{{overview}}\`: Subscription overview card (name, notice, traffic progress bar, expiration, available nodes)
- \`{{quick_import}}\`: Quick import card (subscription URL copy, QR code, Clash Verge / Mihomo / Shadowrocket deep links)
- \`{{multi_socks}}\`: Multi-port SOCKS5 mapping table (empty when multi-port is disabled; hide wrapper with \`.section:has([data-slot="multi_socks"]:empty) { display: none; }\`)
- \`{{theme_toggle}}\`: Light/dark theme toggle button (\`.theme-toggle-btn\`)

**Plain-Text Data Placeholders** (automatically escaped):
- \`{{title}}\`, \`{{sub_name}}\`, \`{{notice}}\`, \`{{remaining_traffic}}\`, \`{{used_traffic}}\`, \`{{total_traffic}}\`, \`{{remaining_percent}}\`, \`{{expire_time}}\`, \`{{expire_status}}\`, \`{{node_count}}\`, \`{{subscription_url}}\`, \`{{socks_port_count}}\`, \`{{socks_listen}}\`, \`{{version}}\`

### 3. CSS Variables & Strict DOMPurify Rules
- Light tokens live on \`:root\`, dark mode on \`html.dark\` (\`--canvas\`, \`--surface\`, \`--inset\`, \`--fg\`, \`--fg-muted\`, \`--line\`, \`--accent\`, \`--accent-fg\`, \`--font-mono\`).
- **NO** \`<script>\` tags, inline event handlers, inline \`style="..."\` attributes, or external stylesheets (stripped by DOMPurify).
- Scope all CSS selectors under a unique class prefix (e.g. \`.mp-custom-\`) and support desktop + 390px mobile viewports.`;
}
