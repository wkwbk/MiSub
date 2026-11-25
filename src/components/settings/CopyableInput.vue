<script setup lang="ts">
import { Copy } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';

withDefaults(
  defineProps<{
    value?: string;
    label?: string;
    hint?: string;
    ariaLabel?: string;
    buttonText?: string;
    muted?: boolean;
  }>(),
  {
    value: '',
    label: '',
    hint: '',
    ariaLabel: '',
    buttonText: '',
    muted: false,
  },
);

defineEmits<{
  copy: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div>
    <label v-if="label" class="block text-xs font-medium text-fg-muted mb-1.5">{{ label }}</label>
    <div class="flex rounded-md shadow-none">
      <input
        :aria-label="ariaLabel || label || undefined"
        :class="muted ? 'text-fg-muted' : 'text-fg'"
        :value="value"
        class="flex-1 min-w-0 block w-full px-3 py-2 bg-inset border border-line rounded-l-md rounded-r-none font-mono text-xs"
        readonly
        type="text"
      />
      <button
        :aria-label="buttonText || t('actions.copy')"
        :class="buttonText ? 'whitespace-nowrap px-4 py-2 text-xs font-medium' : 'px-3.5 py-2'"
        class="inline-flex shrink-0 items-center border border-l-0 border-line rounded-r-md rounded-l-none bg-transparent text-fg-muted hover:bg-hover hover:text-fg transition-colors focus-visible:outline-hidden"
        type="button"
        @click="$emit('copy')"
      >
        <span v-if="buttonText">{{ buttonText }}</span>
        <Copy v-else class="h-4 w-4" />
      </button>
    </div>
    <p v-if="hint" class="mt-1.5 text-xs text-fg-muted leading-relaxed">
      {{ hint }}
    </p>
  </div>
</template>
