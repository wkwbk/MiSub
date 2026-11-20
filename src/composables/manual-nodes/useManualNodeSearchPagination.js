import { computed, ref, watch } from 'vue';
import { DEFAULT_LIST_PAGE_SIZE, normalizeListPageSize } from '@/constants/pagination.js';
import { MANUAL_NODE_COUNTRY_ALIAS_MAP } from '@/constants/manualNodeCountryAliases.js';
import { getItemTags, matchesTagFilter } from '@/utils/tags.js';

export function useManualNodeSearchPagination(options) {
  const {
    manualNodes,
    paginatedManualNodes,
    initialSearchTerm,
    activeTagFilters,
    itemsPerPage,
    onBasePageChange,
    onSearchTermChange,
  } = options;

  const localSearchTerm = ref(initialSearchTerm.value || '');
  const currentSearchPage = ref(1);

  const resolvedPageSize = computed(() =>
    normalizeListPageSize(itemsPerPage ? itemsPerPage.value : DEFAULT_LIST_PAGE_SIZE, DEFAULT_LIST_PAGE_SIZE),
  );

  watch(initialSearchTerm, (value) => {
    const normalized = value || '';
    if (normalized !== localSearchTerm.value) {
      localSearchTerm.value = normalized;
    }
  });

  watch(localSearchTerm, (value) => {
    currentSearchPage.value = 1;
    if (typeof onSearchTermChange === 'function') {
      onSearchTermChange(value);
    }
  });

  watch(resolvedPageSize, () => {
    currentSearchPage.value = 1;
  });

  const filteredNodes = computed(() => {
    const tagMatched = (manualNodes.value || []).filter((node) => matchesTagFilter(node, activeTagFilters?.value));

    if (!localSearchTerm.value) {
      return tagMatched;
    }

    const searchQuery = localSearchTerm.value.toLowerCase().trim();
    if (!searchQuery) {
      return tagMatched;
    }

    return tagMatched.filter((node) => {
      const nodeName = String(node.name || '').toLowerCase();
      if (nodeName && nodeName.includes(searchQuery)) {
        return true;
      }

      const alternativeTerms = MANUAL_NODE_COUNTRY_ALIAS_MAP[searchQuery] || [];
      if (nodeName && alternativeTerms.some((term) => nodeName.includes(term.toLowerCase()))) {
        return true;
      }

      const tags = getItemTags(node);
      return tags.some((tag) => tag.toLowerCase().includes(searchQuery));
    });
  });

  const totalSearchPages = computed(() => {
    if (resolvedPageSize.value === -1) return 1;
    const total = Math.ceil(filteredNodes.value.length / resolvedPageSize.value);
    return total > 0 ? total : 1;
  });

  watch(totalSearchPages, (nextTotal) => {
    if (currentSearchPage.value > nextTotal) {
      currentSearchPage.value = nextTotal;
    }
  });

  const paginatedNodes = computed(() => {
    if (!localSearchTerm.value) {
      return paginatedManualNodes.value || [];
    }

    if (resolvedPageSize.value === -1) {
      return filteredNodes.value;
    }

    const start = (currentSearchPage.value - 1) * resolvedPageSize.value;
    const end = start + resolvedPageSize.value;
    return filteredNodes.value.slice(start, end);
  });

  function handlePageChange(page) {
    const parsed = parseInt(page, 10);
    if (Number.isNaN(parsed)) return;

    if (localSearchTerm.value) {
      const clamped = Math.min(Math.max(parsed, 1), totalSearchPages.value);
      currentSearchPage.value = clamped;
      return;
    }

    if (typeof onBasePageChange === 'function') {
      onBasePageChange(parsed);
    }
  }

  return {
    localSearchTerm,
    filteredNodes,
    paginatedNodes,
    currentSearchPage,
    totalSearchPages,
    handlePageChange,
  };
}
