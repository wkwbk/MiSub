import { base64ToUtf8 } from '../utils/base64.js';
import { getV2raynRemarks, isV2raynUrl } from '../protocols/v2rayn-utils.js';

/**
 * 从节点链接或订阅链接中提取名称（通用无端依赖实现）
 */
export function extractNodeName(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  try {
    if (isV2raynUrl(trimmed)) {
      return getV2raynRemarks(trimmed) || '';
    }
    const hashIndex = trimmed.indexOf('#');
    if (hashIndex !== -1 && hashIndex < trimmed.length - 1) {
      return decodeURIComponent(trimmed.substring(hashIndex + 1)).trim();
    }
    const protocolIndex = trimmed.indexOf('://');
    if (protocolIndex === -1) return '';
    const protocol = trimmed.substring(0, protocolIndex);
    const mainPart = trimmed.substring(protocolIndex + 3).split('#')[0];
    switch (protocol) {
      case 'vmess': {
        try {
          const jsonString = base64ToUtf8(mainPart);
          const node = JSON.parse(jsonString) as { ps?: unknown };
          return typeof node.ps === 'string' ? node.ps : '';
        } catch {
          return '';
        }
      }
      case 'trojan':
      case 'vless':
        return mainPart.substring(mainPart.indexOf('@') + 1).split(':')[0] || '';
      case 'ss': {
        const atIndexSS = mainPart.indexOf('@');
        if (atIndexSS !== -1) return mainPart.substring(atIndexSS + 1).split(':')[0] || '';
        try {
          let base64Part = mainPart;
          if (base64Part.includes('%')) {
            base64Part = decodeURIComponent(base64Part);
          }
          const decodedSS = atob(base64Part);
          const ssDecodedAtIndex = decodedSS.indexOf('@');
          if (ssDecodedAtIndex !== -1) return decodedSS.substring(ssDecodedAtIndex + 1).split(':')[0] || '';
        } catch {
          // Ignore malformed SS base64 segment
        }
        return '';
      }
      default:
        if (trimmed.startsWith('http')) return new URL(trimmed).hostname;
        return '';
    }
  } catch {
    return trimmed.substring(0, 50);
  }
}
