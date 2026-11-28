/**
 * 可视化分流规则目录与预设定义（前后端共享）
 */

import type {
  AdvancedBaseConfig,
  CustomVisualRule,
  CustomVisualRulesConfig,
  NormalizedCustomVisualRules,
} from '../types.js';

export interface VisualRuleCategory {
  id: string;
  emoji: string;
  labelZh: string;
  labelEn: string;
  groupName: string;
  defaultAction: 'proxy' | 'direct' | 'reject';
  geosite: readonly string[];
  geoip?: readonly string[];
  domains?: readonly string[];
  ipCidrs?: readonly string[];
  clashProvider?: string;
  surgeList?: string;
}

export const VISUAL_RULE_CATEGORIES: readonly VisualRuleCategory[] = Object.freeze([
  {
    id: 'ad_block',
    emoji: '🛑',
    labelZh: '广告拦截',
    labelEn: 'Ad Block',
    groupName: '🛑 广告拦截',
    defaultAction: 'reject',
    geosite: ['category-ads-all'],
    clashProvider: 'ACL4SSR/Clash/BanAD.list',
    surgeList: 'ACL4SSR/Clash/BanAD.list',
  },
  {
    id: 'ai_services',
    emoji: '💬',
    labelZh: 'AI 服务',
    labelEn: 'AI Services',
    groupName: '💬 AI 服务',
    defaultAction: 'proxy',
    geosite: ['openai', 'anthropic', 'google-gemini'],
    domains: [
      'chatgpt.com',
      'openai.com',
      'claude.ai',
      'anthropic.com',
      'gemini.google.com',
      'perplexity.ai',
      'x.ai',
      'grok.com',
    ],
    clashProvider: 'ACL4SSR/Clash/Providers/Ruleset/OpenAi.yaml',
    surgeList: 'ACL4SSR/Clash/Ruleset/OpenAi.list',
  },
  {
    id: 'bilibili',
    emoji: '📺',
    labelZh: '哔哩哔哩',
    labelEn: 'Bilibili',
    groupName: '📺 哔哩哔哩',
    defaultAction: 'direct',
    geosite: ['bilibili'],
    clashProvider: 'ACL4SSR/Clash/Providers/Ruleset/Bilibili.yaml',
    surgeList: 'ACL4SSR/Clash/Ruleset/Bilibili.list',
  },
  {
    id: 'youtube',
    emoji: '📹',
    labelZh: '油管视频',
    labelEn: 'YouTube',
    groupName: '📹 油管视频',
    defaultAction: 'proxy',
    geosite: ['youtube'],
    clashProvider: 'ACL4SSR/Clash/Providers/Ruleset/YouTube.yaml',
    surgeList: 'ACL4SSR/Clash/Ruleset/YouTube.list',
  },
  {
    id: 'google',
    emoji: '🔍',
    labelZh: '谷歌服务',
    labelEn: 'Google',
    groupName: '🔍 谷歌服务',
    defaultAction: 'proxy',
    geosite: ['google'],
    clashProvider: 'ACL4SSR/Clash/Providers/Ruleset/Google.yaml',
    surgeList: 'ACL4SSR/Clash/Ruleset/Google.list',
  },
  {
    id: 'private',
    emoji: '🏠',
    labelZh: '私有网络',
    labelEn: 'Private',
    groupName: '🏠 私有网络',
    defaultAction: 'direct',
    geosite: ['private'],
    geoip: ['private'],
    domains: ['localhost', 'local'],
    ipCidrs: ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
    clashProvider: 'ACL4SSR/Clash/LocalAreaNetwork.list',
    surgeList: 'ACL4SSR/Clash/LocalAreaNetwork.list',
  },
  {
    id: 'cn_services',
    emoji: '🔒',
    labelZh: '国内服务',
    labelEn: 'CN Services',
    groupName: '🔒 国内服务',
    defaultAction: 'direct',
    geosite: ['cn'],
    geoip: ['cn'],
    clashProvider: 'ACL4SSR/Clash/ChinaDomain.list',
    surgeList: 'ACL4SSR/Clash/ChinaDomain.list',
  },
  {
    id: 'telegram',
    emoji: '📲',
    labelZh: '电报消息',
    labelEn: 'Telegram',
    groupName: '📲 电报消息',
    defaultAction: 'proxy',
    geosite: ['telegram'],
    geoip: ['telegram'],
    clashProvider: 'ACL4SSR/Clash/Providers/Ruleset/Telegram.yaml',
    surgeList: 'ACL4SSR/Clash/Ruleset/Telegram.list',
  },
  {
    id: 'github',
    emoji: '🐱',
    labelZh: 'Github',
    labelEn: 'GitHub',
    groupName: '🐱 Github',
    defaultAction: 'proxy',
    geosite: ['github'],
    domains: ['github.com', 'githubusercontent.com', 'githubassets.com'],
    clashProvider: 'ACL4SSR/Clash/Providers/Ruleset/Github.yaml',
    surgeList: 'ACL4SSR/Clash/Ruleset/Github.list',
  },
  {
    id: 'microsoft',
    emoji: 'Ⓜ️',
    labelZh: '微软服务',
    labelEn: 'Microsoft',
    groupName: 'Ⓜ️ 微软服务',
    defaultAction: 'direct',
    geosite: ['microsoft'],
    clashProvider: 'ACL4SSR/Clash/Providers/Ruleset/Microsoft.yaml',
    surgeList: 'ACL4SSR/Clash/Ruleset/Microsoft.list',
  },
  {
    id: 'apple',
    emoji: '🍏',
    labelZh: '苹果服务',
    labelEn: 'Apple',
    groupName: '🍏 苹果服务',
    defaultAction: 'direct',
    geosite: ['apple'],
    clashProvider: 'ACL4SSR/Clash/Providers/Ruleset/Apple.yaml',
    surgeList: 'ACL4SSR/Clash/Ruleset/Apple.list',
  },
  {
    id: 'social_media',
    emoji: '🌐',
    labelZh: '社交媒体',
    labelEn: 'Social Media',
    groupName: '🌐 社交媒体',
    defaultAction: 'proxy',
    geosite: ['twitter', 'facebook', 'instagram', 'tiktok'],
    domains: ['x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'reddit.com', 'discord.com'],
    clashProvider: 'ACL4SSR/Clash/Providers/ProxyGFWlist.yaml',
    surgeList: 'ACL4SSR/Clash/ProxyGFWlist.list',
  },
  {
    id: 'streaming',
    emoji: '🎬',
    labelZh: '流媒体',
    labelEn: 'Streaming',
    groupName: '🎬 流媒体',
    defaultAction: 'proxy',
    geosite: ['netflix', 'disney', 'spotify'],
    clashProvider: 'ACL4SSR/Clash/Providers/Ruleset/Netflix.yaml',
    surgeList: 'ACL4SSR/Clash/Ruleset/Netflix.list',
  },
  {
    id: 'gaming',
    emoji: '🎮',
    labelZh: '游戏平台',
    labelEn: 'Gaming',
    groupName: '🎮 游戏平台',
    defaultAction: 'direct',
    geosite: ['steam', 'epicgames'],
    clashProvider: 'ACL4SSR/Clash/Providers/Ruleset/SteamCN.yaml',
    surgeList: 'ACL4SSR/Clash/Ruleset/SteamCN.list',
  },
  {
    id: 'education',
    emoji: '📚',
    labelZh: '教育资源',
    labelEn: 'Education',
    groupName: '📚 教育资源',
    defaultAction: 'direct',
    geosite: ['category-scholar-!cn', 'category-scholar-cn'],
    domains: ['coursera.org', 'edx.org', 'arxiv.org', 'ieee.org', 'scholar.google.com'],
  },
  {
    id: 'finance',
    emoji: '💰',
    labelZh: '金融服务',
    labelEn: 'Finance',
    groupName: '💰 金融服务',
    defaultAction: 'proxy',
    geosite: ['paypal'],
    domains: ['paypal.com', 'stripe.com', 'wise.com', 'binance.com', 'okx.com'],
  },
  {
    id: 'cloud',
    emoji: '☁️',
    labelZh: '云服务',
    labelEn: 'Cloud Services',
    groupName: '☁️ 云服务',
    defaultAction: 'proxy',
    geosite: ['cloudflare', 'aws'],
    domains: ['cloudflare.com', 'amazonaws.com', 'digitalocean.com', 'vercel.com'],
  },
  {
    id: 'non_cn',
    emoji: '🌍',
    labelZh: '非中国',
    labelEn: 'Non-CN',
    groupName: '🌍 非中国',
    defaultAction: 'proxy',
    geosite: ['geolocation-!cn'],
    clashProvider: 'ACL4SSR/Clash/Providers/ProxyLite.yaml',
    surgeList: 'ACL4SSR/Clash/ProxyLite.list',
  },
]);

export const VISUAL_RULE_MAP: Readonly<Record<string, VisualRuleCategory>> = Object.freeze(
  Object.fromEntries(VISUAL_RULE_CATEGORIES.map((item) => [item.id, item])),
);

export const VISUAL_RULE_PRESETS: Readonly<Record<'minimal' | 'balanced' | 'full', readonly string[]>> = Object.freeze({
  minimal: ['private', 'cn_services', 'non_cn'],
  balanced: ['ai_services', 'youtube', 'google', 'private', 'cn_services', 'telegram', 'github', 'non_cn'],
  full: VISUAL_RULE_CATEGORIES.map((item) => item.id),
});

export function getSmartPresetRuleIds(preset?: string): string[] {
  const normalized = String(preset || 'balanced')
    .trim()
    .toLowerCase();
  if (normalized === 'minimal') return [...VISUAL_RULE_PRESETS.minimal];
  if (normalized === 'full') return [...VISUAL_RULE_PRESETS.full];
  return [...VISUAL_RULE_PRESETS.balanced];
}

export const DEFAULT_CUSTOM_VISUAL_RULES: CustomVisualRulesConfig = Object.freeze({
  customRules: [],
  groupByCountry: true,
  includeAutoSelect: true,
});

export const DEFAULT_ADVANCED_BASE_CONFIG: Readonly<AdvancedBaseConfig> = Object.freeze({
  enableClashApi: false,
  externalController: '0.0.0.0:9090',
  externalUiDownloadUrl: '',
  baseConfig: {
    singbox: '',
    clash: '',
    surge: '',
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function detectVisualRulePreset(selectedRules: unknown[] = []): 'minimal' | 'balanced' | 'full' | 'custom' {
  const normalized = new Set(
    Array.isArray(selectedRules)
      ? selectedRules.filter((id): id is string => typeof id === 'string' && Boolean(VISUAL_RULE_MAP[id]))
      : [],
  );
  for (const [presetKey, presetList] of Object.entries(VISUAL_RULE_PRESETS)) {
    if (presetList.length === normalized.size && presetList.every((id) => normalized.has(id))) {
      return presetKey as 'minimal' | 'balanced' | 'full';
    }
  }
  return 'custom';
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export interface NormalizeCustomVisualRulesOptions {
  smartPreset?: string;
  allowEmptyName?: boolean;
}

export function normalizeCustomRule(raw: unknown, options: { allowEmptyName?: boolean } = {}): CustomVisualRule | null {
  if (!isRecord(raw)) return null;
  const rawName = typeof raw.name === 'string' ? raw.name : String(raw.name || '');
  const name = options.allowEmptyName ? rawName : rawName.trim();
  if (!options.allowEmptyName && !name) return null;
  const rawAction = String(raw.action || 'proxy')
    .trim()
    .toLowerCase();
  const action: CustomVisualRule['action'] =
    rawAction === 'proxy' || rawAction === 'direct' || rawAction === 'reject' ? rawAction : 'proxy';
  return {
    name,
    action,
    domainSuffix: normalizeStringList(raw.domainSuffix ?? raw.domain_suffix),
    domainKeyword: normalizeStringList(raw.domainKeyword ?? raw.domain_keyword),
    ipCidr: normalizeStringList(raw.ipCidr ?? raw.ip_cidr),
    srcIpCidr: normalizeStringList(raw.srcIpCidr ?? raw.src_ip_cidr),
    ruleSet: normalizeStringList(raw.ruleSet ?? raw.rule_set ?? raw.site),
  };
}

export function normalizeCustomVisualRules(
  raw: unknown = {},
  options: NormalizeCustomVisualRulesOptions = {},
): NormalizedCustomVisualRules {
  const input = isRecord(raw) ? raw : {};
  const selectedRules = Array.isArray(input.selectedRules)
    ? Array.from(
        new Set(
          input.selectedRules.filter((id): id is string => typeof id === 'string' && Boolean(VISUAL_RULE_MAP[id])),
        ),
      )
    : getSmartPresetRuleIds(options.smartPreset);
  const customRules = Array.isArray(input.customRules)
    ? input.customRules
        .map((item) => normalizeCustomRule(item, { allowEmptyName: options.allowEmptyName }))
        .filter((rule): rule is CustomVisualRule => Boolean(rule))
    : [];

  return {
    selectedRules,
    customRules,
    groupByCountry: input.groupByCountry !== false,
    includeAutoSelect: input.includeAutoSelect !== false,
  };
}

export function normalizeAdvancedBaseConfig(raw: unknown = {}): AdvancedBaseConfig {
  const input = isRecord(raw) ? raw : {};
  const rawBase = isRecord(input.baseConfig) ? input.baseConfig : {};

  return {
    enableClashApi: Boolean(input.enableClashApi),
    externalController:
      String(input.externalController || DEFAULT_ADVANCED_BASE_CONFIG.externalController).trim() || '0.0.0.0:9090',
    externalUiDownloadUrl: String(input.externalUiDownloadUrl || '').trim(),
    baseConfig: {
      singbox: typeof rawBase.singbox === 'string' ? rawBase.singbox : '',
      clash: typeof rawBase.clash === 'string' ? rawBase.clash : '',
      surge: typeof rawBase.surge === 'string' ? rawBase.surge : '',
    },
  };
}
