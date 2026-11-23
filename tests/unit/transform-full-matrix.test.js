import { describe, expect, it } from 'vitest';
import * as yaml from 'js-yaml';
import { transformBuiltinSubscription } from '../../functions/modules/subscription/transformer-factory.js';
import { handleApiRequest } from '../../functions/modules/api-router.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';
import { VISUAL_RULE_CATEGORIES, VISUAL_RULE_PRESETS } from '../../shared/visual-rules-catalog.js';

// 覆盖所有 MiSub 支持的协议类型 + 多地区名称
const ALL_PROTOCOL_NODES = [
  // Shadowsocks (AEAD + obfs)
  'ss://YWVzLTI1Ni1nY206cGFzc3dvcmQxMjM=@hk-ss.example.com:8388#🇭🇰 香港 SS',
  // Shadowsocks 2022 + v2ray-plugin
  'ss://MjAyMi1ibGFrZTMtYWVzLTI1Ni1nY206TldSak1UVmxNVFZtTWpnMU5HRTVaRGsxT1dJd1pUUm1ZbVJrTnpkaU5qTT0@sg-ss2022.example.com:8080?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Bhost%3Dcdn.example.com%3Bpath%3D%2Fws#🇸🇬 新加坡 SS2022',
  // VMess TCP
  `vmess://${Buffer.from(
    JSON.stringify({
      v: '2',
      ps: '🇯🇵 日本 VMess TCP',
      add: 'jp-vmess-tcp.example.com',
      port: '10086',
      id: '11111111-2222-3333-4444-555555555555',
      aid: '0',
      scy: 'auto',
      net: 'tcp',
      type: 'none',
      tls: '',
    }),
  ).toString('base64')}`,
  // VMess WS + TLS
  `vmess://${Buffer.from(
    JSON.stringify({
      v: '2',
      ps: '🇺🇸 美国 VMess WS',
      add: 'us-vmess-ws.example.com',
      port: '443',
      id: '22222222-2222-3333-4444-555555555555',
      aid: '0',
      scy: 'auto',
      net: 'ws',
      host: 'ws.example.com',
      path: '/vmess',
      tls: 'tls',
      sni: 'ws.example.com',
    }),
  ).toString('base64')}`,
  // VLESS Reality
  'vless://33333333-2222-3333-4444-555555555555@jp-reality.example.com:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.microsoft.com&fp=chrome&pbk=publickey123456&sid=abcd1234&type=tcp#🇯🇵 日本 VLESS Reality',
  // VLESS WS + TLS
  'vless://44444444-2222-3333-4444-555555555555@tw-vless-ws.example.com:443?encryption=none&security=tls&sni=tw.example.com&type=ws&host=tw.example.com&path=%2Fvless#🇹🇼 台湾 VLESS WS',
  // VLESS gRPC + TLS
  'vless://55555555-2222-3333-4444-555555555555@kr-vless-grpc.example.com:443?encryption=none&security=tls&sni=kr.example.com&type=grpc&serviceName=grpcSvc#🇰🇷 韩国 VLESS gRPC',
  // Trojan TCP + TLS
  'trojan://trojanpass123@hk-trojan.example.com:443?sni=hk-trojan.example.com&allowInsecure=0#🇭🇰 香港 Trojan',
  // Trojan WS + TLS
  'trojan://trojanwspass@us-trojan-ws.example.com:443?type=ws&host=us-ws.example.com&path=%2Ftrws&sni=us-ws.example.com#🇺🇸 美国 Trojan WS',
  // Hysteria2
  'hysteria2://hy2pass@jp-hy2.example.com:443?sni=jp-hy2.example.com&obfs=salamander&obfs-password=salamanderpass&mport=20000-30000&upmbps=50&downmbps=200#🇯🇵 日本 Hy2',
  // TUIC
  'tuic://66666666-2222-3333-4444-555555555555:tuicpass@sg-tuic.example.com:443?sni=sg-tuic.example.com&congestion_control=bbr&alpn=h3#🇸🇬 新加坡 TUIC',
  // AnyTLS
  'anytls://anytlspass@uk-anytls.example.com:443?sni=uk-anytls.example.com#🇬🇧 英国 AnyTLS',
  // Snell
  'snell://snellpsk123@hk-snell.example.com:6160?version=4&obfs=tls&obfs-host=icloud.com#🇭🇰 香港 Snell',
  // WireGuard
  'wireguard://privkey1234567890=@us-wg.example.com:51820?publickey=pubkey1234567890=&address=10.0.0.2/32&mtu=1420#🇺🇸 美国 WireGuard',
  // HTTPS
  'https://httpuser:httppass@de-https.example.com:443#🇩🇪 德国 HTTPS',
  // SOCKS5 & SOCKS5-TLS
  'socks5://socksuser:sockspass@fr-socks.example.com:1080#🇫🇷 法国 SOCKS5',
  'socks5://socksuser:sockspass@nl-sockstls.example.com:1081?tls=1&sni=nl-sockstls.example.com#🇳🇱 荷兰 SOCKS5 TLS',
].join('\n');

const CUSTOM_RULES_SAMPLE = [
  {
    name: '🏢 公司内网',
    action: 'direct',
    domainSuffix: ['corp.local', 'intranet.company.com'],
    domainKeyword: ['corp-internal'],
    ipCidr: ['10.10.0.0/16'],
    srcIpCidr: ['192.168.1.88/32'],
  },
  {
    name: '🚫 屏蔽域名',
    action: 'reject',
    domainSuffix: ['bad-tracker.example'],
  },
  {
    name: '⭐ 专属代理',
    action: 'proxy',
    domainSuffix: ['special-site.org'],
    ruleSet: ['openai'],
  },
];

function assertClashIntegrity(yamlStr) {
  const parsed = yaml.load(yamlStr);
  expect(parsed).toBeTruthy();
  expect(Array.isArray(parsed.proxies)).toBe(true);
  expect(parsed.proxies.length).toBeGreaterThan(0);
  expect(Array.isArray(parsed['proxy-groups'])).toBe(true);
  expect(Array.isArray(parsed.rules)).toBe(true);

  const validTargets = new Set([
    'DIRECT',
    'REJECT',
    'REJECT-DROP',
    ...parsed.proxies.map((p) => p.name),
    ...parsed['proxy-groups'].map((g) => g.name),
  ]);

  for (const group of parsed['proxy-groups']) {
    expect(Array.isArray(group.proxies)).toBe(true);
    expect(group.proxies.length).toBeGreaterThan(0);
    for (const member of group.proxies) {
      expect(member, `Group "${group.name}" must not reference itself`).not.toBe(group.name);
      expect(validTargets.has(member), `Group "${group.name}" references unknown target "${member}"`).toBe(true);
    }
  }

  return parsed;
}

function assertSingboxIntegrity(jsonStr) {
  const parsed = JSON.parse(jsonStr);
  expect(parsed).toBeTruthy();
  expect(Array.isArray(parsed.outbounds)).toBe(true);
  expect(parsed.outbounds.length).toBeGreaterThan(0);
  expect(parsed.route).toBeTruthy();
  expect(Array.isArray(parsed.route.rules)).toBe(true);

  const outboundTags = new Set(parsed.outbounds.map((o) => o.tag));
  expect(outboundTags.has(parsed.route.final), `route.final "${parsed.route.final}" must exist in outbounds`).toBe(
    true,
  );

  for (const outbound of parsed.outbounds) {
    if (outbound.type === 'selector' || outbound.type === 'urltest') {
      expect(Array.isArray(outbound.outbounds)).toBe(true);
      expect(outbound.outbounds.length).toBeGreaterThan(0);
      for (const member of outbound.outbounds) {
        expect(member, `Outbound "${outbound.tag}" must not reference itself`).not.toBe(outbound.tag);
        expect(outboundTags.has(member), `Outbound "${outbound.tag}" references unknown outbound "${member}"`).toBe(
          true,
        );
      }
    }
    // Sing-Box V2Ray transport 不能出现非法 type: "tcp"
    if (outbound.transport) {
      expect(outbound.transport.type, `Outbound "${outbound.tag}" has invalid transport.type`).not.toBe('tcp');
    }
  }

  const ruleSetTags = new Set((parsed.route.rule_set || []).map((rs) => rs.tag));
  for (const rule of parsed.route.rules) {
    if (rule.outbound) {
      expect(outboundTags.has(rule.outbound), `Route rule outbound "${rule.outbound}" must exist`).toBe(true);
    }
    if (Array.isArray(rule.rule_set)) {
      for (const tag of rule.rule_set) {
        expect(ruleSetTags.has(tag), `Route rule references missing rule_set "${tag}"`).toBe(true);
      }
    }
  }

  return parsed;
}

describe('Full Matrix: All Protocols x All Routing Modes x All Parameters x All Clients', () => {
  describe('1. Built-in auto routing (base / std / full / relay) across all clients', () => {
    for (const ruleLevel of ['base', 'std', 'full', 'relay']) {
      it(`renders valid Clash, Sing-Box, Surge, Loon, QuanX, Egern for ruleLevel=${ruleLevel}`, () => {
        const clash = assertClashIntegrity(
          transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'clash', {
            ruleLevel,
            isMeta: true,
            enableUdp: true,
            skipCertVerify: true,
          }),
        );
        // 所有协议节点均应被解析
        expect(clash.proxies.length).toBeGreaterThanOrEqual(16);

        const singbox = assertSingboxIntegrity(
          transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'singbox', {
            ruleLevel,
            enableUdp: true,
            skipCertVerify: true,
          }),
        );
        expect(singbox.outbounds.filter((o) => o.server).length).toBeGreaterThanOrEqual(16);

        const surge = transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'surge', {
          ruleLevel,
          managedConfigUrl: 'https://misub.example.com/sub/test',
        });
        expect(surge).toContain('[General]');
        expect(surge).toContain('[Proxy]');
        expect(surge).toContain('[Proxy Group]');
        expect(surge).toContain('[Rule]');
        // Surge 不支持 VLESS，但应包含 SS/VMess/Trojan/Hy2/TUIC/Snell/WireGuard/AnyTLS
        expect(surge).toContain('= ss,');
        expect(surge).toContain('= vmess,');
        expect(surge).toContain('= trojan,');
        expect(surge).toContain('= hysteria2,');
        expect(surge).toContain('= tuic-v5,');
        expect(surge).toContain('= snell,');

        const loon = transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'loon', { ruleLevel });
        expect(loon).toContain('[Proxy]');
        expect(loon).toContain('[Proxy Group]');

        const quanx = transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'quanx', { ruleLevel });
        expect(quanx).toContain('[server_local]');
        expect(quanx).toContain('[policy]');

        const egern = transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'egern', { ruleLevel });
        expect(egern).toContain('proxies:');
      });
    }
  });

  describe('2. Visual rules mode (minimal / balanced / comprehensive / custom + customRules)', () => {
    for (const [presetName, ruleIds] of Object.entries(VISUAL_RULE_PRESETS)) {
      it(`generates integrity-verified Clash, Sing-Box, Surge for visual preset=${presetName}`, () => {
        const builtinTransform = {
          visualRulesEnabled: true,
          selectedRules: ruleIds,
          customRules: CUSTOM_RULES_SAMPLE,
          groupByCountry: true,
          includeAutoSelect: true,
          enableClashApi: true,
          externalController: '0.0.0.0:9090',
          externalUiDownloadUrl: 'https://example.com/zashboard.zip',
        };

        const clash = assertClashIntegrity(
          transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'clash', { builtinTransform, isMeta: true }),
        );
        const clashGroupNames = clash['proxy-groups'].map((g) => g.name);
        expect(clashGroupNames).toContain('🏢 公司内网');
        expect(clashGroupNames).toContain('🚫 屏蔽域名');
        expect(clashGroupNames).toContain('⭐ 专属代理');
        expect(clash['external-controller']).toBe('0.0.0.0:9090');
        expect(clash['external-ui-url']).toBe('https://example.com/zashboard.zip');
        expect(clash.rules).toContain('SRC-IP-CIDR,192.168.1.88/32,🏢 公司内网');
        expect(clash.rules).toContain('DOMAIN-SUFFIX,bad-tracker.example,🚫 屏蔽域名');
        expect(clash.rules).toContain('GEOSITE,openai,⭐ 专属代理');

        const singbox = assertSingboxIntegrity(
          transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'singbox', { builtinTransform }),
        );
        const sbTags = singbox.outbounds.map((o) => o.tag);
        expect(sbTags).toContain('🏢 公司内网');
        expect(sbTags).toContain('🚫 屏蔽域名');
        expect(sbTags).toContain('⭐ 专属代理');
        expect(singbox.experimental?.clash_api?.external_controller).toBe('0.0.0.0:9090');

        const surge = transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'surge', { builtinTransform });
        expect(surge).toContain('🏢 公司内网 = select, DIRECT');
        expect(surge).toContain('🚫 屏蔽域名 = select, REJECT');
        expect(surge).toContain('SRC-IP-CIDR,192.168.1.88/32,🏢 公司内网');
      });
    }

    it('handles empty selectedRules cleanly without crashing or producing invalid configs', () => {
      const builtinTransform = {
        visualRulesEnabled: true,
        selectedRules: [],
        customRules: [],
        groupByCountry: false,
        includeAutoSelect: false,
        enableClashApi: false,
      };
      const clash = assertClashIntegrity(transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'clash', { builtinTransform }));
      expect(clash['proxy-groups'].map((g) => g.name)).not.toContain('♻️ 自动选择');
      expect(clash['proxy-groups'].map((g) => g.name)).not.toContain('🇭🇰 香港节点');

      const singbox = assertSingboxIntegrity(
        transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'singbox', { builtinTransform }),
      );
      expect(singbox.outbounds.map((o) => o.tag)).not.toContain('♻️ 自动选择');
      expect(singbox.experimental).toBeUndefined();
    });

    it('supports all 18 visual rule categories individually without broken providers', () => {
      const allIds = VISUAL_RULE_CATEGORIES.map((c) => c.id);
      const builtinTransform = { visualRulesEnabled: true, selectedRules: allIds };
      const clash = assertClashIntegrity(transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'clash', { builtinTransform }));
      const singbox = assertSingboxIntegrity(
        transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'singbox', { builtinTransform }),
      );
      expect(clash['proxy-groups'].length).toBeGreaterThanOrEqual(allIds.length);
      expect(singbox.route.rule_set.length).toBeGreaterThan(10);
    });
  });

  describe('3. General switches & Base Config Override edge cases', () => {
    it('disables groupByCountry and includeAutoSelect in fixed ruleLevel mode too', () => {
      const builtinTransform = {
        visualRulesEnabled: false,
        groupByCountry: false,
        includeAutoSelect: false,
      };
      const clash = assertClashIntegrity(
        transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'clash', { ruleLevel: 'std', builtinTransform }),
      );
      const names = clash['proxy-groups'].map((g) => g.name);
      expect(names).not.toContain('♻️ 自动选择');
      expect(names).not.toContain('🇭🇰 香港节点');

      const singbox = assertSingboxIntegrity(
        transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'singbox', { ruleLevel: 'std', builtinTransform }),
      );
      const sbTags = singbox.outbounds.map((o) => o.tag);
      expect(sbTags).not.toContain('♻️ 自动选择');
      expect(sbTags).not.toContain('🇭🇰 香港节点');
    });

    it('gracefully ignores malformed baseConfig (invalid YAML/JSON) without crashing', () => {
      const builtinTransform = {
        visualRulesEnabled: true,
        selectedRules: VISUAL_RULE_PRESETS.minimal,
        baseConfig: {
          clash: ':::invalid: [yaml',
          singbox: '{invalid json',
          surge: 'not even a section',
        },
      };
      assertClashIntegrity(transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'clash', { builtinTransform }));
      assertSingboxIntegrity(transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'singbox', { builtinTransform }));
      const surge = transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'surge', { builtinTransform });
      expect(surge).toContain('[General]');
    });

    it('merges valid baseConfig while protecting proxies/outbounds/rules across Clash, Sing-Box, Surge', () => {
      const builtinTransform = {
        visualRulesEnabled: true,
        selectedRules: VISUAL_RULE_PRESETS.minimal,
        baseConfig: {
          clash: 'mixed-port: 10808\nallow-lan: true\nipv6: true\nproxies: []\nproxy-groups: []\nrules: []\n',
          singbox: JSON.stringify({
            log: { level: 'debug' },
            ntp: { enabled: true, server: 'time.apple.com' },
            outbounds: [],
            route: { auto_detect_interface: false, rules: [], rule_set: [] },
          }),
          surge: '[General]\nloglevel = info\nipv6 = true\n\n[MITM]\nskip-server-cert-verify = true\n\n[Proxy]\nFAKE = direct\n',
        },
      };

      const clash = assertClashIntegrity(transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'clash', { builtinTransform }));
      expect(clash['mixed-port']).toBe(10808);
      expect(clash['allow-lan']).toBe(true);
      expect(clash.ipv6).toBe(true);
      expect(clash.proxies.length).toBeGreaterThanOrEqual(16);

      const singbox = assertSingboxIntegrity(
        transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'singbox', { builtinTransform }),
      );
      expect(singbox.log.level).toBe('debug');
      expect(singbox.ntp?.enabled).toBe(true);
      expect(singbox.route.auto_detect_interface).toBe(false);
      expect(singbox.outbounds.filter((o) => o.server).length).toBeGreaterThanOrEqual(16);

      const surge = transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'surge', { builtinTransform });
      expect(surge).toContain('ipv6 = true');
      expect(surge).toContain('[MITM]');
      expect(surge).not.toContain('FAKE = direct');
    });
  });

  describe('4. Subconverter external config API (/api/subconverter-config)', () => {
    it('loads saved settings.builtinTransform when no query params are provided', async () => {
      const env = {
        MISUB_DB: createMemoryD1({
          main: {
            builtinTransform: {
              selectedRules: ['ai_services', 'github'],
              customRules: [{ name: '保存的规则', action: 'direct', domainSuffix: ['saved.local'] }],
              groupByCountry: false,
              includeAutoSelect: false,
            },
          },
        }),
      };
      const req = new Request('https://misub.example.com/api/subconverter-config', { method: 'GET' });
      const res = await handleApiRequest(req, env);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('[custom]');
      expect(body).toContain('ruleset=保存的规则,[]DOMAIN-SUFFIX,saved.local');
      expect(body).toContain('custom_proxy_group=💬 AI 服务`select`');
      expect(body).toContain('custom_proxy_group=🐱 Github`select`');
      expect(body).not.toContain('🇭🇰 香港节点');
      expect(body).not.toContain('♻️ 自动选择');
    });

    it('supports comma-separated, JSON array, customRules, and returns 400 on invalid JSON', async () => {
      const resComma = await handleApiRequest(
        new Request('https://misub.example.com/api/subconverter-config?selectedRules=youtube,telegram', {
          method: 'GET',
        }),
        {},
      );
      expect(resComma.status).toBe(200);
      const commaText = await resComma.text();
      expect(commaText).toContain('📹 油管视频');
      expect(commaText).toContain('📲 电报消息');

      const resBadCustom = await handleApiRequest(
        new Request('https://misub.example.com/api/subconverter-config?customRules=not-json', { method: 'GET' }),
        {},
      );
      expect(resBadCustom.status).toBe(400);
    });
  });

  describe('5. Real-world regressions (ECH, Clash group options, Surge TUIC v5)', () => {
    it('parses ECH parameter into Clash ech-opts and Sing-Box tls.ech for VLESS, Trojan, and VMess', () => {
      const vlessEch =
        'vless://ecb7b51b-3e4f-448b-89a4-6fd2ceef8257@cf.libk.top:443?encryption=none&security=tls&sni=okra.ijg.cc&fp=chrome&alpn=h3&ech=cloudflare-ech.com%2Bhttps%3A%2F%2Fdns.alidns.com%2Fdns-query&type=xhttp&path=%2Fapi%2Fv2%2Fsync&mode=packet-up#OKRA%7CXHTTP%7CCDN';
      const trojanEch =
        'trojan://pass123@tr.example.com:443?sni=tr.example.com&ech=cloudflare-ech.com#Trojan-ECH';
      const vmessEch = `vmess://${Buffer.from(
        JSON.stringify({
          v: '2',
          ps: 'VMess-ECH',
          add: 'vm.example.com',
          port: '443',
          id: '11111111-1111-1111-1111-111111111111',
          aid: '0',
          net: 'ws',
          path: '/ws',
          host: 'vm.example.com',
          tls: 'tls',
          sni: 'vm.example.com',
          ech: 'AEn+DQBFKwAgACABWIHUGj4u+bylive/examplebase64==',
        }),
      ).toString('base64')}`;

      const clash = assertClashIntegrity(
        transformBuiltinSubscription([vlessEch, trojanEch, vmessEch].join('\n'), 'clash', { ruleLevel: 'std' }),
      );
      const vlessProxy = clash.proxies.find((p) => p.name.includes('OKRA|XHTTP|CDN'));
      const trojanProxy = clash.proxies.find((p) => p.name.includes('Trojan-ECH'));
      const vmessProxy = clash.proxies.find((p) => p.name.includes('VMess-ECH'));

      expect(vlessProxy['ech-opts']).toEqual({ enable: true, 'query-server-name': 'cloudflare-ech.com' });
      expect(trojanProxy['ech-opts']).toEqual({ enable: true, 'query-server-name': 'cloudflare-ech.com' });
      expect(vmessProxy['ech-opts']).toEqual({
        enable: true,
        config: 'AEn+DQBFKwAgACABWIHUGj4u+bylive/examplebase64==',
      });

      const singbox = assertSingboxIntegrity(
        transformBuiltinSubscription([trojanEch, vmessEch].join('\n'), 'singbox', { ruleLevel: 'std' }),
      );
      const sbTrojan = singbox.outbounds.find((o) => o.tag.includes('Trojan-ECH'));
      const sbVmess = singbox.outbounds.find((o) => o.tag.includes('VMess-ECH'));
      expect(sbTrojan.tls.ech).toEqual({ enabled: true, query_server_name: 'cloudflare-ech.com' });
      expect(sbVmess.tls.ech.enabled).toBe(true);
      expect(sbVmess.tls.ech.config?.[0]).toContain('BEGIN ECH CONFIGS');
    });

    it('flattens Clash proxy-group options to top-level url/interval/tolerance', () => {
      const clash = assertClashIntegrity(
        transformBuiltinSubscription(ALL_PROTOCOL_NODES, 'clash', { ruleLevel: 'std' }),
      );
      for (const group of clash['proxy-groups']) {
        expect(group).not.toHaveProperty('options');
        if (group.type === 'url-test' || group.type === 'fallback') {
          expect(group.url).toBeTruthy();
          expect(group.interval).toBeGreaterThan(0);
        }
      }
    });

    it('emits Surge tuic-v5 with uuid/password for TUIC v5 and keeps tuic+token for TUIC v4', () => {
      const nodes = [
        'tuic://ecb7b51b-3e4f-448b-89a4-6fd2ceef8257:pass123@no.okra.ijg.cc:51888?alpn=h3&congestion_control=bbr#OKRA%7CTU5',
        'tuic://legacytoken123@v4.example.com:443?alpn=h3#TUIC-V4',
      ].join('\n');
      const surge = transformBuiltinSubscription(nodes, 'surge', { ruleLevel: 'std' });
      expect(surge).toContain('OKRA|TU5 = tuic-v5, no.okra.ijg.cc, 51888, password=pass123, uuid=ecb7b51b-3e4f-448b-89a4-6fd2ceef8257, alpn=h3');
      expect(surge).toContain('TUIC-V4 = tuic, v4.example.com, 443, token=legacytoken123, alpn=h3');
    });
  });
});
