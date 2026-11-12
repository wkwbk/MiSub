<script setup>
    import { computed } from 'vue';
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        stats: {
            type: Object,
            required: true,
            default: () => ({ totalSubscriptions: 0, enabledSubscriptions: 0, totalNodes: 0 }),
        },
    });

    const statsData = computed(() => [
        {
            name: t('dashboard.totalSubscriptions'),
            value: props.stats.totalSubscriptions,
            dotClass: 'bg-zinc-400',
        },
        {
            name: t('dashboard.enabled'),
            value: props.stats.enabledSubscriptions,
            dotClass: 'bg-emerald-500',
        },
        {
            name: t('dashboard.totalNodes'),
            value: props.stats.totalNodes,
            dotClass: 'bg-sky-500',
        },
    ]);
</script>

<template>
    <div
        class="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800 border border-zinc-800 rounded-md bg-[#0c0c0e] overflow-hidden"
    >
        <div
            v-for="stat in statsData"
            :key="stat.name"
            class="bg-transparent hover:bg-zinc-900/60 p-5 rounded-none shadow-none transition-colors"
        >
            <p class="text-xs font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <span class="h-1.5 w-1.5 rounded-full shrink-0" :class="stat.dotClass"></span>
                {{ stat.name }}
            </p>
            <p class="mt-2 text-2xl font-semibold text-zinc-100 font-mono">{{ stat.value }}</p>
        </div>
    </div>
</template>
