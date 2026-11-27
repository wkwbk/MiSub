import { defineStore } from 'pinia';
import { computed, ref, type Ref } from 'vue';
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

type MisubResourceKind = 'subscription' | 'node';
type ResourceKind = MisubResourceKind | 'profile';

interface ResourceEndpointGroup {
  base: string;
  batch?: string;
  batchDelete: string;
  batchTags: string;
  reorder: string;
}

const RESOURCE_ENDPOINTS: Record<ResourceKind, ResourceEndpointGroup> = {
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
  profile: {
    base: API_ENDPOINTS.PROFILES,
    batchDelete: API_ENDPOINTS.PROFILES_BATCH_DELETE,
    batchTags: API_ENDPOINTS.PROFILES_BATCH_TAGS,
    reorder: API_ENDPOINTS.PROFILES_REORDER,
  },
};

const COMMON_NON_PATCH_KEYS = [
  'id',
  'sortIndex',
  'configVersion',
  'version',
  'createdAt',
  'updatedAt',
  'downloadCount',
] as const;

const MISUB_NON_PATCH_KEYS = [
  ...COMMON_NON_PATCH_KEYS,
  'isUpdating',
  'nodeCount',
  'lastGoodNodeCount',
  'userInfo',
  'detectedName',
  'lastError',
  'lastUpdate',
  'latency',
  'status',
  'latencyMode',
  'lastTestedAt',
] as const;

const PROFILE_NON_PATCH_KEYS = [...COMMON_NON_PATCH_KEYS] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveNormalizedConfigVersion(entity: { configVersion?: unknown; version?: unknown }): number {
  const candidate = Number(entity.configVersion ?? entity.version);
  return Number.isInteger(candidate) && candidate >= 1 ? candidate : 1;
}

function normalizeMisubItem(item: StoreMisubItem): StoreMisubItem {
  return hydrateItemTags({
    ...item,
    configVersion: resolveNormalizedConfigVersion(item as { configVersion?: unknown; version?: unknown }),
    isUpdating: false,
  });
}

function normalizeProfileItem(profile: StoreProfileConfig): StoreProfileConfig {
  return {
    ...profile,
    configVersion: resolveNormalizedConfigVersion(profile as { configVersion?: unknown; version?: unknown }),
    tags: getItemTags(profile),
  };
}

function stripDisallowedKeys(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const next = { ...obj };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

function serializeMisubPayload(item: Partial<StoreMisubItem>, forPatch = false): Record<string, unknown> {
  const { isUpdating: _isUpdating, ...rest } = item;
  const serialized = hydrateItemTags(rest as StoreMisubItem) as unknown as Record<string, unknown>;
  return forPatch ? stripDisallowedKeys(serialized, MISUB_NON_PATCH_KEYS) : serialized;
}

function serializeProfilePayload(profile: Partial<StoreProfileConfig>, forPatch = false): Record<string, unknown> {
  const { clashRuleLevel, ...restProfile } = profile;
  const serialized: Record<string, unknown> = { ...restProfile };
  if (profile.tags !== undefined || Array.isArray(restProfile.tags)) {
    serialized.tags = normalizeTagList(getItemTags(profile));
  }
  if (restProfile.ruleLevel !== undefined || clashRuleLevel !== undefined) {
    serialized.ruleLevel = restProfile.ruleLevel || clashRuleLevel || '';
  }
  return forPatch ? stripDisallowedKeys(serialized, PROFILE_NON_PATCH_KEYS) : serialized;
}

function buildPatchRequestBody(serialized: Record<string, unknown>, options: RecordPatchOptions): Record<string, unknown> {
  const body = { ...serialized };
  if (options.expectedConfigVersion !== undefined) {
    body.configVersion = options.expectedConfigVersion;
  }
  if (options.force) {
    body.force = true;
  }
  return body;
}

function extractVersionConflict<T>(error: unknown): MutationConflict<T> | null {
  if (!error || typeof error !== 'object') return null;
  const errObj = error as { status?: unknown; data?: unknown; message?: unknown };
  if (errObj.status !== 409 || !isPlainRecord(errObj.data)) return null;
  const code = typeof errObj.data.code === 'string' ? errObj.data.code : undefined;
  if (code !== 'VERSION_CONFLICT') return null;
  const message =
    typeof errObj.data.message === 'string' && errObj.data.message ? errObj.data.message : t('store.dataConflict');
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

function upsertItemInList<T extends { id: string }>(list: T[], item: T, prepend = false): T {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index !== -1) {
    list[index] = item;
  } else if (prepend) {
    list.unshift(item);
  } else {
    list.push(item);
  }
  return item;
}

function restoreOrderFromBaseline<T extends { id: string }>(currentList: T[], baselineIds: string[]): T[] {
  const byId = new Map(currentList.map((item) => [item.id, item]));
  const baselineSet = new Set(baselineIds);
  const ordered = baselineIds.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
  const additions = currentList.filter((item) => !baselineSet.has(item.id));
  return [...ordered, ...additions];
}

interface CollectionAdapter<T extends { id: string; tags?: string[] }> {
  kind: ResourceKind;
  listRef: Ref<T[]>;
  endpoints: ResourceEndpointGroup;
  normalize: (item: T) => T;
  serialize: (item: Partial<T>, forPatch?: boolean) => Record<string, unknown>;
  findDeleteTarget: (id: string) => { index: number; item: T | null };
  resolveBatchDeleteIds: (payload: { ids?: string[]; all?: boolean }) => string[];
  optimisticRemove: (ids: string[]) => void;
  withTags: (item: T, tags: string[] | undefined) => T;
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
  const hasLoadedRuleTemplates = ref(false);
  let ruleTemplatesInFlight: Promise<RuleTemplateItem[]> | null = null;
  const isMutating = computed(() => editorStore.isMutating);

  // 实例级并发控制状态：按资源键串行排队、保留首次基线快照并在响应乱序/失败时精确收敛
  const mutationChains = new Map<string, Promise<unknown>>();
  const mutationSeq = new Map<string, number>();
  const baselineFieldsByKey = new Map<string, Record<string, unknown>>();
  const baselineOrderByKey = new Map<string, string[]>();
  const inFlightDeletes = new Map<string, Promise<MutationResult<DeleteRecordPayload>>>();

  function enqueueKeyedMutation<T>(key: string, runner: (isLatest: () => boolean) => Promise<T>): Promise<T> {
    const seq = (mutationSeq.get(key) || 0) + 1;
    mutationSeq.set(key, seq);
    const isLatest = () => mutationSeq.get(key) === seq;
    const prev = mutationChains.get(key) ?? Promise.resolve();
    const next = prev.then(
      () => runner(isLatest),
      () => runner(isLatest),
    );
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    mutationChains.set(key, settled);
    void settled.then(() => {
      if (mutationChains.get(key) === settled && isLatest()) {
        mutationChains.delete(key);
      }
    });
    return next;
  }

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
    if (snapshot.ruleTemplates.length > 0) {
      ruleTemplates.value = snapshot.ruleTemplates;
      hasLoadedRuleTemplates.value = true;
    }
    settingsStore.setConfig(snapshot.config);
    lastUpdated.value = new Date();
    return true;
  }

  function hydrateFromData(data: RawAppDataPayload | null | undefined): boolean {
    if (!data) return false;
    try {
      const snapshot = hydrateAppDataInQueryClient(resolvePiniaQueryClient(), data, settingsStore.config);
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

  function mergeUpdatedProfiles(updatedProfiles: StoreProfileConfig[] | undefined): void {
    if (!Array.isArray(updatedProfiles) || updatedProfiles.length === 0) return;
    const byId = new Map(updatedProfiles.map((profile) => [profile.id, normalizeProfileItem(profile)]));
    profiles.value = profiles.value.map((existing) => byId.get(existing.id) || existing);
  }

  function syncSubscriptionFromServer(item: StoreMisubItem | null | undefined): void {
    if (!item?.id) return;
    upsertItemInList(subscriptions.value, normalizeMisubItem(item));
    syncCache();
  }

  function syncProfileFromServer(profile: StoreProfileConfig | null | undefined): void {
    if (!profile?.id) return;
    upsertItemInList(profiles.value, normalizeProfileItem(profile));
    syncCache();
  }

  function applySubscriptionRuntimeUpdate(id: string, runtimePatch: SubscriptionRuntimePatch): void {
    const index = subscriptions.value.findIndex((s) => s.id === id);
    if (index === -1) return;
    const next: StoreMisubItem = { ...subscriptions.value[index] };
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

  // --- Shared Field/Delete/Reorder Rollback Helpers ---

  function recordFieldBaseline<T extends Record<string, unknown>>(
    key: string,
    currentRecord: T | undefined,
    patch: Record<string, unknown>,
  ): void {
    if (!currentRecord) return;
    const existing = baselineFieldsByKey.get(key) || {};
    for (const patchKey of Object.keys(patch)) {
      if (!Object.prototype.hasOwnProperty.call(existing, patchKey)) {
        existing[patchKey] = currentRecord[patchKey];
      }
    }
    baselineFieldsByKey.set(key, existing);
  }

  function rollbackFieldBaseline<T extends { id: string }>(listRef: Ref<T[]>, id: string, key: string): void {
    const baseline = baselineFieldsByKey.get(key);
    baselineFieldsByKey.delete(key);
    if (!baseline) return;
    const idx = listRef.value.findIndex((entry) => entry.id === id);
    if (idx !== -1) {
      listRef.value[idx] = { ...listRef.value[idx], ...baseline };
    }
  }

  type SavedProfileRefs = Partial<Pick<StoreProfileConfig, 'subscriptions' | 'manualNodes' | 'subProfiles'>>;

  function captureAffectedProfileRefs(): Map<string, SavedProfileRefs> {
    return new Map(
      profiles.value.map((p) => {
        const refs: SavedProfileRefs = {};
        if (Array.isArray(p.subscriptions)) refs.subscriptions = [...p.subscriptions];
        if (Array.isArray(p.manualNodes)) refs.manualNodes = [...p.manualNodes];
        if (Array.isArray(p.subProfiles)) refs.subProfiles = [...p.subProfiles];
        return [p.id, refs];
      }),
    );
  }

  function restoreAffectedProfileRefs(snapshot: Map<string, SavedProfileRefs>): void {
    profiles.value = profiles.value.map((p) => {
      const savedRefs = snapshot.get(p.id);
      return savedRefs ? { ...p, ...savedRefs } : p;
    });
  }

  // --- Collection Adapters & Unified CRUD Helpers (Subscriptions / Nodes / Profiles) ---

  const getMisubAdapter = (kind: MisubResourceKind): CollectionAdapter<StoreMisubItem> => ({
    kind,
    listRef: subscriptions,
    endpoints: RESOURCE_ENDPOINTS[kind],
    normalize: normalizeMisubItem,
    serialize: serializeMisubPayload,
    findDeleteTarget: (id) => {
      const index = subscriptions.value.findIndex((s) => s.id === id);
      return { index, item: index !== -1 ? subscriptions.value[index] : null };
    },
    resolveBatchDeleteIds: (payload) =>
      payload.all
        ? subscriptions.value
            .filter((item) =>
              kind === 'subscription'
                ? Boolean(item.url && isValidRemoteSubscriptionUrl(item.url))
                : Boolean(!item.url || !isValidRemoteSubscriptionUrl(item.url)),
            )
            .map((item) => item.id)
        : Array.isArray(payload.ids)
          ? payload.ids
          : [],
    optimisticRemove: (ids) => {
      const idSet = new Set(ids);
      subscriptions.value = subscriptions.value.filter((item) => !idSet.has(item.id));
      (kind === 'subscription' ? removeSubscriptionFromProfiles : removeManualNodeFromProfiles)(ids);
    },
    withTags: (item, tags) => normalizeMisubItem({ ...item, tags: tags ?? [] }),
  });

  const profileAdapter: CollectionAdapter<StoreProfileConfig> = {
    kind: 'profile',
    listRef: profiles,
    endpoints: RESOURCE_ENDPOINTS.profile,
    normalize: normalizeProfileItem,
    serialize: serializeProfilePayload,
    findDeleteTarget: (id) => {
      const index = profiles.value.findIndex((p) => p.id === id || p.customId === id);
      return { index, item: index !== -1 ? profiles.value[index] : null };
    },
    resolveBatchDeleteIds: (payload) =>
      payload.all ? profiles.value.map((p) => p.id) : Array.isArray(payload.ids) ? payload.ids : [],
    optimisticRemove: (ids) => ids.forEach((id) => removeProfile(id)),
    withTags: (item, tags) => normalizeProfileItem({ ...item, tags }),
  };

  async function createRecord<T extends { id: string; tags?: string[] }>(
    adapter: CollectionAdapter<T>,
    item: Partial<T>,
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<T>> {
    return await runMutation(async () => {
      const response = await api.post(adapter.endpoints.base, adapter.serialize(item));
      const created = unwrapApiData<T>(response);
      return upsertItemInList(adapter.listRef.value, adapter.normalize(created), true);
    }, options);
  }

  async function createMisubResourcesBatch(
    kind: MisubResourceKind,
    items: Array<Partial<StoreMisubItem>>,
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<StoreMisubItem[]>> {
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: true, data: [] };
    }
    return await runMutation(async () => {
      const endpoint = RESOURCE_ENDPOINTS[kind].batch || RESOURCE_ENDPOINTS[kind].base;
      const response = await api.post(endpoint, {
        items: items.map((entry) => serializeMisubPayload(entry)),
      });
      const createdList = unwrapApiData<StoreMisubItem[]>(response) || [];
      const normalized = createdList.map(normalizeMisubItem);
      const createdIds = new Set(normalized.map((item) => item.id));
      subscriptions.value = [...normalized, ...subscriptions.value.filter((item) => !createdIds.has(item.id))];
      return normalized;
    }, options);
  }

  async function patchRecord<T extends { id: string; tags?: string[] }>(
    adapter: CollectionAdapter<T>,
    id: string,
    patch: Partial<T>,
    options: RecordPatchOptions & { optimistic?: boolean } = {},
  ): Promise<MutationResult<T>> {
    const cleanPatch = adapter.serialize(patch, true);
    const body = buildPatchRequestBody(cleanPatch, options);
    const key = `item:${adapter.kind}:${id}`;

    if (options.optimistic) {
      const currentIdx = adapter.listRef.value.findIndex((entry) => entry.id === id);
      if (currentIdx !== -1) {
        const current = adapter.listRef.value[currentIdx];
        recordFieldBaseline(key, current as Record<string, unknown>, cleanPatch);
        adapter.listRef.value[currentIdx] = { ...current, ...cleanPatch } as T;
      }
    }

    return await enqueueKeyedMutation(key, async (isLatest) => {
      return await runMutation(
        async () => {
          const endpoint = `${adapter.endpoints.base}/${encodeURIComponent(id)}`;
          const response = await api.patch(endpoint, body);
          const updated = unwrapApiData<T>(response);
          const normalized = adapter.normalize(updated);
          if (!isLatest()) return normalized;
          if (options.optimistic) {
            baselineFieldsByKey.delete(key);
          }
          return upsertItemInList(adapter.listRef.value, normalized);
        },
        {
          silent: options.silent,
          suppressConflictToast: options.suppressConflictToast,
          onRollback: () => {
            if (options.optimistic && isLatest()) {
              rollbackFieldBaseline(adapter.listRef, id, key);
            }
          },
        },
      );
    });
  }

  async function deleteRecord<T extends { id: string; tags?: string[] }>(
    adapter: CollectionAdapter<T>,
    id: string,
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<DeleteRecordPayload>> {
    const deleteKey = `delete:${adapter.kind}:${id}`;
    const existingFlight = inFlightDeletes.get(deleteKey);
    if (existingFlight) return await existingFlight;

    const { index: removedIndex, item: removedItem } = adapter.findDeleteTarget(id);
    const profileRefsSnapshot = captureAffectedProfileRefs();
    adapter.optimisticRemove([id]);

    const promise = runMutation(
      async () => {
        const endpoint = `${adapter.endpoints.base}/${encodeURIComponent(id)}`;
        const response = await api.del(endpoint);
        const result = unwrapApiData<DeleteRecordPayload>(response) || { id };
        mergeUpdatedProfiles(result.updatedProfiles);
        return result;
      },
      {
        silent: options.silent,
        onRollback: () => {
          if (removedItem && !adapter.listRef.value.some((entry) => entry.id === removedItem.id)) {
            const insertAt = Math.max(0, Math.min(removedIndex, adapter.listRef.value.length));
            adapter.listRef.value.splice(insertAt, 0, removedItem);
          }
          restoreAffectedProfileRefs(profileRefsSnapshot);
        },
      },
    ).finally(() => {
      if (inFlightDeletes.get(deleteKey) === promise) {
        inFlightDeletes.delete(deleteKey);
      }
    });

    inFlightDeletes.set(deleteKey, promise);
    return await promise;
  }

  async function batchDeleteRecords<T extends { id: string; tags?: string[] }>(
    adapter: CollectionAdapter<T>,
    payload: { ids?: string[]; all?: boolean },
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<BatchDeleteResultPayload>> {
    const prevList = [...adapter.listRef.value];
    const profileRefsSnapshot = adapter.kind !== 'profile' ? captureAffectedProfileRefs() : null;
    const targetIds = adapter.resolveBatchDeleteIds(payload);

    if (targetIds.length === 0 && !payload.all) {
      return { ok: true, data: { deletedIds: [], updatedProfiles: [] } };
    }

    adapter.optimisticRemove(targetIds);

    return await runMutation(
      async () => {
        const response = await api.post(adapter.endpoints.batchDelete, payload);
        const result = unwrapApiData<BatchDeleteResultPayload>(response) || { deletedIds: targetIds };
        const confirmedDeleted = new Set(result.deletedIds || targetIds);
        adapter.listRef.value = adapter.listRef.value.filter((item) => !confirmedDeleted.has(item.id));
        mergeUpdatedProfiles(result.updatedProfiles);
        return result;
      },
      {
        silent: options.silent,
        onRollback: () => {
          adapter.listRef.value = prevList;
          if (profileRefsSnapshot) {
            restoreAffectedProfileRefs(profileRefsSnapshot);
          }
        },
      },
    );
  }

  async function batchUpdateRecordTags<T extends { id: string; tags?: string[] }>(
    adapter: CollectionAdapter<T>,
    updates: Array<{ id: string; tags: string[] }>,
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<T[]>> {
    if (!Array.isArray(updates) || updates.length === 0) {
      return { ok: true, data: [] };
    }
    const prevTagMap = new Map(adapter.listRef.value.map((item) => [item.id, item.tags]));
    const updateMap = new Map(updates.map((u) => [u.id, normalizeTagList(u.tags)]));

    adapter.listRef.value = adapter.listRef.value.map((item) => {
      const nextTags = updateMap.get(item.id);
      return nextTags ? adapter.withTags(item, nextTags) : item;
    });

    return await runMutation(
      async () => {
        const response = await api.post(adapter.endpoints.batchTags, { updates });
        const updatedList = (unwrapApiData<T[]>(response) || []).map(adapter.normalize);
        const updatedById = new Map(updatedList.map((item) => [item.id, item]));
        adapter.listRef.value = adapter.listRef.value.map((item) => updatedById.get(item.id) || item);
        return updatedList;
      },
      {
        silent: options.silent,
        onRollback: () => {
          adapter.listRef.value = adapter.listRef.value.map((item) =>
            updateMap.has(item.id) ? adapter.withTags(item, prevTagMap.get(item.id)) : item,
          );
        },
      },
    );
  }

  async function reorderRecords<T extends { id: string; tags?: string[] }>(
    adapter: CollectionAdapter<T>,
    orderedIds: string[],
    optimisticList?: T[],
    options: { silent?: boolean } = {},
  ): Promise<MutationResult<T[]>> {
    const key = `reorder:${adapter.kind}`;
    if (!baselineOrderByKey.has(key)) {
      baselineOrderByKey.set(
        key,
        adapter.listRef.value.map((item) => item.id),
      );
    }
    if (Array.isArray(optimisticList)) {
      adapter.listRef.value = optimisticList;
    }

    return await enqueueKeyedMutation(key, async (isLatest) => {
      return await runMutation(
        async () => {
          const response = await api.post(adapter.endpoints.reorder, { orderedIds });
          const reordered = (unwrapApiData<T[]>(response) || []).map(adapter.normalize);
          if (isLatest()) {
            baselineOrderByKey.delete(key);
            if (reordered.length > 0) {
              const reorderedIds = new Set(reordered.map((item) => item.id));
              const others = adapter.listRef.value.filter((item) => !reorderedIds.has(item.id));
              adapter.listRef.value = [...reordered, ...others];
            }
          }
          return reordered;
        },
        {
          silent: options.silent,
          onRollback: () => {
            if (isLatest()) {
              const baselineIds = baselineOrderByKey.get(key) || [];
              baselineOrderByKey.delete(key);
              adapter.listRef.value = restoreOrderFromBaseline(adapter.listRef.value, baselineIds);
            }
          },
        },
      );
    });
  }

  function buildResourceActions<T extends { id: string; tags?: string[] }>(adapter: CollectionAdapter<T>) {
    return {
      create: (item: Partial<T>, options?: { silent?: boolean }) => createRecord(adapter, item, options),
      updateRecord: (id: string, patch: Partial<T>, options: RecordPatchOptions = {}) =>
        patchRecord(adapter, id, patch, { ...options, optimistic: false }),
      patch: (id: string, patch: Partial<T>, options: RecordPatchOptions = {}) =>
        patchRecord(adapter, id, patch, { ...options, optimistic: true }),
      deleteRecord: (id: string, options?: { silent?: boolean }) => deleteRecord(adapter, id, options),
      batchDelete: (payload: { ids?: string[]; all?: boolean }, options?: { silent?: boolean }) =>
        batchDeleteRecords(adapter, payload, options),
      batchUpdateTags: (updates: Array<{ id: string; tags: string[] }>, options?: { silent?: boolean }) =>
        batchUpdateRecordTags(adapter, updates, options),
      reorder: (orderedIds: string[], optimisticList?: T[], options?: { silent?: boolean }) =>
        reorderRecords(adapter, orderedIds, optimisticList, options),
    };
  }

  const activeSubscriptions = computed(() => subscriptions.value.filter((sub) => sub.enabled));
  const activeProfiles = computed(() => profiles.value.filter((profile) => profile.enabled));

  const subActions = buildResourceActions(getMisubAdapter('subscription'));
  const nodeActions = buildResourceActions(getMisubAdapter('node'));
  const profileActions = buildResourceActions(profileAdapter);

  // --- Settings & Rule Templates ---

  async function saveSettings(
    newSettings: Partial<AppSettingsConfig>,
    options: { silent?: boolean; preferencesOnly?: boolean } = {},
  ): Promise<boolean> {
    const { silent = false, preferencesOnly = false } = options;
    editorStore.setLoading(true);
    try {
      await saveSettingsWithQueryClient(resolvePiniaQueryClient(), newSettings, {
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

  async function fetchRuleTemplates(options: { force?: boolean } = {}): Promise<RuleTemplateItem[]> {
    const list = await fetchRuleTemplatesWithQueryClient(resolvePiniaQueryClient(), options);
    ruleTemplates.value = list;
    hasLoadedRuleTemplates.value = true;
    return list;
  }

  async function ensureRuleTemplatesLoaded(options: { force?: boolean } = {}): Promise<RuleTemplateItem[]> {
    if (!options.force && (hasLoadedRuleTemplates.value || ruleTemplates.value.length > 0)) {
      return ruleTemplates.value;
    }
    if (!options.force && !hasDataLoaded.value) {
      return ruleTemplates.value;
    }
    if (ruleTemplatesInFlight) {
      return await ruleTemplatesInFlight;
    }
    ruleTemplatesInFlight = fetchRuleTemplates(options)
      .catch((error: unknown) => {
        console.warn('[Store] Failed to lazy-load rule templates:', error);
        return ruleTemplates.value;
      })
      .finally(() => {
        ruleTemplatesInFlight = null;
      });
    return await ruleTemplatesInFlight;
  }

  async function saveRuleTemplates(items: RuleTemplateItem[] = ruleTemplates.value): Promise<RuleTemplateItem[]> {
    editorStore.setLoading(true);
    try {
      const savedList = await saveRuleTemplatesWithQueryClient(resolvePiniaQueryClient(), items);
      ruleTemplates.value = savedList;
      hasLoadedRuleTemplates.value = true;
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
    ruleTemplates.value = [];
    hasLoadedRuleTemplates.value = false;
    ruleTemplatesInFlight = null;
    clearAppDataQueryCache(resolvePiniaQueryClient());
  }

  // --- Local Helpers (kept for synchronous cache seeding and internal optimistic updates) ---

  const addSubscription = (subscription: StoreMisubItem): void => void subscriptions.value.unshift(subscription);
  const overwriteSubscriptions = (items: StoreMisubItem[]): void => void (subscriptions.value = items);
  const removeSubscription = (id: string): void => {
    const index = subscriptions.value.findIndex((s) => s.id === id);
    if (index !== -1) subscriptions.value.splice(index, 1);
  };
  const updateSubscription = (id: string, updates: Partial<StoreMisubItem>): void => {
    const index = subscriptions.value.findIndex((s) => s.id === id);
    if (index !== -1) subscriptions.value[index] = { ...subscriptions.value[index], ...updates };
  };
  const addProfile = (profile: StoreProfileConfig): void => void profiles.value.unshift(profile);
  const overwriteProfiles = (items: StoreProfileConfig[]): void => void (profiles.value = items);
  const removeProfile = (id: string): void => {
    const index = profiles.value.findIndex((p) => p.id === id || p.customId === id);
    if (index === -1) return;
    const removed = profiles.value.splice(index, 1)[0];
    const ids = [removed.id, removed.customId].filter((value): value is string => Boolean(value));
    removeProfileFromProfiles(ids);
  };

  function applyProfilePrune(result: { profiles: StoreProfileConfig[]; modified: boolean }): void {
    if (result.modified) profiles.value = result.profiles;
  }

  const removeProfileFromProfiles = (profileIds: string | string[]): void =>
    applyProfilePrune(removeProfileRefsFromProfiles(profiles.value, profileIds));
  const removeManualNodeFromProfiles = (nodeIds: string | string[]): void =>
    applyProfilePrune(removeManualNodeRefsFromProfiles(profiles.value, nodeIds));
  const removeSubscriptionFromProfiles = (subIds: string | string[]): void =>
    applyProfilePrune(removeSubscriptionRefsFromProfiles(profiles.value, subIds));
  const pruneInvalidReferences = (): void =>
    applyProfilePrune(pruneInvalidProfileReferences(profiles.value, subscriptions.value));

  return {
    subscriptions,
    profiles,
    ruleTemplates,
    settings,
    isLoading,
    isMutating,
    lastUpdated,
    hasDataLoaded,
    hasLoadedRuleTemplates,

    activeSubscriptions,
    activeProfiles,

    fetchData,
    saveSettings,
    fetchRuleTemplates,
    ensureRuleTemplatesLoaded,
    saveRuleTemplates,
    hydrateFromData,
    clearCachedData,

    // 细粒度资源持久化 Actions
    createSubscription: subActions.create,
    createSubscriptionsBatch: (items: Array<Partial<StoreMisubItem>>, options?: { silent?: boolean }) =>
      createMisubResourcesBatch('subscription', items, options),
    updateSubscriptionRecord: subActions.updateRecord,
    patchSubscription: subActions.patch,
    deleteSubscriptionRecord: subActions.deleteRecord,
    batchDeleteSubscriptionsRecord: subActions.batchDelete,
    batchUpdateSubscriptionTagsRecord: subActions.batchUpdateTags,
    reorderSubscriptionsRecord: subActions.reorder,
    applySubscriptionRuntimeUpdate,
    syncSubscriptionFromServer,

    createNode: nodeActions.create,
    createNodesBatch: (items: Array<Partial<StoreMisubItem>>, options?: { silent?: boolean }) =>
      createMisubResourcesBatch('node', items, options),
    updateNodeRecord: nodeActions.updateRecord,
    patchNode: nodeActions.patch,
    deleteNodeRecord: nodeActions.deleteRecord,
    batchDeleteNodesRecord: nodeActions.batchDelete,
    batchUpdateNodeTagsRecord: nodeActions.batchUpdateTags,
    reorderNodesRecord: nodeActions.reorder,

    createProfile: profileActions.create,
    updateProfileRecord: profileActions.updateRecord,
    patchProfile: profileActions.patch,
    deleteProfileRecord: profileActions.deleteRecord,
    batchDeleteProfilesRecord: profileActions.batchDelete,
    batchUpdateProfileTagsRecord: profileActions.batchUpdateTags,
    reorderProfilesRecord: profileActions.reorder,
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
