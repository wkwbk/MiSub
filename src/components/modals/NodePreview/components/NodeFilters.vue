<script setup lang="ts">
import { computed } from 'vue';
import { Layers, LayoutGrid, List, Search, Zap } from '@lucide/vue';
import Select from '@/components/ui/Select.vue';
import { useI18n } from '@/i18n/index.js';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    searchQuery?: string;
    protocolFilter?: string;
    regionFilter?: string;
    viewMode?: string;
    showProcessed?: boolean;
    availableProtocols?: string[];
    availableRegions?: string[];
    profileId?: string | null;
    apiEndpoint?: string;
  }>(),
  {
    searchQuery: '',
    protocolFilter: 'all',
    regionFilter: 'all',
    viewMode: 'list',
    showProcessed: false,
    availableProtocols: () => [],
    availableRegions: () => [],
    profileId: '',
    apiEndpoint: '',
  },
);

const emit = defineEmits<{
  'update:searchQuery': [value: string];
  'update:protocolFilter': [value: string];
  'update:regionFilter': [value: string];
  'update:viewMode': [value: string];
  'update:showProcessed': [value: boolean];
}>();

const searchModel = computed({
  get: () => props.searchQuery,
  set: (val: string) => emit('update:searchQuery', val),
});

const protocolModel = computed({
  get: () => props.protocolFilter,
  set: (val: string) => emit('update:protocolFilter', val),
});

const regionModel = computed({
  get: () => props.regionFilter,
  set: (val: string) => emit('update:regionFilter', val),
});

const isProcessedToggleVisible = computed(() => {
  return Boolean(props.profileId) && props.apiEndpoint !== API_ENDPOINTS.PUBLIC_PREVIEW;
});
</script>

<template>
  <!-- 响应式网格布局 -->
  <div class="rounded-md border border-line bg-inset p-3.5 shadow-none sm:p-4">
    <div class="flex flex-col gap-3 lg:grid lg:grid-cols-4 lg:items-end sm:gap-4">
      <!-- 搜索 (移动端置顶) -->
      <div class="w-full">
        <label class="block text-xs uppercase font-medium text-fg-subtle mb-1.5 tracking-wider">
          {{ t('nodePreview.searchLabel') }}
        </label>
        <div class="flex gap-2">
          <div class="relative flex-1 group">
            <input
              v-model="searchModel"
              :aria-label="t('nodePreview.searchLabel')"
              :placeholder="t('nodePreview.searchPlaceholder')"
              class="h-[38px] w-full rounded-md border border-line bg-inset px-3 py-2 pr-9 text-sm text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-hidden transition-colors shadow-none"
              type="text"
            />
            <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-fg-subtle">
              <Search class="w-4 h-4" />
            </div>
          </div>

          <!-- 处理模式 toggler (仅移动端、订阅组且非公开页显示) -->
          <button
            v-if="isProcessedToggleVisible"
            :aria-label="t('nodePreview.toggleProcessed')"
            :class="
              showProcessed ? 'bg-active text-fg border-line-strong' : 'bg-transparent text-fg-subtle border-line'
            "
            class="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-md border transition-colors lg:hidden"
            @click="emit('update:showProcessed', !showProcessed)"
          >
            <Layers v-if="!showProcessed" class="w-4 h-4" />
            <Zap v-else class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- 筛选器组 (移动端并排) -->
      <div class="grid grid-cols-2 gap-3 lg:contents">
        <!-- 协议筛选 -->
        <div>
          <label class="block text-xs uppercase font-medium text-fg-subtle mb-1.5 tracking-wider">
            {{ t('nodePreview.protocolFilterLabel') }}
          </label>
          <Select
            v-model="protocolModel"
            :options="[
              { value: 'all', label: t('nodePreview.allProtocols') },
              ...availableProtocols.map((protocol) => ({
                value: protocol,
                label: protocol.toUpperCase(),
              })),
            ]"
            trigger-class="font-mono"
          />
        </div>

        <!-- 地区筛选 -->
        <div>
          <label class="block text-xs uppercase font-medium text-fg-subtle mb-1.5 tracking-wider">
            {{ t('nodePreview.regionFilterLabel') }}
          </label>
          <Select
            v-model="regionModel"
            :options="[
              { value: 'all', label: t('nodePreview.allRegions') },
              ...availableRegions.map((region) => ({
                value: region,
                label: region,
              })),
            ]"
          />
        </div>
      </div>

      <!-- 视图切换 & 规则处理 (Desktop Combined) -->
      <div class="hidden lg:flex gap-6">
        <!-- 视图切换 -->
        <div>
          <label class="block text-xs uppercase font-medium text-fg-subtle mb-1.5 tracking-wider">
            {{ t('nodePreview.layoutLabel') }}
          </label>
          <div class="inline-flex items-center gap-0.5 border border-line rounded-md bg-inset p-0.5">
            <button
              :aria-label="t('common.listView')"
              :class="
                viewMode === 'list'
                  ? 'border-line-strong bg-active text-fg'
                  : 'border-transparent bg-transparent text-fg-subtle hover:bg-hover hover:text-fg'
              "
              :title="t('common.listView')"
              class="flex h-8 w-8 items-center justify-center rounded border text-sm font-medium transition-colors"
              @click="emit('update:viewMode', 'list')"
            >
              <List class="w-4 h-4" />
            </button>
            <button
              :aria-label="t('common.cardView')"
              :class="
                viewMode === 'card'
                  ? 'border-line-strong bg-active text-fg'
                  : 'border-transparent bg-transparent text-fg-subtle hover:bg-hover hover:text-fg'
              "
              :title="t('common.cardView')"
              class="flex h-8 w-8 items-center justify-center rounded border text-sm font-medium transition-colors"
              @click="emit('update:viewMode', 'card')"
            >
              <LayoutGrid class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- 规则处理 -->
        <div v-if="isProcessedToggleVisible">
          <label class="block text-xs uppercase font-medium text-fg-subtle mb-1.5 tracking-wider">
            {{ t('nodePreview.optimizationLabel') }}
          </label>
          <div class="flex items-center gap-2">
            <button
              :aria-label="t('nodePreview.toggleRawName')"
              :class="
                showProcessed
                  ? 'bg-active text-fg border-line-strong'
                  : 'bg-transparent text-fg-subtle border-line hover:text-fg'
              "
              :title="t('nodePreview.toggleRawName')"
              class="flex h-[38px] w-[38px] items-center justify-center rounded-md border text-sm font-medium transition-colors"
              @click="emit('update:showProcessed', !showProcessed)"
            >
              <Zap v-if="showProcessed" class="w-4 h-4" />
              <Layers v-else class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
