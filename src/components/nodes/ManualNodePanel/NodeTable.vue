<script setup>
import { computed, nextTick, ref } from 'vue';
import draggable from 'vuedraggable';
import ManualNodeCard from '@/components/nodes/ManualNodeCard.vue';
import PanelPagination from '@/components/shared/PanelPagination.vue';
import SortingBanner from '@/components/shared/SortingBanner.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { useI18n } from '@/i18n/index.js';
import { hasDragOrderChanged } from '@/composables/useSortingMode.js';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/pagination.js';
import { scrollToPaginationStart } from '@/utils/scroll.js';

const { t } = useI18n();

const props = defineProps({
  manualNodes: { type: Array, default: () => [] },
  paginatedNodes: { type: Array, default: () => [] },
  filteredNodes: { type: Array, default: () => [] },
  localSearchTerm: { type: String, default: '' },
  isSorting: { type: Boolean, default: false },
  isSelectionMode: { type: Boolean, default: false },
  selectedNodeIds: { type: Object, required: true },
  searchPage: { type: Number, default: 1 },
  searchTotalPages: { type: Number, default: 1 },
  basePage: { type: Number, default: 1 },
  baseTotalPages: { type: Number, default: 1 },
  draggableManualNodes: { type: Array, default: () => [] },
  itemsPerPage: { type: Number, default: DEFAULT_LIST_PAGE_SIZE },
  pingResults: { type: Object, default: () => ({}) },
  pingingNodes: { type: Object, default: () => new Set() },
  nodeInspectMap: { type: Object, default: () => ({}) },
  attrFilters: { type: Object, default: () => ({ protocol: '', country: '', network: '' }) },
  useLocalPagination: { type: Boolean, default: false },
  compactGrid: { type: Boolean, default: false },
});

const emit = defineEmits([
  'update:draggableManualNodes',
  'toggle-select',
  'edit',
  'detail',
  'delete',
  'sort-end',
  'change-page',
  'update:itemsPerPage',
  'toggle-tag-filter',
  'toggle-protocol-filter',
  'toggle-country-filter',
  'toggle-network-filter',
  'clear-attr-filters',
  'ping',
  'clear-search',
  'toggle-sort',
]);

const draggableModel = computed({
  get: () => props.draggableManualNodes,
  set: (val) => emit('update:draggableManualNodes', val),
});

const listStartRef = ref(null);

const hasActiveAttrFilters = computed(() =>
  Boolean(props.attrFilters?.protocol || props.attrFilters?.country || props.attrFilters?.network),
);

const displayPage = computed(() => (props.localSearchTerm || props.useLocalPagination ? props.searchPage : props.basePage));
const displayTotalPages = computed(() =>
  props.localSearchTerm || props.useLocalPagination ? props.searchTotalPages : props.baseTotalPages,
);

const handleChangePage = (page) => {
  let p = parseInt(page, 10);
  if (isNaN(p)) return;
  if (p < 1) p = 1;
  if (p > displayTotalPages.value) p = displayTotalPages.value;
  if (p === displayPage.value) return;
  emit('change-page', p);
  nextTick(() => {
    scrollToPaginationStart(listStartRef.value);
  });
};

const handleDragEnd = (evt) => {
  if (hasDragOrderChanged(evt)) {
    emit('sort-end');
  }
};
</script>

<template>
  <div v-if="manualNodes.length > 0" ref="listStartRef" :class="{ 'pb-48': isSelectionMode }">
    <div
      v-if="(localSearchTerm || hasActiveAttrFilters) && filteredNodes.length === 0"
      class="rounded-md border border-line bg-surface px-6 py-12 text-center"
      data-testid="manual-node-no-search-results"
    >
      <p class="text-sm font-medium text-fg">
        {{
          localSearchTerm
            ? t('manualNodes.noSearchResult', { keyword: localSearchTerm })
            : t('manualNodes.noFilterResult')
        }}
      </p>
      <button
        class="mt-3 inline-flex items-center justify-center rounded-md border border-line-strong bg-elevated-card px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-line-strong hover:bg-hover hover:text-fg cursor-pointer"
        data-testid="clear-manual-node-search"
        type="button"
        @click="
          emit('clear-search');
          emit('clear-attr-filters');
        "
      >
        {{ localSearchTerm ? t('actions.clearSearch') : t('manualNodes.clearAttrFilters') }}
      </button>
    </div>

    <div v-if="isSorting">
      <SortingBanner
        :hint="t('manualNodes.sortingHint')"
        banner-test-id="node-sorting-banner"
        button-test-id="node-finish-sort"
        @finish="emit('toggle-sort')"
      />
      <draggable
        v-model="draggableModel"
        :class="
          compactGrid
            ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-2'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3'
        "
        animation="300"
        class="grid gap-4"
        ghost-class="opacity-50"
        item-key="id"
        tag="div"
        @end="handleDragEnd"
      >
        <template #item="{ element: node }">
          <div class="cursor-move rounded-md border border-dashed border-sky-500/40 p-0.5">
            <ManualNodeCard
              :inspect-info="nodeInspectMap[node.id]"
              :is-pinging="pingingNodes.has(node.id)"
              :is-selected="selectedNodeIds.has(node.id)"
              :is-selection-mode="isSelectionMode"
              :node="node"
              :ping-result="pingResults[node.id]"
              class="pointer-events-none select-none"
              @delete="emit('delete', node.id)"
              @edit="emit('edit', node.id)"
              @ping="emit('ping', node.id)"
              @toggle-select="emit('toggle-select', node.id)"
              @filter-tag="emit('toggle-tag-filter', $event)"
            />
          </div>
        </template>
      </draggable>
    </div>

    <div
      v-else
      :class="
        compactGrid
          ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-2'
          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3'
      "
      class="grid gap-4"
    >
      <div
        v-for="(node, index) in paginatedNodes"
        :key="node.id"
        :style="{ '--delay-index': Math.min(index, 20) }"
        class="list-item-animation"
      >
        <ManualNodeCard
          :inspect-info="nodeInspectMap[node.id]"
          :is-pinging="pingingNodes.has(node.id)"
          :is-selected="selectedNodeIds.has(node.id)"
          :is-selection-mode="isSelectionMode"
          :node="node"
          :ping-result="pingResults[node.id]"
          @delete="emit('delete', node.id)"
          @detail="emit('detail', node)"
          @edit="emit('edit', node.id)"
          @ping="emit('ping', node.id)"
          @toggle-select="emit('toggle-select', node.id)"
          @filter-tag="emit('toggle-tag-filter', $event)"
          @filter-protocol="emit('toggle-protocol-filter', $event)"
          @filter-country="emit('toggle-country-filter', $event)"
          @filter-network="emit('toggle-network-filter', $event)"
        />
      </div>
    </div>

    <PanelPagination
      v-if="!isSorting && filteredNodes.length > 0"
      :current-page="displayPage"
      :items-per-page="itemsPerPage"
      :show-items-per-page="true"
      :show-total-items="true"
      :total-items="filteredNodes.length"
      :total-pages="displayTotalPages"
      variant="panel"
      @change-page="handleChangePage"
      @update:items-per-page="emit('update:itemsPerPage', $event)"
    />
  </div>
  <div v-else class="rounded-md border border-line bg-surface py-2">
    <EmptyState
      :description="t('manualNodes.emptyDesc')"
      :title="t('manualNodes.empty')"
      :total-count="0"
      icon="node"
    />
  </div>
</template>

<style scoped>
.cursor-move {
  cursor: move;
}
</style>
