import { ref, watch } from 'vue';

/**
 * Manage a sorting mode flag that automatically exits when unsaved changes
 * are saved or discarded (`dataStore.isDirty` transitions from true to false).
 */
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

/**
 * Return true when a SortableJS drag event actually changed the item's index.
 */
export function hasDragOrderChanged(evt) {
  return !(evt && typeof evt.oldIndex === 'number' && evt.oldIndex === evt.newIndex);
}
