---
title: 快速开始与部署
description: MiSub 项目简介、核心特性、Cloudflare Pages / Workers + D1 部署步骤（含 wrangler.jsonc 绑定与必填 Secrets 说明）及本地开发指南。
---

# 快速开始与部署

## 项目简介与核心特性

MiSub 是一个面向个人与小团队的轻量级代理订阅管理与转换面板，基于 `pnpm` Monorepo 架构构建，原生运行于 **Cloudflare Workers**（Static Assets + Cron Triggers）与 **Cloudflare Pages Functions**，并以 **Cloudflare D1** 作为唯一主存储。

### 核心能力

- **订阅与节点分离管理**：上游机场订阅与手动节点独立存储，支持备注、自定义 User-Agent、按标签筛选、拖拽排序及流量/到期信息统计。
- **订阅组（Profiles）与嵌套组合**：将多个上游订阅、手动节点乃至其他订阅组（`subProfiles`）自由组合，生成按场景隔离的专属订阅地址。
- **流式算子链（Operator Chain）**：提供 `filter`、`rename`、`script`（声明式安全 DSL）、`sort`、`dedup` 五类可编排算子，支持订阅级与订阅组级覆盖。
- **多协议解析与统一中间表示（`NodeIR`）**：`NodeIRProtocolSchema` 原生支持 `ss`、`ssr`、`vmess`、`vless`、`trojan`、`hysteria`、`hysteria2`、`tuic`、`anytls`、`snell`（v1–v5）、`socks5`、`http`、`https`、`wireguard`、`naive+https`、`naive+quic`、`naive+http`、`mierus` 等协议。
- **多客户端适配与懒加载输出**：内置 **Clash / Mihomo**、**Sing-Box**、**Surge**、**Loon**、**Quantumult X**、**Egern**、**Shadowrocket** 七套按需动态加载（`await import(...)`）的 `ClientAdapter`，并支持 `base64` 与 `nodes` 明文导出及第三方 subconverter 后端内联模式。
- **安全边界与公开伪装**：后台会话基于 HMAC-SHA256 签名（fail-closed）；未开启公开页时根路径返回伪装页；支持拦截浏览器直连订阅链接；自定义公开 HTML 经 DOMPurify 净化。
- **纯 D1 八表行级存储**：通过 `schema.sql` 定义的 8 张表读写数据，结合内存 Map 与 Cloudflare Cache API 多级缓存，避免 KV 每日写入配额限制。

---

## 部署架构说明（Pages + D1 与 Workers）

MiSub 同时支持 **Cloudflare Workers（Static Assets，推荐）** 与 **Cloudflare Pages + D1**：

> [!NOTE]
> 本仓库使用的是 Cloudflare 的 **`wrangler.jsonc`**（JSON with Comments 格式），功能与传统 `wrangler.toml` 完全等价。如需在 Pages 之外使用 Workers 原生定时触发器（Cron Triggers）与静态资产托管，直接使用 `wrangler.jsonc` 即可。

仓库根目录 `wrangler.jsonc` 的核心绑定结构如下：

```jsonc
{
  "name": "misub",
  "main": "worker.ts",
  "compatibility_date": "2025-11-01",
  "compatibility_flags": ["nodejs_compat"],
  "placement": { "mode": "smart" },
  "build": { "command": "npm run build" },
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "run_worker_first": true,
    "not_found_handling": "none"
  },
  "triggers": {
    "crons": ["0 */6 * * *", "0 2 * * *", "30 3 * * *"]
  },
  "d1_databases": [
    {
      "binding": "MISUB_DB",
      "database_name": "misub",
      "database_id": "<替换为你的 D1 database_id>"
    }
  ]
}
```

如果使用 TOML 格式维护私有部署配置，等价的 `wrangler.toml` 关键字段如下：

```toml
name = "misub"
main = "worker.ts"
compatibility_date = "2025-11-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./dist"
binding = "ASSETS"
run_worker_first = true
not_found_handling = "none"

[[d1_databases]]
binding = "MISUB_DB"
database_name = "misub"
database_id = "<替换为你的 D1 database_id>"
```

---

## 一键部署到 Cloudflare Pages + D1

### 1. Fork 仓库并创建 D1 数据库

1. 将仓库 Fork 至你的 GitHub 账号，并克隆到本地（或在 Cloudflare 控制台执行）。
2. 创建 D1 数据库并初始化表结构（`schema.sql`）：

```bash
npx wrangler d1 create misub
npx wrangler d1 execute misub --file=schema.sql --remote
```

`schema.sql` 会在 `MISUB_DB` 中初始化以下 8 张表及索引：

| 表名 | 用途 |
| :--- | :--- |
| `subscriptions` | 机场订阅配置、流量/节点元信息及订阅级算子 |
| `nodes` | 手动节点条目、标签、备注与排序索引 |
| `profiles` | 订阅组（`custom_id` / `link_id` / 组合引用 / 下载计数） |
| `guestbook` | 公开页访客留言数据 |
| `settings` | 全局系统设置（`main`、客户端、公开链接、规则模板等） |
| `cache` | 节点聚合缓存、分布式锁与频率限制计数器 |
| `access_logs` | 订阅拉取访问日志 |
| `error_reports` | 前端错误上报记录 |

> [!WARNING]
> 若未绑定 `MISUB_DB`，MiSub 会自动回退到只读空适配器（`noop-adapter.ts`），后台修改**不会持久化**。若 CLI 执行 `schema.sql` 失败，可在 Cloudflare Dashboard 的 D1 Console 中粘贴 `schema.sql` 全文手动执行。

### 2. 创建 Cloudflare Pages 项目并绑定 `MISUB_DB`

1. 登录 Cloudflare Dashboard，进入 **Workers & Pages** → **创建应用程序** → **Pages** → **连接到 Git**，选择你 Fork 的仓库。
2. 填写构建配置：
   - **框架预设**：`Vue`
   - **构建命令**：`npm run build`
   - **构建输出目录**：`dist`
3. 首次部署完成后，进入 Pages 项目的 **设置** → **绑定（或 函数 → D1 数据库绑定）**：
   - **变量名称**：`MISUB_DB`
   - **D1 数据库**：选择上一步创建的 `misub` 数据库。

> [!TIP]
> 若选择 **Cloudflare Workers** 部署，请先将 `wrangler.jsonc` 中 `d1_databases`（以及 `previews.d1_databases`）的 `database_id` 替换为你自己的数据库 ID，再执行 `pnpm deploy:worker` 或在 Dashboard 中关联 Git 自动部署。Workers 模式会自动启用 `triggers.crons`（每 6 小时同步订阅、每日 UTC `02:00` WebDAV 备份、每日 UTC `03:30` 存储清理）。

### 3. 配置必填 Secrets 与环境变量

所有敏感凭据必须以 **Secret（加密密钥）** 形式注入，切勿以明文写在 `wrangler.jsonc` 或提交至 Git 仓库。

> [!IMPORTANT]
> 使用 `wrangler deploy` 或 Git 自动部署时，如果 `wrangler.jsonc` 配置了 `vars` 且未设置 `"keep_vars": true`，Dashboard 中手动添加的**普通文本（Text）变量**会在部署时被覆盖清空；而 **Secret** 类型不受影响。

#### 环境变量与 Secrets 清单

| 变量名 | 类型要求 | 是否必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `ADMIN_PASSWORD` | **Secret** | **必填** | 后台管理员登录密码。系统采用 fail-closed 策略，未配置时拒绝登录；轮换该密码会立即使所有旧会话失效。 |
| `COOKIE_SECRET` | **Secret** | 推荐 | 会话 Cookie HMAC-SHA256 签名密钥（不写入 D1）。未配置时基于 `ADMIN_PASSWORD` 稳定派生；修改后会立即吊销全部旧会话。 |
| `CRON_SECRET` | **Secret** | 可选 | 外部调用 `/cron/*` 接口时的鉴权密钥；也可在管理后台「自动任务配置」中设置（D1 中的设置优先）。 |
| `GITHUB_TOKEN` | **Secret** | 可选 | 只读 GitHub Token，用于提升版本检查与客户端版本号拉取的 GitHub API 速率上限。 |
| `TURNSTILE_SITE_KEY` | Secret / Text | 可选 | Cloudflare Turnstile Site Key（也可在管理后台配置）。 |
| `TURNSTILE_SECRET_KEY` | **Secret** | 可选 | Cloudflare Turnstile Secret Key（也可在管理后台配置）。 |
| `DISABLE_LOGIN_TURNSTILE` | Text | 可选 | 设为 `true` 时紧急跳过登录页 Turnstile 验证，防止误配置锁死后台。 |
| `CORS_ORIGINS` | Text | 可选 | 逗号分隔的跨域白名单（同域部署无需填写）。 |
| `MISUB_PUBLIC_URL` | Text | 可选 | 对外公开站点域名，用于生成回调与分享链接基础地址。 |
| `MISUB_CALLBACK_URL` | Text | 可选 | 订阅转换回调基础地址（优先级高于 `MISUB_PUBLIC_URL`）。 |
| `VITE_ERROR_REPORT_URL` | 构建变量 | 可选 | 前端错误上报接口地址（如 `/api/system/error_report`），不需要可留空。 |

使用 Wrangler CLI 注入 Secrets 示例：

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put COOKIE_SECRET
npx wrangler secret put CRON_SECRET
```

Pages 用户也可在 **设置** → **环境变量（生产环境）** 中添加以上变量（类型选择 **Secret**），完成后在 **部署** 页面触发一次重新部署使绑定与环境变量生效。

---

## 首次登录与本地开发

### 首次登录后台

1. 默认情况下公开主页开关或伪装策略可能屏蔽根路径，请直接访问 `https://<你的域名>/login` 进入管理后台登录页。
2. 输入配置的 `ADMIN_PASSWORD` 登录。
3. 在 **基础设置** 中配置 `myToken`（全量订阅 Token）与 `profileToken`（订阅路径前缀，默认 `sub`），即可开始添加机场订阅、手动节点和订阅组。

### 本地联调开发

```bash
# 1. 安装全仓 Workspace 依赖
pnpm install

# 2. 初始化本地 D1 表结构
npx wrangler d1 execute misub --file=schema.sql --local

# 3. 在仓库根目录创建 .dev.vars 并写入本地管理员密码
# ADMIN_PASSWORD=dev-password-123

# 4. 终端 1：启动本地 Worker + D1（默认监听 8787 端口）
pnpm dev:worker

# 5. 终端 2：启动 Vite 前端开发服务器（自动将 /api 与 /sub/ 代理到 127.0.0.1:8787）
pnpm dev
```
