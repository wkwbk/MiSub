<script setup lang="ts">
import { FileText, Upload } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();

withDefaults(
  defineProps<{
    formattedTotalRemainingTraffic?: string;
  }>(),
  {
    formattedTotalRemainingTraffic: '0 B',
  },
);

defineEmits<{
  openLog: [];
  openBulkImport: [];
}>();
</script>

<template>
  <div
    class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3 bg-surface border border-line rounded-md px-4 py-3.5 sm:px-5"
  >
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-xl sm:text-2xl font-semibold text-fg tracking-tight">
        {{ t('nav.dashboard') }}
      </h1>
      <span
        v-if="formattedTotalRemainingTraffic !== '0 B'"
        class="inline-flex items-center gap-2 px-2.5 py-1 text-xs font-mono font-medium text-fg-muted bg-transparent rounded-md border border-line"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
        {{
          t('dashboard.totalRemainingTraffic', {
            traffic: formattedTotalRemainingTraffic,
          })
        }}
      </span>
    </div>
    <div class="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
      <button
        class="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium text-fg-muted bg-transparent hover:bg-hover hover:text-fg hover:border-line-strong border border-line transition-colors shadow-none"
        @click="$emit('openLog')"
      >
        <FileText class="h-3.5 w-3.5 shrink-0" />
        {{ t('actions.viewLog') }}
      </button>
      <button
        class="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium text-fg bg-elevated-card hover:bg-hover border border-line-strong transition-colors shadow-none"
        @click="$emit('openBulkImport')"
      >
        <Upload class="h-3.5 w-3.5 shrink-0" />
        {{ t('actions.bulkImport') }}
      </button>
    </div>
  </div>
</template>
