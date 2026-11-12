<script setup>
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();

    defineProps({
        formattedTotalRemainingTraffic: {
            type: String,
            default: '0 B',
        },
    });

    defineEmits(['openLog', 'openBulkImport']);
</script>

<template>
    <div
        class="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 bg-[#171717] border border-zinc-800 rounded-md p-4 sm:p-5 shadow-none"
    >
        <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-xl sm:text-2xl font-semibold text-zinc-100 tracking-tight">
                {{ t('nav.dashboard') }}
            </h1>
            <span
                v-if="formattedTotalRemainingTraffic !== '0 B'"
                class="inline-flex items-center gap-2 px-3 py-1 text-xs font-mono font-medium text-zinc-300 bg-transparent rounded-md border border-zinc-800"
            >
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                {{
                    t('dashboard.totalRemainingTraffic', {
                        traffic: formattedTotalRemainingTraffic,
                    })
                }}
            </span>
        </div>
        <div class="flex items-center gap-2.5 w-full md:w-auto">
            <button
                @click="$emit('openLog')"
                class="flex-1 md:flex-none px-4 py-2 rounded-md text-xs sm:text-sm font-medium text-zinc-200 bg-transparent hover:bg-zinc-900 hover:text-zinc-100 border border-zinc-800 transition-colors shadow-none"
            >
                {{ t('actions.viewLog') }}
            </button>
            <button
                @click="$emit('openBulkImport')"
                class="flex-1 md:flex-none px-4 py-2 rounded-md text-xs sm:text-sm font-semibold text-zinc-900 bg-zinc-100 hover:bg-white border border-zinc-100 transition-colors shadow-none"
            >
                {{ t('actions.bulkImport') }}
            </button>
        </div>
        <p class="text-xs text-zinc-400 mt-2 md:mt-0 md:ml-auto">
            {{ t('dashboard.dashboardHint') }}
        </p>
    </div>
</template>
