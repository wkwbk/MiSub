<script setup lang="ts">
import { Tag, Trash2 } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();
withDefaults(
  defineProps<{
    isSelectionMode?: boolean;
    isAllSelected?: boolean;
    selectedCount?: number;
  }>(),
  {
    isSelectionMode: false,
    isAllSelected: false,
    selectedCount: 0,
  },
);

const emit = defineEmits<{
  'toggle-select-all': [];
  'batch-tag': [];
  'batch-delete': [];
  exit: [];
}>();
</script>

<template>
  <Transition name="slide-fade-sm">
    <div
      v-if="isSelectionMode"
      class="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 w-[95%] sm:w-auto max-w-[calc(100vw-2rem)] bg-surface shadow-none rounded-md px-4 py-3 sm:px-5 sm:py-3 flex flex-col sm:flex-row items-center justify-between sm:justify-center gap-3 sm:gap-3.5 z-50 border border-line"
    >
      <div class="flex items-center justify-between w-full sm:w-auto gap-3 shrink-0">
        <button
          class="rounded px-1.5 py-0.5 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg underline underline-offset-2 whitespace-nowrap transition-colors"
          @click="emit('toggle-select-all')"
        >
          {{ isAllSelected ? t('actions.deselectAll') : t('actions.selectAllPage') }}
        </button>
        <span class="text-xs font-mono font-medium text-fg-muted whitespace-nowrap">{{
          t('manualNodes.selectedCount', { count: selectedCount })
        }}</span>
      </div>

      <div class="h-px w-full sm:w-px sm:h-4 bg-active flex-shrink-0 hidden sm:block"></div>

      <div class="grid grid-cols-2 sm:flex sm:items-center w-full sm:w-auto gap-3 sm:gap-2">
        <div
          class="col-span-2 sm:col-span-1 flex items-center justify-center w-full sm:w-auto gap-2 sm:gap-2.5 shrink-0"
        >
          <span class="text-xs text-fg-subtle hidden sm:inline whitespace-nowrap shrink-0">{{
            t('manualNodes.bulkActionsLabel')
          }}</span>
          <div class="flex items-center gap-3 sm:gap-2 w-full sm:w-auto">
            <button
              class="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-line-strong bg-active text-fg hover:bg-hover transition-colors whitespace-nowrap cursor-pointer"
              @click="emit('batch-tag')"
            >
              <Tag class="h-3.5 w-3.5 shrink-0" />
              {{ t('manualNodes.batchTag') }}
            </button>
          </div>
        </div>

        <div
          class="col-span-2 sm:col-span-1 flex items-center justify-center w-full sm:w-auto gap-3 sm:gap-2 shrink-0 sm:ml-1 sm:pl-2 sm:border-l border-line pt-1 sm:pt-0 border-t sm:border-t-0"
        >
          <button
            class="flex-1 sm:flex-none justify-center text-xs text-red-400 hover:text-red-300 font-medium whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 border border-line hover:border-red-900/60 hover:bg-red-950/40 bg-transparent rounded-md transition-colors cursor-pointer"
            @click="emit('batch-delete')"
          >
            <Trash2 class="h-3.5 w-3.5 shrink-0" />
            {{ t('actions.delete') }}
          </button>
          <button
            class="flex-1 sm:flex-none justify-center text-xs text-fg-muted hover:text-fg whitespace-nowrap px-3 py-1.5 border border-line hover:border-line-strong bg-transparent hover:bg-hover rounded-md transition-colors cursor-pointer"
            @click="emit('exit')"
          >
            {{ t('actions.exit') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-fade-sm-enter-active,
.slide-fade-sm-leave-active {
  transition: all 0.2s ease-out;
}
.slide-fade-sm-enter-from,
.slide-fade-sm-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}
</style>
