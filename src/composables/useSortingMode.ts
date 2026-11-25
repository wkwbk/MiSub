import { ref, watch, type Ref } from 'vue';

export interface DragEndEvent {
  oldIndex?: number;
  newIndex?: number;
  [key: string]: unknown;
}

export function useSortingMode(dataStore?: { isDirty: boolean } | null): Ref<boolean> {
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

export function hasDragOrderChanged(evt: DragEndEvent | null | undefined): boolean {
  return !(evt && typeof evt.oldIndex === 'number' && evt.oldIndex === evt.newIndex);
}
