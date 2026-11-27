import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { setConfirmHost, settleConfirm, useConfirmState } from '@/composables/useConfirm.js';
import { setLocale } from '@/i18n/index.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { useManualNodes } from '@/composables/useManualNodes.js';
import { useSubscriptions } from '@/composables/useSubscriptions.js';
import { useProfiles } from '@/composables/useProfiles.js';

const apiMocks = vi.hoisted(() => ({
  del: vi.fn(async (url) => ({
    success: true,
    data: { id: url.split('/').pop(), updatedProfiles: [] },
  })),
}));

vi.mock('@/stores/useToastStore.js', () => ({
  useToastStore: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/lib/http.js', async () => {
  const actual = await vi.importActual('@/lib/http.js');
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      del: apiMocks.del,
    },
  };
});

describe('Single-item delete confirmation', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    setLocale('zh-CN');
    setConfirmHost(true);
    apiMocks.del.mockClear();
  });

  afterEach(() => {
    settleConfirm(false);
    setConfirmHost(false);
  });

  it('requires danger confirmation before deleting a manual node and aborts when cancelled', async () => {
    const dataStore = useDataStore();
    dataStore.overwriteSubscriptions([
      {
        id: 'node-1',
        name: 'HK Edge',
        url: 'vless://uuid@hk.example.com:443#HK',
        enabled: true,
        configVersion: 1,
      },
    ]);

    const { deleteNode } = useManualNodes();

    const cancelPromise = deleteNode('node-1');
    expect(useConfirmState().value).toMatchObject({
      title: '确认删除节点',
      message: '确定要删除节点「HK Edge」吗？此操作不可恢复。',
      confirmText: '删除',
      variant: 'danger',
    });
    expect(apiMocks.del).not.toHaveBeenCalled();

    settleConfirm(false);
    await expect(cancelPromise).resolves.toBeNull();
    expect(apiMocks.del).not.toHaveBeenCalled();
    expect(dataStore.subscriptions.map((item) => item.id)).toEqual(['node-1']);

    const confirmPromise = deleteNode('node-1');
    expect(useConfirmState().value).toMatchObject({
      title: '确认删除节点',
      message: '确定要删除节点「HK Edge」吗？此操作不可恢复。',
      variant: 'danger',
    });

    settleConfirm(true);
    const res = await confirmPromise;
    expect(res?.ok).toBe(true);
    expect(apiMocks.del).toHaveBeenCalledTimes(1);
    expect(apiMocks.del).toHaveBeenCalledWith('/api/nodes/node-1');
    expect(dataStore.subscriptions).toHaveLength(0);
  });

  it('falls back to unnamed node label in delete confirmation when node name is blank', async () => {
    const dataStore = useDataStore();
    dataStore.overwriteSubscriptions([
      {
        id: 'node-blank',
        name: '   ',
        url: 'ss://example.com:8388',
        enabled: true,
        configVersion: 1,
      },
    ]);

    const { deleteNode } = useManualNodes();
    const pending = deleteNode('node-blank');

    expect(useConfirmState().value).toMatchObject({
      title: '确认删除节点',
      message: '确定要删除节点「未命名节点」吗？此操作不可恢复。',
      variant: 'danger',
    });

    settleConfirm(false);
    await expect(pending).resolves.toBeNull();
  });

  it('requires danger confirmation before deleting a single subscription', async () => {
    const dataStore = useDataStore();
    dataStore.overwriteSubscriptions([
      {
        id: 'sub-1',
        name: 'Airport One',
        url: 'https://airport.example.com/sub',
        enabled: true,
        configVersion: 1,
      },
    ]);

    const { deleteSubscription } = useSubscriptions();

    const cancelPromise = deleteSubscription('sub-1');
    expect(useConfirmState().value).toMatchObject({
      title: '确认删除订阅',
      message: '确定要删除订阅「Airport One」吗？此操作不可恢复。',
      confirmText: '删除',
      variant: 'danger',
    });
    settleConfirm(false);
    await expect(cancelPromise).resolves.toBeNull();
    expect(apiMocks.del).not.toHaveBeenCalled();
    expect(dataStore.subscriptions.map((item) => item.id)).toEqual(['sub-1']);

    const confirmPromise = deleteSubscription('sub-1');
    settleConfirm(true);
    const res = await confirmPromise;
    expect(res?.ok).toBe(true);
    expect(apiMocks.del).toHaveBeenCalledTimes(1);
    expect(apiMocks.del).toHaveBeenCalledWith('/api/subscriptions/sub-1');
    expect(dataStore.subscriptions).toHaveLength(0);
  });

  it('requires danger confirmation before deleting a single profile', async () => {
    const dataStore = useDataStore();
    dataStore.overwriteProfiles([
      {
        id: 'prof-1',
        customId: 'hk-share',
        name: 'HK Profile',
        enabled: true,
        subscriptions: [],
        manualNodes: [],
        configVersion: 1,
      },
    ]);

    const { handleDeleteProfile } = useProfiles();

    const cancelPromise = handleDeleteProfile('hk-share');
    expect(useConfirmState().value).toMatchObject({
      title: '确认删除订阅组',
      message: '确定要删除订阅组「HK Profile」吗？此操作不可恢复。',
      confirmText: '删除',
      variant: 'danger',
    });
    settleConfirm(false);
    await cancelPromise;
    expect(apiMocks.del).not.toHaveBeenCalled();
    expect(dataStore.profiles.map((item) => item.id)).toEqual(['prof-1']);

    const confirmPromise = handleDeleteProfile('prof-1');
    settleConfirm(true);
    await confirmPromise;
    expect(apiMocks.del).toHaveBeenCalledTimes(1);
    expect(apiMocks.del).toHaveBeenCalledWith('/api/profiles/prof-1');
    expect(dataStore.profiles).toHaveLength(0);
  });
});
