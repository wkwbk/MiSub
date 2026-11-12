<script setup>
    import { computed } from 'vue';
    import draggable from 'vuedraggable';
    import { useI18n } from '@/i18n/index.js';
    import { DEFAULT_GROUP_KEY } from '@/composables/manual-nodes/groups.js';

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
        activeGroupFilter: {
            type: String,
            default: null,
        },
        groups: {
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
        'update:groupFilter',
        'update:selectedIds',
        'toggle-selection',
        'select-all',
        'deselect-all',
    ]);

    const searchModel = computed({
        get: () => props.searchTerm,
        set: (val) => emit('update:searchTerm', val),
    });

    // 根据 selectedIds 顺序获取已选节点对象列表
    const orderedSelectedNodes = computed({
        get() {
            const nodeMap = new Map(props.nodes.map((n) => [n.id, n]));
            return props.selectedIds.map((id) => nodeMap.get(id)).filter(Boolean);
        },
        set(newList) {
            // 拖拽排序后更新 ID 顺序
            emit(
                'update:selectedIds',
                newList.map((n) => n.id)
            );
        },
    });
</script>

<template>
    <div v-if="nodes.length > 0" class="space-y-2">
        <div class="flex justify-between items-center mb-2">
            <h4 class="text-xs font-semibold text-zinc-300">
                {{ t('profileModal.selectNodes') }}
            </h4>
            <div class="space-x-2">
                <button @click="emit('select-all')" class="text-xs text-zinc-300 hover:text-white hover:underline">
                    {{ t('profileModal.selectAll') }}
                </button>
                <button
                    @click="emit('deselect-all')"
                    class="text-xs text-zinc-400 hover:text-white hover:underline"
                >
                    {{ t('profileModal.deselectAll') }}
                </button>
            </div>
        </div>
        <!-- Group Filter -->
        <div
            class="flex items-center gap-1.5 mb-2 p-1.5 rounded-md border-b border-zinc-800 overflow-x-auto no-scrollbar"
        >
            <button
                @click="emit('update:groupFilter', null)"
                class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap"
                :class="
                    !activeGroupFilter
                        ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                        : 'bg-transparent text-zinc-400 border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200'
                "
            >
                {{ t('manualNodes.allGroups') }}
            </button>
            <button
                @click="emit('update:groupFilter', DEFAULT_GROUP_KEY)"
                class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap"
                :class="
                    activeGroupFilter === DEFAULT_GROUP_KEY
                        ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                        : 'bg-transparent text-zinc-400 border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200'
                "
            >
                {{ t('manualNodes.ungrouped') }}
            </button>
            <button
                v-for="group in groups"
                :key="group"
                @click="emit('update:groupFilter', activeGroupFilter === group ? null : group)"
                class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap"
                :class="
                    activeGroupFilter === group
                        ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                        : 'bg-transparent text-zinc-400 border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200'
                "
            >
                {{ group }}
            </button>
        </div>

        <div class="relative mb-2">
            <input
                type="text"
                v-model="searchModel"
                :placeholder="t('manualNodes.searchPlaceholder')"
                class="w-full pl-9 pr-3 py-1.5 text-xs bg-[#131515] border border-zinc-800 rounded-md shadow-none text-zinc-100 placeholder-zinc-600 focus-visible:outline-hidden focus:border-zinc-600"
                :aria-label="t('manualNodes.searchPlaceholder')"
            />
            <svg
                class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"
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
                    <span
                        class="text-xs text-zinc-200 truncate"
                        :title="node.name"
                        >{{ node.name || t('manualNodes.unnamed') }}</span
                    >
                </label>
            </div>
            <div v-if="filteredNodes.length === 0" class="text-center text-zinc-500 text-xs py-4">
                {{ t('profileModal.noMatchedNodes') }}
            </div>
        </div>

        <!-- 已选节点拖拽排序区域 -->
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
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M4 8h16M4 16h16"
                                />
                            </svg>
                        </span>
                        <span
                            class="font-mono text-xs font-medium text-zinc-400 w-5"
                            >{{ index + 1 }}</span
                        >
                        <span
                            class="text-xs text-zinc-200 truncate flex-1"
                            :title="element.name"
                        >
                            {{ element.name || t('manualNodes.unnamed') }}
                        </span>
                        <button
                            @click="emit('toggle-selection', element.id)"
                            class="text-zinc-500 hover:text-red-400 transition-colors"
                            :title="t('profileModal.remove')"
                            :aria-label="t('profileModal.remove')"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
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
