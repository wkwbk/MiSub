import { computed, ref } from 'vue';
import { getActivePinia } from 'pinia';
import { useToastStore } from '@/stores/useToastStore.js';
import { useSettingsStore } from '@/stores/useSettingsStore.js';
import { useSessionStore } from '@/stores/useSessionStore.js';
import { DEFAULT_SETTINGS } from '@/constants/default-settings.js';
import type { ExternalApiConfig, SmartPreset, TransformMode } from '@misub/core/types.js';
import {
  clearAppDataQueryCache,
  fetchSettingsWithQueryClient,
  syncSettingsSnapshotToCache,
  type AppSettingsConfig,
  type SaveSettingsResponse,
} from '@/queries/useAppDataQueries.js';
import { resolveComponentQueryClient } from '@/lib/query-client.js';
import { fetchSettings, resetSettings, saveSettings } from '@/lib/api.js';
import { useBackupLogic } from '@/composables/useBackupLogic.js';
import { setLocale, t } from '@/i18n/index.js';
import { confirmAction } from '@/composables/useConfirm.js';
import { extractErrorMessage } from '@/utils/error-handler.js';
import { clearAllPreferences } from '@/utils/local-preference.js';
import { isValidHttpUrlString } from '@misub/core/utils/url-validators.js';
import { normalizeAdvancedBaseConfig, normalizeCustomVisualRules } from '@misub/core/domain/visual-rules-catalog.js';

export interface DisguiseConfig {
  pageType: 'default' | 'redirect';
  redirectUrl: string;
}

interface ApiFailureShape {
  success?: boolean;
  error?: string;
  message?: string;
}

function normalizeExternalApiConfig(value: unknown): ExternalApiConfig {
  const defaults = DEFAULT_SETTINGS.externalApi;
  const externalApi = value && typeof value === 'object' ? (value as Partial<ExternalApiConfig>) : {};
  const tokens = Array.isArray(externalApi.tokens)
    ? externalApi.tokens
        .map((item, index) => ({
          name: String(item?.name || `token-${index + 1}`).trim() || `token-${index + 1}`,
          token: String(item?.token || '').trim(),
        }))
        .filter((item) => item.token || item.name)
    : [];

  return {
    ...defaults,
    ...externalApi,
    tokens: tokens.length > 0 ? tokens : defaults.tokens.map((item) => ({ ...item })),
  };
}

function normalizeSettingsObject(source: Partial<AppSettingsConfig> = {}): AppSettingsConfig {
  const {
    publicLinks: _omitPublicLinks,
    publicCores: _omitPublicCores,
    transformConfigMode: _omitLegacyMode,
    transformConfig: _omitLegacyConfig,
    ruleLevel: _omitRuleLevel,
    builtinTransform: _omitBuiltinTransform,
    builtinEnableUdp: _omitBuiltinUdp,
    builtinSkipCertVerify: _omitBuiltinScv,
    subconverter: _omitSubconverter,
    ...cleanSource
  } = source as Partial<AppSettingsConfig> & Record<string, unknown>;
  const merged = {
    ...DEFAULT_SETTINGS,
    ...cleanSource,
  } as AppSettingsConfig;
  const rawMode = String(cleanSource.transformMode || merged.transformMode || 'smart');
  merged.transformMode = (rawMode === 'template' || rawMode === 'external' ? rawMode : 'smart') as TransformMode;
  const rawPreset = String(cleanSource.smartPreset || merged.smartPreset || 'balanced');
  merged.smartPreset = (
    rawPreset === 'minimal' || rawPreset === 'balanced' || rawPreset === 'full' ? rawPreset : 'balanced'
  ) as SmartPreset;
  merged.enableRelay = Boolean(merged.enableRelay);
  merged.templateConfig = typeof merged.templateConfig === 'string' ? merged.templateConfig : '';
  merged.customVisualRules = normalizeCustomVisualRules(cleanSource.customVisualRules ?? merged.customVisualRules, {
    smartPreset: merged.smartPreset,
    allowEmptyName: true,
  });
  merged.advancedBaseConfig = normalizeAdvancedBaseConfig(cleanSource.advancedBaseConfig ?? merged.advancedBaseConfig);
  merged.enableUdp = merged.enableUdp !== false;
  merged.skipCertVerify = Boolean(merged.skipCertVerify);
  merged.enableFlagEmoji = merged.enableFlagEmoji !== false;
  const srcExternal =
    cleanSource.externalBackend && typeof cleanSource.externalBackend === 'object'
      ? cleanSource.externalBackend
      : merged.externalBackend;
  merged.externalBackend = {
    url:
      typeof srcExternal?.url === 'string' && srcExternal.url.trim()
        ? srcExternal.url.trim()
        : DEFAULT_SETTINGS.externalBackend.url,
    templateUrl: typeof srcExternal?.templateUrl === 'string' ? srcExternal.templateUrl : '',
    sort: Boolean(srcExternal?.sort),
    tfo: Boolean(srcExternal?.tfo),
    list: Boolean(srcExternal?.list),
  };
  merged.externalApi = normalizeExternalApiConfig(source.externalApi ?? merged.externalApi);
  merged.shortLink = {
    ...DEFAULT_SETTINGS.shortLink,
    ...(source.shortLink && typeof source.shortLink === 'object' ? source.shortLink : {}),
  };
  merged.turnstile = {
    ...DEFAULT_SETTINGS.turnstile,
    ...(source.turnstile && typeof source.turnstile === 'object' ? source.turnstile : {}),
  };
  merged.subPortalMode =
    merged.subPortalMode === 'redirect' || merged.subPortalMode === 'raw' ? merged.subPortalMode : 'portal';
  merged.subPortalRedirectUrl = typeof merged.subPortalRedirectUrl === 'string' ? merged.subPortalRedirectUrl : '';
  merged.subPortalTitle = typeof merged.subPortalTitle === 'string' ? merged.subPortalTitle : '';
  merged.subPortalNotice = typeof merged.subPortalNotice === 'string' ? merged.subPortalNotice : '';
  merged.defaultMultiSocksEnabled = Boolean(merged.defaultMultiSocksEnabled);
  merged.defaultMultiSocksLite = Boolean(merged.defaultMultiSocksLite);
  merged.dnsMode = merged.dnsMode === 'polluted' ? 'polluted' : 'clean';
  const parsedStartPort = Number(merged.defaultMultiSocksStartPort);
  merged.defaultMultiSocksStartPort =
    Number.isInteger(parsedStartPort) && parsedStartPort >= 1024 && parsedStartPort <= 60000 ? parsedStartPort : 42001;
  merged.defaultMultiSocksListen = merged.defaultMultiSocksListen === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1';
  const rawPortalCustom =
    source.portalCustomPage && typeof source.portalCustomPage === 'object'
      ? source.portalCustomPage
      : merged.portalCustomPage;
  merged.portalCustomPage = {
    ...DEFAULT_SETTINGS.portalCustomPage,
    ...(rawPortalCustom && typeof rawPortalCustom === 'object' ? rawPortalCustom : {}),
    type: 'html',
  };
  return merged as AppSettingsConfig;
}

/**
 * 设置页面的核心逻辑 composable
 * 用于 SettingsView.vue 和 SettingsPanel.vue 的代码复用
 */
export function useSettingsLogic() {
  const { showToast } = useToastStore();
  const capturedQueryClient = getActivePinia() ? resolveComponentQueryClient() : null;
  const getActiveQueryClient = () => {
    if (!getActivePinia()) return null;
    return capturedQueryClient || resolveComponentQueryClient();
  };

  // 使用备份 composable
  const { exportBackup, importBackup } = useBackupLogic();

  // ========== 状态定义 ==========
  const settings = ref<AppSettingsConfig>(normalizeSettingsObject(DEFAULT_SETTINGS as Partial<AppSettingsConfig>));
  const isLoading = ref(false);
  const isSaving = ref(false);

  // 嵌套配置对象（拦截响应策略）
  const disguiseConfig = ref<DisguiseConfig>({
    pageType: 'default',
    redirectUrl: '',
  });

  const applyLoadedSettings = (incoming: Partial<AppSettingsConfig> = {}): void => {
    settings.value = normalizeSettingsObject(incoming);

    const incomingDisguise = settings.value.disguise || DEFAULT_SETTINGS.disguise;
    disguiseConfig.value = {
      pageType: incomingDisguise?.pageType === 'redirect' ? 'redirect' : 'default',
      redirectUrl: typeof incomingDisguise?.redirectUrl === 'string' ? incomingDisguise.redirectUrl : '',
    };

    settings.value.storageType = 'd1';

    // 应用默认显示语言设置
    if (settings.value.defaultLocale) {
      setLocale(settings.value.defaultLocale);
    }
  };

  // ========== 计算属性 ==========
  const hasWhitespace = computed(() => {
    const fieldsCheck = ['fileName', 'myToken', 'profileToken', 'templateConfig', 'botToken', 'chatId'] as const;
    for (const key of fieldsCheck) {
      const value = settings.value[key];
      if (typeof value === 'string' && value && /\s/.test(value)) return true;
    }
    return false;
  });

  // ========== 核心函数 ==========

  /**
   * 从 API 加载设置（命中 Vue Query 缓存时零请求直返）
   */
  const loadSettings = async (options: { force?: boolean } = {}): Promise<void> => {
    isLoading.value = true;
    try {
      const queryClient = getActiveQueryClient();
      const result = (
        queryClient ? await fetchSettingsWithQueryClient(queryClient, options) : await fetchSettings()
      ) as ApiFailureShape & { success?: boolean; data?: unknown };
      if (result.success) {
        const incoming =
          result.data && typeof result.data === 'object' ? (result.data as Partial<AppSettingsConfig>) : {};
        applyLoadedSettings(incoming);
      } else {
        showToast(
          t('settings.loadFailedWithMessage', { message: result.error || result.message || t('settings.loadFailed') }),
          'error',
        );
        settings.value = normalizeSettingsObject(DEFAULT_SETTINGS as Partial<AppSettingsConfig>);
      }
    } catch {
      showToast(t('settings.loadFailed'), 'error');
      settings.value = normalizeSettingsObject(DEFAULT_SETTINGS as Partial<AppSettingsConfig>);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 保存设置到 API
   */
  const handleSave = async (): Promise<boolean> => {
    if (isSaving.value) return false;
    if (hasWhitespace.value) {
      showToast(t('settings.noWhitespace'), 'error');
      return false;
    }
    const redirectUrl = String(settings.value.subPortalRedirectUrl || '').trim();
    if (redirectUrl && !isValidHttpUrlString(redirectUrl)) {
      showToast(t('settings.invalidPortalRedirectUrlError'), 'error');
      return false;
    }
    const startPort = Number(settings.value.defaultMultiSocksStartPort);
    if (!Number.isInteger(startPort) || startPort < 1024 || startPort > 60000) {
      showToast(t('settings.invalidStartPortError'), 'error');
      return false;
    }

    isSaving.value = true;
    try {
      settings.value.storageType = 'd1';
      settings.value.externalApi = normalizeExternalApiConfig(settings.value.externalApi);

      const {
        prefixConfig: _omitPrefixConfig,
        prependSubName: _omitPrependSubName,
        nodeTransform: _omitNodeTransform,
        publicLinks: _omitPublicLinks,
        publicCores: _omitPublicCores,
        ...restSettings
      } = settings.value;

      const settingsToSave: Partial<AppSettingsConfig> = {
        ...restSettings,
        externalApi: normalizeExternalApiConfig(settings.value.externalApi),
        disguise: disguiseConfig.value,
        transformMode: settings.value.transformMode || 'smart',
        smartPreset: settings.value.smartPreset || 'balanced',
        enableRelay: Boolean(settings.value.enableRelay),
        templateConfig: String(settings.value.templateConfig || ''),
        customVisualRules: normalizeCustomVisualRules(settings.value.customVisualRules, {
          smartPreset: settings.value.smartPreset || 'balanced',
          allowEmptyName: false,
        }),
        advancedBaseConfig: normalizeAdvancedBaseConfig(settings.value.advancedBaseConfig),
        enableUdp: settings.value.enableUdp !== false,
        skipCertVerify: Boolean(settings.value.skipCertVerify),
        enableFlagEmoji: settings.value.enableFlagEmoji !== false,
        externalBackend: {
          url: String(settings.value.externalBackend?.url || DEFAULT_SETTINGS.externalBackend.url),
          templateUrl: String(settings.value.externalBackend?.templateUrl || ''),
          sort: Boolean(settings.value.externalBackend?.sort),
          tfo: Boolean(settings.value.externalBackend?.tfo),
          list: Boolean(settings.value.externalBackend?.list),
        },
      };

      const result = (await saveSettings(settingsToSave)) as SaveSettingsResponse & ApiFailureShape;
      if (result.success) {
        const savedData = (
          result.data && typeof result.data === 'object' ? result.data : settingsToSave
        ) as Partial<AppSettingsConfig>;
        applyLoadedSettings(savedData);

        const queryClient = getActiveQueryClient();
        if (getActivePinia()) {
          const settingsStore = useSettingsStore();
          const sessionStore = useSessionStore();
          settingsStore.updateConfig(savedData);
          sessionStore.subscriptionConfig = {
            ...sessionStore.subscriptionConfig,
            ...savedData,
          };
          syncSettingsSnapshotToCache(queryClient, savedData);
        }

        if (result.telegramSync?.attempted && !result.telegramSync.success) {
          showToast(t('settings.savedTelegramSyncFailed'), 'warning');
        } else {
          showToast(t('store.settingsUpdated'), 'success');
        }
        return true;
      } else {
        throw new Error(result.error || result.message || t('settings.saveFailed'));
      }
    } catch (error: unknown) {
      showToast(extractErrorMessage(error, t('settings.saveFailed')), 'error');
      return false;
    } finally {
      isSaving.value = false;
    }
  };

  /**
   * 处理恢复出厂设置
   */
  const handleReset = async (): Promise<void> => {
    const firstConfirmed = await confirmAction({
      message: t('settings.resetConfirm'),
      variant: 'danger',
    });
    if (!firstConfirmed) {
      return;
    }

    const secondConfirmed = await confirmAction({
      message: t('settings.resetConfirmAgain'),
      variant: 'danger',
    });
    if (!secondConfirmed) {
      return;
    }

    isLoading.value = true;
    try {
      const result = (await resetSettings()) as ApiFailureShape;
      if (result.success) {
        clearAllPreferences();
        const queryClient = getActiveQueryClient();
        if (queryClient) {
          clearAppDataQueryCache(queryClient);
        }
        showToast(t('settings.resetSuccess'), 'success');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showToast(
          t('settings.resetFailedWithMessage', {
            message: result.error || result.message || t('settings.resetRequestFailed'),
          }),
          'error',
        );
      }
    } catch {
      showToast(t('settings.resetRequestFailed'), 'error');
    } finally {
      isLoading.value = false;
    }
  };

  return {
    settings,
    disguiseConfig,
    isLoading,
    isSaving,
    hasWhitespace,
    loadSettings,
    handleSave,
    handleReset,
    exportBackup,
    importBackup,
  };
}
