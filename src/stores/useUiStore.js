import { defineStore } from 'pinia';
import { ref } from 'vue';
import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';

export const useUiStore = defineStore('ui', () => {
  const isSettingsModalVisible = ref(false);
  const layoutMode = ref(readRawPreference('layoutMode') || 'modern');

  function show() {
    isSettingsModalVisible.value = true;
  }

  function hide() {
    isSettingsModalVisible.value = false;
  }

  function toggleLayout() {
    const nextMode = layoutMode.value === 'modern' ? 'legacy' : 'modern';
    writeRawPreference('layoutMode', nextMode);

    window.location.href = '/';
  }

  return { isSettingsModalVisible, layoutMode, show, hide, toggleLayout };
});

export const useUIStore = useUiStore;
