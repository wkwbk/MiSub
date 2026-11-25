import { computed, ref, watch, type Ref } from 'vue';
import { DEFAULT_LIST_PAGE_SIZE, normalizeListPageSize } from '@/constants/pagination.js';
import { MANUAL_NODE_COUNTRY_ALIAS_MAP } from '@/constants/manual-node-country-aliases.js';
import {
  matchesNodeAttributeFilters,
  type NodeAttributeFilters,
  type NodeInspectMap,
} from '@/composables/manual-nodes/filters.js';
import type { StoreMisubItem } from '@/queries/useAppDataQueries.js';
import { getItemTags, matchesTagFilter } from '@/utils/tags.js';

export interface UseManualNodeSearchPaginationOptions {
  manualNodes: Ref<StoreMisubItem[]>;
  paginatedManualNodes: Ref<StoreMisubItem[]>;
  initialSearchTerm: Ref<string>;
  activeTagFilters?: Ref<string[]>;
  attrFilters?: Ref<NodeAttributeFilters>;
  nodeInspectMap?: Ref<NodeInspectMap>;
  itemsPerPage?: Ref<number>;
  onBasePageChange?: (page: number) => void;
  onSearchTermChange?: (value: string) => void;
}

const countryAliasMap = MANUAL_NODE_COUNTRY_ALIAS_MAP as Record<string, string[]>;

export function useManualNodeSearchPagination(options: UseManualNodeSearchPaginationOptions) {
  const {
    manualNodes,
    paginatedManualNodes,
    initialSearchTerm,
    activeTagFilters,
    attrFilters,
    nodeInspectMap,
    itemsPerPage,
    onBasePageChange,
    onSearchTermChange,
  } = options;

  const localSearchTerm = ref(initialSearchTerm.value || '');
  const currentSearchPage = ref(1);

  const resolvedPageSize = computed(() =>
    normalizeListPageSize(itemsPerPage ? itemsPerPage.value : DEFAULT_LIST_PAGE_SIZE, DEFAULT_LIST_PAGE_SIZE),
  );

  const hasActiveAttrFilters = computed(() => {
    const f = attrFilters?.value;
    return Boolean(f && (f.protocol || f.country || f.network));
  });

  const useLocalPagination = computed(() => Boolean(localSearchTerm.value) || hasActiveAttrFilters.value);

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

  watch(
    () => [attrFilters?.value?.protocol, attrFilters?.value?.country, attrFilters?.value?.network],
    () => {
      currentSearchPage.value = 1;
    },
  );

  watch(resolvedPageSize, () => {
    currentSearchPage.value = 1;
  });

  const filteredNodes = computed(() => {
    const inspectMap = nodeInspectMap?.value || null;
    const activeAttrs = attrFilters?.value || null;
    const matched = (manualNodes.value || []).filter(
      (node) =>
        matchesTagFilter(node, activeTagFilters?.value) && matchesNodeAttributeFilters(node, activeAttrs, inspectMap),
    );

    if (!localSearchTerm.value) {
      return matched;
    }

    const searchQuery = localSearchTerm.value.toLowerCase().trim();
    if (!searchQuery) {
      return matched;
    }

    return matched.filter((node) => {
      const nodeName = String(node.name || '').toLowerCase();
      if (nodeName && nodeName.includes(searchQuery)) {
        return true;
      }

      const alternativeTerms = countryAliasMap[searchQuery] || [];
      if (nodeName && alternativeTerms.some((term) => nodeName.includes(term.toLowerCase()))) {
        return true;
      }

      const tags = getItemTags(node);
      if (tags.some((tag) => tag.toLowerCase().includes(searchQuery))) {
        return true;
      }

      const info = inspectMap?.[node.id];
      if (info) {
        if (info.ip && String(info.ip).toLowerCase().includes(searchQuery)) return true;
        if (info.country && String(info.country).toLowerCase().includes(searchQuery)) return true;
        if (info.countryCode && String(info.countryCode).toLowerCase() === searchQuery) return true;
      }

      return false;
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
    if (!useLocalPagination.value) {
      return paginatedManualNodes.value || [];
    }

    if (resolvedPageSize.value === -1) {
      return filteredNodes.value;
    }

    const start = (currentSearchPage.value - 1) * resolvedPageSize.value;
    const end = start + resolvedPageSize.value;
    return filteredNodes.value.slice(start, end);
  });

  function handlePageChange(page: number | string): void {
    const parsed = parseInt(String(page), 10);
    if (Number.isNaN(parsed)) return;

    if (useLocalPagination.value) {
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
    useLocalPagination,
    handlePageChange,
  };
}
