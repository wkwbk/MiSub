<script setup>
    import { computed } from 'vue';
    import { Search, LayoutGrid, List } from 'lucide-vue-next';
    import MoreActionsMenu from '@/components/shared/MoreActionsMenu.vue';
    import { useI18n } from '@/i18n/index.js';
    import { DEFAULT_GROUP_KEY } from '@/composables/manual-nodes/groups.js';

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
        activeGroupFilter: {
            type: String,
            default: null,
        },
        manualNodeGroups: {
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
        'set-group-filter',
        'add',
        'import',
        'auto-sort',
        'deduplicate',
        'toggle-sort',
        'delete-all',
        'toggle-selection-mode',
        'ping-all',
        'sort-by-latency',
        'manage-groups',
    ]);

    const searchModel = computed({
        get: () => props.searchTerm,
        set: (val) => emit('update:searchTerm', val),
    });
</script>

<template>
    <div
        class="mb-4 min-w-0 rounded-md border border-zinc-800 bg-[#171717] p-4 shadow-none"
    >
        <div class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex min-w-0 flex-wrap items-center gap-3">
                <h2 class="text-lg font-semibold text-zinc-100">
                    {{ t('manualNodes.title') }}
                </h2>
                <span
                    class="rounded-md border border-zinc-800 bg-transparent px-2 py-0.5 text-xs font-mono font-medium text-zinc-300"
                    >{{ manualNodesCount }}</span
                >

                <!-- Mobile Group Filter -->
                <div
                    data-testid="manual-node-mobile-groups"
                    class="flex w-full min-w-0 items-center gap-1.5 overflow-x-auto py-1 no-scrollbar md:hidden"
                >
                    <button
                        @click="emit('set-group-filter', null)"
                        class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap"
                        :class="
                            !activeGroupFilter
                                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                                : 'bg-transparent text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900'
                        "
                    >
                        {{ t('manualNodes.allGroups') }}
                    </button>
                    <button
                        @click="emit('set-group-filter', DEFAULT_GROUP_KEY)"
                        class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap"
                        :class="
                            activeGroupFilter === DEFAULT_GROUP_KEY
                                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                                : 'bg-transparent text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900'
                        "
                    >
                        {{ t('manualNodes.ungrouped') }}
                    </button>
                    <button
                        v-for="group in manualNodeGroups"
                        :key="group"
                        @click="
                            emit('set-group-filter', activeGroupFilter === group ? null : group)
                        "
                        class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap"
                        :class="
                            activeGroupFilter === group
                                ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                                : 'bg-transparent text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900'
                        "
                    >
                        {{ group }}
                    </button>
                </div>

                <span
                    v-if="searchTerm"
                    class="mt-2 w-full rounded-md border border-zinc-800 bg-transparent px-2.5 py-0.5 text-xs font-mono text-zinc-300 sm:mt-0 sm:w-auto"
                >
                    {{
                        t('manualNodes.searchResult', {
                            keyword: searchTerm,
                            filtered: filteredNodesCount,
                            total: manualNodesCount,
                        })
                    }}
                </span>
            </div>
            <div
                data-testid="manual-node-toolbar-actions"
                class="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap"
            >
                <div
                    data-testid="manual-node-search"
                    class="relative min-w-0 grow basis-full sm:basis-auto lg:min-w-[240px]"
                >
                    <input
                        type="text"
                        v-model="searchModel"
                        :placeholder="t('manualNodes.searchPlaceholder')"
                        class="w-full rounded-md border border-zinc-800 bg-transparent py-1.5 pl-9 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus-visible:outline-none"
                        :aria-label="t('manualNodes.searchLabel')"
                    />
                    <Search
                        class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500"
                    />
                </div>
                <div
                    class="p-0.5 bg-transparent border border-zinc-800 rounded-md flex items-center shrink-0"
                >
                    <button
                        @click="emit('update:viewMode', 'card')"
                        class="view-mode-toggle p-1 rounded-sm transition-colors flex items-center justify-center touch-target"
                        :class="
                            viewMode === 'card'
                                ? 'bg-zinc-100 text-zinc-900'
                                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
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
                                ? 'bg-zinc-100 text-zinc-900'
                                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                        "
                        :aria-label="t('common.listView')"
                    >
                        <List class="h-4 w-4" />
                    </button>
                </div>
                <button
                    @click="emit('ping-all')"
                    class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                >
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    {{ t('actions.pingAll') }}
                </button>
                <button
                    @click="emit('add')"
                    class="shrink-0 rounded-md bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-white border border-zinc-100"
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
                            class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 font-medium transition-colors"
                            :class="isSelectionMode ? 'text-zinc-100 font-semibold' : ''"
                        >
                            {{
                                isSelectionMode ? t('actions.exitBatch') : t('actions.bulkActions')
                            }}
                        </button>
                        <div class="my-1 border-t border-zinc-200 dark:border-white/10"></div>
                        <button
                            @click="
                                emit('import');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                        >
                            {{ t('actions.importSubscription') }}
                        </button>
                        <button
                            @click="
                                emit('manage-groups');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                        >
                            {{ t('actions.manageGroups') }}
                        </button>
                        <button
                            @click="
                                emit('auto-sort');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                        >
                            {{ t('actions.autoSort') }}
                        </button>
                        <button
                            @click="
                                emit('sort-by-latency');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                        >
                            {{ t('actions.sortByLatency') }}
                        </button>
                        <button
                            @click="
                                emit('deduplicate');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                        >
                            {{ t('actions.deduplicate') }}
                        </button>
                        <button
                            @click="
                                emit('toggle-sort');
                                close();
                            "
                            class="w-full text-left px-3 py-2 rounded text-xs transition-colors text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                        >
                            {{ isSorting ? t('actions.finishSort') : t('actions.manualSort') }}
                        </button>
                        <div class="my-1 border-t border-zinc-200 dark:border-white/10"></div>
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

        <!-- Group Filter Chips (New Line) -->
        <div
            class="hidden md:flex items-center gap-1.5 mt-3 pt-3 border-t border-zinc-800 overflow-x-auto no-scrollbar mask-gradient-r pb-1"
        >
            <button
                @click="emit('set-group-filter', null)"
                class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors border shrink-0"
                :class="
                    !activeGroupFilter
                        ? 'bg-zinc-100 border-zinc-100 text-zinc-900 font-semibold'
                        : 'bg-transparent border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                "
            >
                {{ t('manualNodes.allGroups') }}
            </button>
            <button
                @click="emit('set-group-filter', DEFAULT_GROUP_KEY)"
                class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors border shrink-0"
                :class="
                    activeGroupFilter === DEFAULT_GROUP_KEY
                        ? 'bg-zinc-100 border-zinc-100 text-zinc-900 font-semibold'
                        : 'bg-transparent border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                "
            >
                {{ t('manualNodes.ungrouped') }}
            </button>
            <button
                v-for="group in manualNodeGroups"
                :key="group"
                @click="emit('set-group-filter', activeGroupFilter === group ? null : group)"
                class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors border shrink-0"
                :class="
                    activeGroupFilter === group
                        ? 'bg-zinc-100 border-zinc-100 text-zinc-900 font-semibold'
                        : 'bg-transparent border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                "
            >
                {{ group }}
            </button>
        </div>
    </div>
</template>
