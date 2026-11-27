import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { clearAllNodeCaches } from '../../functions/services/node-cache-service.js';
import { clearSettingsCache } from '../../functions/storage-adapter.js';
import { useVirtualList } from '@/composables/useVirtualList.js';
import NodeList from '@/components/modals/NodePreview/components/NodeList.vue';
import { createI18n } from '@/i18n/index.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

describe('Batch 3 optimistic concurrency, incremental cache, and UI performance', () => {
  beforeEach(() => {
    clearSettingsCache();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('enforces row-level D1 config_version OCC with 409 VERSION_CONFLICT and force bypass', async () => {
    const db = createMemoryD1({
      subscriptions: [{ id: 'sub-1', name: 'Sub 1', url: 'https://a.example.com/sub', enabled: true, sortIndex: 0 }],
      profiles: [
        {
          id: 'prof-1',
          name: 'Profile 1',
          customId: 'p1',
          linkId: 'link-p1',
          subscriptions: ['sub-1'],
          manualNodes: [],
          subProfiles: [],
          enabled: true,
          isPublic: false,
          downloadCount: 0,
          shortLink: '',
          sortIndex: 0,
        },
      ],
    });
    const env = { MISUB_DB: db };
    const { handleDataRequest } = await import('../../functions/modules/api-handler.js');
    const { handleSubscriptionPatch } = await import('../../functions/modules/resource-crud-handler.js');

    const dataRes = await handleDataRequest(env);
    const dataBody = await dataRes.json();
    expect(dataBody.dataRevision).toBeUndefined();
    expect(dataBody.misubs[0].configVersion).toBe(1);
    expect(dataBody.profiles[0].configVersion).toBe(1);

    const makePatchRequest = (body) =>
      new Request('https://example.com/api/subscriptions/sub-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    // Matching configVersion succeeds and increments DB config_version
    const okRes = await handleSubscriptionPatch(
      makePatchRequest({ name: 'Sub 1 Updated', configVersion: 1 }),
      env,
      'sub-1',
    );
    expect(okRes.status).toBe(200);
    const okBody = await okRes.json();
    expect(okBody.data.configVersion).toBe(2);
    expect(db.configVersions.subscriptions.get('sub-1')).toBe(2);

    // Stale configVersion fails with 409 VERSION_CONFLICT and returns current server row
    const conflictRes = await handleSubscriptionPatch(
      makePatchRequest({ name: 'Stale Write', configVersion: 1 }),
      env,
      'sub-1',
    );
    expect(conflictRes.status).toBe(409);
    const conflictBody = await conflictRes.json();
    expect(conflictBody.code).toBe('VERSION_CONFLICT');
    expect(conflictBody.current).toMatchObject({ id: 'sub-1', name: 'Sub 1 Updated', configVersion: 2 });

    // force: true overrides stale configVersion
    const forceRes = await handleSubscriptionPatch(
      makePatchRequest({ name: 'Sub 1 Forced', configVersion: 1, force: true }),
      env,
      'sub-1',
    );
    expect(forceRes.status).toBe(200);
    expect((await forceRes.json()).data.configVersion).toBe(3);
  });

  it('useDataStore sends configVersion and handles 409 VERSION_CONFLICT gracefully with single toast', async () => {
    const showToast = vi.fn();
    vi.doMock('@/stores/useToastStore.js', () => ({
      useToastStore: () => ({ showToast }),
    }));
    const apiPatch = vi.fn();
    const apiGet = vi.fn();
    class MockAPIError extends Error {
      constructor(message, status, data) {
        super(message);
        this.status = status;
        this.data = data;
      }
    }
    vi.doMock('@/lib/http.js', () => ({
      api: { get: apiGet, post: vi.fn(), put: vi.fn(), del: vi.fn(), patch: apiPatch },
      APIError: MockAPIError,
    }));

    setActivePinia(createPinia());
    const { useDataStore } = await import('@/stores/useDataStore.js');
    const store = useDataStore();

    store.hydrateFromData({
      misubs: [{ id: 's1', name: 'S1', url: 'https://s1.example.com', configVersion: 1 }],
      profiles: [],
      ruleTemplates: [],
      config: {},
    });

    apiPatch.mockResolvedValueOnce({
      success: true,
      data: { id: 's1', name: 'S1 Updated', url: 'https://s1.example.com', enabled: true, tags: [], configVersion: 2 },
    });
    const okRes = await store.updateSubscriptionRecord('s1', { name: 'S1 Updated' }, { expectedConfigVersion: 1 });
    expect(okRes.ok).toBe(true);
    expect(apiPatch.mock.calls[0][1].configVersion).toBe(1);
    expect(store.subscriptions[0].configVersion).toBe(2);

    showToast.mockClear();
    const serverCurrent = {
      id: 's1',
      name: 'Remote',
      url: 'https://s1.example.com',
      enabled: true,
      tags: [],
      configVersion: 3,
    };
    apiPatch.mockRejectedValueOnce(
      new MockAPIError('conflict', 409, { code: 'VERSION_CONFLICT', message: 'conflict', current: serverCurrent }),
    );
    const conflictRes = await store.updateSubscriptionRecord('s1', { name: 'Stale' }, { expectedConfigVersion: 2 });
    expect(conflictRes.ok).toBe(false);
    expect(conflictRes.conflict?.current).toEqual(serverCurrent);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][1]).toBe('warning');
  });

  it('checks notifications incrementally and preserves untouched profile/token caches on profile PATCH', async () => {
    const checkAndNotify = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../functions/modules/notifications.js', () => ({
      checkAndNotify,
      sendTgNotification: vi.fn().mockResolvedValue(true),
    }));

    const db = createMemoryD1({
      subscriptions: [
        { id: 'sub-1', name: 'Unchanged', url: 'https://a.example.com/sub', enabled: true, sortIndex: 0 },
        { id: 'sub-2', name: 'Changed', url: 'https://b.example.com/sub', enabled: true, sortIndex: 1 },
      ],
      profiles: [
        {
          id: 'prof-untouched',
          name: 'Untouched',
          customId: 'untouched',
          linkId: 'link-untouched',
          subscriptions: ['sub-1'],
          manualNodes: [],
          subProfiles: [],
          enabled: true,
          sortIndex: 0,
          configVersion: 1,
        },
        {
          id: 'prof-edited',
          name: 'Edited',
          customId: 'edited',
          linkId: 'link-edited',
          subscriptions: ['sub-2'],
          manualNodes: [],
          subProfiles: [],
          enabled: true,
          sortIndex: 1,
          configVersion: 1,
        },
      ],
      node_cache_profile_untouched: { nodes: 'ok', timestamp: Date.now() },
      node_cache_profile_edited: { nodes: 'stale', timestamp: Date.now() },
      node_cache_token_main: { nodes: 'token-ok', timestamp: Date.now() },
    });

    const { handleProfilePatch } = await import('../../functions/modules/resource-crud-handler.js');

    // Only edit profile-edited name without changing subscriptions
    const response = await handleProfilePatch(
      new Request('https://example.com/api/profiles/prof-edited', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Edited Renamed', configVersion: 1 }),
      }),
      { MISUB_DB: db },
      'prof-edited',
    );

    expect(response.status).toBe(200);
    // Unchanged subscriptions should not trigger checkAndNotify
    expect(checkAndNotify).not.toHaveBeenCalled();

    const dump = db.dump();
    expect(dump.node_cache_profile_untouched).toBeDefined();
    expect(dump.node_cache_token_main).toBeDefined();
    expect(dump.node_cache_profile_edited).toBeUndefined();
  });

  it('clearAllNodeCaches respects preserveProfileKeys and skipTokenCaches', async () => {
    const deleted = [];
    const storage = {
      async list() {
        return [
          'node_cache_token_main',
          'node_cache_profile_keep',
          'node_cache_profile_drop',
          'node_cache_subscription_sub1',
        ];
      },
      async delete(key) {
        deleted.push(key);
      },
    };

    const result = await clearAllNodeCaches(storage, {
      preserveProfileKeys: ['node_cache_profile_keep'],
      skipTokenCaches: true,
    });

    expect(result).toEqual({ cleared: 2, failed: 0, skipped: 2 });
    expect(deleted).toEqual(['node_cache_profile_drop', 'node_cache_subscription_sub1']);
  });

  it('virtualizes large lists in useVirtualList and memoizes parseNodeInfo per row in NodeList', () => {
    const smallItems = ref(Array.from({ length: 24 }, (_, i) => ({ id: i })));
    const smallList = useVirtualList({ items: smallItems, itemHeight: 50, overscan: 4, threshold: 60 });
    expect(smallList.isVirtualized.value).toBe(false);
    expect(smallList.visibleItems.value).toHaveLength(24);
    expect(smallList.topSpacerHeight.value).toBe(0);

    const largeItems = ref(Array.from({ length: 500 }, (_, i) => ({ id: i })));
    const largeList = useVirtualList({ items: largeItems, itemHeight: 50, overscan: 5, threshold: 60 });
    expect(largeList.isVirtualized.value).toBe(true);
    expect(largeList.visibleItems.value.length).toBeLessThan(30);
    expect(largeList.bottomSpacerHeight.value).toBeGreaterThan(0);

    largeList.handleScroll({ target: { scrollTop: 5000 } });
    expect(largeList.topSpacerHeight.value).toBeGreaterThan(0);
    expect(largeList.visibleItems.value[0].id).toBeGreaterThan(80);

    const nodes = Array.from({ length: 10 }, (_, i) => ({
      url: `trojan://pass@node-${i}.example.com:443#Node-${i}`,
      name: `Node-${i}`,
      protocol: 'trojan',
      region: '香港',
      server: `node-${i}.example.com`,
      port: '443',
    }));
    const parseNodeInfo = vi.fn((node) => ({
      name: node.name,
      server: node.server,
      port: node.port,
      protocol: node.protocol,
      region: node.region,
    }));

    mount(NodeList, {
      props: {
        nodes,
        parseNodeInfo,
        getProtocolStyle: () => '',
      },
      global: {
        plugins: [createI18n({ initialLocale: 'zh-CN' })],
        stubs: { Switch: true },
      },
    });

    expect(parseNodeInfo).toHaveBeenCalledTimes(10);
  });
});
