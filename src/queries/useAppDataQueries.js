import { useMutation, useQuery } from '@tanstack/vue-query';
import { api } from '@/lib/http.js';
import { QUERY_KEYS, resolveComponentQueryClient } from '@/lib/query-client.js';
import { createStorageCache } from '@/utils/cache-helper.js';
import { TIMING } from '@/constants/timing.js';
import { DEFAULT_SETTINGS } from '@/constants/default-settings.js';
import { getItemTags, hydrateItemTags } from '@/utils/tags.js';

const dataCache = createStorageCache('misub_data_cache', TIMING.CACHE_TTL_MS);

function sanitizeConfigForCache(config = {}) {
  if (!config || typeof config !== 'object') return {};
  const sanitized = { ...config };
  delete sanitized.botToken;
  delete sanitized.cronSecret;

  if (sanitized.webdavBackup && typeof sanitized.webdavBackup === 'object') {
    const { password: _omitPassword, ...restWebdav } = sanitized.webdavBackup;
    sanitized.webdavBackup = restWebdav;
  }
  if (sanitized.shortLink && typeof sanitized.shortLink === 'object') {
    const { apiToken: _omitApiToken, ...restShortLink } = sanitized.shortLink;
    sanitized.shortLink = restShortLink;
  }
  if (sanitized.turnstile && typeof sanitized.turnstile === 'object') {
    const { secretKey: _omitSecretKey, ...restTurnstile } = sanitized.turnstile;
    sanitized.turnstile = restTurnstile;
  }
  if (sanitized.telegramPushConfig && typeof sanitized.telegramPushConfig === 'object') {
    const {
      botToken: _omitPushBotToken,
      webhookSecret: _omitWebhookSecret,
      ...restPushConfig
    } = sanitized.telegramPushConfig;
    sanitized.telegramPushConfig = restPushConfig;
  }
  if (sanitized.externalApi && typeof sanitized.externalApi === 'object') {
    sanitized.externalApi = {
      ...sanitized.externalApi,
      tokens: Array.isArray(sanitized.externalApi.tokens)
        ? sanitized.externalApi.tokens.map(({ token: _omitToken, ...restToken }) => restToken)
        : [],
    };
  }

  return sanitized;
}

function normalizeAppDataSnapshot(rawData, fallbackConfig = null) {
  if (!rawData || typeof rawData !== 'object') return null;

  const misubs = (rawData.misubs || []).map((sub) => hydrateItemTags({ ...sub, isUpdating: false }));
  const profiles = (rawData.profiles || []).map((profile) => ({
    ...profile,
    tags: getItemTags(profile),
  }));
  const ruleTemplates = Array.isArray(rawData.ruleTemplates) ? rawData.ruleTemplates : [];
  const config =
    rawData.config && typeof rawData.config === 'object'
      ? { ...DEFAULT_SETTINGS, ...rawData.config }
      : fallbackConfig
        ? { ...DEFAULT_SETTINGS, ...fallbackConfig }
        : { ...DEFAULT_SETTINGS };
  const dataRevision = typeof rawData.dataRevision === 'string' ? rawData.dataRevision : '';

  return {
    misubs,
    profiles,
    ruleTemplates,
    config,
    dataRevision,
  };
}

function persistAppDataToSessionCache(snapshot) {
  if (!snapshot) return;
  dataCache.set({
    misubs: (snapshot.misubs || []).map((s) => {
      const { isUpdating: _isUpdating, ...rest } = s;
      return rest;
    }),
    profiles: snapshot.profiles || [],
    ruleTemplates: snapshot.ruleTemplates || [],
    dataRevision: snapshot.dataRevision || '',
    config: sanitizeConfigForCache(snapshot.config || {}),
  });
}

function readSessionCachedAppData() {
  return dataCache.get();
}

function syncSessionCachedConfig(nextConfig) {
  const cachedData = dataCache.get();
  if (!cachedData) return;

  dataCache.set({
    ...cachedData,
    config: sanitizeConfigForCache({
      ...cachedData.config,
      ...nextConfig,
    }),
  });
}

async function fetchAppDataPayload() {
  const data = await api.get('/api/data');
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

export function hydrateAppDataInQueryClient(queryClient, rawData, fallbackConfig = null) {
  const normalized = normalizeAppDataSnapshot(rawData, fallbackConfig);
  if (!normalized) return null;
  if (queryClient) {
    queryClient.setQueryData(QUERY_KEYS.appData, normalized);
  }
  persistAppDataToSessionCache(normalized);
  return normalized;
}

export async function fetchAppDataWithQueryClient(queryClient, { forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const queryCached = queryClient?.getQueryData(QUERY_KEYS.appData);
    if (queryCached) {
      return { data: queryCached, fromCache: true };
    }
    const sessionCached = readSessionCachedAppData();
    if (sessionCached) {
      const normalized = hydrateAppDataInQueryClient(queryClient, sessionCached);
      return { data: normalized, fromCache: true };
    }
  } else if (queryClient) {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.appData });
  }

  const rawData = await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.appData,
    staleTime: forceRefresh ? 0 : TIMING.CACHE_TTL_MS,
    queryFn: fetchAppDataPayload,
  });

  const normalized = hydrateAppDataInQueryClient(queryClient, rawData);
  return { data: normalized, fromCache: false };
}

export async function saveMisubsWithQueryClient(queryClient, payload, { fallbackConfig = null } = {}) {
  await queryClient.cancelQueries({ queryKey: QUERY_KEYS.appData });
  const previousSnapshot = queryClient.getQueryData(QUERY_KEYS.appData);

  if (previousSnapshot) {
    queryClient.setQueryData(QUERY_KEYS.appData, {
      ...previousSnapshot,
      misubs: payload.misubs,
      profiles: payload.profiles,
    });
  }

  try {
    const result = await api.post('/api/misubs', payload);
    if (!result?.success) {
      throw new Error(result?.message || 'Save failed');
    }

    const nextMisubs = result.data?.misubs || payload.misubs;
    const nextProfiles = result.data?.profiles || payload.profiles;
    const nextRevision =
      typeof result.dataRevision === 'string' ? result.dataRevision : previousSnapshot?.dataRevision || '';
    const nextSnapshot = {
      misubs: nextMisubs,
      profiles: nextProfiles,
      ruleTemplates: previousSnapshot?.ruleTemplates || [],
      config: previousSnapshot?.config || fallbackConfig || {},
      dataRevision: nextRevision,
    };

    queryClient.setQueryData(QUERY_KEYS.appData, nextSnapshot);
    persistAppDataToSessionCache(nextSnapshot);
    return result;
  } catch (error) {
    if (previousSnapshot !== undefined) {
      queryClient.setQueryData(QUERY_KEYS.appData, previousSnapshot);
    }
    if (error?.status === 409 && error?.data?.code === 'DATA_CONFLICT') {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.appData });
    }
    throw error;
  }
}

export async function saveSettingsWithQueryClient(
  queryClient,
  newSettings,
  { preferencesOnly = false, currentConfig = {} } = {},
) {
  await queryClient.cancelQueries({ queryKey: QUERY_KEYS.appData });
  const previousSnapshot = queryClient.getQueryData(QUERY_KEYS.appData);

  const mergedConfig = { ...currentConfig, ...newSettings };
  if (previousSnapshot) {
    queryClient.setQueryData(QUERY_KEYS.appData, {
      ...previousSnapshot,
      config: { ...previousSnapshot.config, ...newSettings },
    });
  }

  try {
    const result = await api.post(
      '/api/settings',
      newSettings,
      preferencesOnly ? { headers: { 'X-MiSub-Save-Scope': 'preferences' } } : {},
    );
    if (!result?.success) {
      throw new Error(result?.message || 'Failed to save settings');
    }
    syncSessionCachedConfig(mergedConfig);
    return result;
  } catch (error) {
    if (previousSnapshot !== undefined) {
      queryClient.setQueryData(QUERY_KEYS.appData, previousSnapshot);
    }
    throw error;
  }
}

export async function fetchRuleTemplatesWithQueryClient(queryClient) {
  const result = await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.ruleTemplates,
    staleTime: 0,
    queryFn: async () => {
      const response = await api.get('/api/rule_templates');
      return Array.isArray(response?.data) ? response.data : [];
    },
  });
  const currentAppData = queryClient.getQueryData(QUERY_KEYS.appData);
  if (currentAppData) {
    queryClient.setQueryData(QUERY_KEYS.appData, {
      ...currentAppData,
      ruleTemplates: result,
    });
  }
  return result;
}

export async function saveRuleTemplatesWithQueryClient(queryClient, templates) {
  const result = await api.post('/api/rule_templates', { templates });
  if (!result?.success) {
    throw new Error(result?.message || 'Failed to save rule templates');
  }
  const savedList = Array.isArray(result.data) ? result.data : [];
  queryClient.setQueryData(QUERY_KEYS.ruleTemplates, savedList);
  const currentAppData = queryClient.getQueryData(QUERY_KEYS.appData);
  if (currentAppData) {
    queryClient.setQueryData(QUERY_KEYS.appData, {
      ...currentAppData,
      ruleTemplates: savedList,
    });
  }
  return savedList;
}

export function clearAppDataQueryCache(queryClient) {
  dataCache.clear();
  if (queryClient) {
    queryClient.removeQueries({ queryKey: QUERY_KEYS.appData });
    queryClient.removeQueries({ queryKey: QUERY_KEYS.ruleTemplates });
  }
}

/**
 * 声明式 TanStack Vue Query Hooks（供视图或组件直接使用）
 */
export function useAppDataQuery(options = {}) {
  const queryClient = options.queryClient || resolveComponentQueryClient();
  return useQuery(
    {
      queryKey: QUERY_KEYS.appData,
      queryFn: async () => normalizeAppDataSnapshot(await fetchAppDataPayload()),
      ...options,
    },
    queryClient,
  );
}

export function useSaveMisubsMutation(options = {}) {
  const queryClient = options.queryClient || resolveComponentQueryClient();
  return useMutation(
    {
      mutationFn: (payload) => saveMisubsWithQueryClient(queryClient, payload),
      ...options,
    },
    queryClient,
  );
}

export function useSaveSettingsMutation(options = {}) {
  const queryClient = options.queryClient || resolveComponentQueryClient();
  return useMutation(
    {
      mutationFn: ({ settings, preferencesOnly = false, currentConfig = {} }) =>
        saveSettingsWithQueryClient(queryClient, settings, { preferencesOnly, currentConfig }),
      ...options,
    },
    queryClient,
  );
}
