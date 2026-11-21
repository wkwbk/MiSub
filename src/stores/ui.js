import { defineStore } from 'pinia';
import { ref } from 'vue';
import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';

export const useUIStore = defineStore('ui', () => {
  const isSettingsModalVisible = ref(false);
  // 注意：这里在 store 初始化阶段读取 localStorage。浏览器禁用站点数据时，
  // 光是访问 localStorage 就会抛 SecurityError —— 裸读会让整个应用起不来。
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
