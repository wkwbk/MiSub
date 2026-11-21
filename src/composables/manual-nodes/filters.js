import { NODE_PROTOCOL_REGEX } from '@/constants/node-protocols.js';
import { getItemTags, matchesTagFilter } from '@/utils/tags.js';

export const countryCodeMap = {
  hk: ['🇭🇰', '香港', 'HK'],
  tw: ['🇨🇳', '台湾', '臺灣'],
  sg: ['🇸🇬', '新加坡', '狮城'],
  jp: ['🇯🇵', '日本'],
  us: ['🇺🇸', '美国', '美國'],
  kr: ['🇰🇷', '韩国', '韓國'],
  gb: ['🇬🇧', '英国', '英國'],
  de: ['🇩🇪', '德国', '德國'],
  fr: ['🇫🇷', '法国', '法國'],
  ca: ['🇨🇦', '加拿大'],
  au: ['🇦🇺', '澳大利亚', '澳洲', '澳大利亞'],
  cn: ['🇨🇳', '中国', '大陸', '内地'],
  my: ['🇲🇾', '马来西亚', '馬來西亞'],
  th: ['🇹🇭', '泰国', '泰國'],
  vn: ['🇻🇳', '越南'],
  ph: ['🇵🇭', '菲律宾', '菲律賓'],
  id: ['🇮🇩', '印度尼西亚', '印尼'],
  in: ['🇮🇳', '印度'],
  pk: ['🇵🇰', '巴基斯坦'],
  bd: ['🇧🇩', '孟加拉国', '孟加拉國'],
  ae: ['🇦🇪', '阿联酋', '阿聯酋'],
  sa: ['🇸🇦', '沙特阿拉伯'],
  tr: ['🇹🇷', '土耳其'],
  ru: ['🇷🇺', '俄罗斯', '俄羅斯'],
  br: ['🇧🇷', '巴西'],
  mx: ['🇲🇽', '墨西哥'],
  ar: ['🇦🇷', '阿根廷'],
  cl: ['🇨🇱', '智利'],
  za: ['🇿🇦', '南非'],
  eg: ['🇪🇬', '埃及'],
  ng: ['🇳🇬', '尼日利亚', '尼日利亞'],
  ke: ['🇰🇪', '肯尼亚', '肯尼亞'],
  il: ['🇮🇱', '以色列'],
  ir: ['🇮🇷', '伊朗'],
  iq: ['🇮🇶', '伊拉克'],
  ua: ['🇺🇦', '乌克兰', '烏克蘭'],
  pl: ['🇵🇱', '波兰', '波蘭'],
  cz: ['🇨🇿', '捷克'],
  hu: ['🇭🇺', '匈牙利'],
  ro: ['🇷🇴', '罗马尼亚', '羅馬尼亞'],
  gr: ['🇬🇷', '希腊', '希臘'],
  pt: ['🇵🇹', '葡萄牙'],
  es: ['🇪🇸', '西班牙'],
  it: ['🇮🇹', '意大利'],
  nl: ['🇳🇱', '荷兰', '荷蘭'],
  be: ['🇧🇪', '比利时', '比利時'],
  se: ['🇸🇪', '瑞典'],
  no: ['🇳🇴', '挪威'],
  dk: ['🇩🇰', '丹麦', '丹麥'],
  fi: ['🇫🇮', '芬兰', '芬蘭'],
  ch: ['🇨🇭', '瑞士'],
  at: ['🇦🇹', '奥地利', '奧地利'],
  ie: ['🇮🇪', '爱尔兰', '愛爾蘭'],
  nz: ['🇳🇿', '新西兰', '紐西蘭'],
};

export function isManualNodeEntry(item) {
  if (!item.url) return false;
  if (typeof item.url !== 'string') return false;

  const trimmedUrl = item.url.trim();
  if (!trimmedUrl) return false;

  if (!/^https?:\/\//i.test(trimmedUrl)) return NODE_PROTOCOL_REGEX.test(trimmedUrl);

  try {
    const parsed = new URL(trimmedUrl);
    return Boolean(parsed.username && parsed.password && parsed.hostname && parsed.port);
  } catch {
    return false;
  }
}

export const PROTOCOL_LABELS = {
  anytls: 'AnyTLS',
  vless: 'VLESS',
  hysteria2: 'HY2',
  hysteria: 'Hysteria',
  tuic: 'TUIC',
  trojan: 'TROJAN',
  ssr: 'SSR',
  ss: 'SS',
  vmess: 'VMESS',
  socks5: 'SOCKS5',
  http: 'HTTP',
  snell: 'SNELL',
  naive: 'NAIVE',
};

export function getManualNodeProtocol(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  const lowerUrl = url.trim().toLowerCase();
  if (lowerUrl.startsWith('anytls://')) return 'anytls';
  if (lowerUrl.startsWith('hysteria2://') || lowerUrl.startsWith('hy2://')) return 'hysteria2';
  if (lowerUrl.startsWith('hysteria://') || lowerUrl.startsWith('hy://')) return 'hysteria';
  if (lowerUrl.startsWith('ssr://')) return 'ssr';
  if (lowerUrl.startsWith('tuic://')) return 'tuic';
  if (lowerUrl.startsWith('ss://')) return 'ss';
  if (lowerUrl.startsWith('vmess://')) return 'vmess';
  if (lowerUrl.startsWith('vless://')) return 'vless';
  if (lowerUrl.startsWith('trojan://')) return 'trojan';
  if (lowerUrl.startsWith('socks5://') || lowerUrl.startsWith('socks://')) return 'socks5';
  if (lowerUrl.startsWith('snell://')) return 'snell';
  if (
    lowerUrl.startsWith('naive+https://') ||
    lowerUrl.startsWith('naive+http://') ||
    lowerUrl.startsWith('naive+quic://')
  ) {
    return 'naive';
  }
  if (lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://')) return 'http';
  return 'unknown';
}

export function getManualNodeProtocolLabel(protocol) {
  return PROTOCOL_LABELS[protocol] || String(protocol || 'LINK').toUpperCase();
}

export function matchesNodeAttributeFilters(node, attrFilters = null, inspectMap = null) {
  if (!attrFilters || typeof attrFilters !== 'object') return true;
  const protocolFilter = String(attrFilters.protocol || '')
    .trim()
    .toLowerCase();
  const countryFilter = String(attrFilters.country || '')
    .trim()
    .toUpperCase();
  const networkFilter = String(attrFilters.network || '')
    .trim()
    .toLowerCase();

  if (protocolFilter && getManualNodeProtocol(node?.url) !== protocolFilter) {
    return false;
  }

  if (countryFilter || networkFilter) {
    const info = inspectMap?.[node?.id];
    if (!info) return false;
    if (countryFilter) {
      if (info.isRelay || String(info.countryCode || '').toUpperCase() !== countryFilter) {
        return false;
      }
    }
    if (networkFilter) {
      const nodeNetwork = info.isRelay ? 'relay' : String(info.networkType || '').toLowerCase();
      if (nodeNetwork !== networkFilter) {
        return false;
      }
    }
  }

  return true;
}

export function collectNodeAttributeOptions(nodes, inspectMap = {}) {
  const list = Array.isArray(nodes) ? nodes : [];
  const protocolCounts = new Map();
  const countryCounts = new Map();
  const networkCounts = new Map();

  for (const node of list) {
    const proto = getManualNodeProtocol(node?.url);
    if (proto && proto !== 'unknown') {
      protocolCounts.set(proto, (protocolCounts.get(proto) || 0) + 1);
    }

    const info = inspectMap?.[node?.id];
    if (!info) continue;

    if (!info.isRelay && info.countryCode) {
      const code = String(info.countryCode).toUpperCase();
      const existing = countryCounts.get(code);
      if (existing) {
        existing.count += 1;
      } else {
        const label = info.country && info.country !== code ? info.country : code;
        countryCounts.set(code, {
          value: code,
          label: info.flag && label !== code ? `${info.flag} ${label}` : label,
          count: 1,
        });
      }
    }

    const net = info.isRelay ? 'relay' : String(info.networkType || '').toLowerCase();
    if (net === 'direct' || net === 'cdn' || net === 'relay') {
      networkCounts.set(net, (networkCounts.get(net) || 0) + 1);
    }
  }

  const protocols = Array.from(protocolCounts.entries())
    .map(([value, count]) => ({ value, label: getManualNodeProtocolLabel(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const countries = Array.from(countryCounts.values()).sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value),
  );

  const networkOrder = ['direct', 'cdn', 'relay'];
  const networks = networkOrder
    .filter((key) => (networkCounts.get(key) || 0) > 0)
    .map((value) => ({ value, count: networkCounts.get(value) }));

  return { protocols, countries, networks };
}

export function filterManualNodes(nodes, searchTerm, activeTagFilters, attrFilters = null, inspectMap = null) {
  let filtered = Array.isArray(nodes) ? nodes : [];

  filtered = filtered.filter(
    (node) => matchesTagFilter(node, activeTagFilters) && matchesNodeAttributeFilters(node, attrFilters, inspectMap),
  );

  if (!searchTerm) {
    return filtered;
  }

  const searchQuery = searchTerm.toLowerCase().trim();
  if (!searchQuery) {
    return filtered;
  }
  const alternativeTerms = countryCodeMap[searchQuery] || [];

  return filtered.filter((node) => {
    const nodeName = String(node.name || '').toLowerCase();
    if (nodeName && nodeName.includes(searchQuery)) return true;
    for (const altTerm of alternativeTerms) {
      if (nodeName && nodeName.includes(altTerm.toLowerCase())) return true;
    }
    const tags = getItemTags(node);
    if (tags.some((tag) => tag.toLowerCase().includes(searchQuery))) return true;

    const info = inspectMap?.[node?.id];
    if (info) {
      if (info.ip && String(info.ip).toLowerCase().includes(searchQuery)) return true;
      if (info.country && String(info.country).toLowerCase().includes(searchQuery)) return true;
      if (info.countryCode && String(info.countryCode).toLowerCase() === searchQuery) return true;
    }

    return false;
  });
}
