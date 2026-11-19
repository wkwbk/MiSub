<script setup>
    import { computed } from 'vue';
    import { LayoutGrid, List, Search, X } from '@lucide/vue';
    import MoreActionsMenu from '@/components/shared/MoreActionsMenu.vue';
    import TagFilterBar from '@/components/shared/TagFilterBar.vue';
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        manualNodesCount: {
            type: Number,
            default: 0,
        },
        filteredNodesCount: {
            type: Number,
            default: 0,
        },
        searchTerm: {
            type: String,
            default: '',
        },
        activeTagFilters: {
            type: Array,
            default: () => [],
        },
        manualNodeTags: {
            type: Array,
            default: () => [],
        },
        viewMode: {
            type: String,
            default: 'card',
        },
        isSorting: {
            type: Boolean,
            default: false,
        },
        isSelectionMode: {
            type: Boolean,
            default: false,
        },
    });

    const emit = defineEmits([
        'update:searchTerm',
        'update:viewMode',
        'set-tag-filters',
        'add',
        'import',
        'auto-sort',
        'deduplicate',
        'toggle-sort',
        'delete-all',
        'toggle-selection-mode',
        'ping-all',
        'sort-by-latency',
        'manage-tags',
    ]);

    const searchModel = computed({
        get: () => props.searchTerm,
        set: (val) => emit('update:searchTerm', val),
    });
</script>

<template>
    <div class="mb-4 min-w-0 rounded-md border border-line bg-surface p-4 shadow-none">
        <div class="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0 flex-1">
                <div class="flex min-w-0 flex-wrap items-center gap-3">
                    <h2 class="text-lg font-semibold text-fg">
                        {{ t('manualNodes.title') }}
                    </h2>
                    <span
                        class="rounded-md border border-line bg-transparent px-2 py-0.5 text-xs font-mono font-medium text-fg-muted"
                        >{{ manualNodesCount }}</span
                    >
                </div>
                <p class="mt-1 text-xs text-fg-muted">
                    {{ t('manualNodes.subtitle') }}
                </p>

                <!-- Mobile Tag Filter -->
                <div
                    v-if="manualNodeTags.length > 0 || activeTagFilters.length > 0"
                    data-testid="manual-node-mobile-tags"
                    class="mt-2 flex w-full min-w-0 items-center gap-1.5 overflow-x-auto py-1 no-scrollbar md:hidden"
                >
                    <TagFilterBar
                        :tags="manualNodeTags"
                        :active-filters="activeTagFilters"
                        test-id-prefix="manual-node-mobile-tag"
                        @update:active-filters="emit('set-tag-filters', $event)"
                    />
                </div>
            </div>
            <div
                data-testid="manual-node-toolbar-actions"
                class="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap lg:shrink-0"
            >
                <div
                    class="p-0.5 bg-transparent border border-line rounded-md flex items-center shrink-0"
                >
                    <button
                        @click="emit('update:viewMode', 'card')"
                        class="view-mode-toggle p-1 rounded-sm transition-colors flex items-center justify-center touch-target"
                        :class="
                            viewMode === 'card'
                                ? 'bg-accent text-accent-fg'
                                : 'text-fg-muted hover:text-fg hover:bg-hover'
                        "
                        :aria-label="t('common.cardView')"
                    >
                        <LayoutGrid class="h-4 w-4" />
                    </button>
                    <button
                        @click="emit('update:viewMode', 'list')"
                        class="view-mode-toggle p-1 rounded-sm transition-colors flex items-center justify-center touch-target"
                        :class="
                            viewMode === 'list'
                                ? 'bg-accent text-accent-fg'
                                : 'text-fg-muted hover:text-fg hover:bg-hover'
                        "
                        :aria-label="t('common.listView')"
                    >
                        <List class="h-4 w-4" />
                    </button>
                </div>
                <button
                    @click="emit('ping-all')"
                    class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                >
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    {{ t('actions.pingAll') }}
                </button>
                <button
                    @click="emit('add')"
                    class="shrink-0 rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:opacity-90 border border-accent"
                >
                    {{ t('actions.add') }}
                </button>
                <MoreActionsMenu menu-width-class="w-36">
                    <template #menu="{ close }">
                        <button
                            @click="
                                emit('toggle-selection-mode');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg font-medium transition-colors"
                            :class="isSelectionMode ? 'text-fg font-semibold' : ''"
                        >
                            {{
                                isSelectionMode ? t('actions.exitBatch') : t('actions.bulkActions')
                            }}
                        </button>
                        <div class="my-1 border-t border-line"></div>
                        <button
                            @click="
                                emit('import');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                        >
                            {{ t('actions.importSubscription') }}
                        </button>
                        <button
                            v-if="manualNodeTags.length > 0"
                            data-testid="manage-manual-node-tags"
                            @click="
                                emit('manage-tags');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                        >
                            {{ t('actions.manageTags') }}
                        </button>
                        <button
                            @click="
                                emit('auto-sort');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                        >
                            {{ t('actions.autoSort') }}
                        </button>
                        <button
                            @click="
                                emit('sort-by-latency');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                        >
                            {{ t('actions.sortByLatency') }}
                        </button>
                        <button
                            @click="
                                emit('deduplicate');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                        >
                            {{ t('actions.deduplicate') }}
                        </button>
                        <button
                            @click="
                                emit('toggle-sort');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs transition-colors text-fg-muted hover:bg-hover hover:text-fg"
                        >
                            {{ isSorting ? t('actions.finishSort') : t('actions.manualSort') }}
                        </button>
                        <div class="my-1 border-t border-line"></div>
                        <button
                            @click="
                                emit('delete-all');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs text-red-400 hover:bg-red-500/15 hover:text-red-400 transition-colors"
                        >
                            {{ t('actions.clearAll') }}
                        </button>
                    </template>
                </MoreActionsMenu>
            </div>
        </div>

        <div data-testid="manual-node-search" class="relative mt-4">
            <Search
                class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
                aria-hidden="true"
            />
            <input
                v-model="searchModel"
                type="text"
                :placeholder="t('manualNodes.searchPlaceholder')"
                :aria-label="t('manualNodes.searchLabel')"
                :disabled="isSorting"
                class="w-full rounded-md border border-line bg-transparent py-2 pl-9 pr-24 text-xs text-fg outline-none transition focus:border-line-strong disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-fg-subtle"
            />
            <div
                v-if="searchTerm"
                class="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5"
            >
                <span class="pointer-events-none text-xs font-mono text-fg-muted">
                    {{ filteredNodesCount }}/{{ manualNodesCount }}
                </span>
                <button
                    type="button"
                    class="rounded p-0.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg cursor-pointer"
                    :aria-label="t('actions.clearSearch')"
                    @click="searchModel = ''"
                >
                    <X class="h-3.5 w-3.5" />
                </button>
            </div>
        </div>

        <!-- Desktop Tag Filter Chips -->
        <div
            v-if="manualNodeTags.length > 0 || activeTagFilters.length > 0"
            class="hidden md:flex items-center gap-1.5 mt-3"
        >
            <TagFilterBar
                :tags="manualNodeTags"
                :active-filters="activeTagFilters"
                test-id-prefix="manual-node-tag"
                @update:active-filters="emit('set-tag-filters', $event)"
            />
        </div>
    </div>
</template>
