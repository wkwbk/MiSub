/**
 * 节点解析工具模块（前后端共享 Single Source of Truth）
 */

import * as yaml from 'js-yaml';
import type { ClashProxy, NodeMetadata, ParsedNodeInfo } from '../types.js';
import { calculateRegionStats, parseNodeInfo } from './geo-utils.js';
import { fixNodeUrlEncoding } from './node-cleaner.js';
import { extractNodeMetadata } from './metadata-extractor.js';
import { NODE_PROTOCOL_REGEX } from '../protocols/constants.js';
import { convertClashProxyToUrl } from '../protocols/clash-to-url.js';
import { extractSingboxNodes } from '../protocols/singbox-to-url.js';
import { fixSS2022Node, validateSS2022Node } from '../protocols/ss2022-validator.js';
import { parseV2rayNLink } from '../protocols/v2rayn-parser.js';
import { parseSurgeLine } from '../protocols/surge-parser.js';
import { parseQuantumultXLine } from '../protocols/quantumultx-parser.js';

export { NODE_PROTOCOL_REGEX, calculateRegionStats };

export interface ParsedNodeItem extends ParsedNodeInfo {
  metadata: NodeMetadata;
  warning?: Record<string, unknown>;
}

export interface SnellValidationResult {
  valid: boolean;
  error?: string;
  details?: Record<string, unknown>;
  proxy?: ClashProxy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * 从文本中提取所有有效的节点 URL
 * 支持：Clash YAML, Sing-box JSON, Base64, 纯文本列表, Surge/QX 参数文本
 */
export function extractValidNodes(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  let nodes: string[] = [];

  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const jsonObj: unknown = JSON.parse(trimmed);
      if (isRecord(jsonObj) && Array.isArray(jsonObj.outbounds)) {
        nodes = extractSingboxNodes(jsonObj);
        if (nodes.length > 0) return nodes;
      }
    } catch (e) {
      console.debug('[NodeParser] JSON parse failed, trying other formats:', e);
    }
  }

  const lowerText = text.toLowerCase();
  if (/\bproxies\s*:/.test(lowerText)) {
    try {
      const loaded = yaml.load(text);
      const yamlObj = isRecord(loaded) ? loaded : null;
      const proxies = yamlObj?.proxies || yamlObj?.Proxy;

      if (Array.isArray(proxies)) {
        proxies.forEach((proxy) => {
          const url = convertClashProxyToUrl(proxy);
          if (url) nodes.push(url);
        });
        if (nodes.length > 0) return nodes;
      }
    } catch (e) {
      console.debug('[NodeParser] YAML parse failed, trying other formats:', e);
    }
  }

  let processedText = text;
  try {
    const cleanedText = text.replace(/\s/g, '');
    let normalized = cleanedText.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;
    if (padding) {
      normalized += '='.repeat(4 - padding);
    }
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    if (base64Regex.test(normalized) && normalized.length > 20) {
      const binaryString = atob(normalized);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      processedText = new TextDecoder('utf-8').decode(bytes);
    }
  } catch (e) {
    console.debug('[NodeParser] Base64 decode failed, using raw text:', e);
  }

  const lines = processedText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim());

  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    if (/^v2rayn:\/\//i.test(line)) {
      const converted = parseV2rayNLink(line);
      nodes.push(converted || line);
      continue;
    }

    if (NODE_PROTOCOL_REGEX.test(line)) {
      nodes.push(line);
      continue;
    }

    const surgeNode = parseSurgeLine(line);
    if (surgeNode?.url) {
      nodes.push(surgeNode.url);
      continue;
    }

    const qxNode = parseQuantumultXLine(line, { allowUntitled: true });
    if (qxNode?.url) {
      nodes.push(qxNode.url);
    }
  }

  return nodes;
}

/**
 * 支持的 Shadowsocks 加密算法
 */
const SUPPORTED_SS_CIPHERS = [
  'none',
  'aes-128-gcm',
  'aes-256-gcm',
  'chacha20-poly1305',
  'chacha20-ietf-poly1305',
  'xchacha20-ietf-poly1305',
  '2022-blake3-aes-128-gcm',
  '2022-blake3-aes-256-gcm',
  '2022-blake3-chacha20-poly1305',
];

/**
 * 解析节点列表 (用于预览和计数)
 */
export function parseNodeList(content: string, options: { plusAsSpace?: boolean } = {}): ParsedNodeItem[] {
  const validNodes = extractValidNodes(content);

  return validNodes
    .map((nodeUrl): ParsedNodeItem | null => {
      let fixedUrl = fixNodeUrlEncoding(nodeUrl, options);

      let ss2022Warning: Record<string, unknown> | null = null;
      if (fixedUrl.startsWith('ss://')) {
        let method = '';
        try {
          let body = fixedUrl.substring(5);
          const hashIndex = body.indexOf('#');
          if (hashIndex !== -1) body = body.substring(0, hashIndex);

          const atIndex = body.lastIndexOf('@');
          if (atIndex !== -1 && !body.includes('://')) {
            const userInfo = body.substring(0, atIndex);
            if (userInfo.includes(':')) {
              method = userInfo.split(':')[0];
            } else {
              try {
                const decodedUser = atob(userInfo);
                if (decodedUser.includes(':')) method = decodedUser.split(':')[0];
              } catch (e) {
                console.debug('[NodeParser] Failed to decode SS user info:', e);
              }
            }
          } else {
            try {
              const decoded = atob(body);
              if (decoded.includes('@')) {
                const userInfo = decoded.split('@')[0];
                if (userInfo.includes(':')) method = userInfo.split(':')[0];
              }
            } catch (e) {
              if (atIndex !== -1) {
                const userInfoBase64 = body.substring(0, atIndex);
                try {
                  const decodedUser = atob(userInfoBase64);
                  if (decodedUser.includes(':')) method = decodedUser.split(':')[0];
                } catch (e2) {
                  console.debug('[NodeParser] Failed to decode SS user info fallback:', e2);
                }
              } else {
                console.debug('[NodeParser] Failed to decode SS payload:', e);
              }
            }
          }
        } catch (e) {
          console.debug('[NodeParser] Failed to extract SS cipher:', e);
        }

        if (method) {
          const normalizedMethod = method.toLowerCase();
          if (!SUPPORTED_SS_CIPHERS.includes(normalizedMethod)) {
            return null;
          }
        }

        const validation = validateSS2022Node(fixedUrl);

        if (!validation.valid && validation.details?.suggestedCipher) {
          const fixResult = fixSS2022Node(fixedUrl);
          if (fixResult.fixed && fixResult.fixedUrl && fixResult.changes) {
            fixedUrl = fixResult.fixedUrl;
            ss2022Warning = {
              type: 'ss2022_auto_fixed',
              message: `已自动修复: ${fixResult.changes.from} → ${fixResult.changes.to}`,
              originalCipher: fixResult.changes.from,
              fixedCipher: fixResult.changes.to,
            };
            console.warn(`[SS 2022] 自动修复节点: ${fixResult.changes.reason}`);
          } else {
            ss2022Warning = {
              type: 'ss2022_invalid',
              message: validation.error,
              details: validation.details,
            };
            console.error(`[SS 2022] 节点验证失败:`, validation.details);
          }
        } else if (validation.warning) {
          ss2022Warning = {
            type: 'ss2022_warning',
            message: validation.warning,
          };
        }
      }

      const nodeInfo = parseNodeInfo(fixedUrl);

      let isValidNode = true;
      if (nodeInfo.protocol === 'vless') {
        let id = null;
        const matchStandard = fixedUrl.match(/^vless:\/\/([0-9a-fA-F-]{36})@/);

        if (matchStandard) {
          id = matchStandard[1];
        } else {
          const matchAnyUser = fixedUrl.match(/^vless:\/\/([^@]+)@/);
          if (matchAnyUser) {
            const userPart = matchAnyUser[1];
            const base64Regex = /^[A-Za-z0-9+/=_-]+$/;
            if (userPart.length > 40 && base64Regex.test(userPart)) {
              try {
                let safeBody = userPart.replace(/-/g, '+').replace(/_/g, '/');
                while (safeBody.length % 4) {
                  safeBody += '=';
                }
                id = atob(safeBody);
              } catch {
                id = userPart;
              }
            } else {
              id = userPart;
            }
          }
        }

        if (id && String(id).startsWith('auto:')) {
          isValidNode = false;
        }
      } else if (nodeInfo.protocol === 'vmess') {
        if (fixedUrl.startsWith('vmess://')) {
          try {
            const base64Part = fixedUrl.substring(8);
            let safeBody = base64Part.replace(/-/g, '+').replace(/_/g, '/');
            while (safeBody.length % 4) {
              safeBody += '=';
            }
            const jsonStr = atob(safeBody);
            const config = JSON.parse(jsonStr);
            if (config && config.id && String(config.id).startsWith('auto:')) {
              isValidNode = false;
            }
          } catch (e) {
            console.debug('[NodeParser] VMess decode failed, keeping original node:', e);
          }
        }
      }

      if (!isValidNode) {
        return null;
      }

      const metadata = extractNodeMetadata(nodeInfo.name);

      const result: ParsedNodeItem = {
        ...nodeInfo,
        url: fixedUrl,
        metadata,
      };

      if (ss2022Warning) {
        result.warning = ss2022Warning;
      }

      return result;
    })
    .filter((node): node is ParsedNodeItem => node !== null);
}

/**
 * 统计节点协议类型分布
 */
export function calculateProtocolStats(
  nodes: Array<{ protocol?: string }>,
): Record<string, { count: number; percentage: number }> {
  const counts: Record<string, number> = {};
  const total = nodes.length;
  nodes.forEach((node) => {
    const protocol = node.protocol || 'unknown';
    counts[protocol] = (counts[protocol] || 0) + 1;
  });
  const stats: Record<string, { count: number; percentage: number }> = {};
  for (const [protocol, count] of Object.entries(counts)) {
    stats[protocol] = { count, percentage: Math.round((count / total) * 100) };
  }
  return stats;
}

/**
 * 解析 Snell URL 为 Clash 代理对象
 */
export function parseSnellUrl(url: string): ClashProxy | null {
  try {
    const urlObj = new URL(url);

    let psk = '';
    if (urlObj.username) {
      psk = decodeURIComponent(urlObj.username);
    } else {
      const pathMatch = urlObj.pathname.match(/^\/\/([^@]+)@/);
      if (pathMatch) {
        psk = decodeURIComponent(pathMatch[1]);
      }
    }

    const server = urlObj.hostname;
    const port = parseInt(urlObj.port, 10);
    const name = urlObj.hash ? decodeURIComponent(urlObj.hash.substring(1)) : 'Snell';

    if (!psk || !server || !port) {
      return null;
    }

    const proxy: ClashProxy = {
      type: 'snell',
      name,
      server,
      port,
      psk,
    };

    const version = urlObj.searchParams.get('version');
    if (version) proxy.version = parseInt(version, 10);

    const reuse = urlObj.searchParams.get('reuse');
    if (reuse !== null) proxy.reuse = reuse === 'true';

    const tfo = urlObj.searchParams.get('tfo');
    if (tfo !== null) proxy.tfo = tfo === 'true';

    const obfs = urlObj.searchParams.get('obfs');
    const obfsHost = urlObj.searchParams.get('obfs-host');
    if (obfs || obfsHost) {
      const obfsOpts: { mode?: string; host?: string } = {};
      if (obfs) obfsOpts.mode = obfs;
      if (obfsHost) obfsOpts.host = decodeURIComponent(obfsHost);
      proxy['obfs-opts'] = obfsOpts;
    }

    return proxy;
  } catch (e) {
    console.error('Snell URL 解析失败:', e);
    return null;
  }
}

/**
 * 验证 Snell 节点配置
 */
export function validateSnellNode(url: string): SnellValidationResult {
  try {
    if (!url || typeof url !== 'string') {
      return { valid: false, error: '无效的 URL 格式' };
    }

    if (!url.startsWith('snell://')) {
      return { valid: false, error: '不是 Snell 协议 URL' };
    }

    const portMatch = url.match(/:(\d+)(?:[/?#]|$)/);
    if (portMatch) {
      const portNumber = parseInt(portMatch[1], 10);
      if (portNumber < 1 || portNumber > 65535) {
        return {
          valid: false,
          error: `端口号无效: ${portNumber} (范围: 1-65535)`,
          details: { port: portNumber },
        };
      }
    }

    const proxy = parseSnellUrl(url);
    if (!proxy) {
      return { valid: false, error: '无效的 Snell URL 格式' };
    }

    if (!proxy.server || !proxy.port || !proxy.psk) {
      return {
        valid: false,
        error: 'Snell 节点缺少必需参数 (server/port/psk)',
        details: { server: proxy.server, port: proxy.port, psk: !!proxy.psk },
      };
    }

    const version = typeof proxy.version === 'number' ? proxy.version : undefined;
    if (version && (version < 1 || version > 5)) {
      return {
        valid: false,
        error: `Snell 版本号无效: ${version} (支持 1-5)`,
        details: { version },
      };
    }

    const obfsOpts = isRecord(proxy['obfs-opts']) ? proxy['obfs-opts'] : null;
    const obfsMode = typeof obfsOpts?.mode === 'string' ? obfsOpts.mode : '';
    if (obfsMode) {
      const validObfsModes = ['http', 'tls'];
      if (!validObfsModes.includes(obfsMode)) {
        return {
          valid: false,
          error: `不支持的混淆模式: ${obfsMode} (支持: ${validObfsModes.join(', ')})`,
          details: { obfsMode },
        };
      }
    }

    if (proxy.port < 1 || proxy.port > 65535) {
      return {
        valid: false,
        error: `端口号无效: ${proxy.port} (范围: 1-65535)`,
        details: { port: proxy.port },
      };
    }

    return { valid: true, proxy };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}
