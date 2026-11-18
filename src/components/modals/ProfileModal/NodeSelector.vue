<script setup>
    import { computed } from 'vue';
    import { GripHorizontal, Search, X } from '@lucide/vue';
    import draggable from 'vuedraggable';
    import TagFilterBar from '@/components/shared/TagFilterBar.vue';
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        nodes: {
            type: Array,
            default: () => [],
        },
        filteredNodes: {
            type: Array,
            default: () => [],
        },
        searchTerm: {
            type: String,
            default: '',
        },
        activeTagFilters: {
            type: Array,
            default: () => [],
        },
        tags: {
            type: Array,
            default: () => [],
        },
        selectedIds: {
            type: Array,
            default: () => [],
        },
    });

    const emit = defineEmits([
        'update:searchTerm',
        'update:tagFilters',
        'update:selectedIds',
        'toggle-selection',
        'select-all',
        'deselect-all',
    ]);

    const searchModel = computed({
        get: () => props.searchTerm,
        set: (val) => emit('update:searchTerm', val),
    });

    const orderedSelectedNodes = computed({
        get() {
            const nodeMap = new Map(props.nodes.map((n) => [n.id, n]));
            return props.selectedIds.map((id) => nodeMap.get(id)).filter(Boolean);
        },
        set(newList) {
            emit(
                'update:selectedIds',
                newList.map((n) => n.id)
            );
        },
    });
</script>

<template>
    <div v-if="nodes.length > 0" class="space-y-2">
        <div class="flex justify-between items-center gap-2 h-6">
            <h4 class="text-xs font-semibold text-zinc-300 truncate">
                {{ t('profileModal.selectNodes') }}
            </h4>
            <div class="space-x-2 shrink-0 whitespace-nowrap">
                <button
                    type="button"
                    @click="emit('select-all')"
                    class="text-xs text-zinc-300 hover:text-white hover:underline"
                >
                    {{ t('profileModal.selectAll') }}
                </button>
                <button
                    type="button"
                    @click="emit('deselect-all')"
                    class="text-xs text-zinc-400 hover:text-white hover:underline"
                >
                    {{ t('profileModal.deselectAll') }}
                </button>
            </div>
        </div>
        <!-- Tag Filter Bar -->
        <div class="flex items-center h-8">
            <TagFilterBar
                :tags="tags"
                :active-filters="activeTagFilters"
                always-show
                test-id-prefix="node-selector-tag"
                @update:active-filters="emit('update:tagFilters', $event)"
            />
        </div>

        <div class="relative">
            <input
                type="text"
                v-model="searchModel"
                :placeholder="t('manualNodes.searchPlaceholder')"
                class="w-full pl-9 pr-3 py-1.5 text-xs bg-[#131515] border border-zinc-800 rounded-md shadow-none text-zinc-100 placeholder-zinc-600 focus-visible:outline-hidden focus:border-zinc-600"
                :aria-label="t('manualNodes.searchPlaceholder')"
            />
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        </div>
        <div
            class="overflow-y-auto space-y-2 p-3 bg-[#131515] rounded-md border border-zinc-800 h-36 lg:h-64"
        >
            <div v-for="node in filteredNodes" :key="node.id">
                <label class="flex items-center space-x-3 cursor-pointer">
                    <input
                        type="checkbox"
                        :checked="selectedIds.includes(node.id)"
                        @change="emit('toggle-selection', node.id)"
                        class="h-4 w-4 rounded-sm border-zinc-700 bg-[#131515] text-zinc-100 focus:ring-0"
                    />
                    <span class="text-xs text-zinc-200 truncate" :title="node.name">{{
                        node.name || t('manualNodes.unnamed')
                    }}</span>
                </label>
            </div>
            <div v-if="filteredNodes.length === 0" class="text-center text-zinc-500 text-xs py-4">
                {{ t('profileModal.noMatchedNodes') }}
            </div>
        </div>

        <div v-if="orderedSelectedNodes.length > 0" class="mt-3">
            <div class="flex justify-between items-center mb-1.5">
                <h5 class="text-xs font-medium text-zinc-400">
                    {{ t('profileModal.selectedDrag', { count: orderedSelectedNodes.length }) }}
                </h5>
            </div>
            <draggable
                v-model="orderedSelectedNodes"
                item-key="id"
                handle=".drag-handle"
                ghost-class="opacity-40"
                class="space-y-1 p-2 bg-transparent rounded-md border border-zinc-800 h-32 lg:h-48 overflow-y-auto"
            >
                <template #item="{ element, index }">
                    <div
                        class="flex items-center gap-2 px-2 py-1.5 bg-[#131515] rounded-md border border-zinc-800 shadow-none"
                    >
                        <span
                            class="drag-handle cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300"
                        >
                            <GripHorizontal class="w-4 h-4" />
                        </span>
                        <span class="font-mono text-xs font-medium text-zinc-400 w-5">{{
                            index + 1
                        }}</span>
                        <span class="text-xs text-zinc-200 truncate flex-1" :title="element.name">
                            {{ element.name || t('manualNodes.unnamed') }}
                        </span>
                        <button
                            type="button"
                            @click="emit('toggle-selection', element.id)"
                            class="text-zinc-500 hover:text-red-400 transition-colors"
                            :title="t('profileModal.remove')"
                            :aria-label="t('profileModal.remove')"
                        >
                            <X class="w-4 h-4" />
                        </button>
                    </div>
                </template>
            </draggable>
        </div>
    </div>
    <div
        v-else
        class="text-center text-xs text-zinc-500 p-4 bg-transparent border border-zinc-800 rounded-md flex items-center justify-center h-full"
    >
        {{ t('profileModal.noAvailableNodes') }}
    </div>
</template>
