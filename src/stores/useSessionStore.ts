import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import router from '@/router';
import { fetchInitialData, fetchPublicConfig, login as apiLogin, logoutSession } from '@/lib/api.js';
import { handleError } from '@/utils/error-handler.js';
import { useDataStore } from '@/stores/useDataStore.js';
import type { AppSettingsConfig, RawAppDataPayload } from '@/queries/useAppDataQueries.js';
import { t } from '@/i18n/index.js';
import { resolveSafeLoginRedirect } from '@/utils/login-path.js';

export type SessionState = 'loading' | 'loggedIn' | 'loggedOut';

interface TurnstilePublicConfig {
  siteKey: string;
  enableForGuestbook: boolean;
  enableForLogin: boolean;
  [key: string]: unknown;
}

interface CustomPagePublicConfig {
  enabled: boolean;
  useDefaultLayout: boolean;
  allowExternalStylesheets: boolean;
  allowScripts: boolean;
  hideBranding: boolean;
  hideHeader: boolean;
  hideFooter: boolean;
  [key: string]: unknown;
}

export interface PublicConfig {
  enablePublicPage: boolean;
  isLoginPath: boolean;
  hasCustomLoginPath: boolean;
  defaultLocale?: string;
  turnstile: TurnstilePublicConfig;
  customPage: CustomPagePublicConfig;
  [key: string]: unknown;
}

export const useSessionStore = defineStore('session', () => {
  const sessionState = ref<SessionState>('loading');
  const isLoggingOut = ref(false);
  const initialData = shallowRef<RawAppDataPayload | null>(null);
  const subscriptionConfig = ref<Partial<AppSettingsConfig>>({});
  const defaultPublicConfig: PublicConfig = Object.freeze({
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

  const disabledPublicConfig: PublicConfig = Object.freeze({
    ...defaultPublicConfig,
    enablePublicPage: false,
  });

  const publicConfig = ref<PublicConfig>({
    ...defaultPublicConfig,
    turnstile: { ...defaultPublicConfig.turnstile },
    customPage: { ...defaultPublicConfig.customPage },
  });
  const verifiedLoginPath = ref('');
  const hasLoadedPublicConfig = ref(false);

  async function checkSession(): Promise<void> {
    const currentPathname = typeof window !== 'undefined' ? window.location?.pathname || '' : '';
    const [dataResult, pConfigResult] = await Promise.all([fetchInitialData(), fetchPublicConfig()]);

    if (pConfigResult.success) {
      const nextPublicConfig = pConfigResult.data as PublicConfig;
      publicConfig.value = nextPublicConfig;
      verifiedLoginPath.value = nextPublicConfig?.isLoginPath ? currentPathname : '';
      hasLoadedPublicConfig.value = true;
    } else if (!hasLoadedPublicConfig.value) {
      publicConfig.value = {
        ...disabledPublicConfig,
        turnstile: { ...disabledPublicConfig.turnstile },
        customPage: { ...disabledPublicConfig.customPage },
      };
      verifiedLoginPath.value = '';
    }

    if (dataResult.success) {
      const payload = dataResult.data as RawAppDataPayload;
      initialData.value = payload;
      if (payload?.config) {
        subscriptionConfig.value = payload.config;
      }

      const dataStore = useDataStore();
      dataStore.hydrateFromData(payload);

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

  async function login(password: string, turnstileToken = ''): Promise<void> {
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

  async function handleLoginSuccess(): Promise<boolean> {
    await checkSession();
    return sessionState.value === 'loggedIn';
  }

  let logoutInFlightPromise: Promise<boolean | undefined> | null = null;

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

  function syncVerifiedCustomLoginPath(): void {
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

  async function handleUnauthorized(): Promise<boolean> {
    if (sessionState.value !== 'loggedIn') return false;
    syncVerifiedCustomLoginPath();
    sessionState.value = 'loggedOut';
    initialData.value = null;
    useDataStore().clearCachedData();
    return true;
  }

  function logout(): Promise<boolean | undefined> {
    if (logoutInFlightPromise) {
      return logoutInFlightPromise;
    }

    logoutInFlightPromise = (async (): Promise<boolean | undefined> => {
      let logoutConfirmed = false;
      try {
        await logoutSession();
        logoutConfirmed = true;
      } catch (error: unknown) {
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
      return undefined;
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
