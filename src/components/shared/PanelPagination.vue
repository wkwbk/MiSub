<script setup>
import { computed, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/vue';
import Select from '@/components/ui/Select.vue';
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from '@/constants/pagination.js';
import { useI18n } from '@/i18n/index.js';

const props = defineProps({
  variant: {
    type: String,
    default: 'simple',
  },
  currentPage: {
    type: Number,
    default: 1,
  },
  totalPages: {
    type: Number,
    default: 1,
  },
  totalItems: {
    type: Number,
    default: 0,
  },
  itemsPerPage: {
    type: Number,
    default: DEFAULT_LIST_PAGE_SIZE,
  },
  itemsPerPageOptions: {
    type: Array,
    default: () => [...LIST_PAGE_SIZE_OPTIONS],
  },
  showItemsPerPage: {
    type: Boolean,
    default: false,
  },
  showTotalItems: {
    type: Boolean,
    default: false,
  },
  hideWhenSinglePage: {
    type: Boolean,
    default: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['change-page', 'update:itemsPerPage']);

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

const pageInput = ref('');

watch(
  () => props.currentPage,
  (newValue) => {
    pageInput.value = newValue;
  },
  { immediate: true },
);

function emitPageChange(page) {
  const parsed = parseInt(page, 10);
  if (Number.isNaN(parsed)) return;

  const clamped = Math.min(Math.max(parsed, 1), Math.max(props.totalPages, 1));
  pageInput.value = clamped;
  if (clamped === props.currentPage) return;
  emit('change-page', clamped);
}

function jumpToPage() {
  emitPageChange(pageInput.value);
}

function handleItemsPerPageChange(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isNaN(parsed)) {
    emit('update:itemsPerPage', parsed);
  }
}
</script>

<template>
  <div
    v-if="shouldShow && isPanelVariant"
    :class="
      compact
        ? 'flex flex-col items-center justify-center gap-2.5'
        : 'flex flex-wrap items-center justify-between gap-2.5 sm:gap-3'
    "
    class="panel-pagination-shell mt-4 px-3 py-2.5 sm:px-4 sm:py-3 bg-surface rounded-md border border-line transition-colors"
  >
    <div class="flex min-h-8 shrink-0 items-center gap-3 sm:gap-4 text-xs font-mono text-fg-muted whitespace-nowrap">
      <span v-if="showTotalItems">{{ t('pagination.totalItems', { total: totalItems }) }}</span>
      <div v-if="showItemsPerPage" class="flex items-center gap-2">
        <span>{{ t('common.perPage') }}</span>
        <div class="w-20">
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
            trigger-class="font-mono"
            @update:model-value="handleItemsPerPageChange"
          />
        </div>
      </div>
      <slot name="panel-left" />
    </div>

    <div v-if="totalPages > 1" class="flex shrink-0 items-center gap-1.5">
      <button
        :aria-label="t('common.firstPage')"
        :disabled="currentPage === 1"
        :title="t('common.firstPage')"
        class="h-8 w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-fg-muted hover:text-fg border border-line hover:border-line-strong"
        @click="emitPageChange(1)"
      >
        <ChevronsLeft class="w-3.5 h-3.5" />
      </button>
      <button
        :aria-label="t('common.prevPage')"
        :disabled="currentPage === 1"
        :title="t('common.prevPage')"
        class="h-8 w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-fg-muted hover:text-fg border border-line hover:border-line-strong"
        @click="emitPageChange(currentPage - 1)"
      >
        <ChevronLeft class="w-3.5 h-3.5" />
      </button>

      <div class="flex shrink-0 items-center gap-1.5 font-mono px-0.5 whitespace-nowrap">
        <input
          v-model="pageInput"
          :aria-label="t('common.pageNumber')"
          class="h-8 w-12 text-center text-xs font-mono border border-line rounded-md bg-inset text-fg focus:border-line-strong focus-visible:outline-none appearance-none remove-arrow"
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
        class="h-8 w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-fg-muted hover:text-fg border border-line hover:border-line-strong"
        @click="emitPageChange(currentPage + 1)"
      >
        <ChevronRight class="w-3.5 h-3.5" />
      </button>
      <button
        :aria-label="t('common.lastPage')"
        :disabled="currentPage === totalPages"
        :title="t('common.lastPage')"
        class="h-8 w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-fg-muted hover:text-fg border border-line hover:border-line-strong"
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
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
