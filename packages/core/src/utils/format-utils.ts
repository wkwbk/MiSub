/**
 * 前后端共享格式化与协议格式判断工具
 * @author MiSub Team
 */

/**
 * 格式化字节大小
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (!+bytes || bytes < 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * 格式化日期时间
 */
export function formatDate(date: Date | string | number | null | undefined, format = 'datetime'): string {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '无效日期';

  const now = new Date();
  const diff = now.getTime() - d.getTime();

  switch (format) {
    case 'date':
      return d.toLocaleDateString('zh-CN');
    case 'time':
      return d.toLocaleTimeString('zh-CN');
    case 'datetime':
      return d.toLocaleString('zh-CN');
    case 'relative':
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
      if (diff < 2592000000) return `${Math.floor(diff / 86400000)}天前`;
      return d.toLocaleDateString('zh-CN');
    default:
      return d.toLocaleString('zh-CN');
  }
}

/**
 * 格式化数字为千分位
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 格式化百分比
 */
export function formatPercentage(value: number, total: number, decimals = 1): string {
  if (!total || total === 0) return '0%';
  const percentage = (value / total) * 100;
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * 格式化持续时间
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0秒';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}秒`);

  return parts.join(' ');
}

/**
 * 截断文本并添加省略号
 */
export function truncateText(text: string, maxLength = 50): string {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * 格式化URL为显示格式
 */
export function formatUrl(url: string, maxLength = 50): string {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    const display = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname !== '/' ? urlObj.pathname : ''}`;
    return truncateText(display, maxLength);
  } catch {
    return truncateText(url, maxLength);
  }
}

/**
 * 检测字符串是否为有效的Base64格式
 */
export function isValidBase64(str: string): boolean {
  if (!str || typeof str !== 'string') return false;

  // 去除空白字符，保证纯粹的Base64内容
  const cleanStr = str.replace(/\s/g, '');
  if (!cleanStr) return false;

  // 标准化 Base64URL 中的 -_/ 并补全 padding
  let normalized = cleanStr.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  if (padding) {
    normalized += '='.repeat(4 - padding);
  }

  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  return base64Regex.test(normalized) && normalized.length > 20;
}

/**
 * 根据客户端类型确定合适的用户代理
 * 参考CF-Workers-SUB的优雅策略：统一使用v2rayN UA获取订阅，简单而有效
 */
export function getProcessedUserAgent(originalUserAgent: string, url = ''): string {
  if (!originalUserAgent) return originalUserAgent;

  const rawUrl = typeof url === 'string' ? url : '';
  try {
    const parsedUrl = new URL(rawUrl);
    const params = parsedUrl.searchParams;
    if (params.has('clash') || params.get('target')?.toLowerCase() === 'clash') {
      return 'clash-verge/v2.4.3';
    }
  } catch {
    if (/[?&](?:clash(?:=|&|$)|target=clash(?:&|$))/i.test(rawUrl)) {
      return 'clash-verge/v2.4.3';
    }
  }

  // CF-Workers-SUB的精华策略：
  // 默认使用 v2rayN UA 获取订阅，绕过多数机场过滤同时保证获取完整节点。
  // 个别 Clash 专用链接（如 ?clash=2）会严格校验 UA，需要保留 Clash UA。
  return 'v2rayN/7.23';
}

/**
 * 根据User Agent确定客户端格式
 */
export function determineFormatByUserAgent(userAgentHeader: string): string {
  const ua = userAgentHeader.toLowerCase();
  // 使用陣列來保證比對的優先順序
  const uaMapping: Array<[string, string]> = [
    // Mihomo/Meta 核心的客戶端 - 需要clash格式
    ['flyclash', 'clash'],
    ['mihomo', 'clash'],
    ['clash.meta', 'clash'],
    ['clash-verge', 'clash'],
    ['meta', 'clash'],

    // 其他客戶端
    ['stash', 'clash'],
    ['egern', 'clash'],
    ['nekoray', 'clash'],
    ['sing-box', 'singbox'],
    ['shadowrocket', 'clash'],
    ['v2rayn', 'base64'],
    ['v2rayng', 'base64'],
    ['surge', 'surge'],
    ['loon', 'loon'],
    ['quantumult x', 'quanx'],
    ['quantumult%20x', 'quanx'],
    ['quantumult-x', 'quanx'],
    ['quantumult', 'quanx'],

    // 最後才匹配通用的 clash，作為向下相容
    ['clash', 'clash'],
  ];

  for (const [keyword, format] of uaMapping) {
    if (ua.includes(keyword)) {
      return format;
    }
  }
  return 'base64';
}

/**
 * 从URL参数中确定目标格式
 */
export function determineFormatByUrl(url: URL): string | null {
  let targetFormat = url.searchParams.get('target');
  if (!targetFormat) {
    const supportedFormats = ['clash', 'singbox', 'surge', 'loon', 'quanx', 'base64', 'v2ray', 'trojan', 'egern'];
    for (const format of supportedFormats) {
      if (url.searchParams.has(format)) {
        if (format === 'v2ray' || format === 'trojan') {
          targetFormat = 'base64';
        } else {
          targetFormat = format;
        }
        break;
      }
    }
  }
  return targetFormat;
}
