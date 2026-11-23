import { computed, nextTick, onBeforeUnmount, ref, toValue, watch } from 'vue';

export function useHorizontalScrollFade(options = {}) {
  const { enabled = true, threshold = 2, deps = null } = options;

  const scrollRef = ref(null);
  const canScrollLeft = ref(false);
  const canScrollRight = ref(false);

  let resizeObserver = null;

  const updateScrollFade = () => {
    const el = scrollRef.value;
    if (!el || !toValue(enabled)) {
      canScrollLeft.value = false;
      canScrollRight.value = false;
      return;
    }

    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    if (maxScrollLeft <= threshold) {
      canScrollLeft.value = false;
      canScrollRight.value = false;
      return;
    }

    canScrollLeft.value = el.scrollLeft > threshold;
    canScrollRight.value = maxScrollLeft - el.scrollLeft > threshold;
  };

  const cleanupObserver = () => {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  };

  watch(
    [scrollRef, () => toValue(enabled)],
    ([el, isEnabled]) => {
      cleanupObserver();
      if (!el || !isEnabled) {
        canScrollLeft.value = false;
        canScrollRight.value = false;
        return;
      }

      nextTick(updateScrollFade);

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(updateScrollFade);
        resizeObserver.observe(el);
      }
    },
    { flush: 'post', immediate: true },
  );

  if (deps) {
    watch(deps, () => {
      nextTick(updateScrollFade);
    });
  }

  onBeforeUnmount(cleanupObserver);

  const scrollFadeClass = computed(() => {
    if (canScrollLeft.value && canScrollRight.value) return 'scroll-fade-both';
    if (canScrollLeft.value) return 'scroll-fade-left';
    if (canScrollRight.value) return 'scroll-fade-right';
    return '';
  });

  return {
    scrollRef,
    canScrollLeft,
    canScrollRight,
    scrollFadeClass,
    updateScrollFade,
  };
}
