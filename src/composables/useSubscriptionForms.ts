import { getActivePinia } from 'pinia';
import { ref, watch } from 'vue';
import { isValidHttpUrlString } from '@misub/core/utils/url-validators.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { useDataStore, type MutationResult, type RecordConflictBannerModel, type RecordPatchOptions } from '@/stores/useDataStore.js';
import type { StoreMisubItem } from '@/queries/useAppDataQueries.js';
import { applyItemTags, getItemTags } from '@/utils/tags.js';
import { generateSubscriptionId } from '@misub/core/utils/id.js';
import { t } from '@/i18n/index.js';

export interface UseSubscriptionFormsOptions {
  addSubscription: (sub: StoreMisubItem) => Promise<MutationResult<StoreMisubItem>>;
  updateSubscription: (sub: StoreMisubItem, options?: RecordPatchOptions) => Promise<MutationResult<StoreMisubItem>>;
}

export interface SubscriptionConflictState extends RecordConflictBannerModel {
  current?: StoreMisubItem;
}

export type EditableSubscriptionForm = Partial<StoreMisubItem> & {
  name: string;
  url: string;
  enabled: boolean;
  tags: string[];
};

const isDev = import.meta.env.DEV;

export function useSubscriptionForms({ addSubscription, updateSubscription }: UseSubscriptionFormsOptions) {
  const { showToast } = useToastStore();
  const dataStore = getActivePinia() ? useDataStore() : null;
  const showModal = ref(false);
  const isNew = ref(false);
  const isSaving = ref(false);
  const editingSubscription = ref<EditableSubscriptionForm | null>(null);
  const conflictState = ref<SubscriptionConflictState | null>(null);

  watch(showModal, (visible) => {
    if (!visible) {
      conflictState.value = null;
    }
  });

  const openAdd = (): void => {
    conflictState.value = null;
    isNew.value = true;
    editingSubscription.value = {
      name: '',
      url: '',
      enabled: true,
      autoUpdate: true,
      disabledNodes: [],
      exclude: '',
      customUserAgent: '',
      fetchProxy: '',
      enableNodeCache: false,
      plusAsSpace: false,
      excludeTraffic: false,
      website: '',
      notes: '',
      tags: [],
    };
    showModal.value = true;
  };

  const openEdit = (sub: StoreMisubItem | null | undefined): void => {
    if (!sub) {
      console.error('UseSubscriptionForms: openEdit called with null/undefined');
      return;
    }
    if (isDev) {
      console.debug('UseSubscriptionForms: openEdit called with', sub);
    }
    conflictState.value = null;
    isNew.value = false;
    try {
      const cloned = JSON.parse(JSON.stringify(sub)) as EditableSubscriptionForm;
      cloned.autoUpdate = cloned.autoUpdate !== false;
      cloned.disabledNodes = Array.isArray(cloned.disabledNodes) ? cloned.disabledNodes : [];
      cloned.tags = getItemTags(cloned);
      editingSubscription.value = cloned;
      showModal.value = true;
    } catch (e: unknown) {
      console.error('UseSubscriptionForms: Failed to clone subscription', e);
      showToast(t('subscriptions.openEditFailed'), 'error');
    }
  };

  const handleSave = async (options: { force?: boolean } = {}): Promise<boolean> => {
    if (isSaving.value) return false;

    if (!editingSubscription.value || !editingSubscription.value.url) {
      showToast(t('subscriptions.urlRequired'), 'error');
      return false;
    }
    if (!isValidHttpUrlString(editingSubscription.value.url)) {
      showToast(t('subscriptions.invalidUrl'), 'error');
      return false;
    }

    const expectedConfigVersion =
      editingSubscription.value.configVersion !== undefined
        ? Math.max(1, Number(editingSubscription.value.configVersion) || 1)
        : 1;

    // 剥离 sortIndex、运行态字段与版本元数据，避免与并发拖拽重排或刷新互相覆盖
    const {
      sortIndex: _omitSortIndex,
      configVersion: _omitConfigVersion,
      version: _omitVersion,
      createdAt: _omitCreatedAt,
      updatedAt: _omitUpdatedAt,
      isUpdating: _omitUpdating,
      nodeCount: _omitNodeCount,
      lastGoodNodeCount: _omitLastGood,
      userInfo: _omitUserInfo,
      detectedName: _omitDetectedName,
      lastError: _omitLastError,
      lastUpdate: _omitLastUpdate,
      latency: _omitLatency,
      status: _omitStatus,
      latencyMode: _omitLatencyMode,
      lastTestedAt: _omitLastTestedAt,
      ...editableFields
    } = editingSubscription.value;

    const payload = applyItemTags(editableFields as EditableSubscriptionForm, editingSubscription.value.tags);

    isSaving.value = true;
    try {
      let result: MutationResult<StoreMisubItem>;
      if (isNew.value) {
        result = await addSubscription({ ...payload, id: generateSubscriptionId() } as StoreMisubItem);
      } else if (payload.id) {
        result = await updateSubscription(
          payload as StoreMisubItem,
          options.force
            ? { force: true }
            : {
                expectedConfigVersion,
                suppressConflictToast: true,
              },
        );
        if (!result.ok && result.conflict) {
          if (result.conflict.current && dataStore) {
            dataStore.syncSubscriptionFromServer(result.conflict.current);
          }
          const serverVer = Math.max(
            expectedConfigVersion + 1,
            Number(result.conflict.current?.configVersion) || expectedConfigVersion + 1,
          );
          conflictState.value = {
            current: result.conflict.current,
            localVersion: expectedConfigVersion,
            serverVersion: serverVer,
            message: result.conflict.message,
          };
          showToast(t('store.recordConflictTitle'), 'warning');
          return false;
        }
      } else {
        return false;
      }

      if (result.ok) {
        conflictState.value = null;
        showModal.value = false;
        return true;
      }
      return false;
    } finally {
      isSaving.value = false;
    }
  };

  const reloadFromConflict = (): void => {
    const serverCurrent = conflictState.value?.current;
    if (!serverCurrent) {
      conflictState.value = null;
      return;
    }
    const cloned = JSON.parse(JSON.stringify(serverCurrent)) as EditableSubscriptionForm;
    cloned.autoUpdate = cloned.autoUpdate !== false;
    cloned.disabledNodes = Array.isArray(cloned.disabledNodes) ? cloned.disabledNodes : [];
    cloned.tags = getItemTags(cloned);
    editingSubscription.value = cloned;
    conflictState.value = null;
    showToast(t('store.reloadedLatestRecord'), 'info');
  };

  const forceSaveFromConflict = async (): Promise<boolean> => {
    return await handleSave({ force: true });
  };

  return {
    showModal,
    isNew,
    isSaving,
    editingSubscription,
    conflictState,
    openAdd,
    openEdit,
    handleSave,
    reloadFromConflict,
    forceSaveFromConflict,
  };
}
