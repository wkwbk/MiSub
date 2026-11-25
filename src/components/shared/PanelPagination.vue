<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/vue';
import Select from '@/components/ui/Select.vue';
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from '@/constants/pagination.js';
import { useI18n } from '@/i18n/index.js';

const props = withDefaults(
  defineProps<{
    variant?: string;
    currentPage?: number;
    totalPages?: number;
    totalItems?: number;
    itemsPerPage?: number;
    itemsPerPageOptions?: number[];
    showItemsPerPage?: boolean;
    showTotalItems?: boolean;
    hideWhenSinglePage?: boolean;
  }>(),
  {
    variant: 'simple',
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: DEFAULT_LIST_PAGE_SIZE,
    itemsPerPageOptions: () => [...LIST_PAGE_SIZE_OPTIONS],
    showItemsPerPage: false,
    showTotalItems: false,
    hideWhenSinglePage: true,
  },
);

const emit = defineEmits<{
  'change-page': [page: number];
  'update:itemsPerPage': [itemsPerPage: number];
}>();

const { t } = useI18n();

const isPanelVariant = computed(() => props.variant === 'panel');

const minPositivePageSize = computed(() => {
  const positive = props.itemsPerPageOptions.filter((option) => Number.isFinite(option) && option > 0);
  return positive.length > 0 ? Math.min(...positive) : DEFAULT_LIST_PAGE_SIZE;
});

const shouldShow = computed(() => {
  if (!props.hideWhenSinglePage) return true;

  if (isPanelVariant.value) {
    return (
      props.totalPages > 1 ||
      (props.showItemsPerPage &&
        (props.itemsPerPage !== DEFAULT_LIST_PAGE_SIZE || props.totalItems > minPositivePageSize.value))
    );
  }

  return props.totalPages > 1;
});

const pageInput = ref<string | number>('');

watch(
  () => props.currentPage,
  (newValue) => {
    pageInput.value = newValue;
  },
  { immediate: true },
);

function emitPageChange(page: string | number) {
  const parsed = parseInt(String(page), 10);
  if (Number.isNaN(parsed)) return;

  const clamped = Math.min(Math.max(parsed, 1), Math.max(props.totalPages, 1));
  pageInput.value = clamped;
  if (clamped === props.currentPage) return;
  emit('change-page', clamped);
}

function jumpToPage() {
  emitPageChange(pageInput.value);
}

function handleItemsPerPageChange(value: string | number) {
  const parsed = parseInt(String(value), 10);
  if (!Number.isNaN(parsed)) {
    emit('update:itemsPerPage', parsed);
  }
}
</script>

<template>
  <div
    v-if="shouldShow && isPanelVariant"
    class="panel-pagination-shell mt-3 sm:mt-4 px-3 py-2 sm:px-4 sm:py-2.5 bg-surface rounded-md border border-line flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 transition-colors"
  >
    <div
      class="w-full sm:w-auto flex min-h-7 sm:min-h-8 shrink-0 items-center justify-between sm:justify-start gap-2.5 sm:gap-4 text-xs font-mono text-fg-muted whitespace-nowrap"
    >
      <span v-if="showTotalItems">{{ t('pagination.totalItems', { total: totalItems }) }}</span>
      <div v-if="showItemsPerPage" class="flex items-center gap-1.5 sm:gap-2">
        <span>{{ t('common.perPage') }}</span>
        <div class="w-18 sm:w-20">
          <Select
            :model-value="itemsPerPage"
            :options="
              itemsPerPageOptions.map((option) => ({
                value: option,
                label: option === -1 ? t('common.all') : String(option),
              }))
            "
            popover-min-width="96"
            size="sm"
            trigger-class="font-mono text-xs py-1"
            @update:model-value="handleItemsPerPageChange"
          />
        </div>
      </div>
      <slot name="panel-left" />
    </div>

    <div
      v-if="totalPages > 1"
      class="w-full sm:w-auto flex shrink-0 items-center justify-center sm:justify-end gap-1 sm:gap-1.5 pt-2 sm:pt-0 border-t border-line/60 sm:border-t-0"
    >
      <button
        :aria-label="t('common.firstPage')"
        :disabled="currentPage === 1"
        :title="t('common.firstPage')"
        class="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-fg-muted hover:text-fg border border-line hover:border-line-strong shadow-none"
        @click="emitPageChange(1)"
      >
        <ChevronsLeft class="w-3.5 h-3.5" />
      </button>
      <button
        :aria-label="t('common.prevPage')"
        :disabled="currentPage === 1"
        :title="t('common.prevPage')"
        class="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-fg-muted hover:text-fg border border-line hover:border-line-strong shadow-none"
        @click="emitPageChange(currentPage - 1)"
      >
        <ChevronLeft class="w-3.5 h-3.5" />
      </button>

      <div class="flex shrink-0 items-center gap-1 font-mono px-0.5 whitespace-nowrap">
        <input
          v-model="pageInput"
          :aria-label="t('common.pageNumber')"
          class="h-7 w-10 sm:h-8 sm:w-12 text-center text-xs font-mono border border-line rounded-md bg-inset text-fg focus:border-line-strong focus-visible:outline-none appearance-none remove-arrow"
          type="number"
          @blur="jumpToPage"
          @keydown.enter="jumpToPage"
        />
        <span class="text-xs text-fg-subtle whitespace-nowrap">/ {{ totalPages }}</span>
      </div>

      <button
        :aria-label="t('common.nextPage')"
        :disabled="currentPage === totalPages"
        :title="t('common.nextPage')"
        class="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-fg-muted hover:text-fg border border-line hover:border-line-strong shadow-none"
        @click="emitPageChange(currentPage + 1)"
      >
        <ChevronRight class="w-3.5 h-3.5" />
      </button>
      <button
        :aria-label="t('common.lastPage')"
        :disabled="currentPage === totalPages"
        :title="t('common.lastPage')"
        class="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-fg-muted hover:text-fg border border-line hover:border-line-strong shadow-none"
        @click="emitPageChange(totalPages)"
      >
        <ChevronsRight class="w-3.5 h-3.5" />
      </button>
    </div>
  </div>

  <div v-else-if="shouldShow" class="flex flex-wrap justify-center items-center gap-2 mt-6 text-xs font-mono">
    <button
      :disabled="currentPage === 1"
      class="h-8 px-3 rounded-md disabled:opacity-50 bg-transparent text-fg-muted hover:text-fg border border-line hover:border-line-strong hover:bg-hover"
      @click="emitPageChange(currentPage - 1)"
    >
      &laquo; {{ t('common.prevPage') }}
    </button>
    <span class="text-fg-muted bg-transparent border border-line px-3 py-1.5 rounded-md">{{
      t('common.pageOf', { current: currentPage, total: totalPages })
    }}</span>
    <button
      :disabled="currentPage === totalPages"
      class="h-8 px-3 rounded-md disabled:opacity-50 bg-transparent text-fg-muted hover:text-fg border border-line hover:border-line-strong hover:bg-hover"
      @click="emitPageChange(currentPage + 1)"
    >
      {{ t('common.nextPage') }} &raquo;
    </button>
  </div>
</template>

<style scoped>
.remove-arrow::-webkit-inner-spin-button,
.remove-arrow::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.remove-arrow {
  appearance: textfield;
}
</style>
