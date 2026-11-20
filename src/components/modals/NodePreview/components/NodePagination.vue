<script setup>
import { useI18n } from '@/i18n/index.js';
import { computed } from 'vue';

const { t } = useI18n();

const props = defineProps({
  currentPage: {
    type: Number,
    default: 1,
  },
  totalPages: {
    type: Number,
    default: 1,
  },
  pageSize: {
    type: Number,
    default: 24,
  },
  totalItems: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(['go-to-page']);

const pageNumbers = computed(() => {
  const pages = [];
  const current = props.currentPage;
  const total = props.totalPages;

  if (total <= 7) {
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
  } else {
    if (current <= 3) {
      for (let i = 1; i <= 5; i++) {
        pages.push(i);
      }
      pages.push('...');
      pages.push(total);
    } else if (current >= total - 2) {
      pages.push(1);
      pages.push('...');
      for (let i = total - 4; i <= total; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      pages.push('...');
      for (let i = current - 1; i <= current + 1; i++) {
        pages.push(i);
      }
      pages.push('...');
      pages.push(total);
    }
  }

  return pages;
});

const goToPage = (page) => {
  if (page < 1 || page > props.totalPages) return;
  emit('go-to-page', page);
};
</script>

<template>
  <div v-if="totalPages > 1" class="shrink-0 border-t border-line bg-transparent pt-4 mt-4">
    <!-- 桌面端完整分页 -->
    <div v-if="currentPage > 0" class="hidden sm:flex items-center justify-between">
      <div class="text-xs font-mono text-fg-subtle">
        {{
          t('pagination.showingRange', {
            from: (currentPage - 1) * pageSize + 1,
            to: Math.min(currentPage * pageSize, totalItems),
            total: totalItems,
          })
        }}
      </div>
      <div class="flex items-center space-x-1.5">
        <!-- 上一页 -->
        <button
          :disabled="currentPage <= 1"
          class="rounded-md border border-line bg-transparent px-3 py-1.5 text-xs text-fg-muted transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          @click="goToPage(currentPage - 1)"
        >
          {{ t('common.prevPage') }}
        </button>

        <!-- 页码 -->
        <div class="flex space-x-1">
          <button
            v-for="page in pageNumbers"
            :key="page"
            :class="{
              'rounded-md border px-2.5 py-1.5 text-xs font-mono font-medium transition-colors': true,
              'bg-active border-line-strong text-fg': page === currentPage,
              'border-line bg-transparent text-fg-muted hover:bg-hover': page !== currentPage && page !== '...',
              'opacity-50 cursor-not-allowed border-transparent': page === '...',
            }"
            :disabled="page === '...'"
            @click="page !== '...' && goToPage(page)"
          >
            {{ page }}
          </button>
        </div>

        <!-- 下一页 -->
        <button
          :disabled="currentPage >= totalPages"
          class="rounded-md border border-line bg-transparent px-3 py-1.5 text-xs text-fg-muted transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          @click="goToPage(currentPage + 1)"
        >
          {{ t('common.nextPage') }}
        </button>
      </div>
    </div>

    <!-- 移动端简化分页 -->
    <div class="sm:hidden">
      <div class="mb-3 flex items-center justify-between">
        <div class="text-xs font-mono text-fg-muted">
          {{ t('pagination.pageOfShort', { current: currentPage, total: totalPages }) }}
        </div>
        <div class="text-xs font-mono text-fg-subtle">
          {{ t('pagination.totalItems', { total: totalItems }) }}
        </div>
      </div>
      <div class="flex items-center justify-center space-x-3">
        <button
          :disabled="currentPage <= 1"
          class="max-w-[100px] flex-1 rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          @click="goToPage(currentPage - 1)"
        >
          {{ t('common.prevPage') }}
        </button>
        <span class="px-3 py-1 text-xs font-mono font-medium text-fg-muted">
          {{ currentPage }}
        </span>
        <button
          :disabled="currentPage >= totalPages"
          class="max-w-[100px] flex-1 rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          @click="goToPage(currentPage + 1)"
        >
          {{ t('common.nextPage') }}
        </button>
      </div>
    </div>
  </div>
</template>
