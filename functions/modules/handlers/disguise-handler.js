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

  const customLoginPath = normalizeLoginPath(settings?.customLoginPath);
  const defaultLoginPath = '/login';
  const hasCustomLoginPath = customLoginPath !== defaultLoginPath;

  // [Fix #400] 当设置了自定义登录路径后，访问 /login 不应重定向到自定义路径，
  // 否则会暴露隐藏的管理入口。直接返回 disguise 页面或 404。
  if (hasCustomLoginPath && url.pathname === defaultLoginPath) {
    const disguiseResponse = createDisguiseResponse(settings?.disguise, request.url);
    if (disguiseResponse) return disguiseResponse;
    return new Response('Not Found', { status: 404 });
  }
  if (url.pathname === customLoginPath) {
    return null;
  }

  if (!disguise || !disguise.enabled) {
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
