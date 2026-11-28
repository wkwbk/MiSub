import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from '@/i18n/index.js';
import NodeDetailModal from '@/components/modals/NodeDetailModal.vue';
import NodePreviewModal from '@/components/modals/NodePreview/NodePreviewModal.vue';
import NodeCard from '@/components/modals/NodePreview/components/NodeCard.vue';
import NodeList from '@/components/modals/NodePreview/components/NodeList.vue';
import CopyLinkModal from '@/components/modals/CopyLinkModal.vue';
import QRCodeModal from '@/components/modals/QRCodeModal.vue';
import LogModal from '@/components/modals/LogModal.vue';
import QuickImportModal from '@/components/modals/QuickImportModal.vue';
import VersionChangelogModal from '@/components/modals/VersionChangelogModal.vue';
import GuestbookModal from '@/components/modals/GuestbookModal.vue';
import ProfileCard from '@/components/profiles/ProfileCard.vue';
import PublicProfileCard from '@/components/public/ProfileCard.vue';
import NodeActions from '@/components/nodes/ManualNodePanel/NodeActions.vue';
import SubscriptionPanel from '@/components/subscriptions/SubscriptionPanel.vue';
import ProfilePanel from '@/components/profiles/ProfilePanel.vue';

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
      expect(btn.classes()).toContain('border');
    }
  });

  it('aligns mobile and desktop action button heights and switch wrappers in NodeCard', () => {
    const previewNode = {
      url: 'vless://11111111-2222-3333-4444-555555555555@example.com:443#PreviewHK',
      name: 'Preview HK',
      protocol: 'vless',
      server: 'example.com',
      port: 443,
      region: '香港',
    };

    const wrapper = mount(NodeCard, {
      props: {
        nodes: [previewNode],
        parseNodeInfo: (n) => n,
        getProtocolStyle: () => '',
        allowPing: true,
        showNodeSwitch: true,
      },
      global: {
        plugins: [createI18n({ initialLocale: 'zh-CN' })],
      },
    });

    const pingButtons = wrapper.findAll('button[aria-label="测试该节点延迟"]');
    expect(pingButtons).toHaveLength(2);
    for (const btn of pingButtons) {
      expect(btn.classes()).toContain('h-7');
      expect(btn.classes()).toContain('w-7');
      expect(btn.classes()).toContain('shrink-0');
    }

    const detailButtons = wrapper.findAll('button[aria-label="查看详情"]');
    expect(detailButtons).toHaveLength(2);
    for (const btn of detailButtons) {
      expect(btn.classes()).toContain('h-7');
      expect(btn.classes()).toContain('w-7');
      expect(btn.classes()).toContain('shrink-0');
    }

    const switchInputs = wrapper.findAll('input[type="checkbox"]');
    expect(switchInputs).toHaveLength(2);
    for (const input of switchInputs) {
      const switchContainer = input.element.closest('label')?.parentElement;
      expect(switchContainer?.className).toContain('flex');
      expect(switchContainer?.className).toContain('h-7');
      expect(switchContainer?.className).toContain('items-center');
    }
  });

  it('aligns action button heights and switch wrapper in NodeList', () => {
    const previewNode = {
      url: 'vless://11111111-2222-3333-4444-555555555555@example.com:443#PreviewHK',
      name: 'Preview HK',
      protocol: 'vless',
      server: 'example.com',
      port: 443,
      region: '香港',
    };

    const wrapper = mount(NodeList, {
      props: {
        nodes: [previewNode],
        parseNodeInfo: (n) => n,
        getProtocolStyle: () => '',
        allowPing: true,
        showNodeSwitch: true,
      },
      global: {
        plugins: [createI18n({ initialLocale: 'zh-CN' })],
      },
    });

    const pingBtn = wrapper.get('button[aria-label="测试该节点延迟"]');
    expect(pingBtn.classes()).toContain('h-7');
    expect(pingBtn.classes()).toContain('w-7');
    expect(pingBtn.classes()).toContain('shrink-0');

    const detailBtn = wrapper.get('button[aria-label="查看详情"]');
    expect(detailBtn.classes()).toContain('h-7');
    expect(detailBtn.classes()).toContain('w-7');
    expect(detailBtn.classes()).toContain('shrink-0');

    const switchInput = wrapper.get('input[type="checkbox"]');
    const switchContainer = switchInput.element.closest('label')?.parentElement;
    expect(switchContainer?.className).toContain('flex');
    expect(switchContainer?.className).toContain('h-7');
    expect(switchContainer?.className).toContain('items-center');
  });

  it('matches header and latency toolbar button heights in NodePreviewModal', async () => {
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

    const pickButton = wrapper.findAll('button').find((b) => b.text().includes('挑选节点'));
    expect(pickButton).toBeTruthy();
    expect(pickButton.classes()).toContain('h-8');

    const closeButton = wrapper.get('.modal-chrome-header button[aria-label="关闭"]');
    expect(closeButton.classes()).toContain('h-8');

    const latencyBtn = wrapper.get('[data-testid="preview-test-latency-btn"]');
    expect(latencyBtn.classes()).toContain('h-8');

    const tcpingBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'TCPing');
    expect(tcpingBtn).toBeTruthy();
    expect(tcpingBtn.element.parentElement?.className).toContain('h-8');
  });

  it('unifies padding, gap, and nowrap across ProfileCard footer buttons', () => {
    const wrapper = mount(ProfileCard, {
      props: {
        profile: {
          id: 'p1',
          name: 'BIDC',
          enabled: true,
          isPublic: false,
          subscriptions: [],
          manualNodes: [],
          subProfiles: [],
        },
      },
      global: {
        plugins: [createI18n({ initialLocale: 'zh-CN' })],
      },
    });

    const copyBtn = wrapper.findAll('button').find((b) => b.text().includes('复制订阅'));
    const logBtn = wrapper.findAll('button').find((b) => b.text().includes('订阅日志'));
    expect(copyBtn).toBeTruthy();
    expect(logBtn).toBeTruthy();

    for (const btn of [copyBtn, logBtn]) {
      expect(btn.classes()).toEqual(
        expect.arrayContaining(['px-3', 'py-1.5', 'gap-1.5', 'whitespace-nowrap', 'border']),
      );
    }
  });

  it('unifies toolbar button heights and horizontal padding across NodeActions, SubscriptionPanel, and ProfilePanel', () => {
    const i18n = createI18n({ initialLocale: 'zh-CN' });

    const nodeActionsWrapper = mount(NodeActions, {
      props: { manualNodesCount: 3 },
      global: {
        plugins: [createPinia(), i18n],
        stubs: { Teleport: true },
      },
    });

    const inspectBtn = nodeActionsWrapper.get('[data-testid="inspect-all-nodes-btn"]');
    const pingAllBtn = nodeActionsWrapper.findAll('button').find((b) => b.text().includes('检测延迟'));
    const nodeAddBtn = nodeActionsWrapper.findAll('button').find((b) => b.text().includes('新增'));
    const nodeMenuTrigger = nodeActionsWrapper.get('button[aria-haspopup="menu"]');

    expect(inspectBtn.classes()).toEqual(expect.arrayContaining(['h-8', 'w-8', 'sm:px-3', 'whitespace-nowrap']));
    expect(nodeMenuTrigger.classes()).toEqual(expect.arrayContaining(['h-8', 'w-8']));
    for (const btn of [pingAllBtn, nodeAddBtn]) {
      expect(btn).toBeTruthy();
      expect(btn.classes()).toEqual(expect.arrayContaining(['h-8', 'px-3', 'whitespace-nowrap']));
    }

    const subPanelWrapper = mount(SubscriptionPanel, {
      props: { subscriptions: [] },
      global: {
        plugins: [createPinia(), i18n],
        stubs: {
          Card: true,
          draggable: true,
          Teleport: true,
        },
      },
    });

    const bulkImportBtn = subPanelWrapper.findAll('button').find((b) => b.text().includes('批量导入'));
    const subAddBtn = subPanelWrapper.findAll('button').find((b) => b.text().includes('新增'));
    const subMenuTrigger = subPanelWrapper.get('button[aria-haspopup="menu"]');

    expect(subMenuTrigger.classes()).toEqual(expect.arrayContaining(['h-8', 'w-8']));
    for (const btn of [bulkImportBtn, subAddBtn]) {
      expect(btn).toBeTruthy();
      expect(btn.classes()).toEqual(expect.arrayContaining(['h-8', 'px-3', 'whitespace-nowrap']));
    }

    const profilePanelWrapper = mount(ProfilePanel, {
      props: { profiles: [], paginatedProfiles: [] },
      global: {
        plugins: [createPinia(), i18n],
        stubs: {
          ProfileCard: true,
          draggable: true,
          Teleport: true,
        },
      },
    });

    const profileAddBtn = profilePanelWrapper.findAll('button').find((b) => b.text().includes('新增'));
    const profileMenuTrigger = profilePanelWrapper.get('button[aria-haspopup="menu"]');

    expect(profileMenuTrigger.classes()).toEqual(expect.arrayContaining(['h-8', 'w-8']));
    expect(profileAddBtn).toBeTruthy();
    expect(profileAddBtn.classes()).toEqual(expect.arrayContaining(['h-8', 'px-3', 'whitespace-nowrap']));
  });

  it('unifies footer button heights and borders in public ProfileCard', () => {
    const wrapper = mount(PublicProfileCard, {
      props: {
        profile: {
          id: 'pub-1',
          name: 'Public Demo',
          description: 'Demo description',
        },
      },
      global: {
        plugins: [createI18n({ initialLocale: 'zh-CN' })],
        stubs: { QRCodeOverlay: true },
      },
    });

    const quickImportBtn = wrapper.get('button[aria-label="一键导入订阅"]');
    const previewBtn = wrapper.get('button[aria-label="预览节点"]');
    const copyLinkBtn = wrapper.get('button[aria-label="复制订阅链接"]');

    expect(quickImportBtn.classes()).toEqual(
      expect.arrayContaining(['h-9', 'border', 'border-accent', 'whitespace-nowrap']),
    );
    for (const iconBtn of [previewBtn, copyLinkBtn]) {
      expect(iconBtn.classes()).toEqual(expect.arrayContaining(['h-9', 'w-9', 'border']));
    }
  });

  it('keeps border parity and single-line text on VersionChangelogModal and GuestbookModal footer buttons', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const i18n = createI18n({ initialLocale: 'zh-CN' });

    const changelogWrapper = mount(VersionChangelogModal, {
      props: {
        show: true,
        currentVersion: '2.8.2',
        release: { tag_name: 'v2.8.2', body: '' },
      },
      global: {
        plugins: [pinia, i18n],
        stubs: { Teleport: true },
      },
    });

    const changelogFooterBtns = changelogWrapper.findAll('.modal-chrome-footer button');
    expect(changelogFooterBtns).toHaveLength(2);
    for (const btn of changelogFooterBtns) {
      expect(btn.classes()).toEqual(expect.arrayContaining(['border', 'whitespace-nowrap']));
    }

    const guestbookWrapper = mount(GuestbookModal, {
      props: {
        show: true,
        config: { enabled: true },
      },
      global: {
        plugins: [pinia, i18n],
        stubs: { Teleport: true, TurnstileWidget: true },
      },
    });

    const guestbookFooterBtns = guestbookWrapper.findAll('.modal-chrome-footer button');
    expect(guestbookFooterBtns).toHaveLength(2);
    for (const btn of guestbookFooterBtns) {
      expect(btn.classes()).toEqual(expect.arrayContaining(['border', 'whitespace-nowrap']));
    }
  });
});
