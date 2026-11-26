---
title: 常见问题与排错指南
description: 基于 MiSub 存储、缓存、防刷限流与客户端识别源码整理的常见故障排查方法，涵盖 D1 未绑定导致配置还原、节点缓存回退与 429 限流、客户端格式识别差异及登录解锁。
---

# 常见问题与排错指南

以下排错项均直接对应 MiSub 运行时源码逻辑，可按症状快速定位并修复。

---

## 1. 配置保存后刷新页面还原 / 数据未持久化

### 典型现象
- 在后台新增订阅、修改设置或新建订阅组点击保存后提示成功，但刷新页面或重新登录后数据消失。

### 根因定位（`functions/storage-adapter.ts`）
- MiSub 已全面使用纯 **Cloudflare D1（`MISUB_DB`）** 八表存储。当运行环境中未绑定 `MISUB_DB` 时，`StorageFactory.createAdapter(env)` 会静默回退至只读空适配器 **`NoopStorageAdapter`**，所有写入不会持久化。
- 若绑定了 D1 但未初始化表结构，读写会因缺表报错。

### 排查与解决
1. **检查绑定名称**：确认 Cloudflare Pages（`设置 → 绑定 / 函数 → D1 数据库绑定`）或 `wrangler.jsonc` 中绑定的变量名精确为 **`MISUB_DB`**（区分大小写）。
2. **检查 `database_id`**：Fork 用户部署 Workers 时，务必将 `wrangler.jsonc` 中的 `database_id` 替换为你自己执行 `npx wrangler d1 create misub` 后获得的 ID。
3. **初始化 8 张表**：运行以下命令确认表结构已创建（若命令行失败，可直接在 Cloudflare D1 Console 粘贴 `schema.sql` 全文执行）：
   ```bash
   npx wrangler d1 execute misub --file=schema.sql --remote
   ```
4. **本地开发**：确保同时执行过 `npx wrangler d1 execute misub --file=schema.sql --local`，并通过 `pnpm dev:worker` 启动带本地 D1 的 Worker。

---

## 2. 上游机场临时故障、节点不更新或返回 `429` 频率限制

### 2.1 为什么机场临时抽风时客户端还能拉到旧节点（或未立即更新）？

MiSub 在 `node-cache-service.ts` 与 `cache-manager.ts` 中设计了多层节点缓存与保护机制：

- **节点缓存生命周期**：
  - `FRESH_TTL`（默认 **3 分钟**）：命中直接返回（`X-Cache: HIT`），不回源；
  - `STALE_TTL`（默认 **1 小时**）：立即返回旧节点（`X-Cache: REFRESHING`），同时以 10 秒防抖异步触发后台刷新；
  - `MAX_AGE`（默认 **12 小时**）：超过 12 小时或首次请求为 `miss` 态，通过 Single-Flight 合并请求同步回源。
- **保护性缓存回退（`isSuspiciousNodeCountDrop` / `isLikelyPartialAggregateNodeList`）**：
  - 当历史健康缓存节点数 `>= 10` 且本次刷新节点数骤降至原数量的 **`30%`** 以下，或检测到疑似截断的结果（仅含流量虚拟节点与少数 UUID 名称节点）时，系统会**拒绝覆盖现有缓存**并继续提供历史可用节点。

### 2.2 为什么客户端拉取订阅收到 `429 Too Many Requests`？

检查后台「订阅拉取保护」设置（`fetch-guard.ts`）：

| 模式（`subFetchLimitMode`） | 行为说明 | 建议 |
| :--- | :--- | :--- |
| `cache`（默认） | 在 `subFetchMinInterval`（默认 15 分钟）内通过 Cloudflare Edge Cache 直接复用已生成订阅，不回源也不报错 | 推荐日常保持此模式 |
| `strict` | 同一订阅 + 同一客户端 IP 在最小间隔内再次拉取直接返回 **`429`**（带 `Retry-After` 与 `X-MiSub-Rate-Limit: strict`） | 如客户端频繁自动更新导致 429，可调小 `subFetchMinInterval` 或切回 `cache` 模式 |

> [!NOTE]
> 如果是公开页匿名预览接口 `POST /api/public/preview` 返回 `429`（响应头 `X-MiSub-Rate-Limit: public-preview`），则表示触发了单 IP 每 **60 秒最多 20 次** 的防刷限流，等待 `Retry-After` 秒数后重试即可（60s 内同一订阅组的多次请求已由边缘缓存吸收）。

### 2.3 强制刷新与绕过缓存技巧

当你在后台刚调整了订阅或想要立即排查上游抓取状态时，可在订阅链接末尾附加以下查询参数：

```text
https://your-domain.example/sub/your-token?refresh=1
```

- `?refresh=1`（或 `?nocache=1`、`?debug=1`）会**同时绕过 `fetch-guard` 边缘缓存与 `node_cache_` 节点缓存**，强制重新请求所有上游订阅源并刷新缓存。
- 若仍抓取失败，请检查该机场订阅的 `customUserAgent`（部分机场屏蔽默认 UA）或为其配置 `fetchProxy` 抓取代理。

---

## 3. 客户端格式识别差异与 `?target=` 显式指定技巧

`functions/modules/subscription/core/user-agent-utils.ts` 会根据客户端的 `User-Agent` 自动判断输出格式，但部分客户端的默认 UA 存在特殊性：

| 客户端 | 默认自动识别结果 | 常见疑惑与处理方法 |
| :--- | :--- | :--- |
| **Hiddify** | `singbox`（强制走内置引擎） | Hiddify 的 UA 中同时包含 ClashMeta 与 sing-box，MiSub 优先适配其原生 sing-box JSON。如果你希望 Hiddify 导入 Clash YAML，请在订阅链接末尾显式加上 **`?target=clash`**。 |
| **Shadowrocket（小火箭）** | `base64` | 小火箭默认请求识别为自适应 `base64` 节点列表。如果需要 MiSub 下发完整带规则分流的 Shadowrocket 配置文件，请显式加上 **`?target=shadowrocket`** 或 **`?client=shadowrocket`**。 |
| **Clash Verge / Mihomo / FlClash / Stash / Nekobox** | `clash`（且启用 `isMetaCore`） | 自动识别为 Meta 核心并启用 `dialer-proxy` 等特性；若使用第三方或魔改客户端导致未触发 Meta 语法，可显式加上 **`?target=clash&meta=true`**。 |
| **Surge** | `surge&ver=4`（iOS 默认 4） | 需要输出 Surge 5 语法时，显式加上 **`?target=surge&ver=5`**。 |
| **Loon / Quantumult X / Egern** | `loon` / `quanx` / `egern` | 可通过 `?target=loon`、`?target=quanx`、`?target=egern` 强制指定，或导出纯节点列表 `?target=nodes`。 |

---

## 4. 登录失败、会话失效与 Turnstile 锁死排查

1. **提示未配置管理员密码或无法登录**：
   - 检查是否在 Cloudflare 环境变量中以 **`Secret`** 类型配置了 `ADMIN_PASSWORD`（未配置时 fail-closed 拒绝登录）。
   - 如果此前只添加了普通文本（Text）变量且未在 `wrangler.jsonc` 开启 `"keep_vars": true`，重新部署时文本变量会被覆盖清空，请改用 `Secret` 类型（`npx wrangler secret put ADMIN_PASSWORD`）。
2. **连续输错密码被锁定**：
   - `/api/login` 同一 IP 在 15 分钟内连续失败 **5 次** 会返回 `LOGIN_RATE_LIMITED` 并锁定 **15 分钟**，请等待冷却时间结束。
3. **修改密码后所有设备掉登录**：
   - `getSessionSigningSecret` 直接基于 `ADMIN_PASSWORD` 与 `COOKIE_SECRET` 派生会话签名密钥，修改其中任意一个都会立即吊销所有历史登录会话，属于预期安全行为。
4. **后台 Turnstile 密钥填错导致无法登录**：
   - 在 Cloudflare 环境变量中添加 `DISABLE_LOGIN_TURNSTILE=true`，触发重新部署后即可暂时跳过登录页 Turnstile 校验进入后台修改密钥（修复后记得删除该变量）。
5. **浏览器直接访问订阅链接显示 404 或跳转其它网站**：
   - 检查后台是否关闭了「允许浏览器打开订阅链接（`allowBrowserSubAccess: false`）」。关闭后系统仅允许代理客户端 UA 拉取订阅，浏览器直连会返回伪装页响应，属于正常防探测行为。
