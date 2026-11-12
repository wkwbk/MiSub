<script setup>
    import { computed } from 'vue';
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
        class="mb-4 min-w-0 rounded-md border border-zinc-800 bg-[#0c0c0e] p-4 shadow-none"
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
                    <svg
                        class="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                    </svg>
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
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                            />
                        </svg>
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
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                clip-rule="evenodd"
                            />
                        </svg>
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
                            class="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 font-medium"
                            :class="isSelectionMode ? 'text-zinc-100 font-semibold' : ''"
                        >
                            {{
                                isSelectionMode ? t('actions.exitBatch') : t('actions.bulkActions')
                            }}
                        </button>
                        <div class="border-t border-zinc-800 my-1"></div>
                        <button
                            @click="
                                emit('import');
                                close();
                            "
                            class="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                        >
                            {{ t('actions.importSubscription') }}
                        </button>
                        <button
                            @click="
                                emit('manage-groups');
                                close();
                            "
                            class="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                        >
                            {{ t('actions.manageGroups') }}
                        </button>
                        <button
                            @click="
                                emit('auto-sort');
                                close();
                            "
                            class="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                        >
                            {{ t('actions.autoSort') }}
                        </button>
                        <button
                            @click="
                                emit('sort-by-latency');
                                close();
                            "
                            class="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                        >
                            {{ t('actions.sortByLatency') }}
                        </button>
                        <button
                            @click="
                                emit('deduplicate');
                                close();
                            "
                            class="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                        >
                            {{ t('actions.deduplicate') }}
                        </button>
                        <button
                            @click="
                                emit('toggle-sort');
                                close();
                            "
                            class="w-full text-left px-4 py-2 text-xs transition-colors text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                        >
                            {{ isSorting ? t('actions.finishSort') : t('actions.manualSort') }}
                        </button>
                        <div class="border-t border-zinc-800 my-1"></div>
                        <button
                            @click="
                                emit('delete-all');
                                close();
                            "
                            class="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-950/40"
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
