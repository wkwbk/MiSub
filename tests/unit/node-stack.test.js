import { describe, expect, it } from 'vitest';
import { groupNodesByIp, isNodeStackable } from '@/utils/node-stack.js';

describe('node-stack grouping', () => {
  const nodes = [
    { id: 'n1', name: 'JP-VLESS' },
    { id: 'n2', name: 'CF-1' },
    { id: 'n3', name: 'JP-HY2' },
    { id: 'n4', name: 'CF-2' },
    { id: 'n5', name: 'US-Single' },
    { id: 'n6', name: 'Unresolved' },
  ];

  const inspectMap = {
    n1: { ip: '45.76.10.20', networkType: 'direct', stackable: true, countryCode: 'JP', flag: '🇯🇵' },
    n2: { ip: '104.16.1.1', networkType: 'cdn', stackable: false, countryCode: 'US', flag: '🇺🇸' },
    n3: { ip: '45.76.10.20', networkType: 'direct', stackable: true, countryCode: 'JP', flag: '🇯🇵' },
    n4: { ip: '104.16.1.1', networkType: 'cdn', stackable: false, countryCode: 'US', flag: '🇺🇸' },
    n5: { ip: '198.51.100.7', networkType: 'direct', stackable: true, countryCode: 'US', flag: '🇺🇸' },
  };

  it('stacks non-CDN nodes sharing the same IP while excluding CDN IPs', () => {
    expect(isNodeStackable(inspectMap.n1)).toBe(true);
    expect(isNodeStackable(inspectMap.n2)).toBe(false);

    const grouped = groupNodesByIp(nodes, inspectMap, true);
    expect(grouped).toHaveLength(5);

    // n1 and n3 share non-CDN IP 45.76.10.20 -> stacked at position 0
    expect(grouped[0]).toMatchObject({
      type: 'stack',
      ip: '45.76.10.20',
    });
    expect(grouped[0].nodes.map((n) => n.id)).toEqual(['n1', 'n3']);

    // n2 and n4 share CDN IP 104.16.1.1 -> MUST NOT stack
    expect(grouped[1]).toMatchObject({ type: 'single', key: 'n2' });
    expect(grouped[2]).toMatchObject({ type: 'single', key: 'n4' });

    // n5 is unique IP -> single; n6 unresolved -> single
    expect(grouped[3]).toMatchObject({ type: 'single', key: 'n5' });
    expect(grouped[4]).toMatchObject({ type: 'single', key: 'n6' });
  });

  it('returns flat single items when stacking is disabled', () => {
    const flat = groupNodesByIp(nodes, inspectMap, false);
    expect(flat).toHaveLength(nodes.length);
    expect(flat.every((item) => item.type === 'single')).toBe(true);
  });
});
