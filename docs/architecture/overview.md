---
title: 整体架构与核心机制
description: MiSub Monorepo 分层架构（@misub/core、functions、src）、Hono 边缘请求管道、按需懒加载 ClientAdapter、统一节点中间表示 NodeIR 与三级缓存机制。
---

# 整体架构与核心机制

## Monorepo 分层架构

MiSub 采用 `pnpm` Monorepo 工作区管理，严格隔离共享领域引擎、边缘后端运行时、SPA 前端与文档站点：

```text
MiSub/
├── packages/core/             # @misub/core — 零外部运行时依赖的共享领域与协议引擎
│   └── src/
│       ├── domain/            # 业务规则（别名、链接规范、保留路径、可视规则目录、默认配置）
│       ├── ir/                # 统一 NodeIR 互转器（url-ir.ts, clash-ir.ts）
│       ├── node/              # 节点解析、清洗、地理/地区元数据、客户端兼容性分析
│       ├── operators/         # 流式算子链（operator-runner, expression-dsl, node-transformer）
│       ├── protocols/         # 各协议解析/序列化（SS/SS2022, VMess, VLESS, Trojan, HY2, TUIC, Snell 等）
│       ├── schemas/           # Zod v4 唯一数据源契约（node-ir.ts, entities.ts, api.ts）
│       └── types.ts           # 由 Zod Schema 自动推导的 TypeScript 类型契约
├── functions/                 # Cloudflare Workers / Pages Functions 边缘运行时（Hono）
│   ├── app.ts                 # 根 Hono 应用（6 层洋葱管道与路由分发）
│   ├── [[path]].ts            # Cloudflare Pages Functions catch-all 入口适配器
│   ├── middleware/            # CORS/CSRF、会话续期、Zod 校验器与 WeakMap 上下文存储
│   ├── modules/
│   │   ├── api-router.ts      # /api/* 管理与公开路由
│   │   ├── external-api/      # /api/ext/v1/* Bearer Token 对外 API
│   │   ├── handlers/          # 备份/WebDAV、Telegram Bot、规则模板、短链、留言板等处理器
│   │   └── subscription/      # 订阅转换管道（core, adapters, templates, cache, security）
│   ├── repositories/          # 仓储抽象与 MultiTierCache 三级缓存
│   ├── services/              # 订阅拉取、节点缓存、处理编排、日志、通知服务
│   └── storage/               # D1 八表适配器、集合缓存与 noop 回退适配器
├── src/                       # Vue 3 + Vite 8 + Tailwind CSS 4 管理前端
│   ├── lib/                   # http.ts、api.ts、query-client.ts（QUERY_KEYS 集中管理）
│   ├── queries/               # @tanstack/vue-query 服务端状态查询与变更钩子
│   ├── stores/                # Pinia Store（useDataStore.ts, useSettingsStore.ts 等）
│   ├── composables/           # 业务组合式函数
│   └── components/modals/     # 统一导入入口 ImportModal.vue 及各领域弹窗
├── worker.ts                  # Cloudflare Worker 入口（HTTP fetch + 原生 Cron Triggers）
├── schema.sql                 # Cloudflare D1 八表结构与索引定义
└── docs/                      # @misub/docs — 独立 VitePress + LLMs 文档子包（完全隔离于主站构建）
```

### 依赖方向约束

```text
  src/ (Vue 3 前端) ──────────┐
                              ├──▶ packages/core (@misub/core)
  functions/ + worker.ts ─────┘
  (Hono 边缘运行时)
```

`@misub/core` 不允许依赖任何 DOM API（`window` / `document`）、Node.js 内置模块或 Cloudflare Worker 全局对象，保证同一套协议解析、SS2022 校验、算子链与 Zod Schema 在浏览器预览和边缘 Worker 执行完全一致。

---

## 边缘请求管道与按需懒加载适配器

### 1. Hono 六层请求管道（`functions/app.ts`）

所有 HTTP 请求进入 `createApp()` 后依次穿过以下处理阶段：

```text
Request
  │
  ▼
[1] sessionRenewalMiddleware          ──▶ 响应阶段自动续期即将过期的管理会话 Cookie
  │
  ▼
[2] corsCsrfSecurityMiddleware        ──▶ CORS 白名单、CSRF Origin 校验与安全响应头
  │
  ▼
[3] 公共静态资产快速通道               ──▶ /assets/*, /icons/* 等直接放行，零 D1 查询
  │
  ▼
[4] 上下文绑定与订阅路径分发           ──▶ 注入 WeakMap BoundRequestContext；匹配 /{subPath}/{id} 则进入 handleMisubRequest
  │
  ▼
[5] 路由分发                           ──▶ /api/* (apiApp) | /api/ext/v1/* | /cron/*
  │
  ▼
[6] 静态文件与 SPA 兜底               ──▶ evaluatePageAccess 评估公开页/伪装页，返回 HTML (no-store)
```

### 2. 按需动态懒加载 `ClientAdapter`

为降低 Cloudflare Worker 冷启动时的脚本解析时间与 CPU 消耗，`functions/modules/subscription/adapters/adapter-registry.ts` 将 7 套内置客户端的生成器（Generator）与模板渲染器（Renderer）定义为静态字面量动态导入：

- `clash`：`builtin-clash-generator.ts` / `render-clash.ts`
- `surge`：`builtin-surge-generator.ts` / `render-surge.ts`
- `loon`：`builtin-loon-generator.ts` / `render-loon.ts`
- `quanx`：`builtin-quanx-generator.ts` / `render-quanx.ts`
- `singbox`（别名 `sing-box`）：`builtin-singbox-generator.ts` / `render-singbox.ts`
- `egern`：`builtin-egern-generator.ts` / `render-egern.ts`
- `shadowrocket`：`builtin-shadowrocket-generator.ts` / `render-shadowrocket.ts`

每次订阅请求根据 `User-Agent` 或 `?target=` 匹配唯一适配器后，仅 `await import(...)` 该目标客户端对应的模块；同时暴露 `registerClientAdapter` / `unregisterClientAdapter` 支持扩展插槽。

---

## 统一节点中间表示（`NodeIR`）

为避免每种入站格式与每种出站客户端之间产生 $N \times M$ 的耦合转换代码，MiSub 在 `packages/core/src/schemas/node-ir.ts` 中定义了规范化的 **`NodeIRSchema`**：

```text
  入站格式 (URI / Clash YAML / Surge / Quantumult X / V2RayN / Sing-Box)
                                │
                                ▼
                        [ NodeIRSchema ]
           ├── 基础字段: id, name, protocol (18 种), server, port, udp, tfo, dialerProxy
           ├── auth:     uuid, password, username, cipher, alterId, psk, token, flow, ...
           ├── transport: type (tcp/ws/grpc/http/h2/quic/httpupgrade/xhttp/udp), path, host, headers, xhttpOpts
           ├── tls:      enabled, security (none|tls|reality), sni, alpn, fingerprint, reality, ech
           ├── protocolParams & sourceUrl
           └── metadata: region, regionZh, regionCode, flag, cleanName, tags
                                │
                                ▼
  出站格式 (Clash / Sing-Box / Surge / Loon / QuanX / Egern / Shadowrocket / Base64)
```

- `NODE_IR_PROTOCOLS` 枚举涵盖了 `ss`、`ssr`、`vmess`、`vless`、`trojan`、`hysteria`、`hysteria2`、`tuic`、`anytls`、`snell`、`socks5`、`http`、`https`、`wireguard`、`naive+https`、`naive+quic`、`naive+http`、`mierus` 共 18 种标准化协议。
- 所有入站解析器与出站序列化器均可通过 `validateNodeIR(input)`（非抛出 `safeParse`）与 `parseNodeIR(input)` 进行运行时校验。

---

## 多级缓存机制与保护策略

MiSub 在「数据仓储层」与「订阅响应层」分别构建了多级缓存以最小化 D1 读写与上游回源压力。

### 1. 仓储层三级缓存（`functions/repositories/multi-tier-cache.ts`）

`MultiTierCache` 实现 **L1 Isolate 内存 → L2 Cloudflare Cache API → L3 Cloudflare D1** 的读穿透链路：

```text
read(namespace, key)
  ├──▶ L1: WeakMap<ScopeTarget, Map> (单命名空间最多 256 条 LRU, structuredClone 防污染)
  │      └─ 命中直接返回
  ├──▶ L2: Cloudflare Cache API 独立命名空间 "misub:repository"
  │      └─ 命中则回填 L1 并返回
  └──▶ L3: Single-Flight inflight Map 合并并发回源 -> 查询 Cloudflare D1 (MISUB_DB)
         ├─ 非空结果: 回填 L2 + L1
         └─ 空结果且配置 negativeTtlMs: 写入 isNullSentinel 负向哨兵防穿透
```

关键工程设计：
- **实例作用域隔离**：通过 `WeakMap` 按存储实例（`db` / `storage`）隔离缓存作用域，避免不同环境或单元测试之间互相污染。
- **Single-Flight 请求合并**：同一 Isolate 内并发请求同一个 `(namespace, generation, key)` 时共享同一条 `inflight` Promise。
- **代数（Generation）失效**：通过 `d1-collection-cache.ts` 注册失效监听器，写入 `subscriptions`、`nodes` 等集合时同步递增对应命名空间 `generations` 版本号并清理 `inflight`，无需全量扫描即可使 L1/L2 逻辑失效。

### 2. 订阅防刷、冷启动防击穿、公开预览与超时保护

- **请求防刷层（`fetch-guard.ts`）**：
  - `cache` 模式（默认最小间隔 15 分钟）：通过 `caches.default`（并辅以 Isolate 内存回退）按规范化 URL、`targetFormat`、`isMeta`、`isChinaClient` 与 `cacheVersion` 直接返回边缘缓存响应。
  - `strict` 模式：按订阅作用域 + 客户端 IP 冷却计数，间隔内直接返回 `429 Too Many Requests`。
- **冷启动 `miss` 态 Single-Flight 防击穿（`cache-manager.ts`）**：
  - `resolveNodeListWithCache` 维护按存储实例（`db` / `storageAdapter`）作用域隔离的 `inflightRefreshByScope`（`WeakMap<object, Map<string, Promise<string>>>`）。
  - 当缓存处于冷启动 `miss` 态或携带 `?refresh` 强制刷新时，以 `${forceRefresh ? 'force' : 'miss'}:${cacheKey}` 为键合并并发请求：仅首个请求（`isOwner`）触发 `refreshNodes(false)` 回源，其余并发请求共享同一 `Promise` 并在 `finally` 清理，防止冷启动瞬时并发击穿上游与 D1。
  - 当命中可用的 `stale` 或 `expired` 缓存时，立即返回旧数据（`X-Cache: REFRESHING`），并由 `refreshDebounceByScope`（`DEBOUNCE_TIME = 10000ms`、最多保留 `500` 个键）防抖触发后台异步刷新。
- **公开预览 `/api/public/preview` 边缘缓存与单 IP 限流（`preview-handler.ts`）**：
  - **`60s` 边缘缓存**：按 `profile.id` 与 `${baseVersion}:${profile.updatedAt}` 构造缓存键，成功预览结果写入 `PUBLIC_PREVIEW_CACHE_TTL_SECONDS = 60` 秒的边缘缓存。
  - **单 IP 限流保护**：通过 `publicPreviewRateLimits`（按存储作用域 `WeakMap` 隔离，单作用域上限 `500` 条）限制同一客户端 IP 每 `60s` 窗口最多请求 **`20` 次**（`PUBLIC_PREVIEW_RATE_WINDOW_MS = 60 * 1000`、`PUBLIC_PREVIEW_RATE_LIMIT_MAX = 20`）；超限返回 `429` 并附带 `Retry-After` 与 `X-MiSub-Rate-Limit: public-preview` 响应头。
  - **并发合并**：通过 `publicPreviewInflight` 合并同一缓存版本键的在途预览请求，且仅由 `isLeader` 负责回写 60s 边缘缓存。
- **单源抓取默认 `15000ms` 超时保护**：
  - 单源节点预览抓取（`node-fetcher.ts` 中 `NODE_FETCH_CONFIG.TIMEOUT = 15000`，最多重试 2 次）、单源节点计数与外部 API 校验/刷新（`node-handler.ts` 中 `NODE_COUNT_TIMEOUT_MS = 15000`）、Cron 定时任务同步（`notifications.ts` 中 `TIMEOUT = 15000`）以及外部探测/测试接口（`api-router.ts` 默认 `timeout = 15000`）均强制使用 **`15000ms`** 作为单源抓取默认超时阈值。
- **节点聚合异常保护（`main-handler.ts` + `node-cache-service.ts`）**：当上游订阅刷新出现异常节点数骤降（`isSuspiciousNodeCountDrop`）或疑似截断的局部节点列表（`isLikelyPartialAggregateNodeList`）时，拒绝覆盖缓存并回退返回历史健康节点缓存，避免上游临时故障导致客户端节点被清空。
