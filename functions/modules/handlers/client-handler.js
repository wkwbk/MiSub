import { StorageFactory } from '../../storage-adapter.js';
import { SETTINGS_KEYS } from '../../storage/d1-schema.js';
import { DEFAULT_PUBLIC_CLIENTS_CONFIG, normalizePublicClientsConfig } from '../../../shared/default-public-clients.js';
import { isStorageUnavailableError } from '../api-handler.js';
import { createErrorResponse, createJsonResponse, generateId, JSON_BODY_LIMITS, readJsonWithLimit } from '../utils.js';

export const STORAGE_KEY_CLIENTS = SETTINGS_KEYS.CLIENTS;
const MAX_ICON_DATA_URL_BYTES = 200 * 1024;

async function getStorageAdapter(env) {
  return StorageFactory.createAdapter(env);
}

function validateIconsSize(items = []) {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    if (typeof item?.icon === 'string' && item.icon.startsWith('data:')) {
      if (item.icon.length > MAX_ICON_DATA_URL_BYTES) {
        return 'Icon data URL is too large (max 200KB)';
      }
    }
  }
  return null;
}

export async function getPublicClientsConfig(storageAdapter) {
  if (!storageAdapter || storageAdapter.type === 'noop') {
    return normalizePublicClientsConfig(DEFAULT_PUBLIC_CLIENTS_CONFIG);
  }
  const stored = await storageAdapter.get(STORAGE_KEY_CLIENTS);
  if (stored && (typeof stored === 'object' || Array.isArray(stored))) {
    return normalizePublicClientsConfig(stored);
  }
  return normalizePublicClientsConfig(DEFAULT_PUBLIC_CLIENTS_CONFIG);
}

export async function handleClientRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const storageAdapter = await getStorageAdapter(env);
  const isStorageUnavailable = !storageAdapter || storageAdapter.type === 'noop';

  try {
    if (request.method === 'GET') {
      if (isStorageUnavailable) {
        return createJsonResponse({
          success: true,
          data: normalizePublicClientsConfig(DEFAULT_PUBLIC_CLIENTS_CONFIG),
          storageUnavailable: true,
        });
      }
      try {
        const data = await getPublicClientsConfig(storageAdapter);
        return createJsonResponse({
          success: true,
          data,
          storageUnavailable: false,
        });
      } catch (readError) {
        if (isStorageUnavailableError(readError)) {
          return createJsonResponse({
            success: true,
            data: normalizePublicClientsConfig(DEFAULT_PUBLIC_CLIENTS_CONFIG),
            storageUnavailable: true,
            message: '存储已暂停，客户端列表已回退为内置默认值。',
          });
        }
        throw readError;
      }
    }

    if (isStorageUnavailable) {
      return createErrorResponse('存储未绑定，写操作不可用', 503);
    }

    if (request.method === 'POST') {
      if (path.endsWith('/init')) {
        const current = await getPublicClientsConfig(storageAdapter);
        const resetData = normalizePublicClientsConfig({
          enabled: current.enabled !== false,
          items: DEFAULT_PUBLIC_CLIENTS_CONFIG.items,
        });
        await storageAdapter.put(STORAGE_KEY_CLIENTS, resetData);
        return createJsonResponse({
          success: true,
          message: 'Clients initialized',
          data: resetData,
        });
      }

      let body;
      try {
        body = await readJsonWithLimit(request, JSON_BODY_LIMITS.large);
      } catch (e) {
        return createErrorResponse(e?.status === 413 ? e.message : 'Invalid JSON body', e?.status || 400);
      }

      const current = await getPublicClientsConfig(storageAdapter);
      let nextConfig;

      if (Array.isArray(body)) {
        nextConfig = { enabled: current.enabled !== false, items: body };
      } else if (body && typeof body === 'object' && ('items' in body || 'enabled' in body) && !('name' in body)) {
        nextConfig = {
          enabled: body.enabled !== undefined ? body.enabled !== false : current.enabled !== false,
          items: Array.isArray(body.items) ? body.items : current.items,
        };
      } else if (body && typeof body === 'object') {
        if (!body.name) {
          return createErrorResponse('Client name is required', 400);
        }
        const items = [...current.items];
        const index = items.findIndex((c) => c.id === body.id);
        if (index !== -1) {
          items[index] = { ...items[index], ...body };
        } else {
          items.push({ ...body, id: body.id || generateId() });
        }
        nextConfig = { enabled: current.enabled !== false, items };
      } else {
        return createErrorResponse('Invalid request payload', 400);
      }

      const iconError = validateIconsSize(nextConfig.items);
      if (iconError) {
        return createErrorResponse(iconError, 400);
      }

      const normalized = normalizePublicClientsConfig(nextConfig);
      await storageAdapter.put(STORAGE_KEY_CLIENTS, normalized);
      return createJsonResponse({ success: true, data: normalized });
    }

    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) {
        return createErrorResponse('Client ID is required', 400);
      }

      const current = await getPublicClientsConfig(storageAdapter);
      const originalLength = current.items.length;
      const nextItems = current.items.filter((c) => c.id !== id);

      if (nextItems.length === originalLength) {
        return createErrorResponse('Client not found', 404);
      }

      const normalized = normalizePublicClientsConfig({
        enabled: current.enabled !== false,
        items: nextItems,
      });
      await storageAdapter.put(STORAGE_KEY_CLIENTS, normalized);
      return createJsonResponse({ success: true, data: normalized });
    }

    return createErrorResponse('Method Not Allowed', 405);
  } catch (e) {
    console.error('[Client Handler Error]', e);
    return createErrorResponse(`Operation failed: ${e.message}`, 500);
  }
}
