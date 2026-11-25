import { ref, type Ref } from 'vue';

export type ConfirmVariant = 'primary' | 'danger' | 'warning' | 'info';

export interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
}

export interface PendingConfirmState {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: ConfirmVariant;
  resolve: (result: boolean) => void;
}

const pending = ref<PendingConfirmState | null>(null);

let hostMounted = false;

export function setConfirmHost(mounted: boolean): void {
  hostMounted = Boolean(mounted);
  if (!hostMounted && pending.value) {
    settleConfirm(false);
  }
}

export function confirmAction(options: ConfirmOptions = {}): Promise<boolean> {
  if (!hostMounted) {
    const accepted =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(options.message || '')
        : false;
    return Promise.resolve(accepted);
  }

  return new Promise<boolean>((resolve) => {
    if (pending.value) {
      pending.value.resolve(false);
    }
    pending.value = {
      title: options.title || '',
      message: options.message || '',
      confirmText: options.confirmText || '',
      cancelText: options.cancelText || '',
      variant: options.variant || 'primary',
      resolve,
    };
  });
}

export function useConfirmState(): Ref<PendingConfirmState | null> {
  return pending;
}

export function settleConfirm(result: boolean): void {
  const current = pending.value;
  pending.value = null;
  if (current) {
    current.resolve(result);
  }
}
