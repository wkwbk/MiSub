---
title: 公开分享页、短链与安全防护
description: 公开订阅分享页（PublicProfilesView）与资源导航卡片、自定义 HTML 页面安全渲染、访客留言板、Sink 短链集成以及伪装页、防浏览器直连与 Turnstile 紧急救援指南。
---

# 公开分享页、短链与安全防护

MiSub 提供面向访客的公开订阅分发门户（`/` 与 `/explore`），并在边缘路由层提供严格的访问控制与防探测机制。

---

## 1. 公开订阅分享页（`PublicProfilesView`）

### 1.1 公开总开关（`enablePublicPage`）

- 全局设置 `enablePublicPage` 控制 `/`、`/explore` 与公开 API（`/api/public/profiles`、`/api/public/preview`、`/api/public/guestbook`）的匿名访问权限。
- **关闭 `enablePublicPage` 时**：
  - 未登录访客访问 `/` 或 `/explore` 会立即被 `evaluatePageAccess` 拦截，返回伪装页响应；
  - 公开 API 通过 `enforcePublicApiAccess` 返回 `404 Not Found`；
  - 已登录的管理员会话仍然可以正常预览。

### 1.2 页面区块与资源导航卡片

在开启公开页且使用默认布局时，访客页包含以下可配置模块（对应 `src/components/public/` 与 `src/components/settings/sections/`）：

- **Hero 头部与公告栏**：
  - `hero` 配置自定义主标语（`title1`、`title2`）与简介（`description`）；
  - `AnnouncementSettings.vue` / `AnnouncementCard.vue` 支持配置顶部公告，提供 `info`、`warning`、`success`、`error` 四种样式及是否允许访客关闭（`dismissible`）。
- **公开订阅组卡片（`ProfileGrid` / `ProfileCard` / `QRCodeOverlay`）**：
  - 仅展示同时满足 `enabled: true` 且 `isPublic: true` 的订阅组；
  - 访客可直接点击复制订阅链接、扫描二维码导入，或在后台允许时预览包含的节点分布（受 `/api/public/preview` 60 秒边缘缓存与单 IP 限流保护）。
- **三大导航资源集合**：
  - **推荐客户端**（`ClientSettings.vue` / `PublicClientsSection.vue`）：维护全平台代理客户端推荐卡片与下载地址；
  - **核心资源**（`PublicCoresSettings.vue` / `PublicCoresSection.vue`）：展示 Clash/Sing-Box 等核心组件下载指引；
  - **常用链接**（`PublicLinksSettings.vue` / `PublicLinksSection.vue`）：展示自定义友情链接或使用导航。

### 1.3 自定义公开页 HTML（`CustomPageSettings` / `CustomPublicRenderer`）

在 `CustomPageSettings.vue` 中启用 `customPage.enabled = true` 后，可将公开主页替换为自定义 HTML 或内嵌 iframe，支持三种模式（`customPage.type`）：

1. **`html`（默认）**：渲染自定义 HTML 与 CSS，并支持文本变量与 Vue 组件插槽；
2. **`iframe-srcdoc`**：将净化后的 HTML 作为沙箱 iframe 的 `srcdoc` 渲染；
3. **`iframe-url`**：嵌入指定 `http://` / `https://` 外部页面（支持配置高度、圆角、内边距、阴影与全屏属性）。

#### 可用文本占位符与组件插槽

在 `html` 模式下，可在 HTML 中插入以下双大括号占位符（不区分大小写，由 `CustomPublicRenderer.vue` 替换与 Teleport 挂载）：

- **文本变量**：`{{version}}`、`{{title}}`、`{{description}}`、`{{profile_count}}`、`{{node_count}}`
- **内置组件插槽**：`{{profiles}}`（公开订阅组卡片网格）、`{{announcement}}` / `{{announcements}}`（公告卡片）、`{{hero}}`（Hero 头部）、`{{guestbook}}`（留言板）、`{{theme_toggle}}`（明暗主题切换按钮）

#### 安全净化边界

> [!IMPORTANT]
> 为防范 XSS 与跨站追踪，MiSub 对自定义公开页强制实施以下安全策略：
> - HTML 内容一律经 **DOMPurify** 严格净化，强制禁用 `script`、`object`、`embed`、`link`、`style` 标签以及 `onerror`、`onload`、`onclick`、`onmouseover`、`onfocus`、`style` 等内联属性；
> - `iframe-srcdoc` 与 `iframe-url` 固定施加沙箱属性 `allow-forms allow-popups allow-popups-to-escape-sandbox`；
> - 主页面同源上下文**绝不执行**用户提供的脚本，也不再动态加载用户填写的外部样式表。

---

## 2. 访客留言板与短链服务

### 2.1 访客留言板（`guestbook-handler.ts` / `GuestbookManagement`）

- **配置项**：`guestbook.enabled`（总开关）、`allowAnonymous`（允许匿名留言）、`requireAudit`（开启先审后发）。
- **审核与展示**：`GET /api/public/guestbook` 仅返回 `isVisible === true` 的留言并按时间倒序展示；管理员可在后台 `GuestbookManagement.vue` 审核、回复与删除留言。
- **防护与通知**：提交新留言（`POST /api/public/guestbook`）支持接入 Cloudflare Turnstile 校验（`turnstile.enableForGuestbook`），并支持通过 Telegram Bot 向管理员推送新留言提醒。

### 2.2 短链服务集成（`shortlink-handler.ts` / `ShortLinkCard`）

MiSub 支持对接 **Sink** 短链服务，将较长的订阅或分组链接缩短：

- **配置字段**：`shortLink.enabled`、`provider: 'sink'`、`apiUrl`（Sink 服务域名或 URL，自动补全 `https://`）、`apiToken`。
- **接口能力**：
  - `POST /api/shortlink/test`：测试 Sink API 连通性与鉴权（10s 请求超时保护）；
  - `POST /api/shortlink/create`：为指定的 `http(s)://` 目标链接生成短链，自定义后缀 `slug` 需满足 `^[a-zA-Z0-9_-]{1,64}$`。

---

## 3. 后台安全防护体系

### 3.1 统一访问控制与伪装页（`access-control.ts`）

`evaluatePageAccess` 作为非 API / 非订阅 / 非静态资源页面的单一权限真源，执行以下规则：

1. **自定义登录路径**（`customLoginPath`）：修改默认 `/login` 为自定义路径后，原 `/login` 访问会被立即拦截并展示伪装页；当前生效的自定义登录路径始终放行，避免误锁。
2. **伪装响应策略**（`disguise`）：
   - `pageType: 'default'`：返回不可缓存的干净 `404` 伪装页面；
   - `pageType: 'redirect'`：配置有效 `redirectUrl` 后返回 `302` 重定向至目标站（未填 URL 时回退 404，绝不泄露无效配置）。
3. **后台路由强保护**：`/dashboard` 与 `/dashboard/*` 仅放行通过 `authMiddleware` 校验的管理员会话，未登录统一返回伪装页响应。

### 3.2 禁止浏览器直接访问订阅（`allowBrowserSubAccess`）

- 当开启「禁止浏览器打开订阅链接」（即 `allowBrowserSubAccess: false`）时，`handleMisubRequest` 会调用 `isBrowserAgent(userAgent)` 识别常见桌面/移动端浏览器（如 Chrome、Safari、Edge、Firefox 等，同时排除代理客户端与命令行工具）。
- 检测到浏览器直接访问订阅 URL 且不带内部 `callback_token` 时，直接返回与系统一致的**伪装拦截响应**，有效防止订阅地址在浏览器中暴露真实节点内容。

### 3.3 登录限流与会话机制（`auth-middleware.ts`）

- **登录防爆破**：`/api/login` 基于 D1 实施单 IP 失败计数限流——在 15 分钟窗口（`LOGIN_RATE_LIMIT_WINDOW_MS`）内连续输错密码达到 **`5` 次**（`LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5`），将触发 `LOGIN_RATE_LIMITED` 锁定 **`15 分钟`**；成功登录后立即清除计数。
- **HMAC-SHA256 会话签名**：登录 Cookie（`auth_session`）有效期 **30 天**，距到期不足 **7 天** 时在非登录/非静态资源请求响应阶段自动无感续期。

### 3.4 Cloudflare Turnstile 验证与 `DISABLE_LOGIN_TURNSTILE` 紧急救援

`functions/modules/turnstile.ts` 负责解析与向 `challenges.cloudflare.com/turnstile/v0/siteverify` 校验人机令牌：

- **密钥优先级**：**后台设置（`settings.turnstile`） > 环境变量**（`TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`）。
- **独立开关**：支持分别控制 `enableForGuestbook`（默认开启）与 `enableForLogin`（默认关闭）。
- **紧急救援开关（`DISABLE_LOGIN_TURNSTILE`）**：
  - 若在后台错误填写了 Turnstile `siteKey` 或 `secretKey` 导致无法通过登录页验证、管理员被锁在后台之外，只需在 Cloudflare Dashboard（Pages / Workers 环境变量）中添加：
    ```text
    DISABLE_LOGIN_TURNSTILE = true
    ```
  - 重新部署或等待变量生效后，服务端 `resolveTurnstileConfig` 会立即跳过登录页 Turnstile 校验（`loginDisabledByEnv: true`），登录后台修复密钥后再移除该环境变量即可恢复保护。
