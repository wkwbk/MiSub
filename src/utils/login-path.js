/**
 * 判断 customLoginPath 是否为有效的自定义路径。
 * 空字符串、纯斜杠、'login' 均视为无效（等同于使用默认 /login）。
 */
export function isValidCustomLoginPath(raw) {
  if (!raw || typeof raw !== 'string') return false;
  const normalized = raw.trim().replace(/^\/+/, '');
  return normalized.length > 0 && normalized !== 'login';
}

/**
 * 解析登录成功后的安全跳转路径，仅允许站内相对路径且排除登录页自身。
 */
export function resolveSafeLoginRedirect(rawRedirect, fallback = '/dashboard', disallowPaths = []) {
  const candidate = Array.isArray(rawRedirect) ? rawRedirect[0] : rawRedirect;
  if (typeof candidate !== 'string') return fallback;
  const trimmed = candidate.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback;
  }
  if (trimmed === '/login' || disallowPaths.includes(trimmed)) {
    return fallback;
  }
  return trimmed;
}
