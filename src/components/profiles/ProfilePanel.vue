<script setup>
import { computed, nextTick, ref } from 'vue';
import { Plus, Search, X } from '@lucide/vue';
import draggable from 'vuedraggable';
import ProfileCard from '@/components/profiles/ProfileCard.vue';
import BulkOperations from '@/components/nodes/ManualNodePanel/BulkOperations.vue';
import MoreActionsMenu from '@/components/shared/MoreActionsMenu.vue';
import PanelPagination from '@/components/shared/PanelPagination.vue';
import SortingBanner from '@/components/shared/SortingBanner.vue';
import TagFilterBar from '@/components/shared/TagFilterBar.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { DEFAULT_LIST_PAGE_SIZE } from '@/constants/pagination.js';
import { useI18n } from '@/i18n/index.js';
import { collectTags, normalizeActiveTagFilters, toggleTagFilterValue } from '@/utils/tags.js';
import { scrollToPaginationStart } from '@/utils/scroll.js';

const { t } = useI18n();

const props = defineProps({
  profiles: {
    type: Array,
    default: () => [],
  },
  paginatedProfiles: {
    type: Array,
    default: () => [],
  },
  tags: {
    type: Array,
    default: undefined,
  },
  activeTagFilters: {
    type: Array,
    default: undefined,
  },
  currentPage: Number,
  totalPages: Number,
  itemsPerPage: {
    type: Number,
    default: DEFAULT_LIST_PAGE_SIZE,
  },
  isSorting: {
    type: Boolean,
    default: false,
  },
  compact: {
    type: Boolean,
    default: false,
  },
  searchable: { type: Boolean, default: false },
  searchQuery: { type: String, default: '' },
  filteredCount: { type: Number, default: undefined },
});

const emit = defineEmits([
  'add',
  'edit',
  'delete',
  'deleteAll',
  'toggle',
  'openCopy',
  'preview',
  'reorder',
  'changePage',
  'viewLogs',
  'qrcode',
  'toggle-sort',
  'updateSearch',
  'set-tag-filters',
  'manage-tags',
  'open-batch-tag-modal',
  'batch-delete-profiles',
  'update:itemsPerPage',
]);

const isSelectionMode = ref(false);
const selectedProfileIds = ref(new Set());

const toggleSelectionMode = () => {
  isSelectionMode.value = !isSelectionMode.value;
  selectedProfileIds.value.clear();
};

const toggleProfileSelection = (profileId) => {
  if (selectedProfileIds.value.has(profileId)) {
    selectedProfileIds.value.delete(profileId);
  } else {
    selectedProfileIds.value.add(profileId);
  }
};

const selectedCount = computed(() => selectedProfileIds.value.size);

const handleBatchTag = () => {
  if (selectedProfileIds.value.size === 0) return;
  emit('open-batch-tag-modal', Array.from(selectedProfileIds.value));
};

const handleBatchDelete = () => {
  if (selectedProfileIds.value.size === 0) return;
  emit('batch-delete-profiles', Array.from(selectedProfileIds.value));
  selectedProfileIds.value.clear();
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

const availableTags = computed(() => (Array.isArray(props.tags) ? props.tags : collectTags(props.profiles)));

const setTagFilters = (filters) => {
  const next = normalizeActiveTagFilters(filters);
  localTagFilters.value = next;
  emit('set-tag-filters', next);
};

const toggleTag = (tag) => {
  setTagFilters(toggleTagFilterValue(currentTagFilters.value, tag));
};

const visibleCount = computed(() => props.filteredCount ?? props.profiles.length);

const displayProfiles = computed(() => {
  if (props.isSorting) {
    return props.profiles || [];
  }

  if (props.paginatedProfiles && props.paginatedProfiles.length > 0) {
    return props.paginatedProfiles;
  }

  if (props.totalPages !== undefined) {
    return props.paginatedProfiles || [];
  }
  return props.profiles || [];
});

const isAllSelected = computed(() => {
  if (displayProfiles.value.length === 0) return false;
  return displayProfiles.value.every((profile) => selectedProfileIds.value.has(profile.id));
});

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    displayProfiles.value.forEach((profile) => selectedProfileIds.value.delete(profile.id));
  } else {
    displayProfiles.value.forEach((profile) => selectedProfileIds.value.add(profile.id));
  }
};

const listStartRef = ref(null);

const handleEdit = (profileId) => emit('edit', profileId);
const handleDelete = (profileId) => emit('delete', profileId);
const handleToggle = (event) => emit('toggle', event);
const handleOpenCopy = (profileId) => emit('openCopy', profileId);
const handlePreview = (profileId) => emit('preview', profileId);
const handleAdd = () => emit('add');
const handleChangePage = (page) => {
  if (page === props.currentPage) return;
  emit('changePage', page);
  nextTick(() => {
    scrollToPaginationStart(listStartRef.value);
  });
};
const handleDeleteAll = () => emit('deleteAll');
const handleToggleSort = () => emit('toggle-sort');
const handleQRCode = (profileId) => emit('qrcode', profileId);

const draggableProfiles = computed({
  get: () => [...(props.profiles || [])],
  set: (val) => emit('reorder', val),
});
</script>

<template>
  <div>
    <div class="list-item-animation mb-4" style="--delay-index: 0">
      <div :class="[compact ? 'p-3' : 'p-4']" class="min-w-0 rounded-md border border-line bg-surface shadow-none">
        <div class="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div class="min-w-0">
            <div class="flex items-center gap-3 shrink-0">
              <h2 class="text-lg font-semibold text-fg">
                {{ t('profiles.title') }}
              </h2>
              <span
                class="rounded-md border border-line bg-transparent px-2 py-0.5 text-xs font-mono font-medium text-fg-muted"
                >{{ profiles.length }}</span
              >
            </div>
            <p class="mt-1 text-xs text-fg-muted">
              {{ t('profiles.subtitle') }}
            </p>
          </div>
          <div class="flex items-center gap-2 sm:w-auto justify-end sm:justify-start shrink-0">
            <button
              class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line-strong bg-active px-3.5 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-hover shadow-none"
              @click="handleAdd"
            >
              <Plus class="h-3.5 w-3.5 shrink-0" stroke-width="2" />
              {{ t('actions.add') }}
            </button>
            <MoreActionsMenu :teleport-to-body="true" menu-width-class="w-36">
              <template #menu="{ close }">
                <button
                  :class="isSelectionMode ? 'text-fg font-semibold' : ''"
                  class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg font-medium transition-colors"
                  data-testid="profile-bulk-actions-toggle"
                  type="button"
                  @click="
                    toggleSelectionMode();
                    close();
                  "
                >
                  {{ isSelectionMode ? t('actions.exitBatch') : t('actions.bulkActions') }}
                </button>
                <div class="my-1 border-t border-line"></div>
                <button
                  class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                  @click="
                    handleToggleSort();
                    close();
                  "
                >
                  {{ isSorting ? t('actions.finishSort') : t('actions.manualSort') }}
                </button>
                <button
                  v-if="availableTags.length > 0"
                  class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                  data-testid="manage-profile-tags"
                  type="button"
                  @click="
                    emit('manage-tags');
                    close();
                  "
                >
                  {{ t('actions.manageTags') }}
                </button>
                <div class="my-1 border-t border-line"></div>
                <button
                  class="w-full text-left px-3 py-2 rounded text-xs text-red-400 hover:bg-red-500/15 hover:text-red-400 transition-colors"
                  @click="
                    handleDeleteAll();
                    close();
                  "
                >
                  {{ t('actions.clearAll') }}
                </button>
              </template>
            </MoreActionsMenu>
          </div>
        </div>
        <div v-if="searchable" class="relative mt-4">
          <Search
            aria-hidden="true"
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
          />
          <input
            v-model="searchModel"
            :aria-label="t('profiles.searchPlaceholder')"
            :disabled="isSorting"
            :placeholder="t('profiles.listSearchPlaceholder')"
            class="w-full rounded-md border border-line bg-transparent py-2 pl-9 pr-24 text-xs text-fg outline-none transition focus:border-line-strong disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-fg-subtle"
            data-testid="profile-search"
            type="text"
          />
          <div v-if="searchQuery" class="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            <span class="pointer-events-none text-xs font-mono text-fg-muted">
              {{ visibleCount }}/{{ profiles.length }}
            </span>
            <button
              :aria-label="t('actions.clearSearch')"
              class="rounded p-0.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg cursor-pointer"
              type="button"
              @click="searchModel = ''"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <!-- Tag Filter Bar -->
        <div v-if="availableTags.length > 0 || currentTagFilters.length > 0" class="mt-3">
          <TagFilterBar
            :active-filters="currentTagFilters"
            :tags="availableTags"
            test-id-prefix="profile-tag"
            @update:active-filters="setTagFilters"
          />
        </div>
      </div>
    </div>
    <BulkOperations
      :is-all-selected="isAllSelected"
      :is-selection-mode="isSelectionMode"
      :selected-count="selectedCount"
      @exit="
        () => {
          selectedProfileIds.clear();
          isSelectionMode = false;
        }
      "
      @toggle-select-all="toggleSelectAll"
      @batch-tag="handleBatchTag"
      @batch-delete="handleBatchDelete"
    />
    <div v-if="profiles.length > 0" ref="listStartRef" :class="{ 'pb-48': isSelectionMode }">
      <SortingBanner
        v-if="isSorting"
        :hint="t('profiles.sortingHint')"
        banner-test-id="profile-sorting-banner"
        button-test-id="profile-finish-sort"
        @finish="handleToggleSort"
      />
      <div v-if="isSorting" :class="compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'" class="grid gap-4">
        <draggable
          v-model="draggableProfiles"
          animation="300"
          class="contents"
          ghost-class="opacity-50"
          item-key="id"
          tag="div"
        >
          <template #item="{ element: profile }">
            <div class="cursor-move rounded-md border border-dashed border-sky-500/40 p-0.5">
              <ProfileCard
                :compact="compact"
                :is-sorting="isSorting"
                :profile="profile"
                class="pointer-events-none select-none"
              />
            </div>
          </template>
        </draggable>
      </div>
      <div v-else :class="compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'" class="grid gap-4">
        <div
          v-for="(profile, index) in displayProfiles"
          :key="profile.id"
          :style="{ '--delay-index': index + 1 }"
          class="list-item-animation"
        >
          <ProfileCard
            :compact="compact"
            :is-selected="selectedProfileIds.has(profile.id)"
            :is-selection-mode="isSelectionMode"
            :is-sorting="isSorting"
            :profile="profile"
            @change="handleToggle($event)"
            @delete="handleDelete(profile.id)"
            @edit="handleEdit(profile.id)"
            @preview="handlePreview(profile.id)"
            @qrcode="handleQRCode(profile.id)"
            @toggle-select="toggleProfileSelection(profile.id)"
            @view-logs="emit('viewLogs', profile.id)"
            @open-copy="handleOpenCopy(profile.id)"
            @filter-tag="toggleTag"
          />
        </div>
      </div>
      <div
        v-if="!isSorting && displayProfiles.length === 0"
        class="rounded-md border border-line bg-surface px-6 py-12 text-center"
      >
        <p class="text-sm font-medium text-fg">
          {{ t('profiles.noSearchResults') }}
        </p>
        <div class="mt-3 flex items-center justify-center gap-2">
          <button
            v-if="searchQuery"
            class="inline-flex items-center justify-center rounded-md border border-line-strong bg-elevated-card px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-line-strong hover:bg-hover hover:text-white cursor-pointer"
            type="button"
            @click="searchModel = ''"
          >
            {{ t('actions.clearSearch') }}
          </button>
          <button
            v-if="currentTagFilters.length > 0"
            class="inline-flex items-center justify-center rounded-md border border-line-strong bg-elevated-card px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-line-strong hover:bg-hover hover:text-white cursor-pointer"
            type="button"
            @click="setTagFilters([])"
          >
            {{ t('tags.clearFilter') }}
          </button>
        </div>
      </div>
      <PanelPagination
        v-if="!isSorting && displayProfiles.length > 0"
        :compact="compact"
        :current-page="currentPage"
        :items-per-page="itemsPerPage"
        :show-items-per-page="true"
        :show-total-items="true"
        :total-items="visibleCount"
        :total-pages="totalPages"
        variant="panel"
        @change-page="handleChangePage"
        @update:items-per-page="emit('update:itemsPerPage', $event)"
      />
    </div>
    <div v-else class="rounded-md border border-line bg-surface py-2">
      <EmptyState :description="t('profiles.emptyDesc')" :title="t('profiles.empty')" :total-count="0" icon="folder" />
    </div>
  </div>
</template>
