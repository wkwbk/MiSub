<script setup>
    import { computed } from 'vue';
    import draggable from 'vuedraggable';
    import ManualNodeCard from '../ManualNodeCard.vue';
    import ManualNodeList from '../ManualNodeList.vue';
    import PanelPagination from '@/components/shared/PanelPagination.vue';
    import EmptyState from '@/components/ui/EmptyState.vue';
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        manualNodes: { type: Array, default: () => [] },
        paginatedNodes: { type: Array, default: () => [] },
        filteredNodes: { type: Array, default: () => [] },
        localSearchTerm: { type: String, default: '' },
        isSorting: { type: Boolean, default: false },
        viewMode: { type: String, default: 'card' },
        isSelectionMode: { type: Boolean, default: false },
        selectedNodeIds: { type: Object, required: true },
        searchPage: { type: Number, default: 1 },
        searchTotalPages: { type: Number, default: 1 },
        basePage: { type: Number, default: 1 },
        baseTotalPages: { type: Number, default: 1 },
        draggableManualNodes: { type: Array, default: () => [] },
        itemsPerPage: { type: Number, default: 24 }, // Added
        pingResults: { type: Object, default: () => ({}) },
        pingingNodes: { type: Object, default: () => new Set() },
        compactGrid: { type: Boolean, default: false },
    });

    const emit = defineEmits([
        'update:draggableManualNodes',
        'toggle-select',
        'edit',
        'delete',
        'sort-end',
        'change-page',
        'update:itemsPerPage', // Added
        'set-group-filter', // Added
        'ping',
        'clear-search',
        'toggle-sort',
    ]);

    const draggableModel = computed({
        get: () => props.draggableManualNodes,
        set: (val) => emit('update:draggableManualNodes', val),
    });

    const displayPage = computed(() => (props.localSearchTerm ? props.searchPage : props.basePage));
    const displayTotalPages = computed(() =>
        props.localSearchTerm ? props.searchTotalPages : props.baseTotalPages
    );

    const handleChangePage = (page) => {
        let p = parseInt(page, 10);
        if (isNaN(p)) return;
        // Let parent handle boundaries if needed, but safe to clamp here for UI feedback
        if (p < 1) p = 1;
        if (p > displayTotalPages.value) p = displayTotalPages.value;
        emit('change-page', p);
    };
</script>

<template>
    <div v-if="manualNodes.length > 0" :class="{ 'pb-48': isSelectionMode }">
        <!-- 如果有搜索词，显示搜索提示 -->
        <div
            v-if="localSearchTerm && filteredNodes.length === 0"
            data-testid="manual-node-no-search-results"
            class="rounded-md border border-zinc-800 bg-[#171717] px-6 py-12 text-center"
        >
            <p class="text-sm font-medium text-zinc-200">
                {{ t('manualNodes.noSearchResult', { keyword: localSearchTerm }) }}
            </p>
            <button
                data-testid="clear-manual-node-search"
                type="button"
                class="mt-3 inline-flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white cursor-pointer"
                @click="emit('clear-search')"
            >
                {{ t('actions.clearSearch') }}
            </button>
        </div>

        <div v-if="isSorting">
            <div
                data-testid="node-sorting-banner"
                class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 px-4 py-2.5 text-xs text-zinc-200"
            >
                <div class="flex items-center gap-2">
                    <span class="h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0"></span>
                    <span>{{ t('manualNodes.sortingHint') }}</span>
                </div>
                <button
                    type="button"
                    data-testid="node-finish-sort"
                    class="shrink-0 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/20 hover:text-sky-200 cursor-pointer"
                    @click="emit('toggle-sort')"
                >
                    {{ t('actions.finishSort') }}
                </button>
            </div>
            <!-- 排序模式保持原有扁平列表，方便跨组排序 -->
            <div v-if="viewMode === 'card'">
                <draggable
                    tag="div"
                    class="grid gap-4"
                    :class="
                        compactGrid
                            ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-2'
                            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3'
                    "
                    v-model="draggableModel"
                    item-key="id"
                    animation="300"
                    @end="emit('sort-end')"
                >
                    <template #item="{ element: node }">
                        <div
                            class="cursor-move rounded-md border border-dashed border-sky-500/40 p-0.5 transition-colors hover:border-sky-400/70"
                        >
                            <ManualNodeCard
                                class="pointer-events-none select-none"
                                :node="node"
                                :is-selection-mode="isSelectionMode"
                                :is-selected="selectedNodeIds.has(node.id)"
                                :ping-result="pingResults[node.id]"
                                :is-pinging="pingingNodes.has(node.id)"
                                @toggle-select="emit('toggle-select', node.id)"
                                @edit="emit('edit', node.id)"
                                @delete="emit('delete', node.id)"
                                @filter-group="emit('set-group-filter', $event)"
                                @ping="emit('ping', node.id)"
                            />
                        </div>
                    </template>
                </draggable>
            </div>
            <div v-else class="space-y-3">
                <draggable
                    tag="div"
                    class="space-y-2"
                    v-model="draggableModel"
                    item-key="id"
                    animation="300"
                    @end="emit('sort-end')"
                >
                    <template #item="{ element: node, index }">
                        <div
                            class="cursor-move rounded-md border border-dashed border-sky-500/40 p-0.5 transition-colors hover:border-sky-400/70"
                        >
                            <ManualNodeList
                                :node="node"
                                :index="index + 1"
                                class="list-item-animation pointer-events-none select-none"
                                :style="{ '--delay-index': Math.min(index, 20) }"
                                :ping-result="pingResults[node.id]"
                                :is-pinging="pingingNodes.has(node.id)"
                                @edit="emit('edit', node.id)"
                                @delete="emit('delete', node.id)"
                                @filter-group="emit('set-group-filter', $event)"
                                @ping="emit('ping', node.id)"
                            />
                        </div>
                    </template>
                </draggable>
            </div>
        </div>

        <div v-else>
            <!-- Flat List Display (No Groups) -->
            <div
                v-if="viewMode === 'card'"
                class="grid gap-4"
                :class="
                    compactGrid
                        ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-2'
                        : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3'
                "
            >
                <div
                    v-for="(node, index) in paginatedNodes"
                    :key="node.id"
                    class="list-item-animation"
                    :style="{ '--delay-index': Math.min(index, 20) }"
                >
                    <ManualNodeCard
                        :node="node"
                        :is-selection-mode="isSelectionMode"
                        :is-selected="selectedNodeIds.has(node.id)"
                        :ping-result="pingResults[node.id]"
                        :is-pinging="pingingNodes.has(node.id)"
                        @toggle-select="emit('toggle-select', node.id)"
                        @edit="emit('edit', node.id)"
                        @delete="emit('delete', node.id)"
                        @filter-group="emit('set-group-filter', $event)"
                        @ping="emit('ping', node.id)"
                    />
                </div>
            </div>
            <div v-else class="space-y-3">
                <ManualNodeList
                    v-for="(node, index) in paginatedNodes"
                    :key="node.id"
                    :node="node"
                    :index="paginatedNodes.indexOf(node) + 1"
                    class="list-item-animation"
                    :style="{ '--delay-index': Math.min(index, 20) }"
                    :is-selection-mode="isSelectionMode"
                    :is-selected="selectedNodeIds.has(node.id)"
                    :ping-result="pingResults[node.id]"
                    :is-pinging="pingingNodes.has(node.id)"
                    @toggle-select="emit('toggle-select', node.id)"
                    @edit="emit('edit', node.id)"
                    @delete="emit('delete', node.id)"
                    @filter-group="emit('set-group-filter', $event)"
                    @ping="emit('ping', node.id)"
                />
            </div>
        </div>

        <PanelPagination
            variant="panel"
            :current-page="displayPage"
            :total-pages="displayTotalPages"
            :total-items="filteredNodes.length"
            :items-per-page="itemsPerPage"
            :show-items-per-page="true"
            :show-total-items="true"
            @change-page="handleChangePage"
            @update:items-per-page="emit('update:itemsPerPage', $event)"
        />
    </div>
    <div
        v-else
        class="rounded-md border border-zinc-800 bg-[#171717] py-2"
    >
        <EmptyState
            :title="t('manualNodes.empty')"
            :description="t('manualNodes.emptyDesc')"
            icon="node"
            :total-count="0"
        />
    </div>
</template>

<style scoped>
    .cursor-move {
        cursor: move;
    }
</style>
