import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useEditorStore = defineStore('editor', () => {
  const isDirty = ref(false);
  const isLoading = ref(false);

  function markDirty(): void {
    isDirty.value = true;
  }

  function clearDirty(): void {
    isDirty.value = false;
  }

  function setLoading(loading: boolean): void {
    isLoading.value = loading;
  }

  return {
    isDirty,
    isLoading,
    markDirty,
    clearDirty,
    setLoading,
  };
});
