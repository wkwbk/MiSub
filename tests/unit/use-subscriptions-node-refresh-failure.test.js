import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  subscriptionsRef: { value: [] },
  applySubscriptionRuntimeUpdate: vi.fn((id, patch) => {
    const target = mocks.subscriptionsRef.value.find((s) => s.id === id);
    if (target) Object.assign(target, patch);
  }),
  showToast: vi.fn(),
  fetchNodeCount: vi.fn(),
  batchUpdateNodes: vi.fn(),
  handleError: vi.fn(),
}));

vi.mock('pinia', () => ({
  storeToRefs: () => ({
    subscriptions: mocks.subscriptionsRef,
  }),
}));

vi.mock('@/stores/useDataStore', () => ({
  useDataStore: () => ({
    applySubscriptionRuntimeUpdate: mocks.applySubscriptionRuntimeUpdate,
  }),
}));

vi.mock('@/stores/useToastStore.js', () => ({
  useToastStore: () => ({
    showToast: mocks.showToast,
  }),
}));

vi.mock('@/lib/api.js', () => ({
  fetchNodeCount: mocks.fetchNodeCount,
  batchUpdateNodes: mocks.batchUpdateNodes,
}));

vi.mock('@/utils/error-handler.js', () => ({
  handleError: mocks.handleError,
}));

describe('useSubscriptions manual node refresh failures', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.subscriptionsRef.value = [];
    mocks.applySubscriptionRuntimeUpdate.mockClear();
    mocks.showToast.mockReset();
    mocks.fetchNodeCount.mockReset();
    mocks.batchUpdateNodes.mockReset();
    mocks.handleError.mockReset();
  });

  it('clears stale node count and traffic when protective node cache is disabled', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.subscriptionsRef.value = [
      {
        id: 'sub-1',
        name: 'Airport',
        url: 'https://airport.example/sub',
        enabled: true,
        enableNodeCache: false,
        nodeCount: 86,
        userInfo: { upload: 1, download: 2, total: 100, expire: 999 },
      },
    ];
    mocks.fetchNodeCount.mockResolvedValue({
      success: false,
      error: 'HTTP 403: Forbidden',
      errorType: 'server',
      status: 403,
    });

    const { useSubscriptions } = await import('@/composables/useSubscriptions.js');
    const { handleUpdateNodeCount } = useSubscriptions();

    try {
      await handleUpdateNodeCount('sub-1');

      expect(mocks.subscriptionsRef.value[0].nodeCount).toBe(0);
      expect(mocks.subscriptionsRef.value[0].userInfo).toBeNull();
      expect(mocks.subscriptionsRef.value[0].lastError).toBe('HTTP 403: Forbidden');
      expect(errorSpy).toHaveBeenCalledWith('[handleUpdateNodeCount] Failed for Airport:', 'HTTP 403: Forbidden');
      expect(mocks.fetchNodeCount).toHaveBeenCalledWith(
        'https://airport.example/sub',
        undefined,
        false,
        undefined,
        { subscriptionId: 'sub-1', persist: true },
      );
      expect(mocks.applySubscriptionRuntimeUpdate).toHaveBeenCalledWith('sub-1', {
        lastError: 'HTTP 403: Forbidden',
        nodeCount: 0,
        userInfo: null,
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('keeps stale node count and traffic when protective node cache is enabled', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const oldUserInfo = { upload: 1, download: 2, total: 100, expire: 999 };
    mocks.subscriptionsRef.value = [
      {
        id: 'sub-1',
        name: 'Airport',
        url: 'https://airport.example/sub',
        enabled: true,
        enableNodeCache: true,
        nodeCount: 86,
        userInfo: oldUserInfo,
      },
    ];
    mocks.fetchNodeCount.mockResolvedValue({
      success: false,
      error: 'HTTP 403: Forbidden',
      errorType: 'server',
      status: 403,
    });

    const { useSubscriptions } = await import('@/composables/useSubscriptions.js');
    const { handleUpdateNodeCount } = useSubscriptions();

    try {
      await handleUpdateNodeCount('sub-1');

      expect(mocks.subscriptionsRef.value[0].nodeCount).toBe(86);
      expect(mocks.subscriptionsRef.value[0].userInfo).toBe(oldUserInfo);
      expect(mocks.subscriptionsRef.value[0].lastError).toBe('HTTP 403: Forbidden');
      expect(errorSpy).toHaveBeenCalledWith('[handleUpdateNodeCount] Failed for Airport:', 'HTTP 403: Forbidden');
      expect(mocks.applySubscriptionRuntimeUpdate).toHaveBeenCalledWith('sub-1', {
        lastError: 'HTTP 403: Forbidden',
      });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
