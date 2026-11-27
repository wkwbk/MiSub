import { QueryClient, useQueryClient } from '@tanstack/vue-query';
import { getActivePinia } from 'pinia';
import type { Pinia } from 'pinia';
import { getCurrentInstance } from 'vue';
import type { App } from 'vue';
import { TIMING } from '@/constants/timing.js';

export interface AccessLogsFilter {
  profileId?: string;
  profileName?: string;
}

export const QUERY_KEYS = {
  appData: ['app', 'data'] as const,
  settings: ['app', 'settings'] as const,
  ruleTemplates: ['app', 'ruleTemplates'] as const,
  publicProfiles: ['public', 'profiles'] as const,
  accessLogsRoot: ['app', 'accessLogs'] as const,
  accessLogs: (filter: AccessLogsFilter = {}) =>
    ['app', 'accessLogs', filter?.profileId || '', filter?.profileName || ''] as const,
  githubRelease: (repo: string) => ['github', 'release', repo] as const,
  webdavRemoteFiles: ['app', 'webdav', 'remoteFiles'] as const,
};

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: TIMING.CACHE_TTL_MS,
        gcTime: TIMING.CACHE_TTL_MS * 2,
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const appQueryClient = createAppQueryClient();

const piniaQueryClients = new WeakMap<Pinia, QueryClient>();
const appInstanceQueryClients = new WeakMap<App, QueryClient>();

export function bindPiniaQueryClient(
  pinia: Pinia | null | undefined,
  queryClient: QueryClient,
): QueryClient {
  if (pinia && queryClient) {
    piniaQueryClients.set(pinia, queryClient);
  }
  return queryClient;
}

export function resolvePiniaQueryClient(pinia: Pinia | undefined = getActivePinia()): QueryClient {
  if (!pinia) {
    return appQueryClient;
  }
  let client = piniaQueryClients.get(pinia);
  if (!client) {
    client = createAppQueryClient();
    piniaQueryClients.set(pinia, client);
  }
  return client;
}

export function resolveComponentQueryClient(): QueryClient {
  const instance = getCurrentInstance();
  const instanceProvides = (instance as { provides?: Record<PropertyKey, unknown> } | null)?.provides;
  const hasInjectedClient = Boolean(
    instanceProvides?.VUE_QUERY_CLIENT || instance?.appContext?.provides?.VUE_QUERY_CLIENT,
  );
  if (hasInjectedClient) {
    try {
      const injected = useQueryClient();
      if (injected) return injected;
    } catch {}
  }

  const vueApp = instance?.appContext?.app;
  if (vueApp) {
    let appClient = appInstanceQueryClients.get(vueApp);
    if (!appClient) {
      appClient = resolvePiniaQueryClient();
      appInstanceQueryClients.set(vueApp, appClient);
    }
    return appClient;
  }

  return resolvePiniaQueryClient();
}
