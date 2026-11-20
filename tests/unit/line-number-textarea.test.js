// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import LineNumberTextarea from '@/components/ui/LineNumberTextarea.vue';
import BulkImportModal from '@/components/modals/BulkImportModal.vue';
import SubscriptionBulkImportModal from '@/components/modals/SubscriptionBulkImportModal.vue';
import ManualNodeEditModal from '@/components/modals/ManualNodeEditModal.vue';
import { createI18n } from '@/i18n/index.js';

describe('LineNumberTextarea', () => {
  it('disables word wrap and renders line numbers matching content lines', async () => {
    const wrapper = mount(LineNumberTextarea, {
      props: {
        modelValue: 'line1\nline2\nline3',
      },
    });

    const textarea = wrapper.find('textarea');
    const scroller = wrapper.find('.overflow-x-auto');
    expect(textarea.exists()).toBe(true);
    expect(textarea.attributes('wrap')).toBe('off');
    expect(textarea.classes()).toContain('whitespace-pre');
    expect(scroller.classes()).toContain('overflow-x-auto');

    const lineNumbers = wrapper.findAll('[aria-hidden="true"] .py-3 > div');
    expect(lineNumbers.map((el) => el.text())).toEqual(['1', '2', '3']);

    scroller.element.scrollTop = 48;
    await scroller.trigger('scroll');
    expect(wrapper.find('[aria-hidden="true"] .py-3').attributes('style')).toContain('translateY(-48px)');

    await wrapper.setProps({ modelValue: 'single' });
    const updatedLineNumbers = wrapper.findAll('[aria-hidden="true"] .py-3 > div');
    expect(updatedLineNumbers.map((el) => el.text())).toEqual(['1']);
  });

  it('is used by all import modals with wrap disabled and line numbers', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const global = {
      plugins: [createI18n({ initialLocale: 'en-US' }), pinia],
      stubs: { Teleport: true },
    };

    const bulkWrapper = mount(BulkImportModal, {
      props: { show: true },
      global,
    });
    const bulkTextarea = bulkWrapper.findComponent(LineNumberTextarea);
    expect(bulkTextarea.find('textarea').attributes('wrap')).toBe('off');
    expect(bulkTextarea.find('[aria-hidden="true"]').text()).toContain('1');

    const subBulkWrapper = mount(SubscriptionBulkImportModal, {
      props: { show: true },
      global,
    });
    const subBulkTextarea = subBulkWrapper.findComponent(LineNumberTextarea);
    expect(subBulkTextarea.find('textarea').attributes('wrap')).toBe('off');
    expect(subBulkTextarea.find('[aria-hidden="true"]').text()).toContain('1');

    const manualWrapper = mount(ManualNodeEditModal, {
      props: {
        show: true,
        isNew: true,
        editingNode: { name: '', tags: [], url: 'vmess://a\nvless://b' },
        tags: [],
      },
      global,
    });
    const manualTextarea = manualWrapper.findComponent(LineNumberTextarea);
    expect(manualTextarea.find('textarea').attributes('wrap')).toBe('off');
    expect(manualTextarea.find('[aria-hidden="true"]').text()).toContain('1');
    expect(manualTextarea.find('[aria-hidden="true"]').text()).toContain('2');
  });
});
