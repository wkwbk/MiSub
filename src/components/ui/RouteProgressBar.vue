<script setup lang="ts">
import { useI18n } from '@/i18n/index.js';

withDefaults(
  defineProps<{
    isNavigating?: boolean;
    progress?: number;
    isFadingOut?: boolean;
    showSlowIndicator?: boolean;
  }>(),
  {
    isNavigating: false,
    progress: 0,
    isFadingOut: false,
    showSlowIndicator: false,
  },
);

const { t } = useI18n();
</script>

<template>
  <div v-if="isNavigating" aria-hidden="true" class="fixed top-0 left-0 right-0 z-[100] h-[2px] pointer-events-none">
    <div
      :class="isFadingOut ? 'opacity-0' : 'opacity-100'"
      :style="{ width: `${progress}%` }"
      class="h-full bg-accent transition-[width,opacity] duration-150 ease-out"
    ></div>
  </div>

  <Transition name="fade">
    <div
      v-if="isNavigating && showSlowIndicator"
      aria-live="polite"
      class="fixed inset-0 z-40 flex items-center justify-center bg-canvas/50 backdrop-blur-[1px] pointer-events-none select-none"
      role="status"
    >
      <div class="flex items-center gap-2.5 px-4 py-2 rounded-md border border-line bg-elevated/95 shadow-sm">
        <span
          class="w-4 h-4 rounded-full border-2 border-line border-t-zinc-900 dark:border-t-zinc-100 animate-spin"
        ></span>
        <span class="text-xs font-mono text-fg-muted">
          {{ t('common.loading') }}
        </span>
      </div>
    </div>
  </Transition>
</template>
