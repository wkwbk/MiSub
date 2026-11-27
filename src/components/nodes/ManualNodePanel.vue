<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { ManualNodeItem } from '@misub/core/types.js';
import BulkOperations from '@/components/nodes/ManualNodePanel/BulkOperations.vue';
import NodeActions from '@/components/nodes/ManualNodePanel/NodeActions.vue';
import NodeTable from '@/components/nodes/ManualNodePanel/NodeTable.vue';
import NodeDetailModal from '@/components/modals/NodeDetailModal.vue';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/pagination.js';
import { useManualNodeSearchPagination } from '@/composables/manual-nodes/useManualNodeSearchPagination.js';
import { collectNodeAttributeOptions, type NodeInspectMap } from '@/composables/manual-nodes/filters.js';
import type { PingResult } from '@/composables/useManualNodes.js';

interface NodeAttrFilters {
  protocol: string;
  country: string;
  network: string;
}

const props = withDefaults(
  defineProps<{
    manualNodes?: ManualNodeItem[];
    paginatedManualNodes?: ManualNodeItem[];
    currentPage?: number;
    totalPages?: number;
    isSorting?: boolean;
    searchTerm?: string;
    tags?: string[];
    activeTagFilters?: string[];
    itemsPerPage?: number;
    pingResults?: Record<string, PingResult>;
    pingingNodes?: Set<string>;
    isPingingAll?: boolean;
    nodeInspectMap?: NodeInspectMap;
    isInspectingNodes?: boolean;
    pingMode?: string;
    attrFilters?: NodeAttrFilters;
    compactGrid?: boolean;
  }>(),
  {
    manualNodes: () => [],
    paginatedManualNodes: undefined,
    currentPage: undefined,
    totalPages: undefined,
    isSorting: false,
    searchTerm: '',
    tags: () => [],
    activeTagFilters: () => [],
    itemsPerPage: DEFAULT_LIST_PAGE_SIZE,
    pingResults: () => ({}),
    pingingNodes: () => new Set<string>(),
    isPingingAll: false,
    nodeInspectMap: () => ({}),
    isInspectingNodes: false,
    pingMode: 'local',
    attrFilters: () => ({ protocol: '', country: '', network: '' }),
    compactGrid: false,
  },
);

const emit = defineEmits<{
  add: [];
  delete: [id: string];
  edit: [id: string];
  changePage: [page: number];
  'update:searchTerm': [value: string];
  toggleSort: [];
  autoSort: [];
  deduplicate: [];
  import: [];
  deleteAll: [];
  reorder: [nodes: ManualNodeItem[]];
  'update:itemsPerPage': [itemsPerPage: number];
  'set-tag-filters': [filters: string[]];
  'toggle-tag-filter': [tag: string];
  'toggle-protocol-filter': [protocol: string];
  'toggle-country-filter': [country: string];
  'toggle-network-filter': [network: string];
  'clear-attr-filters': [];
  'open-batch-tag-modal': [ids: string[]];
  'batch-delete-nodes': [ids: string[]];
  ping: [id: string];
  'ping-all': [];
  'inspect-all': [];
  'update:pingMode': [mode: string];
  'sort-by-latency': [];
  'manage-tags': [];
}>();

const isSelectionMode = ref(false);
const selectedNodeIds = ref(new Set<string>());

const attributeOptions = computed(() => collectNodeAttributeOptions(props.manualNodes, props.nodeInspectMap));

const {
  localSearchTerm,
  filteredNodes,
  paginatedNodes,
  currentSearchPage,
  totalSearchPages,
  useLocalPagination,
  handlePageChange,
} = useManualNodeSearchPagination({
  manualNodes: computed(() => props.manualNodes),
  paginatedManualNodes: computed(() => props.paginatedManualNodes || []),
  initialSearchTerm: computed(() => props.searchTerm || ''),
  activeTagFilters: computed(() => props.activeTagFilters),
  attrFilters: computed(() => props.attrFilters),
  nodeInspectMap: computed(() => props.nodeInspectMap),
  itemsPerPage: computed(() => props.itemsPerPage),
  onBasePageChange: (page: number) => emit('changePage', page),
  onSearchTermChange: (value: string) => emit('update:searchTerm', value),
});

const toggleSelectionMode = () => {
  isSelectionMode.value = !isSelectionMode.value;
  selectedNodeIds.value.clear();
};

const toggleNodeSelection = (nodeId: string) => {
  if (selectedNodeIds.value.has(nodeId)) {
    selectedNodeIds.value.delete(nodeId);
  } else {
    selectedNodeIds.value.add(nodeId);
  }
};

const isAllSelected = computed(() => {
  if (paginatedNodes.value.length === 0) return false;
  return paginatedNodes.value.every((node: ManualNodeItem) => selectedNodeIds.value.has(node.id));
});

const selectedCount = computed(() => selectedNodeIds.value.size);

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    paginatedNodes.value.forEach((node: ManualNodeItem) => selectedNodeIds.value.delete(node.id));
  } else {
    paginatedNodes.value.forEach((node: ManualNodeItem) => selectedNodeIds.value.add(node.id));
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
  set: (val: ManualNodeItem[]) => emit('reorder', val),
});

const handleDelete = (id: string) => emit('delete', id);
const handleEdit = (id: string) => emit('edit', id);
const detailNode = ref<ManualNodeItem | null>(null);
const showDetailModal = ref(false);
const handleDetail = (node: ManualNodeItem) => {
  detailNode.value = node;
  showDetailModal.value = true;
};
const handleAdd = () => emit('add');
const handleChangePage = (page: number) => handlePageChange(page);
const handleSearchTermUpdate = (value: string) => {
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
      :attr-filters="attrFilters"
      :attribute-options="attributeOptions"
      :filtered-nodes-count="filteredNodes.length"
      :is-inspecting-nodes="isInspectingNodes"
      :is-pinging-all="isPingingAll"
      :is-selection-mode="isSelectionMode"
      :is-sorting="isSorting"
      :manual-node-tags="tags"
      :manual-nodes-count="manualNodes.length"
      :ping-mode="pingMode"
      :search-term="localSearchTerm"
      @add="handleAdd"
      @clear-attr-filters="emit('clear-attr-filters')"
      @deduplicate="handleDeduplicate"
      @import="handleImport"
      @update:search-term="handleSearchTermUpdate"
      @set-tag-filters="emit('set-tag-filters', $event)"
      @toggle-country-filter="emit('toggle-country-filter', $event)"
      @toggle-network-filter="emit('toggle-network-filter', $event)"
      @toggle-protocol-filter="emit('toggle-protocol-filter', $event)"
      @auto-sort="handleAutoSort"
      @toggle-sort="handleToggleSort"
      @delete-all="handleDeleteAll"
      @toggle-selection-mode="toggleSelectionMode"
      @ping-all="emit('ping-all')"
      @inspect-all="emit('inspect-all')"
      @update:ping-mode="emit('update:pingMode', $event)"
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
      :attr-filters="attrFilters"
      :base-page="props.currentPage"
      :base-total-pages="props.totalPages"
      :compact-grid="compactGrid"
      :filtered-nodes="filteredNodes"
      :is-selection-mode="isSelectionMode"
      :is-sorting="isSorting"
      :items-per-page="itemsPerPage"
      :local-search-term="localSearchTerm"
      :manual-nodes="manualNodes"
      :node-inspect-map="nodeInspectMap"
      :paginated-nodes="paginatedNodes"
      :ping-results="pingResults"
      :pinging-nodes="pingingNodes"
      :search-page="currentSearchPage"
      :search-total-pages="totalSearchPages"
      :selected-node-ids="selectedNodeIds"
      :use-local-pagination="useLocalPagination"
      @clear-attr-filters="emit('clear-attr-filters')"
      @delete="handleDelete"
      @detail="handleDetail"
      @edit="handleEdit"
      @ping="emit('ping', $event)"
      @update:items-per-page="emit('update:itemsPerPage', $event)"
      @toggle-select="toggleNodeSelection"
      @sort-end="handleSortEnd"
      @change-page="handleChangePage"
      @toggle-tag-filter="emit('toggle-tag-filter', $event)"
      @toggle-protocol-filter="emit('toggle-protocol-filter', $event)"
      @toggle-country-filter="emit('toggle-country-filter', $event)"
      @toggle-network-filter="emit('toggle-network-filter', $event)"
      @clear-search="handleSearchTermUpdate('')"
      @toggle-sort="handleToggleSort"
    />

    <NodeDetailModal
      v-model:show="showDetailModal"
      :inspect-info="detailNode ? nodeInspectMap[detailNode.id] : undefined"
      :node="detailNode!"
    />
  </div>
</template>
