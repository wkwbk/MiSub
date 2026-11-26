---
title: GitHub 加速代理、访问日志与错误监控
description: MiSub 内置 GitHub/App Store 发布版本代理与格式白名单限制、D1 access_logs 访问日志的采集维度与削峰清理策略，以及前端错误监控 VITE_ERROR_REPORT_URL 配置指南。
---

# GitHub 加速代理、访问日志与错误监控

MiSub 内置了版本代理接口、订阅拉取访问日志系统以及可选的前端异常收集链路，用于辅助客户端更新展示与边缘运行时排错。

---

## 1. GitHub 与 App Store 发布代理

由 `functions/modules/handlers/github-proxy-handler.ts` 提供，主要用于后台检查 MiSub 最新版本以及公开分享页自动获取各主流代理客户端的最新版本号，**并非通用开放 HTTP 代理**。

### 1.1 `GET /api/github/release`

- **严格参数白名单**：`repo` 参数必须严格匹配 `^[\w\-.]+\/[\w\-.]+$`（即 `owner/repo` 格式，否则直接返回 `400`），且仅请求固定上游 `https://api.github.com/repos/${repo}/releases/latest`。
- **缓存周期**：命中 D1 `cache` 表中 `github_release_${repo}` 且未超过 **24 小时**（`CACHE_TTL_MS`）时直接返回（响应头 `X-Cache-Status: HIT`）；超期由维护任务按 7 天清理。
- **鉴权与限流三级降级**：
  1. 若环境变量配置了 `GITHUB_TOKEN` Secret，会携带 `Authorization: Bearer ...` 提升 API 速率上限；若该 Token 被拒绝（`401`），自动回退为无 Token 请求。
  2. 当遇到 GitHub API `403` / `429` 限流时，依次尝试：
     - **Stale 缓存降级**：若 D1 中仍有旧缓存，返回旧数据（`X-Cache-Status: STALE`）；
     - **302 重定向解析降级**：请求 `https://github.com/${repo}/releases/latest`（`redirect: 'manual'`），从 `Location` 响应头 `/releases/tag/<tag>` 提取版本号并写入缓存（`X-Cache-Status: FALLBACK`）；
     - **优雅兜底**：无可用数据时返回 `{ tag_name: null, rate_limited: true }`（`X-Cache-Status: RATE_LIMITED`）。

### 1.2 `GET /api/appstore/release`

- **严格参数校验**：`id` 必须为纯数字（`^\d+$`），`country` 必须为两位字母国家码（默认 `us`），仅查询 `https://itunes.apple.com/lookup?id=${id}&country=${country}` 并缓存 **24 小时**（键为 `appstore_release_${country}_${id}`）。

### 1.3 国内规则源自动镜像加速

在订阅规则渲染时（`builtin-rules-provider.ts`），系统按请求方 `request.cf.country` / `CF-IPCountry` 判断客户端是否位于中国大陆（`CN`）：国内请求会自动为 ACL4SSR、SagerNet sing-geosite/sing-geoip 等 GitHub 规则源加上 `https://gh-proxy.org/` 前缀，海外节点则直连 GitHub。

---

## 2. 订阅拉取访问日志（`access_logs`）

访问日志链路分布在 `access-logger.ts`、`log-service.ts` 与 `access-log-repository.ts`，将订阅拉取记录写入 D1 `access_logs` 表。

### 2.1 开启条件与内部豁免

- 需在后台开启 `enableAccessLog`；
- `shouldSkipLogging` 会自动跳过包含 `MiSub-Backend` 或 `TelegramBot` 的内部请求 User-Agent；带 `callback_token` 的外部回调请求也不会重复计入订阅组下载次数。

### 2.2 记录维度与敏感信息脱敏

每次记录包含以下字段（同时严格对 `token` 进行脱敏）：

| 字段 | 说明 |
| :--- | :--- |
| `id` / `timestamp` | UUID 主键与毫秒级时间戳 |
| `profileId` / `profileName` | 订阅组 ID 与名称 |
| `clientIp` / `geoInfo` | 客户端 IP 及边缘地理元数据（`country`、`city`、`isp`、`asn`） |
| `userAgent` / `format` | 客户端 User-Agent 与最终解析输出的目标格式（如 `clash`、`singbox`） |
| `type` / `token` | 类型（`profile` / `token`）及经 `anonymizeLogToken` **单向 FNV-1a 哈希**后的匿名指纹（形如 `profile:<12位hex>`），**绝不落盘明文订阅 Token** |
| `domain` / `status` | 请求域名与结果状态（`success` / `error`） |
| `details` / `summary` | 节点生成统计（`totalNodes`、`sourceCount`、`successCount`、`failCount`、`duration`） |

### 2.3 持久化模式与削峰清理策略

`settings.accessLogPersistenceMode` 支持两种模式：

- **`light`（默认，推荐）**：
  - 同一指纹（`status|type|token|format|domain|message`）的成功日志冷却 **`5 分钟`**（`SUCCESS_LOG_COOLDOWN_MS`），错误日志冷却 **`60 秒`**（`ERROR_LOG_COOLDOWN_MS`）；
  - 全 Isolate 每分钟最多落盘 **`12`** 条成功日志（`MAX_PERSISTED_LOGS_PER_MINUTE = 12`），大幅降低客户端高频轮询对 D1 写入配额的消耗。
- **`full`**：跳过节流冷却，全量持久化每次访问。

**批量刷盘与自动裁剪**：
- `LogService.addLog` 在 `ctx.waitUntil` 中将日志放入内存队列并防抖 **`500ms`**，再经 `AccessLogRepository.insertBatch` 通过 `db.batch` 批量写入 D1（失败最多重试 `3` 次）；
- 写入及每日定时维护（`0 3:30 UTC` / `/cron/maintenance`）自动裁剪超出 **`200 条`**（`MAX_LOG_ENTRIES = 200`）或超过 **`30 天`**（`ACCESS_LOG_MAX_AGE_MS`）的历史记录；
- 管理端可通过 `GET /api/logs` 查看日志，或通过 `DELETE /api/logs?profileId=...` 清空日志并同步重置对应订阅组的 `downloadCount`。

---

## 3. 前端错误监控（`VITE_ERROR_REPORT_URL`）与 Workers 可观测性

### 3.1 前端接入配置

在 `src/main.ts`（第 190 行）与 `src/utils/error-handler.ts` 中，前端支持通过以下两种方式启用异常自动上报：

1. **构建环境变量**（推荐用于 Pages / Workers 构建）：
   ```ini
   VITE_ERROR_REPORT_URL=/api/system/error_report
   ```
2. **运行时全局变量**：在页面挂载 `window.__MISUB_ERROR_REPORT_URL__`。

> 如不需要收集前端报错，保持 `VITE_ERROR_REPORT_URL` 为空即可，前端不会发出任何上报请求。

### 3.2 服务端限流与存储边界（`error-report-handler.ts`）

`POST /api/system/error_report` 接收前端上报时具备严格的防洪与截断机制：

- **请求体积与字段截断**：限制请求体不超过 `128 KiB`（`JSON_BODY_LIMITS.small`），并强制截断 `message`（≤ 500 字符）、`stack`（≤ 2000 字符）、`additionalData`（JSON ≤ 2000 字符）；
- **指纹去重与频控**：按 `context|message|url|origin` 指纹实施 **`10 分钟`** 冷却去重，且每分钟全局最多写入 **`6`** 条记录（`MAX_PERSISTED_REPORTS_PER_MINUTE = 6`）；
- **滚动上限**：D1 `error_reports` 表最多保留最新 **`100`** 条记录（`MAX_REPORT_ENTRIES = 100`）；未绑定 `MISUB_DB` 时静默返回成功以免阻塞前端。

### 3.3 Cloudflare Workers 原生 Observability

根目录 `wrangler.jsonc` 默认开启了 Workers 可观测性与 Source Map 上传：

```jsonc
"observability": {
  "enabled": true,
  "head_sampling_rate": 1
},
"upload_source_maps": true
```

部署至 Cloudflare Workers 后，可在 Cloudflare Dashboard 的 Observability 日志面板中直接查看边缘请求日志与还原后的 `worker.ts` 源码报错行号。
