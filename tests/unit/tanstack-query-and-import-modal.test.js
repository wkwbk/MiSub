// @vitest-environment happy-dom
import fs from 'node:fs';
import path from 'node:path';
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from '@/i18n/index.js';
import { createAppQueryClient, QUERY_KEYS } from '@/lib/query-client.js';
import {
  syncAppDataSnapshotToCache,
  useAppDataQuery,
  useSaveSettingsMutation,
} from '@/queries/useAppDataQueries.js';
import ImportModal from '@/components/modals/ImportModal.vue';
import LineNumberTextarea from '@/components/ui/LineNumberTextarea.vue';

const { apiGetMock, apiPostMock, apiPatchMock, MockAPIError } = vi.hoisted(() => {
  class HoistedAPIError extends Error {
    constructor(message, status = 500, data = null) {
      super(message);
      this.status = status;
      this.data = data;
    }
  }
  return {
    apiGetMock: vi.fn(),
    apiPostMock: vi.fn(),
    apiPatchMock: vi.fn(),
    MockAPIError: HoistedAPIError,
  };
});

vi.mock('@/lib/http.js', () => ({
  api: {
    get: apiGetMock,
    post: apiPostMock,
    put: vi.fn(),
    del: vi.fn(),
    patch: apiPatchMock,
  },
  APIError: MockAPIError,
}));

describe('Stage 5: TanStack Query Integration, Store Naming & Unified ImportModal', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    apiPatchMock.mockReset();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('enforces canonical useXxxStore naming across all files in src/stores/', () => {
    const storeFiles = fs.readdirSync(path.resolve('src/stores'));
    expect(storeFiles.length).toBeGreaterThanOrEqual(8);
    for (const file of storeFiles) {
      expect(file).toMatch(/^use[A-Z][A-Za-z]+Store\.ts$/);
    }
  });

  it('mounts VueQueryPlugin and handles caching, optimistic updates, and rollbacks via useAppDataQueries', async () => {
    const queryClient = createAppQueryClient();
    const pinia = createPinia();
    setActivePinia(pinia);

    apiGetMock.mockResolvedValueOnce({
      misubs: [{ id: 's1', name: 'Airport 1', url: 'https://a.example.com/sub', enabled: true }],
      profiles: [{ id: 'p1', name: 'Default', subscriptions: ['s1'], manualNodes: [] }],
      ruleTemplates: [],
      config: { siteName: 'Before', profileToken: 'sub' },
    });

    let appDataQuery;
    let saveSettingsMutation;

    const Harness = defineComponent({
      setup() {
        appDataQuery = useAppDataQuery();
        saveSettingsMutation = useSaveSettingsMutation();
        return () => h('div', appDataQuery.data.value?.misubs?.[0]?.name || 'loading');
      },
    });

    mount(Harness, {
      global: {
        plugins: [pinia, [VueQueryPlugin, { queryClient }]],
      },
    });

    await flushPromises();
    expect(apiGetMock).toHaveBeenCalledTimes(1);
    expect(appDataQuery.data.value?.misubs?.[0]?.name).toBe('Airport 1');

    // Second query observer reuses cached QueryClient data with 0 extra HTTP requests
    const SecondConsumer = defineComponent({
      setup() {
        const q = useAppDataQuery();
        return () => h('div', q.data.value?.misubs?.[0]?.name || '');
      },
    });
    const secondWrapper = mount(SecondConsumer, {
      global: { plugins: [pinia, [VueQueryPlugin, { queryClient }]] },
    });
    await flushPromises();
    expect(apiGetMock).toHaveBeenCalledTimes(1);
    expect(secondWrapper.text()).toBe('Airport 1');

    // Fine-grained resource updates synchronize into QueryClient and sessionStorage snapshot cache
    syncAppDataSnapshotToCache(queryClient, {
      misubs: [{ id: 's1', name: 'Synced Airport 1', url: 'https://a.example.com/sub', enabled: true, tags: [] }],
    });
    const syncedSnapshot = queryClient.getQueryData(QUERY_KEYS.appData);
    expect(syncedSnapshot.misubs[0].name).toBe('Synced Airport 1');

    // Settings save passes preferences header and rolls back on failure via PATCH /api/settings
    apiPatchMock.mockResolvedValueOnce({ success: true });
    await saveSettingsMutation.mutateAsync({
      settings: { siteName: 'After' },
      preferencesOnly: true,
      currentConfig: syncedSnapshot.config,
    });
    expect(apiPatchMock).toHaveBeenLastCalledWith(
      '/api/settings',
      { siteName: 'After' },
      { headers: { 'X-MiSub-Save-Scope': 'preferences' } },
    );

    const updatedCache = queryClient.getQueryData(QUERY_KEYS.appData);
    expect(updatedCache.config.siteName).toBe('After');

    apiPatchMock.mockRejectedValueOnce(new MockAPIError('Failed settings', 500));
    await expect(
      saveSettingsMutation.mutateAsync({
        settings: { siteName: 'Broken' },
        currentConfig: updatedCache.config,
      }),
    ).rejects.toThrow('Failed settings');
    expect(queryClient.getQueryData(QUERY_KEYS.appData).config.siteName).toBe('After');
  });

  it('unifies bulk, nodes (url/file), and subscriptions import modes inside ImportModal.vue', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const i18n = createI18n({ initialLocale: 'en-US' });
    const global = { plugins: [pinia, i18n], stubs: { Teleport: true } };

    // 1. mode="bulk": emits 'import' with auto-generated tag when tags are empty
    const bulkWrapper = mount(ImportModal, {
      props: { show: true, mode: 'bulk' },
      global,
    });
    const bulkTextarea = bulkWrapper.findComponent(LineNumberTextarea);
    expect(bulkTextarea.exists()).toBe(true);
    await bulkTextarea.vm.$emit('update:modelValue', 'vless://11111111-1111-1111-1111-111111111111@1.1.1.1:443#N1');
    const confirmBtn = bulkWrapper.findAll('button').find((b) => b.text().trim() === 'Confirm');
    await confirmBtn.trigger('click');
    expect(bulkWrapper.emitted('import')?.[0]?.[0]).toContain('vless://');
    expect(bulkWrapper.emitted('import')?.[0]?.[1].length).toBeGreaterThan(0);

    // 2. mode="nodes": fetches remote URL -> parses -> deduplicates -> calls addNodesFromBulk
    const addNodesFromBulk = vi.fn();
    apiPostMock.mockImplementation(async (url) => {
      if (url === '/api/fetch_external_url') {
        return { success: true, content: 'raw-sub-content' };
      }
      if (url === '/api/parse_subscription') {
        return {
          success: true,
          data: {
            nodes: [
              { name: 'HK-1', url: 'trojan://p@1.2.3.4:443#HK-1', protocol: 'trojan' },
              { name: 'HK-1 dup', url: 'trojan://p@1.2.3.4:443#HK-1', protocol: 'trojan' },
              { name: 'US-1', url: 'vless://id@5.6.7.8:443#US-1', protocol: 'vless' },
            ],
          },
        };
      }
      return { success: false };
    });

    const nodesWrapper = mount(ImportModal, {
      props: { show: true, mode: 'nodes', addNodesFromBulk, tags: ['HK'] },
      global,
    });
    const urlInput = nodesWrapper.find('input[type="url"]');
    await urlInput.setValue('https://sub.example.com/feed');
    const importBtn = nodesWrapper.findAll('button').find((b) => b.text().trim() === 'Import');
    await importBtn.trigger('click');
    await flushPromises();

    expect(addNodesFromBulk).toHaveBeenCalledTimes(1);
    const [dedupedNodes] = addNodesFromBulk.mock.calls[0];
    expect(dedupedNodes).toHaveLength(2);
    expect(dedupedNodes.map((n) => n.name)).toEqual(['HK-1', 'US-1']);

    // 3. mode="subscriptions": emits trimmed subscription text and closes immediately
    const subsWrapper = mount(ImportModal, {
      props: { show: true, mode: 'subscriptions' },
      global,
    });
    const subsTextarea = subsWrapper.findComponent(LineNumberTextarea);
    await subsTextarea.vm.$emit('update:modelValue', 'https://airport.example/sub?token=abc');
    const subsConfirmBtn = subsWrapper.findAll('button').find((b) => b.text().trim() === 'Confirm');
    await subsConfirmBtn.trigger('click');
    expect(subsWrapper.emitted('import')?.[0]).toEqual(['https://airport.example/sub?token=abc', []]);
    expect(subsWrapper.emitted('update:show')?.[0]).toEqual([false]);
  });
});
