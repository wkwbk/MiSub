import { defineStore } from 'pinia';
import { ref } from 'vue';
import { DEFAULT_SETTINGS } from '@/constants/default-settings.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';

export const useSettingsStore = defineStore('settings', () => {
  const config = ref<AppSettingsConfig>({ ...DEFAULT_SETTINGS } as AppSettingsConfig);

  function setConfig(newConfig: Partial<AppSettingsConfig> | null | undefined): void {
    config.value = { ...DEFAULT_SETTINGS, ...newConfig } as AppSettingsConfig;
  }

  function updateConfig(updates: Partial<AppSettingsConfig>): void {
    config.value = { ...config.value, ...updates };
  }

  return {
    config,
    setConfig,
    updateConfig,
  };
});
