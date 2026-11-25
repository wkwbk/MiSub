import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useEditorStore = defineStore('editor', () => {
  const isDirty = ref(false);
  const isLoading = ref(false);

  function markDirty() {
    isDirty.value = true;
  }

  function clearDirty() {
    isDirty.value = false;
  }

  function setLoading(loading) {
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
