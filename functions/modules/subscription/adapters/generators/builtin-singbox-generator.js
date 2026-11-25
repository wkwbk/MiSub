/**
 * 内置 Sing-Box 配置生成器
 * 将节点 URL 列表转换为基础可用的 sing-box JSON 配置。
 */

import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import { cleanControlChars, getUniqueName } from '../../core/name-utils.js';
import {
  DEFAULT_RELAY_GROUP,
  DEFAULT_SELECT_GROUP,
  getBuiltinRules,
  getRemoteProviderDefinitions,
  getSingboxDnsRuleSet,
  POLICY_GROUPS,
  pruneProxyGroups,
} from '../../templates/builtin-rules-provider.js';
import { buildSingboxDnsConfig, DNS_PROXY_GROUP, SINGBOX_CN_RULE_SET } from '../../security/safe-dns.js';
import { SINGBOX_SNIFF_RULE } from '../../core/sniffing-config.js';
import {
  applyGeneralGroupToggles,
  applySingboxBaseConfigOverride,
  buildVisualPolicyGroups,
  buildVisualRulesAndProviders,
  normalizeBuiltinTransform,
} from '../../core/visual-rules-builder.js';

function sanitizeName(name) {
  if (!name) return 'Untitled';
  let safe = cleanControlChars(name);
  safe = safe
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
  return safe || 'Untitled';
}

function parsePort(port) {
  const num = Number.parseInt(String(port), 10);
  return Number.isFinite(num) ? num : undefined;
}

function buildOutbound(proxy) {
  if (!proxy || !proxy.server || !proxy.port) return null;

  const type = (proxy.type || '').toLowerCase();
  const tag = sanitizeName(proxy.name);
  const server = proxy.server;
  const port = parsePort(proxy.port);
  if (!port) return null;

  const outbound = { tag, type: 'direct' };

  if (type === 'ss' || type === 'shadowsocks') {
    outbound.type = 'shadowsocks';
    outbound.server = server;
    outbound.server_port = port;
    outbound.method = proxy.cipher || 'aes-128-gcm';
    outbound.password = proxy.password || '';
    if (proxy.udp) outbound.udp_over_tcp = false;

    // sing-box 的 Shadowsocks 出站使用 SIP003 plugin/plugin_opts；
    // `transport` 仅属于 V2Ray 传输协议，SFA 会严格拒绝它。
    const plugin = proxy.plugin || '';
    const opts = proxy['plugin-opts'] || proxy.pluginOpts || {};
    if (plugin === 'v2ray-plugin' || opts.mode === 'websocket') {
      outbound.plugin = 'v2ray-plugin';
      const pluginOptions = ['mode=websocket'];
      if (opts.host) pluginOptions.push(`host=${opts.host}`);
      if (opts.path) pluginOptions.push(`path=${opts.path}`);
      if (opts.tls || opts.mode === 'websocket-tls') pluginOptions.push('tls');
      outbound.plugin_opts = pluginOptions.join(';');
    }
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
      outbound.transport = { type: 'ws' };
      if (proxy['ws-opts']?.path || proxy.wsOpts?.path) {
        outbound.transport.path = proxy['ws-opts']?.path || proxy.wsOpts?.path;
      }
      const host = proxy['ws-opts']?.headers?.Host || proxy.wsOpts?.headers?.Host;
      if (host) outbound.transport.headers = { Host: host };
    } else if (proxy.network === 'grpc') {
      const grpcOpts = proxy['grpc-opts'] || proxy.grpcOpts;
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
        const wsOpts = proxy['ws-opts'] || proxy.wsOpts;
        if (wsOpts?.path) outbound.transport.path = wsOpts.path;
        if (wsOpts?.headers?.Host) outbound.transport.headers = { Host: wsOpts.headers.Host };
      } else if (vlessNet === 'grpc') {
        outbound.transport = { type: 'grpc' };
        const grpcOpts = proxy['grpc-opts'] || proxy.grpcOpts;
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
    if (proxy.reality_opts || proxy['reality-opts']) {
      const reality = proxy.reality_opts || proxy['reality-opts'];
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
      const wsOpts = proxy['ws-opts'] || proxy.wsOpts;
      outbound.transport = {
        type: 'ws',
        path: wsOpts?.path || '/',
        headers: wsOpts?.headers || {},
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

    const congestionControl = proxy['congestion-controller'] || proxy['congestion-control'] || proxy.congestion;
    if (congestionControl) outbound.congestion_control = congestionControl;
    if (proxy['udp-over-stream'] !== undefined) outbound.udp_over_stream = Boolean(proxy['udp-over-stream']);
    if (proxy['zero-rtt-handshake'] !== undefined || proxy['reduce-rtt'] !== undefined) {
      outbound.zero_rtt_handshake = Boolean(proxy['zero-rtt-handshake'] ?? proxy['reduce-rtt']);
    }
    if (proxy.heartbeat) outbound.heartbeat = String(proxy.heartbeat);
    if (proxy.network) outbound.network = proxy.network;

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
  if (proxy['ech-opts']?.enable && outbound.tls?.enabled) {
    const ech = { enabled: true };
    if (proxy['ech-opts']['query-server-name']) {
      ech.query_server_name = proxy['ech-opts']['query-server-name'];
    } else if (proxy['ech-opts'].config) {
      ech.config = [`-----BEGIN ECH CONFIGS-----\n${proxy['ech-opts'].config}\n-----END ECH CONFIGS-----`];
    }
    outbound.tls.ech = ech;
  }

  if (proxy.tfo) {
    outbound.tcp_fast_open = true;
  }

  return outbound;
}

export function generateBuiltinSingboxConfig(nodeList, options = {}) {
  const { ruleLevel = 'std' } = options;

  const cleanedNodeList = cleanControlChars(nodeList);
  const nodeUrls = cleanedNodeList
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  const outbounds = [];
  const usedNames = new Map();
  const nodeEntries = [];

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

  const levelKey = (ruleLevel || 'std').toUpperCase();
  const bt = options.builtinTransform ? normalizeBuiltinTransform(options.builtinTransform) : null;
  const useVisualRules = Boolean(bt?.visualRulesEnabled);

  let proxyGroups;
  if (useVisualRules) {
    proxyGroups = buildVisualPolicyGroups(outbounds, { ...options, builtinTransform: bt });
  } else {
    // 获取内置策略组
    const policyGroupsFactory = POLICY_GROUPS[levelKey] || POLICY_GROUPS.STD;
    proxyGroups = policyGroupsFactory(outbounds, options);
    if (bt) {
      proxyGroups = applyGeneralGroupToggles(proxyGroups, { builtinTransform: bt });
    }
    proxyGroups = pruneProxyGroups(proxyGroups, outbounds);
  }

  if (!useVisualRules && levelKey === 'RELAY') {
    const chainOutbounds = nodeEntries.map(({ tag, outbound }) => ({
      ...outbound,
      tag: `🔗 链式代理 - ${tag}`,
      detour: '入口节点',
    }));
    const chainTags = chainOutbounds.map((outbound) => outbound.tag);
    outbounds.push(...chainOutbounds);
    proxyGroups = proxyGroups
      .map((group) => {
        if (group.name === '🔗 链式代理') {
          return {
            ...group,
            // Sing-box 通过 detour 表达链式出站。保持上一版可用结构：
            // “链式代理”直接选择带 detour 的落地副本；同时隐藏“落地节点”分组。
            type: 'select',
            proxies: chainTags,
          };
        }
        return group;
      })
      .filter(Boolean);
    proxyGroups = pruneProxyGroups(proxyGroups, outbounds);
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
            url: 'http://www.gstatic.com/generate_204',
            interval: '10m',
            tolerance: 50,
          }
        : {}),
    };
  });

  let ruleSets;
  let routeRules;
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
      {
        ip_cidr: ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
        outbound: 'DIRECT',
      },
      { domain_suffix: ['localhost'], outbound: 'DIRECT' },
      ...visualOutput.rules,
    ];
  } else {
    // 从统一规则库获取分流规则
    const rawRules = getBuiltinRules(levelKey, 'singbox', options);

    // 提取远程 Rule Set 定义 (Sing-Box 格式)
    const ruleSetsMap = getRemoteProviderDefinitions('singbox', rawRules, options);
    ruleSets = [
      getSingboxDnsRuleSet(options),
      ...Object.values(ruleSetsMap).filter((ruleSet) => ruleSet.tag !== SINGBOX_CN_RULE_SET),
    ];

    // 转换路由规则：将中间对象映射为 Sing-Box 语法
    // 首条为域名嗅探；国内域名直连由规则集内的 RULE-SET,CN_DOMAIN/DOMAIN-SUFFIX,cn 在 GEOIP 之前承载
    routeRules = [
      { ...SINGBOX_SNIFF_RULE },
      {
        ip_cidr: ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
        outbound: 'DIRECT',
      },
      { domain_suffix: ['localhost'], outbound: 'DIRECT' },
      ...rawRules.map((r) => {
        if (r.type === 'rule_set') return { rule_set: [r.tag], outbound: r.outbound };
        return r; // 已经是 Sing-Box 格式的普通规则
      }),
    ];
  }

  const dnsConfig = buildSingboxDnsConfig(options.customDnsOverride || '', {
    mode: options.dnsMode,
    proxyGroup: DNS_PROXY_GROUP,
  });

  let config = {
    log: { level: 'info' },
    dns: dnsConfig,
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        address: ['172.19.0.1/30'],
        auto_route: true,
        strict_route: true,
        stack: 'mixed',
      },
    ],
    outbounds: [{ tag: 'DIRECT', type: 'direct' }, { tag: 'REJECT', type: 'block' }, ...outbounds, ...groupOutbounds],
    route: {
      auto_detect_interface: true,
      default_domain_resolver: dnsConfig.servers[0]?.tag || 'dns-cn-1',
      final: !useVisualRules && levelKey === 'RELAY' ? DEFAULT_RELAY_GROUP : DEFAULT_SELECT_GROUP,
      rule_set: ruleSets,
      rules: routeRules,
    },
    ...(bt?.enableClashApi
      ? {
          experimental: {
            clash_api: {
              external_controller: bt.externalController || '0.0.0.0:9090',
              external_ui: 'ui',
              ...(bt.externalUiDownloadUrl ? { external_ui_download_url: bt.externalUiDownloadUrl } : {}),
            },
          },
        }
      : {}),
  };

  if (bt?.baseConfig?.singbox) {
    config = applySingboxBaseConfigOverride(config, bt.baseConfig.singbox);
  }

  return JSON.stringify(config, null, 2) + '\n';
}
