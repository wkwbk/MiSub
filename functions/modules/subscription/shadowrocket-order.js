import { urlsToClashProxies } from '../../utils/url-to-clash.js';
import { extractNodeRegion } from '../../utils/geo-utils.js';
import { setNodeName } from '../../utils/node-transformer.js';

const REGIONS = ['美国', '香港', '台湾', '日本', '新加坡', '韩国', '英国', '德国', '法国', '加拿大', '澳大利亚'];

const countryNames =
  typeof Intl?.DisplayNames === 'function' ? new Intl.DisplayNames(['zh-Hans'], { type: 'region' }) : null;
const flagPattern = /^([\u{1F1E6}-\u{1F1FF}]{2})\s*/u;
const shortRegions = { HK: '香港', MO: '澳门' };
const multiplierPattern = /(?:^|[-\s✨])(\d+(?:\.\d+)?\s*(?:x|×|倍))\s*[-–—]?\s*$/iu;

export function compactShadowrocketNodeName(original) {
  const text = String(original || '').trim();
  if (!text) return '节点';
  if (/到期|剩余流量|流量剩余/.test(text))
    return text
      .replace(/[,="\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const flag = text.match(flagPattern)?.[1];
  let shownFlag = flag === '🇺🇲' ? '🇺🇸' : flag;
  if (shownFlag === '🇮🇳' && text.includes('印度尼西亚')) shownFlag = '🇮🇩';
  const multiplier = text.match(multiplierPattern)?.[1];
  const labels = text
    .replace(multiplierPattern, '')
    .replace(flagPattern, '')
    .replace(/移动优化|[[\]【】✨]/gu, '')
    .replace(/\s*[-–—|]+\s*/g, '-')
    .replace(/^[\s-]+|[\s-]+$/g, '');
  let name = labels;
  if (shownFlag && countryNames) {
    const regionCode = [...shownFlag].map((char) => String.fromCharCode(char.codePointAt(0) - 0x1f1e6 + 65)).join('');
    try {
      const country = shortRegions[regionCode] || countryNames.of(regionCode);
      if (country) {
        const escaped = country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const countryLabel = new RegExp(`(^|[-\\s])${escaped}(?:地区)?(?=$|[-\\s]|[0-9]|家宽)`, 'gu');
        name = labels
          .replace(countryLabel, '$1')
          .replace(/\s*--+\s*/g, '-')
          .replace(/^[\s-]+|[\s-]+$/g, '');
      }
    } catch {
      // Ignore invalid flag sequences
    }
  }
  name = name
    .replace(/[,="\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [shownFlag, name || '节点', multiplier].filter(Boolean).join(' ');
}

export function safeShadowrocketName(rawName) {
  const clean = String(rawName || 'Untitled')
    .replace(/[\r\n]/g, ' ')
    .replace(/[,="\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || 'Untitled';
}

export function shadowrocketProxyNames(proxies, reserved = [], { compact = true } = {}) {
  const used = new Set(
    [...reserved, 'DIRECT', 'PROXY', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE'].map((name) =>
      String(name || '').toLowerCase(),
    ),
  );
  const names = proxies.map((proxy) =>
    compact ? compactShadowrocketNodeName(proxy?.name) : safeShadowrocketName(proxy?.name),
  );
  const unchanged = names
    .map((name, index) => (name === proxies[index]?.name ? index : -1))
    .filter((index) => index !== -1);
  const order = [...unchanged, ...names.flatMap((name, index) => (name !== proxies[index]?.name ? [index] : []))];
  for (const index of order) {
    const base = names[index] || '节点';
    let name = base;
    let serial = 2;
    while (used.has(name.toLowerCase())) name = `${base} (${serial++})`;
    names[index] = name;
    used.add(name.toLowerCase());
  }
  return names;
}

function identity(proxy) {
  if (!proxy || !proxy.server) return '';
  return JSON.stringify([
    String(proxy.type || '').toLowerCase(),
    String(proxy.server).toLowerCase(),
    proxy.uuid || proxy.password || '',
    proxy.username || '',
  ]);
}

export function manualProxyKeys(sources = []) {
  return (Array.isArray(sources) ? sources : [])
    .filter(
      (source) =>
        source &&
        source.enabled !== false &&
        !source.isFromSubProfile &&
        typeof source.url === 'string' &&
        !/^https?:\/\//i.test(source.url.trim()),
    )
    .sort(
      (a, b) => Number(/洛杉矶|los\s*angeles/i.test(b.name || '')) - Number(/洛杉矶|los\s*angeles/i.test(a.name || '')),
    )
    .flatMap((source) => urlsToClashProxies([source.url], { addFlagEmoji: false }).map(identity))
    .filter(Boolean);
}

export function sortShadowrocketProxies(proxies, preferredKeys = []) {
  const ranks = new Map((Array.isArray(preferredKeys) ? preferredKeys : []).map((key, index) => [key, index]));
  const rank = (proxy) => {
    const key = identity(proxy);
    if (key && ranks.has(key)) return ranks.get(key) - preferredKeys.length - 1;
    if (
      /到期|剩余|流量|过期/.test(proxy?.name || '') &&
      ['http', 'trojan'].includes(String(proxy?.type || '').toLowerCase())
    ) {
      return 1000;
    }
    const region = extractNodeRegion(proxy?.name || '');
    const index = REGIONS.indexOf(region);
    return index < 0 ? 100 : index;
  };
  return [...(Array.isArray(proxies) ? proxies : [])].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 100 ? extractNodeRegion(a?.name || '').localeCompare(extractNodeRegion(b?.name || ''), 'zh-CN') : 0),
  );
}

export function sortShadowrocketNodeList(nodeList, preferredKeys = [], { compactNames = false } = {}) {
  const entries = String(nodeList || '')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const proxy = urlsToClashProxies([line], { addFlagEmoji: false })[0];
      return { ...(proxy || { name: '', type: 'unknown' }), line };
    });
  const ordered = sortShadowrocketProxies(entries, preferredKeys);
  const names = compactNames
    ? shadowrocketProxyNames(
        ordered.filter((entry) => entry.name),
        [],
        { compact: true },
      )
    : [];
  let namedIndex = 0;
  return (
    ordered
      .map((entry) => {
        if (!compactNames || !entry.name) return entry.line;
        const name = names[namedIndex++];
        return name === entry.name ? entry.line : setNodeName(entry.line, entry.type, name);
      })
      .join('\n') + (entries.length ? '\n' : '')
  );
}
