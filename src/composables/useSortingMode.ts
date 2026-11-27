import { ref, type Ref } from 'vue';

export interface DragEndEvent {
  oldIndex?: number;
  newIndex?: number;
  [key: string]: unknown;
}

export function useSortingMode(_unused?: unknown): Ref<boolean> {
  return ref(false);
}

export function hasDragOrderChanged(evt: DragEndEvent | null | undefined): boolean {
  return !(evt && typeof evt.oldIndex === 'number' && evt.oldIndex === evt.newIndex);
}
