<script setup>
import { computed } from 'vue';
import { Loader2, Search, X } from '@lucide/vue';
import MoreActionsMenu from '@/components/shared/MoreActionsMenu.vue';
import TagFilterBar from '@/components/shared/TagFilterBar.vue';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

const props = defineProps({
  manualNodesCount: {
    type: Number,
    default: 0,
  },
  filteredNodesCount: {
    type: Number,
    default: 0,
  },
  searchTerm: {
    type: String,
    default: '',
  },
  activeTagFilters: {
    type: Array,
    default: () => [],
  },
  manualNodeTags: {
    type: Array,
    default: () => [],
  },
  isSorting: {
    type: Boolean,
    default: false,
  },
  isSelectionMode: {
    type: Boolean,
    default: false,
  },
  isPingingAll: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'update:searchTerm',
  'set-tag-filters',
  'add',
  'import',
  'auto-sort',
  'deduplicate',
  'toggle-sort',
  'delete-all',
  'toggle-selection-mode',
  'ping-all',
  'sort-by-latency',
  'manage-tags',
]);

const searchModel = computed({
  get: () => props.searchTerm,
  set: (val) => emit('update:searchTerm', val),
});
</script>

<template>
  <div class="mb-4 min-w-0 rounded-md border border-line bg-surface p-4 shadow-none">
    <div class="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 flex-wrap items-center gap-3">
          <h2 class="text-lg font-semibold text-fg">
            {{ t('manualNodes.title') }}
          </h2>
          <span
            class="rounded-md border border-line bg-transparent px-2 py-0.5 text-xs font-mono font-medium text-fg-muted"
            >{{ manualNodesCount }}</span
          >
        </div>
        <p class="mt-1 text-xs text-fg-muted">
          {{ t('manualNodes.subtitle') }}
        </p>

        <!-- Mobile Tag Filter -->
        <div
          v-if="manualNodeTags.length > 0 || activeTagFilters.length > 0"
          class="mt-2 flex w-full min-w-0 items-center gap-1.5 overflow-x-auto py-1 no-scrollbar md:hidden"
          data-testid="manual-node-mobile-tags"
        >
          <TagFilterBar
            :active-filters="activeTagFilters"
            :tags="manualNodeTags"
            test-id-prefix="manual-node-mobile-tag"
            @update:active-filters="emit('set-tag-filters', $event)"
          />
        </div>
      </div>
      <div
        class="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap lg:shrink-0"
        data-testid="manual-node-toolbar-actions"
      >
        <button
          :disabled="isPingingAll"
          class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          type="button"
          @click="emit('ping-all')"
        >
          <Loader2 v-if="isPingingAll" aria-hidden="true" class="h-3 w-3 animate-spin text-emerald-500" />
          <span v-else class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          {{ t('actions.pingAll') }}
        </button>
        <button
          class="shrink-0 rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:opacity-90 border border-accent"
          @click="emit('add')"
        >
          {{ t('actions.add') }}
        </button>
        <MoreActionsMenu menu-width-class="w-36">
          <template #menu="{ close }">
            <button
              :class="isSelectionMode ? 'text-fg font-semibold' : ''"
              class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg font-medium transition-colors"
              @click="
                emit('toggle-selection-mode');
                close();
              "
            >
              {{ isSelectionMode ? t('actions.exitBatch') : t('actions.bulkActions') }}
            </button>
            <div class="my-1 border-t border-line"></div>
            <button
              class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
              @click="
                emit('import');
                close();
              "
            >
              {{ t('actions.importSubscription') }}
            </button>
            <button
              v-if="manualNodeTags.length > 0"
              class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
              data-testid="manage-manual-node-tags"
              @click="
                emit('manage-tags');
                close();
              "
            >
              {{ t('actions.manageTags') }}
            </button>
            <button
              class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
              @click="
                emit('auto-sort');
                close();
              "
            >
              {{ t('actions.autoSort') }}
            </button>
            <button
              class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
              @click="
                emit('sort-by-latency');
                close();
              "
            >
              {{ t('actions.sortByLatency') }}
            </button>
            <button
              class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
              @click="
                emit('deduplicate');
                close();
              "
            >
              {{ t('actions.deduplicate') }}
            </button>
            <button
              class="w-full text-left px-3 py-2 rounded text-xs transition-colors text-fg-muted hover:bg-hover hover:text-fg"
              @click="
                emit('toggle-sort');
                close();
              "
            >
              {{ isSorting ? t('actions.finishSort') : t('actions.manualSort') }}
            </button>
            <div class="my-1 border-t border-line"></div>
            <button
              class="w-full text-left px-3 py-2 rounded text-xs text-red-400 hover:bg-red-500/15 hover:text-red-400 transition-colors"
              @click="
                emit('delete-all');
                close();
              "
            >
              {{ t('actions.clearAll') }}
            </button>
          </template>
        </MoreActionsMenu>
      </div>
    </div>

    <div class="relative mt-4" data-testid="manual-node-search">
      <Search
        aria-hidden="true"
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
      />
      <input
        v-model="searchModel"
        :aria-label="t('manualNodes.searchLabel')"
        :disabled="isSorting"
        :placeholder="t('manualNodes.searchPlaceholder')"
        class="w-full rounded-md border border-line bg-transparent py-2 pl-9 pr-24 text-xs text-fg outline-none transition focus:border-line-strong disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-fg-subtle"
        type="text"
      />
      <div v-if="searchTerm" class="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        <span class="pointer-events-none text-xs font-mono text-fg-muted">
          {{ filteredNodesCount }}/{{ manualNodesCount }}
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

    <!-- Desktop Tag Filter Chips -->
    <div
      v-if="manualNodeTags.length > 0 || activeTagFilters.length > 0"
      class="hidden md:flex items-center gap-1.5 mt-3"
    >
      <TagFilterBar
        :active-filters="activeTagFilters"
        :tags="manualNodeTags"
        test-id-prefix="manual-node-tag"
        @update:active-filters="emit('set-tag-filters', $event)"
      />
    </div>
  </div>
</template>
