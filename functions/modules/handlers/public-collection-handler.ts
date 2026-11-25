import {
  DEFAULT_PUBLIC_CLIENTS_CONFIG,
  normalizePublicClientsConfig,
  type PublicClientItem,
  type PublicClientsConfig,
} from '@misub/core/domain/default-public-clients.js';
import {
  DEFAULT_PUBLIC_CORES_CONFIG,
  normalizePublicCoresConfig,
  type PublicCoreItem,
  type PublicCoresConfig,
} from '@misub/core/domain/default-public-cores.js';
import {
  DEFAULT_PUBLIC_LINKS_CONFIG,
  normalizePublicLinksConfig,
  type PublicLinkItem,
  type PublicLinksConfig,
} from '@misub/core/domain/default-public-links.js';
import type { Env, StorageAdapter } from '../../types.js';
import { StorageFactory } from '../../storage-adapter.js';
import { SETTINGS_KEYS } from '../../storage/d1-schema.js';
import { isStorageUnavailableError } from '../api-handler.js';
import { createErrorResponse, createJsonResponse, generateId, JSON_BODY_LIMITS, readJsonWithLimit } from '../utils.js';

const MAX_ICON_DATA_URL_BYTES = 200 * 1024;

interface CollectionConfigBase<TItem extends { id: string }> {
  enabled: boolean;
  items: TItem[];
}

interface PublicCollectionHandlerOptions<TItem extends { id: string }, TConfig extends CollectionConfigBase<TItem>> {
  storageKey: string;
  defaultConfig: TConfig;
  normalizeConfig: (value: unknown) => TConfig;
  logTag: string;
  fallbackMessage: string;
  initMessage: string;
  entityLabel: string;
  allowArrayStored?: boolean;
  requireIdOnDelete?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate inline base64/data-URI icons inside public item arrays.
 */
function validateIconsSize(items: unknown[] = []): string | null {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    if (isRecord(item) && typeof item.icon === 'string' && item.icon.startsWith('data:')) {
      if (item.icon.length > MAX_ICON_DATA_URL_BYTES) {
        return 'Icon data URL is too large (max 200KB)';
      }
    }
  }
  return null;
}

/**
 * Build GET/POST/DELETE config reader + HTTP handler for array-backed public settings collections
 * (clients, public cores, public links).
 */
function createPublicCollectionHandler<TItem extends { id: string }, TConfig extends CollectionConfigBase<TItem>>({
  storageKey,
  defaultConfig,
  normalizeConfig,
  logTag,
  fallbackMessage,
  initMessage,
  entityLabel,
  allowArrayStored = false,
  requireIdOnDelete = false,
}: PublicCollectionHandlerOptions<TItem, TConfig>) {
  async function getConfig(storageAdapter: StorageAdapter | null | undefined): Promise<TConfig> {
    if (!storageAdapter || storageAdapter.type === 'noop') {
      return normalizeConfig(defaultConfig);
    }
    const stored = await storageAdapter.get(storageKey);
    if (stored && (typeof stored === 'object' || (allowArrayStored && Array.isArray(stored)))) {
      return normalizeConfig(stored);
    }
    return normalizeConfig(defaultConfig);
  }

  async function handleRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const storageAdapter = StorageFactory.createAdapter(env) as unknown as StorageAdapter;
    const isStorageUnavailable = !storageAdapter || storageAdapter.type === 'noop';

    try {
      if (request.method === 'GET') {
        if (isStorageUnavailable) {
          return createJsonResponse({
            success: true,
            data: normalizeConfig(defaultConfig),
            storageUnavailable: true,
          });
        }
        try {
          const data = await getConfig(storageAdapter);
          return createJsonResponse({
            success: true,
            data,
            storageUnavailable: false,
          });
        } catch (readError: unknown) {
          if (isStorageUnavailableError(readError)) {
            return createJsonResponse({
              success: true,
              data: normalizeConfig(defaultConfig),
              storageUnavailable: true,
              message: fallbackMessage,
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
          const current = await getConfig(storageAdapter);
          const resetData = normalizeConfig({
            enabled: current.enabled !== false,
            items: defaultConfig.items,
          });
          await storageAdapter.put(storageKey, resetData);
          return createJsonResponse({
            success: true,
            message: initMessage,
            data: resetData,
          });
        }

        let body: unknown;
        try {
          body = await readJsonWithLimit(request, JSON_BODY_LIMITS.large);
        } catch (e: unknown) {
          const status = isRecord(e) && typeof e.status === 'number' ? e.status : 400;
          const message = e instanceof Error ? e.message : 'Invalid JSON body';
          return createErrorResponse(status === 413 ? message : 'Invalid JSON body', status);
        }

        const current = await getConfig(storageAdapter);
        let nextConfig: { enabled: boolean; items: unknown[] };

        if (Array.isArray(body)) {
          nextConfig = { enabled: current.enabled !== false, items: body };
        } else if (isRecord(body) && ('items' in body || 'enabled' in body) && !('name' in body)) {
          nextConfig = {
            enabled: body.enabled !== undefined ? body.enabled !== false : current.enabled !== false,
            items: Array.isArray(body.items) ? body.items : current.items,
          };
        } else if (isRecord(body)) {
          if (!body.name) {
            return createErrorResponse(`${entityLabel} name is required`, 400);
          }
          const items: Array<Record<string, unknown>> = [...current.items];
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

        const normalized = normalizeConfig(nextConfig);
        await storageAdapter.put(storageKey, normalized);
        return createJsonResponse({ success: true, data: normalized });
      }

      if (request.method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (requireIdOnDelete && !id) {
          return createErrorResponse(`${entityLabel} ID is required`, 400);
        }

        const current = await getConfig(storageAdapter);
        const originalLength = current.items.length;
        const nextItems = current.items.filter((c) => c.id !== id);

        if (nextItems.length === originalLength) {
          return createErrorResponse(`${entityLabel} not found`, 404);
        }

        const normalized = normalizeConfig({
          enabled: current.enabled !== false,
          items: nextItems,
        });
        await storageAdapter.put(storageKey, normalized);
        return createJsonResponse({ success: true, data: normalized });
      }

      return createErrorResponse('Method Not Allowed', 405);
    } catch (e: unknown) {
      console.error(`[${logTag} Error]`, e);
      const message = e instanceof Error ? e.message : String(e);
      return createErrorResponse(`Operation failed: ${message}`, 500);
    }
  }

  return { getConfig, handleRequest };
}

export const { handleRequest: handleClientRequest } = createPublicCollectionHandler<
  PublicClientItem,
  PublicClientsConfig
>({
  storageKey: SETTINGS_KEYS.CLIENTS,
  defaultConfig: DEFAULT_PUBLIC_CLIENTS_CONFIG,
  normalizeConfig: normalizePublicClientsConfig,
  logTag: 'Client Handler',
  fallbackMessage: '存储已暂停，客户端列表已回退为内置默认值。',
  initMessage: 'Clients initialized',
  entityLabel: 'Client',
  allowArrayStored: true,
  requireIdOnDelete: true,
});

export const { handleRequest: handlePublicCoresRequest } = createPublicCollectionHandler<
  PublicCoreItem,
  PublicCoresConfig
>({
  storageKey: SETTINGS_KEYS.PUBLIC_CORES,
  defaultConfig: DEFAULT_PUBLIC_CORES_CONFIG,
  normalizeConfig: normalizePublicCoresConfig,
  logTag: 'PublicCores Handler',
  fallbackMessage: '存储已暂停，代理内核列表已回退为内置默认值。',
  initMessage: 'Public cores initialized',
  entityLabel: 'Core',
  requireIdOnDelete: true,
});

export const { handleRequest: handlePublicLinksRequest } = createPublicCollectionHandler<
  PublicLinkItem,
  PublicLinksConfig
>({
  storageKey: SETTINGS_KEYS.PUBLIC_LINKS,
  defaultConfig: DEFAULT_PUBLIC_LINKS_CONFIG,
  normalizeConfig: normalizePublicLinksConfig,
  logTag: 'PublicLinks Handler',
  fallbackMessage: '存储已暂停，导航链接列表已回退为内置默认值。',
  initMessage: 'Public links initialized',
  entityLabel: 'Link',
  requireIdOnDelete: true,
});
