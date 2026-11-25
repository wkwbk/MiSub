import { QueryClient, useQueryClient } from '@tanstack/vue-query';
import { getActivePinia } from 'pinia';
import { getCurrentInstance } from 'vue';
import { TIMING } from '@/constants/timing.js';

export const QUERY_KEYS = {
  appData: ['app', 'data'],
  ruleTemplates: ['app', 'ruleTemplates'],
  publicProfiles: ['public', 'profiles'],
  accessLogsRoot: ['app', 'accessLogs'],
  accessLogs: (filter = {}) => ['app', 'accessLogs', filter?.profileId || '', filter?.profileName || ''],
  githubRelease: (repo) => ['github', 'release', repo],
};

export function createAppQueryClient() {
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

const piniaQueryClients = new WeakMap();
const appInstanceQueryClients = new WeakMap();

export function bindPiniaQueryClient(pinia, queryClient) {
  if (pinia && queryClient) {
    piniaQueryClients.set(pinia, queryClient);
  }
  return queryClient;
}

export function resolvePiniaQueryClient(pinia = getActivePinia()) {
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

export function resolveComponentQueryClient() {
  const instance = getCurrentInstance();
  const hasInjectedClient = Boolean(
    instance?.provides?.VUE_QUERY_CLIENT || instance?.appContext?.provides?.VUE_QUERY_CLIENT,
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
