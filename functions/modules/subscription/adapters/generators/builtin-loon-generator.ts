/**
 * 内置 Loon 配置生成器 (加强版)
 * 不依赖外部 subconverter，直接将节点 URL 转换为高质量 Loon 配置
 *
 * 增强功能：
 * 1. 区域分流 (🇭🇰 香港, 🇯🇵 日本, 🇺🇸 美国等)
 * 2. 自动测速分组
 * 3. 节点与分组图标 (Icon) 支持
 * 4. #!MANAGED-CONFIG 支持
 * 5. 完善的 [General] 与 [Rule] 规则
 */

import type { ClashProxy } from '@misub/core/types.js';
import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import { getUniqueName } from '../../core/name-utils.js';
import {
  applyIniRelayGroupPair,
  formatIniProxyGroupLine,
  parseNodeUrlLines,
  POLICY_GROUP_ICONS,
  QURE_ICON_REPO,
  quoteIniValue,
  resolveBuiltinPolicyGroups,
  sanitizeIniNodeName,
  type BuiltinGeneratorOptions,
} from '../../core/client-shared.js';
import { DEFAULT_RELAY_GROUP, DEFAULT_SELECT_GROUP } from '../../templates/builtin-rules-provider.js';
import { buildVisualRulesAndProviders } from '../../core/visual-rules-builder.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function loonQuote(value: unknown): string {
  return quoteIniValue(value, { emptyForFalsy: false });
}

/**
 * 根据节点名称获取对应的图标 URL
 */
function getIconByNodeName(name: string): string | null {
  if (/港|HK|Hong Kong/i.test(name)) return `${QURE_ICON_REPO}/Hong_Kong.png`;
  if (/台|TW|Taiwan/i.test(name)) return `${QURE_ICON_REPO}/Taiwan.png`;
  if (/日|JP|Japan/i.test(name)) return `${QURE_ICON_REPO}/Japan.png`;
  if (/新|SG|Singapore|狮城/i.test(name)) return `${QURE_ICON_REPO}/Singapore.png`;
  if (/美|US|America/i.test(name)) return `${QURE_ICON_REPO}/United_States.png`;
  if (/韩|KR|Korea/i.test(name)) return `${QURE_ICON_REPO}/South_Korea.png`;
  if (/英|UK|Great Britain/i.test(name)) return `${QURE_ICON_REPO}/United_Kingdom.png`;
  if (/德|DE|Germany/i.test(name)) return `${QURE_ICON_REPO}/Germany.png`;
  if (/法|FR|France/i.test(name)) return `${QURE_ICON_REPO}/France.png`;
  if (/俄|RU|Russia/i.test(name)) return `${QURE_ICON_REPO}/Russia.png`;
  return null;
}

/**
 * 将 Clash 代理对象转换为 Loon [Proxy] 行
 */
function clashProxyToLoonResult(proxy: ClashProxy): string | null {
  if (!proxy || !proxy.server || !proxy.port) return null;

  const name = sanitizeIniNodeName(proxy.name);
  const type = (proxy.type || '').toLowerCase();
  const server = proxy.server;
  const port = proxy.port;

  const parts: string[] = [];

  if (type === 'ss' || type === 'shadowsocks') {
    parts.push(`${name} = Shadowsocks`);
    parts.push(server);
    parts.push(String(port));
    parts.push(String(proxy.cipher || 'aes-128-gcm'));
    parts.push(loonQuote(proxy.password || ''));

    if (proxy.udp) parts.push('udp-relay=true');

    // 插件支持
    const plugin = proxy.plugin || '';
    const opts = asRecord(proxy['plugin-opts']) || asRecord(proxy.pluginOpts) || {};

    if (plugin === 'obfs-local' || proxy.obfs) {
      parts.push(`obfs-name=${proxy.obfs || opts.mode}`);
      const host = proxy['obfs-host'] || opts.host;
      if (host) parts.push(`obfs-host=${loonQuote(host)}`);
      const uri = proxy['obfs-uri'] || opts.uri;
      if (uri) parts.push(`obfs-uri=${loonQuote(uri)}`);
    } else if (plugin === 'v2ray-plugin' || opts.mode === 'websocket') {
      // v2ray-plugin 在 Loon 中映射为 transport=ws
      parts.push('transport=ws');
      if (opts.path) parts.push(`path=${loonQuote(opts.path)}`);
      if (opts.host) parts.push(`host=${loonQuote(opts.host)}`);
      if (opts.tls || opts.mode === 'websocket-tls') parts.push('over-tls=true');
    }
  } else if (type === 'vmess') {
    parts.push(`${name} = vmess`);
    parts.push(server);
    parts.push(String(port));
    parts.push(String(proxy.cipher || 'auto'));
    parts.push(`"${proxy.uuid || ''}"`);

    // 官方文档 VMess WS 示例中包含了 alterId=0
    parts.push('alterId=0');

    if (proxy.tls) parts.push('over-tls=true');
    if (proxy.network === 'ws') {
      parts.push('transport=ws');
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      if (wsOpts?.path) parts.push(`path=${loonQuote(wsOpts.path)}`);
      if (wsHeaders?.Host) parts.push(`host=${loonQuote(wsHeaders.Host)}`);
    }
    appendTlsParams(parts, proxy);
  } else if (type === 'vless') {
    parts.push(`${name} = vless`);
    parts.push(server);
    parts.push(String(port));
    parts.push(`"${proxy.uuid || ''}"`);

    if (proxy.flow) {
      parts.push(`flow=${loonQuote(proxy.flow)}`);
    }

    if (proxy.network) {
      parts.push(`transport=${proxy.network}`);

      if (proxy.network === 'ws') {
        const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
        const wsHeaders = asRecord(wsOpts?.headers);
        if (wsOpts?.path) parts.push(`path=${loonQuote(wsOpts.path)}`);
        if (wsHeaders?.Host) parts.push(`host=${loonQuote(wsHeaders.Host)}`);
      } else if (proxy.network === 'grpc') {
        const grpcOpts = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts);
        if (grpcOpts?.['grpc-service-name'])
          parts.push(`grpc-service-name=${loonQuote(grpcOpts['grpc-service-name'])}`);
      } else if (proxy.network === 'xhttp') {
        const xhttpOpts = asRecord(proxy['xhttp-opts']) || asRecord(proxy.xhttpOpts);
        if (xhttpOpts?.path) parts.push(`path=${loonQuote(xhttpOpts.path)}`);
        if (xhttpOpts?.host) parts.push(`host=${loonQuote(xhttpOpts.host)}`);
        if (xhttpOpts?.mode) parts.push(`mode=${loonQuote(xhttpOpts.mode)}`);
      }
    } else {
      // VLESS 官方文档中常用 transport=tcp
      parts.push('transport=tcp');
    }

    if (proxy.tls || proxy.security === 'reality') {
      parts.push('over-tls=true');
      const realityOpts = asRecord(proxy['reality-opts']) || asRecord(proxy.realityOpts);
      if (realityOpts) {
        parts.push('reality=true');
        if (realityOpts['public-key']) parts.push(`public-key=${loonQuote(realityOpts['public-key'])}`);
        if (realityOpts['short-id']) parts.push(`short-id=${loonQuote(realityOpts['short-id'])}`);
      }
    }
    appendTlsParams(parts, proxy);
  } else if (type === 'trojan') {
    parts.push(`${name} = trojan`);
    parts.push(server);
    parts.push(String(port));
    parts.push(loonQuote(proxy.password || ''));

    // 深度审计：官方文档 Trojan WS 示例并没有 over-tls=true
    // Trojan 本身即为 TLS 协议，手动添加可能导致二次包裹错误

    if (proxy.network === 'ws') {
      parts.push('transport=ws');
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      if (wsOpts?.path) parts.push(`path=${loonQuote(wsOpts.path)}`);
      if (wsHeaders?.Host) parts.push(`host=${loonQuote(wsHeaders.Host)}`);
    }
    appendTlsParams(parts, proxy);
  } else if (type === 'hysteria2' || type === 'hy2') {
    parts.push(`${name} = hysteria2`);
    parts.push(server);
    parts.push(String(port));
    parts.push(loonQuote(proxy.password || ''));
    if (String(proxy.obfs || '').toLowerCase() === 'salamander' && proxy['obfs-password']) {
      parts.push(`salamander-password=${loonQuote(proxy['obfs-password'])}`);
    }
    const downVal = Number.parseInt(String(proxy.down || proxy['download-bandwidth'] || ''), 10);
    if (Number.isFinite(downVal) && downVal > 0) {
      parts.push(`download-bandwidth=${downVal}`);
    }
    appendTlsParams(parts, proxy);
  } else if (type === 'tuic') {
    parts.push(`${name} = tuic`);
    parts.push(server);
    parts.push(String(port));
    parts.push(loonQuote(proxy.token || proxy.uuid || ''));
    if (proxy.password) parts.push(`password=${loonQuote(proxy.password)}`);
    appendTlsParams(parts, proxy);
  } else if (type === 'wireguard') {
    parts.push(`${name} = wireguard`);
    parts.push(server);
    parts.push(String(port));
    parts.push(String(proxy['private-key'] || ''));
    if (proxy.ip) {
      const ipAddr = Array.isArray(proxy.ip) ? proxy.ip[0] : proxy.ip;
      parts.push(`self-ip=${ipAddr}`);
    }
    if (proxy['public-key']) parts.push(`public-key=${proxy['public-key']}`);
    if (proxy.mtu) parts.push(`mtu=${proxy.mtu}`);
    if (proxy.reserved) {
      const reserved = Array.isArray(proxy.reserved) ? proxy.reserved.join('/') : proxy.reserved;
      parts.push(`client-id=${reserved}`);
    }
  } else if (type === 'anytls') {
    parts.push(`${name} = anytls`);
    parts.push(server);
    parts.push(String(port));
    parts.push(loonQuote(proxy.password || ''));
    appendTlsParams(parts, proxy);
  } else if (type === 'snell') {
    parts.push(`${name} = snell`);
    parts.push(server);
    parts.push(String(port));
    if (proxy.psk || proxy.password) parts.push(`psk=${loonQuote(proxy.psk || proxy.password)}`);
    if (proxy.version) parts.push(`version=${proxy.version}`);
    if (proxy.reuse !== undefined) parts.push(`reuse=${proxy.reuse}`);
    if (proxy.tfo !== undefined) parts.push(`tfo=${proxy.tfo}`);
    const obfsOpts = asRecord(proxy['obfs-opts']);
    if (obfsOpts) {
      if (obfsOpts.mode && obfsOpts.mode !== 'none') parts.push(`obfs=${loonQuote(obfsOpts.mode)}`);
      if (obfsOpts.host) parts.push(`obfs-host=${loonQuote(obfsOpts.host)}`);
    }
  } else {
    return null;
  }

  if (proxy.tfo) {
    // Loon 大部分节点使用 fast-open=true
    // 注意：Snell 在上面已经处理过 tfo= 了，这里避免冲突
    if (type !== 'snell' && !parts.some((p) => p.startsWith('fast-open=') || p.startsWith('tfo='))) {
      parts.push('fast-open=true');
    }
  }

  // 添加节点图标
  const iconUrl = getIconByNodeName(proxy.name);
  if (iconUrl) {
    parts.push(`icon=${iconUrl}`);
  }

  return parts.join(', ');
}

function appendTlsParams(parts: string[], proxy: ClashProxy): void {
  if (proxy.sni || proxy.servername) {
    parts.push(`sni=${loonQuote(proxy.sni || proxy.servername)}`);
  }
  if (proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true) {
    parts.push('skip-cert-verify=true');
  }
  if (proxy.alpn) {
    const alpnStr = Array.isArray(proxy.alpn) ? proxy.alpn[0] : proxy.alpn;
    parts.push(`alpn=${loonQuote(alpnStr)}`);
  }
  if (proxy['client-fingerprint']) {
    parts.push(`client-fingerprint=${loonQuote(proxy['client-fingerprint'])}`);
  }
}

/**
 * 生成内置 Loon 配置
 */
export function generateBuiltinLoonConfig(nodeList: string, options: BuiltinGeneratorOptions = {}): string {
  const { managedConfigUrl = '', interval = 86400 } = options;
  const nodeUrls = parseNodeUrlLines(nodeList);

  const proxyLines: string[] = [];
  const proxiesWithMetadata: ClashProxy[] = [];
  const usedNames = new Map<string, number>();

  // 转换为 Clash 代理对象
  const proxies = urlsToClashProxies(nodeUrls, options);

  for (const clashProxy of proxies) {
    const baseName = sanitizeIniNodeName(clashProxy.name);
    clashProxy.name = getUniqueName(baseName, usedNames);

    const line = clashProxyToLoonResult(clashProxy);
    if (line) {
      proxyLines.push(line);
      proxiesWithMetadata.push(clashProxy);
    }
  }

  if (proxyLines.length === 0) {
    return `[Proxy]\nDIRECT = direct\n`;
  }

  const sections: string[] = [];
  if (managedConfigUrl) {
    sections.push(`#!MANAGED-CONFIG ${managedConfigUrl} interval=${interval} strict=false`);
  }

  sections.push(`[General]
ipv6 = false
dns-server = system, 223.5.5.5, 119.29.29.29
doh-server = https://223.5.5.5/dns-query, https://120.53.53.53/dns-query
geoip-url = https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country.mmdb
skip-proxy = 127.0.0.1, 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, 100.64.0.0/10, localhost, *.local
proxy-test-url = http://www.gstatic.com/generate_204
resource-parser = https://raw.githubusercontent.com/sub-store-org/Sub-Store/master/scripts/sub-store-parser.js`);

  sections.push(`[Proxy]\nDIRECT = direct\n${proxyLines.join('\n')}`);

  const { smartPreset, isRelay, customVisualRules, proxyGroups } = resolveBuiltinPolicyGroups(
    proxiesWithMetadata,
    options,
  );
  const abstractGroups = isRelay ? applyIniRelayGroupPair(proxyGroups, proxiesWithMetadata) : proxyGroups;

  const proxyGroupLines = abstractGroups.map((group) =>
    formatIniProxyGroupLine(group, { iconMap: POLICY_GROUP_ICONS }),
  );

  sections.push(`[Proxy Group]\n${proxyGroupLines.join('\n')}`);

  const rawRuleLines = buildVisualRulesAndProviders('loon', {
    ...options,
    smartPreset,
    enableRelay: isRelay,
    customVisualRules,
  }).rules;
  const builtinRuleLines = rawRuleLines.filter((line): line is string => typeof line === 'string');
  const ruleLines = [
    '# 基础分流',
    'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve',
    'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
    ...builtinRuleLines,
    `FINAL,${isRelay ? DEFAULT_RELAY_GROUP : DEFAULT_SELECT_GROUP}`,
  ];
  sections.push(`[Rule]\n${ruleLines.filter(Boolean).join('\n')}`);

  return sections.join('\n\n') + '\n';
}
