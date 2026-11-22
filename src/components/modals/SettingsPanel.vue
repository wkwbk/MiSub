<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useSettingsLogic } from '@/composables/useSettingsLogic.js';
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

const activeTab = ref(resolveSettingsTab(readSessionPreference(SETTINGS_ACTIVE_TAB_STORAGE_KEY)) || 'basic');

watch(activeTab, (tabId) => {
  const resolved = resolveSettingsTab(tabId) || 'basic';
  writeSessionPreference(SETTINGS_ACTIVE_TAB_STORAGE_KEY, resolved);
});

// 组件挂载时加载设置
onMounted(() => {
  loadSettings();
});

const saveDisabled = computed(() => isSaving.value || hasWhitespace.value);

const handleSaveAndReturnStatus = async () => {
  return handleSave();
};

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
    />
  </div>
</template>
