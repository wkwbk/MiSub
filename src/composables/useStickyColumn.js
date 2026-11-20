import { onMounted, onUnmounted } from 'vue';

const DESKTOP_BREAKPOINT = 1280;
const BASE_TOP_GAP = 16;
const BOTTOM_GAP = 24;

function measureTopGap() {
  if (typeof document === 'undefined') return BASE_TOP_GAP;
  const navBars = document.querySelectorAll('.app-nav-bar');
  let navBottom = 0;
  for (let i = 0; i < navBars.length; i += 1) {
    const rect = navBars[i].getBoundingClientRect();
    if (rect.height > 0 && rect.bottom > navBottom) {
      navBottom = rect.bottom;
    }
  }
  return Math.round(Math.max(0, navBottom)) + BASE_TOP_GAP;
}

/**
 * 桌面端双栏双向吸顶（类似 X/Twitter 侧边栏）：
 * 仅对较短的一栏启用，页面保持单一主滚动条。
 * 几何尺寸仅在初始化/Resize 时测量并缓存，滚动回调内零 DOM 布局读取且仅在状态切换时写入样式。
 */
export function useStickyColumns(gridRef, columnRefs) {
  const states = new WeakMap();
  const metrics = {
    isDesktop: false,
    topGap: BASE_TOP_GAP,
    viewportHeight: 0,
    gridDocTop: 0,
    gridHeight: 0,
    colHeights: new WeakMap(),
  };

  let prevScrollY = 0;
  let resizeObserver = null;
  let layoutRafId = null;
  let scrollRafId = null;

  const getState = (el) => {
    let state = states.get(el);
    if (!state) {
      state = {
        mode: 'static',
        offsetTop: 0,
        appliedPosition: '',
        appliedTop: '',
      };
      states.set(el, state);
    }
    return state;
  };

  const setStyle = (el, state, position, top) => {
    if (state.appliedPosition !== position) {
      el.style.position = position;
      state.appliedPosition = position;
    }
    if (state.appliedTop !== top) {
      el.style.top = top;
      state.appliedTop = top;
    }
  };

  const resetElement = (el) => {
    if (!el) return;
    const state = getState(el);
    state.mode = 'static';
    state.offsetTop = 0;
    setStyle(el, state, '', '');
  };

  const applyScroll = () => {
    scrollRafId = null;
    if (typeof window === 'undefined') return;

    const scrollY = window.scrollY;
    const delta = scrollY - prevScrollY;
    prevScrollY = scrollY;

    if (!metrics.isDesktop || !gridRef.value) {
      for (let i = 0; i < columnRefs.length; i += 1) {
        resetElement(columnRefs[i].value);
      }
      return;
    }

    const { topGap, viewportHeight, gridDocTop, gridHeight, colHeights } = metrics;
    const availableHeight = viewportHeight - topGap - BOTTOM_GAP;

    for (let i = 0; i < columnRefs.length; i += 1) {
      const el = columnRefs[i].value;
      if (!el) continue;

      const colHeight = colHeights.get(el) || 0;
      if (colHeight >= gridHeight - 2) {
        resetElement(el);
        continue;
      }

      const state = getState(el);

      if (colHeight <= availableHeight) {
        state.mode = 'sticky-top';
        state.offsetTop = 0;
        setStyle(el, state, 'sticky', `${topGap}px`);
        continue;
      }

      const minTop = viewportHeight - BOTTOM_GAP - colHeight;
      const maxTop = topGap;
      const maxOffset = Math.max(0, gridHeight - colHeight);

      if (delta > 0) {
        if (state.mode === 'sticky-top') {
          const prevScroll = scrollY - delta;
          state.mode = 'relative';
          state.offsetTop = Math.min(maxOffset, Math.max(0, prevScroll + maxTop - gridDocTop));
          setStyle(el, state, 'relative', `${state.offsetTop}px`);
        }

        const currentVisualTop = gridDocTop + state.offsetTop - scrollY;
        if (state.mode !== 'sticky-bottom' && currentVisualTop <= minTop) {
          state.mode = 'sticky-bottom';
          setStyle(el, state, 'sticky', `${minTop}px`);
        }
      } else if (delta < 0) {
        if (state.mode === 'sticky-bottom') {
          const prevScroll = scrollY - delta;
          state.mode = 'relative';
          state.offsetTop = Math.min(maxOffset, Math.max(0, prevScroll + minTop - gridDocTop));
          setStyle(el, state, 'relative', `${state.offsetTop}px`);
        }

        const currentVisualTop = gridDocTop + state.offsetTop - scrollY;
        if (state.mode === 'relative' && currentVisualTop >= maxTop) {
          if (scrollY + maxTop <= gridDocTop) {
            resetElement(el);
          } else {
            state.mode = 'sticky-top';
            setStyle(el, state, 'sticky', `${maxTop}px`);
          }
        }
      } else {
        // 仅在布局变化后校准当前模式下的位置
        if (state.mode === 'sticky-bottom') {
          setStyle(el, state, 'sticky', `${minTop}px`);
        } else if (state.mode === 'sticky-top') {
          setStyle(el, state, 'sticky', `${maxTop}px`);
        } else if (state.mode === 'relative') {
          state.offsetTop = Math.min(maxOffset, Math.max(0, state.offsetTop));
          setStyle(el, state, 'relative', `${state.offsetTop}px`);
        } else if (gridDocTop - scrollY <= minTop && gridDocTop + gridHeight - scrollY > viewportHeight - BOTTOM_GAP) {
          state.mode = 'sticky-bottom';
          setStyle(el, state, 'sticky', `${minTop}px`);
        }
      }
    }
  };

  const measureAndApply = () => {
    layoutRafId = null;
    if (typeof window === 'undefined') return;

    const gridEl = gridRef.value;
    metrics.isDesktop = Boolean(gridEl) && window.innerWidth >= DESKTOP_BREAKPOINT;

    if (!metrics.isDesktop) {
      applyScroll();
      return;
    }

    const scrollY = window.scrollY;
    const gridRect = gridEl.getBoundingClientRect();
    metrics.topGap = measureTopGap();
    metrics.viewportHeight = window.innerHeight;
    metrics.gridDocTop = gridRect.top + scrollY;
    metrics.gridHeight = gridEl.offsetHeight;

    for (let i = 0; i < columnRefs.length; i += 1) {
      const el = columnRefs[i].value;
      if (el) {
        metrics.colHeights.set(el, el.offsetHeight);
      }
    }

    applyScroll();
  };

  const scheduleLayoutMeasure = () => {
    if (layoutRafId !== null || typeof window === 'undefined') return;
    layoutRafId = window.requestAnimationFrame(measureAndApply);
  };

  const onScroll = () => {
    if (scrollRafId !== null || typeof window === 'undefined') return;
    scrollRafId = window.requestAnimationFrame(applyScroll);
  };

  const observeElements = () => {
    if (typeof ResizeObserver === 'undefined') return;
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(scheduleLayoutMeasure);
    if (gridRef.value) {
      resizeObserver.observe(gridRef.value);
      if (gridRef.value.parentElement) {
        resizeObserver.observe(gridRef.value.parentElement);
      }
    }
    for (let i = 0; i < columnRefs.length; i += 1) {
      if (columnRefs[i].value) {
        resizeObserver.observe(columnRefs[i].value);
      }
    }
  };

  onMounted(() => {
    prevScrollY = window.scrollY;
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', scheduleLayoutMeasure, { passive: true });
    observeElements();
    scheduleLayoutMeasure();
  });

  onUnmounted(() => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', scheduleLayoutMeasure);
    resizeObserver?.disconnect();
    if (layoutRafId !== null) window.cancelAnimationFrame(layoutRafId);
    if (scrollRafId !== null) window.cancelAnimationFrame(scrollRafId);
  });

  return {
    refreshStickyColumns: scheduleLayoutMeasure,
    reobserveStickyColumns: observeElements,
  };
}
