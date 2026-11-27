import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from '@/i18n/index.js';
import NodeDetailModal from '@/components/modals/NodeDetailModal.vue';
import NodePreviewModal from '@/components/modals/NodePreview/NodePreviewModal.vue';
import CopyLinkModal from '@/components/modals/CopyLinkModal.vue';
import QRCodeModal from '@/components/modals/QRCodeModal.vue';
import LogModal from '@/components/modals/LogModal.vue';
import QuickImportModal from '@/components/modals/QuickImportModal.vue';

const toCanvasMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const toastMock = vi.hoisted(() => vi.fn());

vi.mock('qrcode', () => ({
  default: {
    toCanvas: toCanvasMock,
  },
  toCanvas: toCanvasMock,
}));

vi.mock('@/stores/useToastStore.js', () => ({
  useToastStore: () => ({
    showToast: toastMock,
  }),
}));

vi.mock('@/lib/http.js', () => ({
  APIError: class APIError extends Error {},
  api: {
    get: vi.fn(async () => ({ data: [] })),
    del: vi.fn(async () => ({})),
    post: vi.fn(async () => ({
      success: true,
      nodes: [
        {
          id: 'node-1',
          name: 'Demo HK',
          url: 'vless://demo@example.com:443#Demo',
          type: 'vless',
          server: 'example.com',
          port: 443,
          region: '香港',
        },
      ],
      stats: {
        protocols: { vless: 1 },
        regions: { 香港: 1 },
      },
    })),
  },
}));

describe('modal mobile UX regressions', () => {
  beforeEach(() => {
    toCanvasMock.mockClear();
    toastMock.mockClear();
    setActivePinia(createPinia());
  });

  it('keeps NodeDetailModal to a single header close button and non-wrapping scrollable tabs', async () => {
    const wrapper = mount(NodeDetailModal, {
      props: {
        show: true,
        node: {
          name: 'AHKA|中转|BIDB|HY2',
          url: 'hysteria2://secret@no.ahka.ijg.cc:35584#AHKA',
        },
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: { Teleport: true },
      },
    });

    const closeButtons = wrapper.findAll('button[aria-label="关闭"]');
    expect(closeButtons).toHaveLength(1);
    expect(closeButtons[0].element.closest('.modal-chrome-header')).not.toBeNull();

    const footer = wrapper.find('.modal-chrome-footer');
    expect(footer.exists()).toBe(true);
    const footerButtons = footer.findAll('button');
    expect(footerButtons).toHaveLength(1);
    expect(footerButtons[0].text()).toContain('复制链接');
    expect(footerButtons[0].classes()).toContain('whitespace-nowrap');
    expect(footer.text()).not.toContain('关闭');

    const tabsContainer = wrapper.get('[data-testid="node-detail-tabs"]');
    expect(tabsContainer.classes()).toEqual(
      expect.arrayContaining(['max-w-full', 'flex-nowrap', 'overflow-x-auto', 'no-scrollbar']),
    );

    const tabButtons = tabsContainer.findAll('button[role="tab"]');
    expect(tabButtons).toHaveLength(4);
    for (const tabBtn of tabButtons) {
      expect(tabBtn.classes()).toContain('shrink-0');
      expect(tabBtn.classes()).toContain('whitespace-nowrap');
    }

    await closeButtons[0].trigger('click');
    expect(wrapper.emitted('update:show')?.[0]).toEqual([false]);

    await wrapper.setProps({ node: null });
    expect(wrapper.find('.modal-chrome-footer').exists()).toBe(false);
  });

  it('hides redundant footer close buttons in NodePreviewModal outside picking mode', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);

    const wrapper = mount(NodePreviewModal, {
      props: {
        show: true,
        profileId: 'profile-1',
        profileName: 'Demo Profile',
      },
      global: {
        plugins: [pinia, createI18n({ initialLocale: 'zh-CN' })],
        stubs: {
          Teleport: true,
          NodeFilters: true,
          NodeList: true,
          NodeCard: true,
          NodePagination: true,
          NodeDetailModal: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.find('.modal-chrome-header button[aria-label="关闭"]').exists()).toBe(true);
    expect(wrapper.find('.modal-chrome-footer').exists()).toBe(false);

    const pickButton = wrapper.findAll('button').find((b) => b.text().includes('挑选节点'));
    expect(pickButton).toBeTruthy();
    await pickButton.trigger('click');

    const footer = wrapper.find('.modal-chrome-footer');
    expect(footer.exists()).toBe(true);
    for (const btn of footer.findAll('button')) {
      expect(btn.classes()).toContain('whitespace-nowrap');
    }

    const exitPickButton = wrapper.findAll('button').find((b) => b.text().includes('退出挑选'));
    expect(exitPickButton).toBeTruthy();
    await exitPickButton.trigger('click');
    expect(wrapper.find('.modal-chrome-footer').exists()).toBe(false);
  });

  it('provides a header close button on CopyLinkModal', async () => {
    const wrapper = mount(CopyLinkModal, {
      props: {
        show: true,
        token: 'share-token',
        profile: { id: 'p1', customId: 'daily', name: '日常使用' },
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: { Teleport: true },
      },
    });

    const closeBtn = wrapper.find('.modal-chrome-header button[aria-label="关闭"]');
    expect(closeBtn.exists()).toBe(true);
    expect(wrapper.find('.modal-chrome-footer').exists()).toBe(false);

    await closeBtn.trigger('click');
    expect(wrapper.emitted('update:show')?.[0]).toEqual([false]);
  });

  it('labels read-only footer dismiss buttons as Close on QRCodeModal and LogModal', async () => {
    const qrWrapper = mount(QRCodeModal, {
      props: {
        show: true,
        url: 'https://misub.example/sub/daily',
        title: '日常使用',
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: { Teleport: true },
      },
    });

    await flushPromises();

    expect(qrWrapper.findAll('.modal-chrome-header button[aria-label="关闭"]')).toHaveLength(0);
    const qrFooterBtns = qrWrapper.findAll('.modal-chrome-footer button');
    expect(qrFooterBtns).toHaveLength(1);
    expect(qrFooterBtns[0].text()).toBe('关闭');

    const logWrapper = mount(LogModal, {
      props: { show: true },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: { Teleport: true },
      },
    });

    await flushPromises();

    expect(logWrapper.findAll('.modal-chrome-header button[aria-label="关闭"]')).toHaveLength(0);
    const logFooterBtns = logWrapper.findAll('.modal-chrome-footer button');
    expect(logFooterBtns).toHaveLength(1);
    expect(logFooterBtns[0].text()).toBe('关闭');
  });

  it('keeps QuickImportModal close button non-shrinking and Shadowrocket buttons single-line', () => {
    const wrapper = mount(QuickImportModal, {
      props: {
        show: true,
        profile: { id: 'p1', name: 'Demo' },
        clients: [],
        profileToken: 'profiles',
      },
      global: {
        plugins: [createI18n({ initialLocale: 'zh-CN' })],
        stubs: { Teleport: true },
      },
    });

    const closeBtn = wrapper.get('.modal-chrome-header button[aria-label="关闭"]');
    expect(closeBtn.classes()).toContain('shrink-0');

    const srButtons = wrapper.findAll('[data-testid="quick-import-shadowrocket-config"] button');
    expect(srButtons).toHaveLength(2);
    for (const btn of srButtons) {
      expect(btn.classes()).toContain('whitespace-nowrap');
    }
  });
});
