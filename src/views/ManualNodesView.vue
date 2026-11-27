<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { ManualNodeItem } from '@misub/core/types.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { useManualNodes, type TagBatchMode } from '@/composables/useManualNodes.js';
import type { DedupPlan } from '@/composables/manual-nodes/dedup.js';
import { useSortingMode } from '@/composables/useSortingMode.js';
import { useNodeForms } from '@/composables/useNodeForms.js';
import { useToastStore } from '@/stores/useToastStore.js';
import ManualNodePanel from '@/components/nodes/ManualNodePanel.vue';
import Modal from '@/components/ui/Modal.vue';
import ManualNodeEditModal from '@/components/modals/ManualNodeEditModal.vue';
import ManualNodeDedupModal from '@/components/modals/ManualNodeDedupModal.vue';
import ImportModal from '@/components/modals/ImportModal.vue';
import BatchTagModal from '@/components/modals/BatchTagModal.vue';
import { useI18n } from '@/i18n/index.js';
import { scheduleIdlePrefetch } from '@/utils/prefetch.js';

const loadTagManagementModal = () => import('@/components/modals/TagManagementModal.vue');
const TagManagementModal = defineAsyncComponent(loadTagManagementModal);

let cancelModalPrefetch = () => {};
onMounted(() => {
  cancelModalPrefetch = scheduleIdlePrefetch([loadTagManagementModal]);
});
onUnmounted(() => {
  cancelModalPrefetch();
});

const dataStore = useDataStore();
const { showToast } = useToastStore();
const { t } = useI18n();

const isSortingNodes = useSortingMode();
const showDeleteNodesModal = ref(false);
const showBatchDeleteModal = ref(false);
const batchDeleteIds = ref<string[]>([]);
const showSubscriptionImportModal = ref(false);
const showDedupModal = ref(false);
const dedupPlan = ref<DedupPlan | null>(null);
const showBatchTagModal = ref(false);
const batchTagIds = ref<string[]>([]);
const showTagManagementModal = ref(false);

const {
  manualNodes: rawManualNodes,
  manualNodesCurrentPage,
  manualNodesTotalPages,
  paginatedManualNodes,
  searchTerm,
  changeManualNodesPage,
  addNode,
  updateNode,
  deleteNode,
  deleteAllNodes,
  addNodesFromBulk,
  autoSortNodes,
  buildDedupPlan,
  applyDedupPlan,
  reorderManualNodes,
  manualNodeTags,
  renameTag,
  deleteTag,
  reorderTags,
  activeTagFilters,
  setTagFilters,
  toggleTagFilter,
  attrFilters,
  toggleProtocolFilter,
  toggleCountryFilter,
  toggleNetworkFilter,
  clearAttrFilters,
  batchUpdateTags,
  batchDeleteNodes,
  manualNodesPerPage,
  nodeInspectMap,
  isInspectingNodes,
  pingMode,
  setPingMode,
  inspectNodes,
  pingResults,
  pingingNodes,
  isPingingAll,
  pingNodeId,
  pingAllNodes,
  sortNodesByLatency,
} = useManualNodes();
const manualNodes = rawManualNodes as unknown as Ref<ManualNodeItem[]>;

watch(
  () => manualNodes.value.map((n) => `${n.id}:${n.url}`).join('|'),
  () => {
    if (manualNodes.value.length > 0) {
      inspectNodes(manualNodes.value, { silent: true });
    }
  },
  { immediate: true },
);

const handleSearchTermUpdate = (val: string) => {
  searchTerm.value = val;
};

const {
  showModal: showNodeModal,
  isNew: isNewNode,
  editingNode,
  conflictState: nodeConflict,
  openAdd: handleAddNode,
  openEdit: handleEditNode,
  handleUrlInput: handleNodeUrlInput,
  isSaving: isSavingNode,
  handleSave: handleSaveNode,
  reloadFromConflict: reloadNodeConflict,
  forceSaveFromConflict: forceSaveNodeConflict,
} = useNodeForms({ addNode, updateNode });

const handleDeleteNodeWithCleanup = (nodeId: string) => {
  deleteNode(nodeId);
};

const handleDeleteAllNodesWithCleanup = () => {
  deleteAllNodes();
  showDeleteNodesModal.value = false;
};

const handleAutoSortNodes = () => {
  autoSortNodes();
  showToast(t('manualNodes.sortedByRegion'), 'success');
};

const handleSortByLatency = async () => {
  const ok = await sortNodesByLatency();
  showToast(ok ? t('manualNodes.sortByLatencyDone') : t('manualNodes.sortByLatencyNoData'), ok ? 'success' : 'warning');
};

const handleDeduplicateNodes = () => {
  const plan = buildDedupPlan();
  if (!plan || plan.removeCount === 0) {
    showToast(t('manualNodes.noDuplicates'), 'info');
    return;
  }
  dedupPlan.value = plan;
  showDedupModal.value = true;
};

const handleOpenBatchTagModal = (ids: string[]) => {
  batchTagIds.value = ids;
  showBatchTagModal.value = true;
};

const handleBatchTagConfirm = (payload: { tags: string[]; mode: TagBatchMode }) => {
  batchUpdateTags(batchTagIds.value, payload);
  batchTagIds.value = [];
};

const handleBatchDeleteRequest = (ids: string[]) => {
  if (ids && ids.length > 0) {
    batchDeleteIds.value = ids;
    showBatchDeleteModal.value = true;
  }
};

const confirmBatchDelete = () => {
  batchDeleteNodes(batchDeleteIds.value);
  batchDeleteIds.value = [];
  showBatchDeleteModal.value = false;
};

const handleOpenTagManagement = () => {
  showTagManagementModal.value = true;
};

const handleTagRename = (oldName: string, newName: string) => {
  renameTag(oldName, newName);
  showToast(t('tags.tagRenamed', { oldName, newName }), 'success');
};

const handleTagDelete = (tagName: string) => {
  deleteTag(tagName);
  showToast(t('tags.tagDeleted', { name: tagName }), 'success');
};

const handleTagReorder = (newOrder: string[]) => {
  reorderTags(newOrder);
  showToast(t('tags.tagOrderUpdated'), 'success');
};
</script>

<template>
  <div class="w-full">
    <ManualNodePanel
      :active-tag-filters="activeTagFilters"
      :attr-filters="attrFilters"
      :current-page="manualNodesCurrentPage"
      :is-inspecting-nodes="isInspectingNodes"
      :is-pinging-all="isPingingAll"
      :is-sorting="isSortingNodes"
      :items-per-page="manualNodesPerPage"
      :manual-nodes="manualNodes"
      :node-inspect-map="nodeInspectMap"
      :paginated-manual-nodes="paginatedManualNodes"
      :ping-mode="pingMode"
      :ping-results="pingResults"
      :pinging-nodes="pingingNodes"
      :search-term="searchTerm"
      :tags="manualNodeTags"
      :total-pages="manualNodesTotalPages"
      @add="handleAddNode"
      @deduplicate="handleDeduplicateNodes"
      @delete="handleDeleteNodeWithCleanup"
      @edit="(id) => handleEditNode(manualNodes.find((n) => n.id === id))"
      @import="showSubscriptionImportModal = true"
      @inspect-all="inspectNodes(manualNodes, { force: true })"
      @ping="pingNodeId"
      @reorder="reorderManualNodes"
      @update:items-per-page="(val) => (manualNodesPerPage = val)"
      @update:ping-mode="setPingMode"
      @change-page="changeManualNodesPage"
      @update:search-term="handleSearchTermUpdate"
      @toggle-sort="isSortingNodes = !isSortingNodes"
      @auto-sort="handleAutoSortNodes"
      @delete-all="showDeleteNodesModal = true"
      @set-tag-filters="setTagFilters"
      @toggle-tag-filter="toggleTagFilter"
      @toggle-protocol-filter="toggleProtocolFilter"
      @toggle-country-filter="toggleCountryFilter"
      @toggle-network-filter="toggleNetworkFilter"
      @clear-attr-filters="clearAttrFilters"
      @batch-delete-nodes="handleBatchDeleteRequest"
      @open-batch-tag-modal="handleOpenBatchTagModal"
      @manage-tags="handleOpenTagManagement"
      @ping-all="pingAllNodes"
      @sort-by-latency="handleSortByLatency"
    />

    <ManualNodeEditModal
      v-model:editing-node="editingNode"
      v-model:show="showNodeModal"
      :conflict="nodeConflict"
      :is-new="isNewNode"
      :is-saving="isSavingNode"
      :tags="manualNodeTags"
      @confirm="handleSaveNode"
      @force-save-conflict="forceSaveNodeConflict"
      @input-url="handleNodeUrlInput"
      @reload-conflict="reloadNodeConflict"
    />
    <ManualNodeDedupModal
      v-model:show="showDedupModal"
      :plan="dedupPlan!"
      @confirm="
        applyDedupPlan(dedupPlan!);
        showDedupModal = false;
        dedupPlan = null;
      "
    />

    <BatchTagModal v-model:show="showBatchTagModal" :tags="manualNodeTags" @confirm="handleBatchTagConfirm" />

    <TagManagementModal
      v-model:show="showTagManagementModal"
      :tags="manualNodeTags"
      @delete="handleTagDelete"
      @rename="handleTagRename"
      @reorder="handleTagReorder"
    />

    <Modal v-model:show="showDeleteNodesModal" @confirm="handleDeleteAllNodesWithCleanup">
      <template #title>
        <h3 class="text-lg font-bold text-red-500">
          {{ t('manualNodes.deleteAllConfirmTitle') }}
        </h3>
      </template>
      <template #body>
        <p class="text-sm text-fg-subtle">
          {{ t('manualNodes.deleteAllConfirmBody') }}
        </p>
      </template>
    </Modal>

    <Modal v-model:show="showBatchDeleteModal" @confirm="confirmBatchDelete">
      <template #title>
        <h3 class="text-lg font-bold text-red-500">
          {{ t('manualNodes.batchDeleteConfirmTitle') }}
        </h3>
      </template>
      <template #body>
        <p class="text-sm text-fg-muted">
          {{ t('manualNodes.batchDeleteConfirmBody', { count: batchDeleteIds.length }) }}
        </p>
      </template>
    </Modal>

    <ImportModal
      :add-nodes-from-bulk="addNodesFromBulk"
      :show="showSubscriptionImportModal"
      :tags="manualNodeTags"
      mode="nodes"
      @update:show="showSubscriptionImportModal = $event"
    />
  </div>
</template>
