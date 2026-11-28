import type { RegionGroupNode, RegionPolicyGroup } from '../core/region-groups.js';
import { DNS_PROXY_GROUP, SINGBOX_CN_RULE_SET } from '../security/safe-dns.js';

export interface PinRemoteRuleUrlOptions {
  mirror?: boolean;
  isChinaClient?: boolean;
  preferMrs?: boolean;
  [key: string]: unknown;
}

export type BuiltinRuleEntry =
  | string
  | { type: 'rule-provider'; provider: string; target: string; noResolve?: boolean }
  | { type: 'rule_set'; tag: string; outbound: string }
  | { domain_suffix: string[]; outbound: string }
  | { domain_keyword: string[]; outbound: string }
  | { domain: string[]; outbound: string }
  | { ip_cidr: string[]; outbound: string };

export interface ClashRuleProviderDefinition {
  type: 'http';
  behavior: string;
  url: string;
  path: string;
  interval: number;
  format?: string;
}

export interface SingboxRuleSetDefinition {
  tag: string;
  type: 'remote';
  format: 'binary' | 'source';
  url: string;
  update_interval: string;
  download_detour: string;
}

/**
 * 策略组标准名称常量
 */
export const DEFAULT_SELECT_GROUP = '🚀 节点选择';
export const DEFAULT_RELAY_GROUP = '🌍 总出口';
export const RELAY_CHAIN_GROUP = '🔗 链式代理';
export const RELAY_ENTRY_GROUP = '🔗 中转节点';
export const AUTO_SELECT_GROUP = '♻️ 自动选择';
export const FALLBACK_GROUP = '🔯 故障转移';
export const MANUAL_SELECT_GROUP = '👋 手动切换';

export const AI_SERVICE_RULES = Object.freeze([
  {
    id: 'openai',
    name: 'OpenAI',
    domains: ['openai.com', 'chatgpt.com', 'oaistatic.com', 'oaiusercontent.com', 'auth0.openai.com'],
  },
  {
    id: 'claude',
    name: 'Claude',
    domains: ['anthropic.com', 'claude.ai', 'claude.com', 'claudeusercontent.com', 'anthropicusercontent.com'],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    domains: [
      'gemini.google.com',
      'aistudio.google.com',
      'generativelanguage.googleapis.com',
      'ai.google.dev',
      'makersuite.google.com',
    ],
  },
  {
    id: 'copilot',
    name: 'Copilot',
    domains: ['copilot.microsoft.com', 'githubcopilot.com', 'api.githubcopilot.com'],
  },
  { id: 'grok', name: 'Grok', domains: ['x.ai', 'grok.com', 'grok.x.com'] },
  { id: 'perplexity', name: 'Perplexity', domains: ['perplexity.ai', 'pplx.ai'] },
  { id: 'mistral', name: 'Mistral', domains: ['mistral.ai'] },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    domains: ['deepseek.com', 'chat.deepseek.com', 'api.deepseek.com'],
  },
  {
    id: 'ai-platforms',
    name: 'AI 平台',
    domains: ['poe.com', 'character.ai', 'huggingface.co', 'replicate.com', 'openrouter.ai', 'groq.com', 'cohere.com'],
  },
]);

/**
 * 清理策略组中不存在的成员引用
 */
export function pruneProxyGroups<T extends RegionPolicyGroup>(proxyGroups: T[], proxies: RegionGroupNode[]): T[] {
  const validTargetNames = new Set([
    ...proxies.map((p) => p.tag || p.name),
    ...proxyGroups.map((g) => g.name),
    DEFAULT_SELECT_GROUP,
    DEFAULT_RELAY_GROUP,
    RELAY_CHAIN_GROUP,
    RELAY_ENTRY_GROUP,
    AUTO_SELECT_GROUP,
    FALLBACK_GROUP,
    MANUAL_SELECT_GROUP,
    DNS_PROXY_GROUP,
    'DIRECT',
    'REJECT',
    'REJECT-DROP',
    'ANY',
  ]);

  return proxyGroups.map((group) => {
    if (!Array.isArray(group.proxies)) return group;

    const newProxies = group.proxies.filter((member) => {
      if (member === group.name) return false;
      if (member === DEFAULT_SELECT_GROUP || member === DEFAULT_RELAY_GROUP) {
        return false;
      }
      if (
        typeof member === 'string' &&
        (member.startsWith('(') || member.includes('.*') || member.includes('+') || member.includes('$'))
      ) {
        return true;
      }
      return validTargetNames.has(member);
    });

    const failClosed = String(group.name || '').startsWith('🤖') || group.name === DNS_PROXY_GROUP;
    return {
      ...group,
      proxies: newProxies.length > 0 ? newProxies : [failClosed ? 'REJECT' : 'DIRECT'],
    };
  });
}

/**
 * 远程规则源版本钉死配置
 */
export const PINNED_RULE_REVISIONS = Object.freeze({
  ACL4SSR: '054771ad40c0b40b5e54d98a5d959fbb911aae91',
  SING_GEOSITE: 'e15c5cbcfa72c589fada8dd3de60af9996119f95',
  SING_GEOIP: '66c864fcfe1535549e0658569cb514dbd35756ba',
  BLACKMATRIX: '0b6897dc17e0c513d25449c935a9694818e32f0c',
});

export const ACL4SSR_BASE = `https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/${PINNED_RULE_REVISIONS.ACL4SSR}`;
export const SING_GEOSITE_BASE = `https://raw.githubusercontent.com/SagerNet/sing-geosite/${PINNED_RULE_REVISIONS.SING_GEOSITE}`;
export const SING_GEOIP_BASE = `https://raw.githubusercontent.com/SagerNet/sing-geoip/${PINNED_RULE_REVISIONS.SING_GEOIP}`;
export const GH_PROXY_BASE = 'https://gh-proxy.org/';

const METARULES_BASE = 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release';
export const METARULES_MRS_BASE = 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo';
export const METARULES_SING_GEOIP_BASE = 'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip';
export const GEOX_URLS = Object.freeze({
  geoip: `${METARULES_BASE}/geoip.dat`,
  geosite: `${METARULES_BASE}/geosite.dat`,
  mmdb: `${METARULES_BASE}/country.mmdb`,
  asn: `${METARULES_BASE}/GeoLite2-ASN.mmdb`,
});

/**
 * 解析 Sing-Box GeoIP 规则集下载地址：
 * SagerNet/sing-geoip 仅包含 2 位国家代码（如 cn、us）；private、telegram 等非国家标签改走 MetaCubeX sing 分支。
 */
export function resolveSingboxGeoipRuleSetUrl(tagName: string, options: PinRemoteRuleUrlOptions = {}): string {
  const normalized =
    String(tagName || 'cn')
      .trim()
      .toLowerCase() || 'cn';
  if (!/^[a-z]{2}$/.test(normalized)) {
    return `${METARULES_SING_GEOIP_BASE}/${normalized}.srs`;
  }
  return pinRemoteRuleUrl(`${SING_GEOIP_BASE}/geoip-${normalized}.srs`, options);
}

/**
 * 构建主流 Mihomo 二进制 .mrs 规则提供器定义
 */
export function buildMetaMrsProvider(kind: 'geosite' | 'geoip', name: string): ClashRuleProviderDefinition {
  return {
    type: 'http',
    format: 'mrs',
    behavior: kind === 'geoip' ? 'ipcidr' : 'domain',
    url: `${METARULES_MRS_BASE}/${kind}/${name}.mrs`,
    path: `./ruleset/${kind}-${name}.mrs`,
    interval: 86400,
  };
}

/**
 * 解析远程规则源在客户端侧的实际下载地址。
 */
export function pinRemoteRuleUrl(sourceUrl: string, options: PinRemoteRuleUrlOptions = {}): string {
  const { mirror = true, isChinaClient = false } = options;
  const raw = String(sourceUrl || '').trim();
  if (!/^https?:\/\//i.test(raw)) return sourceUrl;

  try {
    const url = new URL(raw);
    if (!/raw\.githubusercontent\.com$/i.test(url.hostname)) return raw;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 4) return raw;
    const key = `${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`;
    const revisions: Record<string, string> = {
      'acl4ssr/acl4ssr': PINNED_RULE_REVISIONS.ACL4SSR,
      'sagernet/sing-geosite': PINNED_RULE_REVISIONS.SING_GEOSITE,
      'sagernet/sing-geoip': PINNED_RULE_REVISIONS.SING_GEOIP,
      'blackmatrix7/ios_rule_script': PINNED_RULE_REVISIONS.BLACKMATRIX,
    };
    const revision = revisions[key];
    if (revision) {
      parts[2] = revision;
    }

    const [owner, repo, ref, ...rest] = parts;
    if (!owner || !repo || !ref || rest.length === 0) return raw;

    const pinnedTarget = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${rest.join('/')}`;

    if (key === 'acl4ssr/acl4ssr') {
      if (!mirror) return pinnedTarget;
      return isChinaClient ? `${GH_PROXY_BASE}${pinnedTarget}` : pinnedTarget;
    }

    if (mirror) {
      return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${rest.join('/')}`;
    }

    return pinnedTarget;
  } catch {
    return raw;
  }
}

export function getSingboxDnsRuleSet(options: PinRemoteRuleUrlOptions = {}): SingboxRuleSetDefinition {
  return {
    tag: SINGBOX_CN_RULE_SET,
    type: 'remote',
    format: 'binary',
    url: pinRemoteRuleUrl(`${SING_GEOSITE_BASE}/geosite-cn.srs`, options),
    update_interval: '24h',
    download_detour: DNS_PROXY_GROUP,
  };
}
