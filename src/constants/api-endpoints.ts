/**
 * API端点定义常量
 * @author MiSub Team
 */

export const API_ENDPOINTS = {
  // 认证相关
  LOGIN: '/api/login',
  LOGOUT: '/api/logout',

  // 数据与设置相关
  DATA: '/api/data',
  MISUBS: '/api/misubs',
  SETTINGS: '/api/settings',
  SETTINGS_RESET: '/api/settings/reset',
  SETTINGS_ROTATE_TOKEN: '/api/settings/rotate_token',
  RULE_TEMPLATES: '/api/rule_templates',
  LOGS: '/api/logs',

  // 订阅与节点相关
  SUB_NODES: '/api/subscription_nodes',
  NODE_COUNT: '/api/node_count',
  NODES_INSPECT: '/api/nodes/inspect',
  NODES_TCPING: '/api/nodes/tcping',
  FETCH_EXTERNAL: '/api/fetch_external_url',
  PARSE_SUBSCRIPTION: '/api/parse_subscription',
  BATCH_UPDATE: '/api/batch_update_nodes',
  DETECT_AIRPORT_NAME: '/api/detect_airport_name',

  // 转换与短链服务
  SUBCONVERTER_TEST: '/api/subconverter/test',
  SUBCONVERTER_CONFIG: '/api/subconverter-config',
  SHORTLINK_TEST: '/api/shortlink/test',
  SHORTLINK_CREATE: '/api/shortlink/create',

  // 备份与 WebDAV
  BACKUP_EXPORT: '/api/backup/export',
  BACKUP_RESTORE: '/api/backup/restore',
  BACKUP_WEBDAV_TEST: '/api/backup/webdav/test',
  BACKUP_WEBDAV_RUN: '/api/backup/webdav/run',
  BACKUP_WEBDAV_LIST: '/api/backup/webdav/list',
  BACKUP_WEBDAV_RESTORE: '/api/backup/webdav/restore',

  // 通知与 Telegram
  TEST_NOTIFICATION: '/api/test_notification',
  TELEGRAM_SETUP: '/api/telegram/setup',
  TELEGRAM_WEBHOOK: '/api/telegram/webhook',

  // 公开页与管理资源
  PUBLIC_CONFIG: '/api/public_config',
  PUBLIC_PROFILES: '/api/public/profiles',
  PUBLIC_PREVIEW: '/api/public/preview',
  PUBLIC_GUESTBOOK: '/api/public/guestbook',
  GUESTBOOK_MANAGE: '/api/guestbook/manage',
  CLIENTS: '/api/clients',
  PUBLIC_CORES: '/api/public_cores',
  PUBLIC_LINKS: '/api/public_links',
  GITHUB_RELEASE: '/api/github/release',
  APPSTORE_RELEASE: '/api/appstore/release',

  // 订阅访问
  SUB_BASE: '/sub',
  SUB_PROFILE: '/:subPath/:profileId',
  SUB_DIRECT: '/:subPath/:token',
} as const;
