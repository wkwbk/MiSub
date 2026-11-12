<script setup>
    import { computed } from 'vue';
    import draggable from 'vuedraggable';
    import { useI18n } from '@/i18n/index.js';
    import { wouldCreateCycle } from '@/utils/profile-graph.js';

    const { t } = useI18n();

    const props = defineProps({
        profiles: {
            type: Array,
            default: () => [],
        },
        filteredProfiles: {
            type: Array,
            default: () => [],
        },
        searchTerm: {
            type: String,
            default: '',
        },
        selectedIds: {
            type: Array,
            default: () => [],
        },
        targetProfileId: {
            type: String,
            default: '',
        },
        allProfiles: {
            type: Array,
            default: () => [],
        },
    });

    const emit = defineEmits([
        'update:searchTerm',
        'update:selectedIds',
        'toggle-selection',
        'select-all',
        'deselect-all',
    ]);

    const searchModel = computed({
        get: () => props.searchTerm,
        set: (val) => emit('update:searchTerm', val),
    });

    // 检查某个候选 profile 是否会导致循环依赖
    const isCycleCandidate = (profileId) => {
        return wouldCreateCycle(props.targetProfileId, profileId, props.allProfiles);
    };

    // 根据 selectedIds 顺序获取已选子订阅对象列表
    const orderedSelectedProfiles = computed({
        get() {
            const profileMap = new Map();
            props.allProfiles.forEach((p) => {
                if (p.id) profileMap.set(p.id, p);
                if (p.customId) profileMap.set(p.customId, p);
            });
            return props.selectedIds.map((id) => profileMap.get(id)).filter(Boolean);
        },
        set(newList) {
            const reorderedIds = newList.map((p) => p.id || p.customId);
            emit('update:selectedIds', reorderedIds);
        },
    });

    const handleSelectAllValid = () => {
        const validProfiles = props.filteredProfiles.filter((p) => !isCycleCandidate(p.id));
        emit('select-all', validProfiles);
    };
</script>

<template>
    <div v-if="profiles.length > 0" class="space-y-2">
        <div class="flex justify-between items-center mb-2">
            <h4
                class="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5"
            >
                <span>{{ t('profileModal.selectSubProfiles') }}</span>
            </h4>
            <div class="space-x-2">
                <button
                    type="button"
                    @click="handleSelectAllValid"
                    class="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline cursor-pointer"
                >
                    {{ t('profileModal.selectAll') }}
                </button>
                <button
                    type="button"
                    @click="emit('deselect-all')"
                    class="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline cursor-pointer"
                >
                    {{ t('profileModal.deselectAll') }}
                </button>
            </div>
        </div>

        <div class="relative mb-2">
            <input
                type="text"
                v-model="searchModel"
                :placeholder="t('profiles.searchPlaceholder')"
                class="w-full pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-[#131515] border border-zinc-300 dark:border-zinc-800 rounded-md shadow-none focus-visible:outline-hidden focus:border-zinc-500 dark:focus:border-zinc-500 text-zinc-900 dark:text-zinc-100"
                :aria-label="t('profiles.searchPlaceholder')"
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
            class="border border-zinc-200 dark:border-zinc-800 rounded-md p-2 space-y-1 max-h-56 overflow-y-auto bg-white dark:bg-[#131515]"
        >
            <div
                v-if="filteredProfiles.length === 0"
                class="text-center py-4 text-xs text-zinc-500"
            >
                {{ t('profileModal.noMatchedSubProfiles') }}
            </div>
            <label
                v-for="item in filteredProfiles"
                :key="item.id"
                class="flex items-center gap-2 p-1.5 rounded-md transition-colors text-sm"
                :class="[
                    isCycleCandidate(item.id)
                        ? 'opacity-50 cursor-not-allowed bg-zinc-50 dark:bg-zinc-900/50'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer',
                ]"
            >
                <input
                    type="checkbox"
                    :checked="selectedIds.includes(item.id)"
                    :disabled="isCycleCandidate(item.id)"
                    @change="emit('toggle-selection', item.id)"
                    class="rounded-sm border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-0 dark:bg-zinc-900"
                />
                <span class="truncate flex-1 text-zinc-900 dark:text-zinc-100 font-medium">
                    {{ item.name }}
                </span>
                <span
                    v-if="isCycleCandidate(item.id)"
                    class="inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-red-500 shrink-0"
                    :title="t('profileModal.cycleWarning')"
                >
                    <span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                    {{ t('profileModal.cycleWarning') }}
                </span>
                <span v-else class="text-xs font-mono text-zinc-500 shrink-0">
                    {{ (item.subscriptions || []).length }} 机场 ·
                    {{ (item.manualNodes || []).length }} 节点
                </span>
            </label>
        </div>

        <!-- 已选子订阅拖拽排序区 -->
        <div v-if="orderedSelectedProfiles.length > 0" class="mt-3">
            <div class="text-xs text-zinc-500 font-mono mb-1.5">
                {{ t('profileModal.selectedDrag', { count: orderedSelectedProfiles.length }) }}
            </div>
            <draggable
                v-model="orderedSelectedProfiles"
                item-key="id"
                handle=".drag-handle"
                class="space-y-1 max-h-48 overflow-y-auto p-1.5 bg-zinc-50 dark:bg-[#131515] rounded-md border border-zinc-200 dark:border-zinc-800"
            >
                <template #item="{ element }">
                    <div
                        class="flex items-center gap-2 p-1.5 bg-white dark:bg-[#171717] rounded-md border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-200 shadow-none"
                    >
                        <span
                            class="drag-handle cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                        >
                            ⋮⋮
                        </span>
                        <span class="truncate flex-1 font-medium">{{ element.name }}</span>
                        <button
                            type="button"
                            @click="emit('toggle-selection', element.id)"
                            class="hover:text-red-500 text-zinc-400 transition-colors cursor-pointer !min-h-0 !min-w-0"
                            :title="t('profileModal.remove')"
                            :aria-label="t('profileModal.remove')"
                        >
                            ✕
                        </button>
                    </div>
                </template>
            </draggable>
        </div>
    </div>
    <div
        v-else
        class="border border-dashed border-zinc-300 dark:border-zinc-800 rounded-md p-6 text-center text-xs text-zinc-500"
    >
        {{ t('profileModal.noAvailableSubProfiles') }}
    </div>
</template>
