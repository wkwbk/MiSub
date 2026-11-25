import { defineStore } from 'pinia';
import { ref } from 'vue';
import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';

export type LayoutMode = 'modern' | 'legacy';

export const useUiStore = defineStore('ui', () => {
  const isSettingsModalVisible = ref(false);
  const savedLayout = readRawPreference('layoutMode');
  const layoutMode = ref<LayoutMode>(savedLayout === 'legacy' ? 'legacy' : 'modern');

  function show(): void {
    isSettingsModalVisible.value = true;
  }

  function hide(): void {
    isSettingsModalVisible.value = false;
  }

  function toggleLayout(): void {
    const nextMode: LayoutMode = layoutMode.value === 'modern' ? 'legacy' : 'modern';
    writeRawPreference('layoutMode', nextMode);

    window.location.href = '/';
  }

  return { isSettingsModalVisible, layoutMode, show, hide, toggleLayout };
});

export const useUIStore = useUiStore;
