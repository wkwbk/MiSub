import type { Env, StorageAdapter } from '../../types.js';
import { StorageFactory } from '../../storage-adapter.js';
import { DEFAULT_SETTINGS, STORAGE_KEY_SETTINGS } from '../config.js';
import { normalizeSubPath } from '@misub/core/domain/reserved-paths.js';
import { sendTgNotification, tgEscape } from '../notifications.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface TokenAutoRotateConfig {
  enabled?: boolean;
  intervalDays?: number;
  lastRotatedAt?: string | null;
}

export interface RotateTokenOptions {
  request?: Request | null;
  force?: boolean;
  source?: string;
  now?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 生成 32 位十六进制随机订阅 Token，且确保与旧 Token 不同
 */
function generateRotatedSubscriptionToken(previousToken = ''): string {
  const prev = String(previousToken || '').trim();
  let candidate = '';
  for (let i = 0; i < 5; i += 1) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      candidate = crypto.randomUUID().replace(/-/g, '');
    } else if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      candidate = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } else {
      candidate =
        `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`.slice(
          0,
          32,
        );
    }
    if (candidate && candidate !== prev) {
      return candidate;
    }
  }
  return `${candidate || Date.now().toString(16)}_${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeOriginUrl(rawValue: unknown = ''): string {
  let text = String(rawValue || '').trim();
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) {
    text = `https://${text}`;
  }
  return text.replace(/\/+$/, '');
}

/**
 * 解析推送用的公开站点域名（支持 Cron 无请求来源时的环境变量兜底）：
 * settings.publicUrl -> settings.publicDomain -> settings.custom_domain -> env.MISUB_PUBLIC_URL -> env.CF_PAGES_URL -> request.url
 */
export function resolvePublicBaseUrl(
  settings: Record<string, unknown> = {},
  env: Env = {},
  request: Request | null = null,
): string {
  const fromSettings =
    normalizeOriginUrl(settings?.publicUrl) ||
    normalizeOriginUrl(settings?.publicDomain) ||
    normalizeOriginUrl(settings?.custom_domain);
  if (fromSettings) return fromSettings;

  const fromEnv = normalizeOriginUrl(env?.MISUB_PUBLIC_URL) || normalizeOriginUrl(env?.CF_PAGES_URL);
  if (fromEnv) return fromEnv;

  if (request?.url) {
    try {
      return new URL(request.url).origin.replace(/\/+$/, '');
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * 判断是否到达计划自动轮换周期（要求显式开启 enabled === true）
 */
export function isTokenRotationDue(settings: Record<string, unknown> = {}, now = Date.now()): boolean {
  const autoCfg = isRecord(settings?.tokenAutoRotate)
    ? (settings.tokenAutoRotate as TokenAutoRotateConfig)
    : undefined;
  if (!autoCfg || autoCfg.enabled !== true) {
    return false;
  }
  const intervalDays = Math.max(1, Number(autoCfg.intervalDays) || 2);
  const lastRotatedAt = autoCfg.lastRotatedAt ? Date.parse(autoCfg.lastRotatedAt) : NaN;
  if (!Number.isFinite(lastRotatedAt)) {
    return true;
  }
  return now - lastRotatedAt >= intervalDays * ONE_DAY_MS;
}

function formatBeijingTimestamp(ts: number): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString();
  }
}

/**
 * 执行默认订阅 Token（myToken）轮换并发送 Telegram 通知
 */
export async function rotateSubscriptionToken(
  env: Env,
  { request = null, force = false, source = 'cron', now = Date.now() }: RotateTokenOptions = {},
) {
  const storageAdapter = StorageFactory.createAdapter(env) as unknown as StorageAdapter;
  if (!storageAdapter || storageAdapter.type === 'noop') {
    return {
      rotated: false,
      skipped: true,
      reason: 'storage_unavailable',
    };
  }

  const loadedSettings = await storageAdapter.get<Record<string, unknown>>(STORAGE_KEY_SETTINGS, 'json', {
    fresh: true,
  });
  const rawSettings = isRecord(loadedSettings) ? loadedSettings : {};
  const rawRotateCfg = isRecord(rawSettings.tokenAutoRotate)
    ? (rawSettings.tokenAutoRotate as TokenAutoRotateConfig)
    : {};
  const currentRotateCfg = {
    ...DEFAULT_SETTINGS.tokenAutoRotate,
    ...rawRotateCfg,
  };
  const settings = {
    ...DEFAULT_SETTINGS,
    ...rawSettings,
    tokenAutoRotate: currentRotateCfg,
  };

  if (!force) {
    if (currentRotateCfg.enabled !== true) {
      return {
        rotated: false,
        skipped: true,
        reason: 'disabled',
      };
    }
    if (!isTokenRotationDue(settings, now)) {
      return {
        rotated: false,
        skipped: true,
        reason: 'not_due',
      };
    }
  }

  const newToken = generateRotatedSubscriptionToken(settings.myToken);
  const rotatedAt = new Date(now).toISOString();
  const intervalDays = Math.max(1, Number(currentRotateCfg.intervalDays) || 2);

  const updatedSettings = {
    ...settings,
    myToken: newToken,
    tokenAutoRotate: {
      ...currentRotateCfg,
      intervalDays,
      lastRotatedAt: rotatedAt,
    },
  };

  await storageAdapter.put(STORAGE_KEY_SETTINGS, updatedSettings);

  const subPath = normalizeSubPath(updatedSettings.profileToken, 'sub');
  const baseUrl = resolvePublicBaseUrl(updatedSettings, env, request);
  const subUrl = baseUrl ? `${baseUrl}/${subPath}/${newToken}` : `/${subPath}/${newToken}`;

  let remoteSubCount = 0;
  let remoteNodeCount = 0;
  let manualNodeCount = 0;
  try {
    const allItems = (await storageAdapter.getAllSubscriptions?.()) || [];
    for (const item of allItems) {
      if (!item || item.enabled === false) continue;
      const url = typeof item.url === 'string' ? item.url.trim() : '';
      if (!url) continue;
      if (/^https?:\/\//i.test(url)) {
        remoteSubCount += 1;
        remoteNodeCount += Math.max(0, Number(item.nodeCount) || 0);
      } else {
        manualNodeCount += 1;
      }
    }
  } catch (statsError: unknown) {
    const message = statsError instanceof Error ? statsError.message : String(statsError);
    console.warn('[RotateToken] Failed to collect subscription stats:', message);
  }

  const totalNodes = remoteNodeCount + manualNodeCount;
  const stats = {
    remoteSubscriptions: remoteSubCount,
    remoteNodes: remoteNodeCount,
    manualNodes: manualNodeCount,
    totalNodes,
  };

  let notified = false;
  if (updatedSettings.botToken && updatedSettings.chatId) {
    const timeText = formatBeijingTimestamp(now);
    const domainHint = baseUrl
      ? ''
      : '\n💡 <i>提示：未配置公开域名或环境域名，当前仅展示相对路径，可在「基础设置 → 公开站点地址」或设置环境变量 MISUB_PUBLIC_URL 后展示完整链接。</i>';
    const message =
      `🔐 <b>默认订阅 Token 已轮换</b>\n\n` +
      `<b>新 Token：</b><code>${tgEscape(newToken)}</code>\n` +
      `<b>通用链接：</b>\n<code>${tgEscape(subUrl)}</code>\n\n` +
      `<b>Clash 链接：</b>\n<code>${tgEscape(`${subUrl}?clash`)}</code>\n` +
      `<b>Sing-Box 链接：</b>\n<code>${tgEscape(`${subUrl}?singbox`)}</code>\n\n` +
      `📊 <b>当前有效资产</b>\n` +
      `• 机场订阅：<code>${remoteSubCount}</code> 个（<code>${remoteNodeCount}</code> 节点）\n` +
      `• 手动节点：<code>${manualNodeCount}</code> 个\n` +
      `• 合计节点：<code>${totalNodes}</code> 个\n\n` +
      `⏱️ <b>轮换时间：</b><code>${tgEscape(timeText)}</code>` +
      domainHint;

    try {
      notified = Boolean(await sendTgNotification(updatedSettings, message));
    } catch (notifyErr: unknown) {
      const errMessage = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
      console.warn('[RotateToken] Failed to send TG notification:', errMessage);
    }
  }

  return {
    rotated: true,
    myToken: newToken,
    subUrl,
    baseUrl,
    rotatedAt,
    notified,
    stats,
    source,
  };
}
