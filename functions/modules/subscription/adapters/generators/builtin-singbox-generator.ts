/**
 * 内置 Sing-Box 配置生成器
 * 将节点 URL 列表转换为基础可用的 sing-box JSON 配置。
 */

import type { ClashProxy } from '@misub/core/types.js';
import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import { cleanControlChars, getUniqueName } from '../../core/name-utils.js';
import {
  DEFAULT_RELAY_GROUP,
  DEFAULT_SELECT_GROUP,
  getBuiltinRules,
  getRemoteProviderDefinitions,
  getSingboxDnsRuleSet,
  type SingboxRuleSetDefinition,
} from '../../templates/builtin-rules-provider.js';
import { buildSingboxDnsConfig, DNS_PROXY_GROUP, SINGBOX_CN_RULE_SET } from '../../security/safe-dns.js';
import { SINGBOX_SNIFF_RULE } from '../../core/sniffing-config.js';
import { applySingboxBaseConfigOverride, buildVisualRulesAndProviders, type SingboxVisualRule } from '../../core/visual-rules-builder.js';
import {
  applySingboxShadowsocksPlugin,
  applySingboxTuicExtraFields,
  buildSingboxConfigEnvelope,
  DEFAULT_TEST_URL,
  materializeRelayChainNodes,
  parseNodeUrlLines,
  resolveBuiltinPolicyGroups,
  SINGBOX_LOCAL_ROUTE_RULES,
  type BuiltinGeneratorOptions,
} from '../../core/client-shared.js';

interface SingboxTlsConfig {
  enabled?: boolean;
  server_name?: string;
  insecure?: boolean;
  alpn?: unknown[];
  utls?: { enabled: boolean; fingerprint: unknown };
  reality?: { enabled: boolean; public_key: unknown; short_id: unknown };
  ech?: { enabled: boolean; query_server_name?: unknown; config?: string[] };
}

interface SingboxOutbound extends Record<string, unknown> {
  tag: string;
  type: string;
  name?: string;
  tls?: SingboxTlsConfig;
  transport?: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function sanitizeName(name: string | undefined | null): string {
  if (!name) return 'Untitled';
  let safe = cleanControlChars(name);
  safe = safe
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
  return safe || 'Untitled';
}

function parsePort(port: unknown): number | undefined {
  const num = Number.parseInt(String(port), 10);
  return Number.isFinite(num) ? num : undefined;
}

function buildOutbound(proxy: ClashProxy): SingboxOutbound | null {
  if (!proxy || !proxy.server || !proxy.port) return null;

  const type = (proxy.type || '').toLowerCase();
  const tag = sanitizeName(proxy.name);
  const server = proxy.server;
  const port = parsePort(proxy.port);
  if (!port) return null;

  const outbound: SingboxOutbound = { tag, type: 'direct' };

  if (type === 'ss' || type === 'shadowsocks') {
    outbound.type = 'shadowsocks';
    outbound.server = server;
    outbound.server_port = port;
    outbound.method = proxy.cipher || 'aes-128-gcm';
    outbound.password = proxy.password || '';
    if (proxy.udp) outbound.udp_over_tcp = false;

    // sing-box 的 Shadowsocks 出站使用 SIP003 plugin/plugin_opts；
    // `transport` 仅属于 V2Ray 传输协议，SFA 会严格拒绝它。
    applySingboxShadowsocksPlugin(outbound, proxy);
  } else if (type === 'vmess') {
    outbound.type = 'vmess';
    outbound.server = server;
    outbound.server_port = port;
    outbound.uuid = proxy.uuid || '';
    outbound.security = proxy.cipher || 'auto';
    outbound.alter_id = Number.isFinite(Number(proxy.alterId)) ? Number(proxy.alterId) : 0;
    if (proxy.tls || proxy.sni || proxy.servername || proxy['skip-cert-verify']) {
      outbound.tls = {
        enabled: true,
        server_name: proxy.sni || proxy.servername || server,
      };
      if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) {
        outbound.tls.insecure = true;
      }
    }
    if (proxy.network === 'ws') {
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      outbound.transport = { type: 'ws' };
      if (wsOpts?.path) {
        outbound.transport.path = wsOpts.path;
      }
      const host = wsHeaders?.Host;
      if (host) outbound.transport.headers = { Host: host };
    } else if (proxy.network === 'grpc') {
      const grpcOpts = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts);
      outbound.transport = {
        type: 'grpc',
        ...(grpcOpts?.['grpc-service-name'] ? { service_name: grpcOpts['grpc-service-name'] } : {}),
      };
    } else if (proxy.network === 'h2' || proxy.network === 'http') {
      outbound.transport = { type: 'http' };
    } else if (proxy.network === 'httpupgrade') {
      outbound.transport = { type: 'httpupgrade' };
    }
  } else if (type === 'vless') {
    outbound.type = 'vless';
    outbound.server = server;
    outbound.server_port = port;
    outbound.uuid = proxy.uuid || '';
    const vlessNet = String(proxy.network || '').toLowerCase();
    if (vlessNet && vlessNet !== 'tcp' && vlessNet !== 'raw') {
      if (vlessNet === 'ws') {
        outbound.transport = { type: 'ws' };
        const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
        const wsHeaders = asRecord(wsOpts?.headers);
        if (wsOpts?.path) outbound.transport.path = wsOpts.path;
        if (wsHeaders?.Host) outbound.transport.headers = { Host: wsHeaders.Host };
      } else if (vlessNet === 'grpc') {
        outbound.transport = { type: 'grpc' };
        const grpcOpts = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts);
        if (grpcOpts?.['grpc-service-name']) outbound.transport.service_name = grpcOpts['grpc-service-name'];
      } else if (vlessNet === 'h2' || vlessNet === 'http') {
        outbound.transport = { type: 'http' };
      } else if (vlessNet === 'httpupgrade') {
        outbound.transport = { type: 'httpupgrade' };
      } else if (vlessNet === 'xhttp') {
        // sing-box 暂不支持 xhttp transport，跳过该节点避免整份配置无法加载
        return null;
      }
    }
    if (proxy.flow) outbound.flow = proxy.flow;
    const reality = asRecord(proxy.reality_opts) || asRecord(proxy['reality-opts']);
    if (reality) {
      outbound.tls = {
        enabled: true,
        server_name: proxy.sni || proxy.servername || server,
        utls: { enabled: true, fingerprint: proxy['client-fingerprint'] || 'chrome' },
        reality: {
          enabled: true,
          public_key: reality['public-key'] || reality.public_key,
          short_id: reality['short-id'] || reality.short_id,
        },
      };
    } else if (proxy.tls || proxy.sni || proxy.servername || proxy['skip-cert-verify']) {
      outbound.tls = {
        enabled: true,
        server_name: proxy.sni || proxy.servername || server,
      };
      if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) {
        outbound.tls.insecure = true;
      }
    }
  } else if (type === 'trojan') {
    outbound.type = 'trojan';
    outbound.server = server;
    outbound.server_port = port;
    outbound.password = proxy.password || '';
    outbound.tls = {
      enabled: true,
      server_name: proxy.sni || proxy.servername || server,
    };
    if (proxy.network === 'ws') {
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      outbound.transport = {
        type: 'ws',
        path: wsOpts?.path || '/',
        headers: asRecord(wsOpts?.headers) || {},
      };
    }
  } else if (type === 'hysteria2' || type === 'hy2') {
    outbound.type = 'hysteria2';
    outbound.server = server;
    outbound.server_port = port;
    outbound.password = proxy.password || '';
    if (String(proxy.obfs || '').toLowerCase() === 'salamander' && proxy['obfs-password']) {
      outbound.obfs = {
        type: 'salamander',
        password: String(proxy['obfs-password']),
      };
    }
    const rawPorts = proxy.ports || proxy['port-hopping'];
    if (rawPorts) {
      const ranges = String(rawPorts)
        .split(',')
        .map((r) => r.trim().replace('-', ':'))
        .filter(Boolean);
      if (ranges.length > 0) outbound.server_ports = ranges;
    }
    const upVal = Number.parseInt(String(proxy.up || ''), 10);
    if (Number.isFinite(upVal) && upVal > 0) outbound.up_mbps = upVal;
    const downVal = Number.parseInt(String(proxy.down || ''), 10);
    if (Number.isFinite(downVal) && downVal > 0) outbound.down_mbps = downVal;
    outbound.tls = {
      enabled: true,
      server_name: proxy.sni || proxy.servername || server,
    };
  } else if (type === 'tuic') {
    outbound.type = 'tuic';
    outbound.server = server;
    outbound.server_port = port;
    outbound.uuid = proxy.uuid || '';
    outbound.password = proxy.password || '';

    applySingboxTuicExtraFields(outbound, proxy);

    outbound.tls = {
      enabled: true,
      server_name: proxy.sni || proxy.servername || server,
    };
    if (proxy.alpn) outbound.tls.alpn = Array.isArray(proxy.alpn) ? proxy.alpn : [proxy.alpn];
  } else if (type === 'anytls') {
    outbound.type = 'anytls';
    outbound.server = server;
    outbound.server_port = port;
    outbound.password = proxy.password || '';
    outbound.tls = {
      enabled: true,
      server_name: proxy.sni || proxy.servername || server,
    };
  } else if (type === 'snell') {
    outbound.type = 'snell';
    outbound.server = server;
    outbound.server_port = port;
    outbound.psk = proxy.psk || proxy.password || '';
    if (proxy.version) outbound.version = Number(proxy.version);
  } else if (type === 'wireguard') {
    outbound.type = 'wireguard';
    outbound.server = server;
    outbound.server_port = port;
    outbound.private_key = proxy['private-key'] || '';
    outbound.local_address = Array.isArray(proxy.ip) ? proxy.ip : proxy.ip ? [proxy.ip] : [];
    outbound.peer_public_key = proxy['public-key'] || '';
    outbound.pre_shared_key = proxy['preshared-key'] || '';
    outbound.reserved = proxy.reserved;
  } else if (type === 'http' || type === 'https') {
    outbound.type = 'http';
    outbound.server = server;
    outbound.server_port = port;
    if (proxy.username) outbound.username = proxy.username;
    if (proxy.password) outbound.password = proxy.password;
    if (type === 'https' || proxy.tls || proxy.sni || proxy.servername) {
      outbound.tls = {
        enabled: true,
        server_name: proxy.sni || proxy.servername || server,
        insecure: proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true,
      };
    }
  } else if (type === 'socks5' || type === 'socks5-tls') {
    outbound.type = 'socks';
    outbound.server = server;
    outbound.server_port = port;
    if (proxy.username) outbound.username = proxy.username;
    if (proxy.password) outbound.password = proxy.password;
    if (type === 'socks5-tls') {
      outbound.tls = {
        enabled: true,
        server_name: proxy.sni || proxy.servername || server,
      };
    }
  } else {
    return null;
  }

  if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) {
    outbound.tls = outbound.tls || {};
    outbound.tls.enabled = true;
    outbound.tls.insecure = true;
  }
  if (
    (proxy.sni || proxy.servername) &&
    ((type !== 'ss' && type !== 'shadowsocks') || proxy.tls || outbound.tls?.enabled)
  ) {
    outbound.tls = outbound.tls || {};
    outbound.tls.server_name = proxy.sni || proxy.servername;
  }
  if (proxy['client-fingerprint']) {
    outbound.tls = outbound.tls || {};
    outbound.tls.utls = { enabled: true, fingerprint: proxy['client-fingerprint'] };
  }
  const echOpts = asRecord(proxy['ech-opts']);
  if (echOpts?.enable && outbound.tls?.enabled) {
    const ech: NonNullable<SingboxTlsConfig['ech']> = { enabled: true };
    if (echOpts['query-server-name']) {
      ech.query_server_name = echOpts['query-server-name'];
    } else if (echOpts.config) {
      ech.config = [`-----BEGIN ECH CONFIGS-----\n${echOpts.config}\n-----END ECH CONFIGS-----`];
    }
    outbound.tls.ech = ech;
  }

  if (proxy.tfo) {
    outbound.tcp_fast_open = true;
  }

  return outbound;
}

export function generateBuiltinSingboxConfig(nodeList: string, options: BuiltinGeneratorOptions = {}): string {
  const nodeUrls = parseNodeUrlLines(nodeList);

  const outbounds: SingboxOutbound[] = [];
  const usedNames = new Map<string, number>();
  const nodeEntries: Array<{ tag: string; outbound: SingboxOutbound }> = [];

  const proxies = urlsToClashProxies(nodeUrls, options);

  // 应用 UDP 开关
  // (已在 urlsToClashProxies 中全局处理)

  for (const clashProxy of proxies) {
    const baseName = sanitizeName(clashProxy.name);
    clashProxy.name = getUniqueName(baseName, usedNames);

    const outbound = buildOutbound(clashProxy);
    if (outbound) {
      outbounds.push(outbound);
      nodeEntries.push({ tag: outbound.tag, outbound });
    }
  }

  if (outbounds.length === 0) {
    outbounds.push({ tag: 'DIRECT', type: 'direct' });
  }

  const resolved = resolveBuiltinPolicyGroups(
    outbounds.map((o) => ({ ...o, name: o.tag })),
    options,
  );
  const { levelKey, bt, useVisualRules } = resolved;
  let proxyGroups = resolved.proxyGroups;

  if (!useVisualRules && levelKey === 'RELAY') {
    const relay = materializeRelayChainNodes({
      nameKey: 'tag',
      linkKey: 'detour',
      publicItems: nodeEntries.map(({ outbound }) => outbound),
      proxyGroups,
      allProxiesForPrune: outbounds.map((o) => ({ ...o, name: o.tag })),
    });
    if (relay.items.length > 0) {
      outbounds.splice(0, outbounds.length, ...(relay.items as SingboxOutbound[]));
    }
    proxyGroups = relay.proxyGroups;
  }

  // 将抽象分组转换为 Sing-Box Outbounds
  const groupOutbounds = proxyGroups.map((group) => {
    let type = 'selector';
    if (group.type === 'url-test') type = 'urltest';
    if (group.type === 'fallback') type = 'urltest'; // Sing-Box 暂时映射为 urltest

    return {
      tag: group.name,
      type: type,
      outbounds: group.proxies,
      ...(type === 'urltest'
        ? {
            url: DEFAULT_TEST_URL,
            interval: '10m',
            tolerance: 50,
          }
        : {}),
    };
  });

  let ruleSets: SingboxRuleSetDefinition[];
  let routeRules: Array<Record<string, unknown>>;
  if (useVisualRules) {
    const visualOutput = buildVisualRulesAndProviders('singbox', { ...options, builtinTransform: bt });
    const dnsCnRuleSet = getSingboxDnsRuleSet(options);
    const seenTags = new Set([dnsCnRuleSet.tag]);
    ruleSets = [
      dnsCnRuleSet,
      ...visualOutput.singboxRuleSets.filter((item) => {
        if (seenTags.has(item.tag)) return false;
        seenTags.add(item.tag);
        return true;
      }),
    ];
    routeRules = [
      { ...SINGBOX_SNIFF_RULE },
      ...SINGBOX_LOCAL_ROUTE_RULES.map((r): Record<string, unknown> => ({ ...r })),
      ...visualOutput.rules
        .filter((r): r is SingboxVisualRule => typeof r === 'object' && r !== null)
        .map((r): Record<string, unknown> => ({ ...r })),
    ];
  } else {
    // 从统一规则库获取分流规则
    const rawRules = getBuiltinRules(levelKey, 'singbox', options);

    // 提取远程 Rule Set 定义 (Sing-Box 格式)
    const ruleSetsMap = getRemoteProviderDefinitions('singbox', rawRules, options) as Record<
      string,
      SingboxRuleSetDefinition
    >;
    ruleSets = [
      getSingboxDnsRuleSet(options),
      ...Object.values(ruleSetsMap).filter((ruleSet) => ruleSet.tag !== SINGBOX_CN_RULE_SET),
    ];

    // 转换路由规则：将中间对象映射为 Sing-Box 语法
    // 首条为域名嗅探；国内域名直连由规则集内的 RULE-SET,CN_DOMAIN/DOMAIN-SUFFIX,cn 在 GEOIP 之前承载
    routeRules = [
      { ...SINGBOX_SNIFF_RULE },
      ...SINGBOX_LOCAL_ROUTE_RULES.map((r): Record<string, unknown> => ({ ...r })),
      ...rawRules
        .filter((r): r is Exclude<typeof r, string> => typeof r === 'object' && r !== null)
        .map((r): Record<string, unknown> => {
          if ('type' in r && r.type === 'rule_set') return { rule_set: [r.tag], outbound: r.outbound };
          return { ...r }; // 已经是 Sing-Box 格式的普通规则
        }),
    ];
  }

  const dnsConfig = buildSingboxDnsConfig(options.customDnsOverride || '', {
    mode: options.dnsMode,
    proxyGroup: DNS_PROXY_GROUP,
  });

  let config: Record<string, unknown> = buildSingboxConfigEnvelope({
    dnsConfig,
    proxyOutbounds: outbounds,
    groupOutbounds,
    finalOutbound: !useVisualRules && levelKey === 'RELAY' ? DEFAULT_RELAY_GROUP : DEFAULT_SELECT_GROUP,
    ruleSets,
    routeRules,
    clashApi: bt?.enableClashApi
      ? {
          external_controller: bt.externalController || '0.0.0.0:9090',
          external_ui: 'ui',
          ...(bt.externalUiDownloadUrl ? { external_ui_download_url: bt.externalUiDownloadUrl } : {}),
        }
      : null,
  });

  if (bt?.baseConfig?.singbox) {
    config = applySingboxBaseConfigOverride(
      config as { route?: Record<string, unknown>; [key: string]: unknown },
      bt.baseConfig.singbox,
    );
  }

  return JSON.stringify(config, null, 2) + '\n';
}
