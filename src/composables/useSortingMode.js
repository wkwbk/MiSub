import { ref, watch } from 'vue';

export function useSortingMode(dataStore) {
  const isSorting = ref(false);

  if (dataStore) {
    watch(
      () => dataStore.isDirty,
      (newVal, oldVal) => {
        if (oldVal && !newVal && isSorting.value) {
          isSorting.value = false;
        }
      },
    );
  }

  return isSorting;
}

export function hasDragOrderChanged(evt) {
  return !(evt && typeof evt.oldIndex === 'number' && evt.oldIndex === evt.newIndex);
}
