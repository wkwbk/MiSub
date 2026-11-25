import { getCurrentInstance, onUnmounted, ref } from 'vue';
import type { Router } from 'vue-router';

export interface UseRouteLoadingOptions {
  showDelayMs?: number;
  slowThresholdMs?: number;
  finishDelayMs?: number;
}

export function useRouteLoading(
  router: Partial<Pick<Router, 'beforeEach' | 'afterEach' | 'onError'>> | null | undefined,
  options: UseRouteLoadingOptions = {},
) {
  const showDelayMs = options.showDelayMs ?? 80;
  const slowThresholdMs = options.slowThresholdMs ?? 150;
  const finishDelayMs = options.finishDelayMs ?? 180;

  const isNavigating = ref(false);
  const progress = ref(0);
  const isFadingOut = ref(false);
  const showSlowIndicator = ref(false);
  const pendingPath = ref<string | null>(null);

  let navigationToken = 0;
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  let slowTimer: ReturnType<typeof setTimeout> | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let finishTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = (): void => {
    if (showTimer !== null) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (progressTimer !== null) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    if (slowTimer !== null) {
      clearTimeout(slowTimer);
      slowTimer = null;
    }
    if (fadeTimer !== null) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
    if (finishTimer !== null) {
      clearTimeout(finishTimer);
      finishTimer = null;
    }
  };

  const beginVisibleProgress = (token: number): void => {
    if (token !== navigationToken) return;
    isNavigating.value = true;
    isFadingOut.value = false;
    progress.value = Math.max(progress.value, 18);

    if (progressTimer === null) {
      progressTimer = setInterval(() => {
        if (token !== navigationToken) return;
        progress.value = Math.min(88, progress.value + (90 - progress.value) * 0.18);
      }, 120);
    }
  };

  const start = (targetPath: string): void => {
    if (pendingPath.value && pendingPath.value === targetPath) {
      return;
    }

    const alreadyVisible = isNavigating.value && !isFadingOut.value;
    const token = ++navigationToken;
    clearTimers();
    pendingPath.value = targetPath;
    isFadingOut.value = false;
    showSlowIndicator.value = false;

    if (alreadyVisible) {
      beginVisibleProgress(token);
    } else {
      progress.value = 0;
      if (showDelayMs <= 0) {
        beginVisibleProgress(token);
      } else {
        showTimer = setTimeout(() => {
          showTimer = null;
          beginVisibleProgress(token);
        }, showDelayMs);
      }
    }

    slowTimer = setTimeout(() => {
      if (token !== navigationToken) return;
      if (!isNavigating.value) {
        beginVisibleProgress(token);
      }
      showSlowIndicator.value = true;
    }, slowThresholdMs);
  };

  const finish = (): void => {
    const token = navigationToken;
    pendingPath.value = null;
    clearTimers();
    showSlowIndicator.value = false;
    if (!isNavigating.value) {
      progress.value = 0;
      return;
    }

    progress.value = 100;
    fadeTimer = setTimeout(() => {
      if (token !== navigationToken) return;
      isFadingOut.value = true;
    }, finishDelayMs);

    finishTimer = setTimeout(() => {
      if (token !== navigationToken) return;
      isNavigating.value = false;
      isFadingOut.value = false;
      progress.value = 0;
    }, finishDelayMs + 150);
  };

  const removeBeforeEach = router?.beforeEach?.((to, from) => {
    if (from?.matched?.length > 0 && to?.path !== from?.path) {
      start(to.path);
    }
  });
  const removeAfterEach = router?.afterEach?.(() => {
    finish();
  });
  const removeOnError = router?.onError?.(() => {
    finish();
  });

  const cleanup = () => {
    navigationToken++;
    pendingPath.value = null;
    clearTimers();
    if (typeof removeBeforeEach === 'function') removeBeforeEach();
    if (typeof removeAfterEach === 'function') removeAfterEach();
    if (typeof removeOnError === 'function') removeOnError();
  };

  if (getCurrentInstance()) {
    onUnmounted(cleanup);
  }

  return {
    isNavigating,
    progress,
    isFadingOut,
    showSlowIndicator,
    pendingPath,
    cleanup,
  };
}
