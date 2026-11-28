/**
 * 多端口 SOCKS5 绑定分配器与订阅门户/多端口生效配置解析器（单一事实来源）
 * 同时供 Mihomo YAML 生成器与订阅浏览器门户页调用，确保节点过滤、去重、顺序与端口编号 100% 一致。
 */

import type { ClashProxy, NodeIRBatchParseOptions, ProfileConfig, SettingsConfig } from '../types.js';
import { extractNodeMetadata } from '../node/metadata-extractor.js';
import { isVirtualInfoProxy } from '../protocols/clash-parsers/common.js';
import { urlsToClashProxies } from '../protocols/url-to-clash.js';
import { isValidHttpUrlString } from '../utils/url-validators.js';

export const DEFAULT_MULTI_SOCKS_START_PORT = 42001;
export const MIN_MULTI_SOCKS_PORT = 1024;
export const MAX_MULTI_SOCKS_START_PORT = 60000;
export const MAX_MULTI_SOCKS_TCP_PORT = 65535;
export const DEFAULT_MULTI_SOCKS_MAX_PORTS = 300;
export const DEFAULT_MULTI_SOCKS_LISTEN = '127.0.0.1' as const;

export type MultiSocksListen = '127.0.0.1' | '0.0.0.0';
export type PortalMode = 'portal' | 'redirect' | 'raw';
export type ProfilePortalMode = 'inherit' | PortalMode;

export interface EffectiveMultiSocksConfig {
  enabled: boolean;
  lite: boolean;
  startPort: number;
  listen: MultiSocksListen;
  maxPorts: number;
  username: string;
  password: string;
  explicitByQuery: boolean;
}

export interface EffectivePortalConfig {
  mode: PortalMode;
  redirectUrl: string;
  title: string;
  notice: string;
}

export interface MultiSocksBinding {
  port: number;
  listen: MultiSocksListen;
  protocol: 'socks5';
  proxyName: string;
  region: string;
  countryCode: string;
  username?: string;
  password?: string;
}

export interface MihomoSocksListener {
  name: string;
  type: 'socks';
  listen: MultiSocksListen;
  port: number;
  proxy: string;
  udp: boolean;
  users?: Array<{ username: string; password: string }>;
}

export interface BuildMultiSocksBindingsOptions {
  startPort?: number;
  listen?: string;
  maxPorts?: number;
  username?: string;
  password?: string;
  parseOptions?: NodeIRBatchParseOptions;
}

export function cleanControlCharsCore<T>(str: T): T {
  if (typeof str !== 'string') return str;
  // oxlint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') as T;
}

function deepCleanProxyControlChars<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return cleanControlCharsCore(obj) as T;
  if (Array.isArray(obj)) return obj.map((item) => deepCleanProxyControlChars(item)) as T;
  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      cleaned[cleanControlCharsCore(key)] = deepCleanProxyControlChars(value);
    }
    return cleaned as T;
  }
  return obj;
}

/**
 * 原地无冲突节点名称去重（首项保留原名，重名项追加 _1, _2... 并跳过已占用名）
 */
export function deduplicateNamesCollisionFree<T extends { name?: string }>(proxies: T[]): void {
  if (!Array.isArray(proxies)) return;
  const assigned = new Set<string>();
  const counts = new Map<string, number>();

  for (const proxy of proxies) {
    if (!proxy || !proxy.name) continue;
    const baseName = proxy.name;
    let count = (counts.get(baseName) || 0) + 1;
    let candidate = count === 1 ? baseName : `${baseName}_${count - 1}`;
    while (assigned.has(candidate)) {
      count += 1;
      candidate = `${baseName}_${count - 1}`;
    }
    counts.set(baseName, count);
    assigned.add(candidate);
    proxy.name = candidate;
  }
}

/**
 * 解析节点列表并执行统一的过滤、控制字符清理与无冲突去重
 */
export function prepareClashProxiesFromNodeList(
  nodeList: string | ReadonlyArray<string>,
  parseOptions: NodeIRBatchParseOptions = {},
): ClashProxy[] {
  const rawLines = Array.isArray(nodeList) ? nodeList : String(cleanControlCharsCore(nodeList || '')).split(/\r?\n/);
  const urls = rawLines
    .map((line) => cleanControlCharsCore(String(line || '')).trim())
    .filter((line) => line && !line.startsWith('#'));

  const proxies = deepCleanProxyControlChars(urlsToClashProxies(urls, parseOptions));
  deduplicateNamesCollisionFree(proxies);
  return proxies;
}

/**
 * 从地区名称或国旗 Emoji 提取 ISO 两位地区代码
 */
export function extractCountryCodeFromMetadata(region?: string, flag?: string): string {
  const normalizedRegion = typeof region === 'string' ? region.trim() : '';
  if (normalizedRegion === '台湾' || normalizedRegion === '台灣') {
    return 'TW';
  }
  const flagStr = typeof flag === 'string' ? flag.trim() : '';
  if (!flagStr) return '';

  const chars = Array.from(flagStr);
  if (chars.length < 2) return '';
  const first = chars[0].codePointAt(0) ?? 0;
  const second = chars[1].codePointAt(0) ?? 0;
  const REGIONAL_A = 0x1f1e6;
  const REGIONAL_Z = 0x1f1ff;
  if (first >= REGIONAL_A && first <= REGIONAL_Z && second >= REGIONAL_A && second <= REGIONAL_Z) {
    return String.fromCharCode(65 + (first - REGIONAL_A), 65 + (second - REGIONAL_A));
  }
  return '';
}

export function normalizeProfilePortalMode(raw: unknown): ProfilePortalMode {
  return raw === 'portal' || raw === 'redirect' || raw === 'raw' ? raw : 'inherit';
}

export function normalizeOptionalBooleanOverride(raw: unknown): boolean | null {
  return typeof raw === 'boolean' ? raw : null;
}

export function normalizeOptionalListenOverride(raw: unknown): '' | MultiSocksListen {
  return raw === '127.0.0.1' || raw === '0.0.0.0' ? raw : '';
}

export function parseOptionalInteger(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function normalizeProfilePortalSocksOverrides(
  source: Record<string, unknown> = {},
  options: { stringifyNumbers?: boolean } = {},
) {
  const startPort = parseOptionalInteger(source.multiSocksStartPort);
  const maxPorts = parseOptionalInteger(source.multiSocksMaxPorts);
  const stringify = Boolean(options.stringifyNumbers);

  return {
    portalMode: normalizeProfilePortalMode(source.portalMode),
    portalRedirectUrl: typeof source.portalRedirectUrl === 'string' ? source.portalRedirectUrl.trim() : '',
    portalNotice: typeof source.portalNotice === 'string' ? source.portalNotice.trim() : '',
    multiSocksEnabled: normalizeOptionalBooleanOverride(source.multiSocksEnabled),
    multiSocksLite: normalizeOptionalBooleanOverride(source.multiSocksLite),
    multiSocksStartPort: stringify ? (startPort === null ? '' : String(startPort)) : startPort,
    multiSocksListen: normalizeOptionalListenOverride(source.multiSocksListen),
    multiSocksUsername: typeof source.multiSocksUsername === 'string' ? source.multiSocksUsername.trim() : '',
    multiSocksPassword: typeof source.multiSocksPassword === 'string' ? source.multiSocksPassword.trim() : '',
    multiSocksMaxPorts: stringify ? (maxPorts === null ? '' : String(maxPorts)) : maxPorts,
  };
}

function normalizeListenAddress(raw: unknown): MultiSocksListen {
  return raw === '0.0.0.0' ? '0.0.0.0' : DEFAULT_MULTI_SOCKS_LISTEN;
}

function normalizeStartPort(raw: unknown, fallback = DEFAULT_MULTI_SOCKS_START_PORT): number {
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= MIN_MULTI_SOCKS_PORT && parsed <= MAX_MULTI_SOCKS_START_PORT) {
    return parsed;
  }
  return fallback;
}

function normalizeMaxPorts(raw: unknown, fallback = DEFAULT_MULTI_SOCKS_MAX_PORTS): number {
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_MULTI_SOCKS_TCP_PORT) {
    return parsed;
  }
  return fallback;
}

function isClashProxyLike(value: unknown): value is ClashProxy {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'name' in value);
}

/**
 * 确定性节点 <-> 本地 SOCKS5 端口绑定分配器（纯函数、无副作用、严格剥离上游敏感连接信息）
 */
export function buildMultiSocksBindings(
  nodes: string | ReadonlyArray<string | ClashProxy>,
  options: BuildMultiSocksBindingsOptions = {},
): MultiSocksBinding[] {
  let preparedProxies: ClashProxy[];

  if (typeof nodes === 'string') {
    preparedProxies = prepareClashProxiesFromNodeList(nodes, options.parseOptions);
  } else if (Array.isArray(nodes)) {
    if (nodes.length === 0) {
      preparedProxies = [];
    } else if (nodes.every((item) => typeof item === 'string')) {
      preparedProxies = prepareClashProxiesFromNodeList(nodes as string[], options.parseOptions);
    } else {
      const workingProxies = nodes.filter(isClashProxyLike).map((proxy) => ({
        name: cleanControlCharsCore(String(proxy.name || '')).trim(),
        type: proxy.type,
        server: proxy.server,
        port: proxy.port,
        password: proxy.password,
        metadata: proxy.metadata,
      })) as ClashProxy[];
      deduplicateNamesCollisionFree(workingProxies);
      preparedProxies = workingProxies;
    }
  } else {
    preparedProxies = [];
  }

  const realProxies = preparedProxies.filter(
    (proxy) => proxy && typeof proxy.name === 'string' && proxy.name.trim() !== '' && !isVirtualInfoProxy(proxy),
  );

  const startPort = normalizeStartPort(options.startPort);
  const listen = normalizeListenAddress(options.listen);
  const maxPorts = normalizeMaxPorts(options.maxPorts);
  const username = typeof options.username === 'string' ? options.username.trim() : '';
  const password = typeof options.password === 'string' ? options.password.trim() : '';
  const hasAuth = Boolean(username && password);

  const bindings: MultiSocksBinding[] = [];

  for (let index = 0; index < realProxies.length; index += 1) {
    if (bindings.length >= maxPorts) break;
    const localPort = startPort + index;
    if (localPort > MAX_MULTI_SOCKS_TCP_PORT) break;

    const proxy = realProxies[index];
    const proxyName = String(proxy.name).trim();
    const meta = proxy.metadata && typeof proxy.metadata === 'object' ? proxy.metadata : extractNodeMetadata(proxyName);
    const region = typeof meta?.region === 'string' && meta.region.trim() ? meta.region.trim() : '其他';
    const flag = typeof meta?.flag === 'string' ? meta.flag : '';
    const countryCode = extractCountryCodeFromMetadata(region, flag);

    // 白名单构造对外绑定对象：严禁透出上游 server / port / uuid / password / url 等底层连接参数
    const binding: MultiSocksBinding = {
      port: localPort,
      listen,
      protocol: 'socks5',
      proxyName,
      region,
      countryCode,
    };

    if (hasAuth) {
      binding.username = username;
      binding.password = password;
    }

    bindings.push(binding);
  }

  return bindings;
}

/**
 * 将确定性端口绑定转换为 Mihomo (Clash Meta) `listeners` 配置数组
 */
export function buildMihomoSocksListeners(bindings: ReadonlyArray<MultiSocksBinding>): MihomoSocksListener[] {
  if (!Array.isArray(bindings) || bindings.length === 0) return [];

  return bindings.map((binding) => {
    const listener: MihomoSocksListener = {
      name: `socks-${binding.port}`,
      type: 'socks',
      listen: binding.listen,
      port: binding.port,
      proxy: binding.proxyName,
      udp: true,
    };
    if (binding.username && binding.password) {
      listener.users = [
        {
          username: binding.username,
          password: binding.password,
        },
      ];
    }
    return listener;
  });
}

function parseQueryBooleanFlag(raw: string | null): boolean | null {
  if (raw === null) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return null;
}

/**
 * 解析多端口 SOCKS5 生效配置（URL 参数 > 订阅组 Profile > 全局 Settings > 默认值）
 */
export function resolveEffectiveMultiSocksConfig({
  searchParams,
  profile,
  settings,
}: {
  searchParams?: URLSearchParams | null;
  profile?: (Partial<ProfileConfig> & Record<string, unknown>) | null;
  settings?: (Partial<SettingsConfig> & Record<string, unknown>) | null;
}): EffectiveMultiSocksConfig {
  const globalEnabled =
    settings?.defaultMultiSocksEnabled === true ||
    String(settings?.defaultMultiSocksEnabled ?? '').toLowerCase() === 'true';
  const profileEnabled = normalizeOptionalBooleanOverride(profile?.multiSocksEnabled);
  let enabled = profileEnabled !== null ? profileEnabled : globalEnabled;
  let explicitByQuery = false;
  const globalLite =
    settings?.defaultMultiSocksLite === true || String(settings?.defaultMultiSocksLite ?? '').toLowerCase() === 'true';
  const profileLite = normalizeOptionalBooleanOverride(profile?.multiSocksLite);
  let lite = profileLite !== null ? profileLite : globalLite;

  const queryMode = searchParams?.get('mode')?.trim().toLowerCase() || '';
  if (queryMode === 'multi-socks' || queryMode === 'multisocks') {
    enabled = true;
    explicitByQuery = true;
  } else if (queryMode === 'multi-socks-lite' || queryMode === 'multisocks-lite') {
    enabled = true;
    explicitByQuery = true;
    lite = true;
  } else if (queryMode === 'normal' || queryMode === 'standard') {
    enabled = false;
    lite = false;
  } else {
    const queryFlag =
      parseQueryBooleanFlag(searchParams?.get('multi-socks') ?? null) ??
      parseQueryBooleanFlag(searchParams?.get('multiSocks') ?? null);
    if (queryFlag === true) {
      enabled = true;
      explicitByQuery = true;
    } else if (queryFlag === false) {
      enabled = false;
      lite = false;
    }
  }

  const queryLiteFlag =
    parseQueryBooleanFlag(searchParams?.get('lite') ?? null) ??
    parseQueryBooleanFlag(searchParams?.get('light') ?? null);
  if (queryLiteFlag !== null) {
    lite = enabled && queryLiteFlag;
  }
  if (!enabled) {
    lite = false;
  }

  const queryStartPortRaw =
    searchParams?.get('startPort') ?? searchParams?.get('start_port') ?? searchParams?.get('start-port') ?? null;
  const globalStartPort = normalizeStartPort(settings?.defaultMultiSocksStartPort, DEFAULT_MULTI_SOCKS_START_PORT);
  const rawProfileStartPort = parseOptionalInteger(profile?.multiSocksStartPort);
  const profileStartPort =
    rawProfileStartPort !== null ? normalizeStartPort(rawProfileStartPort, globalStartPort) : globalStartPort;
  const startPort =
    queryStartPortRaw !== null ? normalizeStartPort(queryStartPortRaw, profileStartPort) : profileStartPort;

  const queryListen = normalizeOptionalListenOverride(searchParams?.get('listen'));
  const globalListen = normalizeListenAddress(settings?.defaultMultiSocksListen);
  const profileListen = normalizeOptionalListenOverride(profile?.multiSocksListen) || globalListen;
  const listen = queryListen || profileListen;

  const queryMaxPortsRaw =
    searchParams?.get('maxPorts') ?? searchParams?.get('max_ports') ?? searchParams?.get('max-ports') ?? null;
  const rawProfileMaxPorts = parseOptionalInteger(profile?.multiSocksMaxPorts);
  const profileMaxPorts =
    rawProfileMaxPorts !== null
      ? normalizeMaxPorts(rawProfileMaxPorts, DEFAULT_MULTI_SOCKS_MAX_PORTS)
      : DEFAULT_MULTI_SOCKS_MAX_PORTS;
  const maxPorts = queryMaxPortsRaw !== null ? normalizeMaxPorts(queryMaxPortsRaw, profileMaxPorts) : profileMaxPorts;

  const username = typeof profile?.multiSocksUsername === 'string' ? profile.multiSocksUsername.trim() : '';
  const password = typeof profile?.multiSocksPassword === 'string' ? profile.multiSocksPassword.trim() : '';

  return {
    enabled,
    lite,
    startPort,
    listen,
    maxPorts,
    username,
    password,
    explicitByQuery,
  };
}

/**
 * 解析订阅门户生效配置（Profile 覆盖 > 全局 Settings > 默认值）
 */
export function resolveEffectivePortalConfig({
  profile,
  settings,
  subName,
}: {
  profile?: (Partial<ProfileConfig> & Record<string, unknown>) | null;
  settings?: (Partial<SettingsConfig> & Record<string, unknown>) | null;
  subName?: string;
}): EffectivePortalConfig {
  const globalMode: PortalMode =
    settings?.subPortalMode === 'redirect' || settings?.subPortalMode === 'raw' ? settings.subPortalMode : 'portal';
  const normalizedProfileMode = normalizeProfilePortalMode(profile?.portalMode);
  const mode: PortalMode = normalizedProfileMode === 'inherit' ? globalMode : normalizedProfileMode;

  const profileRedirect = typeof profile?.portalRedirectUrl === 'string' ? profile.portalRedirectUrl.trim() : '';
  const globalRedirect = typeof settings?.subPortalRedirectUrl === 'string' ? settings.subPortalRedirectUrl.trim() : '';
  const rawRedirect = profileRedirect || globalRedirect;
  const redirectUrl = rawRedirect && isValidHttpUrlString(rawRedirect) ? rawRedirect : '';

  const globalTitle = typeof settings?.subPortalTitle === 'string' ? settings.subPortalTitle.trim() : '';
  const fallbackName = String(subName || '').trim() || String(settings?.fileName || '').trim() || 'MiSub';
  const title = globalTitle || fallbackName;

  const profileNotice = typeof profile?.portalNotice === 'string' ? profile.portalNotice.trim() : '';
  const globalNotice = typeof settings?.subPortalNotice === 'string' ? settings.subPortalNotice.trim() : '';
  const notice = profileNotice || globalNotice;

  return {
    mode,
    redirectUrl,
    title,
    notice,
  };
}
