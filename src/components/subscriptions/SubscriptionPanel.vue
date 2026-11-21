<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { Plus, Search, Upload, X } from '@lucide/vue';
import draggable from 'vuedraggable';
import Card from '@/components/subscriptions/Card.vue';
import BulkOperations from '@/components/nodes/ManualNodePanel/BulkOperations.vue';
import MoreActionsMenu from '@/components/shared/MoreActionsMenu.vue';
import PanelPagination from '@/components/shared/PanelPagination.vue';
import SortingBanner from '@/components/shared/SortingBanner.vue';
import TagFilterBar from '@/components/shared/TagFilterBar.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { DEFAULT_LIST_PAGE_SIZE, normalizeListPageSize } from '@/constants/pagination.js';
import { useI18n } from '@/i18n/index.js';
import { hasDragOrderChanged } from '@/composables/useSortingMode.js';
import { scrollToPaginationStart } from '@/utils/scroll.js';
import {
  collectTags,
  getItemTags,
  matchesTagFilter,
  normalizeActiveTagFilters,
  toggleTagFilterValue,
} from '@/utils/tags.js';

const { t } = useI18n();

const props = defineProps({
  subscriptions: { type: Array, default: () => [] },
  tags: { type: Array, default: undefined },
  activeTagFilters: { type: Array, default: undefined },
  currentPage: { type: Number, default: undefined },
  itemsPerPage: { type: Number, default: undefined },
  isSorting: Boolean,
  searchable: { type: Boolean, default: false },
  searchQuery: { type: String, default: '' },
  filteredCount: { type: Number, default: undefined },
  isRefreshing: { type: Boolean, default: false },
  refreshError: { type: Boolean, default: false },
  lastRefreshAt: { type: [String, Number, Date], default: null },
  statusFilter: { type: String, default: '' },
  statusFilterLabel: { type: String, default: '' },
});

const emit = defineEmits([
  'add',
  'delete',
  'updateNodeCount',
  'edit',
  'toggleSort',
  'markDirty',
  'preview',
  'deleteAll',
  'refreshAll',
  'reorder',
  'import',
  'qrcode',
  'updateSearch',
  'applyDetectedName',
  'clearStatusFilter',
  'set-tag-filters',
  'manage-tags',
  'open-batch-tag-modal',
  'batch-delete-subscriptions',
  'changePage',
  'update:itemsPerPage',
]);

const isSelectionMode = ref(false);
const selectedSubscriptionIds = ref(new Set());

const toggleSelectionMode = () => {
  isSelectionMode.value = !isSelectionMode.value;
  selectedSubscriptionIds.value.clear();
};

const toggleSubscriptionSelection = (subId) => {
  if (selectedSubscriptionIds.value.has(subId)) {
    selectedSubscriptionIds.value.delete(subId);
  } else {
    selectedSubscriptionIds.value.add(subId);
  }
};

const selectedCount = computed(() => selectedSubscriptionIds.value.size);

const handleBatchTag = () => {
  if (selectedSubscriptionIds.value.size === 0) return;
  emit('open-batch-tag-modal', Array.from(selectedSubscriptionIds.value));
};

const handleBatchDelete = () => {
  if (selectedSubscriptionIds.value.size === 0) return;
  emit('batch-delete-subscriptions', Array.from(selectedSubscriptionIds.value));
  selectedSubscriptionIds.value.clear();
  isSelectionMode.value = false;
};

const searchModel = computed({
  get: () => props.searchQuery,
  set: (value) => emit('updateSearch', value),
});

const localTagFilters = ref([]);
const currentTagFilters = computed(() =>
  props.activeTagFilters !== undefined ? normalizeActiveTagFilters(props.activeTagFilters) : localTagFilters.value,
);

const setTagFilters = (filters) => {
  const next = normalizeActiveTagFilters(filters);
  localTagFilters.value = next;
  emit('set-tag-filters', next);
};

const toggleTag = (tag) => {
  const next = toggleTagFilterValue(currentTagFilters.value, tag);
  setTagFilters(next);
};

const availableTags = computed(() => (Array.isArray(props.tags) ? props.tags : collectTags(props.subscriptions)));

const matchedSubscriptions = computed(() => {
  let list = (props.subscriptions || []).filter((sub) => matchesTagFilter(sub, currentTagFilters.value));

  const query = String(props.searchQuery || '')
    .trim()
    .toLowerCase();
  if (!query) return list;

  return list.filter((sub) =>
    [
      sub.name,
      sub.description,
      sub.remark,
      sub.note,
      sub.notes,
      sub.website,
      sub.url,
      sub.customId,
      ...getItemTags(sub),
    ].some((value) =>
      String(value || '')
        .toLowerCase()
        .includes(query),
    ),
  );
});

const visibleCount = computed(() => {
  if (props.filteredCount !== undefined && currentTagFilters.value.length === 0) {
    return props.filteredCount;
  }
  return matchedSubscriptions.value.length;
});

const refreshTime = computed(() => {
  if (!props.lastRefreshAt) return '';
  const date = new Date(props.lastRefreshAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
});

const draggableSubscriptions = computed({
  get: () => [...matchedSubscriptions.value],
  set: (val) => emit('reorder', val),
});

const handleDelete = (id) => emit('delete', id);
const handleEdit = (id) => emit('edit', id);
const handleUpdate = (id) => emit('updateNodeCount', id);
const handlePreview = (id) => emit('preview', id);
const handleQRCode = (id) => emit('qrcode', id);
const handleAdd = () => emit('add');
const handleToggleSort = () => emit('toggleSort');
const handleSortEnd = () => emit('markDirty');
const handleDragEnd = (evt) => {
  if (hasDragOrderChanged(evt)) {
    handleSortEnd();
  }
};
const handleDeleteAll = () => emit('deleteAll');
const handleRefreshAll = () => emit('refreshAll');
const handleImport = () => emit('import');
const handleApplyDetectedName = (subscription, name) => {
  emit('applyDetectedName', subscription?.id, name);
};

const refreshingCount = computed(() => props.subscriptions.filter((sub) => sub.isUpdating).length);

const listStartRef = ref(null);
const localCurrentPage = ref(1);
const localItemsPerPage = ref(DEFAULT_LIST_PAGE_SIZE);

const effectiveItemsPerPage = computed(() =>
  props.itemsPerPage !== undefined
    ? normalizeListPageSize(props.itemsPerPage, DEFAULT_LIST_PAGE_SIZE)
    : localItemsPerPage.value,
);

const totalPages = computed(() => {
  if (effectiveItemsPerPage.value === -1) return 1;
  const total = Math.ceil(matchedSubscriptions.value.length / effectiveItemsPerPage.value);
  return total > 0 ? total : 1;
});

watch(
  () => props.currentPage,
  (nextPage) => {
    if (nextPage === undefined) return;
    const parsed = parseInt(nextPage, 10);
    if (!Number.isNaN(parsed)) {
      localCurrentPage.value = Math.min(Math.max(parsed, 1), totalPages.value);
    }
  },
  { immediate: true },
);

const effectiveCurrentPage = computed(() => Math.min(Math.max(localCurrentPage.value, 1), totalPages.value));

const visibleSubscriptions = computed(() => {
  if (effectiveItemsPerPage.value === -1) return matchedSubscriptions.value;
  const start = (effectiveCurrentPage.value - 1) * effectiveItemsPerPage.value;
  const end = start + effectiveItemsPerPage.value;
  return matchedSubscriptions.value.slice(start, end);
});

const isAllSelected = computed(() => {
  if (visibleSubscriptions.value.length === 0) return false;
  return visibleSubscriptions.value.every((sub) => selectedSubscriptionIds.value.has(sub.id));
});

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    visibleSubscriptions.value.forEach((sub) => selectedSubscriptionIds.value.delete(sub.id));
  } else {
    visibleSubscriptions.value.forEach((sub) => selectedSubscriptionIds.value.add(sub.id));
  }
};

const handleChangePage = (page) => {
  const parsed = parseInt(page, 10);
  if (Number.isNaN(parsed)) return;
  const clamped = Math.min(Math.max(parsed, 1), totalPages.value);
  if (clamped === effectiveCurrentPage.value) return;
  localCurrentPage.value = clamped;
  emit('changePage', clamped);
  nextTick(() => {
    scrollToPaginationStart(listStartRef.value);
  });
};

const handleItemsPerPageChange = (value) => {
  const normalized = normalizeListPageSize(value, DEFAULT_LIST_PAGE_SIZE);
  localItemsPerPage.value = normalized;
  localCurrentPage.value = 1;
  emit('update:itemsPerPage', normalized);
  emit('changePage', 1);
};

watch([() => props.searchQuery, () => props.statusFilter, currentTagFilters, effectiveItemsPerPage], () => {
  localCurrentPage.value = 1;
});

watch(totalPages, (nextTotal) => {
  if (localCurrentPage.value > nextTotal) {
    localCurrentPage.value = nextTotal;
  }
});
</script>

<template>
  <div>
    <div class="mb-4 min-w-0 rounded-md border border-line bg-surface p-4 shadow-none">
      <div class="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="min-w-0">
          <div class="flex min-w-0 flex-wrap items-center gap-3 shrink-0">
            <h2 class="text-lg font-semibold text-fg">
              {{ t('subscriptions.title') }}
            </h2>
            <span
              class="rounded-md border border-line bg-transparent px-2 py-0.5 text-xs font-mono font-medium text-fg-muted"
              >{{ visibleCount }}/{{ subscriptions.length }}</span
            >
            <span
              v-if="isRefreshing || refreshError || refreshTime"
              :class="
                refreshError
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                  : isRefreshing
                    ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                    : 'border-line bg-elevated-card text-fg-muted'
              "
              aria-live="polite"
              class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-mono whitespace-nowrap"
              data-testid="subscriptions-refresh-status"
            >
              <span
                v-if="isRefreshing"
                aria-hidden="true"
                class="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse"
              ></span>
              <span v-if="isRefreshing">{{ t('subscriptions.refreshing', { count: refreshingCount }) }}</span>
              <span v-else-if="refreshError">{{ t('subscriptions.refreshFailedShort') }}</span>
              <span v-else-if="refreshTime">{{ t('subscriptions.lastRefreshed', { time: refreshTime }) }}</span>
            </span>
          </div>
          <p class="mt-1 text-xs text-fg-muted">
            {{ t('subscriptions.subtitle') }}
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2 sm:w-auto justify-end sm:justify-start">
          <button
            class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg shadow-none"
            @click="handleImport"
          >
            <Upload class="h-3.5 w-3.5 shrink-0" stroke-width="1.5" />
            {{ t('actions.bulkImport') }}
          </button>
          <button
            class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line-strong bg-active px-3.5 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-hover shadow-none"
            @click="handleAdd"
          >
            <Plus class="h-3.5 w-3.5 shrink-0" stroke-width="2" />
            {{ t('actions.add') }}
          </button>
          <MoreActionsMenu menu-width-class="w-36">
            <template #menu="{ close }">
              <button
                :class="isSelectionMode ? 'text-fg font-semibold' : ''"
                class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg font-medium transition-colors"
                data-testid="subscription-bulk-actions-toggle"
                type="button"
                @click="
                  toggleSelectionMode();
                  close?.();
                "
              >
                {{ isSelectionMode ? t('actions.exitBatch') : t('actions.bulkActions') }}
              </button>
              <div class="my-1 border-t border-line"></div>
              <button
                :disabled="isRefreshing"
                class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                @click="
                  handleRefreshAll();
                  close?.();
                "
              >
                {{ t('actions.refreshAll') }}
              </button>
              <button
                class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                @click="
                  handleToggleSort();
                  close?.();
                "
              >
                {{ isSorting ? t('actions.finishSort') : t('actions.manualSort') }}
              </button>
              <button
                v-if="availableTags.length > 0"
                class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                data-testid="manage-subscription-tags"
                type="button"
                @click="
                  emit('manage-tags');
                  close?.();
                "
              >
                {{ t('actions.manageTags') }}
              </button>
              <div class="my-1 border-t border-line"></div>
              <button
                class="w-full text-left px-3 py-2 rounded text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                @click="
                  handleDeleteAll();
                  close?.();
                "
              >
                {{ t('actions.clearAll') }}
              </button>
            </template>
          </MoreActionsMenu>
        </div>
      </div>
      <div v-if="searchable" class="mt-4 relative">
        <Search
          aria-hidden="true"
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
        />
        <input
          v-model="searchModel"
          :aria-label="t('subscriptions.searchPlaceholder')"
          :disabled="isSorting"
          :placeholder="t('subscriptions.listSearchPlaceholder')"
          class="w-full rounded-md border border-line bg-transparent py-2 pl-9 pr-24 text-xs text-fg outline-none transition focus:border-line-strong disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-fg-subtle"
          data-testid="subscription-search"
          type="text"
        />
        <div v-if="searchQuery" class="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
          <span class="pointer-events-none text-xs font-mono text-fg-muted">
            {{ visibleCount }}/{{ subscriptions.length }}
          </span>
          <button
            :aria-label="t('actions.clearSearch')"
            class="rounded p-0.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg cursor-pointer"
            data-testid="clear-subscription-search"
            type="button"
            @click="searchModel = ''"
          >
            <X aria-hidden="true" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <!-- Tag Filter Bar (Multi-select Intersection) -->
      <div v-if="availableTags.length > 0 || currentTagFilters.length > 0" class="mt-3">
        <TagFilterBar
          :active-filters="currentTagFilters"
          :tags="availableTags"
          test-id-prefix="subscription-tag"
          @update:active-filters="setTagFilters"
        />
      </div>

      <div
        v-if="statusFilter"
        class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line-strong bg-zinc-900/70 px-3 py-2 text-xs text-fg"
        data-testid="subscription-status-filter-banner"
      >
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ statusFilterLabel }}</span>
          <span class="font-mono text-fg-muted">{{ visibleCount }}/{{ subscriptions.length }}</span>
        </div>
        <button
          class="rounded border border-line-strong px-2 py-0.5 text-xs text-fg transition-colors hover:border-line-strong hover:bg-hover hover:text-white cursor-pointer"
          data-testid="clear-subscription-status-filter"
          type="button"
          @click="emit('clearStatusFilter')"
        >
          {{ t('subscriptions.clearStatusFilter') }}
        </button>
      </div>
    </div>
    <BulkOperations
      :is-all-selected="isAllSelected"
      :is-selection-mode="isSelectionMode"
      :selected-count="selectedCount"
      @exit="
        () => {
          selectedSubscriptionIds.clear();
          isSelectionMode = false;
        }
      "
      @toggle-select-all="toggleSelectAll"
      @batch-tag="handleBatchTag"
      @batch-delete="handleBatchDelete"
    />
    <div v-if="matchedSubscriptions.length > 0 && isSorting">
      <SortingBanner
        :hint="t('subscriptions.sortingHint')"
        banner-test-id="subscription-sorting-banner"
        button-test-id="subscription-finish-sort"
        @finish="handleToggleSort"
      />
      <draggable
        v-model="draggableSubscriptions"
        :item-key="(item) => item.id"
        animation="300"
        class="grid grid-cols-1 md:grid-cols-2 gap-4"
        tag="div"
        @end="handleDragEnd"
      >
        <template #item="{ element: subscription }">
          <div class="cursor-move rounded-md border-2 border-dashed border-sky-500/40">
            <Card
              :misub="subscription"
              class="pointer-events-none select-none"
              @applyDetectedName="(name) => handleApplyDetectedName(subscription, name)"
              @change="handleSortEnd"
              @delete="handleDelete(subscription.id)"
              @edit="handleEdit(subscription.id)"
              @preview="handlePreview(subscription.id)"
              @qrcode="handleQRCode(subscription.id)"
              @update="handleUpdate(subscription.id)"
              @filter-tag="toggleTag"
            />
          </div>
        </template>
      </draggable>
    </div>
    <div v-else-if="matchedSubscriptions.length > 0" ref="listStartRef" :class="{ 'pb-48': isSelectionMode }" class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="(subscription, index) in visibleSubscriptions"
          :key="subscription.id"
          :style="{ '--delay-index': index }"
          class="list-item-animation"
        >
          <Card
            :is-selected="selectedSubscriptionIds.has(subscription.id)"
            :is-selection-mode="isSelectionMode"
            :misub="subscription"
            @applyDetectedName="(name) => handleApplyDetectedName(subscription, name)"
            @change="handleSortEnd"
            @delete="handleDelete(subscription.id)"
            @edit="handleEdit(subscription.id)"
            @preview="handlePreview(subscription.id)"
            @qrcode="handleQRCode(subscription.id)"
            @update="handleUpdate(subscription.id)"
            @toggle-select="toggleSubscriptionSelection(subscription.id)"
            @filter-tag="toggleTag"
          />
        </div>
      </div>
      <PanelPagination
        :current-page="effectiveCurrentPage"
        :items-per-page="effectiveItemsPerPage"
        :show-items-per-page="true"
        :show-total-items="true"
        :total-items="matchedSubscriptions.length"
        :total-pages="totalPages"
        variant="panel"
        @change-page="handleChangePage"
        @update:items-per-page="handleItemsPerPageChange"
      />
    </div>
    <div
      v-else-if="subscriptions.length > 0 && (searchQuery || currentTagFilters.length > 0) && visibleCount === 0"
      class="rounded-md border border-line bg-surface px-6 py-12 text-center"
      data-testid="subscription-no-search-results"
    >
      <p class="text-sm font-medium text-fg">
        {{ t('subscriptions.noSearchResults') }}
      </p>
      <div class="mt-3 flex items-center justify-center gap-2">
        <button
          v-if="searchQuery"
          class="inline-flex items-center justify-center rounded-md border border-line-strong bg-elevated-card px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-line-strong hover:bg-hover hover:text-white cursor-pointer"
          data-testid="clear-subscription-search"
          type="button"
          @click="searchModel = ''"
        >
          {{ t('actions.clearSearch') }}
        </button>
        <button
          v-if="currentTagFilters.length > 0"
          class="inline-flex items-center justify-center rounded-md border border-line-strong bg-elevated-card px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-line-strong hover:bg-hover hover:text-white cursor-pointer"
          data-testid="clear-subscription-tag-filter"
          type="button"
          @click="setTagFilters([])"
        >
          {{ t('tags.clearFilter') }}
        </button>
      </div>
    </div>
    <div v-else-if="subscriptions.length === 0" class="rounded-md border border-line bg-surface py-2">
      <EmptyState
        :description="t('subscriptions.emptyDesc')"
        :title="t('subscriptions.empty')"
        :total-count="0"
        icon="folder"
      />
    </div>
  </div>
</template>
