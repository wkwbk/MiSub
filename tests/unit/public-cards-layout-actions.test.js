import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from '@/i18n/index.js';
import PublicClientsSection from '@/components/public/PublicClientsSection.vue';
import PublicCoresSection from '@/components/public/PublicCoresSection.vue';
import PublicLinksSection from '@/components/public/PublicLinksSection.vue';
import ResourceCollectionCard from '@/components/settings/ResourceCollectionCard.vue';
import ProfileGrid from '@/components/public/ProfileGrid.vue';
import PublicProfileCard from '@/components/public/ProfileCard.vue';
import HeroProfileCard from '@/components/public/HeroProfileCard.vue';

vi.mock('@/lib/api.js', () => ({
  fetchPublicResource: vi.fn(async () => ({
    success: true,
    data: {
      enabled: true,
      items: [{ id: 'r1', name: 'Res 1', description: 'Desc 1', url: 'https://r.example', enabled: true }],
    },
  })),
  initPublicResource: vi.fn(async () => ({ success: true })),
  savePublicResource: vi.fn(async () => ({ success: true })),
  fetchAppStoreRelease: vi.fn(async () => ({})),
  fetchGithubLatestRelease: vi.fn(async () => ({})),
}));

import { fetchPublicResource } from '@/lib/api.js';

describe('public and settings card layout & action consolidation', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('uses auto-rows-fr, h-full flex-col cards, and mt-auto footers in public sections and resource cards', async () => {
    const i18n = createI18n({ initialLocale: 'zh-CN' });

    const clientsWrapper = mount(PublicClientsSection, {
      props: {
        publicClients: {
          enabled: true,
          items: [
            { id: 'c1', name: 'Client A', description: 'Desc A', url: 'https://a.example', platforms: ['ios'], enabled: true },
            { id: 'c2', name: 'Client B', description: 'Desc B', url: 'https://b.example', platforms: ['ios', 'android', 'windows', 'macos'], enabled: true },
          ],
        },
      },
      global: { plugins: [i18n] },
    });
    expect(clientsWrapper.find('.auto-rows-fr').exists()).toBe(true);
    expect(clientsWrapper.find('.flex.h-full.flex-col').exists()).toBe(true);
    expect(clientsWrapper.find('.mt-auto.border-t').exists()).toBe(true);

    const coresWrapper = mount(PublicCoresSection, {
      props: {
        publicCores: {
          enabled: true,
          items: [
            { id: 'core1', name: 'Core A', description: 'Desc A', url: 'https://github.com/a/a', category: 'mihomo', tags: ['a'], enabled: true },
          ],
        },
      },
      global: { plugins: [i18n] },
    });
    expect(coresWrapper.find('.auto-rows-fr').exists()).toBe(true);
    expect(coresWrapper.find('.flex.h-full.flex-col').exists()).toBe(true);
    expect(coresWrapper.find('.mt-auto.border-t').exists()).toBe(true);

    const linksWrapper = mount(PublicLinksSection, {
      props: {
        publicLinks: {
          enabled: true,
          items: [
            { id: 'l1', name: 'Link A', description: 'Desc A', url: 'https://l.example', category: 'tool', enabled: true },
          ],
        },
      },
      global: { plugins: [i18n] },
    });
    expect(linksWrapper.find('.auto-rows-fr').exists()).toBe(true);
    expect(linksWrapper.find('.flex.h-full.flex-col').exists()).toBe(true);
    expect(linksWrapper.find('.mt-auto.border-t').exists()).toBe(true);

    const resourceWrapper = mount(ResourceCollectionCard, {
      props: {
        title: 'Resources',
        endpoint: '/api/public-links',
        defaultConfig: {
          enabled: true,
          items: [{ id: 'r1', name: 'Res 1', description: 'Desc 1', url: 'https://r.example', enabled: true }],
        },
        normalizeConfig: (raw) => raw,
        filterItem: () => true,
        resolveIcon: () => '',
        createNewItem: () => ({ id: 'new', name: '', url: '', enabled: true }),
        validateAndBuildItem: (item) => ({ item }),
        labels: {
          resetBtn: 'Reset',
          addBtn: 'Add',
          emptyText: 'Empty',
          addModalTitle: 'Add',
          editModalTitle: 'Edit',
          resetConfirmQuestion: 'Reset?',
          resetConfirmDesc: 'Reset desc',
          deleteConfirmQuestion: 'Delete?',
        },
      },
      global: { plugins: [i18n] },
    });
    await flushPromises();
    expect(fetchPublicResource).not.toHaveBeenCalled();
    expect(resourceWrapper.find('.auto-rows-fr').exists()).toBe(false);

    const toggleBtn = resourceWrapper.get('[data-testid="resource-collection-toggle"]');
    expect(toggleBtn.attributes('aria-expanded')).toBe('false');
    await toggleBtn.trigger('click');
    await flushPromises();

    expect(fetchPublicResource).toHaveBeenCalledTimes(1);
    expect(toggleBtn.attributes('aria-expanded')).toBe('true');
    expect(resourceWrapper.find('.auto-rows-fr').exists()).toBe(true);
    expect(resourceWrapper.find('.flex.h-full.flex-col').exists()).toBe(true);
    expect(resourceWrapper.find('.mt-auto.border-t').exists()).toBe(true);

    // Collapsing and expanding again should reuse loaded data without refetching
    await toggleBtn.trigger('click');
    expect(resourceWrapper.find('.auto-rows-fr').exists()).toBe(false);
    await toggleBtn.trigger('click');
    await flushPromises();
    expect(fetchPublicResource).toHaveBeenCalledTimes(1);
    expect(resourceWrapper.find('.auto-rows-fr').exists()).toBe(true);

    const gridWrapper = mount(ProfileGrid, {
      props: {
        profiles: [
          { id: 'p1', name: 'P1', enabled: true },
          { id: 'p2', name: 'P2', enabled: true },
        ],
        isQrExpanded: () => false,
      },
      global: {
        plugins: [i18n],
        stubs: { ProfileCard: true, HeroProfileCard: true },
      },
    });
    expect(gridWrapper.find('.auto-rows-fr').exists()).toBe(true);
  });

  it('consolidates short-link and regular-link copy into a single button on Public ProfileCard and HeroProfileCard', async () => {
    const i18n = createI18n({ initialLocale: 'zh-CN' });
    const withShortLink = {
      id: 'p1',
      name: 'Alpha',
      description: 'Desc',
      shortLink: 'https://s.example/abc',
      enabled: true,
    };
    const withoutShortLink = {
      id: 'p2',
      name: 'Beta',
      description: 'Desc',
      enabled: true,
    };

    const cardWithShort = mount(PublicProfileCard, {
      props: { profile: withShortLink },
      global: {
        plugins: [i18n],
        stubs: { QRCodeOverlay: true },
      },
    });
    // Only 1 copy button, no inline duplicate short-link bar
    expect(cardWithShort.text()).not.toContain('https://s.example/abc');
    const cardCopyBtn = cardWithShort.get('button[aria-label="复制短链"]');
    await cardCopyBtn.trigger('click');
    expect(cardWithShort.emitted('copy-short-link')?.[0]).toEqual([withShortLink]);
    expect(cardWithShort.emitted('copy-link')).toBeUndefined();

    const cardWithoutShort = mount(PublicProfileCard, {
      props: { profile: withoutShortLink },
      global: {
        plugins: [i18n],
        stubs: { QRCodeOverlay: true },
      },
    });
    await cardWithoutShort.get('button[aria-label="复制订阅链接"]').trigger('click');
    expect(cardWithoutShort.emitted('copy-link')?.[0]).toEqual([withoutShortLink]);

    const heroWithShort = mount(HeroProfileCard, {
      props: { profile: withShortLink },
      global: {
        plugins: [i18n],
        stubs: { QRCodeOverlay: true },
      },
    });
    expect(heroWithShort.text()).not.toContain('https://s.example/abc');
    await heroWithShort.get('button[aria-label="复制短链"]').trigger('click');
    expect(heroWithShort.emitted('copy-short-link')?.[0]).toEqual([withShortLink]);

    const heroWithoutShort = mount(HeroProfileCard, {
      props: { profile: withoutShortLink },
      global: {
        plugins: [i18n],
        stubs: { QRCodeOverlay: true },
      },
    });
    await heroWithoutShort.get('button[aria-label="复制订阅链接"]').trigger('click');
    expect(heroWithoutShort.emitted('copy-link')?.[0]).toEqual([withoutShortLink]);
  });
});
