/**
 * 内置 Surge 配置生成器
 * 不依赖外部 SubConverter，直接将节点 URL 转换为 Surge 配置
 * 严格遵循 Surge 官方文档 https://manual.nssurge.com/policy/proxy.html
 *
 * 支持协议：SS、VMess、Trojan、Snell、TUIC、Hysteria2、AnyTLS、WireGuard、HTTP(S)、SOCKS5
 * 注意：Surge 不支持 VLESS 协议，VLESS 节点会被跳过
 */

import type { ClashProxy } from '@misub/core/types.js';
import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import { getUniqueName } from '../../core/name-utils.js';
import {
  applyIniRelayGroupPair,
  buildIniWireGuardSection,
  formatIniProxyGroupLine,
  parseNodeUrlLines,
  quoteIniValue,
  resolveBuiltinPolicyGroups,
  sanitizeIniNodeName,
  type BuiltinGeneratorOptions,
} from '../../core/client-shared.js';
import { DEFAULT_RELAY_GROUP, DEFAULT_SELECT_GROUP } from '../../templates/builtin-rules-provider.js';
import { applySurgeBaseConfigOverride, buildVisualRulesAndProviders } from '../../core/visual-rules-builder.js';

interface SurgeProxyResult {
  proxyLine: string;
  wireguardSection?: string;
  clashProxy?: ClashProxy;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function surgeQuote(value: unknown): string {
  return quoteIniValue(value, { emptyForFalsy: true });
}

/**
 * 将 Clash 代理对象转换为 Surge 配置结果
 */
function clashProxyToSurgeResult(proxy: ClashProxy): SurgeProxyResult | null {
  if (!proxy || !proxy.server || !proxy.port) return null;

  const name = sanitizeIniNodeName(proxy.name);
  const type = (proxy.type || '').toLowerCase();
  if (type === 'vless') return null;

  const server = proxy.server;
  const port = proxy.port;

  // 构造参数列表（第一个元素是 "name = type"，后跟位置参数，再跟具名参数）
  const parts: string[] = [];

  if (type === 'ss' || type === 'shadowsocks') {
    // 格式: name = ss, server, port, encrypt-method=xxx, password=xxx
    parts.push(`${name} = ss`);
    parts.push(server);
    parts.push(String(port));
    parts.push(`encrypt-method=${proxy.cipher || 'aes-128-gcm'}`);
    parts.push(`password=${surgeQuote(proxy.password || '')}`);
    // 插件支持 (obfs / v2ray-plugin)
    const plugin = proxy.plugin || '';
    const opts = asRecord(proxy['plugin-opts']) || asRecord(proxy.pluginOpts) || {};

    if (plugin === 'obfs-local' || opts.mode === 'http' || opts.mode === 'tls' || proxy.obfs) {
      const obfsMode = opts.mode || proxy.obfs;
      if (obfsMode) parts.push(`obfs=${obfsMode}`);
      const obfsHost = opts.host || proxy['obfs-host'];
      if (obfsHost) parts.push(`obfs-host=${obfsHost}`);
      const obfsUri = opts.uri || proxy['obfs-uri'];
      if (obfsUri) parts.push(`obfs-uri=${obfsUri}`);
    } else if (plugin === 'v2ray-plugin' || opts.mode === 'websocket') {
      // v2ray-plugin 映射为 Surge 原生 WS 支持
      if (opts.mode === 'websocket' || opts.mode === 'websocket-tls') {
        parts.push('ws=true');
        if (opts.path) parts.push(`ws-path=${surgeQuote(opts.path)}`);
        if (opts.host) parts.push(`ws-headers=Host:${opts.host}`);
        if (opts.tls || opts.mode === 'websocket-tls') parts.push('tls=true');
      }
    }
    // SS UDP 的独立端口（ShadowTLS 场景）
    if (proxy['udp-port']) parts.push(`udp-port=${proxy['udp-port']}`);
    // SS 的 UDP 需要手动开启
    if (proxy.udp) parts.push('udp-relay=true');
  } else if (type === 'vmess') {
    // 格式: name = vmess, server, port, username=uuid
    parts.push(`${name} = vmess`);
    parts.push(server);
    parts.push(String(port));
    parts.push(`username=${proxy.uuid || ''}`);
    // 加密方式
    if (proxy.cipher && proxy.cipher !== 'auto') {
      parts.push(`encrypt-method=${proxy.cipher}`);
    }
    if (proxy.tls) parts.push('tls=true');
    if (proxy.network === 'ws') {
      parts.push('ws=true');
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      if (wsOpts?.path) parts.push(`ws-path=${wsOpts.path}`);
      if (wsHeaders?.Host) parts.push(`ws-headers=Host:${wsHeaders.Host}`);
    }
    // vmess-aead: alterId 为 0 或未指定时默认启用（现代 VMess 标准）
    if (proxy.alterId === 0 || proxy.alterId === undefined || proxy.alterId === null) {
      parts.push('vmess-aead=true');
    }
    // TLS 通用参数
    appendTlsParams(parts, proxy);
  } else if (type === 'trojan') {
    // 格式: name = trojan, server, port, password=xxx
    parts.push(`${name} = trojan`);
    parts.push(server);
    parts.push(String(port));
    parts.push(`password=${surgeQuote(proxy.password || '')}`);
    if (proxy.network === 'ws') {
      parts.push('ws=true');
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      if (wsOpts?.path) parts.push(`ws-path=${wsOpts.path}`);
      if (wsHeaders?.Host) parts.push(`ws-headers=Host:${wsHeaders.Host}`);
    }
    // TLS 通用参数（Trojan 默认走 TLS）
    appendTlsParams(parts, proxy);
  } else if (type === 'hysteria2' || type === 'hy2') {
    // 格式: name = hysteria2, server, port, password=xxx
    // Hysteria2 原生基于 QUIC/UDP，无需 udp-relay 参数
    parts.push(`${name} = hysteria2`);
    parts.push(server);
    parts.push(String(port));
    parts.push(`password=${surgeQuote(proxy.password || '')}`);
    // 带宽限制（可选，单位 Mbps）
    if (proxy['down'] || proxy['download-bandwidth']) {
      parts.push(`download-bandwidth=${proxy['down'] || proxy['download-bandwidth']}`);
    }
    // 端口跳跃（Surge 支持的高级功能）
    if (proxy['port-hopping']) {
      parts.push(`port-hopping=${proxy['port-hopping']}`);
    }
    if (proxy['port-hopping-interval']) {
      parts.push(`port-hopping-interval=${proxy['port-hopping-interval']}`);
    }
    // TLS 通用参数
    // Salamander 混淆 (Surge 用 salamander-password 表达, Mac 6.4.4+ / iOS 5.17.0+)
    if (String(proxy.obfs || '').toLowerCase() === 'salamander' && proxy['obfs-password']) {
      parts.push('salamander-password=' + surgeQuote(proxy['obfs-password']));
    }
    appendTlsParams(parts, proxy);
  } else if (type === 'tuic') {
    // Surge 区分 TUIC v4 (`tuic` + `token`) 与 TUIC v5 (`tuic-v5` + `uuid` + `password`)
    const isTuicV5 = !proxy.token && Boolean(proxy.uuid) && Boolean(proxy.password);
    parts.push(`${name} = ${isTuicV5 ? 'tuic-v5' : 'tuic'}`);
    parts.push(server);
    parts.push(String(port));
    if (isTuicV5) {
      parts.push(`password=${surgeQuote(proxy.password)}`);
      parts.push(`uuid=${surgeQuote(proxy.uuid)}`);
    } else {
      parts.push(`token=${surgeQuote(proxy.token || proxy.uuid || proxy.password || '')}`);
    }
    // alpn（必须与服务端 ALPN 匹配）
    if (proxy.alpn) {
      const alpnStr = Array.isArray(proxy.alpn) ? proxy.alpn[0] : proxy.alpn;
      parts.push(`alpn=${alpnStr}`);
    }
    // 端口跳跃
    if (proxy['port-hopping']) {
      parts.push(`port-hopping=${proxy['port-hopping']}`);
    }
    if (proxy['port-hopping-interval']) {
      parts.push(`port-hopping-interval=${proxy['port-hopping-interval']}`);
    }
    // TLS 通用参数
    appendTlsParams(parts, proxy);
  } else if (type === 'snell') {
    // 格式: name = snell, server, port, psk=xxx, version=x
    parts.push(`${name} = snell`);
    parts.push(server);
    parts.push(String(port));
    parts.push(`psk=${surgeQuote(proxy.psk || proxy.password || '')}`);
    if (proxy.version) parts.push(`version=${proxy.version}`);
    // 连接复用（Snell V4 可选）
    if (proxy.reuse !== undefined) parts.push(`reuse=${proxy.reuse}`);
    if (proxy.tfo !== undefined) parts.push(`tfo=${proxy.tfo}`);
    const obfsOpts = asRecord(proxy['obfs-opts']);
    if (obfsOpts) {
      if (obfsOpts.mode && obfsOpts.mode !== 'none') parts.push(`obfs=${obfsOpts.mode}`);
      if (obfsOpts.host) parts.push(`obfs-host=${obfsOpts.host}`);
      if (obfsOpts.uri) parts.push(`obfs-uri=${obfsOpts.uri}`);
    }
  } else if (type === 'anytls') {
    // 格式: name = anytls, server, port, password=xxx (Surge 5.17+)
    parts.push(`${name} = anytls`);
    parts.push(server);
    parts.push(String(port));
    parts.push(`password=${surgeQuote(proxy.password || '')}`);
    // AnyTLS v2 支持 reuse 参数（默认启用，可设 false 禁用）
    if (proxy.reuse !== undefined) parts.push(`reuse=${proxy.reuse}`);
    // TLS 通用参数
    appendTlsParams(parts, proxy);
  } else if (type === 'wireguard') {
    // WireGuard 在 Surge 中使用独立 section，需要特殊处理
    // 格式: name = wireguard, section-name = WGSectionName
    // 配套一个 [WireGuard WGSectionName] section
    return buildWireGuardResult(name, proxy);
  } else if (type === 'http' || type === 'https') {
    // 格式: name = http/https, server, port, username, password
    parts.push(`${name} = ${type}`);
    parts.push(server);
    parts.push(String(port));
    // HTTP(S) 的用户名和密码是位置参数
    parts.push(String(proxy.username || ''));
    parts.push(String(proxy.password || ''));
    if (type === 'https') appendTlsParams(parts, proxy);
  } else if (type === 'socks5' || type === 'socks5-tls') {
    // 格式: name = socks5/socks5-tls, server, port, username, password
    parts.push(`${name} = ${type}`);
    parts.push(server);
    parts.push(String(port));
    // SOCKS5 的用户名和密码是位置参数
    if (proxy.username || proxy.password) {
      parts.push(String(proxy.username || ''));
      parts.push(String(proxy.password || ''));
    }
    // SOCKS5 的 UDP 需要手动开启
    if (proxy.udp) parts.push('udp-relay=true');
    if (type === 'socks5-tls') appendTlsParams(parts, proxy);
  } else {
    // 不支持的类型
    return null;
  }

  // 链式代理支持
  if (proxy['dialer-proxy']) {
    parts.push(`underlying-proxy=${proxy['dialer-proxy']}`);
  }

  // Shadow TLS 支持
  if (proxy['shadow-tls-password']) {
    parts.push(`shadow-tls-password=${proxy['shadow-tls-password']}`);
    if (proxy['shadow-tls-sni']) parts.push(`shadow-tls-sni=${proxy['shadow-tls-sni']}`);
    if (proxy['shadow-tls-version']) parts.push(`shadow-tls-version=${proxy['shadow-tls-version']}`);
  }

  if (proxy.tfo) {
    // 大多数协议在 Surge 中支持 tfo=true
    // 注意：Snell 已经在上面单独处理过了，这里加一个判断避免重复
    if (type !== 'snell' && !parts.some((p) => p.startsWith('tfo='))) {
      parts.push('tfo=true');
    }
  }

  return { proxyLine: parts.join(', ') };
}

/**
 * 构建 WireGuard 协议的 Surge 配置结果
 * WireGuard 在 Surge 中需要独立的 [WireGuard SectionName] section
 */
function buildWireGuardResult(name: string, proxy: ClashProxy): SurgeProxyResult {
  const sectionName = `WG_${name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')}`;
  return {
    proxyLine: `${name} = wireguard, section-name = ${sectionName}`,
    wireguardSection: buildIniWireGuardSection(proxy, {
      name,
      sectionName,
      defaultDns: '8.8.8.8, 1.1.1.1',
      quoteSingleAllowedIp: true,
      includeClientId: true,
    }),
  };
}

/**
 * 添加 TLS 代理通用参数（skip-cert-verify, sni, alpn, server-cert-fingerprint-sha256）
 */
function appendTlsParams(parts: string[], proxy: ClashProxy): void {
  if (proxy.sni || proxy.servername) {
    parts.push(`sni=${proxy.sni || proxy.servername}`);
  }
  if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) {
    parts.push('skip-cert-verify=true');
  }
  if (proxy['server-cert-fingerprint-sha256']) {
    parts.push(`server-cert-fingerprint-sha256=${proxy['server-cert-fingerprint-sha256']}`);
  }
}

/**
 * 生成完整的内置 Surge 配置
 */
export function generateBuiltinSurgeConfig(nodeList: string, options: BuiltinGeneratorOptions = {}): string {
  const { managedConfigUrl = '', interval = 86400 } = options;
  const nodeUrls = parseNodeUrlLines(nodeList);

  const results: SurgeProxyResult[] = [];
  const proxyNames: string[] = [];

  // 转换为 Clash 代理对象
  const proxies = urlsToClashProxies(nodeUrls, options);

  for (const clashProxy of proxies) {
    const result = clashProxyToSurgeResult(clashProxy);
    if (result) {
      result.clashProxy = clashProxy; // 存储以保留元数据
      results.push(result);
      proxyNames.push(sanitizeIniNodeName(clashProxy.name));
    }
  }

  const usedNames = new Map<string, number>();
  const finalResults: SurgeProxyResult[] = [];
  const finalProxyNames: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const baseName = proxyNames[i];
    const uniqueName = getUniqueName(baseName, usedNames);
    if (uniqueName !== baseName) {
      const updatedResult = { ...results[i] };
      updatedResult.proxyLine = results[i].proxyLine.replace(`${baseName} = `, `${uniqueName} = `);
      const prevWg = results[i].wireguardSection;
      if (updatedResult.wireguardSection && prevWg) {
        updatedResult.wireguardSection = prevWg.replace(
          new RegExp(`WG_${escapeRegExp(baseName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_'))}`, 'g'),
          `WG_${uniqueName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')}`,
        );
      }
      finalResults.push(updatedResult);
      finalProxyNames.push(uniqueName);
    } else {
      finalResults.push(results[i]);
      finalProxyNames.push(baseName);
    }
  }

  if (finalResults.length === 0) {
    return `[General]\nloglevel = notify\n\n[Proxy]\nDIRECT = direct\n\n[Proxy Group]\n\n[Rule]\nFINAL,DIRECT\n`;
  }

  const finalProxyLines = finalResults.map((r) => r.proxyLine);
  const wireguardSections = finalResults
    .map((r) => r.wireguardSection)
    .filter((section): section is string => Boolean(section));

  const sections: string[] = [];
  const managedLine = managedConfigUrl
    ? `#!MANAGED-CONFIG ${managedConfigUrl} interval=${interval} strict=false\n\n`
    : '';

  sections.push(`${managedLine}[General]
loglevel = notify
skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, localhost, *.local
dns-server = 119.29.29.29, 223.5.5.5, system
encrypted-dns-server = https://223.5.5.5/dns-query, https://120.53.53.53/dns-query`);

  sections.push(`[Proxy]\nDIRECT = direct\n${finalProxyLines.join('\n')}`);

  // 构造带元数据的代理对象用于策略分组
  const proxiesForGrouping = finalProxyNames.map((name, index) => ({
    tag: name,
    name: name,
    metadata: finalResults[index].clashProxy?.metadata,
  }));

  const { smartPreset, isRelay, customVisualRules, advancedBaseConfig, proxyGroups } = resolveBuiltinPolicyGroups(
    proxiesForGrouping,
    options,
  );
  const abstractGroups = isRelay ? applyIniRelayGroupPair(proxyGroups, proxiesForGrouping) : proxyGroups;

  const proxyGroupLines = abstractGroups.map((group) => formatIniProxyGroupLine(group));

  sections.push(`[Proxy Group]\n${proxyGroupLines.join('\n')}`);

  const rawRuleLines = buildVisualRulesAndProviders('surge', {
    ...options,
    smartPreset,
    enableRelay: isRelay,
    customVisualRules,
  }).rules;
  const builtinRuleLines = rawRuleLines.filter((line): line is string => typeof line === 'string');
  const ruleLines = [
    '# 基础分流',
    'DOMAIN-SUFFIX,localhost,DIRECT',
    'IP-CIDR,127.0.0.1/8,DIRECT,no-resolve',
    'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve',
    'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
    ...builtinRuleLines,
    `FINAL,${isRelay ? DEFAULT_RELAY_GROUP : DEFAULT_SELECT_GROUP},dns-failed`,
  ];
  sections.push(`[Rule]\n${ruleLines.filter(Boolean).join('\n')}`);

  if (wireguardSections.length > 0) {
    sections.push(wireguardSections.join('\n\n'));
  }

  const finalSections = advancedBaseConfig?.baseConfig?.surge
    ? applySurgeBaseConfigOverride(sections, advancedBaseConfig.baseConfig.surge, managedLine)
    : sections;

  return finalSections.join('\n\n') + '\n';
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
