import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { isValidRemoteSubscriptionUrl } from '@misub/core/utils/url-validators.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { useSettingsStore } from '@/stores/useSettingsStore.js';
import { useEditorStore } from '@/stores/useEditorStore.js';
import { api } from '@/lib/http.js';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';
import { resolvePiniaQueryClient } from '@/lib/query-client.js';
import {
  clearAppDataQueryCache,
  fetchAppDataWithQueryClient,
  fetchRuleTemplatesWithQueryClient,
  hydrateAppDataInQueryClient,
  saveRuleTemplatesWithQueryClient,
  saveSettingsWithQueryClient,
  syncAppDataSnapshotToCache,
  type AppDataSnapshot,
  type AppSettingsConfig,
  type RawAppDataPayload,
  type RuleTemplateItem,
  type StoreMisubItem,
  type StoreProfileConfig,
} from '@/queries/useAppDataQueries.js';
import {
  pruneInvalidProfileReferences,
  removeManualNodeRefsFromProfiles,
  removeProfileRefsFromProfiles,
  removeSubscriptionRefsFromProfiles,
} from '@/utils/profile-reference-pruner.js';
import { t } from '@/i18n/index.js';
import { extractErrorMessage } from '@/utils/error-handler.js';
import { getItemTags, hydrateItemTags, normalizeTagList } from '@/utils/tags.js';

export interface MutationConflict<T = unknown> {
  current?: T;
  message: string;
  code?: string;
}

export interface RecordConflictBannerModel {
  message?: string;
  localVersion: number;
  serverVersion: number;
}

export interface MutationResult<T = void> {
  ok: boolean;
  data?: T;
  conflict?: MutationConflict<T>;
  error?: string;
}

export interface RecordPatchOptions {
  expectedConfigVersion?: number;
  force?: boolean;
  silent?: boolean;
  suppressConflictToast?: boolean;
}

export interface DeleteRecordPayload {
  id: string;
  updatedProfiles?: StoreProfileConfig[];
}

export interface BatchDeleteResultPayload {
  deletedIds: string[];
  updatedProfiles?: StoreProfileConfig[];
}

export interface SubscriptionRuntimePatch {
  nodeCount?: number;
  lastGoodNodeCount?: number;
  userInfo?: StoreMisubItem['userInfo'];
  detectedName?: string;
  lastError?: string | null;
  lastUpdate?: string | null;
  isUpdating?: boolean;
}

type ResourceKind = 'subscription' | 'node';

const RESOURCE_ENDPOINTS: Record<
  ResourceKind,
  {
    base: string;
    batch: string;
    batchDelete: string;
    batchTags: string;
    reorder: string;
  }
> = {
  subscription: {
    base: API_ENDPOINTS.SUBSCRIPTIONS,
    batch: API_ENDPOINTS.SUBSCRIPTIONS_BATCH,
    batchDelete: API_ENDPOINTS.SUBSCRIPTIONS_BATCH_DELETE,
    batchTags: API_ENDPOINTS.SUBSCRIPTIONS_BATCH_TAGS,
    reorder: API_ENDPOINTS.SUBSCRIPTIONS_REORDER,
  },
  node: {
    base: API_ENDPOINTS.NODES,
    batch: API_ENDPOINTS.NODES_BATCH,
    batchDelete: API_ENDPOINTS.NODES_BATCH_DELETE,
    batchTags: API_ENDPOINTS.NODES_BATCH_TAGS,
    reorder: API_ENDPOINTS.NODES_REORDER,
  },
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeMisubItem(item: StoreMisubItem): StoreMisubItem {
  return hydrateItemTags({ ...item, isUpdating: false });
}

function normalizeProfileItem(profile: StoreProfileConfig): StoreProfileConfig {
  return {
    ...profile,
    tags: getItemTags(profile),
  };
}

function serializeMisubPayload(item: Partial<StoreMisubItem>): Record<string, unknown> {
  const { isUpdating: _isUpdating, ...rest } = item;
  return hydrateItemTags(rest as StoreMisubItem);
}

function serializeProfilePayload(profile: Partial<StoreProfileConfig>): Record<string, unknown> {
  const { clashRuleLevel, ...restProfile } = profile;
  const serialized: Record<string, unknown> = {
    ...restProfile,
  };
  if (profile.tags !== undefined || Array.isArray(restProfile.tags)) {
    serialized.tags = normalizeTagList(getItemTags(profile));
  }
  if (restProfile.ruleLevel !== undefined || clashRuleLevel !== undefined) {
    serialized.ruleLevel = restProfile.ruleLevel || clashRuleLevel || '';
  }
  return serialized;
}

function extractVersionConflict<T>(error: unknown): MutationConflict<T> | null {
  if (!error || typeof error !== 'object') return null;
  const errObj = error as { status?: unknown; data?: unknown; message?: unknown };
  if (errObj.status !== 409 || !isPlainRecord(errObj.data)) return null;
  const code = typeof errObj.data.code === 'string' ? errObj.data.code : undefined;
  if (code !== 'VERSION_CONFLICT') return null;
  const message =
    typeof errObj.data.message === 'string' && errObj.data.message
      ? errObj.data.message
      : t('store.dataConflict');
  return {
    current: errObj.data.current as T | undefined,
    message,
    code,
  };
}

function unwrapApiData<T>(response: unknown): T {
  if (isPlainRecord(response) && 'success' in response) {
    if (response.success === false) {
      throw new Error(typeof response.message === 'string' ? response.message : t('store.saveFailed'));
    }
    return response.data as T;
  }
  return response as T;
}

export const useDataStore = defineStore('data', () => {
  const { showToast } = useToastStore();
  const settingsStore = useSettingsStore();
  const editorStore = useEditorStore();

  const subscriptions = ref<StoreMisubItem[]>([]);
  const profiles = ref<StoreProfileConfig[]>([]);
  const ruleTemplates = ref<RuleTemplateItem[]>([]);
  const settings = computed(() => settingsStore.config);

  const isLoading = ref(false);
  const lastUpdated = ref<Date | null>(null);
  const hasDataLoaded = computed(() => !!lastUpdated.value);
  const isMutating = computed(() => editorStore.isMutating);

  const activeSubscriptions = computed(() => subscriptions.value.filter((sub) => sub.enabled));
  const activeProfiles = computed(() => profiles.value.filter((profile) => profile.enabled));

  function syncCache(): void {
    syncAppDataSnapshotToCache(resolvePiniaQueryClient(), {
      misubs: subscriptions.value,
      profiles: profiles.value,
      config: settingsStore.config,
    });
  }

  function applyNormalizedSnapshot(snapshot: AppDataSnapshot | null | undefined): boolean {
    if (!snapshot) return false;
    subscriptions.value = snapshot.misubs;
    profiles.value = snapshot.profiles;
    ruleTemplates.value = snapshot.ruleTemplates;
    settingsStore.setConfig(snapshot.config);
    lastUpdated.value = new Date();
    return true;
  }

  function hydrateFromData(data: RawAppDataPayload | null | undefined): boolean {
    if (!data) return false;
    try {
      const queryClient = resolvePiniaQueryClient();
      const snapshot = hydrateAppDataInQueryClient(queryClient, data, settingsStore.config);
      return applyNormalizedSnapshot(snapshot);
    } catch (error: unknown) {
      console.error('hydrateFromData failed:', error);
      return false;
    }
  }

  async function fetchData(forceRefresh = false): Promise<boolean> {
    if (hasDataLoaded.value && !forceRefresh) return true;

    isLoading.value = true;
    try {
      const queryClient = resolvePiniaQueryClient();
      const { data: snapshot, fromCache } = await fetchAppDataWithQueryClient(queryClient, { forceRefresh });
      applyNormalizedSnapshot(snapshot);
      if (!fromCache) {
        pruneInvalidReferences();
      }
      return true;
    } catch (error: unknown) {
      console.error('Failed to fetch data:', error);
      showToast(t('store.fetchDataFailed', { message: extractErrorMessage(error) }), 'error');
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function runMutation<T>(
    executor: () => Promise<T>,
    options: { silent?: boolean; suppressConflictToast?: boolean; onRollback?: () => void } = {},
  ): Promise<MutationResult<T>> {
    editorStore.beginMutation();
    try {
      const data = await executor();
      lastUpdated.value = new Date();
      syncCache();
      return { ok: true, data };
    } catch (error: unknown) {
      options.onRollback?.();
      const conflict = extractVersionConflict<T>(error);
      if (conflict) {
        if (!options.silent && !options.suppressConflictToast) {
          showToast(t('store.dataConflict'), 'warning');
        }
        return { ok: false, conflict, error: conflict.message };
      }
      const message = extractErrorMessage(error);
      console.error('[Store] Mutation failed:', error);
      if (!options.silent) {
        showToast(t('store.saveDataFailed', { message }), 'error');
      }
      return { ok: false, error: message };
    } finally {
      editorStore.endMutation();
    }
  }

  function upsertMisubItem(item: StoreMisubItem, prepend = false): StoreMisubItem {
    const normalized = normalizeMisubItem(item);
    const index = subscriptions.value.findIndex((s) => s.id === normalized.id);
    if (index !== -1) {
      subscriptions.value[index] = normalized;
    } else if (prepend) {
      subscriptions.value.unshift(normalized);
    } else {
      subscriptions.value.push(normalized);
    }
    return normalized;
  }

  function upsertProfileItem(profile: StoreProfileConfig, prepend = false): StoreProfileConfig {
    const normalized = normalizeProfileItem(profile);
    const index = profiles.value.findIndex((p) => p.id === normalized.id);
    if (index !== -1) {
      profiles.value[index] = normalized;
    } else if (prepend) {
      profiles.value.unshift(normalized);
    } else {
      profiles.value.push(normalized);
    }
    return normalized;
  }

  function mergeUpdatedProfiles(updatedProfiles: StoreProfileConfig[] | undefined): void {
    if (!Array.isArray(updatedProfiles) || updatedProfiles.length === 0) return;
    const byId = new Map(updatedProfiles.map((profile) => [profile.id, normalizeProfileItem(profile)]));
    profiles.value = profiles.value.map((existing) => byId.get(existing.id) || existing);
  }

  function syncSubscriptionFromServer(item: StoreMisubItem | null | undefined): void {
    if (!item?.id) return;
    upsertMisubItem(item);
    syncCache();
  }

  function syncProfileFromServer(profile: StoreProfileConfig | null | undefined): void {
    if (!profile?.id) return;
    upsertProfileItem(profile);
    syncCache();
  }

  function applySubscriptionRuntimeUpdate(id: string, runtimePatch: SubscriptionRuntimePatch): void {
    const index = subscriptions.value.findIndex((s) => s.id === id);
    if (index === -1) return;
    const current = subscriptions.value[index];
    const next: StoreMisubItem = { ...current };
    const runtimeKeys: Array<keyof SubscriptionRuntimePatch> = [
      'nodeCount',
      'lastGoodNodeCount',
      'userInfo',
      'detectedName',
      'lastError',
      'lastUpdate',
      'isUpdating',
    ];
    for (const key of runtimeKeys) {
      if (Object.prototype.hasOwnProperty.call(runtimePatch, key)) {
        (next as Record<string, unknown>)[key] = runtimePatch[key];
      }
    }
    subscriptions.value[index] = next;
    syncCache();
  }

  // --- Shared Resource Mutation Helpers (Subscriptions & Manual Nodes) ---

  async function createMisubResource(
    kind: ResourceKind,
    item: Partial<StoreMisubItem>,
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<StoreMisubItem>> {
    const endpoint = RESOURCE_ENDPOINTS[kind].base;
    return await runMutation(async () => {
      const response = await api.post(endpoint, serializeMisubPayload(item));
      const created = unwrapApiData<StoreMisubItem>(response);
      return upsertMisubItem(created, true);
    }, options);
  }

  async function createMisubResourcesBatch(
    kind: ResourceKind,
    items: Array<Partial<StoreMisubItem>>,
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<StoreMisubItem[]>> {
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: true, data: [] };
    }
    const endpoint = RESOURCE_ENDPOINTS[kind].batch;
    return await runMutation(async () => {
      const response = await api.post(endpoint, { items: items.map(serializeMisubPayload) });
      const createdList = unwrapApiData<StoreMisubItem[]>(response) || [];
      const normalized = createdList.map(normalizeMisubItem);
      const createdIds = new Set(normalized.map((item) => item.id));
      subscriptions.value = [...normalized, ...subscriptions.value.filter((item) => !createdIds.has(item.id))];
      return normalized;
    }, options);
  }

  async function patchMisubResource(
    kind: ResourceKind,
    id: string,
    patch: Partial<StoreMisubItem>,
    options: RecordPatchOptions & { optimistic?: boolean } = {},
  ): Promise<MutationResult<StoreMisubItem>> {
    const endpoint = `${RESOURCE_ENDPOINTS[kind].base}/${encodeURIComponent(id)}`;
    const prevSnapshot = options.optimistic ? [...subscriptions.value] : null;
    if (options.optimistic) {
      updateSubscription(id, patch);
    }

    const body: Record<string, unknown> = { ...serializeMisubPayload(patch) };
    if (options.expectedConfigVersion !== undefined) {
      body.configVersion = options.expectedConfigVersion;
    }
    if (options.force) {
      body.force = true;
    }

    return await runMutation(
      async () => {
        const response = await api.patch(endpoint, body);
        const updated = unwrapApiData<StoreMisubItem>(response);
        return upsertMisubItem(updated);
      },
      {
        silent: options.silent,
        suppressConflictToast: options.suppressConflictToast,
        onRollback: () => {
          if (prevSnapshot) subscriptions.value = prevSnapshot;
        },
      },
    );
  }

  async function deleteMisubResource(
    kind: ResourceKind,
    id: string,
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<DeleteRecordPayload>> {
    const endpoint = `${RESOURCE_ENDPOINTS[kind].base}/${encodeURIComponent(id)}`;
    const prevSubscriptions = [...subscriptions.value];
    const prevProfiles = [...profiles.value];

    removeSubscription(id);
    if (kind === 'subscription') {
      removeSubscriptionFromProfiles(id);
    } else {
      removeManualNodeFromProfiles(id);
    }

    return await runMutation(
      async () => {
        const response = await api.del(endpoint);
        const result = unwrapApiData<DeleteRecordPayload>(response) || { id };
        mergeUpdatedProfiles(result.updatedProfiles);
        return result;
      },
      {
        silent: options.silent,
        onRollback: () => {
          subscriptions.value = prevSubscriptions;
          profiles.value = prevProfiles;
        },
      },
    );
  }

  async function batchDeleteMisubResources(
    kind: ResourceKind,
    payload: { ids?: string[]; all?: boolean },
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<BatchDeleteResultPayload>> {
    const endpoint = RESOURCE_ENDPOINTS[kind].batchDelete;
    const prevSubscriptions = [...subscriptions.value];
    const prevProfiles = [...profiles.value];

    const targetIds = payload.all
      ? subscriptions.value
          .filter((item) =>
            kind === 'subscription'
              ? Boolean(item.url && isValidRemoteSubscriptionUrl(item.url))
              : Boolean(!item.url || !isValidRemoteSubscriptionUrl(item.url)),
          )
          .map((item) => item.id)
      : Array.isArray(payload.ids)
        ? payload.ids
        : [];

    if (targetIds.length === 0 && !payload.all) {
      return { ok: true, data: { deletedIds: [], updatedProfiles: [] } };
    }

    const idSet = new Set(targetIds);
    subscriptions.value = subscriptions.value.filter((item) => !idSet.has(item.id));
    if (kind === 'subscription') {
      removeSubscriptionFromProfiles(targetIds);
    } else {
      removeManualNodeRefsFromProfilesOptimistic(targetIds);
    }

    return await runMutation(
      async () => {
        const response = await api.post(endpoint, payload);
        const result = unwrapApiData<BatchDeleteResultPayload>(response) || { deletedIds: targetIds };
        const confirmedDeleted = new Set(result.deletedIds || targetIds);
        subscriptions.value = subscriptions.value.filter((item) => !confirmedDeleted.has(item.id));
        mergeUpdatedProfiles(result.updatedProfiles);
        return result;
      },
      {
        silent: options.silent,
        onRollback: () => {
          subscriptions.value = prevSubscriptions;
          profiles.value = prevProfiles;
        },
      },
    );
  }

  function removeManualNodeRefsFromProfilesOptimistic(nodeIds: string[]): void {
    const { profiles: next, modified } = removeManualNodeRefsFromProfiles(profiles.value, nodeIds);
    if (modified) profiles.value = next;
  }

  async function batchUpdateMisubTags(
    kind: ResourceKind,
    updates: Array<{ id: string; tags: string[] }>,
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<StoreMisubItem[]>> {
    if (!Array.isArray(updates) || updates.length === 0) {
      return { ok: true, data: [] };
    }
    const endpoint = RESOURCE_ENDPOINTS[kind].batchTags;
    const prevSubscriptions = [...subscriptions.value];
    const updateMap = new Map(updates.map((u) => [u.id, normalizeTagList(u.tags)]));

    subscriptions.value = subscriptions.value.map((item) => {
      const nextTags = updateMap.get(item.id);
      return nextTags ? normalizeMisubItem({ ...item, tags: nextTags }) : item;
    });

    return await runMutation(
      async () => {
        const response = await api.post(endpoint, { updates });
        const updatedList = (unwrapApiData<StoreMisubItem[]>(response) || []).map(normalizeMisubItem);
        const updatedById = new Map(updatedList.map((item) => [item.id, item]));
        subscriptions.value = subscriptions.value.map((item) => updatedById.get(item.id) || item);
        return updatedList;
      },
      {
        silent: options.silent,
        onRollback: () => {
          subscriptions.value = prevSubscriptions;
        },
      },
    );
  }

  async function reorderMisubResources(
    kind: ResourceKind,
    orderedIds: string[],
    optimisticMergedList?: StoreMisubItem[],
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<StoreMisubItem[]>> {
    const endpoint = RESOURCE_ENDPOINTS[kind].reorder;
    const prevSubscriptions = [...subscriptions.value];
    if (Array.isArray(optimisticMergedList)) {
      subscriptions.value = optimisticMergedList;
    }

    return await runMutation(
      async () => {
        const response = await api.post(endpoint, { orderedIds });
        const reordered = (unwrapApiData<StoreMisubItem[]>(response) || []).map(normalizeMisubItem);
        if (reordered.length > 0) {
          const reorderedIds = new Set(reordered.map((item) => item.id));
          const others = subscriptions.value.filter((item) => !reorderedIds.has(item.id));
          subscriptions.value = [...reordered, ...others];
        }
        return reordered;
      },
      {
        silent: options.silent,
        onRollback: () => {
          subscriptions.value = prevSubscriptions;
        },
      },
    );
  }

  // --- Public Subscription Actions ---

  const createSubscription = (item: Partial<StoreMisubItem>, options?: { silent?: boolean }) =>
    createMisubResource('subscription', item, options);

  const createSubscriptionsBatch = (items: Array<Partial<StoreMisubItem>>, options?: { silent?: boolean }) =>
    createMisubResourcesBatch('subscription', items, options);

  const updateSubscriptionRecord = (id: string, patch: Partial<StoreMisubItem>, options: RecordPatchOptions = {}) =>
    patchMisubResource('subscription', id, patch, { ...options, optimistic: false });

  const patchSubscription = (id: string, patch: Partial<StoreMisubItem>, options: RecordPatchOptions = {}) =>
    patchMisubResource('subscription', id, patch, { ...options, optimistic: true });

  const deleteSubscriptionRecord = (id: string, options?: { silent?: boolean }) =>
    deleteMisubResource('subscription', id, options);

  const batchDeleteSubscriptionsRecord = (payload: { ids?: string[]; all?: boolean }, options?: { silent?: boolean }) =>
    batchDeleteMisubResources('subscription', payload, options);

  const batchUpdateSubscriptionTagsRecord = (
    updates: Array<{ id: string; tags: string[] }>,
    options?: { silent?: boolean },
  ) => batchUpdateMisubTags('subscription', updates, options);

  const reorderSubscriptionsRecord = (
    orderedIds: string[],
    optimisticMergedList?: StoreMisubItem[],
    options?: { silent?: boolean },
  ) => reorderMisubResources('subscription', orderedIds, optimisticMergedList, options);

  // --- Public Manual Node Actions ---

  const createNode = (item: Partial<StoreMisubItem>, options?: { silent?: boolean }) =>
    createMisubResource('node', item, options);

  const createNodesBatch = (items: Array<Partial<StoreMisubItem>>, options?: { silent?: boolean }) =>
    createMisubResourcesBatch('node', items, options);

  const updateNodeRecord = (id: string, patch: Partial<StoreMisubItem>, options: RecordPatchOptions = {}) =>
    patchMisubResource('node', id, patch, { ...options, optimistic: false });

  const patchNode = (id: string, patch: Partial<StoreMisubItem>, options: RecordPatchOptions = {}) =>
    patchMisubResource('node', id, patch, { ...options, optimistic: true });

  const deleteNodeRecord = (id: string, options?: { silent?: boolean }) => deleteMisubResource('node', id, options);

  const batchDeleteNodesRecord = (payload: { ids?: string[]; all?: boolean }, options?: { silent?: boolean }) =>
    batchDeleteMisubResources('node', payload, options);

  const batchUpdateNodeTagsRecord = (
    updates: Array<{ id: string; tags: string[] }>,
    options?: { silent?: boolean },
  ) => batchUpdateMisubTags('node', updates, options);

  const reorderNodesRecord = (
    orderedIds: string[],
    optimisticMergedList?: StoreMisubItem[],
    options?: { silent?: boolean },
  ) => reorderMisubResources('node', orderedIds, optimisticMergedList, options);

  // --- Public Profile Actions ---

  async function createProfile(
    profile: Partial<StoreProfileConfig>,
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<StoreProfileConfig>> {
    return await runMutation(async () => {
      const response = await api.post(API_ENDPOINTS.PROFILES, serializeProfilePayload(profile));
      const created = unwrapApiData<StoreProfileConfig>(response);
      return upsertProfileItem(created, true);
    }, options);
  }

  async function updateProfileRecord(
    id: string,
    patch: Partial<StoreProfileConfig>,
    options: RecordPatchOptions = {},
  ): Promise<MutationResult<StoreProfileConfig>> {
    const endpoint = `${API_ENDPOINTS.PROFILES}/${encodeURIComponent(id)}`;
    const body: Record<string, unknown> = { ...serializeProfilePayload(patch) };
    if (options.expectedConfigVersion !== undefined) {
      body.configVersion = options.expectedConfigVersion;
    }
    if (options.force) {
      body.force = true;
    }

    return await runMutation(
      async () => {
        const response = await api.patch(endpoint, body);
        const updated = unwrapApiData<StoreProfileConfig>(response);
        return upsertProfileItem(updated);
      },
      {
        silent: options.silent,
        suppressConflictToast: options.suppressConflictToast,
      },
    );
  }

  async function patchProfile(
    id: string,
    patch: Partial<StoreProfileConfig>,
    options: RecordPatchOptions = {},
  ): Promise<MutationResult<StoreProfileConfig>> {
    const endpoint = `${API_ENDPOINTS.PROFILES}/${encodeURIComponent(id)}`;
    const prevProfiles = [...profiles.value];
    profiles.value = profiles.value.map((p) => (p.id === id ? normalizeProfileItem({ ...p, ...patch }) : p));

    return await runMutation(
      async () => {
        const response = await api.patch(endpoint, serializeProfilePayload(patch));
        const updated = unwrapApiData<StoreProfileConfig>(response);
        return upsertProfileItem(updated);
      },
      {
        silent: options.silent,
        suppressConflictToast: options.suppressConflictToast,
        onRollback: () => {
          profiles.value = prevProfiles;
        },
      },
    );
  }

  async function deleteProfileRecord(
    id: string,
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<DeleteRecordPayload>> {
    const endpoint = `${API_ENDPOINTS.PROFILES}/${encodeURIComponent(id)}`;
    const prevProfiles = [...profiles.value];
    removeProfile(id);

    return await runMutation(
      async () => {
        const response = await api.del(endpoint);
        const result = unwrapApiData<DeleteRecordPayload>(response) || { id };
        mergeUpdatedProfiles(result.updatedProfiles);
        return result;
      },
      {
        silent: options.silent,
        onRollback: () => {
          profiles.value = prevProfiles;
        },
      },
    );
  }

  async function batchDeleteProfilesRecord(
    payload: { ids?: string[]; all?: boolean },
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<BatchDeleteResultPayload>> {
    const prevProfiles = [...profiles.value];
    const targetIds = payload.all
      ? profiles.value.map((p) => p.id)
      : Array.isArray(payload.ids)
        ? payload.ids
        : [];

    if (targetIds.length === 0 && !payload.all) {
      return { ok: true, data: { deletedIds: [], updatedProfiles: [] } };
    }

    targetIds.forEach((id) => removeProfile(id));

    return await runMutation(
      async () => {
        const response = await api.post(API_ENDPOINTS.PROFILES_BATCH_DELETE, payload);
        const result = unwrapApiData<BatchDeleteResultPayload>(response) || { deletedIds: targetIds };
        const confirmedDeleted = new Set(result.deletedIds || targetIds);
        profiles.value = profiles.value.filter((p) => !confirmedDeleted.has(p.id));
        mergeUpdatedProfiles(result.updatedProfiles);
        return result;
      },
      {
        silent: options.silent,
        onRollback: () => {
          profiles.value = prevProfiles;
        },
      },
    );
  }

  async function batchUpdateProfileTagsRecord(
    updates: Array<{ id: string; tags: string[] }>,
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<StoreProfileConfig[]>> {
    if (!Array.isArray(updates) || updates.length === 0) {
      return { ok: true, data: [] };
    }
    const prevProfiles = [...profiles.value];
    const updateMap = new Map(updates.map((u) => [u.id, normalizeTagList(u.tags)]));

    profiles.value = profiles.value.map((p) => {
      const nextTags = updateMap.get(p.id);
      return nextTags ? normalizeProfileItem({ ...p, tags: nextTags }) : p;
    });

    return await runMutation(
      async () => {
        const response = await api.post(API_ENDPOINTS.PROFILES_BATCH_TAGS, { updates });
        const updatedList = (unwrapApiData<StoreProfileConfig[]>(response) || []).map(normalizeProfileItem);
        mergeUpdatedProfiles(updatedList);
        return updatedList;
      },
      {
        silent: options.silent,
        onRollback: () => {
          profiles.value = prevProfiles;
        },
      },
    );
  }

  async function reorderProfilesRecord(
    orderedIds: string[],
    optimisticOrder?: StoreProfileConfig[],
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<StoreProfileConfig[]>> {
    const prevProfiles = [...profiles.value];
    if (Array.isArray(optimisticOrder)) {
      profiles.value = optimisticOrder;
    }

    return await runMutation(
      async () => {
        const response = await api.post(API_ENDPOINTS.PROFILES_REORDER, { orderedIds });
        const reordered = (unwrapApiData<StoreProfileConfig[]>(response) || []).map(normalizeProfileItem);
        if (reordered.length > 0) {
          profiles.value = reordered;
        }
        return reordered;
      },
      {
        silent: options.silent,
        onRollback: () => {
          profiles.value = prevProfiles;
        },
      },
    );
  }

  // --- Settings & Rule Templates ---

  async function saveSettings(
    newSettings: Partial<AppSettingsConfig>,
    options: { silent?: boolean; preferencesOnly?: boolean } = {},
  ): Promise<boolean> {
    const { silent = false, preferencesOnly = false } = options;
    editorStore.setLoading(true);
    try {
      const queryClient = resolvePiniaQueryClient();
      await saveSettingsWithQueryClient(queryClient, newSettings, {
        preferencesOnly,
        currentConfig: settingsStore.config,
      });
      settingsStore.updateConfig(newSettings);
      if (!silent) showToast(t('store.settingsUpdated'), 'success');
      return true;
    } catch (error: unknown) {
      console.error('Failed to save settings:', error);
      if (!silent) {
        showToast(t('store.saveSettingsFailedWithMessage', { message: extractErrorMessage(error) }), 'error');
      }
      throw error;
    } finally {
      editorStore.setLoading(false);
    }
  }

  async function fetchRuleTemplates(): Promise<RuleTemplateItem[]> {
    const queryClient = resolvePiniaQueryClient();
    const list = await fetchRuleTemplatesWithQueryClient(queryClient);
    ruleTemplates.value = list;
    return list;
  }

  async function saveRuleTemplates(items: RuleTemplateItem[] = ruleTemplates.value): Promise<RuleTemplateItem[]> {
    editorStore.setLoading(true);
    try {
      const queryClient = resolvePiniaQueryClient();
      const savedList = await saveRuleTemplatesWithQueryClient(queryClient, items);
      ruleTemplates.value = savedList;
      showToast(t('store.ruleTemplatesSaved'), 'success');
      return savedList;
    } catch (error: unknown) {
      console.error('Failed to save rule templates:', error);
      showToast(t('store.saveRuleTemplatesFailedWithMessage', { message: extractErrorMessage(error) }), 'error');
      throw error;
    } finally {
      editorStore.setLoading(false);
    }
  }

  function clearCachedData(): void {
    clearAppDataQueryCache(resolvePiniaQueryClient());
  }

  // --- Local Helpers (kept for synchronous cache seeding and internal optimistic updates) ---

  function addSubscription(subscription: StoreMisubItem): void {
    subscriptions.value.unshift(subscription);
  }

  function overwriteSubscriptions(items: StoreMisubItem[]): void {
    subscriptions.value = items;
  }

  function removeSubscription(id: string): void {
    const index = subscriptions.value.findIndex((s) => s.id === id);
    if (index !== -1) {
      subscriptions.value.splice(index, 1);
    }
  }

  function updateSubscription(id: string, updates: Partial<StoreMisubItem>): void {
    const index = subscriptions.value.findIndex((s) => s.id === id);
    if (index !== -1) {
      subscriptions.value[index] = { ...subscriptions.value[index], ...updates };
    }
  }

  function addProfile(profile: StoreProfileConfig): void {
    profiles.value.unshift(profile);
  }

  function overwriteProfiles(items: StoreProfileConfig[]): void {
    profiles.value = items;
  }

  function removeProfile(id: string): void {
    const index = profiles.value.findIndex((p) => p.id === id || p.customId === id);
    if (index !== -1) {
      const removed = profiles.value.splice(index, 1)[0];
      const ids = [removed.id, removed.customId].filter((value): value is string => Boolean(value));
      removeProfileFromProfiles(ids);
    }
  }

  function removeProfileFromProfiles(profileIds: string | string[]): void {
    const { profiles: next, modified } = removeProfileRefsFromProfiles(profiles.value, profileIds);
    if (modified) profiles.value = next;
  }

  function removeManualNodeFromProfiles(nodeIds: string | string[]): void {
    const { profiles: next, modified } = removeManualNodeRefsFromProfiles(profiles.value, nodeIds);
    if (modified) profiles.value = next;
  }

  function removeSubscriptionFromProfiles(subIds: string | string[]): void {
    const { profiles: next, modified } = removeSubscriptionRefsFromProfiles(profiles.value, subIds);
    if (modified) profiles.value = next;
  }

  function pruneInvalidReferences(): void {
    const { profiles: next, modified } = pruneInvalidProfileReferences(profiles.value, subscriptions.value);
    if (modified) profiles.value = next;
  }

  return {
    subscriptions,
    profiles,
    ruleTemplates,
    settings,
    isLoading,
    isMutating,
    lastUpdated,
    hasDataLoaded,

    activeSubscriptions,
    activeProfiles,

    fetchData,
    saveSettings,
    fetchRuleTemplates,
    saveRuleTemplates,
    hydrateFromData,
    clearCachedData,

    // 细粒度资源持久化 Actions
    createSubscription,
    createSubscriptionsBatch,
    updateSubscriptionRecord,
    patchSubscription,
    deleteSubscriptionRecord,
    batchDeleteSubscriptionsRecord,
    batchUpdateSubscriptionTagsRecord,
    reorderSubscriptionsRecord,
    applySubscriptionRuntimeUpdate,
    syncSubscriptionFromServer,

    createNode,
    createNodesBatch,
    updateNodeRecord,
    patchNode,
    deleteNodeRecord,
    batchDeleteNodesRecord,
    batchUpdateNodeTagsRecord,
    reorderNodesRecord,

    createProfile,
    updateProfileRecord,
    patchProfile,
    deleteProfileRecord,
    batchDeleteProfilesRecord,
    batchUpdateProfileTagsRecord,
    reorderProfilesRecord,
    syncProfileFromServer,

    // 纯本地状态同步辅助方法
    addSubscription,
    overwriteSubscriptions,
    removeSubscription,
    updateSubscription,
    addProfile,
    overwriteProfiles,
    removeProfile,
    removeProfileFromProfiles,
    removeManualNodeFromProfiles,
    removeSubscriptionFromProfiles,
  };
});
