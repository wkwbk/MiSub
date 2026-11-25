/**
 * 内置 Quantumult X 配置生成器
 * 输出格式对齐项目中的 Quantumult X parser，确保可解析回节点 URL。
 */

import type { ClashProxy } from '@misub/core/types.js';
import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import { getUniqueName } from '../../core/name-utils.js';
import {
  buildQuanxProxyLine,
  parseNodeUrlLines,
  POLICY_GROUP_ICONS,
  resolveBuiltinPolicyGroups,
  sanitizeIniNodeName,
  type BuiltinGeneratorOptions,
} from '../../core/client-shared.js';
import { getBuiltinRules } from '../../templates/builtin-rules-provider.js';

export function generateBuiltinQuanxConfig(nodeList: string, options: BuiltinGeneratorOptions = {}): string {
  const { managedConfigUrl = '', interval = 86400 } = options;
  const nodeUrls = parseNodeUrlLines(nodeList);

  const proxyLines: string[] = [];
  const proxiesWithMetadata: ClashProxy[] = [];
  const usedNames = new Map<string, number>();

  const proxies = urlsToClashProxies(nodeUrls, options);

  for (const clashProxy of proxies) {
    const baseName = sanitizeIniNodeName(clashProxy.name, { stripQuotesAndSemicolon: true });
    clashProxy.name = getUniqueName(baseName, usedNames);

    const line = buildQuanxProxyLine(clashProxy, { sanitizeTag: true, includeFastOpen: true });
    if (!line) continue;

    proxyLines.push(line);
    proxiesWithMetadata.push(clashProxy);
  }

  if (proxyLines.length === 0) {
    const header = managedConfigUrl ? `#!MANAGED-CONFIG ${managedConfigUrl} interval=${interval} strict=false\n\n` : '';
    return `${header}[general]\nserver_check_url = http://www.gstatic.com/generate_204\nexcluded_routes = 192.168.0.0/16, 172.16.0.0/12, 100.64.0.0/10, 10.0.0.0/8\n\n[dns]\nno-ipv6\nserver = 223.5.5.5\nserver = 119.29.29.29\n\n[server_remote]\n\n[server_local]\n\n[rewrite_remote]\n\n[rewrite_local]\n\n[mitm]\n`;
  }

  const sections: string[] = [];
  if (managedConfigUrl) {
    sections.push(`#!MANAGED-CONFIG ${managedConfigUrl} interval=${interval} strict=false`);
  }

  sections.push(
    `[general]\nserver_check_url = http://www.gstatic.com/generate_204\nexcluded_routes = 192.168.0.0/16, 172.16.0.0/12, 100.64.0.0/10, 10.0.0.0/8`,
  );
  sections.push(`[dns]\nno-ipv6\nserver = 223.5.5.5\nserver = 119.29.29.29`);
  sections.push(`[server_remote]`);
  sections.push(`[server_local]\n${proxyLines.join('\n')}`);

  const { levelKey, proxyGroups: abstractGroups } = resolveBuiltinPolicyGroups(proxiesWithMetadata, options, {
    allowVisualRules: false,
  });

  const groupLines = abstractGroups.map((group) => {
    const normalizePolicyMember = (member: string): string => {
      const upper = String(member || '').toUpperCase();
      if (upper === 'DIRECT') return 'direct';
      if (upper === 'REJECT' || upper === 'REJECT-DROP') return 'reject';
      return member;
    };

    let type = 'static';
    if (group.type === 'url-test') type = 'url-latency-benchmark';
    if (group.type === 'fallback') type = 'available';

    const members = group.proxies.map(normalizePolicyMember).join(', ');
    const icon = POLICY_GROUP_ICONS[group.name] ? `, img-url=${POLICY_GROUP_ICONS[group.name]}` : '';
    const extra = type === 'url-latency-benchmark' ? ', check-interval=300, tolerance=50' : '';
    return `${type}=${group.name}, ${members}${extra}${icon}`;
  });

  sections.push(`[policy]\n${groupLines.join('\n')}`);

  const rawRules = getBuiltinRules(levelKey, 'quanx', options).filter(
    (rule): rule is string => typeof rule === 'string',
  );
  const remoteRules = rawRules
    .filter((r) => r.startsWith('filter_remote'))
    .map((r) => r.replace(/^filter_remote,\s*/i, ''));
  const localRules = rawRules
    .filter((r) => !r.startsWith('filter_remote'))
    .map((rule) =>
      rule
        .replace(/^HOST-SUFFIX/i, 'host-suffix')
        .replace(/^HOST-KEYWORD/i, 'host-keyword')
        .replace(/^HOST,/i, 'host,')
        .replace(/^IP-CIDR/i, 'ip-cidr')
        .replace(/^GEOIP/i, 'geoip')
        .replace(/^FINAL/i, 'final')
        .replace(/,\s*DIRECT\b/g, ', direct')
        .replace(/,\s*REJECT\b/g, ', reject'),
    );

  const localRuleLines = [
    '; 基础分流',
    'host-suffix, localhost, direct',
    'host-suffix, local, direct',
    'ip-cidr, 127.0.0.0/8, direct',
    'ip-cidr, 10.0.0.0/8, direct',
    'ip-cidr, 100.64.0.0/10, direct',
    'ip-cidr, 172.16.0.0/12, direct',
    'ip-cidr, 192.168.0.0/16, direct',
    ...localRules,
  ];

  sections.push(`[filter_remote]\n${remoteRules.join('\n')}`);
  sections.push(`[filter_local]\n${localRuleLines.filter(Boolean).join('\n')}`);
  sections.push(`[rewrite_remote]`);
  sections.push(`[rewrite_local]`);
  sections.push(`[mitm]`);

  return sections.join('\n\n') + '\n';
}
