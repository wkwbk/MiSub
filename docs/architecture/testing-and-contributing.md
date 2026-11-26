---
title: 测试架构与 AI 协作指南
description: 基于 Vitest（MemoryD1 模拟桩）的边缘函数单元测试方法、Playwright E2E 孤立 Worker 测试架构，以及新增客户端适配器（ClientAdapter）与算子/DSL 函数的标准开发清单。
---

# 测试架构与 AI 协作指南

MiSub 在 `tests/` 目录下维护了完整的 Vitest 单元测试与 Playwright 端到端测试体系，确保边缘运行时、共享核心包与 Vue 3 前端在无真实 Cloudflare 账号环境下即可完成全链路回归。

---

## 1. 测试架构与运行命令

### 1.1 Vitest 单元与集成测试（`vitest.config.js`）

- **运行环境**：`pool: 'vmThreads'`、`environment: 'happy-dom'`；
- **Cloudflare 原生模块桩**：内置 `vitest-cloudflare-sockets-stub` 虚拟插件，自动将 `cloudflare:sockets` 映射为空桩，防止 Node 测试环境下导入 `node-inspect-handler.ts` 报错；
- **路径别名**：`@` → `/src`，`@misub/core` → `/packages/core/src`；
- **预加载文件**：`tests/setup/i18n-preload.js` 与 `tests/setup/async-components.js`。

常用命令：

```bash
pnpm test              # 运行全部 Vitest 单元与集成测试
pnpm run test:watch    # 监听模式
pnpm run test:coverage # 生成 v8 覆盖率报告
```

### 1.2 Playwright 端到端测试（`playwright.config.js`）

- E2E 测试位于 `tests/e2e/`（单 worker 串行执行，`timeout: 30_000`）。
- 测试启动时自动运行 `tests/e2e/e2e-server.mjs`（通过 Node `--experimental-strip-types` 与 `register-ts-loader.mjs` 直接加载真实 `worker.ts`），同时：
  - 将静态资源请求从已构建的 `dist/` 提供服务；
  - 使用 `createMemoryD1` 模拟 8 表 D1 数据库；
  - 拦截 `https://airport.e2e.example/` 返回确定性节点订阅流；
  - 提供 `POST /__e2e__/reset` 在用例间清空内存库与设置缓存。

运行命令（会自动先构建前端 `vite build` 再跑 Playwright）：

```bash
pnpm run test:e2e
```

---

## 2. 使用 `createMemoryD1` 编写边缘函数单元测试

`tests/helpers/memory-d1.js` 实现了兼容 8 张表与索引 SQL 的内存版 D1 测试桩（`subscriptions`、`nodes`、`profiles`、`guestbook`、`settings`、`cache`、`access_logs`、`error_reports`）。

### 编写测试要点

1. **隔离清理**：每个测试用例前建议调用 `clearSettingsCache()`（导出自 `functions/storage-adapter.ts`）重置模块级 `WeakMap` 缓存；
2. **种子数据初始化**：`createMemoryD1(initial)` 支持直接传入：
   - `main`：主设置对象（写入 `settings` 表）；
   - `subscriptions` / `nodes` / `profiles` / `guestbook`：实体数组（若 `subscriptions` 数组内某项 URL 不是 `http(s)://`，会自动归入 `nodes` 表）；
   - 缓存键前缀（如 `node_cache_*`、`auth_login_rate:*`）会自动路由至 `cache` 表。

### 标准单元测试示例

```js
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../functions/app.js';
import { clearSettingsCache } from '../../functions/storage-adapter.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

describe('subscription endpoint integration', () => {
  let env;

  beforeEach(() => {
    clearSettingsCache();
    const db = createMemoryD1({
      main: {
        myToken: 'test-token',
        profileToken: 'sub',
        allowBrowserSubAccess: true,
      },
      subscriptions: [
        {
          id: 'sub-1',
          name: 'Demo',
          url: 'https://example.com/sub',
          enabled: true,
        },
      ],
    });
    env = {
      MISUB_DB: db,
      ADMIN_PASSWORD: 'test-admin-password',
      COOKIE_SECRET: 'test-cookie-secret',
    };
  });

  it('rejects invalid token with disguise response', async () => {
    const req = new Request('https://misub.example/sub/wrong-token', {
      headers: { 'User-Agent': 'clash-verge/v2.0.0' },
    });
    const res = await app.fetch(req, env);
    expect(res.status).toBe(404);
  });
});
```

---

## 3. 标准扩展步骤（人类与 AI Agent 协作清单）

### 3.1 如何新增一套客户端适配器（`ClientAdapter`）

1. **格式识别与 UA 映射**：在 `functions/modules/subscription/core/user-agent-utils.ts` 的 `supportedFormats` 或 `uaMapping` 中添加新客户端识别规则与目标格式名。
2. **实现 Generator 与 Renderer**：
   - 在 `functions/modules/subscription/adapters/generators/` 新增 `builtin-<client>-generator.ts`（输入 `nodeList` 经 `@misub/core` 的 `urlsToClashProxies` 或 `parseUrlToNodeIR` 转换）；
   - 在 `functions/modules/subscription/templates/renderers/` 新增 `render-<client>.ts`（将 `UnifiedTemplateModel` 渲染为目标配置文本）。
3. **注册懒加载适配器**：在 `functions/modules/subscription/adapters/adapter-registry.ts` 中使用**静态字符串字面量** `await import(...)` 注册（或通过 `registerClientAdapter` 动态扩展），保证未命中该客户端时零冷启动解析开销。
4. **前端提示与测试**：如需在手动节点卡片展示兼容性徽章，同步更新 `packages/core/src/node/client-compatibility.ts`；在 `tests/unit/` 添加格式识别与生成回归测试。

### 3.2 如何新增算子或安全 DSL 函数

1. **定义 Zod 契约与推导类型**：在 `packages/core/src/schemas/entities.ts` 中扩展对应算子参数 Schema（或 `TypedOperatorRuleSchema`），并在 `packages/core/src/types.ts` 中通过 `z.infer<...>` 导出类型。
2. **纯函数实现（零宿主依赖）**：
   - 新增算子逻辑在 `packages/core/src/operators/operator-runner.ts` 中实现；
   - 新增安全 DSL 函数在 `packages/core/src/operators/expression-dsl.ts` 的 `evalValue` `switch (fn)` 中实现（严禁使用 `eval` / `new Function`）。
3. **前端编辑 UI 对接**：在算子编辑组件中接入新参数表单。
4. **提交门禁验证**：运行以下命令确保全仓零报错、零警告：

```bash
pnpm exec tsc --noEmit
pnpm run typecheck
pnpm exec oxlint --deny-warnings
pnpm test
pnpm run docs:build   # 若同步更新了 docs/ 文档
```
