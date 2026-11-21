<script setup>
import { computed } from 'vue';
import { GripHorizontal, Search, X } from '@lucide/vue';
import draggable from 'vuedraggable';
import TagFilterBar from '@/components/shared/TagFilterBar.vue';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

const props = defineProps({
  nodes: {
    type: Array,
    default: () => [],
  },
  filteredNodes: {
    type: Array,
    default: () => [],
  },
  searchTerm: {
    type: String,
    default: '',
  },
  activeTagFilters: {
    type: Array,
    default: () => [],
  },
  tags: {
    type: Array,
    default: () => [],
  },
  selectedIds: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits([
  'update:searchTerm',
  'update:tagFilters',
  'update:selectedIds',
  'toggle-selection',
  'select-all',
  'deselect-all',
]);

const searchModel = computed({
  get: () => props.searchTerm,
  set: (val) => emit('update:searchTerm', val),
});

const orderedSelectedNodes = computed({
  get() {
    const nodeMap = new Map(props.nodes.map((n) => [n.id, n]));
    return props.selectedIds.map((id) => nodeMap.get(id)).filter(Boolean);
  },
  set(newList) {
    emit(
      'update:selectedIds',
      newList.map((n) => n.id),
    );
  },
});
</script>

<template>
  <div v-if="nodes.length > 0" class="space-y-2">
    <div class="flex justify-between items-center gap-2 h-6">
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
    <div class="flex items-center h-8">
      <TagFilterBar
        :active-filters="activeTagFilters"
        :tags="tags"
        always-show
        test-id-prefix="node-selector-tag"
        @update:active-filters="emit('update:tagFilters', $event)"
      />
    </div>

    <div class="relative">
      <input
        v-model="searchModel"
        :aria-label="t('manualNodes.searchPlaceholder')"
        :placeholder="t('manualNodes.searchPlaceholder')"
        class="w-full pl-9 pr-3 py-1.5 text-xs bg-inset border border-line rounded-md shadow-none text-fg placeholder:text-fg-subtle focus-visible:outline-hidden focus:border-line-strong"
        type="text"
      />
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
    </div>
    <div class="overflow-y-auto space-y-2 p-3 bg-inset rounded-md border border-line h-36 lg:h-64">
      <div v-for="node in filteredNodes" :key="node.id">
        <label class="flex items-center space-x-3 cursor-pointer">
          <input
            :checked="selectedIds.includes(node.id)"
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

    <div v-if="orderedSelectedNodes.length > 0" class="mt-3">
      <div class="flex justify-between items-center mb-1.5">
        <h5 class="text-xs font-medium text-fg-muted">
          {{ t('profileModal.selectedDrag', { count: orderedSelectedNodes.length }) }}
        </h5>
      </div>
      <draggable
        v-model="orderedSelectedNodes"
        class="space-y-1 p-2 bg-transparent rounded-md border border-line h-32 lg:h-48 overflow-y-auto"
        ghost-class="opacity-40"
        handle=".drag-handle"
        item-key="id"
      >
        <template #item="{ element, index }">
          <div class="flex items-center gap-2 px-2 py-1.5 bg-inset rounded-md border border-line shadow-none">
            <span class="drag-handle cursor-grab active:cursor-grabbing text-fg-subtle hover:text-fg-muted">
              <GripHorizontal class="w-4 h-4" />
            </span>
            <span class="font-mono text-xs font-medium text-fg-muted w-5">{{ index + 1 }}</span>
            <span :title="element.name" class="text-xs text-fg truncate flex-1">
              {{ element.name || t('manualNodes.unnamed') }}
            </span>
            <button
              :aria-label="t('profileModal.remove')"
              :title="t('profileModal.remove')"
              class="text-fg-subtle hover:text-red-400 transition-colors"
              type="button"
              @click="emit('toggle-selection', element.id)"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </template>
      </draggable>
    </div>
  </div>
  <div
    v-else
    class="text-center text-xs text-fg-subtle p-4 bg-transparent border border-line rounded-md flex items-center justify-center h-full"
  >
    {{ t('profileModal.noAvailableNodes') }}
  </div>
</template>
