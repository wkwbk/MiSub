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

    // Navigating to slow async route starts progress immediately
    const navPromise = router.push('/b');
    await vi.advanceTimersByTimeAsync(0);
    expect(state.isNavigating.value).toBe(true);
    expect(state.progress.value).toBeGreaterThan(0);
    expect(state.showSlowIndicator.value).toBe(false);

    // Exceeding slow threshold reveals the slow indicator
    await vi.advanceTimersByTimeAsync(160);
    expect(state.showSlowIndicator.value).toBe(true);
    expect(state.progress.value).toBeGreaterThan(18);

    // Resolving the async route completes progress to 100 and hides slow indicator
    resolveAsyncRoute(SimplePage('B'));
    await navPromise;
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
