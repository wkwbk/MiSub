import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import router from '@/router';
import { fetchInitialData, fetchPublicConfig, login as apiLogin } from '@/lib/api';
import { api } from '@/lib/http.js';
import { handleError } from '@/utils/error-handler.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { t } from '@/i18n/index.js';
import { resolveSafeLoginRedirect } from '@/utils/login-path.js';

export const useSessionStore = defineStore('session', () => {
  const sessionState = ref('loading');
  const isLoggingOut = ref(false);
  const initialData = shallowRef(null);
  const subscriptionConfig = ref({});
  const defaultPublicConfig = Object.freeze({
    enablePublicPage: true,
    isLoginPath: false,
    hasCustomLoginPath: false,
    turnstile: {
      siteKey: '',
      enableForGuestbook: false,
      enableForLogin: false,
    },
    customPage: {
      enabled: false,
      useDefaultLayout: true,
      allowExternalStylesheets: false,
      allowScripts: false,
      hideBranding: false,
      hideHeader: false,
      hideFooter: false,
    },
  });

  const disabledPublicConfig = Object.freeze({
    ...defaultPublicConfig,
    enablePublicPage: false,
  });

  /**
   * @type {import('vue').Ref<Record<string, any> & {
   *   enablePublicPage: boolean;
   *   isLoginPath: boolean;
   *   hasCustomLoginPath: boolean;
   *   defaultLocale?: string;
   *   turnstile: Record<string, any>;
   *   customPage: Record<string, any>;
   * }>}
   */
  const publicConfig = ref({
    ...defaultPublicConfig,
    customPage: { ...defaultPublicConfig.customPage },
  });
  const verifiedLoginPath = ref('');
  const hasLoadedPublicConfig = ref(false);

  async function checkSession() {
    const currentPathname = typeof window !== 'undefined' ? window.location?.pathname || '' : '';
    const [dataResult, pConfigResult] = await Promise.all([fetchInitialData(), fetchPublicConfig()]);

    if (pConfigResult.success) {
      publicConfig.value = pConfigResult.data;
      verifiedLoginPath.value = pConfigResult.data?.isLoginPath ? currentPathname : '';
      hasLoadedPublicConfig.value = true;
    } else if (!hasLoadedPublicConfig.value) {
      publicConfig.value = {
        ...disabledPublicConfig,
        customPage: { ...disabledPublicConfig.customPage },
      };
      verifiedLoginPath.value = '';
    }

    if (dataResult.success) {
      initialData.value = dataResult.data;
      if (dataResult.data.config) {
        subscriptionConfig.value = dataResult.data.config;
      }

      const dataStore = useDataStore();
      dataStore.hydrateFromData(dataResult.data);

      sessionState.value = 'loggedIn';
    } else {
      if (dataResult.errorType === 'auth') {
        sessionState.value = 'loggedOut';
      } else {
        console.error('Session check failed:', dataResult.error);
        handleError(
          new Error(dataResult.error || t('settings.sessionCheckFailed')),
          t('settings.sessionCheckContext'),
          {
            errorType: dataResult.errorType,
          },
        );
        sessionState.value = 'loggedOut';
      }
    }
  }

  async function login(password, turnstileToken = '') {
    const result = await apiLogin(password, turnstileToken);
    if (result.success) {
      const authenticated = await handleLoginSuccess();
      if (!authenticated) {
        throw new Error(t('settings.sessionCheckFailed'));
      }
      const currentPath = router.currentRoute?.value?.path;
      const target = resolveSafeLoginRedirect(
        router.currentRoute?.value?.query?.redirect,
        '/dashboard',
        currentPath ? [currentPath] : [],
      );
      await router.push(target);
    } else {
      throw new Error(result.error || t('settings.loginFailed'));
    }
  }

  async function handleLoginSuccess() {
    await checkSession();
    return sessionState.value === 'loggedIn';
  }

  let logoutInFlightPromise = null;

  const loginPath = computed(() => {
    if (publicConfig.value?.hasCustomLoginPath) {
      const ownPath = subscriptionConfig.value?.customLoginPath;
      const normalized = typeof ownPath === 'string' ? ownPath.trim().replace(/^\/+/, '') : '';
      if (normalized && normalized !== 'login') return `/${normalized}`;
      if (verifiedLoginPath.value && verifiedLoginPath.value !== '/login') return verifiedLoginPath.value;
      return '/';
    }
    return '/login';
  });

  function syncVerifiedCustomLoginPath() {
    if (!publicConfig.value?.hasCustomLoginPath) return;
    const knownLoginPath = loginPath.value;
    if (knownLoginPath && knownLoginPath !== '/' && knownLoginPath !== '/login') {
      verifiedLoginPath.value = knownLoginPath;
      publicConfig.value = {
        ...publicConfig.value,
        isLoginPath: true,
      };
    }
  }

  async function handleUnauthorized() {
    if (sessionState.value !== 'loggedIn') return false;
    syncVerifiedCustomLoginPath();
    sessionState.value = 'loggedOut';
    initialData.value = null;
    useDataStore().clearCachedData();
    return true;
  }

  function logout() {
    if (logoutInFlightPromise) {
      return logoutInFlightPromise;
    }

    logoutInFlightPromise = (async () => {
      let logoutConfirmed = false;
      try {
        await api.get('/api/logout');
        logoutConfirmed = true;
      } catch (error) {
        console.warn('Logout request failed:', error);
      }

      if (!logoutConfirmed) {
        const sessionCheck = await fetchInitialData();
        if (sessionCheck.success || sessionCheck.errorType !== 'auth') {
          sessionState.value = 'loggedIn';
          handleError(new Error(t('settings.logoutFailed')), t('settings.logoutContext'), {
            errorType: 'logout_failed',
          });
          return false;
        }
      }

      syncVerifiedCustomLoginPath();

      const isPublicEnabled = publicConfig.value?.enablePublicPage !== false;
      const targetPath = isPublicEnabled ? '/' : loginPath.value;

      isLoggingOut.value = true;
      try {
        sessionState.value = 'loggedOut';
        initialData.value = null;

        const dataStore = useDataStore();
        dataStore.clearCachedData();

        await Promise.resolve(router.push({ path: targetPath })).catch(() => {});
      } finally {
        isLoggingOut.value = false;
      }
    })().finally(() => {
      logoutInFlightPromise = null;
    });

    return logoutInFlightPromise;
  }

  return {
    sessionState,
    isLoggingOut,
    loginPath,
    initialData,
    publicConfig,
    verifiedLoginPath,
    subscriptionConfig,
    checkSession,
    handleUnauthorized,
    login,
    logout,
  };
});
