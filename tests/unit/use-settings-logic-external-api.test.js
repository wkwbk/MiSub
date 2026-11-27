import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSettingsLogic } from '@/composables/useSettingsLogic.js';
import { createAppQueryClient, QUERY_KEYS, bindPiniaQueryClient } from '@/lib/query-client.js';
import { useSettingsStore } from '@/stores/useSettingsStore.js';
import { useSessionStore } from '@/stores/useSessionStore.js';

const { fetchSettings, saveSettings, resetSettings, showToast } = vi.hoisted(() => ({
  fetchSettings: vi.fn(),
  saveSettings: vi.fn(),
  resetSettings: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('@/lib/api.js', () => ({
  fetchSettings,
  saveSettings,
  resetSettings,
}));

vi.mock('@/stores/useToastStore.js', () => ({
  useToastStore: () => ({ showToast }),
}));

vi.mock('@/composables/useBackupLogic.js', () => ({
  useBackupLogic: () => ({
    exportBackup: vi.fn(),
    importBackup: vi.fn(),
  }),
}));

describe('useSettingsLogic externalApi normalization', () => {
  beforeEach(() => {
    fetchSettings.mockReset();
    saveSettings.mockReset();
    resetSettings.mockReset();
    showToast.mockReset();
  });

  it('hydrates missing externalApi defaults when loading settings', async () => {
    fetchSettings.mockResolvedValue({
      success: true,
      data: {
        storageType: 'kv',
        externalApi: { enabled: true },
      },
    });

    const { settings, loadSettings } = useSettingsLogic();
    await loadSettings();

    expect(settings.value.externalApi.enabled).toBe(true);
    expect(settings.value.externalApi.tokens).toEqual([{ name: 'default', token: '' }]);
  });

  it('updates state and caches without reloading the page after saving settings', async () => {
    saveSettings.mockResolvedValue({
      success: true,
      data: {
        storageType: 'd1',
        fileName: 'MiSub-Updated',
        customLoginPath: '/secret-portal',
      },
    });
    const reload = vi.fn();
    const originalReload = window.location.reload;
    window.location.reload = reload;

    const pinia = createPinia();
    setActivePinia(pinia);
    const queryClient = createAppQueryClient();
    bindPiniaQueryClient(pinia, queryClient);

    try {
      const { settings, handleSave } = useSettingsLogic();
      settings.value.storageType = 'd1';
      settings.value.fileName = 'MiSub-Updated';

      expect(await handleSave()).toBe(true);
      expect(reload).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(expect.any(String), 'success');
      expect(useSettingsStore().config.fileName).toBe('MiSub-Updated');
      expect(useSessionStore().subscriptionConfig.customLoginPath).toBe('/secret-portal');
      expect(queryClient.getQueryData(QUERY_KEYS.settings)?.fileName).toBe('MiSub-Updated');
    } finally {
      window.location.reload = originalReload;
    }
  });

  it('reuses cached settings across repeated loadSettings calls when Pinia is active', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const queryClient = createAppQueryClient();
    bindPiniaQueryClient(pinia, queryClient);

    fetchSettings.mockResolvedValue({
      success: true,
      data: {
        storageType: 'd1',
        fileName: 'CachedSite',
      },
    });

    const first = useSettingsLogic();
    await first.loadSettings();
    expect(first.settings.value.fileName).toBe('CachedSite');
    expect(fetchSettings).toHaveBeenCalledTimes(1);

    const second = useSettingsLogic();
    await second.loadSettings();
    expect(second.settings.value.fileName).toBe('CachedSite');
    expect(fetchSettings).toHaveBeenCalledTimes(1);

    await second.loadSettings({ force: true });
    expect(fetchSettings).toHaveBeenCalledTimes(2);
  });

  it('normalizes blank token names before saving', async () => {
    saveSettings.mockResolvedValue({ success: true });
    const originalReload = window.location.reload;
    window.location.reload = vi.fn();

    try {
      const { settings, handleSave } = useSettingsLogic();
      settings.value.storageType = 'kv';
      settings.value.externalApi = {
        enabled: true,
        tokens: [{ name: '   ', token: 'abc123' }],
      };

      const result = await handleSave();

      expect(result).toBe(true);
      expect(saveSettings).toHaveBeenCalledTimes(1);
      expect(saveSettings.mock.calls[0][0].externalApi).toEqual({
        enabled: true,
        tokens: [{ name: 'token-1', token: 'abc123' }],
      });
    } finally {
      window.location.reload = originalReload;
    }
  });
});
