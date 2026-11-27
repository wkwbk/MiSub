<script setup lang="ts">
import { computed } from 'vue';
import type { ManualNodeItem } from '@misub/core/types.js';
import { Search } from '@lucide/vue';
import TagFilterBar from '@/components/shared/TagFilterBar.vue';
import SelectedOrderList from '@/components/modals/ProfileModal/SelectedOrderList.vue';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    nodes?: ManualNodeItem[];
    filteredNodes?: ManualNodeItem[];
    searchTerm?: string;
    activeTagFilters?: string[];
    tags?: string[];
    selectedIds?: string[];
    layout?: 'split' | 'stacked';
  }>(),
  {
    nodes: () => [],
    filteredNodes: () => [],
    searchTerm: '',
    activeTagFilters: () => [],
    tags: () => [],
    selectedIds: () => [],
    layout: 'stacked',
  },
);

const emit = defineEmits<{
  'update:searchTerm': [value: string];
  'update:tagFilters': [value: string[]];
  'update:selectedIds': [value: string[]];
  'toggle-selection': [id: string];
  'select-all': [];
  'deselect-all': [];
}>();

const searchModel = computed({
  get: () => props.searchTerm,
  set: (val: string) => emit('update:searchTerm', val),
});

const selectedIdSet = computed(() => new Set(props.selectedIds));

const orderedSelectedNodes = computed({
  get(): ManualNodeItem[] {
    const nodeMap = new Map(props.nodes.map((n) => [n.id, n]));
    return props.selectedIds.map((id) => nodeMap.get(id)).filter((n): n is ManualNodeItem => Boolean(n));
  },
  set(newList: ManualNodeItem[]) {
    emit(
      'update:selectedIds',
      newList.map((n) => n.id),
    );
  },
});
</script>

<template>
  <div
    v-if="nodes.length > 0"
    :class="layout === 'split' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 lg:h-[460px]' : 'space-y-2'"
  >
    <div :class="layout === 'split' ? 'flex flex-col space-y-2 min-h-0' : 'space-y-2'">
      <div class="flex justify-between items-center gap-2 h-6 shrink-0">
        <h4 class="text-xs font-semibold text-fg-muted truncate">
          {{ t('profileModal.selectNodes') }}
        </h4>
        <div class="space-x-2 shrink-0 whitespace-nowrap">
          <button
            class="text-xs text-fg-muted hover:text-fg hover:underline transition-colors"
            type="button"
            @click="emit('select-all')"
          >
            {{ t('profileModal.selectAll') }}
          </button>
          <button
            class="text-xs text-fg-muted hover:text-fg hover:underline transition-colors"
            type="button"
            @click="emit('deselect-all')"
          >
            {{ t('profileModal.deselectAll') }}
          </button>
        </div>
      </div>
      <div class="flex items-center h-8 shrink-0">
        <TagFilterBar
          :active-filters="activeTagFilters"
          :tags="tags"
          always-show
          test-id-prefix="node-selector-tag"
          @update:active-filters="emit('update:tagFilters', $event)"
        />
      </div>

      <div class="relative shrink-0">
        <input
          v-model="searchModel"
          :aria-label="t('manualNodes.searchPlaceholder')"
          :placeholder="t('manualNodes.searchPlaceholder')"
          class="w-full pl-9 pr-3 py-1.5 text-xs bg-inset border border-line rounded-md shadow-none text-fg placeholder:text-fg-subtle focus-visible:outline-hidden focus:border-line-strong"
          type="text"
        />
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
      </div>
      <div
        :class="
          layout === 'split'
            ? 'overflow-y-auto space-y-2 p-3 bg-inset rounded-md border border-line flex-1 min-h-0 h-56 lg:h-auto'
            : 'overflow-y-auto space-y-2 p-3 bg-inset rounded-md border border-line h-36 lg:h-64'
        "
      >
        <div v-for="node in filteredNodes" :key="node.id">
          <label class="flex items-center space-x-3 cursor-pointer">
            <input
              :checked="selectedIdSet.has(node.id)"
              class="h-4 w-4 rounded-sm border-line-strong bg-inset text-fg focus:ring-0"
              type="checkbox"
              @change="emit('toggle-selection', node.id)"
            />
            <span :title="node.name" class="text-xs text-fg truncate">{{ node.name || t('manualNodes.unnamed') }}</span>
          </label>
        </div>
        <div v-if="filteredNodes.length === 0" class="text-center text-fg-subtle text-xs py-4">
          {{ t('profileModal.noMatchedNodes') }}
        </div>
      </div>
    </div>

    <SelectedOrderList
      v-model="orderedSelectedNodes"
      :layout="layout"
      :unnamed-label="t('manualNodes.unnamed')"
      @remove="emit('toggle-selection', $event)"
    />
  </div>
  <div
    v-else
    class="text-center text-xs text-fg-subtle p-4 bg-transparent border border-line rounded-md flex items-center justify-center h-full"
  >
    {{ t('profileModal.noAvailableNodes') }}
  </div>
</template>
