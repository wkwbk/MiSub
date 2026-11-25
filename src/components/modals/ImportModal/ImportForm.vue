<script setup lang="ts">
import { useI18n } from '@/i18n/index.js';
import { computed } from 'vue';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    subscriptionUrl?: string;
    isLoading?: boolean;
  }>(),
  {
    subscriptionUrl: '',
    isLoading: false,
  },
);

const emit = defineEmits<{
  'update:subscriptionUrl': [value: string];
  submit: [];
}>();

const urlModel = computed({
  get: () => props.subscriptionUrl,
  set: (val: string) => emit('update:subscriptionUrl', val),
});
</script>

<template>
  <div>
    <label class="block text-xs font-medium text-fg-muted mb-2" for="subscription-url">
      {{ t('importNodes.subscriptionUrl') }}
    </label>
    <input
      id="subscription-url"
      v-model="urlModel"
      :disabled="isLoading"
      class="w-full px-3 py-2 text-sm font-mono border border-line rounded-md bg-inset text-fg focus-visible:outline-hidden focus:border-line-strong disabled:opacity-50"
      placeholder="https://example.com/subscription-link"
      type="url"
      @keyup.enter="emit('submit')"
    />
  </div>

  <div class="text-xs text-fg-subtle">
    <p>{{ t('importNodes.importHint') }}</p>
  </div>
</template>
