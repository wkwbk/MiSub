/**
 * 节点清洗、编码修复、名称改写与规则过滤工具（前后端共享 Single Source of Truth）
 */

import { base64ToUtf8, encodeArrayBufferToBase64, utf8ToBase64 } from '../utils/base64.js';
import { isSafeUserRegexPattern } from '../utils/regex-safety.js';
import { NODE_PROTOCOL_REGEX } from '../protocols/constants.js';
import { decodeV2raynNodeUrl, getV2raynRemarks, isV2raynUrl, renameV2raynNodeUrl } from '../protocols/v2rayn-utils.js';
import { extractNodeMetadata } from './metadata-extractor.js';

export { NODE_PROTOCOL_REGEX, encodeArrayBufferToBase64 };

export interface RuleSet {
  protocols: Set<string>;
  nameRegex: RegExp | null;
  hasRules: boolean;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeRepeatedly(value: string, maxRounds = 2): string {
  let current = value;
  for (let i = 0; i < maxRounds; i += 1) {
    const next = safeDecodeURIComponent(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function normalizeFragment(url: string, plusAsSpace = false): string {
  const hashIndex = url.lastIndexOf('#');
  if (hashIndex === -1) return url;

  const base = url.substring(0, hashIndex + 1);
  const rawFragment = url.substring(hashIndex + 1);
  if (!rawFragment) return url;

  const fragmentToDecode = plusAsSpace ? rawFragment.replace(/\+/g, ' ') : rawFragment;
  try {
    const decoded = decodeRepeatedly(fragmentToDecode);
    return base + encodeURIComponent(decoded);
  } catch {
    return url;
  }
}

/**
 * 导入节点前对单条节点链接做清洗：
 * - 去除首尾空白
 * - 恢复 @ 前面（userinfo 段）被错误 URL 编码的冒号（%3A / %3a -> :）
 *
 * @param {string} url - 原始节点链接
 * @returns {string} - 清洗后的链接
 */
export function cleanNodeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const protocolEnd = trimmed.indexOf('://');
  if (protocolEnd === -1) return trimmed;

  const protocol = trimmed.slice(0, protocolEnd).toLowerCase();
  if (protocol === 'vmess' || protocol === 'ssr') return trimmed;

  const rest = trimmed.slice(protocolEnd + 3);
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  const atIndex = authority.lastIndexOf('@');
  if (atIndex === -1) return trimmed;

  const userInfo = authority.slice(0, atIndex);
  const cleanedUserInfo = userInfo.replace(/%3a/gi, ':');
  if (cleanedUserInfo === userInfo) return trimmed;

  return `${trimmed.slice(0, protocolEnd + 3)}${cleanedUserInfo}${rest.slice(atIndex)}`;
}

/**
 * 对多行导入文本中的每行链接进行清洗
 * @param {string} text - 多行节点文本
 * @returns {string} - 清洗后的多行文本
 */
export function cleanNodeUrlsText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      return trimmed ? cleanNodeUrl(trimmed) : '';
    })
    .join('\n');
}

/**
 * 修复 SS 节点编码
 */
export function fixSSEncoding(nodeUrl: string, options: { plusAsSpace?: boolean } = {}): string {
  if (!nodeUrl || !nodeUrl.startsWith('ss://')) return nodeUrl;

  const { plusAsSpace = false } = options;

  const payload = nodeUrl.slice('ss://'.length);
  const hashIndex = payload.indexOf('#');

  const beforeHash = hashIndex === -1 ? payload : payload.slice(0, hashIndex);
  const rawHash = hashIndex === -1 ? '' : payload.slice(hashIndex + 1);

  const atIndex = beforeHash.indexOf('@');
  let normalizedBeforeHash = beforeHash;

  if (atIndex !== -1) {
    const userInfo = beforeHash.slice(0, atIndex);
    const hostPart = beforeHash.slice(atIndex);
    normalizedBeforeHash = `${decodeRepeatedly(userInfo)}${hostPart}`;
  } else {
    const queryIndex = beforeHash.indexOf('?');
    if (queryIndex !== -1) {
      normalizedBeforeHash = `${decodeRepeatedly(beforeHash.slice(0, queryIndex))}${beforeHash.slice(queryIndex)}`;
    } else {
      normalizedBeforeHash = decodeRepeatedly(beforeHash);
    }
  }

  if (!rawHash) {
    return `ss://${normalizedBeforeHash}`;
  }

  const normalizedHash = encodeURIComponent(decodeRepeatedly(plusAsSpace ? rawHash.replace(/\+/g, ' ') : rawHash));
  return `ss://${normalizedBeforeHash}#${normalizedHash}`;
}

/**
 * 统一修复节点 URL 中的编码与协议参数兼容问题
 */
export function fixNodeUrlEncoding(nodeUrl: string, options: { plusAsSpace?: boolean } = {}): string {
  if (typeof nodeUrl !== 'string' || nodeUrl.length === 0) {
    return nodeUrl;
  }

  const { plusAsSpace = false } = options;

  if (nodeUrl.startsWith('vmess://')) {
    return nodeUrl;
  }

  if (nodeUrl.startsWith('ss://')) {
    return fixSSEncoding(nodeUrl, options);
  }

  if (nodeUrl.startsWith('hysteria2://') || nodeUrl.startsWith('hy2://')) {
    const shouldKeepRaw = (decoded: string) => /[&=]/.test(decoded);

    let fixed = nodeUrl.replace(/^(hysteria2|hy2):\/\/([^@]+)@/i, (match, scheme, auth) => {
      const decodedAuth = safeDecodeURIComponent(auth);
      if (decodedAuth === auth) return match;
      if (/[@/?#]/.test(decodedAuth)) return match;
      return `${scheme}://${decodedAuth}@`;
    });

    fixed = fixed.replace(/([?&](?:obfs-password|auth|password)=)([^&]+)/gi, (match, prefix, value) => {
      const decoded = safeDecodeURIComponent(value);
      return shouldKeepRaw(decoded) ? match : `${prefix}${decoded}`;
    });

    return normalizeFragment(fixed, plusAsSpace);
  }

  if (nodeUrl.startsWith('snell://')) {
    try {
      const urlObj = new URL(nodeUrl);
      if (urlObj.searchParams.has('ecn')) {
        urlObj.searchParams.delete('ecn');
      }
      return normalizeFragment(urlObj.toString(), plusAsSpace);
    } catch {
      return normalizeFragment(nodeUrl, plusAsSpace);
    }
  }

  if (/^(tuic|socks5?|anytls|naive\+https?|naive\+quic):\/\//i.test(nodeUrl)) {
    const protocolEnd = nodeUrl.indexOf('://');
    const rest = nodeUrl.slice(protocolEnd + 3);
    const authorityEnd = rest.search(/[/?#]/);
    const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
    const atIndex = authority.lastIndexOf('@');
    let fixed = nodeUrl;
    if (atIndex !== -1) {
      const userInfo = authority.slice(0, atIndex);
      const cleanedUserInfo = userInfo.replace(/%3a/gi, ':');
      if (cleanedUserInfo !== userInfo) {
        fixed = `${nodeUrl.slice(0, protocolEnd + 3)}${cleanedUserInfo}${rest.slice(atIndex)}`;
      }
    }
    return normalizeFragment(fixed, plusAsSpace);
  }

  if (nodeUrl.startsWith('vless://') || nodeUrl.startsWith('trojan://')) {
    try {
      const hashIndex = nodeUrl.indexOf('#');
      let baseLink = hashIndex !== -1 ? nodeUrl.substring(0, hashIndex) : nodeUrl;
      const fragment = hashIndex !== -1 ? nodeUrl.substring(hashIndex) : '';

      const protocolEnd = baseLink.indexOf('://');
      const atIndex = baseLink.indexOf('@');
      if (protocolEnd !== -1 && atIndex !== -1) {
        const userInfo = baseLink.substring(protocolEnd + 3, atIndex);
        if (userInfo.includes('%')) {
          const decodedUserInfo = safeDecodeURIComponent(userInfo);
          if (!/[@/?#]/.test(decodedUserInfo)) {
            const protocol = baseLink.substring(0, protocolEnd);
            baseLink = protocol + '://' + decodedUserInfo + baseLink.substring(atIndex);
          }
        }
      }

      return normalizeFragment(baseLink + fragment, plusAsSpace);
    } catch {
      return normalizeFragment(nodeUrl, plusAsSpace);
    }
  }

  return nodeUrl;
}

/**
 * 判断代理是否指向本机/未指定地址
 */
export function isLocalProxyEndpoint(
  proxy: string | { server?: unknown; host?: unknown } | null | undefined,
): boolean {
  let host = '';

  if (proxy && typeof proxy === 'object') {
    host = String(proxy.server || proxy.host || '');
  } else if (typeof proxy === 'string' && isV2raynUrl(proxy)) {
    host = String(decodeV2raynNodeUrl(proxy)?.config?.Address || '');
  } else if (typeof proxy === 'string') {
    try {
      host = new URL(proxy).hostname;
    } catch {
      const match = proxy.match(/@(?:\[([^\]]+)\]|([^:?#/]+))/);
      host = match?.[1] || match?.[2] || '';
    }
  }

  host = String(host)
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  return (
    host === 'localhost' ||
    host === '::1' ||
    host === '::' ||
    host === '0.0.0.0' ||
    /^127(?:\.\d{1,3}){3}$/.test(host) ||
    /^::ffff:127(?:\.\d{1,3}){3}$/.test(host)
  );
}

function base64UrlSafeEncodeUtf8(str: string): string {
  return utf8ToBase64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function updateSsrRemarks(link: string, updater: (name: string) => string): string {
  if (!link || !link.toLowerCase().startsWith('ssr://')) return link;
  try {
    const rawPayload = link.substring('ssr://'.length).split('#')[0];
    const decoded = base64ToUtf8(rawPayload);
    const queryMarker = '/?';
    const queryIndex = decoded.indexOf(queryMarker);
    if (queryIndex === -1) return link;

    const mainPart = decoded.substring(0, queryIndex + queryMarker.length);
    const params = new URLSearchParams(decoded.substring(queryIndex + queryMarker.length));
    const remarksParam = params.get('remarks');
    const oldRemarks = remarksParam ? base64ToUtf8(remarksParam) : '';
    const newRemarks = updater(oldRemarks);
    if (!newRemarks || newRemarks === oldRemarks) return `ssr://${base64UrlSafeEncodeUtf8(decoded)}`;
    params.set('remarks', base64UrlSafeEncodeUtf8(newRemarks));
    return `ssr://${base64UrlSafeEncodeUtf8(mainPart + params.toString())}`;
  } catch {
    return link;
  }
}

/**
 * 为节点名称添加前缀
 */
export function prependNodeName(link: string, prefix: string): string {
  if (!prefix) return link;

  if (link?.toLowerCase?.().startsWith('ssr://')) {
    return updateSsrRemarks(link, (originalName) => {
      if (originalName.startsWith(prefix)) return originalName;
      return originalName ? `${prefix} - ${originalName}` : prefix;
    });
  }

  if (isV2raynUrl(link)) {
    const originalName = getV2raynRemarks(link);
    if (originalName.startsWith(prefix)) return link;
    const newName = originalName ? `${prefix} - ${originalName}` : prefix;
    return renameV2raynNodeUrl(link, newName);
  }

  const appendToFragment = (baseLink: string, namePrefix: string): string => {
    const hashIndex = baseLink.lastIndexOf('#');
    let originalName = '';
    if (hashIndex !== -1) {
      const rawName = baseLink.substring(hashIndex + 1);
      try {
        originalName = decodeURIComponent(rawName);
      } catch {
        originalName = rawName;
      }
    }
    const base = hashIndex !== -1 ? baseLink.substring(0, hashIndex) : baseLink;
    if (originalName.startsWith(namePrefix)) {
      return baseLink;
    }
    const newName = originalName ? `${namePrefix} - ${originalName}` : namePrefix;
    return `${base}#${encodeURIComponent(newName)}`;
  };

  if (link.startsWith('vmess://')) {
    try {
      const base64Part = link.substring('vmess://'.length);
      const jsonString = base64ToUtf8(base64Part);
      const nodeConfig = JSON.parse(jsonString);
      const originalPs = nodeConfig.ps || '';
      if (!originalPs.startsWith(prefix)) {
        nodeConfig.ps = originalPs ? `${prefix} - ${originalPs}` : prefix;
      }
      const newJsonString = JSON.stringify(nodeConfig);
      const newBase64Part = utf8ToBase64(newJsonString);
      return 'vmess://' + newBase64Part;
    } catch (e) {
      console.error('为 vmess 节点添加名称前缀失败，将回退到通用方法。', e);
      return appendToFragment(link, prefix);
    }
  }
  return appendToFragment(link, prefix);
}

/**
 * 为节点链接添加国旗 Emoji
 */
export function addFlagEmoji(link: string): string {
  if (!link) return link;
  const appendEmoji = (name: string): string => {
    if (!name) return name;

    const HAS_EMOJI_REGEX =
      /[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3F4}[\u{E0061}-\u{E007A}]{2,}\u{E007F}|[\u{1F30D}-\u{1F30F}]/u;
    if (HAS_EMOJI_REGEX.test(name)) return name;

    const metadata = extractNodeMetadata(name);
    if (!metadata.flag) return name;

    return `${metadata.flag} ${name}`;
  };

  if (link.toLowerCase().startsWith('ssr://')) {
    return updateSsrRemarks(link, appendEmoji);
  }

  if (isV2raynUrl(link)) {
    const originalName = getV2raynRemarks(link);
    if (!originalName) return link;
    const updatedName = appendEmoji(originalName);
    if (updatedName === originalName) return link;
    return renameV2raynNodeUrl(link, updatedName);
  }

  if (link.startsWith('vmess://')) {
    try {
      const base64Part = link.substring('vmess://'.length);
      const decodedStr = base64ToUtf8(base64Part);
      const nodeConfig = JSON.parse(decodedStr);
      if (nodeConfig.ps) {
        const updatedPs = appendEmoji(nodeConfig.ps);
        if (updatedPs === nodeConfig.ps) return link;
        nodeConfig.ps = updatedPs;
        const newJsonString = JSON.stringify(nodeConfig);
        const newBase64Part = utf8ToBase64(newJsonString);
        return 'vmess://' + newBase64Part;
      }
      return link;
    } catch {
      return link;
    }
  } else {
    const hashIndex = link.lastIndexOf('#');
    let originalName = '';
    let basePart = link;

    if (hashIndex !== -1) {
      basePart = link.substring(0, hashIndex);
      const rawName = link.substring(hashIndex + 1);
      try {
        originalName = decodeURIComponent(rawName);
        if (originalName.includes('%')) {
          originalName = decodeURIComponent(originalName);
        }
      } catch {
        originalName = rawName;
      }
    } else {
      const protocolMatch = link.match(/^(.*?):\/\//);
      if (protocolMatch) {
        const protocol = protocolMatch[1];
        const rest = link.substring(protocol.length + 3);
        const atIdx = rest.lastIndexOf('@');
        const hostPortPart = (atIdx !== -1 ? rest.substring(atIdx + 1) : rest).split(/[?#]/)[0];
        originalName = hostPortPart.split(':')[0] || 'Node';
      }
    }

    if (!originalName) return link;
    const newName = appendEmoji(originalName);
    if (newName === originalName && hashIndex === -1) return link;

    return `${basePart}#${encodeURIComponent(newName)}`;
  }
}

export function removeFlagEmoji(link: string): string {
  if (!link) return link;

  const stripFlagEmoji = (name: string): string => {
    if (!name) return name;
    let cleaned = name;
    const patterns = [
      /[\u{1F1E6}-\u{1F1FF}]{2}/gu,
      /\u{1F3F4}[\u{E0061}-\u{E007A}]{2,}\u{E007F}/gu,
      /\u{1F3F3}\uFE0F?\u200D\u{1F308}/gu,
      /\u{1F3F3}\uFE0F?\u200D\u{26A7}/gu,
      /[\u{1F3F1}\u{1F3F3}\u{1F3F4}\u{1F6A9}\u{1F3C1}\u{1F38C}]/gu,
    ];
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '');
    }
    return cleaned.replace(/\s{2,}/g, ' ').trim();
  };

  if (isV2raynUrl(link)) {
    const originalName = getV2raynRemarks(link);
    if (!originalName) return link;
    const newName = stripFlagEmoji(originalName);
    if (newName === originalName) return link;
    return renameV2raynNodeUrl(link, newName);
  }

  if (link.startsWith('vmess://')) {
    try {
      const payload = link.substring('vmess://'.length);
      const nodeConfig = JSON.parse(base64ToUtf8(payload));
      if (!nodeConfig || typeof nodeConfig !== 'object') return link;
      if (nodeConfig.ps) {
        nodeConfig.ps = stripFlagEmoji(nodeConfig.ps);
        const newJsonString = JSON.stringify(nodeConfig);
        const newBase64Part = utf8ToBase64(newJsonString);
        return 'vmess://' + newBase64Part;
      }
      return link;
    } catch {
      return link;
    }
  }

  const hashIndex = link.lastIndexOf('#');
  if (hashIndex === -1) return link;
  try {
    const originalName = decodeURIComponent(link.substring(hashIndex + 1));
    const newName = stripFlagEmoji(originalName);
    return link.substring(0, hashIndex + 1) + encodeURIComponent(newName);
  } catch {
    return link;
  }
}

/**
 * 净化节点名称以兼容 YAML Flow Style
 */
export function sanitizeNodeForYaml(nodeUrl: string): string {
  if (!nodeUrl) return nodeUrl;

  const sanitizeName = (name: string): string => {
    if (!name) return name;
    const unsafeStartRegex = /^([*&![\]{},:?#%|>@-])/;
    if (unsafeStartRegex.test(name)) {
      return name
        .replace(/^[*]/, '★')
        .replace(/^&/, '＆')
        .replace(/^!/, '！')
        .replace(/^\[/, '【')
        .replace(/^\]/, '】')
        .replace(/^\{/, '｛')
        .replace(/^\}/, '｝')
        .replace(/^,/, '，')
        .replace(/^:/, '：')
        .replace(/^-/, '－')
        .replace(/^\?/, '？')
        .replace(/^#/, '＃')
        .replace(/^%/, '％')
        .replace(/^\|/, '｜')
        .replace(/^>/, '＞')
        .replace(/^@/, '＠');
    }
    return name;
  };

  if (nodeUrl.startsWith('vmess://')) {
    try {
      const base64Part = nodeUrl.substring('vmess://'.length);
      const nodeConfig = JSON.parse(base64ToUtf8(base64Part));

      if (nodeConfig.ps) {
        const newPs = sanitizeName(nodeConfig.ps);
        if (newPs !== nodeConfig.ps) {
          nodeConfig.ps = newPs;
          const newJsonString = JSON.stringify(nodeConfig);
          const newBase64Part = utf8ToBase64(newJsonString);
          return 'vmess://' + newBase64Part;
        }
      }
      return nodeUrl;
    } catch {
      return nodeUrl;
    }
  } else {
    const hashIndex = nodeUrl.lastIndexOf('#');
    if (hashIndex === -1) return nodeUrl;
    try {
      const originalName = decodeURIComponent(nodeUrl.substring(hashIndex + 1));
      const newName = sanitizeName(originalName);
      if (newName !== originalName) {
        return nodeUrl.substring(0, hashIndex + 1) + encodeURIComponent(newName);
      }
      return nodeUrl;
    } catch {
      return nodeUrl;
    }
  }
}

export function buildSafeRegex(patterns: string[]): RegExp | null {
  if (!patterns || patterns.length === 0) return null;
  const safePatterns = patterns.filter((pattern) => isSafeUserRegexPattern(pattern, 512));
  if (safePatterns.length === 0) return null;
  try {
    return new RegExp(safePatterns.join('|'), 'i');
  } catch (e) {
    console.warn('Invalid include/exclude regex, skipped:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * 将多行规则文本解析为规则对象
 */
export function buildRuleSet(lines: string | string[], stripKeepPrefix = false): RuleSet {
  const protocols = new Set<string>();
  const patterns: string[] = [];

  const lineArray = Array.isArray(lines) ? lines : typeof lines === 'string' ? lines.split('\n') : [];

  for (const rawLine of lineArray) {
    let line = rawLine.trim();
    if (!line || line === '---') continue;

    if (stripKeepPrefix && line.toLowerCase().startsWith('keep:')) {
      line = line.substring('keep:'.length).trim();
    }
    if (!line) continue;

    if (line.toLowerCase().startsWith('proto:')) {
      const parts = line
        .substring('proto:'.length)
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);
      parts.forEach((p) => protocols.add(p));
      continue;
    }

    patterns.push(line);
  }

  const nameRegex = buildSafeRegex(patterns);
  return {
    protocols,
    nameRegex,
    hasRules: protocols.size > 0 || Boolean(nameRegex),
  };
}

export function parseFilterRuleText(ruleText: string | string[]) {
  const lines = Array.isArray(ruleText)
    ? ruleText.map((line) => String(line || '').trim()).filter(Boolean)
    : String(ruleText || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

  const includeLines: string[] = [];
  const excludeLines: string[] = [];
  let afterDivider = false;

  for (const line of lines) {
    if (line === '---') {
      afterDivider = true;
      continue;
    }

    if (line.toLowerCase().startsWith('keep:')) {
      includeLines.push(line);
      continue;
    }

    if (afterDivider) {
      includeLines.push(line);
    } else {
      excludeLines.push(line);
    }
  }

  return {
    includeLines,
    excludeLines,
    includeRules: buildRuleSet(includeLines, true),
    excludeRules: buildRuleSet(excludeLines),
  };
}

/**
 * 过滤节点对象列表 (用于 preview/node-fetcher)
 */
export function filterNodeObjects<T extends { protocol?: string; name?: string }>(
  nodes: T[],
  rules: RuleSet | null | undefined,
  mode: 'include' | 'exclude' = 'exclude',
): T[] {
  if (!rules || !rules.hasRules) return nodes;
  const isInclude = mode === 'include';

  return nodes.filter((node) => {
    const protocol = (node.protocol || '').toLowerCase();
    const name = node.name || '';

    const protocolHit = Boolean(protocol && rules.protocols.has(protocol));
    const nameHit = rules.nameRegex ? rules.nameRegex.test(name) : false;

    if (isInclude) {
      return protocolHit || nameHit;
    }
    return !(protocolHit || nameHit);
  });
}

/**
 * 将手动节点的自定义名称应用到节点链接中
 */
export function applyManualNodeName(nodeUrl: string, customName: string): string {
  if (!customName || !nodeUrl) return nodeUrl;

  const encodedName = encodeURIComponent(customName);

  if (isV2raynUrl(nodeUrl)) {
    return renameV2raynNodeUrl(nodeUrl, customName);
  }

  if (nodeUrl.startsWith('vmess://')) {
    try {
      const hashIndex = nodeUrl.indexOf('#');
      const base64Part = hashIndex !== -1 ? nodeUrl.substring(8, hashIndex) : nodeUrl.substring(8);
      const jsonStr = base64ToUtf8(base64Part);
      const config = JSON.parse(jsonStr);
      if (config && typeof config === 'object') {
        config.ps = customName;
        return 'vmess://' + utf8ToBase64(JSON.stringify(config));
      }
    } catch {
      // 解码失败时降级按通用 fragment 更新
    }
  }

  if (
    nodeUrl.startsWith('trojan://') ||
    nodeUrl.startsWith('vless://') ||
    nodeUrl.startsWith('hysteria2://') ||
    nodeUrl.startsWith('hy2://') ||
    nodeUrl.startsWith('tuic://')
  ) {
    try {
      const urlObj = new URL(nodeUrl);
      urlObj.hash = '#' + encodedName;
      return urlObj.toString();
    } catch {
      // 回退到末尾 fragment 替换
    }
  }

  const hashIndex = nodeUrl.lastIndexOf('#');
  const baseUrl = hashIndex === -1 ? nodeUrl : nodeUrl.substring(0, hashIndex);
  return `${baseUrl}#${encodedName}`;
}
