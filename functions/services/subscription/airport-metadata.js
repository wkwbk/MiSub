/**
 * 机场订阅元信息解析（Profile-Title / Subscription-Userinfo / 官网标题探测 / 真实代理协议判定）
 */

import { isLocalProxyEndpoint } from '../../utils/node-utils.js';
import { inferAirportRootDomain } from '../../../shared/airport-domain.js';

export { inferAirportRootDomain };

const REAL_PROXY_PROTOCOLS = [
  'ss://',
  'ssr://',
  'vmess://',
  'vless://',
  'trojan://',
  'hysteria://',
  'hysteria2://',
  'hy2://',
  'tuic://',
  'anytls://',
  'socks5://',
  'socks://',
  'http://',
  'https://',
  'naive+https://',
  'naive+quic://',
  'wireguard://',
  'mierus://',
  'v2rayn://',
];

/**
 * 判断是否是真实代理节点，排除流量/到期/公告等系统伪节点
 */
export function isRealProxyNode(node) {
  if (typeof node !== 'string') return false;
  const trimmed = node.trim().toLowerCase();
  if (!trimmed) return false;
  if (isLocalProxyEndpoint(trimmed)) return false;
  return REAL_PROXY_PROTOCOLS.some((protocol) => trimmed.startsWith(protocol));
}

/**
 * 从订阅响应头中解析机场自报的名称（profile-title / content-disposition）。
 *
 * 这是目前最可靠的机场标识来源——由机场服务端自己声明，不依赖域名猜测。
 * 常见形式：
 *   Profile-Title: base64:<b64(名称)>     （Clash/mihomo 生态的约定）
 *   Profile-Title: 名称                   （部分实现直接放明文）
 *   Content-Disposition: attachment; filename*=UTF-8''名称
 *
 * @param {Headers|Object} headers 响应头（fetch Headers 或普通对象）
 * @returns {string} 解析出的名称，取不到时返回空字符串
 */
export function parseSubscriptionProfileTitle(headers) {
  const read = (name) => {
    if (!headers) return '';
    try {
      if (typeof headers.get === 'function') return headers.get(name) || '';
    } catch {}
    const lower = name.toLowerCase();
    for (const key of Object.keys(headers || {})) {
      if (key.toLowerCase() === lower) return String(headers[key] || '');
    }
    return '';
  };

  const decodeBase64 = (value) => {
    try {
      const binary = atob(value);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return '';
    }
  };

  // 1. profile-title（首选）
  let raw = String(read('profile-title') || '').trim();
  if (raw) {
    if (/^base64:/i.test(raw)) {
      const decoded = decodeBase64(raw.slice(7).trim());
      if (decoded) return decoded.trim();
    } else {
      return raw;
    }
  }

  // 2. content-disposition 的 filename*
  const disposition = String(read('content-disposition') || '');
  if (disposition) {
    const utf8 = disposition.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i);
    if (utf8) {
      try {
        return decodeURIComponent(utf8[1].trim()).trim();
      } catch {}
    }
    const plain = disposition.match(/filename\s*=\s*"?([^";]+)"?/i);
    if (plain) {
      const name = plain[1].trim();
      // 过滤掉通用占位名与纯扩展名
      if (name && !/^(subscription|config|clash|sub)\.(yaml|yml|txt|conf)$/i.test(name)) {
        return name.replace(/\.(yaml|yml|txt|conf)$/i, '').trim();
      }
    }
  }

  return '';
}

/**
 * 抓取机场官网标题，作为品牌名的兜底识别来源。
 *
 * 仅当响应头没有自报名称时才调用，避免不必要的请求开销。
 * 站点标题常见形态：`GsafeVPN` / `Wayne's Portal` / `Notice`
 * 需要过滤掉 Cloudflare 拦截页、默认停机页等噪声。
 *
 * @param {string} rootDomain 机场主域名
 * @param {Object} [options]
 * @param {number} [options.timeout=5000] 超时（毫秒）
 * @returns {Promise<string>} 品牌名，取不到时返回空字符串
 */
const NOISY_SITE_TITLES = [
  /^attention required/i,
  /^just a moment/i,
  /cloudflare$/i,
  /^notice$/i,
  /^welcome$/i,
  /^index$/i,
  /^home$/i,
  /^site not found/i,
  /^404/i,
  /^error/i,
  /^nginx$/i,
  /^apache/i,
  /^default/i,
  /^域名/i,
  /^未找到/i,
];

export async function fetchAirportSiteTitle(rootDomain, options = {}) {
  const { timeout = 5000 } = options;
  const domain = String(rootDomain || '').trim();
  if (!domain || !domain.includes('.')) return '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`https://${domain}/`, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) return '';

    // 只读前 64KB，标题一定在 <head> 里
    const text = (await response.text()).slice(0, 65536);
    const match = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) return '';

    const title = match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    if (!title || title.length > 60) return '';
    if (NOISY_SITE_TITLES.some((re) => re.test(title))) return '';
    return title;
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解析 subscription-userinfo 响应头（流量信息）
 * @param {string} header
 * @returns {Object|null}
 */
export function parseSubscriptionUserInfoHeader(header) {
  if (typeof header !== 'string' || !header.trim()) return null;

  const info = {};
  header.split(';').forEach((part) => {
    const [rawKey, rawValue] = part.trim().split('=');
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (!key || value === undefined || value === '') return;
    info[key] = /^\d+$/.test(value) ? Number(value) : value;
  });

  return Object.keys(info).length > 0 ? info : null;
}
