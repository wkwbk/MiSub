<script setup>
import TransformCard from '@/components/settings/sections/ServiceSettings/TransformCard.vue';
import DnsOverrideCard from '@/components/settings/sections/ServiceSettings/DnsOverrideCard.vue';

defineProps({
  settings: {
    type: Object,
    required: true,
  },
});
</script>

<template>
  <div class="space-y-4">
    <TransformCard :settings="settings" />
    <DnsOverrideCard :settings="settings" />
  </div>
</template>
