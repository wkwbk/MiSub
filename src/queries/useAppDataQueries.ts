import {
  useMutation,
  useQuery,
  type QueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import type {
  BuiltinTransformConfig,
  ProfileConfig,
  SettingsConfig,
  SubscriptionItem,
  SubscriptionUserInfo,
  TelegramPushConfig,
} from '@misub/core/types.js';
import { api } from '@/lib/http.js';
import { QUERY_KEYS, resolveComponentQueryClient } from '@/lib/query-client.js';
import { createStorageCache } from '@/utils/cache-helper.js';
import { TIMING } from '@/constants/timing.js';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';
import { DEFAULT_SETTINGS } from '@/constants/default-settings.js';
import { getItemTags, hydrateItemTags } from '@/utils/tags.js';

export interface StoreMisubItem {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  autoUpdate?: boolean;
  nodeCount?: number;
  exclude?: string;
  include?: string;
  customUserAgent?: string;
  fetchProxy?: string;
  plusAsSpace?: boolean;
  tags: string[];
  notes?: string;
  operators?: SubscriptionItem['operators'];
  nodeTransform?: SubscriptionItem['nodeTransform'];
  disabledNodes?: string[];
  userInfo?: SubscriptionUserInfo | null;
  lastError?: string | null;
  lastUpdate?: string | null;
  sortIndex?: number;
  configVersion?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  status?: string;
  colorTag?: string | null;
  remarks?: string;
  latency?: number | null;
  latencyMode?: string;
  lastTestedAt?: string | null;
  isUpdating?: boolean;
  enableNodeCache?: boolean;
  excludeTraffic?: boolean;
  website?: string;
  description?: string;
  remark?: string;
  note?: string;
  customId?: string;
  [key: string]: unknown;
}

export type StoreProfileConfig = ProfileConfig & {
  clashRuleLevel?: string;
  desc?: string;
  remark?: string;
};

export interface RuleTemplateItem {
  id?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  content?: string;
  [key: string]: unknown;
}

type KnownKeys<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

type DefaultSettingsShape = Omit<
  typeof DEFAULT_SETTINGS,
  | 'mergeExpireStrategy'
  | 'subFetchLimitMode'
  | 'builtinTransform'
  | 'tokenAutoRotate'
  | 'disguise'
  | 'defaultPrefixSettings'
  | 'announcement'
  | 'guestbook'
  | 'webdavBackup'
  | 'externalApi'
  | 'subconverter'
  | 'shortLink'
  | 'turnstile'
  | 'customPage'
  | 'regionOverrides'
  | 'defaultOperators'
>;

export type AppSettingsConfig = Omit<
  KnownKeys<SettingsConfig>,
  'builtinTransform' | 'telegramPushConfig' | 'mergeExpireStrategy' | 'subFetchLimitMode'
> &
  DefaultSettingsShape & {
    mergeExpireStrategy?: 'max' | 'min';
    subFetchLimitMode?: 'cache' | 'strict';
    builtinTransform?: BuiltinTransformConfig;
    customLoginPath?: string;
    clashRuleLevel?: string;
    prefixConfig?: unknown;
    prependSubName?: unknown;
    nodeTransform?: unknown;
    publicLinks?: unknown;
    publicCores?: unknown;
    telegramPushConfig?: TelegramPushConfig;
    [key: string]: unknown;
  };

export interface AppDataSnapshot {
  misubs: StoreMisubItem[];
  profiles: StoreProfileConfig[];
  ruleTemplates: RuleTemplateItem[];
  config: AppSettingsConfig;
}

export interface RawAppDataPayload {
  misubs?: StoreMisubItem[];
  profiles?: StoreProfileConfig[];
  ruleTemplates?: RuleTemplateItem[];
  config?: Partial<AppSettingsConfig> | null;
  error?: string;
  [key: string]: unknown;
}

export interface SaveSettingsResponse {
  success?: boolean;
  message?: string;
  error?: string;
  telegramSync?: {
    attempted?: boolean;
    success?: boolean;
  };
}

export interface UseAppDataQueryOptions
  extends Omit<
    UseQueryOptions<AppDataSnapshot | null, Error, AppDataSnapshot | null, typeof QUERY_KEYS.appData>,
    'queryKey' | 'queryFn'
  > {
  queryClient?: QueryClient;
}

export interface SaveSettingsMutationVariables {
  settings: Partial<AppSettingsConfig>;
  preferencesOnly?: boolean;
  currentConfig?: Partial<AppSettingsConfig>;
}

export interface UseSaveSettingsMutationOptions
  extends Omit<UseMutationOptions<SaveSettingsResponse, Error, SaveSettingsMutationVariables>, 'mutationFn'> {
  queryClient?: QueryClient;
}

const dataCache = createStorageCache('misub_data_cache', TIMING.CACHE_TTL_MS);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeConfigForCache(config: Partial<AppSettingsConfig> | Record<string, unknown> = {}): Record<string, unknown> {
  if (!isPlainRecord(config)) return {};
  const sanitized: Record<string, unknown> = { ...config };
  delete sanitized.botToken;
  delete sanitized.cronSecret;

  if (isPlainRecord(sanitized.webdavBackup)) {
    const { password: _omitPassword, ...restWebdav } = sanitized.webdavBackup;
    sanitized.webdavBackup = restWebdav;
  }
  if (isPlainRecord(sanitized.shortLink)) {
    const { apiToken: _omitApiToken, ...restShortLink } = sanitized.shortLink;
    sanitized.shortLink = restShortLink;
  }
  if (isPlainRecord(sanitized.turnstile)) {
    const { secretKey: _omitSecretKey, ...restTurnstile } = sanitized.turnstile;
    sanitized.turnstile = restTurnstile;
  }
  if (isPlainRecord(sanitized.telegramPushConfig)) {
    const {
      botToken: _omitPushBotToken,
      webhookSecret: _omitWebhookSecret,
      ...restPushConfig
    } = sanitized.telegramPushConfig;
    sanitized.telegramPushConfig = restPushConfig;
  }
  if (isPlainRecord(sanitized.externalApi)) {
    const rawTokens = sanitized.externalApi.tokens;
    sanitized.externalApi = {
      ...sanitized.externalApi,
      tokens: Array.isArray(rawTokens)
        ? rawTokens.map((item) => {
            if (!isPlainRecord(item)) return item;
            const { token: _omitToken, ...restToken } = item;
            return restToken;
          })
        : [],
    };
  }

  return sanitized;
}

function normalizeAppDataSnapshot(
  rawData: RawAppDataPayload | null | undefined,
  fallbackConfig: Partial<AppSettingsConfig> | null = null,
): AppDataSnapshot | null {
  if (!isPlainRecord(rawData)) return null;

  const rawMisubs = Array.isArray(rawData.misubs) ? rawData.misubs : [];
  const rawProfiles = Array.isArray(rawData.profiles) ? rawData.profiles : [];
  const misubs = rawMisubs.map((sub) => hydrateItemTags({ ...sub, isUpdating: false }));
  const profiles = rawProfiles.map((profile) => ({
    ...profile,
    tags: getItemTags(profile),
  }));
  const ruleTemplates = Array.isArray(rawData.ruleTemplates) ? rawData.ruleTemplates : [];
  const config = (
    isPlainRecord(rawData.config)
      ? { ...DEFAULT_SETTINGS, ...rawData.config }
      : isPlainRecord(fallbackConfig)
        ? { ...DEFAULT_SETTINGS, ...fallbackConfig }
        : { ...DEFAULT_SETTINGS }
  ) as AppSettingsConfig;

  return {
    misubs,
    profiles,
    ruleTemplates,
    config,
  };
}

function persistAppDataToSessionCache(snapshot: AppDataSnapshot | null | undefined): void {
  if (!snapshot) return;
  dataCache.set({
    misubs: (snapshot.misubs || []).map((s) => {
      const { isUpdating: _isUpdating, ...rest } = s;
      return rest;
    }),
    profiles: snapshot.profiles || [],
    ruleTemplates: snapshot.ruleTemplates || [],
    config: sanitizeConfigForCache(snapshot.config || {}),
  });
}

function readSessionCachedAppData(): RawAppDataPayload | null {
  const cached: unknown = dataCache.get();
  return isPlainRecord(cached) ? (cached as RawAppDataPayload) : null;
}

function syncSessionCachedConfig(nextConfig: Partial<AppSettingsConfig>): void {
  const cachedData: unknown = dataCache.get();
  if (!isPlainRecord(cachedData)) return;
  const cachedConfig = isPlainRecord(cachedData.config) ? cachedData.config : {};

  dataCache.set({
    ...cachedData,
    config: sanitizeConfigForCache({
      ...cachedConfig,
      ...nextConfig,
    }),
  });
}

async function fetchAppDataPayload(): Promise<RawAppDataPayload> {
  const data: unknown = await api.get(API_ENDPOINTS.DATA);
  if (isPlainRecord(data) && typeof data.error === 'string' && data.error) {
    throw new Error(data.error);
  }
  return (isPlainRecord(data) ? data : {}) as RawAppDataPayload;
}

export function hydrateAppDataInQueryClient(
  queryClient: QueryClient | null | undefined,
  rawData: RawAppDataPayload | null | undefined,
  fallbackConfig: Partial<AppSettingsConfig> | null = null,
): AppDataSnapshot | null {
  const normalized = normalizeAppDataSnapshot(rawData, fallbackConfig);
  if (!normalized) return null;
  if (queryClient) {
    queryClient.setQueryData(QUERY_KEYS.appData, normalized);
  }
  persistAppDataToSessionCache(normalized);
  return normalized;
}

/**
 * 将细粒度资源变更后的最新列表同步回 Vue Query 与 sessionStorage 缓存。
 */
export function syncAppDataSnapshotToCache(
  queryClient: QueryClient | null | undefined,
  patch: {
    misubs?: StoreMisubItem[];
    profiles?: StoreProfileConfig[];
    config?: Partial<AppSettingsConfig>;
  },
): void {
  const current =
    queryClient?.getQueryData<AppDataSnapshot>(QUERY_KEYS.appData) ??
    normalizeAppDataSnapshot(readSessionCachedAppData());

  const nextSnapshot: AppDataSnapshot = {
    misubs: patch.misubs ? patch.misubs.map((sub) => hydrateItemTags({ ...sub, isUpdating: false })) : current?.misubs ?? [],
    profiles: patch.profiles
      ? patch.profiles.map((profile) => ({ ...profile, tags: getItemTags(profile) }))
      : current?.profiles ?? [],
    ruleTemplates: current?.ruleTemplates ?? [],
    config: (
      patch.config
        ? { ...DEFAULT_SETTINGS, ...current?.config, ...patch.config }
        : current?.config || { ...DEFAULT_SETTINGS }
    ) as AppSettingsConfig,
  };

  if (queryClient) {
    queryClient.setQueryData(QUERY_KEYS.appData, nextSnapshot);
  }
  persistAppDataToSessionCache(nextSnapshot);
}

export async function fetchAppDataWithQueryClient(
  queryClient: QueryClient,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
): Promise<{ data: AppDataSnapshot | null; fromCache: boolean }> {
  if (!forceRefresh) {
    const queryCached = queryClient?.getQueryData<AppDataSnapshot>(QUERY_KEYS.appData);
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

export async function saveSettingsWithQueryClient(
  queryClient: QueryClient,
  newSettings: Partial<AppSettingsConfig>,
  {
    preferencesOnly = false,
    currentConfig = {},
  }: { preferencesOnly?: boolean; currentConfig?: Partial<AppSettingsConfig> } = {},
): Promise<SaveSettingsResponse> {
  await queryClient.cancelQueries({ queryKey: QUERY_KEYS.appData });
  const previousSnapshot = queryClient.getQueryData<AppDataSnapshot>(QUERY_KEYS.appData);

  const mergedConfig: Partial<AppSettingsConfig> = { ...currentConfig, ...newSettings };
  if (previousSnapshot) {
    queryClient.setQueryData(QUERY_KEYS.appData, {
      ...previousSnapshot,
      config: { ...previousSnapshot.config, ...newSettings } as AppSettingsConfig,
    });
  }

  try {
    const rawResult: unknown = await api.patch(
      API_ENDPOINTS.SETTINGS,
      newSettings,
      preferencesOnly ? { headers: { 'X-MiSub-Save-Scope': 'preferences' } } : {},
    );
    const result = (isPlainRecord(rawResult) ? rawResult : {}) as SaveSettingsResponse;
    if (!result.success) {
      throw new Error(result.message || 'Failed to save settings');
    }
    syncSessionCachedConfig(mergedConfig);
    return result;
  } catch (error: unknown) {
    if (previousSnapshot !== undefined) {
      queryClient.setQueryData(QUERY_KEYS.appData, previousSnapshot);
    }
    throw error;
  }
}

export async function fetchRuleTemplatesWithQueryClient(queryClient: QueryClient): Promise<RuleTemplateItem[]> {
  const result = await queryClient.fetchQuery({
    queryKey: QUERY_KEYS.ruleTemplates,
    staleTime: 0,
    queryFn: async (): Promise<RuleTemplateItem[]> => {
      const response: unknown = await api.get(API_ENDPOINTS.RULE_TEMPLATES);
      const data = isPlainRecord(response) ? response.data : undefined;
      return Array.isArray(data) ? (data as RuleTemplateItem[]) : [];
    },
  });
  const currentAppData = queryClient.getQueryData<AppDataSnapshot>(QUERY_KEYS.appData);
  if (currentAppData) {
    queryClient.setQueryData(QUERY_KEYS.appData, {
      ...currentAppData,
      ruleTemplates: result,
    });
  }
  return result;
}

export async function saveRuleTemplatesWithQueryClient(
  queryClient: QueryClient,
  templates: RuleTemplateItem[],
): Promise<RuleTemplateItem[]> {
  const rawResult: unknown = await api.post(API_ENDPOINTS.RULE_TEMPLATES, { templates });
  const result = isPlainRecord(rawResult) ? rawResult : {};
  if (!result.success) {
    throw new Error(typeof result.message === 'string' ? result.message : 'Failed to save rule templates');
  }
  const savedList = Array.isArray(result.data) ? (result.data as RuleTemplateItem[]) : [];
  queryClient.setQueryData(QUERY_KEYS.ruleTemplates, savedList);
  const currentAppData = queryClient.getQueryData<AppDataSnapshot>(QUERY_KEYS.appData);
  if (currentAppData) {
    queryClient.setQueryData(QUERY_KEYS.appData, {
      ...currentAppData,
      ruleTemplates: savedList,
    });
  }
  return savedList;
}

export function clearAppDataQueryCache(queryClient?: QueryClient | null): void {
  dataCache.clear();
  if (queryClient) {
    queryClient.removeQueries({ queryKey: QUERY_KEYS.appData });
    queryClient.removeQueries({ queryKey: QUERY_KEYS.ruleTemplates });
  }
}

/**
 * 声明式 TanStack Vue Query Hooks（供视图或组件直接使用）
 */
export function useAppDataQuery(options: UseAppDataQueryOptions = {}) {
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

export function useSaveSettingsMutation(options: UseSaveSettingsMutationOptions = {}) {
  const queryClient = options.queryClient || resolveComponentQueryClient();
  return useMutation(
    {
      mutationFn: ({ settings, preferencesOnly = false, currentConfig = {} }: SaveSettingsMutationVariables) =>
        saveSettingsWithQueryClient(queryClient, settings, { preferencesOnly, currentConfig }),
      ...options,
    },
    queryClient,
  );
}
