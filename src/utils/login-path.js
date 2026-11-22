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
