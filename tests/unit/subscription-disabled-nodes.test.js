import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDisabledNodeSet, normalizeDisabledNodes } from '../../shared/disabled-nodes.js';
import { buildSubscriptionFilterFingerprint } from '../../functions/services/subscription/runtime-cache.js';
import { generateCombinedNodeList } from '../../functions/services/subscription-service.js';
import { handleSingleSubscriptionMode } from '../../functions/modules/subscription/single-subscription.js';
import { StorageFactory } from '../../functions/storage-adapter.js';
import { isUdpOnlyProtocol } from '../../src/utils/tcping.js';

describe('subscription preview disabledNodes & latency exclusions (B.7)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes disabledNodes and updates filter cache fingerprint', () => {
    const a = 'vless://11111111-1111-1111-1111-111111111111@1.1.1.1:443#A';
    const b = 'trojan://pass@2.2.2.2:443#B';
    expect(normalizeDisabledNodes([` ${a} `, a, '', b])).toEqual([a, b]);
    expect(normalizeDisabledNodes(JSON.stringify([b]))).toEqual([b]);

    const set = getDisabledNodeSet({ disabledNodes: [a] });
    expect(set.has(a)).toBe(true);
    expect(set.has(b)).toBe(false);

    const fpBefore = buildSubscriptionFilterFingerprint({ exclude: '', disabledNodes: [] });
    const fpAfter = buildSubscriptionFilterFingerprint({ exclude: '', disabledNodes: [a] });
    expect(fpBefore).not.toBe(fpAfter);
  });

  it('filters disabledNodes in generateCombinedNodeList without triggering false truncation drop protection', async () => {
    const activeUrl = 'vless://11111111-1111-1111-1111-111111111111@1.1.1.1:443#KeepMe';
    const disabledUrls = Array.from(
      { length: 12 },
      (_, idx) => `vless://11111111-1111-1111-1111-1111111111${String(idx).padStart(2, '0')}@2.2.2.${idx}:443#Drop_${idx}`,
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response([activeUrl, ...disabledUrls].join('\n'), { status: 200 }),
    );

    const output = await generateCombinedNodeList(
      { storage: { updateSubscriptionById: vi.fn().mockResolvedValue(true) } },
      { enableFlagEmoji: false, enableAccessLog: false },
      'clash-verge/v2.4.3',
      [
        {
          id: 'sub-1',
          name: 'MySub',
          url: 'https://airport.example/sub',
          enabled: true,
          nodeCount: 13,
          lastGoodNodeCount: 13,
          disabledNodes: disabledUrls,
        },
      ],
    );

    expect(output).toContain('KeepMe');
    expect(output).not.toContain('Drop_0');
    expect(output).not.toContain('Drop_11');
  });

  it('annotates node.enabled in single subscription preview instead of hiding disabled nodes', async () => {
    const nodeA = 'vless://11111111-1111-1111-1111-111111111111@1.1.1.1:443#NodeA';
    const nodeB = 'trojan://secret@2.2.2.2:443#NodeB';

    const adapter = {
      type: 'd1',
      getSubscriptionById: vi.fn().mockResolvedValue({
        id: 'sub-1',
        name: 'Airport',
        url: 'https://airport.example/sub',
        enabled: true,
        disabledNodes: [nodeB],
      }),
    };
    vi.spyOn(StorageFactory, 'createAdapter').mockReturnValue(adapter);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(`${nodeA}\n${nodeB}`, { status: 200 }));

    const result = await handleSingleSubscriptionMode(
      new Request('https://panel.example/api/subscription_nodes'),
      {},
      'sub-1',
      'v2rayN/7.23',
    );

    expect(result.totalCount).toBe(2);
    expect(result.disabledCount).toBe(1);
    expect(result.nodes.find((n) => n.url === nodeA)?.enabled).toBe(true);
    expect(result.nodes.find((n) => n.url === nodeB)?.enabled).toBe(false);
  });

  it('identifies UDP/QUIC protocols so auto-disable skips unsupported nodes', () => {
    expect(isUdpOnlyProtocol('hysteria2://pass@1.1.1.1:443#HY2')).toBe(true);
    expect(isUdpOnlyProtocol('tuic://uuid:pass@1.1.1.1:443#TUIC')).toBe(true);
    expect(isUdpOnlyProtocol('vless://uuid@1.1.1.1:443#VLESS')).toBe(false);
  });
});
