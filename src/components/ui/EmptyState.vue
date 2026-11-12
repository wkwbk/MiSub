<script setup>
    import { computed } from 'vue';
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

    const iconPaths = {
        search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
        folder: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
        node: 'M13 10V3L4 14h7v7l9-11h-7z',
        default:
            'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4',
    };
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
            <svg
                class="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    :d="iconPaths[icon] || iconPaths.default"
                />
            </svg>
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
                <svg
                    class="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                </svg>
                {{ t('common.resetFilters') }}
            </button>

            <button
                v-else
                @click="emit('refresh')"
                class="inline-flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white focus-visible:outline-none"
                :aria-label="t('common.refreshListAria')"
            >
                <svg
                    class="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                </svg>
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
