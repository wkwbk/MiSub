---
title: 对外开放 API (v1)
description: MiSub /api/ext/v1/* 对外开放 REST API 参考：Bearer Token 鉴权、请求限制与限流说明、Subscriptions/Manual Nodes/Profiles/Preview 端点及请求响应示例。
---

# 对外开放 API（`/api/ext/v1/*`）

MiSub 提供标准化的 REST API（路由前缀 `/api/ext/v1/*`），供外部脚本、CI/CD 流程或自动化工具以编程方式管理机场订阅、手动节点与订阅组，无需依赖后台登录 Cookie 会话。

入口路由与核心实现位于 `functions/modules/external-api/external-api-router.ts`，入参 Zod 契约定义于 `packages/core/src/schemas/api.ts`。

---

## 1. 鉴权方式（Bearer Token）

由 `functions/modules/external-api/external-api-auth.ts` 中的 `authenticateExternalApiRequest` 处理：

1. **开启总开关**：需在系统设置中开启 `settings.externalApi.enabled = true`。若未启用，所有 `/api/ext/v1/*` 请求将直接返回 `403 Forbidden`（`code: "forbidden"`）。
2. **携带请求头**：所有请求必须在 HTTP Header 中携带 Bearer Token：

```http
Authorization: Bearer <YOUR_EXTERNAL_API_TOKEN>
```

3. **常量时间校验**：服务端会遍历 `settings.externalApi.tokens`（`{ name, token }[]`），使用 `timingSafeStringEqual`（SHA-256 归一化后常量时间比对）逐一校验。缺少或无效 Token 将返回 `401 Unauthorized`（`code: "unauthorized"`）。

---

## 2. 统一响应格式、体积限制与限流说明

### 统一响应信封

- **成功响应**（定义于 `createExternalSuccess`）：

```json
{
  "success": true,
  "data": {},
  "meta": {
    "page": 1,
    "pageSize": 50,
    "total": 12,
    "requestId": "req_xxxxxxxx"
  }
}
```

> 注：`meta` 仅在分页列表查询接口中返回；单条资源查询、创建、修改、删除及预览接口仅返回 `success` 与 `data`。

- **失败响应**（定义于 `createExternalError`）：

```json
{
  "success": false,
  "error": {
    "code": "unauthorized",
    "message": "Invalid or missing bearer token",
    "details": {}
  }
}
```

> 注：`details` 为可选字段（例如 `/subscriptions/validate` 失败时会附带 `requestedUrl`、`effectiveUserAgent`、`nodeCount`、`userInfo`）。

### 请求体积、分页与限流边界

| 维度 | 真实约束与说明 |
| :--- | :--- |
| **JSON 请求体上限** | 经 `readExternalJson` 与 `zodJsonValidator` 强制限制为 `JSON_BODY_LIMITS.normal`（`1 MiB` / `1048576` 字节），超限返回 `413`（`code: "invalid_json"`）。 |
| **分页参数范围** | `PaginationQuerySchema` 限制 `page >= 1`、`1 <= pageSize <= 200`；列表处理器内部默认 `page = 1`、`pageSize = 50`（参考 `parsePagination`）。 |
| **请求限流机制** | `/api/ext/v1/*` 面向持 Bearer Token 的受控服务集成，Worker 代码中**未内置**单独的按 IP 限流器（区别于公开接口 `/api/public/preview` 的单 IP `20 次 / 60s` 限流与 `/api/login` 的 `5 次 / 15min` 登录锁定）。建议在生产环境配合 Cloudflare WAF / Rate Limiting 规则按需添加频控。 |
| **远端抓取安全与超时** | `/subscriptions/validate`、`/subscriptions/:id/refresh`、`/subscriptions/batch-refresh` 与 `/profiles/:id/refresh` 均调用 `handleNodeCountRequest`，内置 `assertPublicNetworkUrl` SSRF 校验及单源 **`15000ms`** 超时限制（`NODE_COUNT_TIMEOUT_MS`）。 |

---

## 3. 端点清单

### 3.1 Subscriptions（机场订阅）

| 方法与路径 | 说明 |
| :--- | :--- |
| `GET /api/ext/v1/subscriptions` | 分页获取订阅列表。支持查询参数：`enabled`（`true`/`false`）、`tag`、`keyword`、`page`、`pageSize`。 |
| `GET /api/ext/v1/subscriptions/:id` | 获取单条订阅详情。不存在返回 `404`（`subscription_not_found`）。 |
| `POST /api/ext/v1/subscriptions` | 创建远程订阅（`ExternalSubscriptionCreateSchema`）。必填 `name` 与 `http/https` 合法的 `url`；可选 `enabled`、`autoUpdate`、`tags`、`userAgent`、`proxy`、`sortIndex`。成功返回 `201`。 |
| `PATCH /api/ext/v1/subscriptions/:id` | 局部更新订阅配置（`name`、`url`、`enabled`、`autoUpdate`、`tags`、`userAgent`、`proxy`、`sortIndex`）。 |
| `DELETE /api/ext/v1/subscriptions/:id` | 删除订阅并自动从引用它的订阅组移除，返回 `{ deleted: true, id, removedFromProfiles }`。 |
| `POST /api/ext/v1/subscriptions/validate` | 预检远端订阅 URL（不落库）。请求体必填 `url`，可选 `userAgent`/`customUserAgent`、`proxy`/`fetchProxy`、`plusAsSpace`；返回 `{ valid, requestedUrl, effectiveUserAgent, fetchProxyUsed, plusAsSpace, nodeCount, userInfo, checkedAt }`。 |
| `POST /api/ext/v1/subscriptions/:id/refresh` | 立即拉取并更新单条订阅的 `nodeCount`、`userInfo`、`lastError` 与 `lastUpdate`。 |
| `POST /api/ext/v1/subscriptions/batch-refresh` | 批量刷新订阅。请求体 `{ "subscriptionIds": ["..."] }`，自动跳过 `autoUpdate: false` 的条目，通过 `SubscriptionRepository.putMany` 批量持久化并返回 `results` 与 `summary`。 |

### 3.2 Manual Nodes（手动节点）

| 方法与路径 | 说明 |
| :--- | :--- |
| `GET /api/ext/v1/manual-nodes` | 分页获取手动节点列表。支持查询参数：`enabled`、`tag`、`protocol`、`keyword`、`page`、`pageSize`。 |
| `GET /api/ext/v1/manual-nodes/:id` | 获取单个手动节点详情。不存在返回 `404`（`manual_node_not_found`）。 |
| `POST /api/ext/v1/manual-nodes` | 新增手动节点（`ExternalManualNodeCreateSchema`）。必填 `name` 与支持的节点协议 `url`；可选 `enabled`、`tags`、`remarks`、`sortIndex`。成功返回 `201`。 |
| `PATCH /api/ext/v1/manual-nodes/:id` | 局部更新手动节点字段。 |
| `DELETE /api/ext/v1/manual-nodes/:id` | 删除手动节点并从关联订阅组清理引用，返回 `{ deleted: true, id, removedFromProfiles }`。 |
| `POST /api/ext/v1/manual-nodes/validate` | 解析校验单条手动节点链接（`ExternalManualNodeValidateSchema`）。请求体必填 `url`，可选 `name`；返回 `{ valid, requestedName, requestedUrl, protocol, nodeCount, parsedNode, checkedAt }`。 |

### 3.3 Profiles（订阅组）

| 方法与路径 | 说明 |
| :--- | :--- |
| `GET /api/ext/v1/profiles` | 分页获取订阅组列表。支持查询参数：`enabled`、`tag`、`keyword`、`page`、`pageSize`。 |
| `GET /api/ext/v1/profiles/:id` | 获取单个订阅组详情。不存在返回 `404`（`profile_not_found`）。 |
| `POST /api/ext/v1/profiles` | 创建订阅组（`ExternalProfileCreateSchema`）。必填 `name`；可选 `description`、`tags`、`enabled`、`isPublic`、`customId`、`subscriptionIds`（读取 `payload.subscriptionIds`）、`manualNodeIds`（读取 `payload.manualNodeIds`）、`target`（默认 `clash`）、`sortIndex`。自动生成 `linkId` 与 `shareId`，成功返回 `201`。 |
| `PATCH /api/ext/v1/profiles/:id` | 更新订阅组；传入 `rotateLinkId: true` 可轮换 `linkId` 并清空 `customId`。 |
| `DELETE /api/ext/v1/profiles/:id` | 删除订阅组。 |
| `POST /api/ext/v1/profiles/:id/subscriptions` | 增量绑定远程订阅，请求体 `{ "subscriptionIds": ["..."] }`。 |
| `DELETE /api/ext/v1/profiles/:id/subscriptions` | 增量解绑远程订阅，请求体 `{ "subscriptionIds": ["..."] }`。 |
| `POST /api/ext/v1/profiles/:id/manual-nodes` | 增量绑定手动节点，请求体 `{ "manualNodeIds": ["..."] }`。 |
| `DELETE /api/ext/v1/profiles/:id/manual-nodes` | 增量解绑手动节点，请求体 `{ "manualNodeIds": ["..."] }`。 |
| `POST /api/ext/v1/profiles/:id/refresh` | 刷新该订阅组内所有开启 `autoUpdate` 的远程订阅，并返回各源结果与汇总 `summary`。 |

### 3.4 Preview（订阅组结构预览）

| 方法与路径 | 说明 |
| :--- | :--- |
| `POST /api/ext/v1/profiles/:id/preview` | 返回指定订阅组的已配置源统计与手动节点协议分布（不实时发起上游订阅拉取）。 |

---

## 4. 请求与响应示例

### 示例 1：创建远程订阅

```bash
curl -X POST "https://your-domain.example/api/ext/v1/subscriptions" \
  -H "Authorization: Bearer misub_ext_your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "主力机场",
    "url": "https://provider.example/sub?token=xxx",
    "enabled": true,
    "autoUpdate": true,
    "tags": ["主力", "HK"],
    "userAgent": "clash.meta"
  }'
```

返回（`201 Created`）：

```json
{
  "success": true,
  "data": {
    "id": "sub_01j9...",
    "type": "subscription",
    "name": "主力机场",
    "url": "https://provider.example/sub?token=xxx",
    "enabled": true,
    "autoUpdate": true,
    "tags": ["主力", "HK"],
    "userAgent": "clash.meta",
    "proxy": "",
    "nodeCount": 0,
    "userInfo": null,
    "lastError": "",
    "lastUpdate": null,
    "sortIndex": 1,
    "createdAt": "2026-11-26T03:00:00.000Z",
    "updatedAt": "2026-11-26T03:00:00.000Z"
  }
}
```

### 示例 2：预览订阅组源组成（`POST /api/ext/v1/profiles/:id/preview`）

```bash
curl -X POST "https://your-domain.example/api/ext/v1/profiles/prof_01j9/preview" \
  -H "Authorization: Bearer misub_ext_your_token"
```

返回（`200 OK`）：

```json
{
  "success": true,
  "data": {
    "profile": {
      "id": "prof_01j9",
      "name": "日常主力",
      "description": "",
      "tags": ["默认"],
      "enabled": true,
      "isPublic": false,
      "customId": "daily",
      "linkId": "lnk_abc123",
      "shareId": "daily",
      "subscriptionIds": ["sub_01j9..."],
      "manualNodeIds": ["node_01j9..."],
      "target": "clash",
      "sortIndex": 1,
      "createdAt": "2026-11-26T03:00:00.000Z",
      "updatedAt": "2026-11-26T03:00:00.000Z"
    },
    "counts": {
      "subscriptions": 1,
      "manualNodes": 1,
      "totalNodes": 1
    },
    "byProtocol": {
      "vless": 1
    },
    "sources": [
      {
        "id": "sub_01j9...",
        "type": "subscription",
        "name": "主力机场",
        "url": "https://provider.example/sub?token=xxx"
      },
      {
        "id": "node_01j9...",
        "type": "manual_node",
        "name": "自建 HK",
        "protocol": "vless",
        "nodeCount": 1,
        "url": "vless://..."
      }
    ]
  }
}
```

### 示例 3：校验失败或未授权响应

```json
{
  "success": false,
  "error": {
    "code": "subscription_url_required",
    "message": "Subscription URL is required"
  }
}
```
