import { computed, getCurrentInstance, onUnmounted, ref } from 'vue';
import { useToastStore } from '@/stores/toast.js';
import { DEFAULT_SETTINGS } from '@/constants/default-settings.js';
import { fetchSettings, resetSettings, saveSettings } from '@/lib/api.js';
import { useBackupLogic } from '@/composables/useBackupLogic.js';
import { setLocale, t } from '@/i18n/index.js';
import { confirmAction } from '@/composables/useConfirm.js';
import { clearAllPreferences } from '@/utils/local-preference.js';

function normalizeExternalApiConfig(value) {
  const defaults = DEFAULT_SETTINGS.externalApi;
  const externalApi = value && typeof value === 'object' ? value : {};
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

function normalizeSettingsObject(source = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...source };
  delete merged.publicLinks;
  delete merged.publicCores;
  merged.externalApi = normalizeExternalApiConfig(source.externalApi ?? merged.externalApi);
  merged.shortLink = {
    ...DEFAULT_SETTINGS.shortLink,
    ...(source.shortLink && typeof source.shortLink === 'object' ? source.shortLink : {}),
  };
  return merged;
}

/**
 * 设置页面的核心逻辑 composable
 * 用于 SettingsView.vue 和 SettingsPanel.vue 的代码复用
 */
export function useSettingsLogic() {
  const { showToast } = useToastStore();

  // 使用备份 composable
  const { exportBackup, importBackup } = useBackupLogic();

  // ========== 状态定义 ==========
  const settings = ref(normalizeSettingsObject(DEFAULT_SETTINGS));
  const isLoading = ref(false);
  const isSaving = ref(false);
  let reloadTimer = null;

  const clearReloadTimer = () => {
    if (reloadTimer !== null) {
      clearTimeout(reloadTimer);
      reloadTimer = null;
    }
  };

  if (getCurrentInstance()) {
    onUnmounted(clearReloadTimer);
  }

  // 嵌套配置对象（拦截响应策略）
  const disguiseConfig = ref({
    pageType: 'default',
    redirectUrl: '',
  });

  // ========== 计算属性 ==========
  const hasWhitespace = computed(() => {
    const fieldsCheck = ['fileName', 'myToken', 'profileToken', 'transformConfig', 'botToken', 'chatId'];
    for (const key of fieldsCheck) {
      if (settings.value[key] && /\s/.test(settings.value[key])) return true;
    }
    return false;
  });

  // ========== 核心函数 ==========

  /**
   * 从 API 加载设置
   */
  const loadSettings = async () => {
    isLoading.value = true;
    try {
      const result = await fetchSettings();
      if (result.success) {
        const incoming = result.data && typeof result.data === 'object' ? result.data : {};
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
      } else {
        showToast(
          t('settings.loadFailedWithMessage', { message: result.error || result.message || t('settings.loadFailed') }),
          'error',
        );
        settings.value = normalizeSettingsObject(DEFAULT_SETTINGS);
      }
    } catch {
      showToast(t('settings.loadFailed'), 'error');
      settings.value = normalizeSettingsObject(DEFAULT_SETTINGS);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 保存设置到 API
   */
  const handleSave = async () => {
    if (hasWhitespace.value) {
      showToast(t('settings.noWhitespace'), 'error');
      return false;
    }

    isSaving.value = true;
    try {
      settings.value.storageType = 'd1';
      settings.value.externalApi = normalizeExternalApiConfig(settings.value.externalApi);

      const settingsToSave = {
        ...settings.value,
        externalApi: normalizeExternalApiConfig(settings.value.externalApi),
        disguise: disguiseConfig.value,
      };

      settingsToSave.ruleLevel = settingsToSave.ruleLevel || settingsToSave.clashRuleLevel || 'std';

      delete settingsToSave.prefixConfig;
      delete settingsToSave.prependSubName;
      delete settingsToSave.nodeTransform;
      delete settingsToSave.clashRuleLevel;
      delete settingsToSave.publicLinks;
      delete settingsToSave.publicCores;

      const result = await saveSettings(settingsToSave);
      if (result.success) {
        if (result.telegramSync?.attempted && !result.telegramSync.success) {
          showToast(t('settings.savedTelegramSyncFailed'), 'warning');
        } else {
          showToast(t('settings.savedReloading'), 'success');
        }
        clearReloadTimer();
        reloadTimer = setTimeout(() => {
          reloadTimer = null;
          window.location.reload();
        }, 1200);
        return true;
      } else {
        throw new Error(result.error || result.message || t('settings.saveFailed'));
      }
    } catch (error) {
      showToast(error.message, 'error');
      return false;
    } finally {
      isSaving.value = false;
    }
  };

  /**
   * 处理恢复出厂设置
   */
  const handleReset = async () => {
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
      const result = await resetSettings();
      if (result.success) {
        clearAllPreferences();
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
