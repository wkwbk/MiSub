import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const apiMocks = vi.hoisted(() => ({
  fetchInitialData: vi.fn(),
  fetchPublicConfig: vi.fn(),
  login: vi.fn(),
  apiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => apiMocks);
vi.mock('@/lib/http.js', () => ({
  api: { get: apiMocks.apiGet },
}));
vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}));
vi.mock('@/utils/error-handler.js', () => ({
  handleError: vi.fn(),
}));

describe('session store resilience', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('falls back to the default login entry when public config cannot be fetched', async () => {
    const { useSessionStore } = await import('@/stores/useSessionStore.js');
    const store = useSessionStore();

    apiMocks.fetchInitialData.mockResolvedValue({
      success: false,
      error: '认证失败,请重新登录',
      errorType: 'auth',
    });
    apiMocks.fetchPublicConfig.mockResolvedValue({
      success: false,
      error: 'HTTP 500',
      errorType: 'server',
    });

    await store.checkSession();

    expect(store.sessionState).toBe('loggedOut');
    expect(store.publicConfig.hasCustomLoginPath).toBe(false);
    expect(store.publicConfig.enablePublicPage).toBe(false);
  });

  it('does not let a failed public config request mask a successful authenticated session', async () => {
    const { useSessionStore } = await import('@/stores/useSessionStore.js');
    const store = useSessionStore();

    const data = {
      config: { fileName: 'MiSub' },
      misubs: [],
      profiles: [],
    };

    apiMocks.fetchInitialData.mockResolvedValue({ success: true, data });
    apiMocks.fetchPublicConfig.mockResolvedValue({
      success: false,
      error: 'HTTP 500',
      errorType: 'server',
    });

    await store.checkSession();

    expect(store.sessionState).toBe('loggedIn');
    expect(store.initialData).toEqual(data);
    expect(store.publicConfig.hasCustomLoginPath).toBe(false);
  });

  it('preserves the last known public config after a later fetch failure', async () => {
    const { useSessionStore } = await import('@/stores/useSessionStore.js');
    const store = useSessionStore();
    const data = { config: {}, misubs: [], profiles: [] };
    apiMocks.fetchInitialData.mockResolvedValue({ success: true, data });
    apiMocks.fetchPublicConfig.mockResolvedValueOnce({
      success: true,
      data: { hasCustomLoginPath: true, isLoginPath: false, enablePublicPage: true },
    });
    await store.checkSession();

    apiMocks.fetchPublicConfig.mockResolvedValueOnce({ success: false, error: 'network down' });
    await store.checkSession();

    expect(store.publicConfig.hasCustomLoginPath).toBe(true);
    expect(store.publicConfig.enablePublicPage).toBe(true);
  });

  it('keeps a failed logout from claiming the session was cleared', async () => {
    const { useSessionStore } = await import('@/stores/useSessionStore.js');
    const store = useSessionStore();
    store.sessionState = 'loggedIn';
    apiMocks.apiGet.mockRejectedValue(new Error('network down'));
    apiMocks.fetchInitialData.mockResolvedValue({ success: true, data: {} });

    const errorSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(store.logout()).resolves.toBe(false);
      expect(store.sessionState).toBe('loggedIn');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('waits for session confirmation before redirecting after login', async () => {
    const { useSessionStore } = await import('@/stores/useSessionStore.js');
    const store = useSessionStore();
    apiMocks.login.mockResolvedValue({ success: true, data: {} });
    apiMocks.fetchInitialData.mockResolvedValue({ success: true, data: {} });
    apiMocks.fetchPublicConfig.mockResolvedValue({ success: true, data: {} });

    await store.login('password');

    expect(store.sessionState).toBe('loggedIn');
  });

  it('keeps sessionState as loggedOut without switching to loading when post-login session check fails', async () => {
    const { useSessionStore } = await import('@/stores/useSessionStore.js');
    const store = useSessionStore();
    store.sessionState = 'loggedOut';

    const observedStates = [];
    apiMocks.login.mockResolvedValue({ success: true, data: {} });
    apiMocks.fetchInitialData.mockImplementation(async () => {
      observedStates.push(store.sessionState);
      return {
        success: false,
        error: '认证失败,请重新登录',
        errorType: 'auth',
      };
    });
    apiMocks.fetchPublicConfig.mockResolvedValue({ success: true, data: {} });

    await expect(store.login('admin')).rejects.toThrow();
    expect(observedStates).toEqual(['loggedOut']);
    expect(store.sessionState).toBe('loggedOut');
  });

  it('keeps custom login path verified and flags isLoggingOut while logout navigates to home', async () => {
    const router = (await import('@/router')).default;
    const { useSessionStore } = await import('@/stores/useSessionStore.js');
    const store = useSessionStore();

    store.sessionState = 'loggedIn';
    store.publicConfig = {
      ...store.publicConfig,
      enablePublicPage: true,
      hasCustomLoginPath: true,
      isLoginPath: false,
    };
    store.subscriptionConfig = { customLoginPath: '/secret-admin' };
    apiMocks.apiGet.mockResolvedValue({ success: true });

    let isLoggingOutDuringPush = false;
    let resolvePush;
    router.push.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          isLoggingOutDuringPush = store.isLoggingOut;
          resolvePush = resolve;
        }),
    );

    const logoutPromise = store.logout();
    await Promise.resolve();
    await Promise.resolve();

    expect(isLoggingOutDuringPush).toBe(true);
    expect(store.isLoggingOut).toBe(true);
    expect(store.sessionState).toBe('loggedOut');
    expect(store.verifiedLoginPath).toBe('/secret-admin');
    expect(store.publicConfig.isLoginPath).toBe(true);
    expect(router.push).toHaveBeenCalledWith({ path: '/' });

    resolvePush();
    await logoutPromise;
    expect(store.isLoggingOut).toBe(false);
  });

  it('marks custom login path as verified on unauthorized session expiry', async () => {
    const { useSessionStore } = await import('@/stores/useSessionStore.js');
    const store = useSessionStore();

    store.sessionState = 'loggedIn';
    store.publicConfig = {
      ...store.publicConfig,
      enablePublicPage: true,
      hasCustomLoginPath: true,
      isLoginPath: false,
    };
    store.subscriptionConfig = { customLoginPath: 'secret-admin' };

    const changed = await store.handleUnauthorized();

    expect(changed).toBe(true);
    expect(store.sessionState).toBe('loggedOut');
    expect(store.verifiedLoginPath).toBe('/secret-admin');
    expect(store.publicConfig.isLoginPath).toBe(true);
    expect(store.loginPath).toBe('/secret-admin');
  });

  it('deduplicates concurrent logout calls while a logout request is in flight', async () => {
    const { useSessionStore } = await import('@/stores/useSessionStore.js');
    const store = useSessionStore();

    store.sessionState = 'loggedIn';
    let resolveLogoutRequest;
    apiMocks.apiGet.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogoutRequest = resolve;
        }),
    );

    const first = store.logout();
    const second = store.logout();

    expect(apiMocks.apiGet).toHaveBeenCalledTimes(1);

    resolveLogoutRequest({ success: true });
    await Promise.all([first, second]);
    expect(apiMocks.apiGet).toHaveBeenCalledTimes(1);
    expect(store.sessionState).toBe('loggedOut');
  });
});
