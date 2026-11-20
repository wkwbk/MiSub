import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import SubscriptionPanel from '@/components/subscriptions/SubscriptionPanel.vue';
import { createI18n, t } from '@/i18n/index.js';
import { useSubscriptions } from '@/composables/useSubscriptions.js';
import { handleBatchUpdateNodesRequest } from '../../functions/modules/handlers/node-handler.js';

const mocks = vi.hoisted(() => ({
  subscriptions: null,
  showToast: vi.fn(),
  saveData: vi.fn().mockResolvedValue(undefined),
  batchUpdateNodes: vi.fn(),
  fetchNodeCount: vi.fn(),
  handleError: vi.fn(),
}));

vi.mock('@/stores/useDataStore', () => ({
  useDataStore: () => ({
    subscriptions: mocks.subscriptions,
    settings: ref({ autoUpdateInterval: 0 }),
    saveData: mocks.saveData,
    overwriteSubscriptions: vi.fn(),
  }),
}));

vi.mock('@/stores/toast.js', () => ({
  useToastStore: () => ({
    showToast: mocks.showToast,
  }),
}));

vi.mock('@/lib/api.js', () => ({
  fetchNodeCount: mocks.fetchNodeCount,
  batchUpdateNodes: mocks.batchUpdateNodes,
}));

vi.mock('@/utils/errorHandler.js', () => ({
  handleError: mocks.handleError,
}));

function mountPanel(props = {}) {
  return mount(SubscriptionPanel, {
    props: {
      isSorting: false,
      subscriptions: [],
      ...props,
    },
    global: {
      plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
      stubs: {
        Card: {
          props: ['misub'],
          template: '<article class="card-stub">{{ misub.name }}</article>',
        },
        EmptyState: true,
        MoreActionsMenu: { template: '<div><slot name="menu" :close="() => {}" /></div>' },
        draggable: {
          template: '<div><slot name="item" v-for="element in modelValue" :element="element" /></div>',
          props: ['modelValue'],
        },
      },
    },
  });
}

describe('Subscription Refresh All', () => {
  beforeEach(() => {
    mocks.subscriptions = ref([
      {
        id: 'sub-1',
        name: 'Sub 1',
        url: 'https://example.com/1',
        enabled: true,
        nodeCount: 0,
        isUpdating: false,
        lastError: 'old error',
      },
      {
        id: 'sub-2',
        name: 'Sub 2',
        url: 'https://example.com/2',
        enabled: true,
        nodeCount: 0,
        isUpdating: false,
      },
      {
        id: 'sub-disabled',
        name: 'Disabled',
        url: 'https://example.com/3',
        enabled: false,
        nodeCount: 5,
        isUpdating: false,
      },
    ]);
    mocks.showToast.mockReset();
    mocks.saveData.mockClear();
    mocks.batchUpdateNodes.mockReset();
    mocks.fetchNodeCount.mockReset();
    mocks.handleError.mockReset();
  });

  it('interpolates refreshing count in SubscriptionPanel status and disables refreshAll while refreshing', () => {
    const wrapper = mountPanel({
      isRefreshing: true,
      subscriptions: [
        { id: '1', name: 'A', url: 'https://a.com', enabled: true, isUpdating: true },
        { id: '2', name: 'B', url: 'https://b.com', enabled: true, isUpdating: true },
        { id: '3', name: 'C', url: 'https://c.com', enabled: false, isUpdating: false },
      ],
    });

    const status = wrapper.find('[data-testid="subscriptions-refresh-status"]');
    expect(status.exists()).toBe(true);
    expect(status.text()).toBe('正在刷新 2 个订阅...');
    expect(status.text()).not.toContain('{count}');

    const refreshAllBtn = wrapper.findAll('button').find((btn) => btn.text().includes('全部刷新'));
    expect(refreshAllBtn).toBeDefined();
    expect(refreshAllBtn.attributes('disabled')).toBeDefined();

    wrapper.unmount();
  });

  it('batchUpdateAllSubscriptions updates nodeCount, userInfo, clears lastError, and saves on batch success', async () => {
    const markDirty = vi.fn();
    mocks.batchUpdateNodes.mockResolvedValue({
      success: true,
      results: [
        {
          subscriptionId: 'sub-1',
          success: true,
          nodeCount: 19,
          userInfo: { upload: 10, download: 20, total: 100 },
        },
        {
          subscriptionId: 'sub-2',
          success: true,
          nodeCount: 20,
          userInfo: null,
        },
      ],
    });

    const { batchUpdateAllSubscriptions, refreshError, isRefreshing } = useSubscriptions(markDirty);
    await batchUpdateAllSubscriptions();

    expect(mocks.batchUpdateNodes).toHaveBeenCalledWith(
      ['sub-1', 'sub-2'],
      expect.arrayContaining([
        expect.objectContaining({ id: 'sub-1', url: 'https://example.com/1' }),
        expect.objectContaining({ id: 'sub-2', url: 'https://example.com/2' }),
      ]),
    );
    expect(mocks.fetchNodeCount).not.toHaveBeenCalled();
    expect(mocks.subscriptions.value[0].nodeCount).toBe(19);
    expect(mocks.subscriptions.value[0].userInfo).toEqual({
      upload: 10,
      download: 20,
      total: 100,
    });
    expect(mocks.subscriptions.value[0].lastError).toBeNull();
    expect(mocks.subscriptions.value[1].nodeCount).toBe(20);
    expect(refreshError.value).toBe(false);
    expect(isRefreshing.value).toBe(false);
    expect(markDirty).toHaveBeenCalledTimes(1);
    expect(mocks.saveData).toHaveBeenCalledTimes(1);
    expect(mocks.showToast).toHaveBeenCalledWith(
      t('subscriptions.refreshDone', { success: 2, total: 2, failed: 0 }),
      'success',
    );
  });

  it('clears refreshError and avoids unknown-error toast when fallback sequential update succeeds', async () => {
    const markDirty = vi.fn();
    mocks.batchUpdateNodes.mockResolvedValue({
      success: false,
      error: 'HTTP 400: 没有找到需要更新的有效订阅',
      status: 400,
    });
    mocks.fetchNodeCount
      .mockResolvedValueOnce({
        success: true,
        data: { count: 12, userInfo: { upload: 1, download: 2, total: 50 } },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { count: 8, userInfo: null },
      });

    const { batchUpdateAllSubscriptions, refreshError, isRefreshing } = useSubscriptions(markDirty);
    await batchUpdateAllSubscriptions();

    expect(mocks.fetchNodeCount).toHaveBeenCalledTimes(2);
    expect(mocks.subscriptions.value[0].nodeCount).toBe(12);
    expect(mocks.subscriptions.value[1].nodeCount).toBe(8);
    expect(refreshError.value).toBe(false);
    expect(isRefreshing.value).toBe(false);
    expect(mocks.showToast).not.toHaveBeenCalledWith(expect.stringContaining('未知错误'), expect.anything());
    expect(mocks.showToast).toHaveBeenCalledWith(t('subscriptions.refreshFallback'), 'warning');
    expect(mocks.showToast).toHaveBeenCalledWith(
      t('subscriptions.refreshDone', { success: 2, total: 2, failed: 0 }),
      'success',
    );
  });

  it('handleBatchUpdateNodesRequest supports unsaved subscriptions metadata and extracts userInfo', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('ss://YWVzLTEyOC1nY206cGFzcw==@1.2.3.4:443#Node1', {
        status: 200,
        headers: {
          'subscription-userinfo': 'upload=100; download=200; total=1000; expire=1900000000',
        },
      }),
    );

    try {
      const env = {
        MISUB_KV: {
          get: vi.fn().mockResolvedValue(null),
          put: vi.fn(),
        },
      };
      const request = new Request('https://example.com/api/batch_update_nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionIds: ['unsaved-1'],
          subscriptions: [
            {
              id: 'unsaved-1',
              name: 'Unsaved Sub',
              url: 'https://sub.example.com/feed',
              enabled: true,
            },
          ],
        }),
      });

      const response = await handleBatchUpdateNodesRequest(request, env);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.results).toHaveLength(1);
      expect(payload.results[0]).toMatchObject({
        subscriptionId: 'unsaved-1',
        success: true,
        nodeCount: 1,
        userInfo: {
          upload: 100,
          download: 200,
          total: 1000,
          expire: 1900000000,
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
