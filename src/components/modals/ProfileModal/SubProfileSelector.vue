<script setup lang="ts">
import { computed } from 'vue';
import type { ProfileConfig } from '@misub/core/types.js';
import { Search } from '@lucide/vue';
import TagFilterBar from '@/components/shared/TagFilterBar.vue';
import SelectedOrderList from '@/components/modals/ProfileModal/SelectedOrderList.vue';
import { useI18n } from '@/i18n/index.js';
import { wouldCreateCycle } from '@/utils/profile-graph.js';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    profiles?: ProfileConfig[];
    filteredProfiles?: ProfileConfig[];
    searchTerm?: string;
    activeTagFilters?: string[];
    tags?: string[];
    selectedIds?: string[];
    targetProfileId?: string;
    allProfiles?: ProfileConfig[];
    layout?: 'split' | 'stacked';
  }>(),
  {
    profiles: () => [],
    filteredProfiles: () => [],
    searchTerm: '',
    activeTagFilters: () => [],
    tags: () => [],
    selectedIds: () => [],
    targetProfileId: '',
    allProfiles: () => [],
    layout: 'stacked',
  },
);

const emit = defineEmits<{
  'update:searchTerm': [value: string];
  'update:tagFilters': [value: string[]];
  'update:selectedIds': [value: string[]];
  'toggle-selection': [id: string];
  'select-all': [profiles: ProfileConfig[]];
  'deselect-all': [];
}>();

const searchModel = computed({
  get: () => props.searchTerm,
  set: (val: string) => emit('update:searchTerm', val),
});

const selectedIdSet = computed(() => new Set(props.selectedIds));

const isCycleCandidate = (profileId: string) => {
  return wouldCreateCycle(props.targetProfileId, profileId, props.allProfiles);
};

const orderedSelectedProfiles = computed({
  get(): ProfileConfig[] {
    const profileMap = new Map<string, ProfileConfig>();
    props.allProfiles.forEach((p) => {
      if (p.id) profileMap.set(p.id, p);
      if (p.customId) profileMap.set(p.customId, p);
    });
    return props.selectedIds.map((id) => profileMap.get(id)).filter((p): p is ProfileConfig => Boolean(p));
  },
  set(newList: ProfileConfig[]) {
    const reorderedIds = newList.map((p) => p.id || p.customId || '').filter(Boolean);
    emit('update:selectedIds', reorderedIds);
  },
});

const handleSelectAllValid = () => {
  const validProfiles = props.filteredProfiles.filter((p) => !isCycleCandidate(p.id));
  emit('select-all', validProfiles);
};
</script>

<template>
  <div
    v-if="profiles.length > 0"
    :class="layout === 'split' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 lg:h-[460px]' : 'space-y-2'"
  >
    <div :class="layout === 'split' ? 'flex flex-col space-y-2 min-h-0' : 'space-y-2'">
      <div class="flex justify-between items-center gap-2 h-6 shrink-0">
        <h4 class="text-xs font-semibold text-fg-muted truncate">
          {{ t('profileModal.selectSubProfiles') }}
        </h4>
        <div class="space-x-2 shrink-0 whitespace-nowrap">
          <button
            class="text-xs text-fg-muted hover:text-fg hover:underline transition-colors"
            type="button"
            @click="handleSelectAllValid"
          >
            {{ t('profileModal.selectAll') }}
          </button>
          <button
            class="text-xs text-fg-muted hover:text-fg hover:underline transition-colors"
            type="button"
            @click="emit('deselect-all')"
          >
            {{ t('profileModal.deselectAll') }}
          </button>
        </div>
      </div>
      <div class="flex items-center h-8 shrink-0">
        <TagFilterBar
          :active-filters="activeTagFilters"
          :tags="tags"
          always-show
          test-id-prefix="subprofile-selector-tag"
          @update:active-filters="emit('update:tagFilters', $event)"
        />
      </div>
      <div class="relative shrink-0">
        <input
          v-model="searchModel"
          :aria-label="t('profiles.searchPlaceholder')"
          :placeholder="t('profiles.searchPlaceholder')"
          class="w-full pl-9 pr-3 py-1.5 text-xs bg-inset border border-line rounded-md shadow-none text-fg placeholder:text-fg-subtle focus-visible:outline-hidden focus:border-line-strong"
          type="text"
        />
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
      </div>
      <div
        :class="
          layout === 'split'
            ? 'overflow-y-auto space-y-2 p-3 bg-inset rounded-md border border-line flex-1 min-h-0 h-56 lg:h-auto'
            : 'overflow-y-auto space-y-2 p-3 bg-inset rounded-md border border-line h-36 lg:h-64'
        "
      >
        <div v-for="item in filteredProfiles" :key="item.id">
          <label
            :class="isCycleCandidate(item.id) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'"
            class="flex items-center space-x-3"
          >
            <input
              :checked="selectedIdSet.has(item.id)"
              :disabled="isCycleCandidate(item.id)"
              class="h-4 w-4 rounded-sm border-line-strong bg-inset text-fg focus:ring-0"
              type="checkbox"
              @change="emit('toggle-selection', item.id)"
            />
            <span :title="item.name" class="text-xs text-fg truncate flex-1">
              {{ item.name }}
            </span>
            <span
              v-if="isCycleCandidate(item.id)"
              :title="t('profileModal.cycleWarning')"
              class="inline-flex items-center gap-1.5 text-xs px-1.5 py-0.5 rounded-md border border-line text-red-400 shrink-0"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
              {{ t('profileModal.cycleWarning') }}
            </span>
            <span v-else class="text-xs font-mono text-fg-subtle shrink-0">
              {{
                t('profileModal.subProfileCounts', {
                  subscriptions: (item.subscriptions || []).length,
                  nodes: (item.manualNodes || []).length,
                })
              }}
            </span>
          </label>
        </div>
        <div v-if="filteredProfiles.length === 0" class="text-center text-fg-subtle text-xs py-4">
          {{ t('profileModal.noMatchedSubProfiles') }}
        </div>
      </div>
    </div>

    <SelectedOrderList
      v-model="orderedSelectedProfiles"
      :layout="layout"
      :unnamed-label="t('bulkImport.unnamed')"
      @remove="emit('toggle-selection', $event)"
    />
  </div>
  <div
    v-else
    class="text-center text-xs text-fg-subtle p-4 bg-transparent border border-line rounded-md flex items-center justify-center h-full"
  >
    {{ t('profileModal.noAvailableSubProfiles') }}
  </div>
</template>
