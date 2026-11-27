/**
 * API处理模块
 * 处理各种API请求
 */

import type { MisubItem, ProfileConfig, ProfileSubscriptionRef } from '@misub/core/types.js';
import type { BoundRequestContext, Env } from '../types.js';
import { STORAGE_TYPES } from '../storage-adapter.js';
import { createRepositories } from '../repositories/index.js';
import {
  createErrorResponse,
  createJsonResponse,
  JSON_BODY_LIMITS,
  normalizeLoginPath,
  readJsonWithLimit,
} from './utils.js';
import { sendTgNotification } from './notifications.js';
import { clearAllNodeCaches } from '../services/node-cache-service.js';
import { WEBDAV_LAST_CHECKED_CACHE_KEY } from './scheduled-task-runner.js';

import { DEFAULT_SETTINGS as defaultSettings } from './config.js';
import { getPathRootSegment, isReservedPathRoot, isReservedSubPath } from '@misub/core/domain/reserved-paths.js';
import {
  ensureProfileLinkId,
  getProfileShareIdentifier,
  normalizeProfileIdentifier,
} from '@misub/core/domain/profile-link.js';
import { getProfileSubscriptionId } from '@misub/core/domain/profile-subscription-ref.js';
import { listRuleTemplates } from './handlers/rule-template-handler.js';
import { syncTelegramPushBot } from './handlers/telegram/client.js';
import { type AccessControlConfig, enforcePublicApiAccess, isPublicPageEnabled } from './access-control.js';
import { getPublicTurnstileConfig } from './turnstile.js';

type EnvLike = Env | null | undefined;
type ProfileLike = Partial<ProfileConfig> & Record<string, unknown>;
type SubscriptionLike = Partial<MisubItem> &
  Record<string, unknown> & {
    id?: string;
    url?: string;
    name?: string;
    enabled?: boolean;
    enableNodeCache?: boolean;
    userInfo?: unknown;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStatus(error: unknown): number | undefined {
  if (isRecord(error) && typeof error.status === 'number') {
    return error.status;
  }
  return undefined;
}

export function normalizeProfile(profile: ProfileLike = {}): ProfileLike {
  const normalized: ProfileLike = { ...profile };
  normalized.subscriptions = Array.isArray(profile.subscriptions)
    ? (profile.subscriptions as ProfileSubscriptionRef[])
    : [];
  normalized.manualNodes = Array.isArray(profile.manualNodes) ? (profile.manualNodes as string[]) : [];
  normalized.subProfiles = Array.isArray(profile.subProfiles) ? (profile.subProfiles as string[]) : [];
  if (Array.isArray(profile.tags)) {
    normalized.tags = profile.tags.map((tag) => String(tag || '').trim()).filter(Boolean);
  }
  normalized.customId = normalizeProfileIdentifier(profile.customId);
  normalized.linkId = normalizeProfileIdentifier(profile.linkId);
  normalized.enabled = profile.enabled !== false;
  normalized.isPublic = profile.isPublic === true;
  normalized.downloadCount = Number(profile.downloadCount) || 0;
  const rawShortLink = typeof profile.shortLink === 'string' ? profile.shortLink.trim() : '';
  normalized.shortLink = /^https?:\/\//i.test(rawShortLink) ? rawShortLink : '';
  return normalized;
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(obj[key])}`).join(',')}}`;
}

export function pickSubscriptionCacheRelevantFields(sub: SubscriptionLike = {}) {
  return {
    id: sub.id || '',
    url: sub.url || '',
    enabled: sub.enabled !== false,
    name: sub.name || '',
    exclude: sub.exclude || '',
    include: sub.include || '',
    operators: sub.operators || null,
    nodeTransform: sub.nodeTransform || null,
    disabledNodes: sub.disabledNodes || null,
    customUserAgent: sub.customUserAgent || '',
    fetchProxy: sub.fetchProxy || '',
    plusAsSpace: Boolean(sub.plusAsSpace),
    tags: Array.isArray(sub.tags) ? sub.tags : [],
    sortIndex: Number(sub.sortIndex) || 0,
  };
}

export function getChangedSubscriptionIds(
  previousMisubs: SubscriptionLike[] = [],
  finalMisubs: SubscriptionLike[] = [],
): Set<string> {
  const prevMap = new Map(
    (Array.isArray(previousMisubs) ? previousMisubs : [])
      .filter((s): s is SubscriptionLike & { id: string } => Boolean(s?.id))
      .map((s) => [s.id, s]),
  );
  const nextMap = new Map(
    (Array.isArray(finalMisubs) ? finalMisubs : [])
      .filter((s): s is SubscriptionLike & { id: string } => Boolean(s?.id))
      .map((s) => [s.id, s]),
  );
  const changed = new Set<string>();

  for (const [id, prevSub] of prevMap.entries()) {
    const nextSub = nextMap.get(id);
    if (!nextSub) {
      changed.add(id);
      continue;
    }
    if (
      stableSerialize(pickSubscriptionCacheRelevantFields(prevSub)) !==
      stableSerialize(pickSubscriptionCacheRelevantFields(nextSub))
    ) {
      changed.add(id);
    }
  }
  for (const id of nextMap.keys()) {
    if (!prevMap.has(id)) {
      changed.add(id);
    }
  }
  return changed;
}

export function shouldCheckSubscriptionNotification(
  sub: SubscriptionLike | null | undefined,
  prevSub: SubscriptionLike | undefined,
): boolean {
  if (!sub?.enabled || typeof sub.url !== 'string' || !sub.url.startsWith('http')) {
    return false;
  }
  if (!prevSub) return true;
  if (prevSub.enabled !== sub.enabled || prevSub.url !== sub.url) {
    return true;
  }
  return stableSerialize(prevSub.userInfo || null) !== stableSerialize(sub.userInfo || null);
}

function normalizeProfileForDiff(profile: ProfileLike = {}): ProfileLike {
  const normalized = normalizeProfile(profile);
  delete normalized.downloadCount;
  delete normalized.updatedAt;
  delete normalized.configVersion;
  return normalized;
}

export function getAffectedProfileIds(
  previousProfiles: ProfileLike[] = [],
  finalProfiles: ProfileLike[] = [],
  changedSubIds = new Set<string>(),
): Set<string> {
  const prevList = Array.isArray(previousProfiles) ? previousProfiles : [];
  const nextList = Array.isArray(finalProfiles) ? finalProfiles : [];
  const prevMap = new Map(
    prevList.filter((p): p is ProfileLike & { id: string } => Boolean(p?.id)).map((p) => [p.id, p]),
  );
  const nextMap = new Map(
    nextList.filter((p): p is ProfileLike & { id: string } => Boolean(p?.id)).map((p) => [p.id, p]),
  );
  const affected = new Set<string>();

  for (const [id, prevProfile] of prevMap.entries()) {
    const nextProfile = nextMap.get(id);
    if (!nextProfile) {
      affected.add(id);
      continue;
    }
    if (
      stableSerialize(normalizeProfileForDiff(prevProfile)) !== stableSerialize(normalizeProfileForDiff(nextProfile))
    ) {
      affected.add(id);
    }
  }

  const profileIdByIdentifier = new Map<string, string>();
  for (const profile of nextList) {
    if (!profile?.id) continue;
    profileIdByIdentifier.set(profile.id, profile.id);
    if (profile.customId) profileIdByIdentifier.set(profile.customId, profile.id);
    if (profile.linkId) profileIdByIdentifier.set(profile.linkId, profile.id);

    if (!prevMap.has(profile.id)) {
      affected.add(profile.id);
      continue;
    }
    const referencesChangedSub =
      (Array.isArray(profile.subscriptions) &&
        profile.subscriptions.some((entry) => changedSubIds.has(getProfileSubscriptionId(entry)))) ||
      (Array.isArray(profile.manualNodes) && profile.manualNodes.some((id) => changedSubIds.has(id)));
    if (referencesChangedSub) {
      affected.add(profile.id);
    }
  }

  let propagated = true;
  while (propagated) {
    propagated = false;
    for (const profile of nextList) {
      if (!profile?.id || affected.has(profile.id)) continue;
      if (
        Array.isArray(profile.subProfiles) &&
        profile.subProfiles.some((refId) => {
          const resolvedId = profileIdByIdentifier.get(refId) || refId;
          return affected.has(resolvedId);
        })
      ) {
        affected.add(profile.id);
        propagated = true;
      }
    }
  }

  return affected;
}

export function isStorageUnavailableError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('d1 database not available') ||
    message.includes('storage is paused') ||
    message.includes('database is locked')
  );
}

/**
 * 处理数据获取API
 */
export async function handleDataRequest(
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  const storageType = STORAGE_TYPES.D1;
  try {
    if (!env?.MISUB_DB) {
      console.error('[API Error /data] D1 binding missing (MISUB_DB)');
    }
    const repos = createRepositories(env, context);
    const storageAdapter = repos.storage;
    const [misubs, rawProfiles, rawSettings, ruleTemplates] = await Promise.all([
      repos.subscriptions.getAll({ fresh: true }),
      repos.profiles.getAll({ fresh: true }),
      repos.settings.getMain({ fresh: context?.settings === undefined }),
      listRuleTemplates(storageAdapter).catch((error: unknown) => {
        console.warn('[API /data] Failed to load custom rule templates:', getErrorMessage(error));
        return [];
      }),
    ]);
    const settings: Record<string, unknown> = isRecord(rawSettings) ? rawSettings : {};
    const rawList: ProfileConfig[] = Array.isArray(rawProfiles) ? rawProfiles : [];
    const profilesNeedingLinkId = rawList.filter((p) => p && !normalizeProfileIdentifier(p.linkId));
    const migratedLinkIds = new Map(
      profilesNeedingLinkId.map((p) => {
        const ensured = ensureProfileLinkId(p);
        return [ensured.id, ensured] as const;
      }),
    );
    if (migratedLinkIds.size > 0 && storageAdapter?.type !== 'noop') {
      await repos.profiles.putMany(Array.from(migratedLinkIds.values())).catch((err: unknown) => {
        console.warn('[API /data] Failed to persist linkId migration:', getErrorMessage(err));
      });
    }
    const profiles = rawList.map((p) => normalizeProfile(migratedLinkIds.get(p?.id) || ensureProfileLinkId(p)));
    const config = redactSettingsForResponse(
      {
        ...defaultSettings,
        ...settings,
      },
      env,
      { scope: 'data' },
    );
    return createJsonResponse({ misubs, profiles, ruleTemplates, config });
  } catch (e) {
    console.error('[API Error /data] Failed to read from storage', {
      error: getErrorMessage(e),
      storageType,
      hasD1: !!env?.MISUB_DB,
    });
    return createErrorResponse(e, 500);
  }
}

/**
 * 脱敏设置对象以便返回给客户端
 */
function redactSettingsForResponse(
  settings: Record<string, unknown> = {},
  env: EnvLike = null,
  options: { scope?: string } = {},
): Record<string, unknown> {
  const scope = options?.scope === 'data' ? 'data' : 'settings';
  const cleaned: Record<string, unknown> = { ...settings };
  delete cleaned.publicLinks;
  delete cleaned.publicCores;
  const rawShortLink = isRecord(cleaned.shortLink) ? cleaned.shortLink : null;
  const shortLink = rawShortLink
    ? {
        ...defaultSettings.shortLink,
        ...rawShortLink,
        apiToken: '',
        hasToken: Boolean(String(rawShortLink.apiToken || '').trim()),
      }
    : { ...defaultSettings.shortLink, hasToken: false };
  const hasEnvTurnstileKeys = Boolean(
    String(env?.TURNSTILE_SITE_KEY || '').trim() && String(env?.TURNSTILE_SECRET_KEY || '').trim(),
  );
  const loginDisabledByEnv =
    String(env?.DISABLE_LOGIN_TURNSTILE || '')
      .trim()
      .toLowerCase() === 'true';
  const rawTurnstile = isRecord(cleaned.turnstile) ? cleaned.turnstile : null;
  const turnstile = rawTurnstile
    ? {
        ...defaultSettings.turnstile,
        ...rawTurnstile,
        secretKey: '',
        hasSecretKey: Boolean(String(rawTurnstile.secretKey || '').trim()),
        hasEnvKeys: hasEnvTurnstileKeys,
        loginDisabledByEnv,
      }
    : {
        ...defaultSettings.turnstile,
        hasSecretKey: false,
        hasEnvKeys: hasEnvTurnstileKeys,
        loginDisabledByEnv,
      };
  const rawTelegramPush = isRecord(cleaned.telegramPushConfig) ? cleaned.telegramPushConfig : null;
  const telegramPushConfig = rawTelegramPush
    ? {
        ...rawTelegramPush,
        botToken: '',
        hasBotToken: Boolean(String(rawTelegramPush.botToken || '').trim()),
        webhookSecret: '',
        hasWebhookSecret: Boolean(String(rawTelegramPush.webhookSecret || '').trim()),
      }
    : cleaned.telegramPushConfig;
  const rawWebdav = isRecord(cleaned.webdavBackup) ? cleaned.webdavBackup : null;
  const webdavBackup = rawWebdav
    ? {
        ...rawWebdav,
        password: '',
        hasPassword: Boolean(String(rawWebdav.password || '').trim()),
      }
    : cleaned.webdavBackup;

  const redacted: Record<string, unknown> = {
    ...cleaned,
    botToken: '',
    hasBotToken: Boolean(String(cleaned.botToken || '').trim()),
    hasEnvCronSecret: Boolean(String(env?.CRON_SECRET || '').trim()),
    webdavBackup,
    shortLink,
    turnstile,
    ...(telegramPushConfig !== undefined ? { telegramPushConfig } : {}),
  };

  if (scope === 'data') {
    redacted.hasCronSecret = Boolean(String(cleaned.cronSecret || env?.CRON_SECRET || '').trim());
    redacted.cronSecret = '';
    if (isRecord(cleaned.externalApi)) {
      const extApi = cleaned.externalApi;
      redacted.externalApi = {
        ...extApi,
        tokens: Array.isArray(extApi.tokens)
          ? extApi.tokens.map((item) => {
              const itemObj = isRecord(item) ? item : {};
              return {
                name: itemObj.name || '',
                token: '',
                hasToken: Boolean(String(itemObj.token || '').trim()),
              };
            })
          : [],
      };
    }
  }

  return redacted;
}

function pickLatestTimestamp(a: string | null | undefined, b: string | null | undefined): string | null {
  const tsA = Date.parse(a || '');
  const tsB = Date.parse(b || '');
  const validA = Number.isFinite(tsA) ? tsA : 0;
  const validB = Number.isFinite(tsB) ? tsB : 0;
  if (validB > validA && b) return b;
  return a || b || null;
}

export async function handleSettingsGet(
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  try {
    const repos = createRepositories(env, context);
    const storageAdapter = repos.storage;
    const [rawSettings, cachedCheck] = await Promise.all([
      repos.settings.getMain({ fresh: context?.settings === undefined }),
      storageAdapter.get<{ checkedAt?: string } | string>(WEBDAV_LAST_CHECKED_CACHE_KEY, 'json').catch(() => null),
    ]);
    const settings = isRecord(rawSettings) ? (rawSettings as Partial<typeof defaultSettings>) : {};
    const merged = { ...defaultSettings, ...settings };
    const cachedCheckedAt =
      isRecord(cachedCheck) && typeof cachedCheck.checkedAt === 'string'
        ? cachedCheck.checkedAt
        : typeof cachedCheck === 'string'
          ? cachedCheck
          : null;
    if (cachedCheckedAt) {
      merged.webdavBackup = {
        ...defaultSettings.webdavBackup,
        ...(isRecord(merged.webdavBackup) ? merged.webdavBackup : {}),
        lastCheckedAt: pickLatestTimestamp(merged.webdavBackup?.lastCheckedAt, cachedCheckedAt),
      };
    }
    return createJsonResponse(redactSettingsForResponse(merged, env));
  } catch (e) {
    if (isStorageUnavailableError(e)) {
      return createJsonResponse({
        ...defaultSettings,
        storageType: 'd1',
        storageUnavailable: true,
      });
    }
    return createErrorResponse('读取设置失败', 500);
  }
}

/**
 * 处理设置保存API
 */
export async function handleSettingsSave(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  try {
    const rawNewSettings = await readJsonWithLimit(request, JSON_BODY_LIMITS.large);
    const newSettings: Record<string, unknown> = isRecord(rawNewSettings) ? rawNewSettings : {};

    const rejectReservedValue = (value: string, fieldLabel: string): Response | null => {
      if (isReservedPathRoot(value)) {
        const pathRoot = getPathRootSegment(value);
        return createJsonResponse(
          {
            success: false,
            message: `"/${pathRoot}" 是系统保留路径，不可用作${fieldLabel}`,
          },
          400,
        );
      }
      return null;
    };

    // 校验 customLoginPath 是否为系统保留路径
    if (typeof newSettings.customLoginPath === 'string' && newSettings.customLoginPath) {
      const rejected = rejectReservedValue(newSettings.customLoginPath, '自定义登录路径');
      if (rejected) return rejected;
    }

    // 默认订阅 Token 位于 /{subPath}/{myToken} 下，仅需禁止破坏单段路径的字符
    if (typeof newSettings.myToken === 'string' && newSettings.myToken && /[\s/?#]/.test(newSettings.myToken)) {
      return createJsonResponse(
        {
          success: false,
          message: '默认订阅 Token 不能包含斜杠、问号、井号或空白字符',
        },
        400,
      );
    }

    // 订阅 URL 路径位于根路径第一段，不能包含非法字符或命中非 /sub 的系统保留路径
    if (typeof newSettings.profileToken === 'string' && newSettings.profileToken) {
      if (/[\s/?#]/.test(newSettings.profileToken)) {
        return createJsonResponse(
          {
            success: false,
            message: '订阅 URL 路径不能包含斜杠、问号、井号或空白字符',
          },
          400,
        );
      }
      if (isReservedSubPath(newSettings.profileToken)) {
        const pathRoot = getPathRootSegment(newSettings.profileToken);
        return createJsonResponse(
          {
            success: false,
            message: `"/${pathRoot}" 是系统保留路径，不可用作订阅 URL 路径`,
          },
          400,
        );
      }
    }

    const repos = createRepositories(env, context);
    const storageAdapter = repos.storage;
    const rawOldSettings = await repos.settings.getMain({ fresh: true });
    const oldSettings: Record<string, unknown> = isRecord(rawOldSettings) ? rawOldSettings : {};
    const {
      hasBotToken: _omitHasBotToken,
      hasCronSecret: _omitHasCronSecret,
      hasEnvCronSecret: _omitHasEnvCronSecret,
      ...incomingSettings
    } = newSettings;

    if ('botToken' in incomingSettings) {
      const incomingBotToken = String(incomingSettings.botToken || '').trim();
      incomingSettings.botToken = incomingBotToken || String(oldSettings.botToken || '').trim();
    }
    const oldTelegramPush = isRecord(oldSettings.telegramPushConfig) ? oldSettings.telegramPushConfig : {};
    if (isRecord(incomingSettings.telegramPushConfig)) {
      const {
        hasBotToken: _omitPushHasBotToken,
        hasWebhookSecret: _omitPushHasWebhookSecret,
        ...cleanPushConfig
      } = incomingSettings.telegramPushConfig;
      const incomingPushToken = String(cleanPushConfig.botToken || '').trim();
      const incomingWebhookSecret = String(cleanPushConfig.webhookSecret || '').trim();
      incomingSettings.telegramPushConfig = {
        ...cleanPushConfig,
        botToken: incomingPushToken || String(oldTelegramPush.botToken || '').trim(),
        webhookSecret: incomingWebhookSecret || String(oldTelegramPush.webhookSecret || '').trim(),
      };
    }
    if (isRecord(incomingSettings.webdavBackup)) {
      const { hasPassword: _omitHasPassword, ...cleanWebdav } = incomingSettings.webdavBackup;
      const incomingPassword = cleanWebdav.password;
      const oldWebdav = isRecord(oldSettings.webdavBackup) ? oldSettings.webdavBackup : null;
      if ((incomingPassword === '' || incomingPassword == null) && oldWebdav) {
        cleanWebdav.password = oldWebdav.password;
      }
      incomingSettings.webdavBackup = cleanWebdav;
    }
    if (isRecord(incomingSettings.shortLink)) {
      const { hasToken: _omitHasToken, ...cleanShortLink } = incomingSettings.shortLink;
      const oldShortLink = isRecord(oldSettings.shortLink) ? oldSettings.shortLink : {};
      const incomingToken = String(cleanShortLink.apiToken || '').trim();
      const preservedToken = incomingToken || String(oldShortLink.apiToken || '').trim();
      incomingSettings.shortLink = {
        ...defaultSettings.shortLink,
        ...cleanShortLink,
        apiUrl: String(cleanShortLink.apiUrl || '').trim(),
        apiToken: preservedToken,
      };
    }
    if (isRecord(incomingSettings.turnstile)) {
      const {
        hasSecretKey: _omitHasSecretKey,
        hasEnvKeys: _omitHasEnvKeys,
        loginDisabledByEnv: _omitLoginDisabledByEnv,
        ...cleanTurnstile
      } = incomingSettings.turnstile;
      const oldTurnstile = isRecord(oldSettings.turnstile) ? oldSettings.turnstile : {};
      const incomingSiteKey = String(cleanTurnstile.siteKey || '').trim();
      const incomingSecretKey = String(cleanTurnstile.secretKey || '').trim();
      const preservedSecretKey = incomingSecretKey || String(oldTurnstile.secretKey || '').trim();
      const effectiveSiteKey = incomingSiteKey || String(env?.TURNSTILE_SITE_KEY || '').trim();
      const effectiveSecretKey = preservedSecretKey || String(env?.TURNSTILE_SECRET_KEY || '').trim();
      if (Boolean(cleanTurnstile.enabled) && (!effectiveSiteKey || !effectiveSecretKey)) {
        return createJsonResponse(
          {
            success: false,
            message: '启用 Cloudflare Turnstile 需要先填写 Site Key 和 Secret Key（或通过环境变量配置）',
          },
          400,
        );
      }
      incomingSettings.turnstile = {
        ...defaultSettings.turnstile,
        ...cleanTurnstile,
        enabled: Boolean(cleanTurnstile.enabled),
        siteKey: incomingSiteKey,
        secretKey: preservedSecretKey,
        enableForGuestbook: cleanTurnstile.enableForGuestbook !== false,
        enableForLogin: Boolean(cleanTurnstile.enableForLogin),
      };
    }
    const finalSettings: Record<string, unknown> = { ...oldSettings, ...incomingSettings };
    delete finalSettings.publicLinks;
    delete finalSettings.publicCores;

    // 使用存储适配器保存设置
    if (!storageAdapter || storageAdapter.type === 'noop') {
      return createJsonResponse(
        {
          success: false,
          message: 'D1 database not available',
        },
        503,
      );
    }
    await repos.settings.saveMain(finalSettings);

    // 纯界面偏好的保存（客户端用 X-MiSub-Save-Scope: preferences 声明，
    // 目前只有「忽略的待处理项」走这条路）不需要让整站节点缓存失效，
    // 也不该给用户发一条「设置已更新」的 TG 消息 ——
    // 「忽略」是轻量动作，每次都触发通知 + 全量缓存重建会很扰民。
    // 用请求头而不是在 body 里塞标记：body 会被 { ...oldSettings, ...newSettings }
    // 合并进设置并持久化，标记会变成脏数据。
    // 注意：只有确实不影响节点处理的载荷才允许带这个头，
    // 否则会漏掉必要的缓存失效。
    const preferencesOnly = request.headers.get('x-misub-save-scope') === 'preferences';

    let telegramSync: unknown = null;

    if (!preferencesOnly) {
      // 清除节点缓存（设置变更可能影响节点处理逻辑）
      try {
        await clearAllNodeCaches(storageAdapter);
      } catch (cacheError) {
        console.warn('[API] Failed to clear node caches:', getErrorMessage(cacheError));
      }

      const oldPush = isRecord(oldSettings.telegramPushConfig) ? oldSettings.telegramPushConfig : {};
      const newPush = isRecord(finalSettings.telegramPushConfig) ? finalSettings.telegramPushConfig : {};
      const pushConfigChanged =
        Boolean(oldPush.enabled) !== Boolean(newPush.enabled) ||
        String(oldPush.botToken || '').trim() !== String(newPush.botToken || '').trim() ||
        String(oldPush.webhookSecret || '').trim() !== String(newPush.webhookSecret || '').trim();

      if (pushConfigChanged && newPush.enabled && String(newPush.botToken || '').trim()) {
        try {
          const origin = new URL(request.url).origin;
          telegramSync = await syncTelegramPushBot(newPush, origin);
        } catch (syncError) {
          const syncErrorMessage = getErrorMessage(syncError);
          console.warn('[API] Failed to sync Telegram Push Bot:', syncErrorMessage);
          telegramSync = {
            attempted: true,
            success: false,
            error: syncErrorMessage || 'Telegram sync failed',
          };
        }
      }

      const message = `⚙️ <b>MiSub 设置更新</b> ⚙️\n\n您的 MiSub 应用设置已成功更新。`;
      await sendTgNotification(finalSettings, message);
    }

    return createJsonResponse({
      success: true,
      message: '设置已保存',
      data: redactSettingsForResponse(finalSettings, env),
      ...(telegramSync ? { telegramSync } : {}),
    });
  } catch (error) {
    const errStatus = getErrorStatus(error);
    return createErrorResponse(errStatus ? getErrorMessage(error) : '保存设置失败', errStatus || 500);
  }
}

/**
 * 处理设置重置API
 */
export async function handleSettingsReset(
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  try {
    const repos = createRepositories(env, context);
    const storageAdapter = repos.storage;

    await repos.settings.resetAll();

    try {
      await clearAllNodeCaches(storageAdapter);
    } catch (cacheError) {
      console.warn('[API] Failed to clear node caches on reset:', getErrorMessage(cacheError));
    }

    return createJsonResponse({
      success: true,
      message: '设置已恢复出厂状态',
      data: defaultSettings,
    });
  } catch (e) {
    console.error('[API Error /settings/reset]', e);
    return createErrorResponse('重置设置失败', 500);
  }
}

/**
 * 处理公开订阅组获取API
 */
export async function handlePublicProfilesRequest(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  try {
    const repos = createRepositories(env, context);
    const storageAdapter = repos.storage;
    const rawSettings = await repos.settings.getMain();
    const settingsObj = isRecord(rawSettings) ? (rawSettings as Partial<typeof defaultSettings>) : {};
    const settings = { ...defaultSettings, ...settingsObj };
    const blocked = await enforcePublicApiAccess(request, env, settings as AccessControlConfig);
    if (blocked) return blocked;

    const profiles = await repos.profiles.getAll();

    const profileToken = settings.profileToken || 'sub';
    const defaultLocale = settings.defaultLocale || 'zh-CN';

    // 获取公告配置（仅当启用时返回）
    const announcement = settings.announcement?.enabled
      ? {
          enabled: true, // [修复] 必须包含此字段，否则前端 v-if 判断会失败
          title: settings.announcement.title || '',
          content: settings.announcement.content || '',
          type: settings.announcement.type || 'info',
          dismissible: settings.announcement.dismissible !== false,
          updatedAt: settings.announcement.updatedAt,
        }
      : null;

    const hero = {
      title1: settings.heroTitle1 || '发现',
      title2: settings.heroTitle2 || '优质订阅',
      description: settings.heroDescription || '浏览并获取由管理员分享的精选订阅组合，一键导入到您的客户端。',
    };

    const turnstile = getPublicTurnstileConfig(settings, env);

    const guestbook = {
      enabled: settings.guestbook?.enabled,
      requireAudit: settings.guestbook?.requireAudit,
      allowAnonymous: settings.guestbook?.allowAnonymous,
      turnstile,
    };

    const rawProfileList: ProfileConfig[] = Array.isArray(profiles) ? profiles : [];
    const profilesNeedingLinkId = rawProfileList.filter((p) => p && !normalizeProfileIdentifier(p.linkId));
    const migratedMap = new Map(
      profilesNeedingLinkId.map((p) => {
        const ensured = ensureProfileLinkId(p);
        return [ensured.id, ensured] as const;
      }),
    );
    if (migratedMap.size > 0 && storageAdapter?.type !== 'noop') {
      await repos.profiles.putMany(Array.from(migratedMap.values())).catch(() => {});
    }
    const ensuredProfiles = rawProfileList.map((p) => migratedMap.get(p?.id) || p);

    // 过滤出公开且启用的订阅组
    const publicProfiles = ensuredProfiles
      .map((p) => normalizeProfile(ensureProfileLinkId(p)))
      .filter((p) => p.isPublic && p.enabled)
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        tags: Array.isArray(p.tags) ? p.tags : [],
        customId: p.customId,
        linkId: p.linkId || '',
        shareId: getProfileShareIdentifier(p),
        shortLink: p.shortLink || '',
        updatedAt: p.updatedAt,
        subscriptionCount: (p.subscriptions || []).length,
        manualNodeCount: (p.manualNodes || []).length,
      }));

    const customPage = {
      enabled: settings.customPage?.enabled || false,
      type: settings.customPage?.type || 'html',
      content: settings.customPage?.content || '',
      css: settings.customPage?.css || '',
      useDefaultLayout: settings.customPage?.useDefaultLayout !== false,
      allowExternalStylesheets: settings.customPage?.allowExternalStylesheets === true,
      allowScripts: settings.customPage?.allowScripts === true,
      hideBranding: settings.customPage?.hideBranding === true,
      hideHeader: settings.customPage?.hideHeader === true,
      hideFooter: settings.customPage?.hideFooter === true,
    };

    return createJsonResponse({
      success: true,
      data: publicProfiles,
      config: {
        profileToken,
        announcement,
        hero,
        guestbook,
        customPage,
        defaultLocale,
      },
    });
  } catch (e) {
    console.error('[API Error /public/profiles]', e);
    return createErrorResponse('获取公开订阅组失败', 500);
  }
}

/**
 * 处理公开配置获取API
 */
export async function handlePublicConfig(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  try {
    const repos = createRepositories(env, context);
    const rawSettings = await repos.settings.getMain();
    const settingsObj = isRecord(rawSettings) ? (rawSettings as Partial<typeof defaultSettings>) : {};
    const mergedSettings = { ...defaultSettings, ...settingsObj };
    const configuredLoginPath = normalizeLoginPath(mergedSettings.customLoginPath);
    let isLoginPath = configuredLoginPath === '/login';
    try {
      const clientPath = request?.headers?.get('X-MiSub-Path');
      const referer = request?.headers?.get('Referer');
      const sourcePath = clientPath || (referer ? new URL(referer).pathname : '');
      if (sourcePath) {
        isLoginPath = new URL(sourcePath, request.url).pathname === configuredLoginPath;
      }
    } catch {}

    return createJsonResponse({
      enablePublicPage: isPublicPageEnabled(mergedSettings as AccessControlConfig),
      isLoginPath,
      hasCustomLoginPath: configuredLoginPath !== '/login',
      turnstile: getPublicTurnstileConfig(mergedSettings, env),
      customPage: {
        enabled: mergedSettings.customPage?.enabled || false,
        useDefaultLayout: mergedSettings.customPage?.useDefaultLayout !== false,
        allowExternalStylesheets: mergedSettings.customPage?.allowExternalStylesheets === true,
        allowScripts: mergedSettings.customPage?.allowScripts === true,
        hideBranding: mergedSettings.customPage?.hideBranding === true,
        hideHeader: mergedSettings.customPage?.hideHeader === true,
        hideFooter: mergedSettings.customPage?.hideFooter === true,
      },
    });
  } catch (e) {
    console.error('[API Error /public/config]', e);
    return createErrorResponse('获取公开配置失败', 500);
  }
}
