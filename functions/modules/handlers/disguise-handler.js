import { createDisguiseResponse } from '../disguise-page.js';
import { authMiddleware } from '../auth-middleware.js';
import { normalizeLoginPath } from '../utils.js';

export async function handleDisguiseRequest(context, preloadedSettings = null) {
  const { request, env } = context;
  const url = new URL(request.url);

  let settings = preloadedSettings;
  if (!settings) {
    const { StorageFactory } = await import('../../storage-adapter.js');
    const { STORAGE_KEY_SETTINGS } = await import('../config.js');
    const storageAdapter = StorageFactory.createAdapter(env);
    const settingsData = await storageAdapter.get(STORAGE_KEY_SETTINGS);
    settings = settingsData || {};
  }

  const disguise = settings.disguise;
  if (!disguise || !disguise.enabled) {
    return null;
  }

  // 允许访问当前实际配置的登录路径（/login 已在入口处针对自定义路径场景拦截）
  if (url.pathname === normalizeLoginPath(settings?.customLoginPath)) {
    return null;
  }

  const isAuthenticated = await authMiddleware(request, env);
  if (isAuthenticated) {
    return null;
  }

  const isPublicAccessAllowed = settings.enablePublicPage && (url.pathname === '/' || url.pathname === '/explore');
  if (isPublicAccessAllowed) {
    return null;
  }

  return createDisguiseResponse(disguise, request.url);
}
