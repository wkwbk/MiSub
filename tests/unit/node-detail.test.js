import { describe, expect, it } from 'vitest';
import { parseNodeDetail } from '../../src/utils/nodeDetail.js';

describe('parseNodeDetail', () => {
  it('parses VLESS Reality link into structured sections, YAML, and JSON', () => {
    const url =
      'vless://11111111-2222-3333-4444-555555555555@example.com:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.cloudflare.com&fp=chrome&pbk=testPublicKey123&sid=abcd1234&type=tcp#US-Reality';

    const detail = parseNodeDetail({ name: 'US-Reality', url });

    expect(detail.parsed).toBe(true);
    expect(detail.protocol).toBe('VLESS');
    expect(detail.server).toBe('example.com');
    expect(detail.port).toBe(443);
    expect(detail.rawUrl).toBe(url);

    const sectionIds = detail.sections.map((s) => s.id);
    expect(sectionIds).toContain('basic');
    expect(sectionIds).toContain('auth');
    expect(sectionIds).toContain('security');

    const authSection = detail.sections.find((s) => s.id === 'auth');
    expect(
      authSection.items.some((i) => i.key === 'uuid' && i.display === '11111111-2222-3333-4444-555555555555'),
    ).toBe(true);
    expect(authSection.items.some((i) => i.key === 'flow' && i.display === 'xtls-rprx-vision')).toBe(true);

    const securitySection = detail.sections.find((s) => s.id === 'security');
    expect(
      securitySection.items.some((i) => i.key === 'reality-opts.public-key' && i.display === 'testPublicKey123'),
    ).toBe(true);
    expect(securitySection.items.some((i) => i.key === 'reality-opts.short-id' && i.display === 'abcd1234')).toBe(true);

    expect(detail.formattedYaml).toContain('type: vless');
    expect(detail.formattedYaml).toContain('public-key: testPublicKey123');
    expect(JSON.parse(detail.formattedJson).server).toBe('example.com');
  });

  it('parses VMess WebSocket TLS link', () => {
    const vmessJson = JSON.stringify({
      v: '2',
      ps: 'HK-WS',
      add: 'hk.example.com',
      port: '443',
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      aid: '0',
      net: 'ws',
      type: 'none',
      host: 'cdn.example.com',
      path: '/ws-path',
      tls: 'tls',
      sni: 'cdn.example.com',
    });
    const url = `vmess://${Buffer.from(vmessJson, 'utf-8').toString('base64')}`;

    const detail = parseNodeDetail({ name: 'HK-WS', url });

    expect(detail.parsed).toBe(true);
    expect(detail.protocol).toBe('VMESS');
    expect(detail.server).toBe('hk.example.com');
    expect(detail.port).toBe(443);

    const transportSection = detail.sections.find((s) => s.id === 'transport');
    expect(transportSection).toBeTruthy();
    expect(transportSection.items.some((i) => i.key === 'network' && i.display === 'ws')).toBe(true);
    expect(transportSection.items.some((i) => i.key === 'ws-opts.path' && i.display === '/ws-path')).toBe(true);
  });

  it('falls back gracefully for unsupported protocols', () => {
    const url = 'naive+https://user:pass@naive.example.com:8443#NaiveNode';
    const detail = parseNodeDetail({ name: 'NaiveNode', url });

    expect(detail.parsed).toBe(false);
    expect(detail.protocol).toBe('NAIVE+HTTPS');
    expect(detail.server).toBe('naive.example.com');
    expect(detail.port).toBe('8443');
    expect(detail.rawUrl).toBe(url);
    expect(detail.sections.length).toBe(1);
  });

  it('handles null or empty node safely', () => {
    const detail = parseNodeDetail(null);
    expect(detail.parsed).toBe(false);
    expect(detail.sections).toEqual([]);
    expect(detail.rawUrl).toBe('');
  });
});
