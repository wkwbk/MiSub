<script setup>
    import { computed } from 'vue';
    import { Search, Folder, Zap, Inbox, RefreshCw } from 'lucide-vue-next';
    import { useI18n } from '@/i18n/index.js';

    const props = defineProps({
        filteredCount: {
            type: Number,
            default: 0,
        },
        totalCount: {
            type: Number,
            default: 0,
        },
        title: {
            type: String,
            default: '',
        },
        description: {
            type: String,
            default: '',
        },
        icon: {
            type: String,
            default: 'search',
        },
    });

    const emit = defineEmits(['reset', 'refresh']);
    const { t } = useI18n();

    const displayTitle = computed(() => {
        if (props.title) return props.title;
        if (props.totalCount === 0) {
            return t('common.emptyNoData');
        } else if (props.filteredCount === 0) {
            return t('common.emptyNoResults');
        }
        return t('common.emptyNoContent');
    });

    const displayDescription = computed(() => {
        if (props.description) return props.description;
        if (props.totalCount === 0) {
            return t('common.emptyNoDataDesc');
        } else if (props.filteredCount === 0) {
            return t('common.emptyNoResultsDesc');
        }
        return t('common.emptyNoContentDesc');
    });

    const showResetButton = computed(() => {
        return props.totalCount > 0 && props.filteredCount === 0;
    });

    const iconComponents = {
        search: Search,
        folder: Folder,
        node: Zap,
        default: Inbox,
    };

    const currentIcon = computed(() => iconComponents[props.icon] || iconComponents.default);
</script>

<template>
    <div
        class="flex flex-col items-center justify-center px-6 py-10 text-center"
        role="status"
        aria-live="polite"
    >
        <div
            class="mb-5 flex h-10 w-10 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-400"
        >
            <component :is="currentIcon" class="h-5 w-5" stroke-width="1.5" aria-hidden="true" />
        </div>

        <div class="mb-6 max-w-sm space-y-1.5">
            <h3 class="text-base font-semibold text-zinc-100">
                {{ displayTitle }}
            </h3>
            <p class="text-xs leading-relaxed text-zinc-400">
                {{ displayDescription }}
            </p>
        </div>

        <div class="flex flex-col items-center gap-2.5 sm:flex-row">
            <button
                v-if="showResetButton"
                @click="emit('reset')"
                class="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-transparent px-4 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-none"
                :aria-label="t('common.resetFiltersAria')"
            >
                <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
                {{ t('common.resetFilters') }}
            </button>

            <button
                v-else
                @click="emit('refresh')"
                class="inline-flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white focus-visible:outline-none"
                :aria-label="t('common.refreshListAria')"
            >
                <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
                {{ t('common.refreshList') }}
            </button>
        </div>

        <div
            v-if="totalCount > 0"
            class="mt-6 rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-mono text-zinc-400"
        >
            <p>
                {{ t('common.filteredSummary', { total: totalCount, filtered: filteredCount }) }}
            </p>
        </div>
    </div>
</template>
