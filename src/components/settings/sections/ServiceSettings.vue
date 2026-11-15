<script setup>
    import TransformCard from '@/components/settings/sections/ServiceSettings/TransformCard.vue';
    import DnsOverrideCard from '@/components/settings/sections/ServiceSettings/DnsOverrideCard.vue';
    import TelegramCard from '@/components/settings/sections/ServiceSettings/TelegramCard.vue';
    import CronCard from '@/components/settings/sections/ServiceSettings/CronCard.vue';

    defineProps({
        settings: {
            type: Object,
            required: true,
        },
    });
</script>

<template>
    <div class="space-y-6">
        <TransformCard :settings="settings" />
        <DnsOverrideCard :settings="settings" />
        <TelegramCard :settings="settings" />
        <CronCard :settings="settings" />
    </div>
</template>
