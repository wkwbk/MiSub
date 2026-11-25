<script setup lang="ts">
import { computed } from 'vue';
import ShortLinkCard from '@/components/settings/sections/ServiceSettings/ShortLinkCard.vue';
import TurnstileCard from '@/components/settings/sections/ServiceSettings/TurnstileCard.vue';
import TelegramCard from '@/components/settings/sections/ServiceSettings/TelegramCard.vue';
import CronCard from '@/components/settings/sections/ServiceSettings/CronCard.vue';
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
    <ShortLinkCard v-model:settings="settingsModel" />
    <TurnstileCard v-model:settings="settingsModel" />
    <TelegramCard v-model:settings="settingsModel" />
    <CronCard v-model:settings="settingsModel" />
  </div>
</template>
