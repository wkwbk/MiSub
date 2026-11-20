import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Toast from '@/components/ui/Toast.vue';
import { useToastStore } from '@/stores/toast.js';

const readZIndexToken = (css, token) => {
  const match = css.match(new RegExp(`${token}\\s*:\\s*(\\d+)\\s*;`));
  return match ? Number(match[1]) : NaN;
};

describe('Toast layering above modals', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('defines --z-toast above modal, modal-popover, and confirm z-index tokens', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8');
    const zToast = readZIndexToken(css, '--z-toast');
    const zModal = readZIndexToken(css, '--z-modal');
    const zModalPopover = readZIndexToken(css, '--z-modal-popover');
    const zConfirm = readZIndexToken(css, '--z-confirm');

    expect(zToast).toBeGreaterThan(zModal);
    expect(zToast).toBeGreaterThan(zModalPopover);
    expect(zToast).toBeGreaterThan(zConfirm);
  });

  it('teleports toast container to document.body with var(--z-toast)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const wrapper = mount(Toast, {
      attachTo: host,
    });

    const toastStore = useToastStore();
    toastStore.showToast('Saved', 'success');
    await nextTick();

    const toastItem = document.body.querySelector('[role="status"]');
    expect(toastItem).not.toBeNull();
    expect(host.contains(toastItem)).toBe(false);

    const container = toastItem.closest('.fixed');
    expect(container).not.toBeNull();
    expect(container.parentElement).toBe(document.body);
    expect(container.style.zIndex).toBe('var(--z-toast)');

    wrapper.unmount();
  });
});
