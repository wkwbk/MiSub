import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import { createI18n, i18n, setLocale } from '@/i18n/index.js';
import WebdavBackupSettings from '@/components/settings/sections/WebdavBackupSettings.vue';
import { DEFAULT_SETTINGS } from '@/constants/default-settings.js';
import { downloadDataUrlFile, downloadJsonFile } from '@/utils/import-file.js';

const showToast = vi.fn();
const confirmAction = vi.fn();
const pickAndReadJsonFile = vi.fn();
const testWebdavConnection = vi.fn();
const runWebdavBackup = vi.fn();
const listWebdavBackups = vi.fn();
const restoreWebdavBackup = vi.fn();
const restoreLocalBackup = vi.fn();

vi.mock('@/stores/useToastStore.js', () => ({
  useToastStore: () => ({ showToast }),
}));

vi.mock('@/composables/useConfirm.js', () => ({
  confirmAction: (...args) => confirmAction(...args),
}));

vi.mock('@/utils/import-file.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    pickAndReadJsonFile: (...args) => pickAndReadJsonFile(...args),
  };
});

vi.mock('@/lib/api.js', () => ({
  testWebdavConnection: (...args) => testWebdavConnection(...args),
  runWebdavBackup: (...args) => runWebdavBackup(...args),
  listWebdavBackups: (...args) => listWebdavBackups(...args),
  restoreWebdavBackup: (...args) => restoreWebdavBackup(...args),
  restoreLocalBackup: (...args) => restoreLocalBackup(...args),
}));

function mountWebdav(webdavOverrides = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const settings = Object.freeze({
    cronSecret: 'cron-123',
    webdavBackup: Object.freeze({
      ...DEFAULT_SETTINGS.webdavBackup,
      enabled: true,
      ...webdavOverrides,
    }),
  });

  const wrapper = mount(WebdavBackupSettings, {
    props: {
      settings,
      'onUpdate:settings': (next) => {
        wrapper.setProps({ settings: next });
      },
    },
    global: {
      plugins: [createI18n({ initialLocale: 'zh-CN' }), [VueQueryPlugin, { queryClient }]],
      stubs: {
        Switch: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: '<button type="button" class="switch-stub" @click="$emit(\'update:modelValue\', !modelValue)" />',
        },
        Select: true,
      },
    },
  });

  return { wrapper, queryClient, initialSettings: settings };
}

function findButtonByText(wrapper, text) {
  const btn = wrapper.findAll('button').find((b) => b.text().trim() === text);
  if (!btn) {
    throw new Error(`Button "${text}" not found`);
  }
  return btn;
}

describe('WebdavBackupSettings governance & TanStack Query integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLocale('zh-CN');
    confirmAction.mockResolvedValue(true);
  });

  it('validates endpoint with HttpUrlStringSchema before calling testConnection mutation', async () => {
    const { wrapper } = mountWebdav({ endpoint: 'ftp://invalid.example/dav' });

    await findButtonByText(wrapper, i18n.t('settings.webdavTestConnection')).trigger('click');
    await flushPromises();

    expect(testWebdavConnection).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(i18n.t('settings.webdavInvalidEndpoint'), 'error');
  });

  it('runs WebDAV connection test mutation on valid endpoint and extracts error messages', async () => {
    testWebdavConnection.mockRejectedValueOnce({ data: { error: '认证失败 401' } });
    const { wrapper } = mountWebdav({ endpoint: 'https://dav.example.com/dav' });

    await findButtonByText(wrapper, i18n.t('settings.webdavTestConnection')).trigger('click');
    await flushPromises();

    expect(testWebdavConnection).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('认证失败 401'), 'error');
  });

  it('emits immutable update:settings without mutating frozen props on input & backup', async () => {
    runWebdavBackup.mockResolvedValueOnce({
      success: true,
      timestamp: '2026-11-26T00:00:00.000Z',
      message: '已备份',
      file: '/MiSub/backup.json',
    });
    listWebdavBackups.mockResolvedValueOnce({ success: true, data: [] });

    const { wrapper, initialSettings } = mountWebdav({ endpoint: 'https://dav.example.com/dav' });
    await wrapper.find('input').setValue('https://dav2.example.com/dav');
    await flushPromises();
    expect(initialSettings.webdavBackup.endpoint).toBe('https://dav.example.com/dav');
    expect(wrapper.props('settings').webdavBackup.endpoint).toBe('https://dav2.example.com/dav');

    await findButtonByText(wrapper, i18n.t('settings.webdavRunBackup')).trigger('click');
    await flushPromises();

    expect(runWebdavBackup).toHaveBeenCalledWith('dataOnly');
    expect(wrapper.props('settings').webdavBackup.lastBackupFile).toBe('/MiSub/backup.json');
    expect(wrapper.props('settings').webdavBackup.lastBackupStatus).toBe('success');
  });

  it('uses pickAndReadJsonFile and restoreLocalMutation for local backup restore', async () => {
    pickAndReadJsonFile.mockResolvedValueOnce({
      file: new File(['{}'], 'backup.json', { type: 'application/json' }),
      data: { scope: 'dataAndSettings', data: { subscriptions: [] } },
    });
    restoreLocalBackup.mockResolvedValueOnce({ success: true });

    const { wrapper } = mountWebdav();
    await findButtonByText(wrapper, i18n.t('settings.webdavRestoreFromFile')).trigger('click');
    await flushPromises();

    expect(pickAndReadJsonFile).toHaveBeenCalledWith('application/json');
    expect(restoreLocalBackup).toHaveBeenCalledWith(
      { scope: 'dataAndSettings', data: { subscriptions: [] } },
      'dataAndSettings',
    );
  });

  it('centralizes JSON and DataURL download triggers cleanly', () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    try {
      downloadJsonFile({ ok: true }, 'test.json');
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

      downloadDataUrlFile('data:image/png;base64,AA==', 'qr.png');
      expect(clickSpy).toHaveBeenCalledTimes(2);
    } finally {
      clickSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
