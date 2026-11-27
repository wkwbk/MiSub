/**
 * 契约测试：useDataStore 的错误提示只应发生一次。
 *
 * 背景（真实缺陷）：
 *   fetchData / saveData 在 catch 中既 showToast 又 throw。
 *   无 try/catch 的调用点（App.vue 的 sessionState watcher、handleSave、
 *   handleDiscard 以及 useSubscriptions 里的 void dataStore.saveData()）
 *   会把 rejection 冒泡成全局 unhandledrejection，
 *   再由 main.js 的全局处理器弹出第二个「操作失败，请稍后重试」提示。
 *
 * 约定：失败时内部提示一次并返回 false，不再向调用方抛出。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
const { apiGet, apiPost } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));

vi.mock('@/stores/useToastStore.js', () => ({
  useToastStore: () => ({ showToast }),
}));

vi.mock('@/lib/http.js', () => ({
  api: { get: apiGet, post: apiPost, put: vi.fn(), del: vi.fn(), patch: vi.fn() },
  APIError: class APIError extends Error {},
}));

describe('useDataStore 错误提示契约（单次提示、不冒泡拒绝）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    showToast.mockReset();
    apiGet.mockReset();
    apiPost.mockReset();
  });

  it('fetchData 失败时提示一次、返回 false 且不抛出', async () => {
    apiGet.mockRejectedValue(new Error('network down'));
    const { useDataStore } = await import('@/stores/useDataStore.js');
    const store = useDataStore();

    await expect(store.fetchData()).resolves.toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][1]).toBe('error');
  });

  it('fetchData 成功时返回 true', async () => {
    apiGet.mockResolvedValue({ misubs: [], profiles: [], ruleTemplates: [], config: {} });
    const { useDataStore } = await import('@/stores/useDataStore.js');
    const store = useDataStore();

    await expect(store.fetchData()).resolves.toBe(true);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('createSubscription 失败时提示一次、返回 { ok: false } 且不抛出', async () => {
    apiPost.mockRejectedValue(new Error('save failed'));
    const { useDataStore } = await import('@/stores/useDataStore.js');
    const store = useDataStore();

    const result = await store.createSubscription({
      id: 'sub-1',
      name: 'Sub 1',
      url: 'https://sub1.example.com/sub',
      enabled: true,
      tags: [],
    });
    expect(result.ok).toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][1]).toBe('error');
  });

  it('createSubscription 成功时返回 { ok: true, data }', async () => {
    const created = {
      id: 'sub-1',
      name: 'Sub 1',
      url: 'https://sub1.example.com/sub',
      enabled: true,
      tags: [],
      version: 1,
    };
    apiPost.mockResolvedValue({ success: true, data: created });
    const { useDataStore } = await import('@/stores/useDataStore.js');
    const store = useDataStore();

    const result = await store.createSubscription(created);
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ id: 'sub-1', version: 1 });
  });
});
