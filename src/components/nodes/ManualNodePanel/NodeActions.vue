<script setup>
import { computed } from 'vue';
import { Globe, Loader2, Plus, Search, X, Zap } from '@lucide/vue';
import MoreActionsMenu from '@/components/shared/MoreActionsMenu.vue';
import TagFilterBar from '@/components/shared/TagFilterBar.vue';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

const props = defineProps({
  manualNodesCount: {
    type: Number,
    default: 0,
  },
  filteredNodesCount: {
    type: Number,
    default: 0,
  },
  searchTerm: {
    type: String,
    default: '',
  },
  activeTagFilters: {
    type: Array,
    default: () => [],
  },
  manualNodeTags: {
    type: Array,
    default: () => [],
  },
  isSorting: {
    type: Boolean,
    default: false,
  },
  isSelectionMode: {
    type: Boolean,
    default: false,
  },
  isPingingAll: {
    type: Boolean,
    default: false,
  },
  isInspectingNodes: {
    type: Boolean,
    default: false,
  },
  pingMode: {
    type: String,
    default: 'local',
  },
  attrFilters: {
    type: Object,
    default: () => ({ protocol: '', country: '', network: '' }),
  },
  attributeOptions: {
    type: Object,
    default: () => ({ protocols: [], countries: [], networks: [] }),
  },
});

const emit = defineEmits([
  'update:searchTerm',
  'set-tag-filters',
  'toggle-protocol-filter',
  'toggle-country-filter',
  'toggle-network-filter',
  'clear-attr-filters',
  'add',
  'import',
  'auto-sort',
  'deduplicate',
  'toggle-sort',
  'delete-all',
  'toggle-selection-mode',
  'ping-all',
  'inspect-all',
  'update:pingMode',
  'sort-by-latency',
  'manage-tags',
]);

const hasAttrOptions = computed(() => {
  const opts = props.attributeOptions;
  return Boolean(
    opts &&
    ((opts.protocols && opts.protocols.length > 0) ||
      (opts.networks && opts.networks.length > 0) ||
      (opts.countries && opts.countries.length > 0)),
  );
});

const hasActiveAttrFilters = computed(() =>
  Boolean(props.attrFilters?.protocol || props.attrFilters?.country || props.attrFilters?.network),
);

const networkLabel = (net) => {
  if (net === 'direct') return t('manualNodes.badgeDirect');
  if (net === 'cdn') return t('manualNodes.badgeCdn');
  if (net === 'relay') return t('manualNodes.badgeRelay');
  return net;
};

const handleAttrWheel = (e) => {
  const el = e.currentTarget;
  if (el && el.scrollWidth > el.clientWidth && e.deltaY !== 0) {
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }
};

const searchModel = computed({
  get: () => props.searchTerm,
  set: (val) => emit('update:searchTerm', val),
});
</script>

<template>
  <div class="mb-4 min-w-0 rounded-md border border-line bg-surface p-4 shadow-none">
    <div class="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 flex-wrap items-center gap-3">
          <h2 class="text-lg font-semibold text-fg">
            {{ t('manualNodes.title') }}
          </h2>
          <span
            class="rounded-md border border-line bg-transparent px-2 py-0.5 text-xs font-mono font-medium text-fg-muted"
            >{{ manualNodesCount }}</span
          >
        </div>
        <p :title="t('manualNodes.subtitle')" class="mt-1 truncate text-xs text-fg-muted">
          {{ t('manualNodes.subtitle') }}
        </p>
      </div>
      <div
        class="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap lg:shrink-0"
        data-testid="manual-node-toolbar-actions"
      >
        <button
          :disabled="isInspectingNodes || manualNodesCount === 0"
          class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent shadow-none"
          data-testid="inspect-all-nodes-btn"
          type="button"
          @click="emit('inspect-all')"
        >
          <Loader2 v-if="isInspectingNodes" aria-hidden="true" class="h-3.5 w-3.5 animate-spin text-sky-500" />
          <Globe v-else aria-hidden="true" class="h-3.5 w-3.5 text-sky-500" stroke-width="1.75" />
          <span class="hidden sm:inline">{{ t('actions.inspectAll') }}</span>
        </button>
        <button
          :disabled="isPingingAll"
          :title="pingMode === 'tcping' ? t('manualNodes.pingModeTcping') : t('manualNodes.pingModeLocal')"
          class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent shadow-none"
          type="button"
          @click="emit('ping-all')"
        >
          <Loader2 v-if="isPingingAll" aria-hidden="true" class="h-3.5 w-3.5 animate-spin text-emerald-500" />
          <Zap v-else aria-hidden="true" class="h-3.5 w-3.5 text-emerald-500" stroke-width="1.75" />
          {{ t('actions.pingAll') }}
        </button>
        <button
          class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line-strong bg-active px-3.5 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-hover shadow-none"
          @click="emit('add')"
        >
          <Plus class="h-3.5 w-3.5 shrink-0" stroke-width="2" />
          {{ t('actions.add') }}
        </button>
        <MoreActionsMenu menu-width-class="w-44">
          <template #menu="{ close }">
            <button
              :class="isSelectionMode ? 'text-fg font-semibold' : ''"
              class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg font-medium transition-colors"
              @click="
                emit('toggle-selection-mode');
                close();
              "
            >
              {{ isSelectionMode ? t('actions.exitBatch') : t('actions.bulkActions') }}
            </button>
            <div class="my-1 border-t border-line"></div>
            <button
              class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
              @click="
                emit('import');
                close();
              "
            >
              {{ t('actions.importSubscription') }}
            </button>
            <button
              v-if="manualNodeTags.length > 0"
              class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
              data-testid="manage-manual-node-tags"
              @click="
                emit('manage-tags');
                close();
              "
            >
              {{ t('actions.manageTags') }}
            </button>
            <button
              class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
              @click="
                emit('auto-sort');
                close();
              "
            >
              {{ t('actions.autoSort') }}
            </button>
            <button
              class="w-full whitespace-nowrap text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
              :title="t('manualNodes.pingModeSwitchHint')"
              @click="
                emit('update:pingMode', pingMode === 'tcping' ? 'local' : 'tcping');
                close();
              "
            >
              {{ pingMode === 'tcping' ? t('manualNodes.pingModeTcping') : t('manualNodes.pingModeLocal') }}
            </button>
            <button
              class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
              @click="
                emit('sort-by-latency');
                close();
              "
            >
              {{ t('actions.sortByLatency') }}
            </button>
            <button
              class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
              @click="
                emit('deduplicate');
                close();
              "
            >
              {{ t('actions.deduplicate') }}
            </button>
            <button
              class="w-full text-left px-3 py-2 rounded text-xs transition-colors text-fg-muted hover:bg-hover hover:text-fg"
              @click="
                emit('toggle-sort');
                close();
              "
            >
              {{ isSorting ? t('actions.finishSort') : t('actions.manualSort') }}
            </button>
            <div class="my-1 border-t border-line"></div>
            <button
              class="w-full text-left px-3 py-2 rounded text-xs text-red-400 hover:bg-red-500/15 hover:text-red-400 transition-colors"
              @click="
                emit('delete-all');
                close();
              "
            >
              {{ t('actions.clearAll') }}
            </button>
          </template>
        </MoreActionsMenu>
      </div>
    </div>

    <div class="relative mt-4" data-testid="manual-node-search">
      <Search
        aria-hidden="true"
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
      />
      <input
        v-model="searchModel"
        :aria-label="t('manualNodes.searchLabel')"
        :disabled="isSorting"
        :placeholder="t('manualNodes.searchPlaceholder')"
        class="w-full rounded-md border border-line bg-transparent py-2 pl-9 pr-24 text-xs text-fg outline-none transition focus:border-line-strong disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-fg-subtle"
        type="text"
      />
      <div v-if="searchTerm" class="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        <span class="pointer-events-none text-xs font-mono text-fg-muted">
          {{ filteredNodesCount }}/{{ manualNodesCount }}
        </span>
        <button
          :aria-label="t('actions.clearSearch')"
          class="rounded p-0.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg cursor-pointer"
          type="button"
          @click="searchModel = ''"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <div
      v-if="manualNodeTags.length > 0 || activeTagFilters.length > 0"
      class="mt-3 flex w-full min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar md:hidden"
      data-testid="manual-node-mobile-tags"
    >
      <TagFilterBar
        :active-filters="activeTagFilters"
        :tags="manualNodeTags"
        test-id-prefix="manual-node-mobile-tag"
        @update:active-filters="emit('set-tag-filters', $event)"
      />
    </div>

    <div
      v-if="manualNodeTags.length > 0 || activeTagFilters.length > 0"
      class="hidden md:flex items-center gap-1.5 mt-3"
    >
      <TagFilterBar
        :active-filters="activeTagFilters"
        :tags="manualNodeTags"
        test-id-prefix="manual-node-tag"
        @update:active-filters="emit('set-tag-filters', $event)"
      />
    </div>

    <div
      v-if="hasAttrOptions || hasActiveAttrFilters"
      class="mt-2.5 flex w-full min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar"
      data-testid="manual-node-attr-filters"
      @wheel="handleAttrWheel"
    >
      <button
        v-for="item in attributeOptions.protocols"
        :key="`proto-${item.value}`"
        :class="
          attrFilters?.protocol === item.value
            ? 'bg-active text-fg border-line-strong font-semibold'
            : 'bg-transparent text-fg-muted border-line hover:text-fg hover:bg-hover'
        "
        class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs leading-4 font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap cursor-pointer"
        data-testid="attr-filter-protocol"
        type="button"
        @click="emit('toggle-protocol-filter', item.value)"
      >
        <span class="font-mono">{{ item.label }}</span>
        <span class="font-mono text-xs leading-none text-fg-subtle">{{ item.count }}</span>
      </button>

      <span
        v-if="
          attributeOptions.protocols?.length > 0 &&
          (attributeOptions.networks?.length > 0 || attributeOptions.countries?.length > 0)
        "
        aria-hidden="true"
        class="mx-0.5 h-4 w-px shrink-0 bg-line"
      ></span>

      <button
        v-for="item in attributeOptions.networks"
        :key="`net-${item.value}`"
        :class="
          attrFilters?.network === item.value
            ? 'bg-active text-fg border-line-strong font-semibold'
            : 'bg-transparent text-fg-muted border-line hover:text-fg hover:bg-hover'
        "
        class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs leading-4 font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap cursor-pointer"
        data-testid="attr-filter-network"
        type="button"
        @click="emit('toggle-network-filter', item.value)"
      >
        <span
          :class="{
            'bg-emerald-500': item.value === 'direct',
            'bg-sky-400': item.value === 'cdn',
            'bg-amber-500': item.value === 'relay',
          }"
          class="h-1.5 w-1.5 rounded-full shrink-0"
        ></span>
        <span>{{ networkLabel(item.value) }}</span>
        <span class="font-mono text-xs leading-none text-fg-subtle">{{ item.count }}</span>
      </button>

      <span
        v-if="attributeOptions.networks?.length > 0 && attributeOptions.countries?.length > 0"
        aria-hidden="true"
        class="mx-0.5 h-4 w-px shrink-0 bg-line"
      ></span>

      <button
        v-for="item in attributeOptions.countries"
        :key="`country-${item.value}`"
        :class="
          attrFilters?.country === item.value
            ? 'bg-active text-fg border-line-strong font-semibold'
            : 'bg-transparent text-fg-muted border-line hover:text-fg hover:bg-hover'
        "
        class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs leading-4 font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap cursor-pointer"
        data-testid="attr-filter-country"
        type="button"
        @click="emit('toggle-country-filter', item.value)"
      >
        <span>{{ item.label }}</span>
        <span class="font-mono text-xs leading-none text-fg-subtle">{{ item.count }}</span>
      </button>

      <button
        v-if="hasActiveAttrFilters"
        class="inline-flex items-center gap-1 px-2.5 py-1 text-xs leading-4 font-medium rounded-md border border-transparent text-fg-subtle transition-colors hover:bg-hover hover:text-fg shrink-0 whitespace-nowrap cursor-pointer"
        data-testid="clear-attr-filters-btn"
        type="button"
        @click="emit('clear-attr-filters')"
      >
        <X class="h-3.5 w-3.5" />
        {{ t('manualNodes.clearAttrFilters') }}
      </button>
    </div>
  </div>
</template>
