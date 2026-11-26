---
title: 工程与 AI 开发规范
description: 面向人类开发者与 AI 编码助手（Cursor / Antigravity 等）的强制工程规范：Zod 契约单一数据源、Workers 6 并发与 body.cancel() 约束、TanStack Query 单向数据流及全仓 0 any 门禁。
---

# 工程与 AI 开发规范

本文档为人类开发者与 AI 编程助手（Cursor、Antigravity 等）在 `MiSub` 仓库中编写与重构代码时的**强制工程约束**。所有新增或修改代码在提交前必须满足以下规范与验证门禁。

---

## 1. Zod 契约单一数据源（Single Source of Truth）

### 强制规则

- **Schema 唯一归口**：所有领域实体、中间表示与 API 请求/响应数据结构**必须**在 `packages/core/src/schemas/`（`node-ir.ts`、`entities.ts`、`api.ts`）中以 Zod v4 Schema 定义。
- **类型自动推导**：TypeScript 类型**必须**在 `packages/core/src/types.ts` 中通过 `z.infer<typeof XxxSchema>` 导出，严禁在 `functions/` 或 `src/` 中重复手写相同的接口定义。
- **边缘入口统一校验**：Hono 接口入参优先使用 `functions/middleware/hono-middlewares.ts` 提供的 `zodJsonValidator`（内置 `readJsonWithLimit` 防超大请求体攻击与 `request.clone()` 保护）和 `zodQueryValidator`。

### 示例

```ts
// ✅ 正确：在 packages/core/src/schemas/api.ts 定义契约，在 types.ts 推导类型
import { z } from 'zod';
export const ParseSubscriptionRequestSchema = z.object({
  content: z.string().min(1),
});

// functions/modules/api-router.ts 中直接使用 zodJsonValidator
apiApp.post(
  '/parse_subscription',
  zodJsonValidator(ParseSubscriptionRequestSchema, { maxBytes: JSON_BODY_LIMITS.large }),
  (c) => handleParseSubscription(c.req.raw, c.env),
);

// ❌ 错误：在后端 handler 或前端组件中重新手写 interface ParseReq { content: string } 并手工 if/else 校验
```

---

## 2. Cloudflare Workers 运行时与安全约束

### 2.1 Workers 6 并发限制与强制限流

Cloudflare Workers 单个请求生命周期内**最多允许同时维持 6 个出站网络/KV 连接**。

- **强制使用并发控制器**：批量抓取上游订阅、检查节点或并发探测时，**禁止**直接对未知长度数组执行裸 `Promise.all(items.map(fetch))`。必须通过 `functions/services/fetch-utils.ts` 导出的 `createConcurrencyLimiter(limit)` 控制并发上限（参照 `subscription-service.ts` 中的 `CONCURRENCY: 4` 与 `notifications.ts` 中的 `CONCURRENCY = 3`）。

```ts
// ✅ 正确：使用 createConcurrencyLimiter 限制并发在 6 以内
import { createConcurrencyLimiter } from '../services/fetch-utils.js';

const limiter = createConcurrencyLimiter(4);
const results = await Promise.all(urls.map((url) => limiter(() => fetchUpstream(url))));
```

### 2.2 强制释放未消费的 `Response.body`

在 Workers 运行时中，未读取且未取消的 HTTP 响应流会持续占用连接槽位并触发运行时资源泄漏警告（甚至导致后续 `fetch` 挂起或超限）。

- **强制规则**：凡是仅读取响应头（如只解析 `Subscription-Userinfo`）、准备放弃重试的中间响应、或非 `2xx` 且不需要读取文本的 `Response`，**必须**显式调用 `await response.body?.cancel()` 释放底层连接（参见 `fetch-utils.ts` 与 `notifications.ts`）。

```ts
// ✅ 正确：在丢弃响应或进入下一次重试前取消流
if (attempt < maxRetries) {
  try {
    await response.body?.cancel();
  } catch {
    // 忽略响应体释放失败
  }
  continue;
}
```

### 2.3 超时、缓存击穿与公开接口防刷阈值

- **单源抓取默认 `15000ms` 超时**：任何面向单订阅源或外部 URL 的 HTTP 抓取与探测（参见 `node-fetcher.ts` 的 `NODE_FETCH_CONFIG.TIMEOUT = 15000`、`node-handler.ts` 的 `NODE_COUNT_TIMEOUT_MS = 15000`、`notifications.ts` 的 `TIMEOUT = 15000` 及 `api-router.ts` 默认 `15000`）禁止无超时裸 `fetch`，统一遵循单源默认 `15000ms` 超时上限（聚合多源调度 `subscription-service.ts` 上限为 `18000ms`），并配合 `fetchWithRetry` 与 `body?.cancel()`。
- **冷启动 `miss` 态 Single-Flight 防击穿**：新增缓存读穿透或节点聚合刷新路径时，必须像 `functions/modules/subscription/cache/cache-manager.ts`（`inflightRefreshByScope`）与 `MultiTierCache`（`scope.inflight`）一样对 `miss` / `force` 态做并发请求合并并在 `finally` 中移除条目；同时必须使用 `WeakMap` 按存储实例（`db` / `storageAdapter`）隔离作用域，禁止使用全局裸单例 `Map` 污染集成测试。
- **公开高成本端点限流与 `60s` 边缘缓存**：对匿名可访问且涉及后端聚合计算的公开端点，必须像 `/api/public/preview`（`preview-handler.ts`）一样同时落实：**单 IP 限流**（`20` 次 / `60s`，超限返回 `429` + `Retry-After`）、**`60s` 边缘缓存**（键含配置版本号 `edgeCacheVersion` 与资源 `updatedAt`）以及**在途 `inflight` 并发合并**。

### 2.4 运行时隔离、懒加载与安全边界

- **`@misub/core` 零环境依赖**：`packages/core/` 下禁止引用 `window`、`document`、`localStorage`、`node:*` 或 `caches` / `D1Database` 等宿主 API。
- **适配器静态字面量懒加载**：新增客户端生成器或模板渲染器时，必须在 `functions/modules/subscription/adapters/adapter-registry.ts` 中使用**静态字符串字面量** `await import('./generators/...')`，确保 Wrangler/esbuild 正确拆包与按需加载。
- **严禁动态代码执行**：禁止使用 `eval`、`new Function` 或执行未经清洗的外部 HTML；节点脚本算子只允许走 `expression-dsl.ts` 声明式 DSL；Vite 配置中必须维持 `vuedraggable` 指向 ESM 源码（`vite.config.js`），避免打包 Vue runtime compiler 触发严格 CSP `EvalError`。
- **SSRF 与 ReDoS 防护**：外部 URL 抓取必须经 `assertPublicNetworkUrl` / `safeFetchPublicUrl` 校验；用户输入的正则表达式必须经过 `isSafeUserRegexPattern` 检测。

---

## 3. 前端 TanStack Vue Query 与单向数据流规范

### 3.1 服务端状态与查询键治理

- **统一查询封装**：所有后端数据拉取与写回操作均应通过 `src/queries/`（如 `useAppDataQueries.ts`、`usePublicProfilesQuery.ts`、`useAccessLogsQuery.ts`、`useWebdavBackupQueries.ts`）管理，底层 HTTP 请求统一走 `src/lib/http.ts`。
- **集中维护 `QUERY_KEYS`**：禁止在组件或 Store 中硬编码魔法字符串 Key，所有 Query Key 必须定义在 `src/lib/query-client.ts` 的 `QUERY_KEYS` 对象中。
- **并发冲突与回滚**：保存配置/订阅时（如 `saveMisubsWithQueryClient`）必须先 `cancelQueries`，更新前保存快照，并在发生错误时回滚；遇到服务端返回 `409` 且 `data.code === 'DATA_CONFLICT'` 时自动触发 `invalidateQueries` 重新拉取最新版本。
- **前端本地缓存脱敏**：写入 `sessionStorage` 缓存前必须经过 `sanitizeConfigForCache` 剔除 `botToken`、`cronSecret`、`webdavBackup.password`、`shortLink.apiToken`、`turnstile.secretKey`、`telegramPushConfig` 密钥及 `externalApi.tokens` 等敏感凭据。

### 3.2 Pinia Store 与组件单向数据流

- **命名与职责边界**：Store 统一使用 `useXxxStore.ts` 命名（如 `useDataStore.ts`、`useSettingsStore.ts`、`useSessionStore.ts`、`useEditorStore.ts`）。Store 负责响应式状态切片、脏状态标记及编排 Query Mutation，**不要在 Vue 组件模板里直接 `fetch` 后端接口**。
- **导入入口收敛**：所有手动节点、机场订阅与批量文件导入 UI 统一复用 `src/components/modals/ImportModal.vue`（通过 `mode`: `'bulk' | 'nodes' | 'subscriptions'` 区分），禁止另起炉灶复制导入弹窗逻辑。

---

## 4. 全仓 0 `any` 与提交门禁

### 4.1 严格 TypeScript 与编码规范

- 根目录 `tsconfig.json` 已开启 `"strict": true` 与 `"noEmit": true`。
- **全仓 0 `any` 要求**：新增与修改代码（`packages/core`、`functions/`、`worker.ts`、`src/`）**严禁使用 `any`**（包括隐式 `any` 与 `as any`）。面对未知 JSON 或外部输入时，必须使用 `unknown` 配合自定义类型守卫（如 `isRecord(value)`）或 Zod `.safeParse()` 收窄类型。
- **文档与工作区隔离**：`docs/` 作为独立子包 `@misub/docs` 纳入 `pnpm-workspace.yaml`，禁止在根 `package.json` 的 `dependencies` / `devDependencies` 中混入 VitePress 相关依赖，避免污染主站与 Worker 构建产物。

### 4.2 必过校验门禁命令

在向主仓库提交代码或 AI 完成编码任务后，必须确保以下命令全部零错误、零警告通过：

```bash
# 1. TypeScript 全仓类型检查（涵盖 packages/core、functions、worker.ts、src）
pnpm exec tsc --noEmit

# 2. Vue 模板与 TS 联合类型检查
pnpm run typecheck

# 3. Oxlint 静态检查（零警告门禁）
pnpm exec oxlint --deny-warnings

# 4. 单元测试与集成测试
pnpm test

# 5. 代码格式检查（修改源码时）
pnpm run format:check
```
