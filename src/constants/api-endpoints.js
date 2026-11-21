/**
 * API端点定义常量
 * @author MiSub Team
 */

export const API_ENDPOINTS = {
  // 认证相关
  LOGIN: '/api/login',
  LOGOUT: '/api/logout',

  // 数据相关
  DATA: '/api/data',
  MISUBS: '/api/misubs',
  SETTINGS: '/api/settings',

  // 订阅相关
  SUB_NODES: '/api/subscription_nodes',
  NODE_COUNT: '/api/node_count',
  NODES_INSPECT: '/api/nodes/inspect',
  NODES_TCPING: '/api/nodes/tcping',
  FETCH_EXTERNAL: '/api/fetch_external_url',
  BATCH_UPDATE: '/api/batch_update_nodes',

  // 订阅访问
  SUB_BASE: '/sub',
  SUB_PROFILE: '/sub/:token/:profileId',
  SUB_DIRECT: '/sub/:token',
};
