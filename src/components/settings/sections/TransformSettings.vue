<script setup lang="ts">
import { computed } from 'vue';
import TransformCard from '@/components/settings/sections/ServiceSettings/TransformCard.vue';
import DnsOverrideCard from '@/components/settings/sections/ServiceSettings/DnsOverrideCard.vue';
import MultiSocksCard from '@/components/settings/sections/ServiceSettings/MultiSocksCard.vue';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

const settingsModel = computed<AppSettingsConfig>({
  get: () => props.settings,
  set: (value: AppSettingsConfig) => emit('update:settings', value),
});
</script>

<template>
  <div class="space-y-4">
    <TransformCard v-model:settings="settingsModel" />
    <MultiSocksCard v-model:settings="settingsModel" />
    <DnsOverrideCard v-model:settings="settingsModel" />
  </div>
</template>
