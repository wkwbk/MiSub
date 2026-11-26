import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from '@/i18n/index.js';
import { renderQrCodeToCanvas, sanitizeQrFilename } from '@/utils/qrcode.js';
import ManualNodeCard from '@/components/nodes/ManualNodeCard.vue';
import NodeList from '@/components/modals/NodePreview/components/NodeList.vue';
import NodeCard from '@/components/modals/NodePreview/components/NodeCard.vue';
import NodeDetailModal from '@/components/modals/NodeDetailModal.vue';

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

const modalStub = {
  name: 'Modal',
  props: ['show', 'zIndex', 'size', 'showConfirm'],
  emits: ['update:show'],
  template: '<div v-if="show" class="modal-stub"><slot name="title" /><slot name="body" /><slot name="footer" /></div>',
};

describe('single node actions and QR code', () => {
  beforeEach(() => {
    toCanvasMock.mockClear();
    toastMock.mockClear();
    setActivePinia(createPinia());
  });

  it('sanitizes filenames and adapts QR error correction level by payload length', async () => {
    expect(sanitizeQrFilename('HK / Node: 01 | "Fast"?*')).toBe('HK _ Node_ 01 _ _Fast___');
    expect(sanitizeQrFilename('   ...   ', 'fallback')).toBe('fallback');

    const fakeCanvas = {
      getContext: vi.fn(() => ({})),
    };

    const shortOk = await renderQrCodeToCanvas(fakeCanvas, 'ss://short-link#HK');
    expect(shortOk).toBe(true);
    expect(toCanvasMock).toHaveBeenLastCalledWith(
      fakeCanvas,
      'ss://short-link#HK',
      expect.objectContaining({ errorCorrectionLevel: 'M' }),
    );

    const longUrl = `vless://${'a'.repeat(650)}@example.com:443#Long`;
    const longOk = await renderQrCodeToCanvas(fakeCanvas, longUrl);
    expect(longOk).toBe(true);
    expect(toCanvasMock).toHaveBeenLastCalledWith(
      fakeCanvas,
      longUrl,
      expect.objectContaining({ errorCorrectionLevel: 'L' }),
    );
  });

  it('renders exactly 4 action buttons (ping, detail, edit, delete) on ManualNodeCard without copy or QR buttons', async () => {
    const node = {
      id: 'n1',
      name: 'HK Node',
      url: 'vless://uuid@hk.example.com:443#HK',
      enabled: true,
    };

    const wrapper = mount(ManualNodeCard, {
      props: { node, isSelectionMode: false },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
      },
    });

    const actionButtons = wrapper.findAll('button[aria-label]');
    expect(actionButtons.map((btn) => btn.attributes('aria-label'))).toEqual(['检测延迟', '查看详情', '编辑', '删除']);

    await wrapper.get('button[aria-label="查看详情"]').trigger('click');
    expect(wrapper.emitted('detail')).toHaveLength(1);
  });

  it('renders detail button without standalone copy or QR buttons in NodeList and NodeCard', async () => {
    const previewNode = {
      url: 'vless://11111111-2222-3333-4444-555555555555@example.com:443#PreviewHK',
      name: 'Preview HK',
      protocol: 'vless',
      server: 'example.com',
      port: 443,
      region: '香港',
    };

    const sharedProps = {
      nodes: [previewNode],
      parseNodeInfo: (n) => n,
      getProtocolStyle: () => '',
    };

    const listWrapper = mount(NodeList, {
      props: sharedProps,
      global: { plugins: [createI18n({ initialLocale: 'zh-CN' })] },
    });
    expect(listWrapper.findAll('button[aria-label]').map((b) => b.attributes('aria-label'))).toEqual(['查看详情']);
    await listWrapper.get('button[aria-label="查看详情"]').trigger('click');
    expect(listWrapper.emitted('detail')?.[0]).toEqual([previewNode]);

    const cardWrapper = mount(NodeCard, {
      props: sharedProps,
      global: { plugins: [createI18n({ initialLocale: 'zh-CN' })] },
    });
    expect(cardWrapper.findAll('button[aria-label]').map((b) => b.attributes('aria-label'))).toEqual([
      '查看详情',
      '查看详情',
    ]);
  });

  it('consolidates QR Code tab and single copy-link button inside NodeDetailModal', async () => {
    const parsedWrapper = mount(NodeDetailModal, {
      props: {
        show: true,
        node: {
          name: 'VLESS Node',
          url: 'vless://11111111-2222-3333-4444-555555555555@example.com:443?security=tls#VLESS',
        },
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: { Modal: modalStub },
      },
    });

    const copyLinkButtons = parsedWrapper.findAll('button').filter((b) => b.text().includes('复制链接'));
    expect(copyLinkButtons).toHaveLength(1);

    const qrTab = parsedWrapper.get('[data-testid="node-detail-qrcode-tab"]');
    await qrTab.trigger('click');
    await flushPromises();

    expect(parsedWrapper.find('canvas').exists()).toBe(true);
    expect(parsedWrapper.text()).toContain('保存二维码图片');

    const unsupportedWrapper = mount(NodeDetailModal, {
      props: {
        show: true,
        node: {
          name: 'NaiveNode',
          url: 'naive+https://user:pass@naive.example.com:8443#NaiveNode',
        },
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: { Modal: modalStub },
      },
    });

    await unsupportedWrapper.get('[data-testid="node-detail-qrcode-tab"]').trigger('click');
    await flushPromises();
    expect(unsupportedWrapper.find('canvas').exists()).toBe(true);
  });
});
