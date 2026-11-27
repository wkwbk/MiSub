import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export const useEditorStore = defineStore('editor', () => {
  const pendingMutations = ref(0);
  const isLoading = ref(false);
  const isMutating = computed(() => pendingMutations.value > 0);

  function beginMutation(): void {
    pendingMutations.value += 1;
  }

  function endMutation(): void {
    pendingMutations.value = Math.max(0, pendingMutations.value - 1);
  }

  function setLoading(loading: boolean): void {
    isLoading.value = Boolean(loading);
  }

  return {
    pendingMutations,
    isMutating,
    isLoading,
    beginMutation,
    endMutation,
    setLoading,
  };
});
