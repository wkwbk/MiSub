<script setup lang="ts" generic="T extends { id: string; name?: string }">
import { computed, nextTick, ref } from 'vue';
import {
  ArrowDownAZ,
  ArrowDownToLine,
  ArrowUpDown,
  ArrowUpToLine,
  ArrowUpZA,
  GripHorizontal,
  X,
} from '@lucide/vue';
import draggable from 'vuedraggable';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    modelValue: T[];
    unnamedLabel: string;
    layout?: 'split' | 'stacked';
  }>(),
  {
    layout: 'stacked',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: T[]];
  remove: [id: string];
}>();

const listModel = computed({
  get: () => props.modelValue,
  set: (newList: T[]) => emit('update:modelValue', newList),
});

const editingId = ref<string | null>(null);
const editingValue = ref('');
const positionInputRef = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);

const moveItem = (fromIndex: number, toIndex: number) => {
  const total = props.modelValue.length;
  if (fromIndex < 0 || fromIndex >= total) return;
  const clampedTarget = Math.max(0, Math.min(total - 1, toIndex));
  if (fromIndex === clampedTarget) return;
  const next = [...props.modelValue];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clampedTarget, 0, moved);
  emit('update:modelValue', next);
};

const moveToTop = (index: number) => moveItem(index, 0);
const moveToBottom = (index: number) => moveItem(index, props.modelValue.length - 1);

const sortByName = (direction: 'asc' | 'desc') => {
  if (props.modelValue.length <= 1) return;
  const factor = direction === 'asc' ? 1 : -1;
  const next = [...props.modelValue].sort((a, b) => {
    const nameA = a.name || props.unnamedLabel;
    const nameB = b.name || props.unnamedLabel;
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' }) * factor;
  });
  emit('update:modelValue', next);
};

const reverseOrder = () => {
  if (props.modelValue.length <= 1) return;
  emit('update:modelValue', [...props.modelValue].reverse());
};

const startEditingPosition = async (item: T, index: number) => {
  if (props.modelValue.length <= 1) return;
  editingId.value = item.id;
  editingValue.value = String(index + 1);
  await nextTick();
  positionInputRef.value?.focus();
  positionInputRef.value?.select();
};

const commitEditingPosition = (fromIndex: number) => {
  if (editingId.value === null) return;
  const parsed = Number.parseInt(editingValue.value, 10);
  editingId.value = null;
  if (Number.isNaN(parsed)) return;
  moveItem(fromIndex, parsed - 1);
};

const cancelEditingPosition = () => {
  editingId.value = null;
};

const setPositionInputRef = (el: unknown) => {
  positionInputRef.value = el instanceof HTMLInputElement ? el : null;
};
</script>

<template>
  <div
    v-if="layout === 'split' || modelValue.length > 0"
    :class="layout === 'split' ? 'flex flex-col min-h-0 h-full' : 'mt-3'"
  >
    <div class="flex justify-between items-center gap-2 mb-1.5 min-h-6 shrink-0">
      <h5 class="text-xs font-medium text-fg-muted truncate">
        {{ t('profileModal.selectedDrag', { count: modelValue.length }) }}
      </h5>
      <div v-if="modelValue.length > 1" class="flex items-center gap-1 shrink-0">
        <button
          :aria-label="t('profileModal.sortNameAsc')"
          :title="t('profileModal.sortNameAsc')"
          class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-fg-muted hover:text-fg bg-inset border border-line hover:border-line-strong rounded transition-colors cursor-pointer"
          data-test="sort-asc"
          type="button"
          @click="sortByName('asc')"
        >
          <ArrowDownAZ class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">A-Z</span>
        </button>
        <button
          :aria-label="t('profileModal.sortNameDesc')"
          :title="t('profileModal.sortNameDesc')"
          class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-fg-muted hover:text-fg bg-inset border border-line hover:border-line-strong rounded transition-colors cursor-pointer"
          data-test="sort-desc"
          type="button"
          @click="sortByName('desc')"
        >
          <ArrowUpZA class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Z-A</span>
        </button>
        <button
          :aria-label="t('profileModal.reverseOrder')"
          :title="t('profileModal.reverseOrder')"
          class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-fg-muted hover:text-fg bg-inset border border-line hover:border-line-strong rounded transition-colors cursor-pointer"
          data-test="sort-reverse"
          type="button"
          @click="reverseOrder"
        >
          <ArrowUpDown class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <div
      v-if="modelValue.length === 0"
      class="flex-1 min-h-0 flex items-center justify-center p-4 bg-transparent rounded-md border border-dashed border-line text-xs text-fg-subtle"
    >
      {{ t('profileModal.noSelectedItems') }}
    </div>

    <draggable
      v-else
      v-model="listModel"
      :animation="modelValue.length > 30 ? 0 : 120"
      :class="[
        layout === 'split'
          ? 'space-y-1 p-2 bg-transparent rounded-md border border-line flex-1 min-h-0 overflow-y-auto h-56 lg:h-auto'
          : 'space-y-1 p-2 bg-transparent rounded-md border border-line h-32 lg:h-48 overflow-y-auto',
        isDragging ? 'is-dragging' : '',
      ]"
      :scroll="true"
      :scroll-sensitivity="60"
      :scroll-speed="12"
      ghost-class="opacity-40"
      handle=".drag-handle"
      item-key="id"
      @end="isDragging = false"
      @start="isDragging = true"
    >
      <template #item="{ element, index }">
        <div
          class="order-item group flex items-center gap-1.5 px-2 py-1.5 bg-inset rounded-md border border-line shadow-none hover:border-line-strong"
        >
          <span class="drag-handle cursor-grab active:cursor-grabbing text-fg-subtle hover:text-fg-muted shrink-0">
            <GripHorizontal class="w-4 h-4" />
          </span>

          <input
            v-if="editingId === element.id"
            :ref="setPositionInputRef"
            v-model="editingValue"
            :aria-label="t('profileModal.jumpToPosition')"
            :max="modelValue.length"
            class="w-11 px-1 py-0 text-center font-mono text-xs bg-surface border border-line-strong rounded text-fg focus-visible:outline-hidden shrink-0"
            data-test="position-input"
            min="1"
            type="number"
            @blur="commitEditingPosition(index)"
            @keydown.enter.prevent="commitEditingPosition(index)"
            @keydown.esc.prevent="cancelEditingPosition"
          />
          <button
            v-else
            :disabled="modelValue.length <= 1"
            :title="modelValue.length > 1 ? t('profileModal.clickToJumpPosition') : undefined"
            class="font-mono text-xs font-medium text-fg-muted min-w-[2rem] px-1 py-0.5 text-center rounded hover:bg-surface hover:text-fg transition-colors disabled:hover:bg-transparent disabled:hover:text-fg-muted cursor-pointer disabled:cursor-default shrink-0"
            data-test="position-badge"
            type="button"
            @click="startEditingPosition(element, index)"
          >
            {{ index + 1 }}
          </button>

          <span :title="element.name || unnamedLabel" class="text-xs text-fg truncate flex-1">
            {{ element.name || unnamedLabel }}
          </span>

          <div
            v-if="modelValue.length > 1"
            class="order-item-actions flex items-center gap-0.5 shrink-0 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100"
          >
            <button
              :aria-label="t('profileModal.moveToTop')"
              :disabled="index === 0"
              :title="t('profileModal.moveToTop')"
              class="p-0.5 text-fg-subtle hover:text-fg disabled:opacity-30 disabled:hover:text-fg-subtle transition-colors cursor-pointer disabled:cursor-default"
              data-test="move-top"
              type="button"
              @click="moveToTop(index)"
            >
              <ArrowUpToLine class="w-3.5 h-3.5" />
            </button>
            <button
              :aria-label="t('profileModal.moveToBottom')"
              :disabled="index === modelValue.length - 1"
              :title="t('profileModal.moveToBottom')"
              class="p-0.5 text-fg-subtle hover:text-fg disabled:opacity-30 disabled:hover:text-fg-subtle transition-colors cursor-pointer disabled:cursor-default"
              data-test="move-bottom"
              type="button"
              @click="moveToBottom(index)"
            >
              <ArrowDownToLine class="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            :aria-label="t('profileModal.remove')"
            :title="t('profileModal.remove')"
            class="p-0.5 text-fg-subtle hover:text-red-400 transition-colors cursor-pointer shrink-0"
            data-test="remove-selected"
            type="button"
            @click="emit('remove', element.id)"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </template>
    </draggable>
  </div>
</template>

<style scoped>
.order-item {
  content-visibility: auto;
  contain-intrinsic-size: auto 36px;
  contain: layout style;
}

.is-dragging .order-item {
  transition: none;
}

.is-dragging .order-item-actions {
  pointer-events: none;
  opacity: 0;
}
</style>
