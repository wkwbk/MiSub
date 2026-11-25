<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from '@/i18n/index.js';

const props = withDefaults(
  defineProps<{
    resetKey?: string | number;
  }>(),
  {
    resetKey: '',
  },
);

const { t } = useI18n();

const hasError = ref(false);
const errorMessage = ref('');

const reset = () => {
  hasError.value = false;
  errorMessage.value = '';
};

watch(
  () => props.resetKey,
  () => {
    reset();
  },
);

const handleReload = () => {
  window.location.reload();
};

const errorCaptured = (error: unknown) => {
  hasError.value = true;
  errorMessage.value = error instanceof Error ? error.message : t('common.routeRenderFailed');
  return false;
};

defineExpose({ reset, errorCaptured });
</script>

<template>
  <div v-if="hasError" class="w-full py-12 flex flex-col items-center gap-3 text-sm text-fg-muted">
    <div class="text-base font-semibold text-fg">
      {{ t('common.routeLoadError') }}
    </div>
    <div class="max-w-md text-center text-xs text-fg-subtle">{{ errorMessage }}</div>
    <button
      class="px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
      @click="handleReload"
    >
      {{ t('common.reload') }}
    </button>
  </div>
  <slot v-else />
</template>

<script lang="ts">
export default {
  errorCaptured(err: unknown) {
    return (this.$ as { exposed?: { errorCaptured?: (e: unknown) => boolean } } | null)?.exposed?.errorCaptured?.(err);
  },
};
</script>
