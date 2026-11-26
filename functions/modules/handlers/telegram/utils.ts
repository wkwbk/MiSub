/**
 * Telegram Bot 节点/订阅解析、文件下载与参数解析工具
 */

import { extractNodeName as extractCoreNodeName } from '@misub/core/node/node-name.js';

/** Telegram 单文件下载大小上限（字节），防止大文件拖垮 Worker */
const TG_MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface TelegramDocumentLike {
  file_id: string;
  file_size?: number;
  file_name?: string;
}

export interface TelegramMessageFileLike {
  document?: TelegramDocumentLike;
  photo?: TelegramDocumentLike[];
}

export type ParsedTargetArgs =
  | { type: 'none'; values: never[] }
  | { type: 'all'; values: never[] }
  | { type: 'index'; values: number[] }
  | { type: 'id'; values: string[] }
  | { type: 'mixed'; indices: number[]; ids: string[] };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error && error.message) return error.message;
  if (isRecord(error) && typeof error.message === 'string' && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

/**
 * 从节点URL提取名称
 */
export function extractNodeName(url: string): string {
  try {
    const coreName = extractCoreNodeName(url);
    if (coreName) return coreName;
    const protocol = url.split('://')[0].toUpperCase();
    return `${protocol} 节点`;
  } catch {
    return '未命名节点';
  }
}

/**
 * 提取节点链接（支持多种协议）
 */
export function extractNodeUrls(text: string): string[] {
  const protocols = [
    'ss://',
    'ssr://',
    'vmess://',
    'vless://',
    'trojan://',
    'hysteria://',
    'hysteria2://',
    'hy2://',
    'tuic://',
    'snell://',
    'anytls://',
    'wireguard://',
    'socks5://',
    'socks5-tls://',
  ];
  const urls: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const lowerTrimmed = trimmed.toLowerCase();
    for (const protocol of protocols) {
      if (lowerTrimmed.startsWith(protocol)) {
        urls.push(trimmed);
        break;
      }
    }
  }

  return urls;
}

/**
 * 从文本中提取订阅链接（http/https）。
 *
 * 与 extractNodeUrls 的区别：节点协议要求整行就是链接，而订阅链接常被
 * 粘贴成「名称: https://...」或一行多个，因此这里用宽松匹配，再按 URL 去重。
 */
export function extractSubscriptionUrls(text: string): string[] {
  const matches = String(text || '').match(/https?:\/\/[^\s<>"'，。、；：！？）】]+/gi) || [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of matches) {
    // 去掉尾部常见的标点残留
    const url = raw.replace(/[.,;:!?]+$/, '');
    if (!url || seen.has(url)) continue;
    try {
      new URL(url);
    } catch {
      continue;
    }
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

/**
 * 下载 Telegram 消息中的文件/文档内容。
 *
 * 流程：getFile 拿 file_path → 从 file 接口拉取正文。
 * 复用配置里的 bot token，与 webhook 同一来源。
 */
export async function downloadTelegramFile(
  message: TelegramMessageFileLike | null | undefined,
  config: { botToken?: string },
): Promise<{ text: string; fileName: string }> {
  const doc = message?.document || (message?.photo ? message.photo[message.photo.length - 1] : null);
  if (!doc) return { text: '', fileName: '' };

  // 体积限制
  const size = Number(doc.file_size || 0);
  if (size > TG_MAX_FILE_BYTES) {
    throw new Error(`文件过大（${(size / 1024 / 1024).toFixed(1)}MB），上限 5MB`);
  }

  const token = config.botToken;
  if (!token) throw new Error('未配置 Bot Token');

  const fileRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(doc.file_id)}`,
  );
  const fileData = (await fileRes.json()) as unknown;
  const filePath =
    isRecord(fileData) && fileData.ok === true && isRecord(fileData.result) && typeof fileData.result.file_path === 'string'
      ? fileData.result.file_path
      : '';
  if (!filePath) {
    throw new Error('获取文件路径失败（文件可能已过期）');
  }

  // 2. 下载正文
  const contentRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!contentRes.ok) {
    throw new Error(`下载文件失败（HTTP ${contentRes.status}）`);
  }

  const text = await contentRes.text();
  return {
    text,
    fileName: doc.file_name || filePath.split('/').pop() || 'file',
  };
}

/**
 * 提取条目的标签数组。
 */
export function getTelegramItemTags(item: { tags?: unknown } | null | undefined): string[] {
  if (!item || !Array.isArray(item.tags)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of item.tags) {
    const tag = String(raw || '').trim();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }
  return result;
}

/**
 * 生成 TG 导入的标签名。
 */
export function buildImportTagName({
  source = 'text',
  fileName = '',
  now = new Date(),
}: {
  source?: string;
  fileName?: string;
  now?: Date;
} = {}): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  if (source === 'file' && fileName) {
    const base = String(fileName)
      .replace(/\.[a-z0-9]+$/i, '')
      .trim();
    if (base) return `TG-${base}-${dateStr}`;
  }

  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return `TG-导入-${dateStr} ${timeStr}`;
}

/**
 * 解析目标参数（支持编号、ID、all/全部、逗号分隔）
 */
export function parseTargetArgs(args: string[]): ParsedTargetArgs {
  if (!args || args.length === 0) {
    return { type: 'none', values: [] };
  }

  const arg = args.join(' ').trim().toLowerCase();

  if (arg === 'all' || arg === '全部') {
    return { type: 'all', values: [] };
  }

  const parts = arg.split(/[,，\s]+/).filter((p) => p);
  const indices: number[] = [];
  const ids: string[] = [];

  for (const part of parts) {
    const num = parseInt(part);
    if (!isNaN(num) && num > 0) {
      indices.push(num - 1); // 转为0-indexed
    } else {
      ids.push(part);
    }
  }

  if (indices.length > 0 && ids.length === 0) {
    return { type: 'index', values: indices };
  } else if (ids.length > 0 && indices.length === 0) {
    return { type: 'id', values: ids };
  } else if (indices.length > 0 && ids.length > 0) {
    return { type: 'mixed', indices, ids };
  }

  return { type: 'none', values: [] };
}
