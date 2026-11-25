import { computed, ref, watch, type Ref, type WatchSource } from 'vue';
import { DEFAULT_LIST_PAGE_SIZE, normalizeListPageSize } from '@/constants/pagination.js';
import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';

export interface UseListPaginationOptions {
  storageKey?: string;
  defaultPageSize?: number;
  resetDeps?: WatchSource<unknown>[];
}

export function useListPagination<T>(itemsRef: Ref<T[]>, options: UseListPaginationOptions = {}) {
  const { storageKey = '', defaultPageSize = DEFAULT_LIST_PAGE_SIZE, resetDeps = [] } = options;

  const initialPageSize = (
    storageKey
      ? normalizeListPageSize(readRawPreference(storageKey), defaultPageSize)
      : normalizeListPageSize(defaultPageSize, DEFAULT_LIST_PAGE_SIZE)
  ) as number;

  const currentPage = ref(1);
  const itemsPerPage = ref(initialPageSize);

  watch(itemsPerPage, (newVal) => {
    const normalized = normalizeListPageSize(newVal, defaultPageSize) as number;
    if (normalized !== newVal) {
      itemsPerPage.value = normalized;
      return;
    }
    if (storageKey) {
      writeRawPreference(storageKey, normalized);
    }
    currentPage.value = 1;
  });

  const totalPages = computed(() => {
    const list = itemsRef.value || [];
    if (itemsPerPage.value === -1) return 1;
    const total = Math.ceil(list.length / itemsPerPage.value);
    return total > 0 ? total : 1;
  });

  const paginatedItems = computed<T[]>(() => {
    const list = itemsRef.value || [];
    if (itemsPerPage.value === -1) return list;
    const start = (currentPage.value - 1) * itemsPerPage.value;
    const end = start + itemsPerPage.value;
    return list.slice(start, end);
  });

  watch(totalPages, (nextTotal) => {
    if (currentPage.value > nextTotal) {
      currentPage.value = nextTotal;
    }
  });

  if (Array.isArray(resetDeps) && resetDeps.length > 0) {
    watch(resetDeps, () => {
      currentPage.value = 1;
    });
  }

  function changePage(page: number | string): void {
    let parsed = parseInt(String(page), 10);
    if (Number.isNaN(parsed)) parsed = 1;
    if (parsed < 1) parsed = 1;
    if (parsed > totalPages.value) parsed = totalPages.value;
    currentPage.value = parsed;
  }

  return {
    currentPage,
    itemsPerPage,
    totalPages,
    paginatedItems,
    changePage,
  };
}
