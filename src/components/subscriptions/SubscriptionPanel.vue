<script setup>
    import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
    import { Search, X } from '@lucide/vue';
    import draggable from 'vuedraggable';
    import Card from '@/components/ui/Card.vue';
    import MoreActionsMenu from '@/components/shared/MoreActionsMenu.vue';
    import SortingBanner from '@/components/shared/SortingBanner.vue';
    import TagFilterBar from '@/components/shared/TagFilterBar.vue';
    import EmptyState from '@/components/ui/EmptyState.vue';
    import { useI18n } from '@/i18n/index.js';
    import { hasDragOrderChanged } from '@/composables/useSortingMode.js';
    import {
        collectTags,
        getItemTags,
        matchesTagFilter,
        normalizeActiveTagFilters,
        toggleTagFilterValue,
    } from '@/utils/tags.js';

    const { t } = useI18n();

    const props = defineProps({
        subscriptions: { type: Array, default: () => [] },
        tags: { type: Array, default: undefined },
        activeTagFilters: { type: Array, default: undefined },
        batchSize: { type: Number, default: 12 },
        isSorting: Boolean,
        searchable: { type: Boolean, default: false },
        searchQuery: { type: String, default: '' },
        filteredCount: { type: Number, default: undefined },
        isRefreshing: { type: Boolean, default: false },
        refreshError: { type: Boolean, default: false },
        lastRefreshAt: { type: [String, Number, Date], default: null },
        statusFilter: { type: String, default: '' },
        statusFilterLabel: { type: String, default: '' },
    });

    const emit = defineEmits([
        'add',
        'delete',
        'updateNodeCount',
        'edit',
        'toggleSort',
        'markDirty',
        'preview',
        'deleteAll',
        'refreshAll',
        'reorder',
        'import',
        'qrcode',
        'updateSearch',
        'applyDetectedName',
        'clearStatusFilter',
        'set-tag-filters',
        'manage-tags',
    ]);

    const searchModel = computed({
        get: () => props.searchQuery,
        set: (value) => emit('updateSearch', value),
    });

    const localTagFilters = ref([]);
    const currentTagFilters = computed(() =>
        props.activeTagFilters !== undefined
            ? normalizeActiveTagFilters(props.activeTagFilters)
            : localTagFilters.value
    );

    const setTagFilters = (filters) => {
        const next = normalizeActiveTagFilters(filters);
        localTagFilters.value = next;
        emit('set-tag-filters', next);
    };

    const toggleTag = (tag) => {
        const next = toggleTagFilterValue(currentTagFilters.value, tag);
        setTagFilters(next);
    };

    const availableTags = computed(() =>
        Array.isArray(props.tags) ? props.tags : collectTags(props.subscriptions)
    );

    const matchedSubscriptions = computed(() => {
        let list = (props.subscriptions || []).filter((sub) =>
            matchesTagFilter(sub, currentTagFilters.value)
        );

        const query = String(props.searchQuery || '')
            .trim()
            .toLowerCase();
        if (!query) return list;

        return list.filter((sub) =>
            [
                sub.name,
                sub.description,
                sub.remark,
                sub.note,
                sub.notes,
                sub.website,
                sub.url,
                sub.customId,
                ...getItemTags(sub),
            ].some((value) =>
                String(value || '')
                    .toLowerCase()
                    .includes(query)
            )
        );
    });

    const visibleCount = computed(() => {
        if (props.filteredCount !== undefined && currentTagFilters.value.length === 0) {
            return props.filteredCount;
        }
        return matchedSubscriptions.value.length;
    });

    const refreshTime = computed(() => {
        if (!props.lastRefreshAt) return '';
        const date = new Date(props.lastRefreshAt);
        return Number.isNaN(date.getTime())
            ? ''
            : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    const draggableSubscriptions = computed({
        get: () => [...matchedSubscriptions.value],
        set: (val) => emit('reorder', val),
    });

    const handleDelete = (id) => emit('delete', id);
    const handleEdit = (id) => emit('edit', id);
    const handleUpdate = (id) => emit('updateNodeCount', id);
    const handlePreview = (id) => emit('preview', id);
    const handleQRCode = (id) => emit('qrcode', id);
    const handleAdd = () => emit('add');
    const handleToggleSort = () => emit('toggleSort');
    const handleSortEnd = () => emit('markDirty');
    const handleDragEnd = (evt) => {
        if (hasDragOrderChanged(evt)) {
            handleSortEnd();
        }
    };
    const handleDeleteAll = () => emit('deleteAll');
    const handleRefreshAll = () => emit('refreshAll');
    const handleImport = () => emit('import');
    const handleApplyDetectedName = (subscription, name) => {
        emit('applyDetectedName', subscription?.id, name);
    };

    const refreshingCount = computed(
        () => props.subscriptions.filter((sub) => sub.isUpdating).length
    );

    const normalizedBatchSize = computed(() => Math.max(1, Number(props.batchSize) || 12));
    const visibleLimit = ref(normalizedBatchSize.value);

    const visibleSubscriptions = computed(() =>
        matchedSubscriptions.value.slice(0, visibleLimit.value)
    );

    const remainingCount = computed(() =>
        Math.max(0, matchedSubscriptions.value.length - visibleSubscriptions.value.length)
    );
    const hasMore = computed(() => remainingCount.value > 0);

    const loadMore = () => {
        if (!hasMore.value) return;
        visibleLimit.value += normalizedBatchSize.value;
    };

    watch(
        [
            () => props.searchQuery,
            () => props.statusFilter,
            currentTagFilters,
            normalizedBatchSize,
        ],
        () => {
            visibleLimit.value = normalizedBatchSize.value;
        }
    );

    const loadMoreSentinelRef = ref(null);
    let loadMoreObserver = null;

    const disconnectLoadMoreObserver = () => {
        if (loadMoreObserver) {
            loadMoreObserver.disconnect();
            loadMoreObserver = null;
        }
    };

    const setupLoadMoreObserver = () => {
        disconnectLoadMoreObserver();
        if (typeof IntersectionObserver === 'undefined' || !loadMoreSentinelRef.value) return;

        loadMoreObserver = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    loadMore();
                }
            },
            { rootMargin: '200px 0px' }
        );
        loadMoreObserver.observe(loadMoreSentinelRef.value);
    };

    watch(
        [loadMoreSentinelRef, hasMore, () => props.isSorting],
        async () => {
            await nextTick();
            if (!props.isSorting && hasMore.value && loadMoreSentinelRef.value) {
                setupLoadMoreObserver();
            } else {
                disconnectLoadMoreObserver();
            }
        },
        { immediate: true }
    );

    onBeforeUnmount(() => {
        disconnectLoadMoreObserver();
    });
</script>

<template>
    <div>
        <div class="mb-4 min-w-0 rounded-md border border-zinc-800 bg-[#171717] p-4 shadow-none">
            <div class="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div class="min-w-0">
                    <div class="flex min-w-0 flex-wrap items-center gap-3 shrink-0">
                        <h2 class="text-lg font-semibold text-zinc-100">
                            {{ t('subscriptions.title') }}
                        </h2>
                        <span
                            class="rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-xs font-mono font-medium text-zinc-300"
                            >{{ visibleCount }}/{{ subscriptions.length }}</span
                        >
                        <span
                            v-if="isRefreshing || refreshError || refreshTime"
                            data-testid="subscriptions-refresh-status"
                            aria-live="polite"
                            class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-mono whitespace-nowrap"
                            :class="
                                refreshError
                                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                                    : isRefreshing
                                      ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-400'
                            "
                        >
                            <span
                                v-if="isRefreshing"
                                class="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse"
                                aria-hidden="true"
                            ></span>
                            <span v-if="isRefreshing">{{
                                t('subscriptions.refreshing', { count: refreshingCount })
                            }}</span>
                            <span v-else-if="refreshError">{{
                                t('subscriptions.refreshFailedShort')
                            }}</span>
                            <span v-else-if="refreshTime">{{
                                t('subscriptions.lastRefreshed', { time: refreshTime })
                            }}</span>
                        </span>
                    </div>
                    <p class="mt-1 text-xs text-zinc-400">
                        {{ t('subscriptions.subtitle') }}
                    </p>
                </div>
                <div
                    class="flex flex-wrap items-center gap-2 sm:w-auto justify-end sm:justify-start"
                >
                    <button
                        @click="handleImport"
                        class="shrink-0 rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                    >
                        {{ t('actions.bulkImport') }}
                    </button>
                    <button
                        @click="handleAdd"
                        class="shrink-0 rounded-md bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white border border-zinc-100"
                    >
                        {{ t('actions.add') }}
                    </button>
                    <MoreActionsMenu menu-width-class="w-36">
                        <template #menu="{ close }">
                            <button
                                :disabled="isRefreshing"
                                @click="
                                    handleRefreshAll();
                                    close?.();
                                "
                                class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {{ t('actions.refreshAll') }}
                            </button>
                            <button
                                @click="
                                    handleToggleSort();
                                    close?.();
                                "
                                class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                            >
                                {{ isSorting ? t('actions.finishSort') : t('actions.manualSort') }}
                            </button>
                            <button
                                v-if="availableTags.length > 0"
                                type="button"
                                data-testid="manage-subscription-tags"
                                @click="
                                    emit('manage-tags');
                                    close?.();
                                "
                                class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                            >
                                {{ t('actions.manageTags') }}
                            </button>
                            <div class="my-1 border-t border-zinc-800"></div>
                            <button
                                @click="
                                    handleDeleteAll();
                                    close?.();
                                "
                                class="w-full text-left px-3 py-2 rounded text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                            >
                                {{ t('actions.clearAll') }}
                            </button>
                        </template>
                    </MoreActionsMenu>
                </div>
            </div>
            <div v-if="searchable" class="mt-4 relative">
                <Search
                    class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                    aria-hidden="true"
                />
                <input
                    v-model="searchModel"
                    data-testid="subscription-search"
                    type="text"
                    :placeholder="t('subscriptions.listSearchPlaceholder')"
                    :aria-label="t('subscriptions.searchPlaceholder')"
                    :disabled="isSorting"
                    class="w-full rounded-md border border-zinc-800 bg-transparent py-2 pl-9 pr-24 text-xs text-zinc-100 outline-none transition focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-zinc-500"
                />
                <div
                    v-if="searchQuery"
                    class="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5"
                >
                    <span class="pointer-events-none text-xs font-mono text-zinc-400">
                        {{ visibleCount }}/{{ subscriptions.length }}
                    </span>
                    <button
                        data-testid="clear-subscription-search"
                        type="button"
                        :aria-label="t('actions.clearSearch')"
                        class="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
                        @click="searchModel = ''"
                    >
                        <X class="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                </div>
            </div>

            <!-- Tag Filter Bar (Multi-select Intersection) -->
            <div v-if="availableTags.length > 0 || currentTagFilters.length > 0" class="mt-3">
                <TagFilterBar
                    :tags="availableTags"
                    :active-filters="currentTagFilters"
                    test-id-prefix="subscription-tag"
                    @update:active-filters="setTagFilters"
                />
            </div>

            <div
                v-if="statusFilter"
                data-testid="subscription-status-filter-banner"
                class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-700/80 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-200"
            >
                <div class="flex items-center gap-2">
                    <span class="font-medium">{{ statusFilterLabel }}</span>
                    <span class="font-mono text-zinc-400"
                        >{{ visibleCount }}/{{ subscriptions.length }}</span
                    >
                </div>
                <button
                    type="button"
                    data-testid="clear-subscription-status-filter"
                    class="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white cursor-pointer"
                    @click="emit('clearStatusFilter')"
                >
                    {{ t('subscriptions.clearStatusFilter') }}
                </button>
            </div>
        </div>
        <div v-if="matchedSubscriptions.length > 0 && isSorting">
            <SortingBanner
                :hint="t('subscriptions.sortingHint')"
                banner-test-id="subscription-sorting-banner"
                button-test-id="subscription-finish-sort"
                @finish="handleToggleSort"
            />
            <draggable
                v-model="draggableSubscriptions"
                tag="div"
                class="grid grid-cols-1 md:grid-cols-2 gap-4"
                :item-key="(item) => item.id"
                animation="300"
                @end="handleDragEnd"
            >
                <template #item="{ element: subscription }">
                    <div class="cursor-move rounded-md border-2 border-dashed border-sky-500/40">
                        <Card
                            class="pointer-events-none select-none"
                            :misub="subscription"
                            @delete="handleDelete(subscription.id)"
                            @change="handleSortEnd"
                            @update="handleUpdate(subscription.id)"
                            @edit="handleEdit(subscription.id)"
                            @preview="handlePreview(subscription.id)"
                            @qrcode="handleQRCode(subscription.id)"
                            @filter-tag="toggleTag"
                            @applyDetectedName="
                                (name) => handleApplyDetectedName(subscription, name)
                            "
                        />
                    </div>
                </template>
            </draggable>
        </div>
        <div v-else-if="matchedSubscriptions.length > 0" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                    v-for="(subscription, index) in visibleSubscriptions"
                    :key="subscription.id"
                    class="list-item-animation"
                    :style="{ '--delay-index': index }"
                >
                    <Card
                        :misub="subscription"
                        @delete="handleDelete(subscription.id)"
                        @change="handleSortEnd"
                        @update="handleUpdate(subscription.id)"
                        @edit="handleEdit(subscription.id)"
                        @preview="handlePreview(subscription.id)"
                        @qrcode="handleQRCode(subscription.id)"
                        @filter-tag="toggleTag"
                        @applyDetectedName="(name) => handleApplyDetectedName(subscription, name)"
                    />
                </div>
            </div>
        </div>
        <div
            v-else-if="
                subscriptions.length > 0 &&
                (searchQuery || currentTagFilters.length > 0) &&
                visibleCount === 0
            "
            data-testid="subscription-no-search-results"
            class="rounded-md border border-zinc-800 bg-[#171717] px-6 py-12 text-center"
        >
            <p class="text-sm font-medium text-zinc-200">
                {{ t('subscriptions.noSearchResults') }}
            </p>
            <div class="mt-3 flex items-center justify-center gap-2">
                <button
                    v-if="searchQuery"
                    data-testid="clear-subscription-search"
                    type="button"
                    class="inline-flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white cursor-pointer"
                    @click="searchModel = ''"
                >
                    {{ t('actions.clearSearch') }}
                </button>
                <button
                    v-if="currentTagFilters.length > 0"
                    data-testid="clear-subscription-tag-filter"
                    type="button"
                    class="inline-flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white cursor-pointer"
                    @click="setTagFilters([])"
                >
                    {{ t('tags.clearFilter') }}
                </button>
            </div>
        </div>
        <div
            v-else-if="subscriptions.length === 0"
            class="rounded-md border border-zinc-800 bg-[#171717] py-2"
        >
            <EmptyState
                :title="t('subscriptions.empty')"
                :description="t('subscriptions.emptyDesc')"
                icon="folder"
                :total-count="0"
            />
        </div>
        <div
            v-if="!isSorting && hasMore"
            ref="loadMoreSentinelRef"
            data-testid="subscription-load-more-sentinel"
            class="mt-4 flex justify-center"
        >
            <button
                type="button"
                data-testid="subscription-load-more-btn"
                class="rounded-md border border-zinc-800 bg-[#171717] px-4 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100 cursor-pointer"
                @click="loadMore"
            >
                {{ t('subscriptions.loadMoreRemaining', { count: remainingCount }) }}
            </button>
        </div>
    </div>
</template>
