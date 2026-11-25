/**
 * 系统保留一级路径列表（前后端共用）
 * 这些路径会与前端路由或后端 API / 静态资源路径冲突，
 * 不允许用作自定义登录路径或订阅 URL 路径（默认订阅路径 /sub 除外）。
 */
const RESERVED_PATH_ROOTS = Object.freeze([
  'settings',
  'login',
  'groups',
  'nodes',
  'subscriptions',
  'dashboard',
  'api',
  'explore',
  'sub',
  'cron',
  'assets',
  '@vite',
  'public',
  'profile',
  'offline',
  'logout',
  'auth_debug',
  'auth_check',
  'data',
  'clients',
  'system',
  'github',
  'telegram',
  'test_notification',
  'misubs',
  'node_count',
  'fetch_external_url',
  'batch_update_nodes',
  'subscription_nodes',
  'debug_subscription',
  'preview',
]);

const RESERVED_PATH_ROOT_SET: ReadonlySet<string> = new Set(RESERVED_PATH_ROOTS);

/**
 * 提取路径或 Token 的一级路径段（小写）
 */
export function getPathRootSegment(value: string): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^\/+/, '').split('/')[0].toLowerCase();
}

/**
 * 判断输入值的一级路径段是否命中系统保留路径
 */
export function isReservedPathRoot(value: string): boolean {
  const segment = getPathRootSegment(value);
  return Boolean(segment && RESERVED_PATH_ROOT_SET.has(segment));
}

/**
 * 规范化订阅 URL 路径前缀（去除首尾斜杠和空白，空值回退为默认 'sub'）
 */
export function normalizeSubPath(value: unknown, fallback = 'sub'): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
  return trimmed || fallback;
}

/**
 * 判断输入值是否命中订阅 URL 路径保留字（允许默认路径 'sub'，拒绝其余系统保留路径）
 */
export function isReservedSubPath(value: string): boolean {
  const segment = getPathRootSegment(value);
  return Boolean(segment && segment !== 'sub' && RESERVED_PATH_ROOT_SET.has(segment));
}
