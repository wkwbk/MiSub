/**
 * API处理模块
 * 处理各种API请求
 */

import { STORAGE_TYPES, StorageFactory } from '../storage-adapter.js';
import {
  createErrorResponse,
  createJsonResponse,
  JSON_BODY_LIMITS,
  normalizeLoginPath,
  readJsonWithLimit,
} from './utils.js';
import { checkAndNotify, sendTgNotification } from './notifications.js';
import { clearAllNodeCaches } from '../services/node-cache-service.js';
import { buildSubscriptionNodeCacheKey } from '../services/subscription-service.js';
import { maybeRunScheduledTasks } from './scheduled-task-runner.js';

import { DEFAULT_SETTINGS as defaultSettings, STORAGE_KEY_SETTINGS } from './config.js';
import { getPathRootSegment, isReservedPathRoot, isReservedSubPath } from '../../shared/reserved-paths.js';
import { ensureProfileLinkId, getProfileShareIdentifier, normalizeProfileIdentifier } from '../../shared/profile-link.js';
import { validateProfileAliases } from '../../shared/profile-alias.js';
import { listRuleTemplates } from './handlers/rule-template-handler.js';
import { syncTelegramPushBot } from './handlers/telegram/client.js';
import { enforcePublicApiAccess, isPublicPageEnabled } from './access-control.js';
import { getPublicTurnstileConfig } from './turnstile.js';

function normalizeProfile(profile = {}) {
  const normalized = { ...profile };
  normalized.subscriptions = Array.isArray(profile.subscriptions) ? profile.subscriptions : [];
  normalized.manualNodes = Array.isArray(profile.manualNodes) ? profile.manualNodes : [];
  normalized.subProfiles = Array.isArray(profile.subProfiles) ? profile.subProfiles : [];
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

export function isStorageUnavailableError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('d1 database not available') ||
    message.includes('storage is paused') ||
    message.includes('database is locked')
  );
}

/**
 * 获取存储适配器实例
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Object>} 存储适配器实例
 */
async function getStorageAdapter(env) {
  return StorageFactory.createAdapter(env);
}

/**
 * 处理数据获取API
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
export async function handleDataRequest(env, context = null) {
  const storageType = STORAGE_TYPES.D1;
  try {
    if (!env?.MISUB_DB) {
      console.error('[API Error /data] D1 binding missing (MISUB_DB)');
    }
    const storageAdapter = StorageFactory.createAdapter(env);
    const [misubs, rawProfiles, rawSettings, ruleTemplates] = await Promise.all([
      storageAdapter.getAllSubscriptions(),
      storageAdapter.getAllProfiles(),
      storageAdapter.get(STORAGE_KEY_SETTINGS),
      listRuleTemplates(storageAdapter).catch((error) => {
        console.warn('[API /data] Failed to load custom rule templates:', error?.message || error);
        return [];
      }),
    ]);
    const settings = rawSettings || {};
    const rawList = Array.isArray(rawProfiles) ? rawProfiles : [];
    const needsLinkIdMigration = rawList.some((p) => p && !normalizeProfileIdentifier(p.linkId));
    const migratedRawProfiles = needsLinkIdMigration ? rawList.map((p) => ensureProfileLinkId(p)) : rawList;
    if (needsLinkIdMigration && storageAdapter?.type !== 'noop' && typeof storageAdapter.syncAllProfiles === 'function') {
      await storageAdapter.syncAllProfiles(migratedRawProfiles).catch((err) => {
        console.warn('[API /data] Failed to persist linkId migration:', err?.message || err);
      });
    }
    const profiles = migratedRawProfiles.map((p) => normalizeProfile(ensureProfileLinkId(p)));
    const config = redactSettingsForResponse(
      {
        ...defaultSettings,
        ...settings,
      },
      env,
    );
    try {
      const taskContext = context || { env };
      const runPromise = maybeRunScheduledTasks(taskContext, { source: 'admin-api' });
      if (typeof taskContext.waitUntil !== 'function') {
        runPromise.catch((error) => console.warn('[ScheduledTasks] lazy check failed:', error?.message || error));
      }
    } catch (taskError) {
      console.warn('[ScheduledTasks] lazy check init failed:', taskError?.message || taskError);
    }
    return createJsonResponse({ misubs, profiles, ruleTemplates, config });
  } catch (e) {
    console.error('[API Error /data] Failed to read from storage', {
      error: e?.message,
      storageType,
      hasD1: !!env?.MISUB_DB,
    });
    return createErrorResponse(e, 500);
  }
}

/**
 * 处理订阅和配置保存API
 * @param {Object} request - HTTP请求对象
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
export async function handleMisubsSave(request, env, context = null) {
  try {
    // 步骤1: 解析请求体
    let requestData;
    try {
      requestData = await readJsonWithLimit(request, JSON_BODY_LIMITS.large);
    } catch (parseError) {
      console.error('[API Error /misubs] JSON解析失败:', parseError);
      return createJsonResponse(
        {
          success: false,
          message: parseError.status === 413 ? parseError.message : '请求数据格式错误，请检查数据格式',
        },
        parseError.status || 400,
      );
    }

    const { misubs, profiles } = requestData;
    const storageAdapter = await getStorageAdapter(env);
    if (!storageAdapter || storageAdapter.type === 'noop') {
      return createJsonResponse(
        {
          success: false,
          message: 'D1 database not available',
        },
        503,
      );
    }

    // 步骤2: 验证必需字段
    if (typeof misubs === 'undefined' || typeof profiles === 'undefined') {
      return createJsonResponse(
        {
          success: false,
          message: '请求体中缺少 misubs 或 profiles 字段',
        },
        400,
      );
    }

    // 步骤3: 验证数据类型
    if (!Array.isArray(misubs) || !Array.isArray(profiles)) {
      return createJsonResponse(
        {
          success: false,
          message: 'misubs 和 profiles 必须是数组格式',
        },
        400,
      );
    }

    const previousProfiles =
      typeof storageAdapter.getAllProfiles === 'function'
        ? (await Promise.resolve(storageAdapter.getAllProfiles()).catch(() => [])) || []
        : [];
    const prevProfileMap = new Map(previousProfiles.filter((p) => p?.id).map((p) => [p.id, p]));

    const finalProfiles = profiles.map((p, index) => {
      const normalized = normalizeProfile(p);
      const preservedLinkId = !normalized.linkId ? normalizeProfileIdentifier(prevProfileMap.get(normalized.id)?.linkId) : '';
      return ensureProfileLinkId({
        ...normalized,
        ...(preservedLinkId ? { linkId: preservedLinkId } : {}),
        sortIndex: index,
      });
    });

    const aliasValidation = validateProfileAliases(finalProfiles, { previousProfiles });
    if (!aliasValidation.valid) {
      return createJsonResponse(
        {
          success: false,
          message: aliasValidation.message || '自定义别名校验失败',
          code: aliasValidation.code || 'invalid_custom_id',
        },
        400,
      );
    }

    const finalMisubs = misubs.map((s, index) => ({
      ...s,
      sortIndex: index,
    }));

    // 步骤4: 获取设置（带错误处理）
    let settings;
    try {
      settings = (await storageAdapter.get(STORAGE_KEY_SETTINGS)) || defaultSettings;
    } catch {
      settings = defaultSettings; // 使用默认设置继续
    }

    // 步骤5: 处理通知（非阻塞，错误不影响保存）
    // 仅在有订阅数据时处理
    if (finalMisubs && finalMisubs.length > 0) {
      try {
        const notificationPromises = finalMisubs
          .filter((sub) => sub?.enabled && sub.url && sub.url.startsWith('http'))
          .map((sub) =>
            checkAndNotify(sub, settings, env).catch((notifyError) => {
              console.warn('[API] Notification failed for subscription:', sub?.name || sub?.url, notifyError);
            }),
          );

        // 并行处理通知；在 Cloudflare Workers 中通过 waitUntil 防止响应返回后任务被中止
        const notificationBatch = Promise.allSettled(notificationPromises).catch((e) => {
          console.warn('[API] Notification batch error:', e);
        });
        if (typeof context?.waitUntil === 'function') {
          context.waitUntil(notificationBatch);
        }
      } catch (notificationError) {
        console.warn('[API] Notification system error:', notificationError);
      }
    }

    // 步骤6: 保存数据到存储（复用 D1StorageAdapter 行级差异同步）
    try {
      await Promise.all([
        storageAdapter.syncAllSubscriptions(finalMisubs),
        storageAdapter.syncAllProfiles(finalProfiles),
      ]);
    } catch (storageError) {
      console.error('[API Error /misubs] Storage put failed:', storageError);
      return createJsonResponse(
        {
          success: false,
          message: `数据保存失败: ${storageError.message || '存储服务暂时不可用，请稍后重试'}`,
        },
        500,
      );
    }

    // 步骤6.5: 清除节点缓存（订阅变动后确保拉取最新数据）
    try {
      const preserveKeys = (Array.isArray(finalMisubs) ? finalMisubs : [])
        .filter((sub) => sub?.enableNodeCache === true)
        .map((sub) => buildSubscriptionNodeCacheKey(sub));
      const cacheResult = await clearAllNodeCaches(storageAdapter, { preserveKeys });
      console.info(
        `[API] Cleared ${cacheResult.cleared} node caches after subscription update, preserved ${cacheResult.skipped || 0}`,
      );
    } catch (cacheError) {
      // 缓存清除失败不影响保存结果
      console.warn('[API] Failed to clear node caches:', cacheError.message);
    }

    // 步骤7: 返回保存后的数据，确保前端能更新状态
    return createJsonResponse({
      success: true,
      message: '订阅源及订阅组已保存',
      data: {
        misubs: finalMisubs,
        profiles: finalProfiles,
      },
    });
  } catch (e) {
    console.error('[API Error /misubs] Uncaught error:', e);
    return createJsonResponse(
      {
        success: false,
        message: `保存失败: ${e.message || '服务器内部错误，请稍后重试'}`,
      },
      500,
    );
  }
}

/**
 * 处理设置获取API
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
function redactSettingsForResponse(settings = {}, env = null) {
  const cleaned = { ...settings };
  delete cleaned.publicLinks;
  delete cleaned.publicCores;
  const shortLink = cleaned.shortLink
    ? {
        ...defaultSettings.shortLink,
        ...cleaned.shortLink,
        apiToken: '',
        hasToken: Boolean(String(cleaned.shortLink.apiToken || '').trim()),
      }
    : { ...defaultSettings.shortLink, hasToken: false };
  const hasEnvTurnstileKeys = Boolean(
    String(env?.TURNSTILE_SITE_KEY || '').trim() && String(env?.TURNSTILE_SECRET_KEY || '').trim(),
  );
  const loginDisabledByEnv =
    String(env?.DISABLE_LOGIN_TURNSTILE || '')
      .trim()
      .toLowerCase() === 'true';
  const turnstile = cleaned.turnstile
    ? {
        ...defaultSettings.turnstile,
        ...cleaned.turnstile,
        secretKey: '',
        hasSecretKey: Boolean(String(cleaned.turnstile.secretKey || '').trim()),
        hasEnvKeys: hasEnvTurnstileKeys,
        loginDisabledByEnv,
      }
    : {
        ...defaultSettings.turnstile,
        hasSecretKey: false,
        hasEnvKeys: hasEnvTurnstileKeys,
        loginDisabledByEnv,
      };
  return {
    ...cleaned,
    webdavBackup: cleaned.webdavBackup ? { ...cleaned.webdavBackup, password: '' } : cleaned.webdavBackup,
    shortLink,
    turnstile,
  };
}

export async function handleSettingsGet(env) {
  try {
    const storageAdapter = await getStorageAdapter(env);
    const settings = (await storageAdapter.get(STORAGE_KEY_SETTINGS)) || {};
    return createJsonResponse(redactSettingsForResponse({ ...defaultSettings, ...settings }, env));
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
 * @param {Object} request - HTTP请求对象
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
export async function handleSettingsSave(request, env) {
  try {
    const newSettings = await readJsonWithLimit(request, JSON_BODY_LIMITS.large);

    const rejectReservedValue = (value, fieldLabel) => {
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
    if (newSettings.customLoginPath) {
      const rejected = rejectReservedValue(newSettings.customLoginPath, '自定义登录路径');
      if (rejected) return rejected;
    }

    // 默认订阅 Token 位于 /{subPath}/{myToken} 下，仅需禁止破坏单段路径的字符
    if (newSettings.myToken && /[\s/?#]/.test(newSettings.myToken)) {
      return createJsonResponse(
        {
          success: false,
          message: '默认订阅 Token 不能包含斜杠、问号、井号或空白字符',
        },
        400,
      );
    }

    // 订阅 URL 路径位于根路径第一段，不能包含非法字符或命中非 /sub 的系统保留路径
    if (newSettings.profileToken) {
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

    const storageAdapter = await getStorageAdapter(env);
    const oldSettings = (await storageAdapter.get(STORAGE_KEY_SETTINGS, 'json', { fresh: true })) || {};
    if (newSettings.webdavBackup && oldSettings.webdavBackup) {
      const incomingPassword = newSettings.webdavBackup.password;
      if (incomingPassword === '' || incomingPassword == null) {
        newSettings.webdavBackup = {
          ...newSettings.webdavBackup,
          password: oldSettings.webdavBackup.password,
        };
      }
    }
    if (newSettings.shortLink && typeof newSettings.shortLink === 'object') {
      const { hasToken: _omitHasToken, ...cleanShortLink } = newSettings.shortLink;
      const incomingToken = String(cleanShortLink.apiToken || '').trim();
      const preservedToken = incomingToken || String(oldSettings.shortLink?.apiToken || '').trim();
      newSettings.shortLink = {
        ...defaultSettings.shortLink,
        ...cleanShortLink,
        apiUrl: String(cleanShortLink.apiUrl || '').trim(),
        apiToken: preservedToken,
      };
    }
    if (newSettings.turnstile && typeof newSettings.turnstile === 'object') {
      const {
        hasSecretKey: _omitHasSecretKey,
        hasEnvKeys: _omitHasEnvKeys,
        loginDisabledByEnv: _omitLoginDisabledByEnv,
        ...cleanTurnstile
      } = newSettings.turnstile;
      const incomingSiteKey = String(cleanTurnstile.siteKey || '').trim();
      const incomingSecretKey = String(cleanTurnstile.secretKey || '').trim();
      const preservedSecretKey = incomingSecretKey || String(oldSettings.turnstile?.secretKey || '').trim();
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
      newSettings.turnstile = {
        ...defaultSettings.turnstile,
        ...cleanTurnstile,
        enabled: Boolean(cleanTurnstile.enabled),
        siteKey: incomingSiteKey,
        secretKey: preservedSecretKey,
        enableForGuestbook: cleanTurnstile.enableForGuestbook !== false,
        enableForLogin: Boolean(cleanTurnstile.enableForLogin),
      };
    }
    const finalSettings = { ...oldSettings, ...newSettings };
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
    await storageAdapter.put(STORAGE_KEY_SETTINGS, finalSettings);

    // 纯界面偏好的保存（客户端用 X-MiSub-Save-Scope: preferences 声明，
    // 目前只有「忽略的待处理项」走这条路）不需要让整站节点缓存失效，
    // 也不该给用户发一条「设置已更新」的 TG 消息 ——
    // 「忽略」是轻量动作，每次都触发通知 + 全量缓存重建会很扰民。
    // 用请求头而不是在 body 里塞标记：body 会被 { ...oldSettings, ...newSettings }
    // 合并进设置并持久化，标记会变成脏数据。
    // 注意：只有确实不影响节点处理的载荷才允许带这个头，
    // 否则会漏掉必要的缓存失效。
    const preferencesOnly = request.headers.get('x-misub-save-scope') === 'preferences';

    let telegramSync = null;

    if (!preferencesOnly) {
      // 清除节点缓存（设置变更可能影响节点处理逻辑）
      try {
        await clearAllNodeCaches(storageAdapter);
      } catch (cacheError) {
        console.warn('[API] Failed to clear node caches:', cacheError.message);
      }

      const oldPush = oldSettings.telegramPushConfig || {};
      const newPush = finalSettings.telegramPushConfig || {};
      const pushConfigChanged =
        Boolean(oldPush.enabled) !== Boolean(newPush.enabled) ||
        String(oldPush.botToken || '').trim() !== String(newPush.botToken || '').trim() ||
        String(oldPush.webhookSecret || '').trim() !== String(newPush.webhookSecret || '').trim();

      if (pushConfigChanged && newPush.enabled && String(newPush.botToken || '').trim()) {
        try {
          const origin = new URL(request.url).origin;
          telegramSync = await syncTelegramPushBot(newPush, origin);
        } catch (syncError) {
          console.warn('[API] Failed to sync Telegram Push Bot:', syncError?.message || syncError);
          telegramSync = {
            attempted: true,
            success: false,
            error: syncError?.message || 'Telegram sync failed',
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
    return createErrorResponse(error?.status ? error.message : '保存设置失败', error?.status || 500);
  }
}

/**
 * 处理设置重置API
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
export async function handleSettingsReset(env) {
  try {
    const storageAdapter = await getStorageAdapter(env);

    await storageAdapter.resetAllSettings();

    try {
      await clearAllNodeCaches(storageAdapter);
    } catch (cacheError) {
      console.warn('[API] Failed to clear node caches on reset:', cacheError.message);
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
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
export async function handlePublicProfilesRequest(request, env) {
  try {
    const storageAdapter = await getStorageAdapter(env);
    const rawSettings = await storageAdapter.get(STORAGE_KEY_SETTINGS);
    const settings = { ...defaultSettings, ...rawSettings };
    const blocked = await enforcePublicApiAccess(request, env, settings);
    if (blocked) return blocked;

    const profiles = await storageAdapter.getAllProfiles();

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

    const rawProfileList = Array.isArray(profiles) ? profiles : [];
    const needsLinkIdMigration = rawProfileList.some((p) => p && !normalizeProfileIdentifier(p.linkId));
    const ensuredProfiles = needsLinkIdMigration ? rawProfileList.map((p) => ensureProfileLinkId(p)) : rawProfileList;
    if (needsLinkIdMigration && storageAdapter?.type !== 'noop' && typeof storageAdapter.syncAllProfiles === 'function') {
      await storageAdapter.syncAllProfiles(ensuredProfiles).catch(() => {});
    }

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
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
export async function handlePublicConfig(request, env) {
  try {
    const storageAdapter = await getStorageAdapter(env);
    const settings = (await storageAdapter.get(STORAGE_KEY_SETTINGS)) || {};

    const mergedSettings = { ...defaultSettings, ...settings };
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
      enablePublicPage: isPublicPageEnabled(mergedSettings),
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
