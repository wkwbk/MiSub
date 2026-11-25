<script setup lang="ts">
import { ref } from 'vue';
import { Eye, EyeOff } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';

withDefaults(
  defineProps<{
    modelValue?: string;
    label?: string;
    placeholder?: string;
    hint?: string;
    ariaLabel?: string;
  }>(),
  {
    modelValue: '',
    label: '',
    placeholder: '',
    hint: '',
    ariaLabel: '',
  },
);

defineEmits<{
  'update:modelValue': [value: string];
}>();

const { t } = useI18n();
const visible = ref(false);
</script>

<template>
  <div>
    <label v-if="label" class="block text-xs font-medium text-fg-muted mb-1.5">{{ label }}</label>
    <div class="relative">
      <input
        :aria-label="ariaLabel || label || undefined"
        :placeholder="placeholder"
        :type="visible ? 'text' : 'password'"
        :value="modelValue"
        autocomplete="off"
        class="block w-full pl-3 pr-10 py-2 bg-inset border border-line rounded-md shadow-none focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-line-strong focus:border-line-strong text-sm font-mono text-fg transition-colors"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button
        :aria-label="visible ? t('actions.hide') : t('actions.show')"
        class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-fg-muted hover:text-fg transition-colors"
        type="button"
        @click="visible = !visible"
      >
        <EyeOff v-if="visible" class="h-4 w-4" />
        <Eye v-else class="h-4 w-4" />
      </button>
    </div>
    <p v-if="hint" class="mt-1.5 text-xs text-fg-muted leading-relaxed">
      {{ hint }}
    </p>
    <slot name="extra" />
  </div>
</template>
