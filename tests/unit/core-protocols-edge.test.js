import { describe, expect, it } from 'vitest';
import {
  convertClashProxyToUrl,
  extractSingboxNodes,
  fixSS2022Node,
  nodeIRToClashProxy,
  nodeIRToUrl,
  parseQuantumultXConfig,
  parseQuantumultXLine,
  parseSurgeConfig,
  parseSurgeLine,
  parseUrlToNodeIR,
  parseV2rayNLink,
  singboxOutboundToUrl,
  urlToClashProxy,
  validateSS2022Node,
} from '@misub/core';

function toBase64Url(input) {
  return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('@misub/core multi-protocol parser & converter boundaries', () => {
  it('parses Quantumult X standard & legacy formats while rejecting malformed/comment lines', () => {
    const qxConfig = `
      # Comment line
      ; Semicolon comment
      // Slash comment
      [server_local]
      vmess=hk.example.com:443, method=chacha20-poly1305, password=11111111-1111-1111-1111-111111111111, obfs=wss, obfs-host=cdn.example.com, obfs-uri=/ws, tag=HK-VMess
      shadowsocks=ss.example.com:8388, method=aes-256-gcm, password=secret, tag=SS-Node
      trojan=tr.example.com:443, password=trpass, sni=tr.example.com, tag=Trojan-Node
      hysteria2=hy2.example.com:8443, password=hy2pass, sni=hy2.example.com, tag=HY2-Node
      tuic=tuic.example.com:443, uuid=22222222-2222-2222-2222-222222222222, password=tuicpass, tag=TUIC-Node
      anytls=any.example.com:443, password=anypass, sni=any.example.com, tag=AnyTLS-Node
      socks5=1.2.3.4:1080, username=u, password=p, tag=SOCKS-Node
      http=proxy.example.com:8080, username=u, password=p, over-tls=true, tag=HTTPS-Node
      vmess = LegacyVMess, legacy.example.com, 443, aes-128-gcm, 33333333-3333-3333-3333-333333333333, 0, over-tls=true, obfs=ws
      # Missing tag rejected when allowUntitled=false
      ss=no-tag.example.com:8388, method=aes-128-gcm, password=pass
      bad-line-without-equals
    `;

    const nodes = parseQuantumultXConfig(qxConfig, { allowUntitled: false });
    expect(nodes.map((n) => n.name)).toEqual([
      'HK-VMess',
      'SS-Node',
      'Trojan-Node',
      'HY2-Node',
      'TUIC-Node',
      'AnyTLS-Node',
      'SOCKS-Node',
      'HTTPS-Node',
      'LegacyVMess',
    ]);

    const untitled = parseQuantumultXLine('ss=no-tag.example.com:8388, method=aes-128-gcm, password=pass', {
      allowUntitled: true,
    });
    expect(untitled?.name).toBe('Untitled');
    expect(untitled?.protocol).toBe('ss');

    // Malformed percent encoding does not throw
    expect(parseQuantumultXLine('trojan=bad.example.com:443, password=p, tag=%E0%A4%A')?.name).toBe('%E0%A4%A');
    expect(parseQuantumultXLine(null)).toBeNull();
    expect(parseQuantumultXConfig('')).toEqual([]);
  });

  it('parses Surge node variants and ignores section headers/comments', () => {
    const surgeConfig = `
      [Proxy]
      // ignored
      # ignored
      HK-VMess = vmess, hk.example.com, 443, username=11111111-1111-1111-1111-111111111111, ws=true, ws-path=/vmess, ws-headers=Host:hk.example.com, tls=true, sni=hk.example.com
      US-SS-KV = ss, us.example.com, 8388, encrypt-method=aes-256-gcm, password=sspass
      JP-SS-Pos = ss, jp.example.com, 8388, aes-128-gcm, jppass
      SG-Trojan = trojan, sg.example.com, 443, password=trpass, sni=sg.example.com
      TW-HY2 = hysteria2, tw.example.com, 443, password=hypass, sni=tw.example.com
      DE-Snell = snell, de.example.com, 443, psk=snellpsk, version=4
      UK-AnyTLS = anytls, uk.example.com, 443, password=anypass, sni=uk.example.com, skip-cert-verify=true
      FR-HTTP = https-proxy, fr.example.com, 443, user, pass
      Incomplete = vmess, missing-uuid.example.com, 443
    `;

    const nodes = parseSurgeConfig(surgeConfig);
    expect(nodes.map((n) => n.name)).toEqual([
      'HK-VMess',
      'US-SS-KV',
      'JP-SS-Pos',
      'SG-Trojan',
      'TW-HY2',
      'DE-Snell',
      'UK-AnyTLS',
      'FR-HTTP',
    ]);
    expect(nodes.find((n) => n.name === 'UK-AnyTLS')?.url).toContain('insecure=1');
    expect(nodes.find((n) => n.name === 'DE-Snell')?.url).toContain('snell://');
    expect(parseSurgeLine('invalid line')).toBeNull();
    expect(parseSurgeConfig(null)).toEqual([]);
  });

  it('converts sing-box outbounds with IPv6 hosts, Reality, TUIC, and skips non-proxy outbounds', () => {
    const config = {
      outbounds: [
        { type: 'selector', tag: 'Proxy', outbounds: ['VLESS-IPv6'] },
        { type: 'direct', tag: 'DIRECT' },
        { type: 'block', tag: 'REJECT' },
        { type: 'dns', tag: 'DNS' },
        { type: 'vless', tag: 'Incomplete-No-Port', server: '1.2.3.4' },
        {
          type: 'vless',
          tag: 'VLESS-IPv6',
          server: '2001:db8::1',
          server_port: 443,
          uuid: '11111111-1111-1111-1111-111111111111',
          flow: 'xtls-rprx-vision',
          tls: {
            enabled: true,
            server_name: 'cdn.example.com',
            alpn: ['h2', 'http/1.1'],
            utls: { fingerprint: 'chrome' },
            reality: { enabled: true, public_key: 'pbkVal', short_id: 'abcd' },
          },
          transport: { type: 'ws', path: '/ws', headers: { Host: 'ws.example.com' } },
        },
        {
          type: 'hysteria2',
          tag: 'HY2-Obfs',
          server: 'hy.example.com',
          server_port: 8443,
          password: 'hy2password',
          obfs: { type: 'salamander', password: 'obfspass' },
          tls: { enabled: true, server_name: 'hy.example.com', insecure: true },
        },
        {
          type: 'tuic',
          tag: 'TUIC-v5',
          server: 'tuic.example.com',
          server_port: 443,
          uuid: '22222222-2222-2222-2222-222222222222',
          password: 'tuicpassword',
          congestion_control: 'bbr',
          tls: { enabled: true, server_name: 'tuic.example.com' },
        },
      ],
    };

    const urls = extractSingboxNodes(config);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain('@[2001:db8::1]:443');
    expect(urls[0]).toContain('pbk=pbkVal');
    expect(urls[0]).toContain('alpn=h2%2Chttp%2F1.1');
    expect(urls[1]).toContain('obfs=salamander');
    expect(urls[1]).toContain('allowInsecure=1');
    expect(urls[2]).toContain('congestion_control=bbr');

    expect(singboxOutboundToUrl(null)).toBeNull();
    expect(extractSingboxNodes(null)).toEqual([]);
  });

  it('parses v2rayn:// JSON links and enforces SS2022 key-length validation', () => {
    const hy2Json = JSON.stringify({
      Remarks: 'V2RayN IPv6 HY2',
      Server: '2001:db8::2',
      Port: 8443,
      Password: 'secret-password',
      Sni: 'hy.example.com',
      UpMbps: 50,
      DownMbps: 100,
      Obfs: 'salamander',
      ObfsPassword: 'obfs-secret',
    });
    const parsedHy2 = parseV2rayNLink(`v2rayn://hy2/${toBase64Url(hy2Json)}`);
    expect(parsedHy2).toContain('hysteria2://secret-password@[2001:db8::2]:8443');
    expect(parsedHy2).toContain('obfs=salamander');

    // Invalid Base64 / missing protocol / unknown protocol return null
    expect(parseV2rayNLink('v2rayn://unknown/' + toBase64Url('{"Server":"1.1.1.1","Port":443}'))).toBeNull();
    expect(parseV2rayNLink('v2rayn://vless/%%%invalid%%%')).toBeNull();
    expect(parseV2rayNLink('https://example.com')).toBeNull();

    // SS2022 key-length verification
    const key16 = Buffer.alloc(16, 1).toString('base64');
    const key32 = Buffer.alloc(32, 2).toString('base64');
    const valid128 = `ss://${Buffer.from(`2022-blake3-aes-128-gcm:${key16}`).toString('base64')}@1.1.1.1:8388#SS2022-OK`;
    const mismatch = `ss://${Buffer.from(`2022-blake3-aes-128-gcm:${key32}`).toString('base64')}@1.1.1.1:8388#SS2022-Mismatch`;
    const nonBase64Pwd = `ss://${Buffer.from('2022-blake3-aes-256-gcm:not base64!').toString('base64')}@1.1.1.1:8388#SS2022-Bad`;

    expect(validateSS2022Node(valid128).valid).toBe(true);
    const mismatchRes = validateSS2022Node(mismatch);
    expect(mismatchRes.valid).toBe(false);
    expect(mismatchRes.details?.suggestedCipher).toBe('2022-blake3-aes-256-gcm');
    expect(fixSS2022Node(mismatch).fixed).toBe(true);
    expect(validateSS2022Node(nonBase64Pwd).valid).toBe(false);
    expect(validateSS2022Node('vless://abc@1.1.1.1:443').valid).toBe(true);
  });

  it('handles xHTTP downloadSettings/xmux edge cases and preserves special characters across NodeIR round-trip', () => {
    const extraObj = {
      scMaxEachPostBytes: '500000-1000000',
      headers: { Host: 'extra.example.com', InvalidNumberIgnored: 123 },
      xmux: { maxConnections: 4, hKeepAlivePeriod: 15.9 },
      downloadSettings: {
        address: 'dl.example.com',
        port: 443,
        security: 'reality',
        realitySettings: {
          serverName: 'dl.sni.example.com',
          // Omit publicKey to verify defensive public-key empty-string clear
        },
      },
    };
    const uri = `vless://11111111-1111-1111-1111-111111111111@xhttp.example.com:443?encryption=none&type=xhttp&security=reality&sni=up.example.com&pbk=upstreamKey&extra=${encodeURIComponent(
      JSON.stringify(extraObj),
    )}#${encodeURIComponent('🇭🇰 HK #1 & Fast?')}`;

    const clash = urlToClashProxy(uri);
    expect(clash.name).toBe('🇭🇰 HK #1 & Fast?');
    expect(clash['xhttp-opts']['download-settings']['reality-opts']).toEqual({ 'public-key': '' });
    expect(clash['xhttp-opts'].headers.InvalidNumberIgnored).toBeUndefined();
    expect(typeof clash['xhttp-opts'].headers.Host).toBe('string');
    expect(clash['xhttp-opts']['reuse-settings']['h-keep-alive-period']).toBe(15);

    const ir = parseUrlToNodeIR(uri);
    expect(ir?.name).toBe('🇭🇰 HK #1 & Fast?');
    const backClash = nodeIRToClashProxy(ir);
    const backUrl = nodeIRToUrl(ir);
    expect(convertClashProxyToUrl(backClash)).toContain(encodeURIComponent('🇭🇰 HK #1 & Fast?'));
    expect(backUrl).toContain(encodeURIComponent('🇭🇰 HK #1 & Fast?'));
  });
});
