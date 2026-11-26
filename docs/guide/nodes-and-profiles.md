---
title: 节点、订阅与订阅组管理
description: 机场订阅添加、批量导入与刷新，手动节点解析、标签/属性筛选、拖拽排序、智能去重与节点探测/TCPing，以及订阅组自定义短路径、嵌套引用与单订阅覆盖机制。
---

# 节点、订阅与订阅组管理

MiSub 将资源划分为**机场订阅（Subscriptions）**、**手动节点（Manual Nodes）**与**订阅组（Profiles）**三层，对应前端 `SubscriptionPanel.vue`、`ManualNodePanel.vue` 与 `ProfilePanel.vue`。

---

## 1. 机场订阅管理（`SubscriptionPanel` / `Card`）

### 1.1 添加与批量导入

- **统一导入入口**：在订阅面板与节点面板均通过 `src/components/modals/ImportModal.vue`（`mode: 'subscriptions' | 'bulk'`）完成批量录入，自动识别 `http://` / `https://` 订阅地址。
- **机场名称自动识别**：添加或编辑订阅 URL 时，可触发 `POST /api/detect_airport_name` 抓取机场根域名站点标题作为默认名称。
- **核心配置字段**（定义于 `SubscriptionSchema`）：

| 字段 | 作用说明 |
| :--- | :--- |
| `name` / `url` | 订阅显示名称与远程 `http(s)://` 订阅链接 |
| `enabled` / `autoUpdate` | 是否启用该订阅；以及是否参与后台/定时自动刷新 |
| `customUserAgent` | 为当前订阅覆盖独立的请求 `User-Agent`（绕过部分机场 UA 限制） |
| `fetchProxy` | 抓取代理转发地址，用于边缘节点直连受限的机场源站 |
| `plusAsSpace` | 将节点名称中的 `+` 号解析为空格 |
| `tags` / `notes` | 分组标签数组与备注信息（可在卡片展示官网、价格、续费备忘等） |
| `disabledNodes` | 在订阅预览弹窗中按单个订阅粒度的禁用节点清单 |
| `enableNodeCache` | 开启保护性节点缓存，当上游临时故障时回退最近一次可用节点 |

### 1.2 日常管理与批量操作

- **筛选与搜索**：支持顶部标签筛选栏（`TagFilterBar`）、状态筛选与关键词搜索，并可切换每页数量（`itemsPerPage`）。
- **多选批量操作**：进入多选模式后，支持批量修改标签与批量删除。
- **拖拽排序**：开启排序模式后，基于 `vuedraggable` 直接拖拽调整订阅卡片顺序（自动标记 `dirty` 待保存）。
- **节点预览与二维码**：单张卡片可直接查看当前订阅解析出的节点预览与订阅二维码。

### 1.3 手动刷新与定时同步流量

- **单条刷新**：触发 `POST /api/node_count` 即时拉取订阅内容与 `Subscription-Userinfo` 响应头，更新节点数量（`nodeCount`）与已用/总流量、到期时间（`userInfo`）。单源超时为 **`15000ms`**。
- **一键全量刷新**：点击「全部刷新」调用 `POST /api/batch_update_nodes`，后端使用 `BATCH_UPDATE_CONCURRENCY = 4` 控制并发并受保护性降级检测约束（避免上游异常返回少量节点时覆盖历史可用计数）。
- **定时自动同步**：通过 Workers 原生 Cron（`0 */6 * * *`）或外部 `/cron/subscriptions` 仅同步开启了 `autoUpdate` 且 `enabled: true` 的远程订阅，并在触发阈值时推送 Telegram 预警。

---

## 2. 手动节点管理（`ManualNodePanel` / `ManualNodeCard` / `NodeTable`）

### 2.1 导入与协议解析

通过 `ImportModal.vue`（`mode: 'nodes'`）支持粘贴多行节点链接或导入文本/订阅文件，底层调用 `@misub/core` 解析节点协议（SS / SS2022、VMess、VLESS、Trojan、Hysteria / Hysteria2、TUIC、Snell、WireGuard、AnyTLS、HTTPS、SOCKS5 等）并提取地区、倍率、标签与纯净名称元数据。

卡片视图（`ManualNodeCard.vue`）与列表视图（`NodeTable.vue`）均会在节点上展示协议与客户端兼容性徽章（`NodeClientBadges.vue`）。

### 2.2 筛选、排序与智能去重

- **多维筛选**：
  - **标签筛选**：支持多标签交/并筛选与标签管理；
  - **属性筛选**（`attrFilters`）：按 `protocol`（协议类型）、`country`（国家/地区）与 `network`（传输网络，如 `ws` / `grpc` / `tcp`）快捷过滤；
  - **关键词搜索**：即时过滤节点名称与链接。
- **排序与去重**：
  - **拖拽排序**：支持手动拖拽调整节点顺序；
  - **一键按地区排序**（`autoSort`）：按内置地区优先级自动归整节点顺序；
  - **按延迟排序**（`sort-by-latency`）：结合测速结果按延迟升序排列；
  - **一键去重**（`deduplicate`）：清理重复手动节点条目。

### 2.3 节点详情、归属探测与服务端 TCPing

- **节点详情**（`NodeDetailModal.vue`）：查看节点完整解析参数、原始 URI 与探测信息。
- **批量网络信息探测**（`POST /api/nodes/inspect`）：
  - 单次请求最多处理 **`200`** 个节点（`MAX_INSPECT_NODES = 200`）；
  - 通过 DoH 域名解析与 IP 地理库识别节点落地 IP 归属地、ASN 以及 CDN / 中转 / 直连属性。
- **服务端 TCPing 测速**（`POST /api/nodes/tcping`）：
  - 基于 Cloudflare Workers 原生 `cloudflare:sockets` 发起 TCP 握手探测并返回耗时（`status: 'ok' | 'timeout' | 'error'`）；
  - 单次最多探测 **`30`** 个目标（`MAX_TCPING_TARGETS = 30`），默认超时 **`3000ms`**（上限 **`8000ms`**）；
  - 内置安全检查（`isUnsafeTcpingHost`）会自动拒绝 `localhost`、`.local`、`.internal` 及私有/保留 IP 段，防止 SSRF 探测内网端口。

---

## 3. 订阅组管理（`ProfilePanel` / `ProfileCard`）

订阅组用于按不同使用场景（如「日常主力」「流媒体专用」「分享给朋友」）聚合多个上游订阅与手动节点。

### 3.1 创建与核心配置（`ProfileSchema`）

| 配置项 | 说明 |
| :--- | :--- |
| `name` / `description` | 订阅组名称与公开页展示描述 |
| `subscriptions` / `manualNodes` | 引用的远程订阅列表与手动节点 ID 列表 |
| `subProfiles` | 嵌套引用的其他订阅组 ID 列表 |
| `target` | 默认导出格式标识（默认 `clash`） |
| `isPublic` | 是否允许在公开分享页（`/`、`/explore`）展示与匿名拉取 |
| `expiresAt` | 订阅组过期时间；过期后自动下发「您的订阅已到期」提示节点 |
| `downloadCount` | 订阅下载计数（在开启 `enableAccessLog` 且非内部回调请求时异步自增） |
| `prefixSettings` | 手动节点/订阅前缀及是否前置标签名（可覆盖全局 `defaultPrefixSettings`） |
| `operators` / `nodeTransform` | 订阅组专属算子链或预设模板（`nodeTransformPresetId`） |

### 3.2 自定义短路径（`customId`）与短链 ID（`linkId`）

每个订阅组会自动生成唯一的 `linkId`，也可配置易记的自定义短路径 `customId`（通过 `/{subPath}/{customId}` 访问）。

`packages/core/src/domain/profile-alias.ts` 中的 `validateSingleProfileAlias` 对 `customId` 强制执行以下约束：

- **字符集与长度**：仅允许英文字母、数字、连字符和下划线（`^[A-Za-z0-9_-]+$`），最大长度 **`64`** 个字符；
- **全仓唯一**：跨所有订阅组的 `customId`、`linkId` 与 `id` 执行**大小写不敏感**唯一性校验；
- **禁止保留词**：不能使用 `sub`、`profile`、`profiles`、`token`、`default`、`all` 以及系统保留根路径（如 `api`、`login`、`dashboard`、`cron` 等）。

> 若需要作废旧订阅链接，可在编辑订阅组（或通过外部 API `PATCH /api/ext/v1/profiles/:id` 传 `rotateLinkId: true`）轮换 `linkId`。

### 3.3 嵌套订阅组引用（`subProfiles`）

订阅组支持在 `subProfiles` 中引用其他已创建的订阅组，实现模块化分层复用：

- 订阅请求处理时（`main-handler.ts`），系统过滤掉对自身的直接引用（`subProfileId !== profile.id && subProfileId !== profile.customId`）；
- 通过 `Promise.all` 并发调用 `handleProfileMode` 解析嵌套订阅组，并传递 `visited` 集合防止多级循环嵌套导致死循环；
- 解析出的节点自动打上所属子订阅组名称标签并合并至当前订阅组节点池。

### 3.4 订阅组内单订阅独立过滤与算子覆盖

`ProfileSubscriptionRefSchema` 允许 `profile.subscriptions` 数组中的每一项既可以是纯订阅 ID 字符串，也可以是**订阅组级覆盖对象**：

```json
{
  "id": "sub_01j9...",
  "include": "香港|新加坡",
  "exclude": "倍率|过期",
  "operators": [
    {
      "type": "rename",
      "enabled": true,
      "params": {
        "template": {
          "enabled": true,
          "template": "{emoji} 专用-{regionZh}-{index:02}"
        }
      }
    }
  ]
}
```

在 `main-handler.ts` 聚合该订阅组时，系统执行 `{ ...baseSub, ...overrideItem }` 合并——**订阅组内的覆盖配置优先级高于基础订阅自身配置**。你可以用同一个机场订阅源，在「主力组」中保留全量节点，同时在「低倍率组」中独立过滤并重命名，互不干扰。
