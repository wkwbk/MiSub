import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { useDataStore } from '@/stores/useDataStore.js';
import { useManualNodes } from '@/composables/useManualNodes.js';
import { useSubscriptions } from '@/composables/useSubscriptions.js';
import { createI18n } from '@/i18n/index.js';
import SubscriptionEditModal from '@/components/modals/SubscriptionEditModal.vue';
import NodeActions from '@/components/nodes/ManualNodePanel/NodeActions.vue';

const { mockPingNode, mockFetchNodeCount, mockShowToast } = vi.hoisted(() => ({
  mockPingNode: vi.fn(),
  mockFetchNodeCount: vi.fn(),
  mockShowToast: vi.fn(),
}));

vi.mock('@/utils/ping.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    pingNode: (...args) => mockPingNode(...args),
  };
});

vi.mock('@/lib/api.js', () => ({
  fetchNodeCount: (...args) => mockFetchNodeCount(...args),
  batchUpdateNodes: vi.fn(),
}));

vi.mock('@/stores/useToastStore.js', () => ({
  useToastStore: () => ({
    showToast: mockShowToast,
  }),
}));

describe('button reentry guards', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockPingNode.mockReset();
    mockFetchNodeCount.mockReset();
    mockShowToast.mockReset();
  });

  it('prevents concurrent pingAllNodes executions and exposes isPingingAll', async () => {
    let resolvePing;
    mockPingNode.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePing = resolve;
        }),
    );

    const dataStore = useDataStore();
    dataStore.overwriteSubscriptions([
      {
        id: 'node-1',
        name: 'HK-1',
        url: 'vless://uuid@example.com:443#HK-1',
        enabled: true,
      },
    ]);

    const { pingAllNodes, isPingingAll } = useManualNodes();

    expect(isPingingAll.value).toBe(false);
    const firstRun = pingAllNodes();
    expect(isPingingAll.value).toBe(true);

    // Second click while first run is in-flight must be ignored
    const secondRun = pingAllNodes();
    await secondRun;

    expect(mockPingNode).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledTimes(1);

    resolvePing({ status: 'ok', latency: 42 });
    await firstRun;
    expect(isPingingAll.value).toBe(false);
    expect(mockShowToast).toHaveBeenCalledTimes(2);
  });

  it('disables ping-all button in NodeActions while isPingingAll is true', () => {
    const wrapper = mount(NodeActions, {
      props: {
        isPingingAll: true,
      },
      global: {
        stubs: {
          MoreActionsMenu: true,
          TagFilterBar: true,
        },
      },
    });

    const buttons = wrapper.findAll('button');
    const pingAllBtn = buttons.find((btn) => btn.attributes('disabled') !== undefined);
    expect(pingAllBtn).toBeTruthy();
  });

  it('prevents duplicate manual handleUpdateNodeCount calls while already updating', async () => {
    let resolveFetch;
    mockFetchNodeCount.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const dataStore = useDataStore();
    dataStore.overwriteSubscriptions([
      {
        id: 'sub-1',
        name: 'Airport A',
        url: 'https://example.com/sub',
        enabled: true,
        isUpdating: false,
      },
    ]);

    const { handleUpdateNodeCount } = useSubscriptions();
    const firstCall = handleUpdateNodeCount('sub-1');
    const duplicateResult = await handleUpdateNodeCount('sub-1');

    expect(duplicateResult).toBe(false);
    expect(mockFetchNodeCount).toHaveBeenCalledTimes(1);

    resolveFetch({ success: true, data: { count: 10, userInfo: null } });
    await firstCall;
  });

  it('disables edit modal confirm button while isSaving is true', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const i18n = createI18n({ initialLocale: 'zh-CN' });
    const editingSubscription = {
      id: 'sub-1',
      name: 'Airport A',
      url: 'https://example.com/sub',
      enabled: true,
      tags: [],
    };
    const commonGlobal = {
      plugins: [pinia, i18n],
      stubs: { Teleport: true, EditForm: true, RuleSection: true, AdvancedOptions: true },
    };

    const idleWrapper = mount(SubscriptionEditModal, {
      props: { show: true, isNew: false, isSaving: false, editingSubscription },
      global: commonGlobal,
    });
    const savingWrapper = mount(SubscriptionEditModal, {
      props: { show: true, isNew: false, isSaving: true, editingSubscription },
      global: commonGlobal,
    });

    const idleDisabledCount = idleWrapper.findAll('button').filter((b) => b.attributes('disabled') !== undefined).length;
    const savingDisabledCount = savingWrapper.findAll('button').filter((b) => b.attributes('disabled') !== undefined).length;
    expect(savingDisabledCount).toBe(idleDisabledCount + 1);
  });
});
