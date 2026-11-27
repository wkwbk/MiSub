import { getActivePinia } from 'pinia';
import { ref, watch } from 'vue';
import { useToastStore } from '@/stores/useToastStore.js';
import { useDataStore, type MutationResult, type RecordConflictBannerModel, type RecordPatchOptions } from '@/stores/useDataStore.js';
import type { StoreMisubItem } from '@/queries/useAppDataQueries.js';
import { cleanNodeUrl, extractNodeName } from '@/lib/utils.js';
import { generateNodeId } from '@misub/core/utils/id.js';
import { getItemTags, normalizeTagList } from '@/utils/tags.js';
import { t } from '@/i18n/index.js';

export interface UseNodeFormsOptions {
  addNode: (node: StoreMisubItem) => Promise<MutationResult<StoreMisubItem>>;
  updateNode: (node: StoreMisubItem, options?: RecordPatchOptions) => Promise<MutationResult<StoreMisubItem>>;
}

export interface NodeConflictState extends RecordConflictBannerModel {
  current?: StoreMisubItem;
}

const isDev = import.meta.env.DEV;

export function useNodeForms({ addNode, updateNode }: UseNodeFormsOptions) {
  const { showToast } = useToastStore();
  const dataStore = getActivePinia() ? useDataStore() : null;
  const showModal = ref(false);
  const isNew = ref(false);
  const isSaving = ref(false);
  const editingNode = ref<StoreMisubItem | null>(null);
  const conflictState = ref<NodeConflictState | null>(null);

  watch(showModal, (visible) => {
    if (!visible) {
      conflictState.value = null;
    }
  });

  const openAdd = (): void => {
    conflictState.value = null;
    isNew.value = true;
    editingNode.value = {
      id: generateNodeId(),
      name: '',
      url: '',
      enabled: true,
      tags: [],
      colorTag: null,
    };
    showModal.value = true;
  };

  const openEdit = (node: StoreMisubItem | null | undefined): void => {
    if (!node) {
      console.error('UseNodeForms: openEdit called with null');
      return;
    }
    if (isDev) {
      console.debug('UseNodeForms: openEdit called with', node);
    }
    conflictState.value = null;
    isNew.value = false;
    editingNode.value = {
      ...node,
      tags: getItemTags(node),
    };
    showModal.value = true;
  };

  const handleUrlInput = (event: Event): void => {
    if (!editingNode.value) return;
    const target = event.target as HTMLInputElement | null;
    const newUrl = target?.value || '';
    if (newUrl && !editingNode.value.name) {
      editingNode.value.name = extractNodeName(newUrl);
    }
  };

  const handleSave = async (options: { force?: boolean } = {}): Promise<boolean> => {
    if (isSaving.value) return false;

    if (!editingNode.value || !editingNode.value.url) {
      showToast(t('manualNodes.urlRequired'), 'error');
      return false;
    }

    const cleanedUrl = cleanNodeUrl(editingNode.value.url);
    const normalizedTags = normalizeTagList(editingNode.value.tags);
    editingNode.value.url = cleanedUrl;
    editingNode.value.tags = normalizedTags;

    const expectedConfigVersion =
      editingNode.value.configVersion !== undefined ? Math.max(1, Number(editingNode.value.configVersion) || 1) : 1;

    // 剥离 sortIndex、测速运行态与版本字段，避免覆盖并发重排或测速结果
    const {
      sortIndex: _omitSortIndex,
      configVersion: _omitConfigVersion,
      version: _omitVersion,
      createdAt: _omitCreatedAt,
      updatedAt: _omitUpdatedAt,
      latency: _omitLatency,
      status: _omitStatus,
      latencyMode: _omitLatencyMode,
      lastTestedAt: _omitLastTestedAt,
      ...editableNodeFields
    } = editingNode.value;

    const nodePayload: StoreMisubItem = {
      ...editableNodeFields,
      url: cleanedUrl,
      tags: normalizedTags,
    } as StoreMisubItem;

    isSaving.value = true;
    try {
      let result: MutationResult<StoreMisubItem>;
      if (isNew.value) {
        result = await addNode(nodePayload);
      } else {
        result = await updateNode(
          nodePayload,
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
    editingNode.value = {
      ...JSON.parse(JSON.stringify(serverCurrent)),
      tags: getItemTags(serverCurrent),
    };
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
    editingNode,
    conflictState,
    openAdd,
    openEdit,
    handleUrlInput,
    handleSave,
    reloadFromConflict,
    forceSaveFromConflict,
  };
}
