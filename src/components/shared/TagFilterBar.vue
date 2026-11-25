<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '@/i18n/index.js';
import { useHorizontalScrollFade } from '@/composables/useHorizontalScrollFade.js';
import { normalizeActiveTagFilters, normalizeTagList, toggleTagFilterValue, UNTAGGED_KEY } from '@/utils/tags.js';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    tags?: string[];
    activeFilters?: string[] | string;
    showUntagged?: boolean;
    alwaysShow?: boolean;
    testIdPrefix?: string;
  }>(),
  {
    tags: () => [],
    activeFilters: () => [],
    showUntagged: true,
    alwaysShow: false,
    testIdPrefix: 'tag-filter',
  },
);

const emit = defineEmits<{
  'update:activeFilters': [value: string[]];
  toggle: [target: string | null, next: string[]];
}>();

const normalizedActive = computed(() => normalizeActiveTagFilters(props.activeFilters));
const isAllActive = computed(() => normalizedActive.value.length === 0);
const isUntaggedActive = computed(
  () => normalizedActive.value.length === 1 && normalizedActive.value[0] === UNTAGGED_KEY,
);
const activeSet = computed(() => new Set(normalizedActive.value));

// 确保当前已选中的标签即便暂时不在候选列表里也依然可见以便取消勾选
const displayTags = computed(() => {
  const selectedNamed = normalizedActive.value.filter((tag) => tag !== UNTAGGED_KEY);
  return normalizeTagList([...(props.tags || []), ...selectedNamed]);
});

const shouldRender = computed(
  () => props.alwaysShow || displayTags.value.length > 0 || normalizedActive.value.length > 0,
);

const handleSelect = (target: string | null): void => {
  const next = toggleTagFilterValue(normalizedActive.value, target);
  emit('update:activeFilters', next);
  emit('toggle', target, next);
};

const handleWheel = (e: WheelEvent): void => {
  const el = e.currentTarget as HTMLElement | null;
  if (el && el.scrollWidth > el.clientWidth && e.deltaY !== 0) {
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }
};

const { scrollRef, scrollFadeClass, updateScrollFade } = useHorizontalScrollFade({
  deps: () => [displayTags.value.length, props.showUntagged, shouldRender.value],
});
</script>

<template>
  <div
    v-if="shouldRender"
    ref="scrollRef"
    :class="scrollFadeClass"
    :data-testid="`${testIdPrefix}-tabs`"
    class="flex w-full min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar"
    @scroll.passive="updateScrollFade"
    @wheel="handleWheel"
  >
    <button
      :class="
        isAllActive
          ? 'bg-active text-fg border-line-strong font-semibold'
          : 'bg-transparent text-fg-muted border-line hover:text-fg hover:bg-hover'
      "
      :data-testid="`${testIdPrefix}-tab-all`"
      class="px-2.5 py-1 text-xs leading-4 font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap cursor-pointer"
      type="button"
      @click="handleSelect(null)"
    >
      {{ t('tags.all') }}
    </button>

    <button
      v-if="showUntagged"
      :class="
        isUntaggedActive
          ? 'bg-active text-fg border-line-strong font-semibold'
          : 'bg-transparent text-fg-muted border-line hover:text-fg hover:bg-hover'
      "
      :data-testid="`${testIdPrefix}-tab-untagged`"
      class="px-2.5 py-1 text-xs leading-4 font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap cursor-pointer"
      type="button"
      @click="handleSelect(UNTAGGED_KEY)"
    >
      {{ t('tags.untagged') }}
    </button>

    <button
      v-for="tag in displayTags"
      :key="tag"
      :class="
        activeSet.has(tag)
          ? 'bg-active text-fg border-line-strong font-semibold'
          : 'bg-transparent text-fg-muted border-line hover:text-fg hover:bg-hover'
      "
      :data-testid="`${testIdPrefix}-tab-item`"
      class="px-2.5 py-1 text-xs leading-4 font-medium rounded-md transition-colors border shrink-0 whitespace-nowrap cursor-pointer"
      type="button"
      @click="handleSelect(tag)"
    >
      {{ tag }}
    </button>
  </div>
</template>
