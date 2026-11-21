import { ref } from 'vue';

//
//
const pending = ref(null);

let hostMounted = false;

export function setConfirmHost(mounted) {
  hostMounted = Boolean(mounted);
  if (!hostMounted && pending.value) {
    settleConfirm(false);
  }
}

export function confirmAction(options = {}) {
  if (!hostMounted) {
    const accepted =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(options.message || '')
        : false;
    return Promise.resolve(accepted);
  }

  return new Promise((resolve) => {
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

export function useConfirmState() {
  return pending;
}

export function settleConfirm(result) {
  const current = pending.value;
  pending.value = null;
  if (current) {
    current.resolve(result);
  }
}
