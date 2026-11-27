import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { handleApiRequest } from '../../functions/modules/api-router.js';
import { createSignedToken, getSessionSigningSecret } from '../../functions/modules/auth-middleware.js';
import { COOKIE_NAME } from '../../functions/modules/config.js';
import { handleBatchUpdateNodesRequest, handleNodeCountRequest } from '../../functions/modules/handlers/node-handler.js';
import { handleShortLinkCreate } from '../../functions/modules/handlers/shortlink-handler.js';
import { NodeRepository } from '../../functions/repositories/node-repository.js';
import { StorageFactory } from '../../functions/storage-adapter.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

const frontendMocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDel: vi.fn(),
}));

vi.mock('@/lib/http.js', async () => {
  const actual = await vi.importActual('@/lib/http.js');
  return {
    ...actual,
    api: {
      get: frontendMocks.apiGet,
      post: frontendMocks.apiPost,
      patch: frontendMocks.apiPatch,
      del: frontendMocks.apiDel,
    },
  };
});

async function createAuthedEnv(db, extra = {}) {
  const env = {
    ADMIN_PASSWORD: 'test-admin-password',
    COOKIE_SECRET: 'test-cookie-secret',
    MISUB_DB: db,
    ...extra,
  };
  const signingKey = await getSessionSigningSecret(env);
  const token = await createSignedToken(signingKey, String(Date.now()));
  return {
    env,
    cookie: `${COOKIE_NAME}=${token}`,
  };
}

function makeAuthedRequest(path, cookie, { method = 'GET', body } = {}) {
  const rawBody = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  return {
    url: `https://panel.example${path}`,
    method,
    headers: {
      Cookie: cookie,
      Origin: 'https://panel.example',
      ...(rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(rawBody !== undefined
      ? {
          async text() {
            return rawBody;
          },
          async json() {
            return JSON.parse(rawBody);
          },
          async arrayBuffer() {
            return new TextEncoder().encode(rawBody).buffer;
          },
        }
      : {}),
  };
}

describe('Fine-grained Resource CRUD, Row-Level config_version OCC & Config/Runtime Decoupling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    frontendMocks.apiGet.mockReset();
    frontendMocks.apiPost.mockReset();
    frontendMocks.apiPatch.mockReset();
    frontendMocks.apiDel.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('supports fine-grained Subscription CRUD, unified batch actions, selective reorder configVersion bumps, and cascading cleanup', async () => {
    const db = createMemoryD1({
      profiles: [
        {
          id: 'prof-1',
          name: 'Default',
          enabled: true,
          subscriptions: ['sub-keep'],
          manualNodes: [],
          configVersion: 1,
        },
      ],
      subscriptions: [
        {
          id: 'sub-keep',
          name: 'Keep Sub',
          url: 'https://keep.example.com/sub',
          enabled: true,
          configVersion: 1,
          sortIndex: 0,
        },
      ],
    });
    const { env, cookie } = await createAuthedEnv(db);

    // 1. Create single subscription -> 201 with configVersion 1 in both JSON & D1 column
    const createRes = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions', cookie, {
        method: 'POST',
        body: { name: 'Airport One', url: 'https://one.example.com/sub', tags: ['专线'] },
      }),
      env,
    );
    expect(createRes.status).toBe(201);
    const createdSub = (await createRes.json()).data;
    expect(createdSub.configVersion).toBe(1);
    expect(createdSub).not.toHaveProperty('version');
    expect(db.configVersions.subscriptions.get(createdSub.id)).toBe(1);
    expect(createdSub.tags).toEqual(['专线']);

    // Attach createdSub to prof-1 to test cascading delete pruning
    const profBefore = JSON.parse(db.tables.profiles.get('prof-1'));
    db.tables.profiles.set(
      'prof-1',
      JSON.stringify({ ...profBefore, subscriptions: ['sub-keep', createdSub.id] }),
    );

    // 2. Batch create subscriptions -> 201
    const batchCreateRes = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/batch', cookie, {
        method: 'POST',
        body: {
          items: [
            { name: 'Batch A', url: 'https://ba.example.com/sub', tags: ['A'] },
            { name: 'Batch B', url: 'https://bb.example.com/sub', tags: ['B'] },
          ],
        },
      }),
      env,
    );
    expect(batchCreateRes.status).toBe(201);
    const batchCreated = (await batchCreateRes.json()).data;
    expect(batchCreated).toHaveLength(2);
    expect(batchCreated.every((s) => s.configVersion === 1)).toBe(true);

    // 3. Batch enable/disable action via POST /api/subscriptions/batch increments only changed rows
    const batchDisableRes = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/batch', cookie, {
        method: 'POST',
        body: { action: 'disable', ids: [batchCreated[0].id] },
      }),
      env,
    );
    expect(batchDisableRes.status).toBe(200);
    const disabledList = (await batchDisableRes.json()).data;
    expect(disabledList).toHaveLength(1);
    expect(disabledList[0]).toMatchObject({ id: batchCreated[0].id, enabled: false, configVersion: 2 });
    expect(db.configVersions.subscriptions.get(batchCreated[0].id)).toBe(2);
    expect(db.configVersions.subscriptions.get(batchCreated[1].id)).toBe(1);

    // 4. Reorder updates sortIndex and only bumps configVersion on moved rows
    const reorderRes = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/reorder', cookie, {
        method: 'POST',
        body: { orderedIds: [batchCreated[1].id, batchCreated[0].id, createdSub.id, 'sub-keep'] },
      }),
      env,
    );
    expect(reorderRes.status).toBe(200);
    const reordered = (await reorderRes.json()).data;
    const reorderedCreated = reordered.find((s) => s.id === createdSub.id);
    expect(reorderedCreated.sortIndex).toBe(2);
    expect(reorderedCreated.configVersion).toBe(2);

    // 5. Batch tags increments configVersion
    const batchTagsRes = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/batch-tags', cookie, {
        method: 'POST',
        body: { updates: [{ id: createdSub.id, tags: ['专线', '流媒体'] }] },
      }),
      env,
    );
    expect(batchTagsRes.status).toBe(200);
    const updatedTagItem = (await batchTagsRes.json()).data[0];
    expect(updatedTagItem.configVersion).toBe(3);
    expect(updatedTagItem.tags).toEqual(['专线', '流媒体']);

    // 6. Delete single subscription -> prunes prof-1 and bumps prof-1 configVersion
    const deleteRes = await handleApiRequest(
      makeAuthedRequest(`/api/subscriptions/${createdSub.id}`, cookie, { method: 'DELETE' }),
      env,
    );
    expect(deleteRes.status).toBe(200);
    const deleteData = (await deleteRes.json()).data;
    expect(deleteData.updatedProfiles).toHaveLength(1);
    expect(deleteData.updatedProfiles[0].subscriptions).toEqual(['sub-keep']);
    expect(deleteData.updatedProfiles[0].configVersion).toBe(2);

    // 7. Batch delete subset
    const batchDeleteRes = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/batch-delete', cookie, {
        method: 'POST',
        body: { ids: [batchCreated[0].id, batchCreated[1].id] },
      }),
      env,
    );
    expect(batchDeleteRes.status).toBe(200);
    expect((await batchDeleteRes.json()).data.deletedIds).toHaveLength(2);
    expect(db.tables.subscriptions.has('sub-keep')).toBe(true);

    // 8. Unsupported HTTP methods return 405, and legacy /api/misubs returns 404
    const methodNotAllowed = await handleApiRequest(makeAuthedRequest('/api/subscriptions', cookie), env);
    expect(methodNotAllowed.status).toBe(405);
    const legacyGone = await handleApiRequest(
      makeAuthedRequest('/api/misubs', cookie, { method: 'POST', body: { misubs: [], profiles: [] } }),
      env,
    );
    expect(legacyGone.status).toBe(404);
  });

  it('supports fine-grained Manual Node and Profile CRUD, alias checks, PATCH /api/settings, and cascading cleanup', async () => {
    const db = createMemoryD1({
      profiles: [
        {
          id: 'child-prof',
          customId: 'child-alias',
          name: 'Child Profile',
          enabled: true,
          configVersion: 1,
        },
        {
          id: 'parent-prof',
          name: 'Parent Composite',
          enabled: true,
          subProfiles: ['child-prof'],
          manualNodes: [],
          configVersion: 1,
        },
      ],
    });
    const { env, cookie } = await createAuthedEnv(db);

    // Immediate settings save via PATCH /api/settings + fresh GET /api/data
    const patchSettingsRes = await handleApiRequest(
      makeAuthedRequest('/api/settings', cookie, {
        method: 'PATCH',
        body: { siteName: 'MiSub Modern Panel' },
      }),
      env,
    );
    expect(patchSettingsRes.status).toBe(200);
    const dataRes = await handleApiRequest(makeAuthedRequest('/api/data', cookie), env);
    const dataPayload = await dataRes.json();
    expect(dataPayload.config.siteName).toBe('MiSub Modern Panel');
    expect(dataPayload).not.toHaveProperty('dataRevision');

    // Create manual node
    const nodeCreateRes = await handleApiRequest(
      makeAuthedRequest('/api/nodes', cookie, {
        method: 'POST',
        body: { name: 'HK 01', url: 'vless://11111111-1111-1111-1111-111111111111@hk.example.com:443#HK01' },
      }),
      env,
    );
    expect(nodeCreateRes.status).toBe(201);
    const createdNode = (await nodeCreateRes.json()).data;
    expect(createdNode.configVersion).toBe(1);

    // Create profile with duplicate customId -> 400
    const dupProfileRes = await handleApiRequest(
      makeAuthedRequest('/api/profiles', cookie, {
        method: 'POST',
        body: { name: 'Dup Alias', customId: 'child-alias' },
      }),
      env,
    );
    expect(dupProfileRes.status).toBe(400);

    // Attach node to parent-prof and test node PATCH preserving runtime latency unless URL changes
    const storedNode = JSON.parse(db.tables.nodes.get(createdNode.id));
    db.tables.nodes.set(
      createdNode.id,
      JSON.stringify({ ...storedNode, latency: 42, status: 'ok', latencyMode: 'tcping', lastTestedAt: '2026-11-27T00:00:00Z' }),
    );
    const parentProf = JSON.parse(db.tables.profiles.get('parent-prof'));
    db.tables.profiles.set('parent-prof', JSON.stringify({ ...parentProf, manualNodes: [createdNode.id] }));

    const nodePatchName = await handleApiRequest(
      makeAuthedRequest(`/api/nodes/${createdNode.id}`, cookie, {
        method: 'PATCH',
        body: { name: 'HK 01 Renamed', configVersion: 1 },
      }),
      env,
    );
    expect(nodePatchName.status).toBe(200);
    const patchedNode = (await nodePatchName.json()).data;
    expect(patchedNode.configVersion).toBe(2);
    expect(patchedNode.latency).toBe(42);
    expect(patchedNode.status).toBe('ok');

    // URL change clears stale node latency runtime state
    const nodePatchUrl = await handleApiRequest(
      makeAuthedRequest(`/api/nodes/${createdNode.id}`, cookie, {
        method: 'PATCH',
        body: {
          url: 'vless://22222222-2222-2222-2222-222222222222@sg.example.com:443#SG01',
          configVersion: 2,
        },
      }),
      env,
    );
    expect(nodePatchUrl.status).toBe(200);
    const urlUpdatedNode = (await nodePatchUrl.json()).data;
    expect(urlUpdatedNode.configVersion).toBe(3);
    expect(urlUpdatedNode.latency).toBeUndefined();

    // Delete node -> prunes parent-prof.manualNodes
    const delNodeRes = await handleApiRequest(
      makeAuthedRequest(`/api/nodes/${createdNode.id}`, cookie, { method: 'DELETE' }),
      env,
    );
    expect(delNodeRes.status).toBe(200);
    const prunedParentAfterNodeDel = (await delNodeRes.json()).data.updatedProfiles[0];
    expect(prunedParentAfterNodeDel.manualNodes).toEqual([]);
    expect(prunedParentAfterNodeDel.configVersion).toBe(2);

    // Delete child-prof -> prunes parent-prof.subProfiles
    const delProfRes = await handleApiRequest(
      makeAuthedRequest('/api/profiles/child-prof', cookie, { method: 'DELETE' }),
      env,
    );
    expect(delProfRes.status).toBe(200);
    const prunedParentAfterProfDel = (await delProfRes.json()).data.updatedProfiles[0];
    expect(prunedParentAfterProfDel.subProfiles).toEqual([]);
    expect(prunedParentAfterProfDel.configVersion).toBe(3);
  });

  it('enforces row-level D1 config_version OCC (409 VERSION_CONFLICT + force bypass), partial toggles merge cleanly, and unrelated records do not collide', async () => {
    const db = createMemoryD1({
      subscriptions: [
        {
          id: 'sub-1',
          name: 'Initial Sub 1',
          url: 'https://s1.example.com/sub',
          enabled: true,
          configVersion: 1,
          sortIndex: 0,
        },
        {
          id: 'sub-2',
          name: 'Initial Sub 2',
          url: 'https://s2.example.com/sub',
          enabled: true,
          configVersion: 1,
          sortIndex: 1,
        },
      ],
    });
    const { env, cookie } = await createAuthedEnv(db);

    // Device A updates sub-2; Device B still edits sub-1 with configVersion: 1 -> NO conflict!
    const updateSub2 = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/sub-2', cookie, {
        method: 'PATCH',
        body: { name: 'Updated Sub 2', configVersion: 1 },
      }),
      env,
    );
    expect(updateSub2.status).toBe(200);

    const updateSub1 = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/sub-1', cookie, {
        method: 'PATCH',
        body: { name: 'Updated Sub 1', configVersion: 1 },
      }),
      env,
    );
    expect(updateSub1.status).toBe(200);
    expect((await updateSub1.json()).data.configVersion).toBe(2);

    // Unmoved reorder leaves configVersion untouched; moved reorder bumps sortIndex + configVersion
    const noChangeReorder = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/reorder', cookie, {
        method: 'POST',
        body: { orderedIds: ['sub-1', 'sub-2'] },
      }),
      env,
    );
    expect(noChangeReorder.status).toBe(200);
    expect(db.configVersions.subscriptions.get('sub-1')).toBe(2);

    const movedReorder = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/reorder', cookie, {
        method: 'POST',
        body: { orderedIds: ['sub-2', 'sub-1'] },
      }),
      env,
    );
    expect(movedReorder.status).toBe(200);
    expect(db.configVersions.subscriptions.get('sub-1')).toBe(3);

    // Stale form at configVersion 2 while server is at 3 -> 409 VERSION_CONFLICT with current
    const conflictRes = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/sub-1', cookie, {
        method: 'PATCH',
        body: { name: 'Stale Overwrite Attempt', configVersion: 2 },
      }),
      env,
    );
    expect(conflictRes.status).toBe(409);
    const conflictBody = await conflictRes.json();
    expect(conflictBody.code).toBe('VERSION_CONFLICT');
    expect(conflictBody.current).toMatchObject({
      id: 'sub-1',
      name: 'Updated Sub 1',
      configVersion: 3,
      sortIndex: 1,
    });

    // Partial toggle without configVersion merges onto latest record without 409 and preserves updated fields
    const partialToggleRes = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/sub-1', cookie, {
        method: 'PATCH',
        body: { enabled: false },
      }),
      env,
    );
    expect(partialToggleRes.status).toBe(200);
    const toggledData = (await partialToggleRes.json()).data;
    expect(toggledData.enabled).toBe(false);
    expect(toggledData.name).toBe('Updated Sub 1');
    expect(toggledData.configVersion).toBe(4);

    // Force bypass succeeds regardless of configVersion
    const forceRes = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/sub-1', cookie, {
        method: 'PATCH',
        body: { name: 'Forced Title', configVersion: 1, force: true },
      }),
      env,
    );
    expect(forceRes.status).toBe(200);
    expect((await forceRes.json()).data).toMatchObject({ name: 'Forced Title', configVersion: 5 });
  });

  it('strictly decouples D1 config_version from all runtime writes (downloadCount, shortLink, nodeCount, batchUpdateNodes, tcping latency, cache)', async () => {
    const db = createMemoryD1({
      main: {
        profileToken: 'sub',
        shortLink: { enabled: true, apiUrl: 'https://s.example.com', apiToken: 'tok-123' },
      },
      subscriptions: [
        {
          id: 'sub-rt',
          name: 'Runtime Sub',
          url: 'https://rt.example.com/sub',
          enabled: true,
          nodeCount: 5,
          userInfo: { upload: 1, download: 2, total: 100 },
          configVersion: 1,
        },
      ],
      nodes: [
        {
          id: 'node-rt',
          name: 'Runtime Node',
          url: 'ss://YWVzLTEyOC1nY206cGFzcw@1.1.1.1:443#NodeRT',
          enabled: true,
          configVersion: 1,
        },
      ],
      profiles: [
        {
          id: 'prof-rt',
          customId: 'rt',
          linkId: 'p_prof_rt_0001',
          name: 'Runtime Profile',
          enabled: true,
          downloadCount: 5,
          subscriptions: ['sub-rt'],
          configVersion: 1,
        },
        {
          id: 'untouched',
          customId: 'untouched',
          name: 'Untouched Profile',
          enabled: true,
          subscriptions: [],
          configVersion: 1,
        },
      ],
    });
    const { env, cookie } = await createAuthedEnv(db);
    const adapter = StorageFactory.createAdapter(env);

    // 1. incrementProfileDownloadCount does NOT bump config_version
    await adapter.incrementProfileDownloadCount('rt');
    const profAfterDl = await adapter.getProfileById('prof-rt');
    expect(profAfterDl.downloadCount).toBe(6);
    expect(profAfterDl.configVersion).toBe(1);
    expect(db.configVersions.profiles.get('prof-rt')).toBe(1);

    // 2. handleShortLinkCreate (saveToProfile: true) updates shortLink without bumping config_version
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () =>
        new Response(JSON.stringify({ link: { slug: 'vip-rt' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const slRes = await handleShortLinkCreate(
      new Request('https://panel.example/api/shortlink/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://panel.example/sub/rt',
          profileId: 'prof-rt',
          saveToProfile: true,
        }),
      }),
      env,
    );
    expect(slRes.status).toBe(200);
    const profAfterShort = await adapter.getProfileById('prof-rt');
    expect(profAfterShort.shortLink).toBe('https://s.example.com/vip-rt');
    expect(profAfterShort.configVersion).toBe(1);
    expect(db.configVersions.profiles.get('prof-rt')).toBe(1);

    // Profile config PATCH with stale form (without shortLink) at configVersion: 1 succeeds and preserves both downloadCount: 6 & shortLink!
    const profPatchRes = await handleApiRequest(
      makeAuthedRequest('/api/profiles/prof-rt', cookie, {
        method: 'PATCH',
        body: { name: 'Runtime Profile v2', downloadCount: 0, configVersion: 1 },
      }),
      env,
    );
    expect(profPatchRes.status).toBe(200);
    const profPatched = (await profPatchRes.json()).data;
    expect(profPatched.downloadCount).toBe(6);
    expect(profPatched.shortLink).toBe('https://s.example.com/vip-rt');
    expect(profPatched.configVersion).toBe(2);
    expect(db.configVersions.profiles.get('prof-rt')).toBe(2);

    // 3. handleNodeCountRequest (persist: false vs persist: true) and batchUpdateNodes
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        async () =>
          new Response('ss://YWVzLTEyOC1nY206cGFzcw@1.1.1.1:443#N1\nss://YWVzLTEyOC1nY206cGFzcw@2.2.2.2:443#N2', {
            status: 200,
            headers: { 'subscription-userinfo': 'upload=10; download=20; total=200' },
          }),
      ),
    );

    const previewRes = await handleNodeCountRequest(
      new Request('https://panel.example/api/node_count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://rt.example.com/sub', subscriptionId: 'sub-rt', persist: false }),
      }),
      env,
    );
    expect(previewRes.status).toBe(200);
    expect((await previewRes.json()).data.count).toBe(2);
    expect((await adapter.getSubscriptionById('sub-rt')).nodeCount).toBe(5);

    const refreshRes = await handleNodeCountRequest(
      new Request('https://panel.example/api/node_count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://rt.example.com/sub', subscriptionId: 'sub-rt', persist: true }),
      }),
      env,
    );
    expect(refreshRes.status).toBe(200);
    const subAfterRefresh = await adapter.getSubscriptionById('sub-rt');
    expect(subAfterRefresh.nodeCount).toBe(2);
    expect(subAfterRefresh.configVersion).toBe(1);
    expect(db.configVersions.subscriptions.get('sub-rt')).toBe(1);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        async () =>
          new Response('ss://YWVzLTEyOC1nY206cGFzcw@3.3.3.3:443#N3', {
            status: 200,
          }),
      ),
    );
    const batchRefreshRes = await handleBatchUpdateNodesRequest(
      new Request('https://panel.example/api/batch_update_nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionIds: ['sub-rt'],
          subscriptions: [{ id: 'sub-rt', name: 'Runtime Sub', url: 'https://rt.example.com/sub' }],
        }),
      }),
      env,
    );
    expect(batchRefreshRes.status).toBe(200);
    const subAfterBatch = await adapter.getSubscriptionById('sub-rt');
    expect(subAfterBatch.nodeCount).toBe(1);
    expect(subAfterBatch.configVersion).toBe(1);
    expect(db.configVersions.subscriptions.get('sub-rt')).toBe(1);

    // 4. NodeRepository.batchUpdateLatencyStatus does NOT bump node config_version
    const nodeRepo = new NodeRepository({ env });
    await nodeRepo.batchUpdateLatencyStatus([{ id: 'node-rt', status: 'ok', latency: 35, mode: 'tcping' }]);
    const nodeAfterTest = await adapter.getSubscriptionById('node-rt');
    expect(nodeAfterTest.latency).toBe(35);
    expect(nodeAfterTest.configVersion).toBe(1);
    expect(db.configVersions.nodes.get('node-rt')).toBe(1);

    // Config PATCH still succeeds with configVersion: 1 and preserves nodeCount: 1
    const configPatchRes = await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/sub-rt', cookie, {
        method: 'PATCH',
        body: { name: 'Renamed Sub', nodeCount: 999, configVersion: 1 },
      }),
      env,
    );
    expect(configPatchRes.status).toBe(200);
    const subPatched = (await configPatchRes.json()).data;
    expect(subPatched.nodeCount).toBe(1);
    expect(subPatched.configVersion).toBe(2);

    // Cache preservation check on untouched profile without blocking
    await adapter.put('node_cache_profile_untouched', { nodes: 'ss://untouched', timestamp: Date.now() });
    await adapter.put('node_cache_profile_prof-rt', { nodes: 'ss://stale', timestamp: Date.now() });
    await handleApiRequest(
      makeAuthedRequest('/api/subscriptions/sub-rt', cookie, {
        method: 'PATCH',
        body: { exclude: 'TW', configVersion: 2 },
      }),
      env,
    );
    expect(await adapter.get('node_cache_profile_untouched')).not.toBeNull();
    expect(await adapter.get('node_cache_profile_prof-rt')).toBeNull();
  });

  it('frontend useDataStore rolls back optimistic updates on API errors and returns structured 409 conflicts', async () => {
    setActivePinia(createPinia());
    const { useDataStore } = await import('@/stores/useDataStore.js');
    const { useToastStore } = await import('@/stores/useToastStore.js');
    const { APIError } = await import('@/lib/http.js');

    const store = useDataStore();
    const toastStore = useToastStore();

    const initialSub = {
      id: 'sub-1',
      name: 'Origin Name',
      url: 'https://origin.example.com/sub',
      enabled: true,
      tags: ['A'],
      configVersion: 2,
    };
    store.overwriteSubscriptions([initialSub]);
    store.overwriteProfiles([
      {
        id: 'p-1',
        name: 'Profile 1',
        enabled: true,
        subscriptions: ['sub-1'],
        manualNodes: [],
        tags: [],
        configVersion: 1,
      },
    ]);

    // Delete error rolls back both subscriptions and profile references + single error toast
    frontendMocks.apiDel.mockRejectedValueOnce(new Error('network timeout'));
    const delRes = await store.deleteSubscriptionRecord('sub-1');
    expect(delRes.ok).toBe(false);
    expect(store.subscriptions).toHaveLength(1);
    expect(store.profiles[0].subscriptions).toEqual(['sub-1']);
    expect(toastStore.toasts.filter((item) => item.type === 'error')).toHaveLength(1);

    // Patch toggle error rolls back enabled flag
    frontendMocks.apiPatch.mockRejectedValueOnce(new Error('500 internal error'));
    const toggleRes = await store.patchSubscription('sub-1', { enabled: false });
    expect(toggleRes.ok).toBe(false);
    expect(store.subscriptions[0].enabled).toBe(true);
    expect(toastStore.toasts.filter((item) => item.type === 'error')).toHaveLength(2);

    // 409 VERSION_CONFLICT sends configVersion and suppresses default conflict toast when requested
    const serverCurrent = { ...initialSub, name: 'Remote Edited', configVersion: 3 };
    frontendMocks.apiPatch.mockRejectedValueOnce(
      new APIError('conflict', 409, { code: 'VERSION_CONFLICT', message: 'conflict', current: serverCurrent }),
    );
    const conflictRes = await store.updateSubscriptionRecord(
      'sub-1',
      { name: 'Local Edit' },
      { expectedConfigVersion: 2, suppressConflictToast: true },
    );
    expect(frontendMocks.apiPatch.mock.calls[1][1].configVersion).toBe(2);
    expect(conflictRes.ok).toBe(false);
    expect(conflictRes.conflict?.current).toEqual(serverCurrent);
    expect(store.isMutating).toBe(false);
  });

  it('useSubscriptionForms and useProfiles expose inline 409 conflict banner state, reload latest to re-edit, and force overwrite safely', async () => {
    setActivePinia(createPinia());
    const { useDataStore } = await import('@/stores/useDataStore.js');
    const { useSubscriptions } = await import('@/composables/useSubscriptions.js');
    const { useSubscriptionForms } = await import('@/composables/useSubscriptionForms.js');
    const { useProfiles } = await import('@/composables/useProfiles.js');
    const { APIError } = await import('@/lib/http.js');

    const store = useDataStore();
    const original = {
      id: 'sub-edit',
      name: 'Old Name',
      url: 'https://sub.example.com/sub',
      enabled: true,
      tags: [],
      sortIndex: 4,
      configVersion: 2,
    };
    const origProfile = {
      id: 'prof-edit',
      name: 'Orig Profile',
      customId: '',
      linkId: 'p_orig_001',
      shortLink: 'https://s.example.com/orig',
      enabled: true,
      subscriptions: [],
      manualNodes: [],
      subProfiles: [],
      tags: [],
      configVersion: 2,
    };
    store.overwriteSubscriptions([original]);
    store.overwriteProfiles([origProfile]);

    const { addSubscription, updateSubscription } = useSubscriptions();
    const forms = useSubscriptionForms({ addSubscription, updateSubscription });

    forms.openEdit(original);
    expect(forms.showModal.value).toBe(true);
    forms.editingSubscription.value.name = 'Unsaved User Draft';

    // 1. Validation failure keeps modal open & draft intact
    forms.editingSubscription.value.url = 'not-a-valid-url';
    expect(await forms.handleSave()).toBe(false);
    expect(forms.showModal.value).toBe(true);
    expect(forms.editingSubscription.value.name).toBe('Unsaved User Draft');

    // 2. 409 conflict sets inline conflictState instead of destroying user input
    forms.editingSubscription.value.url = 'https://sub.example.com/sub';
    const remoteCurrent = { ...original, name: 'Remote Version 3', configVersion: 3, sortIndex: 0 };
    frontendMocks.apiPatch.mockRejectedValueOnce(
      new APIError('conflict', 409, { code: 'VERSION_CONFLICT', message: 'conflict', current: remoteCurrent }),
    );

    expect(await forms.handleSave()).toBe(false);
    expect(forms.showModal.value).toBe(true);
    expect(forms.editingSubscription.value.name).toBe('Unsaved User Draft');
    expect(forms.conflictState.value).toMatchObject({ localVersion: 2, serverVersion: 3 });
    expect(frontendMocks.apiPatch.mock.calls[0][1]).not.toHaveProperty('sortIndex');
    expect(frontendMocks.apiPatch.mock.calls[0][1].configVersion).toBe(2);
    expect(store.subscriptions[0].name).toBe('Remote Version 3');

    // 3. Reload latest loads server content + configVersion 3 and clears conflict banner
    forms.reloadFromConflict();
    expect(forms.conflictState.value).toBeNull();
    expect(forms.editingSubscription.value.name).toBe('Remote Version 3');
    expect(forms.editingSubscription.value.configVersion).toBe(3);

    // 4. Another conflict followed by forceSaveFromConflict overwrites with force: true and closes modal
    forms.editingSubscription.value.name = 'User Merged Edit';
    const remoteV4 = { ...remoteCurrent, name: 'Remote V4', configVersion: 4 };
    frontendMocks.apiPatch
      .mockRejectedValueOnce(
        new APIError('conflict', 409, { code: 'VERSION_CONFLICT', message: 'conflict', current: remoteV4 }),
      )
      .mockResolvedValueOnce({
        success: true,
        data: { ...remoteV4, name: 'User Merged Edit', configVersion: 5 },
      });

    expect(await forms.handleSave()).toBe(false);
    expect(forms.conflictState.value).toMatchObject({ localVersion: 3, serverVersion: 4 });
    expect(await forms.forceSaveFromConflict()).toBe(true);
    expect(forms.conflictState.value).toBeNull();
    expect(forms.showModal.value).toBe(false);
    expect(frontendMocks.apiPatch.mock.calls[2][1].force).toBe(true);
    expect(store.subscriptions[0]).toMatchObject({ name: 'User Merged Edit', configVersion: 5, sortIndex: 0 });

    // 5. useProfiles omits unchanged shortLink and handles inline 409 + reload + force save
    frontendMocks.apiPatch.mockReset();
    const profTools = useProfiles();
    profTools.handleEditProfile('prof-edit');
    const remoteProfV3 = { ...origProfile, name: 'Server Prof v3', shortLink: 'https://s.example.com/new', configVersion: 3 };
    frontendMocks.apiPatch.mockRejectedValueOnce(
      new APIError('conflict', 409, { code: 'VERSION_CONFLICT', message: 'conflict', current: remoteProfV3 }),
    );
    const localProfPayload = { ...profTools.editingProfile.value, name: 'My Prof Draft' };
    expect(await profTools.handleSaveProfile(localProfPayload)).toBe(false);
    expect(frontendMocks.apiPatch.mock.calls[0][1]).not.toHaveProperty('shortLink');
    expect(frontendMocks.apiPatch.mock.calls[0][1].configVersion).toBe(2);
    expect(profTools.profileConflict.value).toMatchObject({ localVersion: 2, serverVersion: 3 });
    expect(profTools.showProfileModal.value).toBe(true);

    profTools.reloadProfileFromConflict();
    expect(profTools.profileConflict.value).toBeNull();
    expect(profTools.editingProfile.value.name).toBe('Server Prof v3');
    expect(profTools.editingProfile.value.configVersion).toBe(3);

    frontendMocks.apiPatch.mockResolvedValueOnce({
      success: true,
      data: { ...remoteProfV3, name: 'Forced Prof', configVersion: 4 },
    });
    expect(await profTools.handleForceSaveProfile({ ...profTools.editingProfile.value, name: 'Forced Prof' })).toBe(true);
    expect(profTools.showProfileModal.value).toBe(false);
  });
});
