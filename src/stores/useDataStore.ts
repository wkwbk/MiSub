import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useToastStore } from '@/stores/useToastStore.js';
import { useSettingsStore } from '@/stores/useSettingsStore.js';
import { useEditorStore } from '@/stores/useEditorStore.js';
import { resolvePiniaQueryClient } from '@/lib/query-client.js';
import {
  clearAppDataQueryCache,
  fetchAppDataWithQueryClient,
  fetchRuleTemplatesWithQueryClient,
  hydrateAppDataInQueryClient,
  saveMisubsWithQueryClient,
  saveRuleTemplatesWithQueryClient,
  saveSettingsWithQueryClient,
  type AppDataSnapshot,
  type AppSettingsConfig,
  type RawAppDataPayload,
  type RuleTemplateItem,
  type SaveMisubsPayload,
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

export type SaveState = 'idle' | 'saving' | 'success';

function isDataConflictError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const errObj = error as { status?: unknown; data?: unknown };
  if (errObj.status !== 409 || !errObj.data || typeof errObj.data !== 'object') return false;
  return (errObj.data as { code?: unknown }).code === 'DATA_CONFLICT';
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
  const saveState = ref<SaveState>('idle');
  const lastUpdated = ref<Date | null>(null);
  const dataRevision = ref('');
  const hasSaveConflict = ref(false);
  const hasDataLoaded = computed(() => !!lastUpdated.value);
  const isDirty = computed(() => editorStore.isDirty);

  const activeSubscriptions = computed(() => subscriptions.value.filter((sub) => sub.enabled));
  const activeProfiles = computed(() => profiles.value.filter((profile) => profile.enabled));

  function applyNormalizedSnapshot(snapshot: AppDataSnapshot | null | undefined): boolean {
    if (!snapshot) return false;
    subscriptions.value = snapshot.misubs;
    profiles.value = snapshot.profiles;
    ruleTemplates.value = snapshot.ruleTemplates;
    settingsStore.setConfig(snapshot.config);
    if (typeof snapshot.dataRevision === 'string') {
      dataRevision.value = snapshot.dataRevision;
    }
    hasSaveConflict.value = false;
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
        clearDirty();
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

  async function saveData(options: { force?: boolean } = {}): Promise<boolean> {
    if (isLoading.value) {
      showToast(t('store.tooFrequent'), 'warning');
      return false;
    }

    const force = Boolean(options?.force);
    isLoading.value = true;
    saveState.value = 'saving';
    pruneInvalidReferences();

    try {
      const queryClient = resolvePiniaQueryClient();
      const sanitizedSubs = subscriptions.value.map((sub) => {
        const { isUpdating: _isUpdating, ...rest } = sub;
        return hydrateItemTags(rest);
      });

      const normalizedProfiles: StoreProfileConfig[] = profiles.value.map((profile) => {
        const { clashRuleLevel, ...restProfile } = profile;
        return {
          ...restProfile,
          tags: normalizeTagList(getItemTags(profile)),
          ruleLevel: restProfile.ruleLevel || clashRuleLevel || '',
        };
      });

      const payload: SaveMisubsPayload = {
        misubs: sanitizedSubs,
        profiles: normalizedProfiles,
        ...(dataRevision.value ? { baseRevision: dataRevision.value } : {}),
        ...(force ? { force: true } : {}),
      };

      const result = await saveMisubsWithQueryClient(queryClient, payload, {
        fallbackConfig: settingsStore.config,
      });

      if (result.data) {
        if (result.data.misubs) subscriptions.value = result.data.misubs;
        if (result.data.profiles) profiles.value = result.data.profiles;
      }
      if (typeof result.dataRevision === 'string') {
        dataRevision.value = result.dataRevision;
      }
      hasSaveConflict.value = false;

      showToast(t('store.dataSaved'), 'success');
      lastUpdated.value = new Date();
      clearDirty();
      saveState.value = 'success';

      clearSaveStateResetTimer();
      saveStateResetTimer = setTimeout(() => {
        saveStateResetTimer = null;
        if (saveState.value === 'success') {
          saveState.value = 'idle';
        }
      }, 2000);

      return true;
    } catch (error: unknown) {
      console.error('[Store] Failed to save data:', error);
      if (isDataConflictError(error)) {
        hasSaveConflict.value = true;
        showToast(t('store.dataConflict'), 'warning');
      } else {
        showToast(t('store.saveDataFailed', { message: extractErrorMessage(error) }), 'error');
      }
      saveState.value = 'idle';
      return false;
    } finally {
      isLoading.value = false;
    }
  }

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

  function addSubscription(subscription: StoreMisubItem): void {
    subscriptions.value.unshift(subscription);
    markDirty();
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
      markDirty();
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

  let saveStateResetTimer: ReturnType<typeof setTimeout> | null = null;

  function clearSaveStateResetTimer(): void {
    if (saveStateResetTimer !== null) {
      clearTimeout(saveStateResetTimer);
      saveStateResetTimer = null;
    }
  }

  function markDirty(): void {
    clearSaveStateResetTimer();
    if (saveState.value === 'success') {
      saveState.value = 'idle';
    }
    editorStore.markDirty();
  }

  function clearDirty(): void {
    editorStore.clearDirty();
  }

  return {
    subscriptions,
    profiles,
    ruleTemplates,
    settings,
    isLoading,
    saveState,
    lastUpdated,
    dataRevision,
    hasSaveConflict,
    hasDataLoaded,
    isDirty,

    activeSubscriptions,
    activeProfiles,

    fetchData,
    saveData,
    saveSettings,
    fetchRuleTemplates,
    saveRuleTemplates,
    hydrateFromData,
    clearCachedData,

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
    markDirty,
    clearDirty,
  };
});
