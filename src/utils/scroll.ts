export interface ScrollToPaginationStartOptions {
  gap?: number;
  containerGap?: number;
  behavior?: ScrollBehavior;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isScrollableY(el: Element | null | undefined): boolean {
  if (!el || el === document.body || el === document.documentElement) {
    return false;
  }
  if (el.scrollTop > 0) {
    return true;
  }
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return false;
  }
  const overflowY = window.getComputedStyle(el)?.overflowY;
  const allowsScroll = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
  return allowsScroll && el.scrollHeight > el.clientHeight + 1;
}

function findScrollableAncestor(el: Element): HTMLElement | null {
  let parent = el?.parentElement || null;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    if (isScrollableY(parent)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function scrollElementTo(el: Element | null | undefined, top: number, behavior: ScrollBehavior): void {
  if (!el) return;
  if (typeof el.scrollTo === 'function') {
    el.scrollTo({ top, behavior });
  } else {
    el.scrollTop = top;
  }
}

function getStickyHeaderOffset(doc: Document | null | undefined, extraGap = 16): number {
  if (!doc || typeof doc.querySelectorAll !== 'function') {
    return extraGap;
  }
  const headers = doc.querySelectorAll('.app-nav-bar');
  let maxBottom = 0;
  for (const header of headers) {
    const rect = header.getBoundingClientRect();
    if (rect.height > 0 && rect.bottom > maxBottom) {
      maxBottom = rect.bottom;
    }
  }
  return maxBottom > 0 ? maxBottom + extraGap : extraGap;
}

/**
 * 切换分页后自动滚动回到列表起始位置：
 * - 若目标本身或祖先存在内部滚动容器（如弹窗列表、固定高度表格），滚动该容器到列表起点；
 * - 否则在页面已滚过列表起点时，平滑滚动窗口到列表起点（自动避开吸顶导航栏）。
 */
export function scrollToPaginationStart(
  target: Element | null | undefined,
  options: ScrollToPaginationStartOptions = {},
): void {
  if (typeof window === 'undefined' || !target) {
    return;
  }

  const { gap = 16, containerGap = 12 } = options;
  const behavior = options.behavior || (prefersReducedMotion() ? 'auto' : 'smooth');

  if (isScrollableY(target) && target.scrollTop > 0) {
    scrollElementTo(target, 0, behavior);
    return;
  }

  const scrollableAncestor = findScrollableAncestor(target);
  if (scrollableAncestor) {
    const targetRect = target.getBoundingClientRect();
    const containerRect = scrollableAncestor.getBoundingClientRect();
    const relativeTop = targetRect.top - containerRect.top;

    if (relativeTop < containerGap) {
      const nextTop = Math.max(0, scrollableAncestor.scrollTop + relativeTop - containerGap);
      scrollElementTo(scrollableAncestor, nextTop, behavior);
    }
    return;
  }

  const doc = target.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const topOffset = getStickyHeaderOffset(doc, gap);
  const rect = target.getBoundingClientRect();
  if (rect.top < topOffset) {
    const nextTop = Math.max(0, window.scrollY + rect.top - topOffset);
    if (typeof window.scrollTo === 'function') {
      window.scrollTo({ top: nextTop, behavior });
    }
  }
}
