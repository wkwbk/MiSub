<script setup>
import { computed, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/vue';
import Select from '@/components/ui/Select.vue';
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
    default: 24,
  },
  itemsPerPageOptions: {
    type: Array,
    default: () => [24, 48, 96, -1],
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
});

const emit = defineEmits(['change-page', 'update:itemsPerPage']);

const { t } = useI18n();

const isPanelVariant = computed(() => props.variant === 'panel');

const shouldShow = computed(() => {
  if (!props.hideWhenSinglePage) return true;

  if (isPanelVariant.value) {
    return props.totalPages > 1 || (props.showItemsPerPage && props.itemsPerPage !== 24);
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
    class="panel-pagination-shell mt-4 px-4 py-3 bg-surface rounded-md border border-line flex flex-col sm:flex-row items-center justify-between gap-3 transition-colors"
  >
    <div class="flex items-center space-x-4 text-xs font-mono text-fg-muted whitespace-nowrap">
      <span v-if="showTotalItems">{{ t('common.totalProfiles', { count: totalItems }) }}</span>
      <div v-if="showItemsPerPage" class="flex items-center space-x-2">
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
            size="xs"
            trigger-class="font-mono"
            @update:model-value="handleItemsPerPageChange"
          />
        </div>
      </div>
      <slot name="panel-left" />
    </div>

    <div v-if="totalPages > 1" class="flex items-center space-x-2">
      <button
        :aria-label="t('common.firstPage')"
        :disabled="currentPage === 1"
        :title="t('common.firstPage')"
        class="h-8 w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-fg-muted hover:text-fg border border-line hover:border-line-strong touch-target"
        @click="emitPageChange(1)"
      >
        <ChevronsLeft class="w-4 h-4" />
      </button>
      <button
        :aria-label="t('common.prevPage')"
        :disabled="currentPage === 1"
        :title="t('common.prevPage')"
        class="h-8 w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-fg-muted hover:text-fg border border-line hover:border-line-strong touch-target"
        @click="emitPageChange(currentPage - 1)"
      >
        <ChevronLeft class="w-4 h-4" />
      </button>

      <div class="flex items-center space-x-1 font-mono">
        <input
          v-model="pageInput"
          :aria-label="t('common.pageNumber')"
          class="w-14 text-center text-xs font-mono py-1 border border-line rounded-md bg-inset text-fg focus:border-line-strong focus-visible:outline-none appearance-none remove-arrow touch-target"
          type="number"
          @blur="jumpToPage"
          @keydown.enter="jumpToPage"
        />
        <span class="text-xs text-fg-subtle">/ {{ totalPages }}</span>
      </div>

      <button
        :aria-label="t('common.nextPage')"
        :disabled="currentPage === totalPages"
        :title="t('common.nextPage')"
        class="h-8 w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-fg-muted hover:text-fg border border-line hover:border-line-strong touch-target"
        @click="emitPageChange(currentPage + 1)"
      >
        <ChevronRight class="w-4 h-4" />
      </button>
      <button
        :aria-label="t('common.lastPage')"
        :disabled="currentPage === totalPages"
        :title="t('common.lastPage')"
        class="h-8 w-8 flex items-center justify-center rounded-md bg-transparent hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-fg-muted hover:text-fg border border-line hover:border-line-strong touch-target"
        @click="emitPageChange(totalPages)"
      >
        <ChevronsRight class="w-4 h-4" />
      </button>
    </div>
    <div v-else class="w-[100px]"></div>
  </div>

  <div v-else-if="shouldShow" class="flex flex-wrap justify-center items-center gap-3 mt-6 text-xs font-mono">
    <button
      :disabled="currentPage === 1"
      class="h-8 px-3 rounded-md disabled:opacity-50 bg-transparent text-fg-muted hover:text-fg border border-line hover:border-line-strong hover:bg-hover touch-target"
      @click="emitPageChange(currentPage - 1)"
    >
      &laquo; {{ t('common.prevPage') }}
    </button>
    <span class="text-fg-muted bg-transparent border border-line px-3 py-1 rounded-md">{{
      t('common.pageOf', { current: currentPage, total: totalPages })
    }}</span>
    <button
      :disabled="currentPage === totalPages"
      class="h-8 px-3 rounded-md disabled:opacity-50 bg-transparent text-fg-muted hover:text-fg border border-line hover:border-line-strong hover:bg-hover touch-target"
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
