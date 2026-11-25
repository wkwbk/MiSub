<script setup lang="ts">
import ShortLinkCard from '@/components/settings/sections/ServiceSettings/ShortLinkCard.vue';
import TurnstileCard from '@/components/settings/sections/ServiceSettings/TurnstileCard.vue';
import TelegramCard from '@/components/settings/sections/ServiceSettings/TelegramCard.vue';
import CronCard from '@/components/settings/sections/ServiceSettings/CronCard.vue';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

defineProps<{
  settings: AppSettingsConfig;
}>();
</script>

<template>
  <div class="space-y-4">
    <ShortLinkCard :settings="settings" />
    <TurnstileCard :settings="settings" />
    <TelegramCard :settings="settings" />
    <CronCard :settings="settings" />
  </div>
</template>
