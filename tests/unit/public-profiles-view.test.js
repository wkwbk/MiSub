import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PublicProfilesView from '@/views/PublicProfilesView.vue';
import PublicLinksSettings from '@/components/settings/sections/PublicLinksSettings.vue';
import ClientSettings from '@/components/settings/sections/ClientSettings.vue';
import { api } from '@/lib/http.js';
import { appQueryClient } from '@/lib/query-client.js';

vi.mock('@/lib/http.js', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/stores/useToastStore.js', () => ({
  useToastStore: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('@/components/modals/NodePreview/NodePreviewModal.vue', () => ({
  default: { template: '<div />' },
}));
vi.mock('@/components/public/AnnouncementCard.vue', () => ({
  default: { template: '<div />' },
}));
vi.mock('@/components/modals/GuestbookModal.vue', () => ({
  default: { template: '<div />' },
}));
vi.mock('@/components/modals/QuickImportModal.vue', () => ({
  default: { template: '<div />' },
}));

describe('PublicProfilesView hero loading state', () => {
  let wrapper;
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    appQueryClient.clear();
    api.get.mockReset();
    api.get.mockImplementation((url) => {
      if (url === '/api/clients') {
        return Promise.resolve({ success: true, data: [] });
      }
      return Promise.resolve({ success: true, data: [] });
    });
  });

  afterEach(async () => {
    await vi.dynamicImportSettled();
    wrapper?.unmount();
    appQueryClient.clear();
    vi.clearAllMocks();
  });

  it('does not flash fallback hero text before the public profile config loads', async () => {
    let resolveProfiles;
    api.get.mockImplementation((url) => {
      if (url === '/api/public/profiles') {
        return new Promise((resolve) => {
          resolveProfiles = resolve;
        });
      }
      if (url === '/api/clients') {
        return Promise.resolve({ success: true, data: [] });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    wrapper = mount(PublicProfilesView, {
      global: {
        plugins: [pinia],
        stubs: {
          ProfileGrid: true,
          BaseIcon: true,
          AnnouncementCard: true,
          GuestbookModal: true,
          QuickImportModal: true,
          NodePreviewModal: true,
        },
      },
    });

    expect(wrapper.text()).not.toContain('发现');
    expect(wrapper.text()).not.toContain('优质订阅');

    resolveProfiles({
      success: true,
      data: [{ id: '1', name: 'Demo', enabled: true }],
      config: {
        hero: {
          title1: '自定义发现',
          title2: '自定义订阅',
          description: '自定义描述',
        },
      },
    });

    await flushPromises();
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain('自定义发现');
    expect(wrapper.text()).toContain('自定义订阅');
    expect(wrapper.text()).toContain('自定义描述');
  });

  it('does not flash the default public page before custom page config loads', async () => {
    let resolveProfiles;
    api.get.mockImplementation((url) => {
      if (url === '/api/public/profiles') {
        return new Promise((resolve) => {
          resolveProfiles = resolve;
        });
      }
      if (url === '/api/clients') {
        return Promise.resolve({ success: true, data: [] });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    wrapper = mount(PublicProfilesView, {
      global: {
        plugins: [pinia],
        stubs: {
          ProfileGrid: true,
          BaseIcon: true,
          AnnouncementCard: true,
          GuestbookModal: true,
          QuickImportModal: true,
          NodePreviewModal: true,
          CustomPublicRenderer: {
            template: '<div class="custom-renderer-stub">自定义公开页</div>',
          },
        },
      },
    });

    expect(wrapper.text()).not.toContain('Cosmic Selection');
    expect(wrapper.text()).not.toContain('发现');
    expect(wrapper.text()).not.toContain('优质订阅');

    resolveProfiles({
      success: true,
      data: [{ id: '1', name: 'Demo', enabled: true }],
      config: {
        customPage: {
          enabled: true,
          content: '<div>{{profiles}}</div>',
          css: '',
          useDefaultLayout: true,
        },
      },
    });

    await flushPromises();
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain('自定义公开页');
    expect(wrapper.text()).not.toContain('Cosmic Selection');
  });

  it('renders custom public page as full-bleed when default layout is disabled', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/api/public/profiles') {
        return Promise.resolve({
          success: true,
          data: [{ id: '1', name: 'Demo', enabled: true }],
          config: {
            customPage: {
              enabled: true,
              content: '<section>Immersive</section>',
              css: '',
              useDefaultLayout: false,
            },
          },
        });
      }
      if (url === '/api/clients') {
        return Promise.resolve({ success: true, data: [] });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    wrapper = mount(PublicProfilesView, {
      global: {
        plugins: [pinia],
        stubs: {
          ProfileGrid: true,
          BaseIcon: true,
          AnnouncementCard: true,
          GuestbookModal: true,
          QuickImportModal: true,
          NodePreviewModal: true,
          CustomPublicRenderer: {
            inheritAttrs: false,
            template: '<div class="custom-renderer-stub" :class="$attrs.class">自定义公开页</div>',
          },
        },
      },
    });

    await flushPromises();
    await vi.dynamicImportSettled();

    const renderer = wrapper.find('.custom-renderer-stub');
    expect(renderer.exists()).toBe(true);
    expect(renderer.classes()).toContain('min-h-[100dvh]');
    expect(renderer.classes()).toContain('w-full');
    expect(renderer.classes()).not.toContain('max-w-7xl');
  });

  it('applies the server default locale for visitors without an explicit preference', async () => {
    localStorage.clear();
    api.get.mockImplementation((url) => {
      if (url === '/api/public/profiles') {
        return Promise.resolve({
          success: true,
          data: [{ id: '1', name: 'Demo', enabled: true }],
          config: { defaultLocale: 'en-US' },
        });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    wrapper = mount(PublicProfilesView, {
      global: {
        plugins: [pinia],
        stubs: {
          ProfileGrid: true,
          BaseIcon: true,
          AnnouncementCard: true,
          GuestbookModal: true,
          QuickImportModal: true,
          NodePreviewModal: true,
        },
      },
    });

    await flushPromises();
    await vi.dynamicImportSettled();

    expect(localStorage.getItem('misub:locale')).toBe('en-US');
  });

  it('does not override a visitor explicit locale with the server default', async () => {
    localStorage.setItem('misub:locale', 'zh-CN');
    api.get.mockImplementation((url) => {
      if (url === '/api/public/profiles') {
        return Promise.resolve({
          success: true,
          data: [{ id: '1', name: 'Demo', enabled: true }],
          config: { defaultLocale: 'en-US' },
        });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    wrapper = mount(PublicProfilesView, {
      global: {
        plugins: [pinia],
        stubs: {
          ProfileGrid: true,
          BaseIcon: true,
          AnnouncementCard: true,
          GuestbookModal: true,
          QuickImportModal: true,
          NodePreviewModal: true,
        },
      },
    });

    await flushPromises();
    await vi.dynamicImportSettled();

    expect(localStorage.getItem('misub:locale')).toBe('zh-CN');
  });

  it.each([false, true])('shows a safe retryable API error for default/custom layout (custom=%s)', async (custom) => {
    api.get.mockImplementation((url) =>
      url === '/api/public/profiles'
        ? Promise.resolve({
            success: false,
            message: 'SECRET server detail',
            config: custom ? { customPage: { enabled: true } } : {},
          })
        : Promise.resolve({ success: true, data: [] }),
    );
    wrapper = mount(PublicProfilesView, {
      global: {
        plugins: [pinia],
        stubs: {
          ProfileGrid: true,
          BaseIcon: true,
          AnnouncementCard: true,
          GuestbookModal: true,
          QuickImportModal: true,
          NodePreviewModal: true,
          CustomPublicRenderer: { template: '<div><slot name="profiles" /></div>' },
        },
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Failed to load public profiles. Please try again.');
    expect(wrapper.text()).not.toContain('SECRET');
    expect(wrapper.find('button').text()).toContain('Retry');
  });

  it.each([false, true])(
    'shows safe error on request exception and retries successfully (custom=%s)',
    async (custom) => {
      let attempts = 0;
      api.get.mockImplementation((url) => {
        if (url === '/api/public/profiles') {
          attempts += 1;
          if (attempts === 1) return Promise.reject(new Error('SECRET exception detail'));
          return Promise.resolve({
            success: true,
            data: [],
            config: custom ? { customPage: { enabled: true } } : {},
          });
        }
        return Promise.resolve({ success: true, data: [] });
      });
      wrapper = mount(PublicProfilesView, {
        global: {
          plugins: [pinia],
          stubs: {
            ProfileGrid: true,
            BaseIcon: true,
            AnnouncementCard: true,
            GuestbookModal: true,
            QuickImportModal: true,
            NodePreviewModal: true,
            CustomPublicRenderer: { template: '<div><slot name="profiles" /></div>' },
          },
        },
      });
      await flushPromises();
      expect(wrapper.text()).toContain('Failed to load public profiles. Please try again.');
      expect(wrapper.text()).not.toContain('SECRET');
      await wrapper.find('button').trigger('click');
      await flushPromises();
      expect(wrapper.text()).toContain('No public profiles available');
    },
  );

  it.each([false, true])('shows explicit empty state after successful empty response (custom=%s)', async (custom) => {
    api.get.mockImplementation((url) =>
      url === '/api/public/profiles'
        ? Promise.resolve({
            success: true,
            data: [],
            config: custom ? { customPage: { enabled: true } } : {},
          })
        : Promise.resolve({ success: true, data: [] }),
    );
    wrapper = mount(PublicProfilesView, {
      global: {
        plugins: [pinia],
        stubs: {
          ProfileGrid: true,
          BaseIcon: true,
          AnnouncementCard: true,
          GuestbookModal: true,
          QuickImportModal: true,
          NodePreviewModal: true,
          CustomPublicRenderer: { template: '<div><slot name="profiles" /></div>' },
        },
      },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('No public profiles available');
  });

  it('renders public navigation links (speedtest, IP tools, server providers) and filters by category', async () => {
    localStorage.clear();
    api.get.mockImplementation((url) =>
      url === '/api/public/profiles'
        ? Promise.resolve({
            success: true,
            data: [{ id: '1', name: 'Demo', enabled: true }],
            config: { defaultLocale: 'zh-CN' },
          })
        : Promise.resolve({ success: true, data: [] }),
    );

    wrapper = mount(PublicProfilesView, {
      global: {
        plugins: [pinia],
        stubs: {
          ProfileGrid: true,
          BaseIcon: true,
          AnnouncementCard: true,
          GuestbookModal: true,
          QuickImportModal: true,
          NodePreviewModal: true,
        },
      },
    });

    await flushPromises();
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain('常用网站与网络工具');
    expect(wrapper.text()).toContain('Speedtest');
    expect(wrapper.text()).toContain('PING0');
    expect(wrapper.text()).toContain('DMIT');

    const providerTab = wrapper.findAll('button').find((btn) => btn.text() === '服务器厂商');
    expect(providerTab).toBeTruthy();
    await providerTab.trigger('click');

    expect(wrapper.text()).toContain('DMIT');
    expect(wrapper.text()).toContain('RackNerd');
    expect(wrapper.text()).not.toContain('PING0');
  });

  it('allows adding a custom website link in PublicLinksSettings', async () => {
    const initialLinks = {
      enabled: true,
      items: [
        {
          id: 'fast-com',
          name: 'FAST',
          category: 'speedtest',
          description: 'Netflix speed test',
          url: 'https://fast.com/',
          icon: '🚀',
          enabled: true,
        },
      ],
    };
    api.get.mockImplementation((url) => {
      if (url === '/api/public_links') {
        return Promise.resolve({ success: true, data: initialLinks });
      }
      return Promise.resolve({ success: true, data: [] });
    });
    api.post.mockImplementation((_url, payload) => Promise.resolve({ success: true, data: payload }));

    wrapper = mount(PublicLinksSettings, {
      global: {
        stubs: {
          Modal: {
            props: ['show', 'title'],
            template: '<div v-if="show"><slot name="body" /><slot name="footer" /></div>',
          },
        },
      },
    });
    await flushPromises();

    const addButton = wrapper
      .findAll('button')
      .find((btn) => btn.text().includes('新增网站') || btn.text().includes('Add website'));
    await addButton.trigger('click');

    const inputs = wrapper.findAll('input[type="text"]');
    // [0] is icon URL/Emoji, [1] is name, [2] is website URL
    await inputs[1].setValue('Whoer');
    await inputs[2].setValue('whoer.net');

    const saveButton = wrapper.findAll('button').find((btn) => btn.text() === '保存' || btn.text() === 'Save');
    await saveButton.trigger('click');
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith(
      '/api/public_links',
      expect.objectContaining({
        enabled: true,
        items: expect.arrayContaining([
          expect.objectContaining({ id: 'fast-com' }),
          expect.objectContaining({ name: 'Whoer', url: 'https://whoer.net' }),
        ]),
      }),
    );
  });

  it('filters clients by platform on both PublicProfilesView and ClientSettings', async () => {
    localStorage.clear();
    const mockClients = [
      {
        id: 'v2rayn',
        name: 'v2rayN',
        icon: '💻',
        description: 'Windows client',
        platforms: ['windows'],
        url: 'https://example.com/v2rayn',
      },
      {
        id: 'shadowrocket',
        name: 'Shadowrocket',
        icon: '🚀',
        description: 'iOS client',
        platforms: ['ios'],
        url: 'https://example.com/shadowrocket',
      },
    ];

    api.get.mockImplementation((url) => {
      if (url === '/api/public/profiles') {
        return Promise.resolve({
          success: true,
          data: [{ id: '1', name: 'Demo', enabled: true }],
          config: { defaultLocale: 'zh-CN' },
        });
      }
      if (url === '/api/clients') {
        return Promise.resolve({
          success: true,
          data: mockClients,
        });
      }
      return Promise.resolve({ success: true, data: [] });
    });

    wrapper = mount(PublicProfilesView, {
      global: {
        plugins: [pinia],
        stubs: {
          ProfileGrid: true,
          BaseIcon: true,
          AnnouncementCard: true,
          GuestbookModal: true,
          QuickImportModal: true,
          NodePreviewModal: true,
        },
      },
    });

    await flushPromises();
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain('v2rayN');
    expect(wrapper.text()).toContain('Shadowrocket');

    const iosTab = wrapper.findAll('button').find((btn) => btn.text() === 'iOS');
    expect(iosTab).toBeTruthy();
    await iosTab.trigger('click');

    expect(wrapper.text()).toContain('Shadowrocket');
    expect(wrapper.text()).not.toContain('v2rayN');

    wrapper.unmount();

    wrapper = mount(ClientSettings, {
      global: {
        stubs: {
          Modal: true,
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('v2rayN');
    expect(wrapper.text()).toContain('Shadowrocket');

    const settingsIosTab = wrapper.findAll('button').find((btn) => btn.text() === 'iOS');
    await settingsIosTab.trigger('click');

    expect(wrapper.text()).toContain('Shadowrocket');
    expect(wrapper.text()).not.toContain('v2rayN');
  });
});
