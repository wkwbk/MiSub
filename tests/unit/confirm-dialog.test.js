// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import { confirmAction } from '@/composables/useConfirm.js';

describe('ConfirmDialog chained confirmations', () => {
  it('does not auto-cancel a second confirmAction triggered immediately after the first confirms', async () => {
    const wrapper = mount(ConfirmDialog, {
      attachTo: document.body,
      global: {
        stubs: {
          Teleport: true,
        },
      },
    });

    try {
      const flow = (async () => {
        const first = await confirmAction({ message: 'Step 1', variant: 'danger' });
        if (!first) return 'cancelled-1';
        const second = await confirmAction({ message: 'Step 2', variant: 'danger' });
        return second ? 'confirmed-both' : 'cancelled-2';
      })();

      await nextTick();
      expect(wrapper.text()).toContain('Step 1');

      const buttons1 = wrapper.findAll('button');
      await buttons1[buttons1.length - 1].trigger('click');
      await nextTick();
      await nextTick();

      // 第二个确认弹窗必须保持打开并显示 Step 2，而不是被 Modal 的 closeOnConfirm 误关闭
      expect(wrapper.text()).toContain('Step 2');

      const buttons2 = wrapper.findAll('button');
      await buttons2[buttons2.length - 1].trigger('click');
      await nextTick();

      expect(await flow).toBe('confirmed-both');
    } finally {
      wrapper.unmount();
    }
  });
});
