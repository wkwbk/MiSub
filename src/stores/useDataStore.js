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
} from '@/queries/useAppDataQueries.js';
import {
  pruneInvalidProfileReferences,
  removeManualNodeRefsFromProfiles,
  removeProfileRefsFromProfiles,
  removeSubscriptionRefsFromProfiles,
} from '@/utils/profile-reference-pruner.js';
import { t } from '@/i18n/index.js';
import { getItemTags, hydrateItemTags, normalizeTagList } from '@/utils/tags.js';

export const useDataStore = defineStore('data', () => {
  const { showToast } = useToastStore();
  const settingsStore = useSettingsStore();
  const editorStore = useEditorStore();

  const subscriptions = ref([]);
  const profiles = ref([]);
  const ruleTemplates = ref([]);
  const settings = computed(() => settingsStore.config);

  const isLoading = ref(false);
  const saveState = ref('idle');
  const lastUpdated = ref(null);
  const dataRevision = ref('');
  const hasSaveConflict = ref(false);
  const hasDataLoaded = computed(() => !!lastUpdated.value);
  const isDirty = computed(() => editorStore.isDirty);

  const activeSubscriptions = computed(() => subscriptions.value.filter((sub) => sub.enabled));
  const activeProfiles = computed(() => profiles.value.filter((profile) => profile.enabled));

  function applyNormalizedSnapshot(snapshot) {
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

  function hydrateFromData(data) {
    if (!data) return false;
    try {
      const queryClient = resolvePiniaQueryClient();
      const snapshot = hydrateAppDataInQueryClient(queryClient, data, settingsStore.config);
      return applyNormalizedSnapshot(snapshot);
    } catch (error) {
      console.error('hydrateFromData failed:', error);
      return false;
    }
  }

  async function fetchData(forceRefresh = false) {
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
    } catch (error) {
      console.error('Failed to fetch data:', error);
      showToast(t('store.fetchDataFailed', { message: error.message }), 'error');
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function saveData(options = {}) {
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

      const payload = {
        misubs: sanitizedSubs,
        profiles: profiles.value.map((profile) => {
          const normalizedProfile = {
            ...profile,
            tags: normalizeTagList(getItemTags(profile)),
          };
          normalizedProfile.ruleLevel = normalizedProfile.ruleLevel || normalizedProfile.clashRuleLevel || '';
          delete normalizedProfile.clashRuleLevel;
          return normalizedProfile;
        }),
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
    } catch (error) {
      console.error('[Store] Failed to save data:', error);
      if (error?.status === 409 && error?.data?.code === 'DATA_CONFLICT') {
        hasSaveConflict.value = true;
        showToast(t('store.dataConflict'), 'warning');
      } else {
        showToast(t('store.saveDataFailed', { message: error.message }), 'error');
      }
      saveState.value = 'idle';
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function saveSettings(newSettings, options = {}) {
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
    } catch (error) {
      console.error('Failed to save settings:', error);
      if (!silent) {
        showToast(t('store.saveSettingsFailedWithMessage', { message: error.message }), 'error');
      }
      throw error;
    } finally {
      editorStore.setLoading(false);
    }
  }

  async function fetchRuleTemplates() {
    const queryClient = resolvePiniaQueryClient();
    const list = await fetchRuleTemplatesWithQueryClient(queryClient);
    ruleTemplates.value = list;
    return list;
  }

  async function saveRuleTemplates(items = ruleTemplates.value) {
    editorStore.setLoading(true);
    try {
      const queryClient = resolvePiniaQueryClient();
      const savedList = await saveRuleTemplatesWithQueryClient(queryClient, items);
      ruleTemplates.value = savedList;
      showToast(t('store.ruleTemplatesSaved'), 'success');
      return savedList;
    } catch (error) {
      console.error('Failed to save rule templates:', error);
      showToast(t('store.saveRuleTemplatesFailedWithMessage', { message: error.message }), 'error');
      throw error;
    } finally {
      editorStore.setLoading(false);
    }
  }

  function clearCachedData() {
    clearAppDataQueryCache(resolvePiniaQueryClient());
  }

  function addSubscription(subscription) {
    subscriptions.value.unshift(subscription);
    markDirty();
  }

  function overwriteSubscriptions(items) {
    subscriptions.value = items;
  }

  function removeSubscription(id) {
    const index = subscriptions.value.findIndex((s) => s.id === id);
    if (index !== -1) {
      subscriptions.value.splice(index, 1);
    }
  }

  function updateSubscription(id, updates) {
    const index = subscriptions.value.findIndex((s) => s.id === id);
    if (index !== -1) {
      subscriptions.value[index] = { ...subscriptions.value[index], ...updates };
      markDirty();
    }
  }

  function addProfile(profile) {
    profiles.value.unshift(profile);
  }

  function overwriteProfiles(items) {
    profiles.value = items;
  }

  function removeProfile(id) {
    const index = profiles.value.findIndex((p) => p.id === id || p.customId === id);
    if (index !== -1) {
      const removed = profiles.value.splice(index, 1)[0];
      removeProfileFromProfiles([removed.id, removed.customId].filter(Boolean));
    }
  }

  function removeProfileFromProfiles(profileIds) {
    const { profiles: next, modified } = removeProfileRefsFromProfiles(profiles.value, profileIds);
    if (modified) profiles.value = next;
  }

  function removeManualNodeFromProfiles(nodeIds) {
    const { profiles: next, modified } = removeManualNodeRefsFromProfiles(profiles.value, nodeIds);
    if (modified) profiles.value = next;
  }

  function removeSubscriptionFromProfiles(subIds) {
    const { profiles: next, modified } = removeSubscriptionRefsFromProfiles(profiles.value, subIds);
    if (modified) profiles.value = next;
  }

  function pruneInvalidReferences() {
    const { profiles: next, modified } = pruneInvalidProfileReferences(profiles.value, subscriptions.value);
    if (modified) profiles.value = next;
  }

  let saveStateResetTimer = null;

  function clearSaveStateResetTimer() {
    if (saveStateResetTimer !== null) {
      clearTimeout(saveStateResetTimer);
      saveStateResetTimer = null;
    }
  }

  function markDirty() {
    clearSaveStateResetTimer();
    if (saveState.value === 'success') {
      saveState.value = 'idle';
    }
    editorStore.markDirty();
  }

  function clearDirty() {
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
