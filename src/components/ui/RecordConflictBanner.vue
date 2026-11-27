<script setup lang="ts">
import { AlertTriangle, RefreshCw, ShieldAlert } from '@lucide/vue';
import type { RecordConflictBannerModel } from '@/stores/useDataStore.js';
import { useI18n } from '@/i18n/index.js';

const props = withDefaults(
  defineProps<{
    conflict?: RecordConflictBannerModel | null;
    isSaving?: boolean;
  }>(),
  {
    conflict: null,
    isSaving: false,
  },
);

const emit = defineEmits<{
  reload: [];
  'force-save': [];
}>();

const { t } = useI18n();
</script>

<template>
  <div
    v-if="props.conflict"
    role="alert"
    aria-live="assertive"
    class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-fg"
  >
    <div class="flex items-start gap-2.5">
      <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div class="min-w-0 flex-1 space-y-2">
        <div class="font-semibold text-amber-700 dark:text-amber-300">
          {{ t('store.recordConflictTitle') }}
        </div>
        <p class="leading-relaxed text-fg-muted">
          {{
            t('store.recordConflictDetail', {
              localVersion: props.conflict.localVersion,
              serverVersion: props.conflict.serverVersion,
            })
          }}
        </p>
        <div class="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            type="button"
            :disabled="props.isSaving"
            class="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            @click="emit('reload')"
          >
            <RefreshCw class="h-3.5 w-3.5" />
            <span>{{ t('store.reloadLatestToEdit') }}</span>
          </button>
          <button
            type="button"
            :disabled="props.isSaving"
            class="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/15 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300"
            @click="emit('force-save')"
          >
            <ShieldAlert class="h-3.5 w-3.5" />
            <span>{{ t('store.forceOverwriteSave') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
