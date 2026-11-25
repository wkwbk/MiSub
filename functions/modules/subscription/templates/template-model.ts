import type { ClashProxy } from '@misub/core/types.js';

export interface TemplateMeta {
  name: string;
  source: string;
  target: string;
  ruleLevel: string;
  isMeta: boolean;
}

export type TemplateProxy = ClashProxy & {
  tag?: string;
  'dialer-proxy'?: string;
};

export interface TemplateGroup {
  name: string;
  type: string;
  members: string[];
  filters?: string[];
  options?: Record<string, unknown>;
  hidden?: boolean;
  [key: string]: unknown;
}

export interface TemplateRuleObject {
  type?: string;
  value?: string;
  policy?: string;
  source?: string;
  extras?: string[];
  raw?: string;
  rule?: string;
  provider?: string;
  tag?: string;
  target?: string;
  outbound?: string;
  noResolve?: boolean;
  [key: string]: unknown;
}

export type TemplateRule = string | TemplateRuleObject;

export interface ChainProxyConfig {
  group?: string;
  entry?: string;
  prefix?: string;
}

export interface RegionOverrideRule {
  pattern: string;
  region: string;
  flags?: string;
}

export interface TemplateSettings {
  managedConfigUrl: string;
  interval: number;
  skipCertVerify: boolean;
  enableUdp: boolean;
  customDnsOverride: string;
  dnsMode: string;
  regionOverrides: RegionOverrideRule[];
  isChinaClient?: boolean;
  [key: string]: unknown;
}

export interface TemplateExtras {
  chainProxy?: ChainProxyConfig[];
  rulesets?: Array<{
    group?: string;
    url?: string;
    rules?: string[];
    [key: string]: unknown;
  }>;
  rawSections?: Record<string, string[]>;
  [key: string]: unknown;
}

export interface UnifiedTemplateModel {
  meta: TemplateMeta;
  proxies: TemplateProxy[];
  groups: TemplateGroup[];
  rules: TemplateRule[];
  settings: TemplateSettings;
  extras: TemplateExtras;
}

export interface ShadowrocketClashGroup {
  name?: string;
  type?: string;
  proxies?: string[];
  hidden?: boolean;
  url?: string;
  interval?: number;
  tolerance?: number;
  timeout?: number;
  [key: string]: unknown;
}

export interface ShadowrocketClashSource {
  proxies?: ClashProxy[];
  'proxy-groups'?: ShadowrocketClashGroup[];
  rules?: Array<string | TemplateRuleObject>;
  'rule-providers'?: Record<string, { url?: string; format?: string; [key: string]: unknown }>;
  dns?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UnifiedTemplateModelInput {
  meta?: Partial<TemplateMeta>;
  proxies?: TemplateProxy[];
  groups?: TemplateGroup[];
  rules?: TemplateRule[];
  settings?: Partial<TemplateSettings>;
  extras?: TemplateExtras;
}

export function createUnifiedTemplateModel(input: UnifiedTemplateModelInput = {}): UnifiedTemplateModel {
  return {
    meta: {
      name: input.meta?.name || 'MiSub',
      source: input.meta?.source || 'builtin',
      target: input.meta?.target || 'clash',
      ruleLevel: input.meta?.ruleLevel || 'std',
      // 客户端内核能力标记：仅 Mihomo/Meta 支持节点级 dialer-proxy（链式代理）。
      isMeta: Boolean(input.meta?.isMeta),
    },
    proxies: Array.isArray(input.proxies) ? input.proxies : [],
    groups: Array.isArray(input.groups) ? input.groups : [],
    rules: Array.isArray(input.rules) ? input.rules : [],
    settings: {
      ...input.settings,
      managedConfigUrl: input.settings?.managedConfigUrl || '',
      interval: input.settings?.interval || 86400,
      skipCertVerify: Boolean(input.settings?.skipCertVerify),
      enableUdp: Boolean(input.settings?.enableUdp),
      customDnsOverride: input.settings?.customDnsOverride || '',
      dnsMode: input.settings?.dnsMode || 'clean',
      regionOverrides: Array.isArray(input.settings?.regionOverrides) ? input.settings.regionOverrides : [],
    },
    extras: typeof input.extras === 'object' && input.extras !== null ? input.extras : {},
  };
}

export function normalizeUnifiedTemplateModel(model: UnifiedTemplateModelInput = {}): UnifiedTemplateModel {
  return createUnifiedTemplateModel(model);
}
