import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { computed, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { DEFAULT_LIST_PAGE_SIZE, LIST_PAGE_SIZE_OPTIONS } from '@/constants/pagination.js';
import { useManualNodes } from '@/composables/useManualNodes.js';
import { useSubscriptions } from '@/composables/useSubscriptions.js';
import { useProfiles } from '@/composables/useProfiles.js';
import { useManualNodeSearchPagination } from '@/composables/manual-nodes/useManualNodeSearchPagination.js';
import { useDataStore } from '@/stores/useDataStore.js';
import PanelPagination from '@/components/shared/PanelPagination.vue';
import ProfilePanel from '@/components/profiles/ProfilePanel.vue';
import SubscriptionPanel from '@/components/subscriptions/SubscriptionPanel.vue';
import { createI18n } from '@/i18n/index.js';

describe('Unified list pagination across nodes, subscriptions, and profiles', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('uses the same default page size (24) and page size options across all three composables', () => {
    const dataStore = useDataStore();
    dataStore.subscriptions = [
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `sub-${i + 1}`,
        name: `Sub ${i + 1}`,
        url: `https://example.com/sub/${i + 1}`,
        enabled: true,
      })),
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `node-${i + 1}`,
        name: `Node ${i + 1}`,
        url: `ss://node-${i + 1}`,
        enabled: true,
      })),
    ];
    dataStore.profiles = Array.from({ length: 30 }, (_, i) => ({
      id: `profile-${i + 1}`,
      name: `Profile ${i + 1}`,
      enabled: true,
    }));

    const manual = useManualNodes(vi.fn());
    const subs = useSubscriptions(vi.fn());
    const profiles = useProfiles(vi.fn());

    expect(manual.manualNodesPerPage.value).toBe(DEFAULT_LIST_PAGE_SIZE);
    expect(subs.subscriptionsPerPage.value).toBe(DEFAULT_LIST_PAGE_SIZE);
    expect(profiles.profilesPerPage.value).toBe(DEFAULT_LIST_PAGE_SIZE);

    expect(manual.paginatedManualNodes.value).toHaveLength(24);
    expect(subs.paginatedSubscriptions.value).toHaveLength(24);
    expect(profiles.paginatedProfiles.value).toHaveLength(24);

    expect(manual.manualNodesTotalPages.value).toBe(2);
    expect(subs.subscriptionsTotalPages.value).toBe(2);
    expect(profiles.profilesTotalPages.value).toBe(2);

    expect(LIST_PAGE_SIZE_OPTIONS).toEqual([12, 24, 48, 96, -1]);
  });

  it('supports switching page size including all (-1) and persists preferences independently', async () => {
    const dataStore = useDataStore();
    dataStore.subscriptions = Array.from({ length: 30 }, (_, i) => ({
      id: `sub-${i + 1}`,
      name: `Sub ${i + 1}`,
      url: `https://example.com/sub/${i + 1}`,
      enabled: true,
    }));
    dataStore.profiles = Array.from({ length: 30 }, (_, i) => ({
      id: `profile-${i + 1}`,
      name: `Profile ${i + 1}`,
      enabled: true,
    }));

    const subs = useSubscriptions(vi.fn());
    const profiles = useProfiles(vi.fn());

    subs.subscriptionsPerPage.value = 12;
    profiles.profilesPerPage.value = -1;
    await Promise.resolve();

    expect(subs.paginatedSubscriptions.value).toHaveLength(12);
    expect(subs.subscriptionsTotalPages.value).toBe(3);
    expect(localStorage.getItem('subscriptionsPPS')).toBe('12');

    expect(profiles.paginatedProfiles.value).toHaveLength(30);
    expect(profiles.profilesTotalPages.value).toBe(1);
    expect(localStorage.getItem('profilesPPS')).toBe('-1');
  });

  it('keeps manual node search pagination synced with itemsPerPage instead of hardcoding 24', () => {
    const nodes = ref(
      Array.from({ length: 30 }, (_, i) => ({
        id: `n-${i + 1}`,
        name: `HK Node ${i + 1}`,
        url: `ss://hk-${i + 1}`,
      })),
    );
    const itemsPerPage = ref(12);
    const search = useManualNodeSearchPagination({
      manualNodes: nodes,
      paginatedManualNodes: computed(() => nodes.value.slice(0, itemsPerPage.value)),
      initialSearchTerm: ref('HK'),
      activeTagFilters: ref([]),
      itemsPerPage,
    });

    expect(search.totalSearchPages.value).toBe(3);
    expect(search.paginatedNodes.value).toHaveLength(12);

    itemsPerPage.value = -1;
    expect(search.totalSearchPages.value).toBe(1);
    expect(search.paginatedNodes.value).toHaveLength(30);
  });

  it('uses generic item total text in PanelPagination and shows selector when total exceeds 12', () => {
    const wrapper = mount(PanelPagination, {
      props: {
        variant: 'panel',
        currentPage: 1,
        totalPages: 1,
        totalItems: 15,
        itemsPerPage: 24,
        showItemsPerPage: true,
        showTotalItems: true,
      },
      global: {
        plugins: [createI18n({ initialLocale: 'zh-CN' })],
      },
    });

    expect(wrapper.find('.panel-pagination-shell').exists()).toBe(true);
    expect(wrapper.text()).toContain('共 15 项');
    expect(wrapper.text()).not.toContain('订阅组');
  });

  it('keeps PanelPagination visible in ProfilePanel when itemsPerPage is -1 (all)', () => {
    const profiles = Array.from({ length: 5 }, (_, i) => ({
      id: `p-${i + 1}`,
      name: `Profile ${i + 1}`,
      enabled: true,
    }));

    const wrapper = mount(ProfilePanel, {
      props: {
        profiles,
        paginatedProfiles: profiles,
        currentPage: 1,
        totalPages: 1,
        itemsPerPage: -1,
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: {
          ProfileCard: { template: '<div class="profile-card-stub"></div>' },
          MoreActionsMenu: { template: '<div><slot name="menu" :close="() => {}" /></div>' },
          draggable: true,
        },
      },
    });

    expect(wrapper.find('.panel-pagination-shell').exists()).toBe(true);
  });

  it('emits update:itemsPerPage from SubscriptionPanel and resets to page 1', async () => {
    const subs = Array.from({ length: 15 }, (_, i) => ({
      id: `s-${i + 1}`,
      name: `Sub ${i + 1}`,
      url: `https://example.com/${i + 1}`,
      enabled: true,
    }));

    const wrapper = mount(SubscriptionPanel, {
      props: {
        subscriptions: subs,
        itemsPerPage: 12,
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: {
          Card: { props: ['misub'], template: '<div class="sub-card-stub">{{ misub.name }}</div>' },
          MoreActionsMenu: { template: '<div><slot name="menu" :close="() => {}" /></div>' },
          draggable: true,
        },
      },
    });

    expect(wrapper.findAll('.sub-card-stub')).toHaveLength(12);
    const pagination = wrapper.findComponent(PanelPagination);
    pagination.vm.$emit('update:itemsPerPage', -1);
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('update:itemsPerPage')).toEqual([[-1]]);
  });
});
