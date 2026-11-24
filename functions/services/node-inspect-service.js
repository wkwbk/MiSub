/**
 * 节点网络信息探测服务
 * - 提取节点服务器地址、端口及传输层特征
 * - 域名通过 Cloudflare DoH 解析为 IPv4/IPv6（带 D1 缓存）
 * - 去重 IP 批量查询 ip-api.com 获取国家、ASN、ISP/Org（带 D1 缓存）
 * - 综合 ASN、主流 CDN CIDR 段与协议特征判定 CDN / 中转 / 直连
 */

import { urlToClashProxy } from '../../shared/url-to-clash.js';
import { parseNodeInfo } from '../utils/geo-utils.js';
import { StorageFactory } from '../storage-adapter.js';

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const IP_API_BATCH_ENDPOINT = 'http://ip-api.com/batch?fields=status,message,query,countryCode,country,as,org,isp';

export const DNS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const IP_GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const DNS_CACHE_PREFIX = 'node_inspect_dns:';
const IP_CACHE_PREFIX = 'node_inspect_ip:';

const UDP_ONLY_PROTOCOLS = new Set(['hysteria', 'hysteria2', 'hy', 'hy2', 'tuic', 'wireguard', 'wg']);
const CDN_CAPABLE_TRANSPORTS = new Set(['ws', 'grpc', 'h2', 'http', 'xhttp', 'httpupgrade', 'splithttp']);

// 主流 CDN IPv4 CIDR 段（重点覆盖 Cloudflare / Fastly / Gcore / Akamai 常见优选段）
const CDN_IPV4_CIDRS = [
  { cidr: '173.245.48.0/20', provider: 'Cloudflare' },
  { cidr: '103.21.244.0/22', provider: 'Cloudflare' },
  { cidr: '103.22.200.0/22', provider: 'Cloudflare' },
  { cidr: '103.31.4.0/22', provider: 'Cloudflare' },
  { cidr: '141.101.64.0/18', provider: 'Cloudflare' },
  { cidr: '108.162.192.0/18', provider: 'Cloudflare' },
  { cidr: '190.93.240.0/20', provider: 'Cloudflare' },
  { cidr: '188.114.96.0/20', provider: 'Cloudflare' },
  { cidr: '197.234.240.0/22', provider: 'Cloudflare' },
  { cidr: '198.41.128.0/17', provider: 'Cloudflare' },
  { cidr: '162.158.0.0/15', provider: 'Cloudflare' },
  { cidr: '104.16.0.0/13', provider: 'Cloudflare' },
  { cidr: '104.24.0.0/14', provider: 'Cloudflare' },
  { cidr: '172.64.0.0/13', provider: 'Cloudflare' },
  { cidr: '131.0.72.0/22', provider: 'Cloudflare' },
  { cidr: '151.101.0.0/16', provider: 'Fastly' },
  { cidr: '199.232.0.0/16', provider: 'Fastly' },
  { cidr: '23.235.32.0/20', provider: 'Fastly' },
  { cidr: '43.249.72.0/22', provider: 'Fastly' },
  { cidr: '103.244.50.0/24', provider: 'Fastly' },
  { cidr: '92.223.64.0/18', provider: 'Gcore' },
  { cidr: '5.188.32.0/20', provider: 'Gcore' },
  { cidr: '89.187.160.0/19', provider: 'BunnyCDN' },
  { cidr: '185.152.64.0/22', provider: 'CDN77' },
];

// 主流 CDN ASN 映射
const CDN_ASN_MAP = {
  AS13335: 'Cloudflare',
  AS209242: 'Cloudflare',
  AS132892: 'Cloudflare',
  AS54113: 'Fastly',
  AS20940: 'Akamai',
  AS16625: 'Akamai',
  AS32787: 'Akamai',
  AS19551: 'Imperva',
  AS199524: 'Gcore',
  AS60068: 'CDN77',
  AS200019: 'CDN77',
  AS15133: 'Edgio',
  AS393560: 'BunnyCDN',
  AS20446: 'Highwinds',
  AS33438: 'StackPath',
};

const CDN_ORG_PATTERNS = [
  { regex: /cloudflare/i, provider: 'Cloudflare' },
  { regex: /fastly/i, provider: 'Fastly' },
  { regex: /cloudfront/i, provider: 'CloudFront' },
  { regex: /akamai/i, provider: 'Akamai' },
  { regex: /imperva|incapsula/i, provider: 'Imperva' },
  { regex: /g-?core/i, provider: 'Gcore' },
  { regex: /bunny\s?cdn|bunnyway/i, provider: 'BunnyCDN' },
  { regex: /cdn77|datacamp.*cdn/i, provider: 'CDN77' },
  { regex: /edgecast|edgio|verizon digital media/i, provider: 'Edgio' },
  { regex: /stackpath|highwinds/i, provider: 'StackPath' },
  { regex: /sucuri/i, provider: 'Sucuri' },
  { regex: /quic\.cloud/i, provider: 'QUIC.cloud' },
];

const COUNTRY_NAME_ZH = {
  CN: '中国',
  HK: '香港',
  TW: '台湾',
  MO: '澳门',
  JP: '日本',
  SG: '新加坡',
  US: '美国',
  KR: '韩国',
  GB: '英国',
  DE: '德国',
  FR: '法国',
  NL: '荷兰',
  CA: '加拿大',
  AU: '澳大利亚',
  RU: '俄罗斯',
  IN: '印度',
  TR: '土耳其',
  MY: '马来西亚',
  TH: '泰国',
  VN: '越南',
  PH: '菲律宾',
  ID: '印尼',
  CH: '瑞士',
  IT: '意大利',
  ES: '西班牙',
  BR: '巴西',
  AR: '阿根廷',
  MX: '墨西哥',
  ZA: '南非',
  AE: '阿联酋',
  SA: '沙特',
  IL: '以色列',
  PL: '波兰',
  CZ: '捷克',
  SE: '瑞典',
  NO: '挪威',
  FI: '芬兰',
  DK: '丹麦',
  IE: '爱尔兰',
  AT: '奥地利',
  BE: '比利时',
  PT: '葡萄牙',
  GR: '希腊',
  RO: '罗马尼亚',
  UA: '乌克兰',
  NZ: '新西兰',
  CL: '智利',
  CO: '哥伦比亚',
  LU: '卢森堡',
  IS: '冰岛',
  KP: '朝鲜',
};

export function isIPv4(value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

export function isIPv6(value) {
  if (!value || typeof value !== 'string') return false;
  const cleaned = value.trim().replace(/^\[|\]$/g, '');
  if (!cleaned.includes(':')) return false;
  return /^[0-9a-f:.]+$/i.test(cleaned) && cleaned.length >= 2 && cleaned.length <= 45;
}

export function isIpAddress(value) {
  return isIPv4(value) || isIPv6(value);
}

export function ipv4ToInt(ip) {
  if (!isIPv4(ip)) return null;
  const parts = ip.trim().split('.').map(Number);
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

export function isIpInCidr(ip, cidr) {
  const [network, prefixStr] = String(cidr || '').split('/');
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);
  if (ipInt === null || netInt === null) return false;
  if (prefix === 0) return true;
  const mask = ~((1 << (32 - prefix)) - 1) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

export function isPrivateOrReservedIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const cleaned = ip
    .trim()
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  if (isIPv4(cleaned)) {
    const privateCidrs = [
      '0.0.0.0/8',
      '10.0.0.0/8',
      '100.64.0.0/10',
      '127.0.0.0/8',
      '169.254.0.0/16',
      '172.16.0.0/12',
      '192.0.0.0/24',
      '192.0.2.0/24',
      '192.168.0.0/16',
      '198.18.0.0/15',
      '224.0.0.0/4',
      '240.0.0.0/4',
    ];
    return privateCidrs.some((cidr) => isIpInCidr(cleaned, cidr));
  }
  if (isIPv6(cleaned)) {
    if (cleaned === '::' || cleaned === '::1') return true;
    // 未压缩全零或回环 (如 0:0:0:0:0:0:0:1 / 0000:...:0001)
    if (/^(0+:){6,7}0*[01]?$/.test(cleaned)) return true;
    // ULA (fc00::/7)、链路本地 (fe80::/10)、多播 (ff00::/8)
    if (/^(fc|fd|fe[89ab]|ff)/i.test(cleaned)) return true;
    // IPv4-mapped IPv6 点分十进制形式 (::ffff:127.0.0.1)
    const mappedV4Match = cleaned.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mappedV4Match) {
      return isPrivateOrReservedIp(mappedV4Match[1]);
    }
    // IPv4-mapped IPv6 十六进制形式 (::ffff:7f00:1 / ::ffff:a9fe:a9fe)
    const mappedHexMatch = cleaned.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHexMatch) {
      const hi = parseInt(mappedHexMatch[1], 16);
      const lo = parseInt(mappedHexMatch[2], 16);
      const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
      return isPrivateOrReservedIp(v4);
    }
    return false;
  }
  return true;
}

export function detectCdnByCidr(ip) {
  if (!ip || typeof ip !== 'string') return '';
  const cleaned = ip.trim().replace(/^\[|\]$/g, '');
  if (isIPv4(cleaned)) {
    for (const entry of CDN_IPV4_CIDRS) {
      if (isIpInCidr(cleaned, entry.cidr)) {
        return entry.provider;
      }
    }
  } else if (isIPv6(cleaned)) {
    const lower = cleaned.toLowerCase();
    if (
      lower.startsWith('2606:4700:') ||
      lower.startsWith('2400:cb00:') ||
      lower.startsWith('2803:f800:') ||
      lower.startsWith('2405:b500:') ||
      lower.startsWith('2405:8100:') ||
      lower.startsWith('2a06:98c') ||
      lower.startsWith('2c0f:f248:')
    ) {
      return 'Cloudflare';
    }
    if (lower.startsWith('2a04:4e40:') || lower.startsWith('2a04:4e42:')) {
      return 'Fastly';
    }
  }
  return '';
}

export function extractAsnCode(asField) {
  if (!asField || typeof asField !== 'string') return '';
  const match = asField.trim().match(/^(AS\d+)/i);
  return match ? match[1].toUpperCase() : '';
}

export function detectCdnByAsnOrOrg(asnField, org = '', isp = '') {
  const asnCode = extractAsnCode(asnField);
  if (asnCode && CDN_ASN_MAP[asnCode]) {
    return CDN_ASN_MAP[asnCode];
  }
  const combined = `${asnField || ''} ${org || ''} ${isp || ''}`;
  if (combined.trim()) {
    for (const { regex, provider } of CDN_ORG_PATTERNS) {
      if (regex.test(combined)) {
        return provider;
      }
    }
  }
  return '';
}

export function countryCodeToFlagEmoji(countryCode) {
  const code = String(countryCode || '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  // 与 MiSub 项目地区 Emoji 规范保持一致
  if (code === 'TW') return '🇨🇳';
  return String.fromCodePoint(...code.split('').map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export function getCountryDisplayName(countryCode, fallbackName = '') {
  const code = String(countryCode || '')
    .trim()
    .toUpperCase();
  return COUNTRY_NAME_ZH[code] || fallbackName || code || '';
}

function getRootDomain(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!host || isIpAddress(host)) return host;
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

/**
 * 提取节点地址、端口及传输层特征（用于判断是否套 CDN 及是否纯 UDP 协议）
 */
export function extractProtocolTransportInfo(nodeUrl) {
  const rawUrl = String(nodeUrl || '').trim();
  if (!rawUrl) {
    return {
      server: '',
      port: '',
      protocol: 'unknown',
      network: '',
      wsHost: '',
      sni: '',
      tls: false,
      isUdpOnly: false,
    };
  }

  let proxy = null;
  try {
    proxy = urlToClashProxy(rawUrl);
  } catch {
    proxy = null;
  }

  const basic = parseNodeInfo(rawUrl);
  const protocol = String(proxy?.type || basic.protocol || 'unknown').toLowerCase();
  const server = String(proxy?.server || basic.server || '')
    .trim()
    .replace(/^\[|\]$/g, '');
  const port = String(proxy?.port ?? basic.port ?? '').trim();
  const network = String(proxy?.network || proxy?.transport || '').toLowerCase();
  const wsHost = String(
    proxy?.['ws-opts']?.headers?.Host ||
      proxy?.['ws-opts']?.headers?.host ||
      proxy?.['h2-opts']?.host?.[0] ||
      proxy?.['http-opts']?.headers?.Host?.[0] ||
      proxy?.['xhttp-opts']?.host ||
      '',
  )
    .trim()
    .toLowerCase();
  const sni = String(proxy?.sni || proxy?.servername || '')
    .trim()
    .toLowerCase();
  const tls = Boolean(proxy?.tls || protocol === 'trojan' || protocol === 'hysteria2' || protocol === 'tuic');
  const isUdpOnly = UDP_ONLY_PROTOCOLS.has(protocol);

  return {
    server,
    port,
    protocol,
    network,
    wsHost,
    sni,
    tls,
    isUdpOnly,
  };
}

/**
 * 基于协议特征判断是否套 CDN：
 * 当传输层为 ws / grpc / h2 / xhttp / httpupgrade，且 host 或 sni 与 server 不一致时，
 * 极大概率为优选 IP/优选域名 + CDN 反代架构。
 */
export function detectCdnByProtocolFeature(transportInfo) {
  if (!transportInfo || !transportInfo.server) return false;
  if (!CDN_CAPABLE_TRANSPORTS.has(transportInfo.network)) return false;

  const serverLower = transportInfo.server.toLowerCase();
  const targetHost = transportInfo.wsHost || transportInfo.sni;
  if (!targetHost || isIpAddress(targetHost)) return false;

  if (targetHost === serverLower) return false;

  // 若 server 本身是 IP，而 wsHost/sni 是域名 -> 典型优选 IP 套 CDN
  if (isIpAddress(serverLower)) return true;

  // 若 server 与 wsHost/sni 属于不同主域名 -> 典型优选域名套 CDN
  const serverRoot = getRootDomain(serverLower);
  const hostRoot = getRootDomain(targetHost);
  return Boolean(serverRoot && hostRoot && serverRoot !== hostRoot);
}

/**
 * 通过 Cloudflare DoH 解析域名为 IP（优先 A，无结果时回退 AAAA）
 */
export async function resolveDomainViaDoH(domain, fetchFn = fetch) {
  const cleanDomain = String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!cleanDomain || isIpAddress(cleanDomain)) {
    return { ip: cleanDomain, ips: cleanDomain ? [cleanDomain] : [], recordType: isIPv6(cleanDomain) ? 'AAAA' : 'A' };
  }

  for (const recordType of ['A', 'AAAA']) {
    const expectedTypeCode = recordType === 'A' ? 1 : 28;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const resp = await fetchFn(`${DOH_ENDPOINT}?name=${encodeURIComponent(cleanDomain)}&type=${recordType}`, {
        headers: { Accept: 'application/dns-json' },
        signal: controller.signal,
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const answers = Array.isArray(data?.Answer) ? data.Answer : [];
      const ips = answers
        .filter((ans) => ans && ans.type === expectedTypeCode && typeof ans.data === 'string')
        .map((ans) => ans.data.trim())
        .filter((val) => isIpAddress(val));
      if (ips.length > 0) {
        return { ip: ips[0], ips, recordType };
      }
    } catch {
    } finally {
      clearTimeout(timer);
    }
  }

  return { ip: '', ips: [], recordType: '' };
}

/**
 * 批量查询 IP 地理与 ASN 信息（ip-api.com/batch 单次最多 100 个）
 */
export async function queryIpGeoBatch(ips, fetchFn = fetch) {
  const resultMap = new Map();
  const uniqueIps = Array.from(new Set((ips || []).filter((ip) => ip && !isPrivateOrReservedIp(ip))));
  if (uniqueIps.length === 0) return resultMap;

  const CHUNK_SIZE = 100;
  for (let i = 0; i < uniqueIps.length; i += CHUNK_SIZE) {
    const chunk = uniqueIps.slice(i, i + CHUNK_SIZE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const resp = await fetchFn(IP_API_BATCH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
        signal: controller.signal,
      });
      if (!resp.ok) continue;
      const items = await resp.json();
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || item.status !== 'success' || !item.query) continue;
        resultMap.set(item.query, {
          countryCode: String(item.countryCode || '').toUpperCase(),
          country: String(item.country || ''),
          asn: extractAsnCode(item.as),
          asFull: String(item.as || ''),
          org: String(item.org || ''),
          isp: String(item.isp || ''),
        });
      }
    } catch {
      // 网络波动时降级，不影响 CIDR/协议特征判定
    } finally {
      clearTimeout(timer);
    }
  }

  return resultMap;
}

async function readCacheSafe(storageAdapter, key, now) {
  if (!storageAdapter || storageAdapter.type === 'noop') return null;
  try {
    const cached = await storageAdapter.get(key);
    if (!cached || typeof cached !== 'object') return null;
    if (cached.expiresAt && Number(cached.expiresAt) <= now) return null;
    return cached;
  } catch {
    return null;
  }
}

async function writeCacheSafe(storageAdapter, key, payload) {
  if (!storageAdapter || storageAdapter.type === 'noop') return;
  try {
    await storageAdapter.put(key, payload);
  } catch {}
}

async function runWithConcurrency(items, concurrency, worker) {
  let index = 0;
  const limit = Math.min(concurrency, items.length);
  const runners = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const current = index++;
      await worker(items[current], current);
    }
  });
  await Promise.allSettled(runners);
}

/**
 * 批量探测节点网络信息（DNS解析 + IP地理 + CDN/中转/直连判定）
 * @param {Array<{id: string, url: string}>} nodes
 * @param {Object} env
 * @param {{ fetchFn?: typeof fetch, forceRefresh?: boolean }} options
 */
export async function inspectNodes(nodes, env = {}, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const forceRefresh = Boolean(options.forceRefresh);
  const now = Date.now();

  let storageAdapter = null;
  try {
    storageAdapter = StorageFactory.createAdapter(env);
  } catch {
    storageAdapter = null;
  }

  // 1. 解析每个节点的地址与传输层特征
  const parsedEntries = (nodes || []).map((node) => {
    const info = extractProtocolTransportInfo(node?.url);
    return {
      id: String(node?.id || ''),
      url: String(node?.url || ''),
      ...info,
      isDomain: Boolean(info.server) && !isIpAddress(info.server),
    };
  });

  // 2. 域名去重 -> 读缓存 -> DoH 并发解析 -> 写缓存
  const uniqueDomains = Array.from(
    new Set(parsedEntries.filter((e) => e.isDomain && e.server).map((e) => e.server.toLowerCase())),
  );
  const domainResolutionMap = new Map();
  const uncachedDomains = [];

  if (!forceRefresh && storageAdapter && uniqueDomains.length > 0) {
    await runWithConcurrency(uniqueDomains, 10, async (domain) => {
      const cached = await readCacheSafe(storageAdapter, `${DNS_CACHE_PREFIX}${domain}`, now);
      if (cached && typeof cached.ip === 'string') {
        domainResolutionMap.set(domain, {
          ip: cached.ip,
          ips: Array.isArray(cached.ips) ? cached.ips : cached.ip ? [cached.ip] : [],
          recordType: cached.recordType || '',
        });
      } else {
        uncachedDomains.push(domain);
      }
    });
  } else {
    uncachedDomains.push(...uniqueDomains);
  }

  if (uncachedDomains.length > 0) {
    await runWithConcurrency(uncachedDomains, 10, async (domain) => {
      const resolved = await resolveDomainViaDoH(domain, fetchFn);
      domainResolutionMap.set(domain, resolved);
      if (resolved.ip) {
        await writeCacheSafe(storageAdapter, `${DNS_CACHE_PREFIX}${domain}`, {
          ...resolved,
          cachedAt: now,
          expiresAt: now + DNS_CACHE_TTL_MS,
        });
      }
    });
  }

  // 3. 汇总所有解析后的公网 IP -> 读缓存 -> ip-api.com/batch 查询 -> 写缓存
  const uniquePublicIps = Array.from(
    new Set(
      parsedEntries
        .map((entry) => {
          if (!entry.server) return '';
          if (!entry.isDomain) return entry.server;
          return domainResolutionMap.get(entry.server.toLowerCase())?.ip || '';
        })
        .filter((ip) => ip && !isPrivateOrReservedIp(ip)),
    ),
  );

  const ipGeoMap = new Map();
  const uncachedIps = [];

  if (!forceRefresh && storageAdapter && uniquePublicIps.length > 0) {
    await runWithConcurrency(uniquePublicIps, 10, async (ip) => {
      const cached = await readCacheSafe(storageAdapter, `${IP_CACHE_PREFIX}${ip}`, now);
      if (cached && cached.countryCode !== undefined) {
        ipGeoMap.set(ip, cached);
      } else {
        uncachedIps.push(ip);
      }
    });
  } else {
    uncachedIps.push(...uniquePublicIps);
  }

  if (uncachedIps.length > 0) {
    const freshGeoMap = await queryIpGeoBatch(uncachedIps, fetchFn);
    const cacheWrites = [];
    for (const [ip, geo] of freshGeoMap.entries()) {
      ipGeoMap.set(ip, geo);
      cacheWrites.push({ ip, geo });
    }
    if (cacheWrites.length > 0 && storageAdapter) {
      await runWithConcurrency(cacheWrites, 10, async ({ ip, geo }) => {
        await writeCacheSafe(storageAdapter, `${IP_CACHE_PREFIX}${ip}`, {
          ...geo,
          cachedAt: now,
          expiresAt: now + IP_GEO_CACHE_TTL_MS,
        });
      });
    }
  }

  // 4. 组装每个节点的探测结果与 CDN / 中转 / 直连 判定
  const results = {};
  for (const entry of parsedEntries) {
    if (!entry.id) continue;

    const resolvedIp = entry.isDomain
      ? domainResolutionMap.get(entry.server.toLowerCase())?.ip || ''
      : entry.server || '';
    const geo = resolvedIp ? ipGeoMap.get(resolvedIp) || null : null;

    const cdnByCidr = resolvedIp ? detectCdnByCidr(resolvedIp) : '';
    const cdnByAsn = geo ? detectCdnByAsnOrOrg(geo.asFull || geo.asn, geo.org, geo.isp) : '';
    const cdnByFeature = detectCdnByProtocolFeature(entry);

    const countryCode = geo?.countryCode || '';
    const country = getCountryDisplayName(countryCode, geo?.country || '');
    const flag = countryCode ? countryCodeToFlagEmoji(countryCode) : '';

    let networkType = 'unknown';
    let cdnProvider = '';
    let isRelay = false;

    if (cdnByCidr || cdnByAsn) {
      networkType = 'cdn';
      cdnProvider = cdnByCidr || cdnByAsn;
    } else if (countryCode === 'CN') {
      // 国内中转 IP：标为「中转」，避免误打成落地国旗
      networkType = 'relay';
      isRelay = true;
    } else if (cdnByFeature) {
      networkType = 'cdn';
      cdnProvider = 'CDN';
    } else if (resolvedIp) {
      networkType = 'direct';
    }

    results[entry.id] = {
      id: entry.id,
      server: entry.server,
      port: entry.port,
      ip: resolvedIp,
      isDomain: entry.isDomain,
      protocol: entry.protocol,
      network: entry.network,
      isUdpOnly: entry.isUdpOnly,
      countryCode,
      country,
      flag,
      asn: geo?.asn || '',
      org: geo?.org || geo?.isp || '',
      networkType,
      cdnProvider,
      isRelay,
    };
  }

  return results;
}
