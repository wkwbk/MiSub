import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CopyLinkModal from '@/components/modals/CopyLinkModal.vue';
import { useSettingsStore } from '@/stores/useSettingsStore.js';

const modalStub = {
  props: ['show', 'size'],
  template: '<div v-if="show" :data-size="size"><slot name="title" /><slot name="body" /></div>',
};

describe('CopyLinkModal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copies a native sing-box link instead of a base64 link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const wrapper = mount(CopyLinkModal, {
      props: {
        show: true,
        token: 'share-token',
        profile: { id: 'p1', customId: 'daily', name: '日常使用' },
      },
      global: {
        plugins: [createPinia()],
        stubs: { Modal: modalStub },
      },
    });

    const singBoxItem = wrapper.findAll('.cursor-pointer').find((item) => item.text().includes('Sing-Box'));
    expect(singBoxItem).toBeTruthy();
    await singBoxItem.trigger('click');

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/share-token/daily?singbox`);
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('?base64'));
  });

  it('renders aligned short link controls without a readonly input and copies the short link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    const settingsStore = useSettingsStore();
    settingsStore.config = {
      ...settingsStore.config,
      shortLink: { enabled: true, apiUrl: 'https://ijg.cc' },
    };

    const wrapper = mount(CopyLinkModal, {
      props: {
        show: true,
        token: 'share-token',
        profile: {
          id: 'p1',
          customId: 'daily',
          name: '日常使用',
          shortLink: 'https://ijg.cc/eusa',
        },
      },
      global: {
        plugins: [pinia],
        stubs: { Modal: modalStub },
      },
    });

    const shortLinkValue = wrapper.find('[data-testid="short-link-value"]');
    expect(shortLinkValue.exists()).toBe(true);
    expect(shortLinkValue.text()).toBe('https://ijg.cc/eusa');
    expect(wrapper.find('input[readonly]').exists()).toBe(false);

    const gridContainer = shortLinkValue.element.parentElement;
    expect(gridContainer?.className).toContain('grid');
    const gridButtons = Array.from(gridContainer?.querySelectorAll('button') || []);
    expect(gridButtons).toHaveLength(2);
    for (const button of gridButtons) {
      expect(button.className).toContain('w-full');
      expect(button.className).toContain('whitespace-nowrap');
    }

    await wrapper.findAll('button').find((btn) => gridButtons.includes(btn.element))?.trigger('click');
    expect(writeText).toHaveBeenCalledWith('https://ijg.cc/eusa');
  });

  it('keeps the Shadowrocket copy button single-line and stops propagation on .conf download', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const wrapper = mount(CopyLinkModal, {
      props: {
        show: true,
        token: 'share-token',
        profile: { id: 'p1', customId: 'daily', name: '日常使用' },
      },
      global: {
        plugins: [createPinia()],
        stubs: { Modal: modalStub },
      },
    });

    const srRow = wrapper.findAll('.cursor-pointer').find((item) => item.text().includes('Shadowrocket'));
    expect(srRow).toBeTruthy();

    const copyBtn = srRow.find('button');
    expect(copyBtn.exists()).toBe(true);
    expect(copyBtn.classes()).toContain('shrink-0');
    expect(copyBtn.classes()).toContain('whitespace-nowrap');

    const downloadLink = srRow.find('a[download]');
    expect(downloadLink.exists()).toBe(true);
    await downloadLink.trigger('click');
    expect(writeText).not.toHaveBeenCalled();
  });
});
