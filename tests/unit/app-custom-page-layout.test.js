import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import App from '@/App.vue';
import { useSessionStore } from '@/stores/useSessionStore.js';
import { useUIStore } from '@/stores/useUiStore.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { useVersionStore } from '@/stores/useVersionStore.js';

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    defineAsyncComponent: () => ({ name: 'AsyncComponentStub', render: () => null }),
  };
});

vi.mock('@/router/index.js', () => ({
  COMMON_DASHBOARD_ROUTE_LOADERS: [],
  configureAuthGuard: vi.fn(),
  translateRouteTitle: () => 'MiSub',
}));

vi.mock('@/composables/useSubscriptions.js', () => ({
  useSubscriptions: () => ({
    startAutoUpdate: vi.fn(),
    stopAutoUpdate: vi.fn(),
    restartAutoUpdate: vi.fn(),
  }),
}));

vi.mock('@/lib/api.js', () => ({
  fetchInitialData: vi.fn().mockResolvedValue({ success: false }),
  fetchPublicConfig: vi.fn().mockResolvedValue({ success: false }),
  login: vi.fn().mockResolvedValue({ success: false }),
  logoutSession: vi.fn().mockResolvedValue({ success: true }),
}));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'Home', component: { render: () => null }, meta: { isPublic: true } },
      { path: '/explore', name: 'Explore', component: { render: () => null }, meta: { isPublic: true } },
      { path: '/dashboard', name: 'Dashboard', component: { render: () => null }, meta: { requiresAuth: true } },
    ],
  });
}

async function mountApp({ path, sessionState, layoutMode }) {
  const pinia = createPinia();
  setActivePinia(pinia);

  const sessionStore = useSessionStore();
  vi.spyOn(sessionStore, 'checkSession').mockResolvedValue(undefined);
  sessionStore.sessionState = sessionState;
  sessionStore.publicConfig = {
    enablePublicPage: true,
    isLoginPath: false,
    hasCustomLoginPath: false,
    turnstile: { siteKey: '', enableForGuestbook: false, enableForLogin: false },
    customPage: {
      enabled: true,
      useDefaultLayout: false,
      allowExternalStylesheets: false,
      allowScripts: false,
      hideBranding: true,
      hideHeader: true,
      hideFooter: true,
    },
  };

  const dataStore = useDataStore();
  vi.spyOn(dataStore, 'fetchData').mockResolvedValue(undefined);

  const versionStore = useVersionStore();
  vi.spyOn(versionStore, 'checkVersion').mockResolvedValue(undefined);

  const uiStore = useUIStore();
  uiStore.layoutMode = layoutMode;

  const router = makeRouter();
  await router.push(path);
  await router.isReady();

  const wrapper = mount(App, {
    shallow: true,
    global: {
      plugins: [pinia, router],
    },
  });
  await flushPromises();
  return wrapper;
}

describe('App.vue custom page full-width container guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('keeps centered max-w-7xl container for classic (legacy) layout on "/" even when customPage disables default layout', async () => {
    const wrapper = await mountApp({ path: '/', sessionState: 'loggedIn', layoutMode: 'legacy' });
    const main = wrapper.find('main');
    expect(main.classes()).toContain('max-w-7xl');
    expect(main.classes()).toContain('mx-auto');
    wrapper.unmount();
  });

  it('keeps centered max-w-7xl container for classic (legacy) layout on "/explore" as well', async () => {
    const wrapper = await mountApp({ path: '/explore', sessionState: 'loggedIn', layoutMode: 'legacy' });
    const main = wrapper.find('main');
    expect(main.classes()).toContain('max-w-7xl');
    expect(main.classes()).toContain('mx-auto');
    wrapper.unmount();
  });

  it('allows full-width container for logged-in modern layout previewing "/explore"', async () => {
    const wrapper = await mountApp({ path: '/explore', sessionState: 'loggedIn', layoutMode: 'modern' });
    const main = wrapper.find('main');
    expect(main.classes()).not.toContain('max-w-7xl');
    wrapper.unmount();
  });

  it('allows full-width container for logged-out public visitors on "/"', async () => {
    const wrapper = await mountApp({ path: '/', sessionState: 'loggedOut', layoutMode: 'legacy' });
    const main = wrapper.find('main');
    expect(main.classes()).not.toContain('max-w-7xl');
    wrapper.unmount();
  });
});
