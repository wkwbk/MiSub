import { describe, expect, test } from 'vitest';
import {
  clashProxyToNodeIR,
  createExternalSuccessEnvelopeSchema,
  ExternalApiErrorEnvelopeSchema,
  ExternalManualNodeValidateSchema,
  ExternalProfileCreateSchema,
  ExternalSubscriptionCreateSchema,
  LoginRequestSchema,
  ManualNodeSchema,
  MisubItemSchema,
  MisubsSaveRequestSchema,
  NODE_IR_PROTOCOLS,
  nodeIRsToUrls,
  nodeIRToClashProxy,
  nodeIRToUrl,
  OperatorRuleSchema,
  PaginationQuerySchema,
  parseNodeIR,
  ParseSubscriptionRequestSchema,
  ParseSubscriptionResponseSchema,
  parseTextToNodeIRs,
  parseUrlsToNodeIRs,
  parseUrlToNodeIR,
  ProfileSchema,
  SubscriptionSchema,
  TypedOperatorRuleSchema,
  validateNodeIR,
} from '@misub/core';

describe('Zod NodeIRSchema & Core Validation', () => {
  test('accepts valid NodeIR objects and rejects invalid fields', () => {
    const valid = validateNodeIR({
      name: 'HK-VLESS',
      protocol: 'vless',
      server: 'hk.example.com',
      port: 443,
      auth: { uuid: '11111111-1111-1111-1111-111111111111', encryption: 'none' },
      transport: { type: 'ws', path: '/ws', host: 'cdn.example.com' },
      tls: {
        enabled: true,
        security: 'reality',
        sni: 'www.apple.com',
        reality: { publicKey: 'pubkey123', shortId: '01ab', supportX25519mlkem768: true },
      },
    });
    expect(valid.success).toBe(true);
    expect(parseNodeIR(valid.data).protocol).toBe('vless');

    expect(validateNodeIR({ name: 'BadPortLow', protocol: 'ss', server: '1.2.3.4', port: 0 }).success).toBe(false);
    expect(validateNodeIR({ name: 'BadPortHigh', protocol: 'ss', server: '1.2.3.4', port: 65536 }).success).toBe(false);
    expect(validateNodeIR({ name: 'EmptyServer', protocol: 'ss', server: '', port: 443 }).success).toBe(false);
    expect(
      validateNodeIR({ name: 'Unsupported', protocol: 'unknownproto', server: '1.2.3.4', port: 443 }).success,
    ).toBe(false);
    expect(NODE_IR_PROTOCOLS.length).toBe(18);
  });
});

describe('Bidirectional URI <-> NodeIR <-> ClashProxy Round-Trip', () => {
  test('preserves VLESS Reality + X25519MLKEM768 + dialerProxy + XHTTP extra', () => {
    const vlessRealityUrl =
      'vless://11111111-1111-1111-1111-111111111111@vless.example.com:443?encryption=none&security=reality&sni=itunes.apple.com&fp=chrome&pbk=pubKeyVal&sid=1234&spx=%2F&flow=xtls-rprx-vision&support-x25519mlkem768=true&dp=RelayProxy#US-Reality';

    const ir = parseUrlToNodeIR(vlessRealityUrl, { extractMetadata: true });
    expect(ir).not.toBeNull();
    expect(ir.protocol).toBe('vless');
    expect(ir.name).toBe('US-Reality');
    expect(ir.dialerProxy).toBe('RelayProxy');
    expect(ir.auth?.flow).toBe('xtls-rprx-vision');
    expect(ir.tls?.security).toBe('reality');
    expect(ir.tls?.reality?.publicKey).toBe('pubKeyVal');
    expect(ir.tls?.reality?.shortId).toBe('1234');
    expect(ir.tls?.reality?.supportX25519mlkem768).toBe(true);

    const clash = nodeIRToClashProxy(ir);
    expect(clash['reality-opts']['support-x25519mlkem768']).toBe(true);
    expect(clash['dialer-proxy']).toBe('RelayProxy');

    const roundTrippedUrl = nodeIRToUrl(ir);
    expect(roundTrippedUrl).toContain('security=reality');
    expect(roundTrippedUrl).toContain('pbk=pubKeyVal');
    expect(roundTrippedUrl).toContain('sid=1234');
    expect(roundTrippedUrl).toContain('support-x25519mlkem768=true');
    expect(roundTrippedUrl).toContain('dp=RelayProxy');

    const extra = encodeURIComponent(JSON.stringify({ xPaddingBytes: '100-200', scMaxEachPostBytes: 1000000 }));
    const xhttpUrl = `vless://22222222-2222-2222-2222-222222222222@xhttp.example.com:443?encryption=none&type=xhttp&path=%2Fxhttp&host=cdn.example.com&mode=packet-up&security=tls&sni=cdn.example.com&extra=${extra}#XHTTP-Node`;
    const xhttpIr = parseUrlToNodeIR(xhttpUrl);
    expect(xhttpIr.transport?.type).toBe('xhttp');
    expect(xhttpIr.transport?.mode).toBe('packet-up');
    expect(xhttpIr.transport?.xhttpOpts?.['x-padding-bytes']).toBe('100-200');
    const xhttpBack = nodeIRToUrl(xhttpIr);
    expect(xhttpBack).toContain('type=xhttp');
    expect(xhttpBack).toContain('extra=');
    expect(decodeURIComponent(xhttpBack)).toContain('xPaddingBytes');
  });

  test('round-trips VMess, Trojan, SS (SIP002 + plugin), SSR, Hysteria2, Hysteria, TUIC, AnyTLS, Snell, WireGuard, SOCKS5, HTTP(S), Naive, and Mierus', () => {
    const vmessPayload = Buffer.from(
      JSON.stringify({
        v: '2',
        ps: 'VMess-WS',
        add: 'vmess.example.com',
        port: '443',
        id: '33333333-3333-3333-3333-333333333333',
        aid: '0',
        scy: 'auto',
        net: 'ws',
        path: '/vmess',
        host: 'ws.example.com',
        tls: 'tls',
        sni: 'ws.example.com',
        fp: 'firefox',
      }),
    ).toString('base64');

    const ssUserInfo = Buffer.from('aes-256-gcm:ss-pass').toString('base64');
    const ssrBody = Buffer.from(
      `ssr.example.com:8388:auth_aes128_md5:aes-256-cfb:tls1.2_ticket_auth:${Buffer.from('ssr-pass').toString('base64url')}/?remarks=${Buffer.from('SSR-Node').toString('base64url')}&obfsparam=${Buffer.from('obfs.example.com').toString('base64url')}`,
    ).toString('base64url');

    const samples = [
      { url: `vmess://${vmessPayload}`, protocol: 'vmess' },
      {
        url: 'trojan://trojan-pwd@trojan.example.com:443?type=grpc&serviceName=tr-grpc&sni=trojan.example.com#Trojan-gRPC',
        protocol: 'trojan',
      },
      {
        url: `ss://${ssUserInfo}@ss.example.com:8388?plugin=${encodeURIComponent('obfs-local;obfs=tls;obfs-host=bing.com')}#SS-Plugin`,
        protocol: 'ss',
      },
      { url: `ssr://${ssrBody}`, protocol: 'ssr' },
      {
        url: 'hysteria2://hy2-pwd@hy2.example.com:443?obfs=salamander&obfs-password=obfs-pwd&sni=hy2.example.com&pinSHA256=AA:BB:CC&up=50%20Mbps&down=200%20Mbps&realm-id=r1&realm-token=rtok#Hy2-Realm',
        protocol: 'hysteria2',
      },
      {
        url: 'hysteria://hy1-auth@hy1.example.com:443?protocol=udp&sni=hy1.example.com&up=20%20Mbps&down=100%20Mbps&insecure=1#Hy1',
        protocol: 'hysteria',
      },
      {
        url: 'tuic://44444444-4444-4444-4444-444444444444:tuic-pass@tuic.example.com:443?sni=tuic.example.com&alpn=h3&congestion_control=bbr&zero_rtt_handshake=1#TUIC-V5',
        protocol: 'tuic',
      },
      {
        url: 'anytls://any-pass@anytls.example.com:443?sni=anytls.example.com&pinnedPeerCertSha256=deadbeef#AnyTLS-Node',
        protocol: 'anytls',
      },
      {
        url: 'snell://snell-psk@snell.example.com:6160?version=4&reuse=true&tfo=true&obfs=http&obfs-host=bing.com#Snell-V4',
        protocol: 'snell',
      },
      {
        url: 'wireguard://privKey123=@wg.example.com:51820?publickey=pubKey456=&address=10.0.0.2/32,fd00::2/128&reserved=1,2,3&mtu=1420#WG-Node',
        protocol: 'wireguard',
      },
      { url: 'socks5://user1:pass1@socks.example.com:1080#Socks5-Node', protocol: 'socks5' },
      { url: 'https://huser:hpass@http.example.com:8443?sni=http.example.com#HTTPS-Node', protocol: 'https' },
      { url: 'http://huser:hpass@http.example.com:8080#HTTP-Node', protocol: 'http' },
      { url: 'naive+https://nuser:npass@naive.example.com:443?padding=true#Naive-HTTPS', protocol: 'naive+https' },
      { url: 'naive+quic://nuser:npass@naive.example.com:443#Naive-QUIC', protocol: 'naive+quic' },
      { url: 'naive+http://nuser:npass@naive.example.com:8080#Naive-HTTP', protocol: 'naive+http' },
      {
        url: 'mierus://m.example.com:9000?username=muser&password=mpass&transport=TCP&mtu=1400#Mieru-Node',
        protocol: 'mierus',
      },
    ];

    for (const { url, protocol } of samples) {
      const ir = parseUrlToNodeIR(url);
      expect(ir, `parseUrlToNodeIR failed for ${protocol}`).not.toBeNull();
      expect(ir.protocol).toBe(protocol);

      const clash = nodeIRToClashProxy(ir);
      expect(clash, `nodeIRToClashProxy failed for ${protocol}`).not.toBeNull();

      const reParsed = clashProxyToNodeIR(clash);
      expect(reParsed, `clashProxyToNodeIR failed for ${protocol}`).not.toBeNull();
      expect(reParsed.protocol).toBe(protocol);
      expect(reParsed.server).toBe(ir.server);
      expect(reParsed.port).toBe(ir.port);

      const serialized = nodeIRToUrl(reParsed);
      expect(serialized, `nodeIRToUrl failed for ${protocol}`).toBeTruthy();
      expect(serialized.toLowerCase().startsWith(`${protocol}://`)).toBe(true);
    }

    const batch = parseUrlsToNodeIRs([samples[1].url, samples[6].url], { addFlagEmoji: false, enableTfo: true });
    expect(batch).toHaveLength(2);
    expect(batch[0].tfo).toBe(true);
    expect(nodeIRsToUrls(batch)).toHaveLength(2);
  });

  test('parseTextToNodeIRs ingests Clash YAML, Sing-box JSON, Surge, and Quantumult X text', () => {
    const clashYaml = `
proxies:
  - name: JP-Trojan
    type: trojan
    server: jp.example.com
    port: 443
    password: secret
    sni: jp.example.com
`;
    const clashIrs = parseTextToNodeIRs(clashYaml, { addFlagEmoji: false });
    expect(clashIrs).toHaveLength(1);
    expect(clashIrs[0].protocol).toBe('trojan');
    expect(clashIrs[0].name).toBe('JP-Trojan');

    const singboxJson = JSON.stringify({
      outbounds: [
        { type: 'selector', tag: 'Proxy', outbounds: ['SG-Hy2'] },
        {
          type: 'hysteria2',
          tag: 'SG-Hy2',
          server: 'sg.example.com',
          server_port: 443,
          password: 'hy2password',
          tls: { enabled: true, server_name: 'sg.example.com' },
        },
      ],
    });
    const singboxIrs = parseTextToNodeIRs(singboxJson, { addFlagEmoji: false });
    expect(singboxIrs).toHaveLength(1);
    expect(singboxIrs[0].protocol).toBe('hysteria2');
    expect(singboxIrs[0].name).toBe('SG-Hy2');

    const surgeLine = 'Surge-Snell = snell, snell.example.com, 6160, psk=my-psk, version=4';
    const surgeIrs = parseTextToNodeIRs(surgeLine, { addFlagEmoji: false });
    expect(surgeIrs).toHaveLength(1);
    expect(surgeIrs[0].protocol).toBe('snell');

    const qxLine =
      'vless=qx.example.com:443, method=none, password=55555555-5555-5555-5555-555555555555, obfs=over-tls, obfs-host=qx.example.com, tag=QX-VLESS';
    const qxIrs = parseTextToNodeIRs(qxLine, { addFlagEmoji: false });
    expect(qxIrs).toHaveLength(1);
    expect(qxIrs[0].protocol).toBe('vless');
  });
});

describe('Domain Entity, Operator & API Contracts', () => {
  test('distinguishes remote subscriptions vs manual nodes and preserves extra fields', () => {
    const sub = SubscriptionSchema.parse({
      id: 'sub-1',
      name: 'Main Airport',
      url: 'https://sub.example.com/api/v1/client/subscribe?token=abc',
      customExtra: 'keep-me',
    });
    expect(sub.enabled).toBe(true);
    expect(sub.customExtra).toBe('keep-me');

    const vlessNode = ManualNodeSchema.parse({
      id: 'node-1',
      name: 'Direct VLESS',
      url: 'vless://11111111-1111-1111-1111-111111111111@1.2.3.4:443#Direct',
      colorTag: 'blue',
    });
    expect(vlessNode.colorTag).toBe('blue');

    const authHttpNode = MisubItemSchema.parse({
      id: 'node-2',
      name: 'HTTPS Proxy Node',
      url: 'https://user:pass@proxy.example.com:443#HTTPS-Proxy',
    });
    expect(authHttpNode.id).toBe('node-2');

    expect(
      SubscriptionSchema.safeParse({
        id: 'bad-sub',
        url: 'https://user:pass@proxy.example.com:443',
      }).success,
    ).toBe(false);

    expect(
      ManualNodeSchema.safeParse({
        id: 'bad-node',
        url: 'https://sub.example.com/subscribe?token=abc',
      }).success,
    ).toBe(false);
  });

  test('validates ProfileSchema and TypedOperatorRuleSchema variants', () => {
    const profile = ProfileSchema.parse({
      id: 'prof-1',
      name: 'Daily Clash',
      subscriptions: ['sub-1', { id: 'sub-2', exclude: '官网|到期' }],
      manualNodes: ['node-1'],
      operators: [
        { type: 'filter', params: { protocols: { enabled: true, values: ['vless', 'trojan'] } } },
        { type: 'rename', params: { template: { enabled: true, template: '{emoji} {regionZh} {index}' } } },
        { type: 'sort', params: { keys: [{ key: 'regionZh', order: 'asc' }] } },
        { type: 'dedup', params: { mode: 'serverPort', prefer: { protocolOrder: ['vless', 'trojan'] } } },
        { type: 'script', params: { dsl: [{ action: 'filter', field: 'protocol', op: 'eq', value: 'vless' }] } },
      ],
    });
    expect(profile.subscriptions).toHaveLength(2);
    expect(profile.operators).toHaveLength(5);

    for (const op of profile.operators) {
      expect(OperatorRuleSchema.safeParse(op).success).toBe(true);
      expect(TypedOperatorRuleSchema.safeParse(op).success).toBe(true);
    }
  });

  test('validates Admin & External API schemas including coercion and envelopes', () => {
    expect(LoginRequestSchema.safeParse({ password: 'admin-password' }).success).toBe(true);
    expect(LoginRequestSchema.safeParse({ password: '' }).success).toBe(false);

    expect(
      MisubsSaveRequestSchema.safeParse({
        misubs: [{ id: 's1', url: 'https://example.com/sub' }],
        profiles: [{ id: 'p1', name: 'P1' }],
        baseRevision: '0123456789abcdef',
      }).success,
    ).toBe(true);

    expect(ParseSubscriptionRequestSchema.safeParse({ content: 'ss://abc@1.2.3.4:8388#test' }).success).toBe(true);
    expect(
      ParseSubscriptionResponseSchema.safeParse({
        success: true,
        data: { nodes: [{ name: 'test', url: 'ss://abc@1.2.3.4:8388#test', protocol: 'ss' }], totalCount: 1 },
      }).success,
    ).toBe(true);

    const pageQuery = PaginationQuerySchema.parse({ page: '2', pageSize: '50' });
    expect(pageQuery).toEqual({ page: 2, pageSize: 50 });

    expect(
      ExternalSubscriptionCreateSchema.safeParse({
        name: 'Ext Sub',
        url: 'https://sub.example.com/sub',
        tags: ['HK'],
      }).success,
    ).toBe(true);

    expect(
      ExternalManualNodeValidateSchema.safeParse({
        url: 'trojan://secret@1.2.3.4:443#HK',
      }).success,
    ).toBe(true);

    expect(
      ExternalProfileCreateSchema.safeParse({
        name: 'Ext Profile',
        subscriptionIds: ['sub-1'],
        target: 'clash',
      }).success,
    ).toBe(true);

    const envelopeSchema = createExternalSuccessEnvelopeSchema(PaginationQuerySchema);
    expect(envelopeSchema.safeParse({ success: true, data: { page: 1, pageSize: 20 } }).success).toBe(true);
    expect(
      ExternalApiErrorEnvelopeSchema.safeParse({
        success: false,
        error: { code: 'not_found', message: 'Resource not found' },
      }).success,
    ).toBe(true);
  });
});
