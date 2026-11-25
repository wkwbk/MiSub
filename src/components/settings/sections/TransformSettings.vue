<script setup lang="ts">
import TransformCard from '@/components/settings/sections/ServiceSettings/TransformCard.vue';
import DnsOverrideCard from '@/components/settings/sections/ServiceSettings/DnsOverrideCard.vue';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

defineProps<{
  settings: AppSettingsConfig;
}>();
</script>

<template>
  <div class="space-y-4">
    <TransformCard :settings="settings" />
    <DnsOverrideCard :settings="settings" />
  </div>
</template>
