import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import SubscriptionPortalView from '@/views/SubscriptionPortalView.vue';
import PortalMultiSocksTable from '@/components/portal/PortalMultiSocksTable.vue';
import PortalCustomPageSettings from '@/components/settings/sections/PortalCustomPageSettings.vue';
import { readBootstrappedPortalData } from '@/utils/portal-bootstrap.js';

vi.mock('@/components/ui/Switch.vue', () => ({
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<button class="switch-stub" type="button" @click="$emit(\'update:modelValue\', !modelValue)">{{ String(modelValue) }}</button>',
  },
}));

const mountedWrappers = [];

function buildSamplePortalData(overrides = {}) {
  return {
    version: '2.9.0',
    title: 'VIP 专线门户',
    subName: '主力订阅组',
    siteTitle: 'MiSub',
    notice: '请勿传播个人专属订阅地址',
    subscriptionUrl: 'https://portal.example.com/sub/main',
    pathname: '/sub/main',
    isExpired: false,
    traffic: {
      upload: 1024 * 1024 * 1024,
      download: 2 * 1024 * 1024 * 1024,
      total: 10 * 1024 * 1024 * 1024,
      remaining: 7 * 1024 * 1024 * 1024,
    },
    expireText: '2027-01-01',
    expireStatus: '正常',
    nodeCount: 3,
    defaultLocale: 'zh-CN',
    multiSocks: {
      enabled: true,
      listen: '127.0.0.1',
      startPort: 42001,
      maxPorts: 300,
      hasAuth: true,
      totalRealNodes: 3,
      bindings: [
        {
          port: 42001,
          listen: '127.0.0.1',
          protocol: 'socks5',
          proxyName: 'HK-BGP-01',
          region: '香港',
          countryCode: 'HK',
          username: 'u1',
          password: 'p1',
        },
        {
          port: 42002,
          listen: '127.0.0.1',
          protocol: 'socks5',
          proxyName: 'JP-Tokyo-02',
          region: '日本',
          countryCode: 'JP',
          username: 'u1',
          password: 'p1',
        },
        {
          port: 42003,
          listen: '127.0.0.1',
          protocol: 'socks5',
          proxyName: 'US-LA-03',
          region: '美国',
          countryCode: 'US',
          username: 'u1',
          password: 'p1',
        },
      ],
    },
    ...overrides,
  };
}

afterEach(() => {
  while (mountedWrappers.length > 0) {
    mountedWrappers.pop()?.unmount();
  }
  const injected = document.getElementById('__MISUB_PORTAL_DATA__');
  if (injected) injected.remove();
  vi.restoreAllMocks();
});

describe('SubscriptionPortalView & Custom Portal Page Designer', () => {
  it('reads bootstrapped portal payload from #__MISUB_PORTAL_DATA__', () => {
    const script = document.createElement('script');
    script.id = '__MISUB_PORTAL_DATA__';
    script.type = 'application/json';
    script.textContent = JSON.stringify(buildSamplePortalData({ pathname: window.location.pathname }));
    document.head.appendChild(script);

    const parsed = readBootstrappedPortalData();
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe('VIP 专线门户');
    expect(parsed?.multiSocks.bindings).toHaveLength(3);
  });

  it('renders site-aligned default SubscriptionPortalView with overview, quick import, search filter, copy all, and CSV export', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    const portalData = buildSamplePortalData();
    const wrapper = mount(SubscriptionPortalView, {
      attachTo: document.body,
      props: { portalData },
    });
    mountedWrappers.push(wrapper);

    expect(wrapper.find('[data-testid="portal-header"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="portal-title"]').text()).toBe('VIP 专线门户');
    expect(wrapper.find('[data-testid="portal-notice-banner"]').text()).toContain('请勿传播个人专属订阅地址');
    expect(wrapper.find('[data-testid="portal-node-count"]').text()).toBe('3');
    expect(wrapper.find('[data-testid="portal-sub-url-input"]').element.value).toBe(
      'https://portal.example.com/sub/main',
    );
    expect(wrapper.find('[data-testid="portal-import-clash-verge"]').attributes('href')).toContain(
      'clash://install-config',
    );
    expect(wrapper.find('[data-testid="portal-import-mihomo"]').attributes('href')).toContain(
      'mihomo://install-config',
    );
    expect(wrapper.find('[data-testid="portal-import-shadowrocket"]').attributes('href')).toContain(
      'shadowrocket://add/sub://',
    );

    expect(wrapper.findAll('[data-testid="portal-socks-row"]')).toHaveLength(3);

    // 搜索过滤
    await wrapper.find('[data-testid="portal-socks-search-input"]').setValue('tokyo');
    expect(wrapper.findAll('[data-testid="portal-socks-row"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="portal-socks-filter-count"]').text()).toBe('1 / 3');

    // 复制全部（当前筛选结果）
    await wrapper.find('[data-testid="portal-copy-all-btn"]').trigger('click');
    expect(writeTextMock).toHaveBeenCalledWith('127.0.0.1:42002');

    // 验证 CSV 导出表头和行内容
    const tableWrapper = wrapper.findComponent(PortalMultiSocksTable);
    const csv = tableWrapper.vm.buildCsvContent();
    expect(csv.startsWith('\uFEFF类型,代理主机,代理端口,代理账号,代理密码,备注')).toBe(true);
    expect(csv).toContain('socks5,127.0.0.1,42002,u1,p1,JP-Tokyo-02');
  });

  it('renders custom portal HTML/CSS with DOMPurify sanitization and mounts interactive Teleport slots', async () => {
    const portalData = buildSamplePortalData({
      portalCustomPage: {
        enabled: true,
        type: 'html',
        content: `<div class="mp-wrap" onclick="alert(1)"><script>alert(2)</script><h1 class="mp-title">{{title}} ({{node_count}})</h1><section class="s1">{{overview}}</section><section class="s2">{{quick_import}}</section><section class="s3">{{multi_socks}}</section></div>`,
        css: '.mp-title { font-weight: 800; }',
        useDefaultLayout: false,
        hideHeader: true,
        hideFooter: true,
        hideBranding: true,
      },
    });

    const wrapper = mount(SubscriptionPortalView, {
      attachTo: document.body,
      props: { portalData },
    });
    mountedWrappers.push(wrapper);
    await nextTick();
    await nextTick();

    expect(wrapper.find('[data-testid="portal-header"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="portal-footer"]').exists()).toBe(false);

    const html = wrapper.find('.custom-html-container').html();
    expect(html).toContain('VIP 专线门户 (3)');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');

    // Teleport 已将真实门户组件挂载进插槽内
    const overviewSlot = wrapper.find('[data-slot="overview"]');
    const quickImportSlot = wrapper.find('[data-slot="quick_import"]');
    const multiSocksSlot = wrapper.find('[data-slot="multi_socks"]');
    expect(overviewSlot.text()).toContain('主力订阅组');
    expect(quickImportSlot.find('[data-testid="portal-copy-sub-url-btn"]').exists()).toBe(true);
    expect(multiSocksSlot.findAll('[data-testid="portal-socks-row"]')).toHaveLength(3);
  });

  it('allows configuring custom portal page in PortalCustomPageSettings with template and live preview sanitization', async () => {
    const wrapper = mount(PortalCustomPageSettings, {
      attachTo: document.body,
      props: {
        settings: {
          subPortalTitle: '自定义预览门户',
          subPortalNotice: '预览公告',
          portalCustomPage: {
            enabled: true,
            type: 'html',
            content: '<div onclick="alert(1)">{{overview}}{{multi_socks}}<script>bad()</script></div>',
            css: '.custom { padding: 8px; }',
            useDefaultLayout: true,
            hideBranding: false,
            hideHeader: false,
            hideFooter: false,
          },
        },
        'onUpdate:settings': (next) => wrapper.setProps({ settings: next }),
      },
    });
    mountedWrappers.push(wrapper);

    const iframe = wrapper.find('[data-testid="custom-page-preview-iframe"]');
    expect(iframe.exists()).toBe(true);
    const srcdoc = iframe.attributes('srcdoc') || '';
    expect(srcdoc).toContain('data-slot="overview"');
    expect(srcdoc).toContain('data-slot="multi_socks"');
    expect(srcdoc).toContain('127.0.0.1:42001');
    expect(srcdoc).toContain('HK-BGP-01');
    expect(srcdoc).toContain('SG-Edge-02');
    expect(srcdoc).toContain('JP-Tokyo-03');
    expect(srcdoc).toContain('自定义预览门户');
    expect(srcdoc).not.toContain('<script>bad()</script>');
    expect(srcdoc).not.toContain('onclick="alert(1)"');

    // 切换布局开关
    const layoutSwitches = wrapper.find('[data-testid="portal-custom-page-layout-options"]').findAll('.switch-stub');
    expect(layoutSwitches).toHaveLength(4);
    await layoutSwitches[1].trigger('click');
    expect(wrapper.props('settings').portalCustomPage.hideBranding).toBe(true);
  });

  it('switches portal theme instantaneously without triggering document.startViewTransition', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const startViewTransitionSpy = vi.fn();
    Object.defineProperty(document, 'startViewTransition', {
      value: startViewTransitionSpy,
      configurable: true,
      writable: true,
    });

    const portalData = buildSamplePortalData();
    const wrapper = mount(SubscriptionPortalView, {
      attachTo: document.body,
      global: { plugins: [pinia] },
      props: { portalData },
    });
    mountedWrappers.push(wrapper);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    await wrapper.find('[data-testid="portal-theme-toggle"]').trigger('click');

    expect(startViewTransitionSpy).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    document.documentElement.classList.remove('dark');
    setActivePinia(undefined);
  });

  it('virtualizes large multi-socks tables inside a fixed-height scroll container while preserving full copy and CSV export', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    const largeBindings = Array.from({ length: 200 }, (_, index) => ({
      port: 42001 + index,
      listen: '127.0.0.1',
      protocol: 'socks5',
      proxyName: `Node-${String(index + 1).padStart(3, '0')}`,
      region: '香港',
      countryCode: 'HK',
      username: 'u1',
      password: 'p1',
    }));

    const portalData = buildSamplePortalData({
      nodeCount: 200,
      multiSocks: {
        enabled: true,
        listen: '127.0.0.1',
        startPort: 42001,
        maxPorts: 300,
        hasAuth: true,
        totalRealNodes: 200,
        bindings: largeBindings,
      },
    });

    const wrapper = mount(PortalMultiSocksTable, {
      attachTo: document.body,
      props: { portalData },
    });
    mountedWrappers.push(wrapper);
    await nextTick();

    const container = wrapper.find('[data-testid="portal-socks-scroll-container"]');
    expect(container.exists()).toBe(true);
    expect(container.classes()).toContain('max-h-[480px]');

    // 初始仅挂载窗口期附近少量 DOM 行
    const initialRows = wrapper.findAll('[data-testid="portal-socks-row"]');
    expect(initialRows.length).toBeLessThan(40);
    expect(initialRows[0].text()).toContain('42001');

    // 复制全部与 CSV 导出仍覆盖全部 200 条记录，不受虚拟化窗口影响
    await wrapper.find('[data-testid="portal-copy-all-btn"]').trigger('click');
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const copiedLines = writeTextMock.mock.calls[0][0].split('\n');
    expect(copiedLines).toHaveLength(200);
    expect(copiedLines[199]).toBe('127.0.0.1:42200');

    const csvLines = wrapper.vm.buildCsvContent().trim().split('\r\n');
    expect(csvLines).toHaveLength(201);
    expect(csvLines[200]).toContain('42200,u1,p1,Node-200');

    // 模拟滚动到底部附近，挂载区间切换为后段节点
    container.element.scrollTop = 44 * 150;
    await container.trigger('scroll');
    await nextTick();

    const scrolledRows = wrapper.findAll('[data-testid="portal-socks-row"]');
    expect(scrolledRows.some((row) => row.text().includes('Node-155'))).toBe(true);
    expect(scrolledRows.some((row) => row.text().includes('42001'))).toBe(false);

    // 搜索末尾节点时自动重置滚动位置并精确显示匹配项
    await wrapper.find('[data-testid="portal-socks-search-input"]').setValue('Node-200');
    await nextTick();
    expect(container.element.scrollTop).toBe(0);
    const filteredRows = wrapper.findAll('[data-testid="portal-socks-row"]');
    expect(filteredRows).toHaveLength(1);
    expect(filteredRows[0].text()).toContain('42200');
  });
});
