---
title: WebDAV 备份与 Telegram Bot
description: WebDAV 自动备份与安全恢复机制（含定时任务与敏感字段脱敏说明），以及 Telegram 告警通知与 Bot Webhook 双向管理命令指南。
---

# WebDAV 备份与 Telegram Bot

## WebDAV 备份与恢复

MiSub 在 `functions/modules/handlers/webdav-backup-handler.ts` 中实现了本地 JSON 导出导入与远程 WebDAV 自动备份/轮转清理/恢复功能。

### 1. 安全限制与配置项

所有 WebDAV 请求均使用 HTTP Basic Auth，并在服务端执行严格限制：

- **强制 HTTPS**：`endpoint` 必须以 `https://` 开头（`assertSafeWebdavConfig`）。
- **自动建目录**：上传前会按 `remotePath` 路径段逐级发送 `MKCOL` 创建远端目录。

`webdavBackup` 配置项（定义于 `packages/core/src/schemas/entities.ts`）：

| 字段 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `enabled` | `false` | 是否启用 WebDAV 备份 |
| `endpoint` | `""` | WebDAV 服务地址（必须为 `https://` 开头） |
| `username` / `password` | `""` | WebDAV 认证凭据 |
| `remotePath` | `"/MiSub"` | 远端存储目录 |
| `filenameTemplate` | `"misub-backup-{datetime}.json"` | 文件名模板，支持 `{datetime}` 与 `{date}`（按 UTC+8 生成） |
| `backupScope` | `"dataOnly"` | 备份范围：`dataOnly`（订阅、节点、订阅组、规则模板）或 `dataAndSettings`（含非敏感全局设置与公开页配置） |
| `autoBackup` | `false` | 是否开启自动定时备份 |
| `interval` | `"daily"` | 自动备份周期：`hourly`、`daily`、`weekly`、`monthly` |
| `retentionCount` | `7` | 远端历史备份保留数量（范围 `1–100`），超出后通过 `PROPFIND` + `DELETE` 清理最旧的 `misub-backup-*.json` |

### 2. 敏感字段自动脱敏

即使选择 `dataAndSettings` 范围，备份导出（`sanitizeSettingsForBackup`）与恢复写入（`sanitizeSettingsForRestore`）也会自动剥离以下运行态与高敏字段，防止凭据外泄或覆盖当前实例配置：

- `webdavBackup`（恢复时显式保留当前实例的 `webdavBackup` 设置）
- `adminPassword` / `ADMIN_PASSWORD` / `password`
- `cookieSecret` / `COOKIE_SECRET` / `sessionSecret`
- `githubToken` / `GITHUB_TOKEN`
- `lastBackupAt` / `lastBackupStatus` / `lastBackupMessage` / `lastBackupFile`

### 3. 触发方式与并发锁

- **后台 API 手动操作**（需管理员会话）：
  - `POST /api/backup/webdav/test`：测试连接并确保远端目录存在；
  - `POST /api/backup/webdav/run`：立即执行一次 WebDAV 备份；
  - `GET /api/backup/webdav/list`：列出远端备份文件；
  - `POST /api/backup/webdav/restore`：从指定远端路径或上传的 Payload 恢复；
  - `POST /api/backup/export` & `POST /api/backup/restore`：本地 JSON 导出与恢复。
- **定时任务自动触发**：
  - **Cloudflare Workers 原生 Cron**：`wrangler.jsonc` 默认在每日 UTC `02:00`（`"0 2 * * *"`，北京时间 `10:00`）调用 `handleCronBackupTrigger`。
  - **外部 HTTP Cron**：请求 `GET/POST /cron/backup`（推荐携带请求头 `Authorization: Bearer <CRON_SECRET>`，兼容 `?secret=<CRON_SECRET>`）。
- **分布式防重入锁**：自动备份执行前会在 D1 中写入 `misub_webdav_backup_lock`（TTL 10 分钟），防止并发定时任务重复上传。

### 4. 恢复前自动快照保护

执行 `restoreBackupPayload` 时（默认 `createSnapshot !== false`），系统会先将当前线上数据备份到 D1 键 `misub_restore_snapshot_latest` 中作为回滚快照，再同步 `subscriptions`、`profiles` 与 `ruleTemplates`。

---

## Telegram 通知与 Bot 双向管理

MiSub 的 Telegram 集成包含两部分：**单向告警/Cron 推送** 与 **Webhook 双向指令管理**。

### 1. 定时告警与通知配置

在后台基础设置中填写 `botToken` 与 `chatId` 后，即可通过 `POST /api/test_notification` 发送测试消息，并在以下场景触发推送：

- **订阅临期提醒**：剩余天数 `<= notifyThresholdDays`（`default-settings.ts` 默认 `3` 天）时发送提醒，同一订阅 24 小时内不重复告警（`lastNotifiedExpire`）。
- **流量预警提醒**：已用流量百分比 `>= notifyThresholdPercent`（默认 `90%`）时发送提醒，24 小时内不重复告警（`lastNotifiedTraffic`）。
- **定时同步报告**：通过 Workers Cron（`"0 */6 * * *"`）或外部触发 `/cron/subscriptions` 刷新订阅后推送状态汇总。

### 2. Telegram Bot Webhook 双向管理

在 `telegramPushConfig` 中配置以下字段即可启用交互式 Bot：

| 配置项 | 说明 |
| :--- | :--- |
| `enabled` | 启用/禁用 Bot Webhook |
| `botToken` | Telegram Bot Token（来自 `@BotFather`） |
| `webhookSecret` | Webhook 验签密钥（仅允许 `A-Za-z0-9_-`，长度 1–256） |
| `allowedUserIds` | 允许操作 Bot 的 Telegram User ID 白名单 |
| `allowAllUsers` | 是否允许所有用户访问（默认 `false`，强烈建议仅使用白名单） |

保存设置后，调用后台接口 `POST /api/telegram/setup`（或前端保存触发 `syncTelegramPushBot`）会自动向 Telegram API 注册：
- Webhook 接收端点：`https://<你的域名>/api/telegram/webhook`
- Bot 指令菜单（`setMyCommands`）

#### 安全鉴权与频率限制

1. **Webhook Secret 强制校验（Fail-Closed）**：`handleTelegramWebhook` 要求 `config.webhookSecret` 必须已配置（缺失返回 `503`），并校验请求头 `X-Telegram-Bot-Api-Secret-Token` 是否完全匹配（不匹配返回 `401`）。
2. **用户白名单校验**：`checkUserPermission` 默认拒绝未在 `allowedUserIds` 中的用户（除非显式开启 `allowAllUsers`）。
3. **D1 分钟/日级限流**：`checkRateLimit` 在 D1 中维护 `tg_push_rate:<userId>:min` 与 `tg_push_rate:<userId>:day` 计数器，防止刷屏与滥用。

### 3. Bot 命令速查表

直接向 Bot 发送节点 URI（支持多行批量）或包含节点的文本/图片文件即可自动导入；常用斜杠命令如下：

| 类别 | 命令与别名 | 说明 |
| :--- | :--- | :--- |
| **基础与菜单** | `/start`、`/help`、`/menu` | 初始化欢迎、查看帮助、打开内联快捷按钮面板 |
| **查看与统计** | `/list [node\|sub]`、`/stats`、`/info <序号>`、`/search <词>` | 分页查看手动节点/机场列表、统计信息、节点详情与关键词搜索 |
| **订阅获取** | `/sub` | 获取已绑定订阅组的订阅链接 |
| **节点编辑** | `/enable`（`/on`）、`/disable`（`/off`）、`/rename`、`/delete`（`/del`、`/rm`） | 按序号启用、禁用、重命名或删除节点（序号支持 `1`、`1,3,5`、`all`） |
| **标签与分组** | `/tags [node\|sub]`、`/trename <旧标> <新标>`、`/bind`、`/unbind` | 管理标签、批量重命名标签、绑定/解绑默认订阅组 |
| **工具操作** | `/sort`、`/dup`（`/dedup`）、`/copy`（`/cp`）、`/export`（`/backup`）、`/import` | 一键排序、节点去重、复制节点链接、导出与导入 |
