import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PUBLIC_CORES,
  DEFAULT_PUBLIC_CORES_CONFIG,
  normalizeCoreTags,
  normalizePublicCoresConfig,
  resolvePublicCoreIcon,
} from '@misub/core/domain/default-public-cores.js';

describe('default-public-cores', () => {
  it('includes mainstream proxy cores by default', () => {
    const ids = DEFAULT_PUBLIC_CORES.map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'xray-core',
        'sing-box',
        'mihomo',
        'hysteria-2',
        'v2ray-core',
        'naiveproxy',
        'tuic',
        'shadowtls',
      ]),
    );
    expect(DEFAULT_PUBLIC_CORES_CONFIG.enabled).toBe(true);
  });

  it('normalizes tags from string or array', () => {
    expect(normalizeCoreTags('VLESS, REALITY，QUIC , ')).toEqual(['VLESS', 'REALITY', 'QUIC']);
    expect(normalizeCoreTags([' TUN ', '', 'Hysteria2'])).toEqual(['TUN', 'Hysteria2']);
    expect(normalizeCoreTags(null)).toEqual([]);
  });

  it('falls back to default cores when items is not an array', () => {
    const normalized = normalizePublicCoresConfig({ enabled: false });
    expect(normalized.enabled).toBe(false);
    expect(normalized.items.length).toBe(DEFAULT_PUBLIC_CORES.length);
  });

  it('sanitizes custom core items and preserves tags', () => {
    const normalized = normalizePublicCoresConfig({
      enabled: true,
      items: [
        {
          name: ' Custom Core ',
          category: 'transport',
          tags: 'QUIC, 0-RTT',
          url: 'https://github.com/example/core',
        },
        { name: '   ' },
      ],
    });

    expect(normalized.items).toHaveLength(1);
    expect(normalized.items[0]).toMatchObject({
      id: 'core-1',
      name: 'Custom Core',
      category: 'transport',
      tags: ['QUIC', '0-RTT'],
      url: 'https://github.com/example/core',
      enabled: true,
    });
  });

  it('resolves explicit icon or falls back to domain favicon', () => {
    expect(resolvePublicCoreIcon({ icon: '/icons/cores/xray-core.png' })).toBe('/icons/cores/xray-core.png');
    expect(resolvePublicCoreIcon({ icon: '', url: 'https://github.com/XTLS/Xray-core' })).toBe(
      'https://www.google.com/s2/favicons?domain=github.com&sz=128',
    );
  });
});
