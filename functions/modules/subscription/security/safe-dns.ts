import * as yaml from 'js-yaml';

const DNS_MODES = Object.freeze({
  CLEAN: 'clean',
  POLLUTED: 'polluted',
} as const);

export type DnsMode = (typeof DNS_MODES)[keyof typeof DNS_MODES];

export interface DnsPolicy {
  mode: DnsMode;
  domestic: string[];
  foreign: string[];
  polluted: string[];
}

export interface SubscriptionDnsPolicyEntry {
  policy?: Record<string, unknown>;
  domains?: string;
  nameservers?: unknown;
}

export interface ResolveDnsOptions {
  mode?: unknown;
  proxyGroup?: string;
  subscriptionDnsPolicies?: SubscriptionDnsPolicyEntry[];
}

export interface SingboxDnsServer {
  tag: string;
  type: string;
  server: string;
  server_port: number;
  detour: string;
  path?: string;
  tls?: {
    enabled: boolean;
    server_name: string;
  };
}

export interface SingboxDnsConfig {
  strategy: string;
  servers: SingboxDnsServer[];
  rules: Array<
    | { rule_set: string[]; action: string; server: string }
    | { domain_suffix: string[]; action: string; server: string }
  >;
  final: string;
}

export const DNS_PROXY_GROUP = '🌐 DNS 出口';
export const SINGBOX_CN_RULE_SET = 'geosite-cn';

const DEFAULT_DNS_POLICY = Object.freeze({
  domestic: ['223.5.5.5', '119.29.29.29'],
  // 境外解析统一使用 IP 型 DoH：免引导解析（无需先解析域名），
  // TCP 承载比明文 UDP:53 更抗污染、在代理链路上更稳定
  foreign: ['https://8.8.8.8/dns-query', 'https://1.1.1.1/dns-query'],
  polluted: ['https://8.8.8.8/dns-query', 'https://1.1.1.1/dns-query'],
});

const SAFE_DNS_FIELDS = [
  'cache-algorithm',
  'fake-ip-range',
  'fake-ip-filter-mode',
  'fake-ip-ttl',
  'use-hosts',
  'use-system-hosts',
] as const;

const DNS_HOST_PATTERN =
  /^(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\])$/i;
const DNS_SCHEME_PATTERN = /^(?:udp|tcp|tls|https):\/\//i;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
  }
  return value;
}

function parseOverride(raw: unknown): Record<string, unknown> {
  if (isObject(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return {};

  try {
    const parsed: unknown = yaml.load(raw.trim());
    if (!isObject(parsed)) return {};
    return isObject(parsed.dns) ? parsed.dns : parsed;
  } catch {
    return {};
  }
}

function normalizeMode(value: unknown): DnsMode {
  return String(value || '')
    .trim()
    .toLowerCase() === DNS_MODES.POLLUTED
    ? DNS_MODES.POLLUTED
    : DNS_MODES.CLEAN;
}

function resolverHost(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('#') || raw === 'system') return raw === 'system' ? raw : '';

  const candidate = DNS_SCHEME_PATTERN.test(raw) ? raw : `udp://${raw}`;
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    if (!DNS_HOST_PATTERN.test(parsed.hostname)) return '';
    if (host === 'localhost' || host === '::1' || host.startsWith('127.') || host.startsWith('0.')) return '';
    return raw;
  } catch {
    return '';
  }
}

function resolverList(value: unknown, fallback: readonly string[]): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const normalized = values.map(resolverHost).filter(Boolean);
  return normalized.length > 0 ? normalized : [...fallback];
}

function policyInput(override: Record<string, unknown>): Record<string, unknown> {
  return isObject(override.policy) ? { ...override, ...override.policy } : override;
}

export function resolveDnsPolicy(raw: unknown, options: ResolveDnsOptions = {}): DnsPolicy {
  const override = parseOverride(raw);
  const input = policyInput(override);
  const mode = normalizeMode(options.mode || input.mode || input['dns-mode']);

  const foreign = resolverList(
    input.foreign || input.foreignNameservers || input['foreign-nameserver'] || input.nameserver,
    DEFAULT_DNS_POLICY.foreign,
  );

  return {
    mode,
    domestic: resolverList(
      input.domestic || input.domesticNameservers || input['domestic-nameserver'] || input['default-nameserver'],
      DEFAULT_DNS_POLICY.domestic,
    ),
    foreign,
    polluted: resolverList(
      input.polluted || input.pollutedNameservers || input['polluted-nameserver'] || input.fallback,
      DEFAULT_DNS_POLICY.polluted,
    ),
  };
}

function withProxy(value: unknown, proxyGroup: string): string {
  const raw = String(value || '').trim();
  if (!raw || raw === 'system') return raw;
  return `${raw}#${proxyGroup}`;
}

const DEFAULT_DNS_CONFIG: Record<string, unknown> = {
  enable: true,
  ipv6: false,
  'enhanced-mode': 'fake-ip',
  'fake-ip-range': '198.18.0.1/16',
  'fake-ip-filter-mode': 'blacklist',
  'fake-ip-filter': ['geosite:private', 'geosite:category-ntp', '*.lan', '*.local', 'localhost', '*.arpa'],
  'use-hosts': true,
  'use-system-hosts': true,
  'respect-rules': true,
  'default-nameserver': [...DEFAULT_DNS_POLICY.domestic],
  nameserver: DEFAULT_DNS_POLICY.foreign.map((value) => withProxy(value, DNS_PROXY_GROUP)),
  'nameserver-policy': {
    'geosite:private': [...DEFAULT_DNS_POLICY.domestic],
    'geosite:cn': [...DEFAULT_DNS_POLICY.domestic],
    'geosite:geolocation-!cn': DEFAULT_DNS_POLICY.foreign.map((value) => withProxy(value, DNS_PROXY_GROUP)),
  },
  'proxy-server-nameserver': [...DEFAULT_DNS_POLICY.domestic],
  'direct-nameserver': [...DEFAULT_DNS_POLICY.domestic],
  'direct-nameserver-follow-policy': true,
  fallback: [],
  'fallback-filter': {
    geoip: true,
    'geoip-code': 'CN',
    ipcidr: ['240.0.0.0/4', '0.0.0.0/32', '127.0.0.0/8', '100.64.0.0/10'],
  },
};

function isExplicitDnsBlock(override: unknown): override is Record<string, unknown> {
  if (!isObject(override)) return false;
  return (
    override.enable !== undefined ||
    override['enhanced-mode'] !== undefined ||
    override['proxy-server-nameserver'] !== undefined ||
    (Array.isArray(override.nameserver) && isObject(override['nameserver-policy']))
  );
}

export function resolveSafeDnsConfig(raw: unknown, options: ResolveDnsOptions = {}): Record<string, unknown> {
  const rawOverride = parseOverride(raw);
  if (isExplicitDnsBlock(rawOverride)) {
    return clone(rawOverride);
  }

  const policy = resolveDnsPolicy(raw, options);
  const proxyGroup = String(options.proxyGroup || DNS_PROXY_GROUP);
  const foreign = policy.mode === DNS_MODES.POLLUTED ? policy.polluted : policy.foreign;
  const dns = clone(DEFAULT_DNS_CONFIG);

  const subPolicies = (options.subscriptionDnsPolicies || []).reduce<Record<string, unknown>>((acc, item) => {
    if (item && item.policy && isObject(item.policy)) {
      Object.assign(acc, item.policy);
    } else if (item && item.domains && item.nameservers) {
      acc[item.domains] = item.nameservers;
    }
    return acc;
  }, {});

  dns['default-nameserver'] = [...policy.domestic];
  dns.nameserver = foreign.map((value) => withProxy(value, proxyGroup));
  dns['nameserver-policy'] = {
    'geosite:private': [...policy.domestic],
    'geosite:cn': [...policy.domestic],
    ...subPolicies,
    'geosite:geolocation-!cn': foreign.map((value) => withProxy(value, proxyGroup)),
  };
  dns['proxy-server-nameserver'] = [...policy.domestic];
  dns['direct-nameserver'] = [...policy.domestic];
  dns.fallback = policy.mode === DNS_MODES.POLLUTED ? foreign.map((value) => withProxy(value, proxyGroup)) : [];

  const override = policyInput(rawOverride);
  SAFE_DNS_FIELDS.forEach((key) => {
    if (override[key] === undefined) return;
    if (key === 'fake-ip-filter-mode' && !['blacklist', 'whitelist', 'rule'].includes(String(override[key]))) return;
    if (['use-hosts', 'use-system-hosts'].includes(key)) {
      dns[key] = Boolean(override[key]);
      return;
    }
    if (typeof override[key] === 'string' || typeof override[key] === 'number') dns[key] = override[key];
  });

  dns.enable = true;
  dns.ipv6 = false;
  dns['enhanced-mode'] = 'fake-ip';
  dns['respect-rules'] = true;
  return dns;
}

function parseSingboxResolver(value: unknown, tag: string, detour: string): SingboxDnsServer {
  const raw = String(value || '').trim();
  const candidate = DNS_SCHEME_PATTERN.test(raw) ? raw : `udp://${raw}`;
  const parsed = new URL(candidate);
  const type = parsed.protocol.slice(0, -1);
  const server = parsed.hostname.replace(/^\[|\]$/g, '');
  const serverPort = Number(parsed.port) || (type === 'https' ? 443 : type === 'tls' ? 853 : 53);
  const result: SingboxDnsServer = { tag, type, server, server_port: serverPort, detour };
  if (type === 'https') result.path = parsed.pathname || '/dns-query';
  if (type === 'tls') result.tls = { enabled: true, server_name: server };
  return result;
}

export function buildSingboxDnsConfig(raw: unknown, options: ResolveDnsOptions = {}): SingboxDnsConfig {
  const policy = resolveDnsPolicy(raw, options);
  const proxyGroup = String(options.proxyGroup || DNS_PROXY_GROUP);
  const foreign = policy.mode === DNS_MODES.POLLUTED ? policy.polluted : policy.foreign;
  const domesticServers = policy.domestic.map((value, index) =>
    parseSingboxResolver(value, `dns-cn-${index + 1}`, 'DIRECT'),
  );
  const foreignServers = foreign.map((value, index) =>
    parseSingboxResolver(value, `dns-foreign-${index + 1}`, proxyGroup),
  );
  const domesticTag = domesticServers[0]?.tag || 'dns-cn-1';
  const foreignTag = foreignServers[0]?.tag || 'dns-foreign-1';

  return {
    strategy: 'prefer_ipv4',
    servers: [...domesticServers, ...foreignServers],
    rules: [
      { rule_set: [SINGBOX_CN_RULE_SET], action: 'route', server: domesticTag },
      { domain_suffix: ['.cn', '.lan', '.local'], action: 'route', server: domesticTag },
    ],
    final: foreignTag,
  };
}
