import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useRouteLoading } from '@/composables/useRouteLoading.js';
import RouteProgressBar from '@/components/ui/RouteProgressBar.vue';

vi.mock('@/i18n/index.js', () => ({
  useI18n: () => ({
    t: (key) => (key === 'common.loading' ? 'Loading...' : key),
  }),
}));

const SimplePage = (label) =>
  defineComponent({
    render: () => h('div', { class: 'page' }, label),
  });

describe('useRouteLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks async route loading, slow indicator, and completion', async () => {
    let resolveAsyncRoute;
    const asyncRoutePromise = new Promise((resolve) => {
      resolveAsyncRoute = resolve;
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/a', component: SimplePage('A') },
        { path: '/b', component: () => asyncRoutePromise },
      ],
    });

    const state = useRouteLoading(router, {
      showDelayMs: 80,
      slowThresholdMs: 150,
      finishDelayMs: 180,
    });

    // Initial navigation should not trigger loading bar
    await router.push('/a');
    await router.isReady();
    expect(state.isNavigating.value).toBe(false);

    // Same-path query change should not trigger loading bar
    await router.push('/a?tab=1');
    expect(state.isNavigating.value).toBe(false);

    // Navigating to slow async route records pendingPath immediately and shows bar after showDelayMs
    const navPromise = router.push('/b');
    await vi.advanceTimersByTimeAsync(0);
    expect(state.pendingPath.value).toBe('/b');
    expect(state.isNavigating.value).toBe(false);

    await vi.advanceTimersByTimeAsync(80);
    expect(state.isNavigating.value).toBe(true);
    expect(state.progress.value).toBeGreaterThan(0);
    expect(state.showSlowIndicator.value).toBe(false);

    // Exceeding slow threshold reveals the slow indicator and advances progress
    await vi.advanceTimersByTimeAsync(120);
    expect(state.showSlowIndicator.value).toBe(true);
    expect(state.progress.value).toBeGreaterThan(18);

    // Resolving the async route completes progress to 100 and hides slow indicator
    resolveAsyncRoute(SimplePage('B'));
    await navPromise;
    expect(state.pendingPath.value).toBe(null);
    expect(state.showSlowIndicator.value).toBe(false);
    expect(state.progress.value).toBe(100);
    expect(state.isFadingOut.value).toBe(false);

    // After finish delay, bar begins fading out while staying mounted
    await vi.advanceTimersByTimeAsync(180);
    expect(state.isFadingOut.value).toBe(true);
    expect(state.isNavigating.value).toBe(true);

    // After fade out completes, navigating state resets
    await vi.advanceTimersByTimeAsync(150);
    expect(state.isNavigating.value).toBe(false);
    expect(state.isFadingOut.value).toBe(false);
    expect(state.progress.value).toBe(0);

    state.cleanup();
  });

  it('does not reset progress when repeatedly clicking the same in-flight route', async () => {
    let resolveAsyncRoute;
    const asyncRoutePromise = new Promise((resolve) => {
      resolveAsyncRoute = resolve;
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/a', component: SimplePage('A') },
        { path: '/b', component: () => asyncRoutePromise },
      ],
    });

    const state = useRouteLoading(router, {
      showDelayMs: 0,
      slowThresholdMs: 150,
      finishDelayMs: 180,
    });

    await router.push('/a');
    await router.isReady();

    const firstNav = router.push('/b').catch(() => {});
    await vi.advanceTimersByTimeAsync(250);
    const progressBeforeDuplicateClick = state.progress.value;
    expect(progressBeforeDuplicateClick).toBeGreaterThan(18);
    expect(state.showSlowIndicator.value).toBe(true);

    // Clicking the same target again while in-flight must not reset progress back to 18%
    const secondNav = router.push('/b');
    await vi.advanceTimersByTimeAsync(0);
    expect(state.progress.value).toBeGreaterThanOrEqual(progressBeforeDuplicateClick);
    expect(state.showSlowIndicator.value).toBe(true);

    resolveAsyncRoute(SimplePage('B'));
    await Promise.allSettled([firstNav, secondNav]);
    expect(state.progress.value).toBe(100);
    expect(state.pendingPath.value).toBe(null);

    state.cleanup();
  });

  it('skips showing progress bar for fast cached routes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/a', component: SimplePage('A') },
        { path: '/b', component: SimplePage('B') },
      ],
    });

    const state = useRouteLoading(router, {
      showDelayMs: 80,
      slowThresholdMs: 150,
      finishDelayMs: 180,
    });

    await router.push('/a');
    await router.isReady();

    await router.push('/b');
    expect(state.isNavigating.value).toBe(false);
    expect(state.progress.value).toBe(0);

    await vi.advanceTimersByTimeAsync(200);
    expect(state.isNavigating.value).toBe(false);

    state.cleanup();
  });

  it('renders RouteProgressBar and slow loading overlay', () => {
    const wrapper = mount(RouteProgressBar, {
      props: {
        isNavigating: true,
        progress: 65,
        showSlowIndicator: true,
      },
    });

    const bar = wrapper.find('[style*="width: 65%"]');
    expect(bar.exists()).toBe(true);
    expect(wrapper.find('[role="status"]').text()).toContain('Loading...');
  });
});
