import { computed, ref } from 'vue';

export function useVirtualList({ items, itemHeight = 49, overscan = 8, threshold = 60 }) {
  const containerRef = ref(null);
  const scrollTop = ref(0);

  const listLength = computed(() => (Array.isArray(items.value) ? items.value.length : 0));
  const isVirtualized = computed(() => listLength.value > threshold);

  const windowRange = computed(() => {
    const total = listLength.value;
    if (!isVirtualized.value) {
      return { start: 0, end: total };
    }
    const viewportHeight = containerRef.value?.clientHeight || 480;
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / itemHeight));
    const maxStart = Math.max(0, total - visibleCount);
    const rawStart = Math.max(0, Math.floor(scrollTop.value / itemHeight) - overscan);
    const start = Math.min(rawStart, maxStart);
    const end = Math.min(total, start + visibleCount + overscan * 2);
    return { start, end };
  });

  const visibleItems = computed(() => {
    const list = Array.isArray(items.value) ? items.value : [];
    if (!isVirtualized.value) return list;
    const { start, end } = windowRange.value;
    return list.slice(start, end);
  });

  const topSpacerHeight = computed(() => (isVirtualized.value ? windowRange.value.start * itemHeight : 0));
  const bottomSpacerHeight = computed(() =>
    isVirtualized.value ? Math.max(0, (listLength.value - windowRange.value.end) * itemHeight) : 0,
  );

  const handleScroll = (event) => {
    const target = event?.target || containerRef.value;
    if (!target) return;
    scrollTop.value = target.scrollTop || 0;
  };

  return {
    containerRef,
    isVirtualized,
    visibleItems,
    topSpacerHeight,
    bottomSpacerHeight,
    handleScroll,
  };
}
