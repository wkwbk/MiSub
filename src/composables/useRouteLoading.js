import { getCurrentInstance, onUnmounted, ref } from 'vue';

/**
 * Tracks route navigation progress and delayed slow-load state for lazy-loaded views.
 */
export function useRouteLoading(router, options = {}) {
    const slowThresholdMs = options.slowThresholdMs ?? 150;
    const finishDelayMs = options.finishDelayMs ?? 180;

    const isNavigating = ref(false);
    const progress = ref(0);
    const isFadingOut = ref(false);
    const showSlowIndicator = ref(false);

    let navigationToken = 0;
    let progressTimer = null;
    let slowTimer = null;
    let fadeTimer = null;
    let finishTimer = null;

    const clearTimers = () => {
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

    const start = () => {
        const token = ++navigationToken;
        clearTimers();
        isNavigating.value = true;
        isFadingOut.value = false;
        showSlowIndicator.value = false;
        progress.value = 18;

        progressTimer = setInterval(() => {
            if (token !== navigationToken) return;
            progress.value = Math.min(88, progress.value + (90 - progress.value) * 0.18);
        }, 120);

        slowTimer = setTimeout(() => {
            if (token !== navigationToken) return;
            showSlowIndicator.value = true;
        }, slowThresholdMs);
    };

    const finish = () => {
        const token = navigationToken;
        clearTimers();
        showSlowIndicator.value = false;
        if (!isNavigating.value) return;

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
            start();
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
        cleanup,
    };
}
