import { describe, expect, it, vi } from 'vitest';
import {
  countryCodeToFlagEmoji,
  detectCdnByAsnOrOrg,
  detectCdnByCidr,
  detectCdnByProtocolFeature,
  extractProtocolTransportInfo,
  inspectNodes,
  isIpAddress,
  isPrivateOrReservedIp,
} from '../../functions/services/node-inspect-service.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

describe('node-inspect-service utilities', () => {
  it('identifies IPv4, IPv6, and private/reserved ranges accurately', () => {
    expect(isIpAddress('1.1.1.1')).toBe(true);
    expect(isIpAddress('2606:4700:4700::1111')).toBe(true);
    expect(isIpAddress('example.com')).toBe(false);

    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('104.16.1.1')).toBe(false);
  });

  it('detects CDN by CIDR and ASN/Org', () => {
    expect(detectCdnByCidr('104.18.12.34')).toBe('Cloudflare');
    expect(detectCdnByCidr('172.67.10.20')).toBe('Cloudflare');
    expect(detectCdnByCidr('151.101.1.69')).toBe('Fastly');
    expect(detectCdnByCidr('2606:4700::1111')).toBe('Cloudflare');
    expect(detectCdnByCidr('8.8.8.8')).toBe('');

    expect(detectCdnByAsnOrOrg('AS13335 Cloudflare, Inc.')).toBe('Cloudflare');
    expect(detectCdnByAsnOrOrg('AS54113 Fastly, Inc.')).toBe('Fastly');
    expect(detectCdnByAsnOrOrg('AS16509 Amazon.com', 'Amazon CloudFront', 'AWS')).toBe('CloudFront');
    expect(detectCdnByAsnOrOrg('AS4134 Chinanet', 'China Telecom', 'Chinanet')).toBe('');
  });

  it('detects CDN by protocol transport feature (ws/grpc host !== server)', () => {
    const cfWsNode = extractProtocolTransportInfo(
      'vless://11111111-1111-1111-1111-111111111111@104.16.0.1:443?type=ws&security=tls&host=cdn.myorigin.com&sni=cdn.myorigin.com#CF-Node',
    );
    expect(cfWsNode.network).toBe('ws');
    expect(cfWsNode.wsHost).toBe('cdn.myorigin.com');
    expect(detectCdnByProtocolFeature(cfWsNode)).toBe(true);

    const directNode = extractProtocolTransportInfo(
      'vless://11111111-1111-1111-1111-111111111111@us.myorigin.com:443?type=ws&security=tls&host=us.myorigin.com#Direct-WS',
    );
    expect(detectCdnByProtocolFeature(directNode)).toBe(false);

    const hy2Node = extractProtocolTransportInfo('hysteria2://pass@1.2.3.4:443?sni=hy2.example.com#Hy2');
    expect(hy2Node.isUdpOnly).toBe(true);
    expect(detectCdnByProtocolFeature(hy2Node)).toBe(false);
  });

  it('maps country codes to flag emoji consistent with project conventions', () => {
    expect(countryCodeToFlagEmoji('US')).toBe('🇺🇸');
    expect(countryCodeToFlagEmoji('HK')).toBe('🇭🇰');
    expect(countryCodeToFlagEmoji('JP')).toBe('🇯🇵');
    expect(countryCodeToFlagEmoji('TW')).toBe('🇨🇳');
    expect(countryCodeToFlagEmoji('invalid')).toBe('');
  });
});

describe('inspectNodes end-to-end with DoH, ip-api batch, and D1 cache', () => {
  it('resolves domains via DoH, queries ip-api batch, tags direct/cdn/relay, and caches in D1', async () => {
    const db = createMemoryD1();
    const fetchMock = vi.fn(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.startsWith('https://cloudflare-dns.com/dns-query')) {
        if (urlStr.includes('name=jp.example.com')) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: '45.76.10.20' }] }), { status: 200 });
        }
        if (urlStr.includes('name=cf.example.com')) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: '104.16.88.1' }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
      }
      if (urlStr.startsWith('http://ip-api.com/batch')) {
        const ips = JSON.parse(init.body);
        const geoResponses = ips.map((ip) => {
          if (ip === '45.76.10.20') {
            return {
              status: 'success',
              query: ip,
              countryCode: 'JP',
              country: 'Japan',
              as: 'AS20473 The Constant Company, LLC',
              org: 'Vultr Holdings',
              isp: 'Vultr',
            };
          }
          if (ip === '104.16.88.1') {
            return {
              status: 'success',
              query: ip,
              countryCode: 'US',
              country: 'United States',
              as: 'AS13335 Cloudflare, Inc.',
              org: 'Cloudflare, Inc.',
              isp: 'Cloudflare',
            };
          }
          if (ip === '114.114.114.114') {
            return {
              status: 'success',
              query: ip,
              countryCode: 'CN',
              country: 'China',
              as: 'AS4134 Chinanet',
              org: 'China Telecom',
              isp: 'Chinanet',
            };
          }
          return { status: 'fail', query: ip };
        });
        return new Response(JSON.stringify(geoResponses), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${urlStr}`);
    });

    const nodes = [
      { id: 'n-direct', url: 'vless://11111111-1111-1111-1111-111111111111@jp.example.com:443#JP-Direct' },
      {
        id: 'n-cdn',
        url: 'vless://11111111-1111-1111-1111-111111111111@cf.example.com:443?type=ws&security=tls&host=origin.test.com#CF-Node',
      },
      { id: 'n-relay', url: 'trojan://secret@114.114.114.114:443#CN-Relay' },
    ];

    const first = await inspectNodes(nodes, { MISUB_DB: db }, { fetchFn: fetchMock });

    expect(first['n-direct']).toMatchObject({
      ip: '45.76.10.20',
      isDomain: true,
      countryCode: 'JP',
      flag: '🇯🇵',
      networkType: 'direct',
      isRelay: false,
    });

    expect(first['n-cdn']).toMatchObject({
      ip: '104.16.88.1',
      isDomain: true,
      networkType: 'cdn',
      cdnProvider: 'Cloudflare',
    });

    expect(first['n-relay']).toMatchObject({
      ip: '114.114.114.114',
      isDomain: false,
      countryCode: 'CN',
      networkType: 'relay',
      isRelay: true,
    });

    // Second call should hit D1 cache without calling fetch again
    fetchMock.mockClear();
    const second = await inspectNodes(nodes, { MISUB_DB: db }, { fetchFn: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(second['n-direct'].ip).toBe('45.76.10.20');
    expect(second['n-cdn'].networkType).toBe('cdn');
    expect(second['n-relay'].isRelay).toBe(true);
  });
});
