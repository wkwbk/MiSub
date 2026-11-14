<script setup>
    import { computed } from 'vue';
    import { GripHorizontal, Search, X } from 'lucide-vue-next';
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
            <h4 class="text-xs font-semibold text-zinc-300">
                {{ t('profileModal.selectSubProfiles') }}
            </h4>
            <div class="space-x-2">
                <button
                    type="button"
                    @click="handleSelectAllValid"
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
        <!-- 占位区域，与右侧分组筛选高度一致 -->
        <div class="h-[42px]"></div>
        <div class="relative mb-2">
            <input
                type="text"
                v-model="searchModel"
                :placeholder="t('profiles.searchPlaceholder')"
                class="w-full pl-9 pr-3 py-1.5 text-xs bg-[#131515] border border-zinc-800 rounded-md shadow-none text-zinc-100 placeholder-zinc-600 focus-visible:outline-hidden focus:border-zinc-600"
                :aria-label="t('profiles.searchPlaceholder')"
            />
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        </div>
        <div
            class="overflow-y-auto space-y-2 p-3 bg-[#131515] rounded-md border border-zinc-800 h-36 lg:h-64"
        >
            <div v-for="item in filteredProfiles" :key="item.id">
                <label
                    class="flex items-center space-x-3"
                    :class="
                        isCycleCandidate(item.id)
                            ? 'opacity-50 cursor-not-allowed'
                            : 'cursor-pointer'
                    "
                >
                    <input
                        type="checkbox"
                        :checked="selectedIds.includes(item.id)"
                        :disabled="isCycleCandidate(item.id)"
                        @change="emit('toggle-selection', item.id)"
                        class="h-4 w-4 rounded-sm border-zinc-700 bg-[#131515] text-zinc-100 focus:ring-0"
                    />
                    <span class="text-xs text-zinc-200 truncate flex-1" :title="item.name">
                        {{ item.name }}
                    </span>
                    <span
                        v-if="isCycleCandidate(item.id)"
                        class="inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded-md border border-zinc-800 text-red-400 shrink-0"
                        :title="t('profileModal.cycleWarning')"
                    >
                        <span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                        {{ t('profileModal.cycleWarning') }}
                    </span>
                    <span v-else class="text-[11px] font-mono text-zinc-500 shrink-0">
                        {{ (item.subscriptions || []).length }} 机场 ·
                        {{ (item.manualNodes || []).length }} 节点
                    </span>
                </label>
            </div>
            <div
                v-if="filteredProfiles.length === 0"
                class="text-center text-zinc-500 text-xs py-4"
            >
                {{ t('profileModal.noMatchedSubProfiles') }}
            </div>
        </div>

        <!-- 已选子订阅拖拽排序区 -->
        <div v-if="orderedSelectedProfiles.length > 0" class="mt-3">
            <div class="flex justify-between items-center mb-1.5">
                <h5 class="text-xs font-medium text-zinc-400">
                    {{ t('profileModal.selectedDrag', { count: orderedSelectedProfiles.length }) }}
                </h5>
            </div>
            <draggable
                v-model="orderedSelectedProfiles"
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
                            {{ element.name }}
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
        {{ t('profileModal.noAvailableSubProfiles') }}
    </div>
</template>
