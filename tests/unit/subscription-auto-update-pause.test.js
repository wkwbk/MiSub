import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  filterAutoUpdateSubscriptions,
  isAutoUpdateEnabled,
  isAutoUpdatePaused,
} from '../../shared/auto-update.js';
import { handleBatchUpdateNodesRequest } from '../../functions/modules/handlers/node-handler.js';
import { handleCronTrigger } from '../../functions/modules/notifications.js';
import { generateCombinedNodeList } from '../../functions/services/subscription-service.js';
import { StorageFactory } from '../../functions/storage-adapter.js';
import { STORAGE_KEY_SETTINGS } from '../../functions/modules/config.js';

describe('per-subscription autoUpdate pause (B.5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('treats missing or true autoUpdate as enabled and false as paused', () => {
    expect(isAutoUpdateEnabled({})).toBe(true);
    expect(isAutoUpdateEnabled({ autoUpdate: true })).toBe(true);
    expect(isAutoUpdateEnabled({ autoUpdate: false })).toBe(false);
    expect(isAutoUpdatePaused({ autoUpdate: false })).toBe(true);
    expect(isAutoUpdatePaused({})).toBe(false);

    const filtered = filterAutoUpdateSubscriptions([
      { id: '1', name: 'active' },
      { id: '2', name: 'paused', autoUpdate: false },
      { id: '3', name: 'explicit-on', autoUpdate: true },
    ]);
    expect(filtered.map((s) => s.id)).toEqual(['1', '3']);
  });

  it('skips paused subscriptions in batch_update_nodes without failing when all are paused', async () => {
    const adapter = {
      type: 'd1',
      getAllSubscriptions: vi.fn().mockResolvedValue([
        { id: 'sub-paused', name: 'Paused', url: 'https://a.example/sub', enabled: true, autoUpdate: false },
        { id: 'sub-active', name: 'Active', url: 'https://b.example/sub', enabled: true, autoUpdate: true },
      ]),
      get: vi.fn().mockResolvedValue({}),
    };
    vi.spyOn(StorageFactory, 'createAdapter').mockReturnValue(adapter);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('vless://11111111-1111-1111-1111-111111111111@1.2.3.4:443#NodeA', { status: 200 }),
    );

    const reqAllPaused = new Request('https://panel.example/api/batch_update_nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionIds: ['sub-paused'] }),
    });
    const resPaused = await handleBatchUpdateNodesRequest(reqAllPaused, {});
    expect(resPaused.status).toBe(200);
    const bodyPaused = await resPaused.json();
    expect(bodyPaused.success).toBe(true);
    expect(bodyPaused.summary.skippedSubscriptions).toBe(1);
    expect(bodyPaused.summary.totalSubscriptions).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    const reqMixed = new Request('https://panel.example/api/batch_update_nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionIds: ['sub-paused', 'sub-active'] }),
    });
    const resMixed = await handleBatchUpdateNodesRequest(reqMixed, {});
    expect(resMixed.status).toBe(200);
    const bodyMixed = await resMixed.json();
    expect(bodyMixed.results).toHaveLength(1);
    expect(bodyMixed.results[0].subscriptionId).toBe('sub-active');
    expect(bodyMixed.summary.skippedSubscriptions).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('skips paused subscriptions during handleCronTrigger', async () => {
    const adapter = {
      type: 'd1',
      getRemoteSubscriptions: vi.fn().mockResolvedValue([
        { id: 'sub-1', name: 'Paused', url: 'https://paused.example/sub', enabled: true, autoUpdate: false },
      ]),
      get: vi.fn(async (key) => (key === STORAGE_KEY_SETTINGS ? {} : null)),
      putAllSubscriptions: vi.fn().mockResolvedValue(true),
    };
    vi.spyOn(StorageFactory, 'createAdapter').mockReturnValue(adapter);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const res = await handleCronTrigger({});
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary.total).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still fetches live nodes for paused subscriptions on pull but suppresses DB runtimeInfo overwrite', async () => {
    const updateSpy = vi.fn().mockResolvedValue(true);
    const storage = { updateSubscriptionById: updateSpy };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('vless://11111111-1111-1111-1111-111111111111@1.2.3.4:443#LiveNode', {
        status: 200,
        headers: { 'subscription-userinfo': 'upload=10; download=20; total=100; expire=2000000000' },
      }),
    );

    const context = { storage };
    const output = await generateCombinedNodeList(
      context,
      { enableFlagEmoji: false, enableAccessLog: false },
      'clash-verge/v2.4.3',
      [
        {
          id: 'sub-paused',
          name: 'PausedSub',
          url: 'https://live.example/sub',
          enabled: true,
          autoUpdate: false,
        },
        {
          id: 'sub-normal',
          name: 'NormalSub',
          url: 'https://normal.example/sub',
          enabled: true,
          autoUpdate: true,
        },
      ],
    );

    expect(output).toContain('LiveNode');
    expect(context.currentSubscriptionRuntimeInfo['sub-paused'].nodeCount).toBe(1);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][0]).toBe('sub-normal');
  });
});
