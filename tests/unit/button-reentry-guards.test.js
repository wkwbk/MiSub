import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { useDataStore } from '@/stores/useDataStore.js';
import { useManualNodes } from '@/composables/useManualNodes.js';
import { useSubscriptions } from '@/composables/useSubscriptions.js';
import SavePrompt from '@/components/ui/SavePrompt.vue';
import NodeActions from '@/components/nodes/ManualNodePanel/NodeActions.vue';

const { mockPingNode, mockFetchNodeCount, mockShowToast } = vi.hoisted(() => ({
  mockPingNode: vi.fn(),
  mockFetchNodeCount: vi.fn(),
  mockShowToast: vi.fn(),
}));

vi.mock('@/utils/ping.js', () => ({
  pingNode: (...args) => mockPingNode(...args),
}));

vi.mock('@/lib/api.js', () => ({
  fetchNodeCount: (...args) => mockFetchNodeCount(...args),
  batchUpdateNodes: vi.fn(),
}));

vi.mock('@/stores/toast.js', () => ({
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
    vi.spyOn(dataStore, 'saveData').mockResolvedValue(true);
    dataStore.overwriteSubscriptions([
      {
        id: 'node-1',
        name: 'HK-1',
        url: 'vless://uuid@example.com:443#HK-1',
        enabled: true,
      },
    ]);

    const { pingAllNodes, isPingingAll } = useManualNodes(() => {});

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
    vi.spyOn(dataStore, 'saveData').mockResolvedValue(true);
    dataStore.overwriteSubscriptions([
      {
        id: 'sub-1',
        name: 'Airport A',
        url: 'https://example.com/sub',
        enabled: true,
        isUpdating: false,
      },
    ]);

    const { handleUpdateNodeCount } = useSubscriptions(() => {});
    const firstCall = handleUpdateNodeCount('sub-1');
    const duplicateResult = await handleUpdateNodeCount('sub-1');

    expect(duplicateResult).toBe(false);
    expect(mockFetchNodeCount).toHaveBeenCalledTimes(1);

    resolveFetch({ success: true, data: { count: 10, userInfo: null } });
    await firstCall;
  });

  it('disables SavePrompt discard button while saving or discarding', () => {
    const savingWrapper = mount(SavePrompt, {
      props: {
        isDirty: true,
        saveState: 'saving',
        isDiscarding: false,
      },
    });

    const buttons = savingWrapper.findAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].attributes('disabled')).toBeDefined();
    expect(buttons[1].attributes('disabled')).toBeDefined();

    const discardingWrapper = mount(SavePrompt, {
      props: {
        isDirty: true,
        saveState: 'idle',
        isDiscarding: true,
      },
    });
    expect(discardingWrapper.findAll('button')[0].attributes('disabled')).toBeDefined();
  });
});
