/**
 * 机场主域名推断（前后端共享纯逻辑）
 *
 * 机场订阅常挂在子域名上，去掉子域前缀后取主域名，用于品牌识别与官网跳转。
 * 注意：CDN / 托管平台域名（pages.dev、workers.dev、githubusercontent.com 等）
 * 不属于机场自有域名，返回空字符串。
 */

const NON_AIRPORT_HOSTS = [
    /\.pages\.dev$/i,
    /\.workers\.dev$/i,
    /\.vercel\.app$/i,
    /\.netlify\.app$/i,
    /\.githubusercontent\.com$/i,
    /\.github\.io$/i,
    /\.r2\.dev$/i,
    /\.trafficmanager\.net$/i,
    /\.cloudfront\.net$/i,
    /\.herokuapp\.com$/i,
    /\.onrender\.com$/i,
];

const MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
    'com.cn',
    'net.cn',
    'org.cn',
    'gov.cn',
    'com.hk',
    'com.tw',
    'co.uk',
    'org.uk',
    'me.uk',
    'ac.uk',
    'gov.uk',
    'com.au',
    'net.au',
    'org.au',
    'co.jp',
    'co.kr',
    'co.nz',
    'com.sg',
    'appspot.com',
]);

/**
 * 从订阅 URL 推断机场主域名
 * @param {string} sourceUrl 订阅源地址
 * @returns {string} 主域名，无法推断时返回空字符串
 */
export function inferAirportRootDomain(sourceUrl) {
    const raw = String(sourceUrl || '').trim();
    if (!/^https?:\/\//i.test(raw)) return '';

    try {
        const host = new URL(raw).hostname.toLowerCase();
        if (!host.includes('.')) return '';
        if (NON_AIRPORT_HOSTS.some((re) => re.test(host))) return '';

        const parts = host.split('.');
        const suffix = parts.slice(-2).join('.');
        const rootLabelCount = MULTI_LABEL_PUBLIC_SUFFIXES.has(suffix) ? 3 : 2;
        const base = parts.length >= 3 ? parts.slice(-rootLabelCount) : parts;

        const root = base.join('.');
        return root.split('.').length >= 2 ? root : '';
    } catch {
        return '';
    }
}
