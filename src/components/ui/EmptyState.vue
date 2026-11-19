<script setup>
    import { computed } from 'vue';
    import { Folder, Inbox, RefreshCw, Search, Zap } from '@lucide/vue';
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
            class="mb-5 flex h-10 w-10 items-center justify-center rounded-md border border-line bg-transparent text-fg-muted"
        >
            <component :is="currentIcon" class="h-5 w-5" stroke-width="1.5" aria-hidden="true" />
        </div>

        <div class="mb-6 max-w-sm space-y-1.5">
            <h3 class="text-base font-semibold text-fg">
                {{ displayTitle }}
            </h3>
            <p class="text-xs leading-relaxed text-fg-muted">
                {{ displayDescription }}
            </p>
        </div>

        <div class="flex flex-col items-center gap-2.5 sm:flex-row">
            <button
                v-if="showResetButton"
                @click="emit('reset')"
                class="inline-flex items-center gap-2 rounded-md border border-line bg-transparent px-4 py-2 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg focus-visible:outline-none"
                :aria-label="t('common.resetFiltersAria')"
            >
                <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
                {{ t('common.resetFilters') }}
            </button>

            <button
                v-else
                @click="emit('refresh')"
                class="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90 focus-visible:outline-none"
                :aria-label="t('common.refreshListAria')"
            >
                <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
                {{ t('common.refreshList') }}
            </button>
        </div>

        <div
            v-if="totalCount > 0"
            class="mt-6 rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-mono text-fg-muted"
        >
            <p>
                {{ t('common.filteredSummary', { total: totalCount, filtered: filteredCount }) }}
            </p>
        </div>
    </div>
</template>
