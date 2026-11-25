<script setup lang="ts">
import { Check, Loader2 } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import type { SaveState } from '@/stores/useDataStore.js';

withDefaults(
  defineProps<{
    isDirty?: boolean;
    saveState?: SaveState | string;
    isDiscarding?: boolean;
  }>(),
  {
    isDirty: false,
    saveState: 'idle',
    isDiscarding: false,
  },
);

defineEmits<{
  save: [];
  discard: [];
}>();
const { t } = useI18n();
</script>

<template>
  <Transition name="slide-fade">
    <div
      v-if="isDirty || saveState === 'success'"
      class="popover-surface fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] w-[95%] max-w-2xl px-4 py-3 rounded-lg flex flex-row items-center justify-between transition-all duration-200 gap-4"
    >
      <div class="flex items-center gap-2.5">
        <span
          :class="saveState === 'success' ? 'bg-emerald-500' : 'bg-amber-500'"
          class="inline-flex rounded-full h-1.5 w-1.5 shrink-0"
        ></span>
        <p class="text-xs font-medium text-fg">
          {{ saveState === 'success' ? t('common.allChangesSaved') : t('common.unsavedChanges') }}
        </p>
      </div>

      <div class="flex items-center gap-2.5 w-full sm:w-auto">
        <button
          v-if="saveState !== 'success'"
          :disabled="saveState !== 'idle' || isDiscarding"
          class="flex-1 sm:flex-none px-3.5 py-1.5 text-xs font-medium text-fg-muted hover:text-fg border border-line hover:border-line-strong bg-transparent hover:bg-hover transition-colors rounded-md whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          @click="$emit('discard')"
        >
          {{ t('actions.discard') }}
        </button>
        <button
          :disabled="saveState !== 'idle'"
          class="flex-1 sm:flex-none px-4 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center transition-opacity disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap bg-accent text-accent-fg hover:opacity-90 border border-accent"
          @click.prevent="$emit('save')"
        >
          <div v-if="saveState === 'saving'" class="flex items-center">
            <Loader2 aria-hidden="true" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
            <span>{{ t('settings.saving') }}</span>
          </div>
          <div v-else-if="saveState === 'success'" class="flex items-center">
            <Check class="w-3.5 h-3.5 mr-1.5" />
            <span>{{ t('common.saved') }}</span>
          </div>
          <span v-else>{{ t('common.saveNow') }}</span>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease-out;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-20px);
  opacity: 0;
}
</style>
