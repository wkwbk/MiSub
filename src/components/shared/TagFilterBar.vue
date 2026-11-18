<script setup>
    import { computed } from 'vue';
    import { useI18n } from '@/i18n/index.js';
    import {
        normalizeActiveTagFilters,
        normalizeTagList,
        toggleTagFilterValue,
        UNTAGGED_KEY,
    } from '@/utils/tags.js';

    const { t } = useI18n();

    const props = defineProps({
        tags: {
            type: Array,
            default: () => [],
        },
        activeFilters: {
            type: [Array, String],
            default: () => [],
        },
        showUntagged: {
            type: Boolean,
            default: true,
        },
        alwaysShow: {
            type: Boolean,
            default: false,
        },
        testIdPrefix: {
            type: String,
            default: 'tag-filter',
        },
    });

    const emit = defineEmits(['update:activeFilters', 'toggle']);

    const normalizedActive = computed(() => normalizeActiveTagFilters(props.activeFilters));
    const isAllActive = computed(() => normalizedActive.value.length === 0);
    const isUntaggedActive = computed(
        () => normalizedActive.value.length === 1 && normalizedActive.value[0] === UNTAGGED_KEY
    );
    const activeSet = computed(() => new Set(normalizedActive.value));

    // 确保当前已选中的标签即便暂时不在候选列表里也依然可见以便取消勾选
    const displayTags = computed(() => {
        const selectedNamed = normalizedActive.value.filter((tag) => tag !== UNTAGGED_KEY);
        return normalizeTagList([...(props.tags || []), ...selectedNamed]);
    });

    const shouldRender = computed(
        () => props.alwaysShow || displayTags.value.length > 0 || normalizedActive.value.length > 0
    );

    const handleSelect = (target) => {
        const next = toggleTagFilterValue(normalizedActive.value, target);
        emit('update:activeFilters', next);
        emit('toggle', target, next);
    };

    const handleWheel = (e) => {
        const el = e.currentTarget;
        if (el && el.scrollWidth > el.clientWidth && e.deltaY !== 0) {
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        }
    };
</script>

<template>
    <div
        v-if="shouldRender"
        :data-testid="`${testIdPrefix}-tabs`"
        class="flex w-full min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar"
        @wheel="handleWheel"
    >
        <button
            type="button"
            :data-testid="`${testIdPrefix}-tab-all`"
            class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap cursor-pointer"
            :class="
                isAllActive
                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                    : 'bg-transparent text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900'
            "
            @click="handleSelect(null)"
        >
            {{ t('tags.all') }}
        </button>

        <button
            v-if="showUntagged"
            type="button"
            :data-testid="`${testIdPrefix}-tab-untagged`"
            class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap cursor-pointer"
            :class="
                isUntaggedActive
                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                    : 'bg-transparent text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900'
            "
            @click="handleSelect(UNTAGGED_KEY)"
        >
            {{ t('tags.untagged') }}
        </button>

        <button
            v-for="tag in displayTags"
            :key="tag"
            type="button"
            :data-testid="`${testIdPrefix}-tab-item`"
            class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap cursor-pointer"
            :class="
                activeSet.has(tag)
                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                    : 'bg-transparent text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-900'
            "
            @click="handleSelect(tag)"
        >
            {{ tag }}
        </button>
    </div>
</template>
