<script setup lang="ts">
import { computed, isRef, onMounted, ref, watch } from 'vue';
import { useSettingsLogic, type DisguiseConfig } from '@/composables/useSettingsLogic.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';
import SettingsContent from '@/components/settings/SettingsContent.vue';
import { resolveSettingsTab, SETTINGS_ACTIVE_TAB_STORAGE_KEY } from '@/utils/dashboard-deeplink.js';
import { readSessionPreference, writeSessionPreference } from '@/utils/session-preference.js';

const {
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
} = useSettingsLogic();

const activeTab = ref<string>(resolveSettingsTab(readSessionPreference(SETTINGS_ACTIVE_TAB_STORAGE_KEY)) || 'basic');

watch(activeTab, (tabId: string) => {
  const resolved = resolveSettingsTab(tabId) || 'basic';
  writeSessionPreference(SETTINGS_ACTIVE_TAB_STORAGE_KEY, resolved);
});

// 组件挂载时加载设置
onMounted(() => {
  loadSettings();
});

const saveDisabled = computed(() => isSaving.value || hasWhitespace.value);

const handleSaveAndReturnStatus = async (): Promise<boolean> => {
  return handleSave();
};

function handleSettingsUpdate(nextSettings: AppSettingsConfig): void {
  if (isRef(settings)) {
    settings.value = nextSettings;
  } else if (settings && typeof settings === 'object') {
    Object.assign(settings, nextSettings);
  }
}

function handleDisguiseConfigUpdate(nextDisguise: DisguiseConfig): void {
  if (isRef(disguiseConfig)) {
    disguiseConfig.value = nextDisguise;
  } else if (disguiseConfig && typeof disguiseConfig === 'object') {
    Object.assign(disguiseConfig, nextDisguise);
  }
}

// 暴露 handleSave 与保存状态给父组件（SettingsModal）
defineExpose({
  handleSave: handleSaveAndReturnStatus,
  isSaving,
  saveDisabled,
});
</script>

<template>
  <div class="w-full bg-transparent">
    <SettingsContent
      v-model:activeTab="activeTab"
      :disguise-config="disguiseConfig"
      :export-backup="exportBackup"
      :handle-reset="handleReset"
      :has-whitespace="hasWhitespace"
      :import-backup="importBackup"
      :is-loading="isLoading"
      :is-saving="isSaving"
      :settings="settings"
      hide-footer
      in-modal
      @save="handleSave"
      @update:disguise-config="handleDisguiseConfigUpdate"
      @update:settings="handleSettingsUpdate"
    />
  </div>
</template>
