---
title: D1 八表数据字典与存储设计
description: Cloudflare D1（MISUB_DB）八张核心数据表结构、索引设计、settings/cache 键路由规则、TTL 过期策略以及本地与远程迁移操作指南。
---

# D1 八表数据字典与存储设计

MiSub 已全面采用纯 **Cloudflare D1（绑定名 `MISUB_DB`）** 八表行级存储架构，通过职责分离避免单一大 JSON 键读写冲突与 KV 每日写入配额限制。

SQL 定义位于根目录 `schema.sql`，运行时 Schema 管理与键路由逻辑位于 `functions/storage/d1-schema.ts` 与 `functions/storage-adapter.ts`。

---

## 1. 三大表族分类设计

| 分类 | 包含表 | 存储模型说明 |
| :--- | :--- | :--- |
| **实体行级表（`ID_DATA_TABLES`）** | `subscriptions`、`nodes`、`profiles`、`guestbook` | 每条业务实体占一行，以 `id` 为主键，完整对象以 JSON 序列化保存在 `data` 列。`isManualNodeRecord` 自动按 `url` 是否以 `http(s)://` 开头区分远程订阅（`subscriptions`）与手动节点（`nodes`）。 |
| **键值配置与缓存表（`KEY_VALUE_TABLES`）** | `settings`、`cache` | `settings` 存储全局与公开资源配置；`cache` 存储带 TTL `expires_at` 的节点缓存、分布式锁与限流计数器。 |
| **时序追加日志表** | `access_logs`、`error_reports` | 按 `id` 行级追加，搭配毫秒时间戳 `timestamp` 降序索引与自动滚动裁剪。 |

---

## 2. 八张数据表字段与索引字典

### 2.1 `subscriptions`（机场远程订阅）

| 列名 | 类型 | 约束 / 说明 |
| :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` |
| `data` | `TEXT` | `NOT NULL`，JSON 字符串（对应 `SubscriptionSchema`） |
| `created_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP`，索引 `idx_subscriptions_updated_at` |

### 2.2 `nodes`（手动代理节点）

| 列名 | 类型 | 约束 / 说明 |
| :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` |
| `data` | `TEXT` | `NOT NULL`，JSON 字符串（对应 `ManualNodeSchema`） |
| `created_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP`，索引 `idx_nodes_updated_at` |

### 2.3 `profiles`（订阅组）

| 列名 | 类型 | 约束 / 说明 |
| :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` |
| `custom_id` | `TEXT` | 冗余提取自 `data.customId`，索引 `idx_profiles_custom_id`，加速短路径查找 |
| `link_id` | `TEXT` | 冗余提取自 `data.linkId`，索引 `idx_profiles_link_id`，加速随机短链查找 |
| `data` | `TEXT` | `NOT NULL`，JSON 字符串（对应 `ProfileSchema`；下载计数通过 SQLite `json_set(data, '$.downloadCount', ...)` 原子自增） |
| `created_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP`，索引 `idx_profiles_updated_at` |

### 2.4 `guestbook`（访客留言板）

| 列名 | 类型 | 约束 / 说明 |
| :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` |
| `data` | `TEXT` | `NOT NULL`，JSON 字符串（含 `nickname`、`content`、`isVisible`、`reply` 等） |
| `created_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP`，索引 `idx_guestbook_updated_at` |

### 2.5 `settings`（系统与公开资源配置）

| 列名 | 类型 | 约束 / 说明 |
| :--- | :--- | :--- |
| `key` | `TEXT` | `PRIMARY KEY`，固定路由键如下表 |
| `value` | `TEXT` | `NOT NULL`，JSON 字符串 |
| `created_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP`，索引 `idx_settings_updated_at` |

**`SETTINGS_KEYS` 固定键列表**：
- `main`：主系统设置（对应 `SettingsSchema`）
- `rule_templates`：用户自定义 INI 规则模板数组
- `clients`：公开页推荐客户端列表
- `public_cores`：公开页内核下载列表
- `public_links`：公开页常用导航链接列表

### 2.6 `cache`（节点缓存、防刷限流与分布式锁）

| 列名 | 类型 | 约束 / 说明 |
| :--- | :--- | :--- |
| `key` | `TEXT` | `PRIMARY KEY` |
| `value` | `TEXT` | `NOT NULL`，JSON 字符串 |
| `expires_at` | `INTEGER` | 毫秒级过期时间戳（可为 `NULL`），索引 `idx_cache_expires_at` |
| `created_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP`，索引 `idx_cache_updated_at` |

**键前缀路由（`isCacheKey`）与过期策略（`computeCacheExpiresAt`）**：

| 键 / 前缀 | 用途 | `expires_at` 计算策略 |
| :--- | :--- | :--- |
| `node_cache_subscription_*` | 单机场保护性节点回退缓存 | **`NULL`（不过期自动清除）**，仅随订阅删除或孤儿清理移除 |
| `node_cache_*` | 聚合节点缓存（如 profile / token） | `timestamp + 24h`（`NODE_CACHE_CLEANUP_AGE_MS`） |
| `node_inspect_*` | 节点 DoH/Geo 探测结果缓存 | 取 `expiresAt`，默认 `+6h` |
| `transform_template_*` | 远端模板解析缓存 | `timestamp + 24h` |
| `github_release_*` / `appstore_release_*` | GitHub / App Store 版本代理缓存 | `timestamp + 7d`（`GITHUB_RELEASE_MAX_AGE_MS`） |
| `tg_push_rate:*` | Telegram Bot 分钟/日限流计数器 | 取 `expiresAt`，默认 `+1h` |
| `auth_login_rate:*` | 登录失败频控计数器 | 取 `expiresAt`，默认 `+15m` |
| `misub_webdav_backup_lock` | WebDAV 自动备份分布式锁 | 取 `expiresAt`，默认 `+1h`（任务侧 TTL 10m） |
| `misub_webdav_backup_last_checked` | 自动备份检查节流记录 | 取 `expiresAt`，默认 `+7d` |
| `misub_restore_snapshot_latest` | 备份恢复前自动快照 | `NULL` |
| `cron_last_execution` / `sub_edge_cache_version` | Cron 执行记录与边缘缓存全局版本号 | `NULL` |
| `misub_test_*` | 测试临时键 | `+5m` |

### 2.7 `access_logs`（订阅访问日志）

| 列名 | 类型 | 约束 / 说明 |
| :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` |
| `timestamp` | `INTEGER` | `NOT NULL`（毫秒时间戳），降序索引 `idx_access_logs_timestamp` |
| `data` | `TEXT` | `NOT NULL`，JSON 字符串（包含脱敏后的 `token`、`clientIp`、`geoInfo`、`format`、`details`） |
| `created_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP` |

### 2.8 `error_reports`（前端异常上报）

| 列名 | 类型 | 约束 / 说明 |
| :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` |
| `timestamp` | `INTEGER` | `NOT NULL`（毫秒时间戳），降序索引 `idx_error_reports_timestamp` |
| `data` | `TEXT` | `NOT NULL`，JSON 字符串（`message`、`stack`、`context`、`url`、`userAgent`、`ip`） |
| `created_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP` |

---

## 3. 运行时自动迁移与变更命令

### 3.1 运行时 `ensureD1Schema` 幂等自愈

当 D1 查询捕获到缺表或缺少索引列错误（`isNoSuchTableError` / `isSchemaMismatchError`）时，`functions/storage/d1-schema.ts` 会自动触发 `ensureD1Schema(d1Db)`：
1. 执行全部 8 条 `CREATE TABLE IF NOT EXISTS`；
2. 尝试通过 `D1_COLUMN_MIGRATIONS`（`ALTER TABLE ... ADD COLUMN`）为旧库补齐 `profiles.custom_id`、`profiles.link_id`、`cache.expires_at`；
3. 使用 `json_extract(data, '$.customId')` / `json_extract(data, '$.linkId')` 回填存量索引列；
4. 重建所有 11 个索引并在 `WeakSet` 中标记该 `D1Database` 实例已初始化。

### 3.2 修改表结构时的同步规范与迁移命令

新增数据表、索引列或缓存键前缀时，必须同步更新以下三处：
1. `schema.sql`（全量初始化脚本）；
2. `functions/storage/d1-schema.ts`（表语句、列迁移数组与键路由规则）；
3. `tests/helpers/memory-d1.js`（本地单元与 E2E 测试内存数据库桩）。

执行本地与生产环境 Schema 同步：

```bash
# 本地 D1 初始化 / 迁移
npx wrangler d1 execute misub --file=schema.sql --local

# 远程生产 D1 初始化 / 迁移
npx wrangler d1 execute misub --file=schema.sql --remote
```
