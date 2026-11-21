import { onUnmounted, toValue, watch } from 'vue';

let activeLockCount = 0;
let savedStyles = null;
let touchMoveListener = null;

function hasScrollableAncestor(target) {
  let el = target instanceof Element ? target : target?.parentElement;
  if (el?.closest('input[type="range"]')) {
    return true;
  }

  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const canScrollY = (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
    const canScrollX = (overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth;

    if (canScrollY || canScrollX) {
      return true;
    }
    el = el.parentElement;
  }

  return false;
}

function handleDocumentTouchMove(event) {
  if (!event.cancelable) return;
  if (event.touches && event.touches.length > 1) return;
  if (!hasScrollableAncestor(event.target)) {
    event.preventDefault();
  }
}

function applyScrollLock() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const html = document.documentElement;
  const body = document.body;
  if (!html || !body) return;

  savedStyles = {
    htmlOverflow: html.style.overflow,
    htmlOverscrollBehavior: html.style.overscrollBehavior,
    bodyOverflow: body.style.overflow,
    bodyOverscrollBehavior: body.style.overscrollBehavior,
    bodyPaddingRight: body.style.paddingRight,
  };

  const scrollbarWidth = window.innerWidth - html.clientWidth;
  if (scrollbarWidth > 0) {
    const computedPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${computedPaddingRight + scrollbarWidth}px`;
  }

  html.style.overflow = 'hidden';
  html.style.overscrollBehavior = 'none';
  body.style.overflow = 'hidden';
  body.style.overscrollBehavior = 'none';

  touchMoveListener = handleDocumentTouchMove;
  document.addEventListener('touchmove', touchMoveListener, { passive: false });
}

function releaseScrollLock() {
  if (typeof document === 'undefined') return;

  if (touchMoveListener) {
    document.removeEventListener('touchmove', touchMoveListener);
    touchMoveListener = null;
  }

  const html = document.documentElement;
  const body = document.body;
  if (savedStyles && html && body) {
    html.style.overflow = savedStyles.htmlOverflow;
    html.style.overscrollBehavior = savedStyles.htmlOverscrollBehavior;
    body.style.overflow = savedStyles.bodyOverflow;
    body.style.overscrollBehavior = savedStyles.bodyOverscrollBehavior;
    body.style.paddingRight = savedStyles.bodyPaddingRight;
  }
  savedStyles = null;
}

export function useScrollLock(isLockedSource) {
  let isLockedByThisInstance = false;

  const lock = () => {
    if (isLockedByThisInstance) return;
    isLockedByThisInstance = true;
    activeLockCount += 1;
    if (activeLockCount === 1) {
      applyScrollLock();
    }
  };

  const unlock = () => {
    if (!isLockedByThisInstance) return;
    isLockedByThisInstance = false;
    activeLockCount = Math.max(0, activeLockCount - 1);
    if (activeLockCount === 0) {
      releaseScrollLock();
    }
  };

  watch(
    () => Boolean(toValue(isLockedSource)),
    (locked) => {
      if (locked) {
        lock();
      } else {
        unlock();
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    unlock();
  });
}
