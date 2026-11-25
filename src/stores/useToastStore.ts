import { defineStore } from 'pinia';
import { ref } from 'vue';
import { TIMING } from '@/constants/timing.js';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

const DURATION_BY_TYPE: Partial<Record<ToastType, number>> = {
  success: TIMING.TOAST_DURATION_SUCCESS,
  error: TIMING.TOAST_DURATION_ERROR,
  warning: TIMING.TOAST_DURATION_WARNING,
};

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<ToastItem[]>([]);
  const queue = ref<ToastItem[]>([]);

  function _resolveDuration(type: ToastType, duration?: number): number {
    if (duration !== undefined) return duration;
    return DURATION_BY_TYPE[type] ?? TIMING.TOAST_DURATION_MS;
  }

  function _display(toastItem: ToastItem): void {
    toasts.value.push(toastItem);
    setTimeout(() => removeToast(toastItem.id), toastItem.duration);
  }

  function _flush(): void {
    while (toasts.value.length < TIMING.TOAST_MAX_VISIBLE && queue.value.length > 0) {
      const nextItem = queue.value.shift();
      if (nextItem) {
        _display(nextItem);
      }
    }
  }

  function showToast(message: string, type: ToastType = 'info', duration?: number): void {
    const id = Date.now() + Math.random().toString(36).substring(2, 7);
    const toastItem: ToastItem = { id, message, type, duration: _resolveDuration(type, duration) };

    if (toasts.value.length < TIMING.TOAST_MAX_VISIBLE) {
      _display(toastItem);
    } else {
      queue.value.push(toastItem);
    }
  }

  function removeToast(id: string): void {
    const index = toasts.value.findIndex((t) => t.id === id);
    if (index > -1) {
      toasts.value.splice(index, 1);
      _flush();
    }
  }

  return { toasts, showToast, removeToast };
});
