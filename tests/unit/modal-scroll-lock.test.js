import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FormModal from '@/components/shared/FormModal.vue';
import Modal from '@/components/ui/Modal.vue';
import QRCodeOverlay from '@/components/public/QRCodeOverlay.vue';

const mountedWrappers = [];

function trackWrapper(wrapper) {
  mountedWrappers.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  document.documentElement.style.overflow = '';
  document.documentElement.style.overscrollBehavior = '';
  document.body.style.overflow = '';
  document.body.style.overscrollBehavior = '';
  document.body.style.paddingRight = '';
});

afterEach(() => {
  while (mountedWrappers.length > 0) {
    const wrapper = mountedWrappers.pop();
    wrapper.unmount();
  }
  document.body.innerHTML = '';
});

describe('modal scroll lock', () => {
  it('locks and restores html/body scroll when Modal opens and closes', async () => {
    document.body.style.overflow = 'auto';
    document.body.style.paddingRight = '4px';

    const wrapper = trackWrapper(
      mount(Modal, {
        props: { show: false },
        attachTo: document.body,
      }),
    );

    expect(document.body.style.overflow).toBe('auto');

    await wrapper.setProps({ show: true });
    await nextTick();

    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overscrollBehavior).toBe('none');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.overscrollBehavior).toBe('none');

    await wrapper.setProps({ show: false });
    await nextTick();

    expect(document.documentElement.style.overflow).toBe('');
    expect(document.documentElement.style.overscrollBehavior).toBe('');
    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.style.overscrollBehavior).toBe('');
    expect(document.body.style.paddingRight).toBe('4px');
  });

  it('keeps scroll locked for stacked modals until all modals close', async () => {
    const firstModal = trackWrapper(
      mount(Modal, {
        props: { show: true },
        attachTo: document.body,
      }),
    );
    const secondModal = trackWrapper(
      mount(FormModal, {
        props: { show: true, title: 'Nested' },
        attachTo: document.body,
      }),
    );

    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');

    await secondModal.setProps({ show: false });
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');

    await firstModal.setProps({ show: false });
    await nextTick();
    expect(document.body.style.overflow).toBe('');
  });

  it('releases scroll lock when an open modal unmounts', async () => {
    const wrapper = trackWrapper(
      mount(Modal, {
        props: { show: true },
        attachTo: document.body,
      }),
    );

    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');

    wrapper.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('prevents touchmove on backdrop while allowing touchmove inside scrollable modal body', async () => {
    trackWrapper(
      mount(Modal, {
        props: { show: true },
        attachTo: document.body,
        slots: {
          body: '<div data-testid="inner">Content</div>',
        },
      }),
    );

    await nextTick();

    const backdrop = document.body.querySelector('[role="dialog"]');
    const backdropTouchMove = new Event('touchmove', { bubbles: true, cancelable: true });
    backdrop.dispatchEvent(backdropTouchMove);
    expect(backdropTouchMove.defaultPrevented).toBe(true);

    const scrollableBody = backdrop.querySelector('.overflow-y-auto');
    Object.defineProperty(scrollableBody, 'scrollHeight', { value: 600, configurable: true });
    Object.defineProperty(scrollableBody, 'clientHeight', { value: 300, configurable: true });
    scrollableBody.style.overflowY = 'auto';

    const inner = scrollableBody.querySelector('[data-testid="inner"]');
    const innerTouchMove = new Event('touchmove', { bubbles: true, cancelable: true });
    inner.dispatchEvent(innerTouchMove);
    expect(innerTouchMove.defaultPrevented).toBe(false);
  });

  it('locks and unlocks scroll for QRCodeOverlay', async () => {
    const wrapper = trackWrapper(
      mount(QRCodeOverlay, {
        props: {
          isExpanded: false,
          profile: { id: 'p1', name: 'Demo' },
        },
        attachTo: document.body,
      }),
    );

    expect(document.body.style.overflow).toBe('');

    await wrapper.setProps({ isExpanded: true });
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');

    await wrapper.setProps({ isExpanded: false });
    await nextTick();
    expect(document.body.style.overflow).toBe('');
  });
});
