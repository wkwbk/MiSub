<script setup>
import { computed, nextTick, ref } from 'vue';
import BulkOperations from '@/components/nodes/ManualNodePanel/BulkOperations.vue';
import NodeActions from '@/components/nodes/ManualNodePanel/NodeActions.vue';
import NodeTable from '@/components/nodes/ManualNodePanel/NodeTable.vue';
import NodeDetailModal from '@/components/modals/NodeDetailModal.vue';
import { useManualNodeSearchPagination } from '@/composables/manual-nodes/useManualNodeSearchPagination.js';

const props = defineProps({
  manualNodes: { type: Array, default: () => [] },
  paginatedManualNodes: Array,
  currentPage: Number,
  totalPages: Number,
  isSorting: Boolean,
  searchTerm: String,
  tags: { type: Array, default: () => [] },
  activeTagFilters: { type: Array, default: () => [] },
  itemsPerPage: { type: Number, default: 24 },
  pingResults: { type: Object, default: () => ({}) },
  pingingNodes: { type: Object, default: () => new Set() },
  isPingingAll: { type: Boolean, default: false },
  compactGrid: { type: Boolean, default: false },
});

const emit = defineEmits([
  'add',
  'delete',
  'edit',
  'changePage',
  'update:searchTerm',
  'toggleSort',
  'markDirty',
  'autoSort',
  'deduplicate',
  'import',
  'deleteAll',
  'reorder',
  'update:itemsPerPage',
  'set-tag-filters',
  'toggle-tag-filter',
  'open-batch-tag-modal',
  'batch-delete-nodes',
  'ping',
  'ping-all',
  'sort-by-latency',
  'manage-tags',
]);

const isSelectionMode = ref(false);
const selectedNodeIds = ref(new Set());

const { localSearchTerm, filteredNodes, paginatedNodes, currentSearchPage, totalSearchPages, handlePageChange } =
  useManualNodeSearchPagination({
    manualNodes: computed(() => props.manualNodes),
    paginatedManualNodes: computed(() => props.paginatedManualNodes || []),
    initialSearchTerm: computed(() => props.searchTerm || ''),
    activeTagFilters: computed(() => props.activeTagFilters),
    onBasePageChange: (page) => emit('changePage', page),
    onSearchTermChange: (value) => emit('update:searchTerm', value),
  });

const toggleSelectionMode = () => {
  isSelectionMode.value = !isSelectionMode.value;
  selectedNodeIds.value.clear();
};

const toggleNodeSelection = (nodeId) => {
  if (selectedNodeIds.value.has(nodeId)) {
    selectedNodeIds.value.delete(nodeId);
  } else {
    selectedNodeIds.value.add(nodeId);
  }
};

const isAllSelected = computed(() => {
  if (paginatedNodes.value.length === 0) return false;
  return paginatedNodes.value.every((node) => selectedNodeIds.value.has(node.id));
});

const selectedCount = computed(() => selectedNodeIds.value.size);

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    paginatedNodes.value.forEach((node) => selectedNodeIds.value.delete(node.id));
  } else {
    paginatedNodes.value.forEach((node) => selectedNodeIds.value.add(node.id));
  }
};

const handleBatchTag = () => {
  emit('open-batch-tag-modal', Array.from(selectedNodeIds.value));
};

const handleBatchDelete = () => {
  emit('batch-delete-nodes', Array.from(selectedNodeIds.value));
  selectedNodeIds.value.clear();
  isSelectionMode.value = false;
};

const draggableManualNodes = computed({
  get: () => (props.isSorting ? [...filteredNodes.value] : [...props.manualNodes]),
  set: (val) => emit('reorder', val),
});

const handleDelete = (id) => emit('delete', id);
const handleEdit = (id) => emit('edit', id);
const detailNode = ref(null);
const showDetailModal = ref(false);
const handleDetail = (node) => {
  detailNode.value = node;
  showDetailModal.value = true;
};
const handleAdd = () => emit('add');
const handleChangePage = (page) => handlePageChange(page);
const handleSearchTermUpdate = (value) => {
  localSearchTerm.value = value || '';
};
const handleToggleSort = () => {
  emit('toggleSort');
  nextTick(() => {
    if (!props.isSorting && !props.searchTerm) {
      emit('changePage', 1);
    }
  });
};
const handleSortEnd = () => {
  emit('markDirty');
  if (!props.searchTerm) {
    emit('changePage', 1);
  }
};
const handleAutoSort = () => emit('autoSort');
const handleDeduplicate = () => emit('deduplicate');
const handleImport = () => emit('import');
const handleDeleteAll = () => emit('deleteAll');
</script>

<template>
  <div>
    <NodeActions
      :active-tag-filters="activeTagFilters"
      :filtered-nodes-count="filteredNodes.length"
      :is-pinging-all="isPingingAll"
      :is-selection-mode="isSelectionMode"
      :is-sorting="isSorting"
      :manual-node-tags="tags"
      :manual-nodes-count="manualNodes.length"
      :search-term="localSearchTerm"
      @add="handleAdd"
      @deduplicate="handleDeduplicate"
      @import="handleImport"
      @update:search-term="handleSearchTermUpdate"
      @set-tag-filters="emit('set-tag-filters', $event)"
      @auto-sort="handleAutoSort"
      @toggle-sort="handleToggleSort"
      @delete-all="handleDeleteAll"
      @toggle-selection-mode="toggleSelectionMode"
      @ping-all="emit('ping-all')"
      @sort-by-latency="emit('sort-by-latency')"
      @manage-tags="emit('manage-tags')"
    />

    <BulkOperations
      :is-all-selected="isAllSelected"
      :is-selection-mode="isSelectionMode"
      :selected-count="selectedCount"
      @exit="
        () => {
          selectedNodeIds.clear();
          isSelectionMode = false;
        }
      "
      @toggle-select-all="toggleSelectAll"
      @batch-tag="handleBatchTag"
      @batch-delete="handleBatchDelete"
    />

    <NodeTable
      v-model:draggable-manual-nodes="draggableManualNodes"
      :base-page="props.currentPage"
      :base-total-pages="props.totalPages"
      :compact-grid="compactGrid"
      :filtered-nodes="filteredNodes"
      :is-selection-mode="isSelectionMode"
      :is-sorting="isSorting"
      :items-per-page="itemsPerPage"
      :local-search-term="localSearchTerm"
      :manual-nodes="manualNodes"
      :paginated-nodes="paginatedNodes"
      :ping-results="pingResults"
      :pinging-nodes="pingingNodes"
      :search-page="currentSearchPage"
      :search-total-pages="totalSearchPages"
      :selected-node-ids="selectedNodeIds"
      @delete="handleDelete"
      @detail="handleDetail"
      @edit="handleEdit"
      @ping="emit('ping', $event)"
      @update:items-per-page="emit('update:itemsPerPage', $event)"
      @toggle-select="toggleNodeSelection"
      @sort-end="handleSortEnd"
      @change-page="handleChangePage"
      @toggle-tag-filter="emit('toggle-tag-filter', $event)"
      @clear-search="handleSearchTermUpdate('')"
      @toggle-sort="handleToggleSort"
    />

    <NodeDetailModal v-model:show="showDetailModal" :node="detailNode" />
  </div>
</template>
