import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useVersionStore } from '@/stores/version.js';

vi.mock('@/lib/api.js', () => ({
  fetchGithubLatestRelease: vi.fn(),
}));

import { fetchGithubLatestRelease } from '@/lib/api.js';

describe('useVersionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows update notice and sets hasUpdate when upstream version is newer', async () => {
    fetchGithubLatestRelease.mockResolvedValue({
      tag_name: 'v9.9.9',
      html_url: 'https://github.com/wkwbk/MiSub/releases/tag/v9.9.9',
      body: 'New features',
    });

    const store = useVersionStore();
    await store.checkVersion(false);

    expect(store.hasUpdate).toBe(true);
    expect(store.showUpdateNotice).toBe(true);
    expect(fetchGithubLatestRelease).toHaveBeenCalledTimes(1);
  });

  it('persists dismissed version and suppresses repeat notice for the same version', async () => {
    fetchGithubLatestRelease.mockResolvedValue({
      tag_name: 'v9.9.9',
      html_url: 'https://github.com/wkwbk/MiSub/releases/tag/v9.9.9',
      body: 'New features',
    });

    const store = useVersionStore();
    await store.checkVersion(false);
    expect(store.showUpdateNotice).toBe(true);

    store.dismissUpdateNotice();
    expect(store.showUpdateNotice).toBe(false);
    expect(store.hasUpdate).toBe(true);

    // 模拟刷新页面后重新初始化 store
    setActivePinia(createPinia());
    const freshStore = useVersionStore();
    await freshStore.checkVersion(false);

    expect(freshStore.hasUpdate).toBe(true);
    expect(freshStore.showUpdateNotice).toBe(false);
    // 命中 1 小时客户端缓存，不会重复发网络请求
    expect(fetchGithubLatestRelease).toHaveBeenCalledTimes(1);
  });

  it('shows update notice again when an even newer version is released after cache expires', async () => {
    fetchGithubLatestRelease.mockResolvedValueOnce({
      tag_name: 'v9.9.9',
      html_url: 'https://github.com/wkwbk/MiSub/releases/tag/v9.9.9',
      body: 'v9.9.9',
    });

    const store = useVersionStore();
    await store.checkVersion(false);
    store.dismissUpdateNotice();

    // 推进超过 1 小时，缓存过期
    vi.advanceTimersByTime(60 * 60 * 1000 + 1000);
    fetchGithubLatestRelease.mockResolvedValueOnce({
      tag_name: 'v10.0.0',
      html_url: 'https://github.com/wkwbk/MiSub/releases/tag/v10.0.0',
      body: 'v10.0.0',
    });

    setActivePinia(createPinia());
    const nextStore = useVersionStore();
    await nextStore.checkVersion(false);

    expect(fetchGithubLatestRelease).toHaveBeenCalledTimes(2);
    expect(nextStore.hasUpdate).toBe(true);
    expect(nextStore.showUpdateNotice).toBe(true);
  });

  it('bypasses client cache when force option is true', async () => {
    fetchGithubLatestRelease.mockResolvedValue({
      tag_name: 'v9.9.9',
      html_url: 'https://github.com/wkwbk/MiSub/releases/tag/v9.9.9',
      body: 'v9.9.9',
    });

    const store = useVersionStore();
    await store.checkVersion(false);
    await store.checkVersion(false);
    expect(fetchGithubLatestRelease).toHaveBeenCalledTimes(1);

    await store.checkVersion(false, { force: true });
    expect(fetchGithubLatestRelease).toHaveBeenCalledTimes(2);
  });
});
