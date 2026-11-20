/**
 * API处理模块
 * 处理各种API请求
 */

import { SettingsCache, STORAGE_TYPES, StorageFactory } from '../storage-adapter.js';
import {
    createErrorResponse,
    createJsonResponse,
    isUsingDefaultPassword,
    JSON_BODY_LIMITS,
    readJsonWithLimit,
    setAdminPassword,
} from './utils.js';
import { checkAndNotify, sendTgNotification } from './notifications.js';
import { clearAllNodeCaches } from '../services/node-cache-service.js';
import { buildSubscriptionNodeCacheKey } from '../services/subscription-service.js';
import { maybeRunScheduledTasks } from './scheduled-task-runner.js';

import {
    DEFAULT_SETTINGS as defaultSettings,
    STORAGE_KEY_PROFILES,
    STORAGE_KEY_SETTINGS,
    STORAGE_KEY_SUBS,
} from './config.js';
import { normalizePublicLinksConfig } from '../../src/constants/default-public-links.js';
import { normalizePublicCoresConfig } from '../../src/constants/default-public-cores.js';
import { listRuleTemplates } from './rule-template-handler.js';
/**
 * 处理订阅和配置保存API
 * @param {Object} request - HTTP请求对象
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
import { applyPatch } from './patch-utils.js';

function normalizeLoginPath(customLoginPath) {
    if (typeof customLoginPath !== 'string') return '/login';
    const normalized = customLoginPath.trim().replace(/^\/+/, '');
    return normalized && normalized !== 'login' ? `/${normalized}` : '/login';
}

function normalizeProfile(profile = {}) {
    const normalized = { ...profile };
    normalized.subscriptions = Array.isArray(profile.subscriptions) ? profile.subscriptions : [];
    normalized.manualNodes = Array.isArray(profile.manualNodes) ? profile.manualNodes : [];
    normalized.subProfiles = Array.isArray(profile.subProfiles) ? profile.subProfiles : [];
    if (Array.isArray(profile.tags)) {
        normalized.tags = profile.tags.map((tag) => String(tag || '').trim()).filter(Boolean);
    }
    normalized.enabled = profile.enabled !== false;
    normalized.isPublic = profile.isPublic === true;
    normalized.downloadCount = Number(profile.downloadCount) || 0;
    return normalized;
}

function isStorageUnavailableError(error) {
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

function isSimpleArrayDiff(diff) {
    if (!diff || typeof diff !== 'object') return false;
    const allowedKeys = ['added', 'updated', 'removed'];
    if (!Object.keys(diff).every((key) => allowedKeys.includes(key))) return false;
    return ['added', 'updated', 'removed'].every((key) => Array.isArray(diff[key] || []));
}

async function applyRowLevelDiff(storageAdapter, type, diff) {
    const isProfile = type === 'profiles';
    const putItem = isProfile
        ? storageAdapter.putProfile?.bind(storageAdapter)
        : storageAdapter.putSubscription?.bind(storageAdapter);
    const deleteItem = isProfile
        ? storageAdapter.deleteProfileById?.bind(storageAdapter)
        : storageAdapter.deleteSubscriptionById?.bind(storageAdapter);

    if (!putItem || !deleteItem || !isSimpleArrayDiff(diff)) {
        return false;
    }

    const { added = [], updated = [], removed = [] } = diff;

    let resolvedUpdates = updated;
    if (isProfile && updated.length > 0 && typeof storageAdapter.getAllProfiles === 'function') {
        const currentItems = await storageAdapter.getAllProfiles();
        const currentMap = new Map(currentItems.map((item) => [item.id, item]));
        resolvedUpdates = updated.map((item) => {
            const existing = currentMap.get(item.id);
            if (!existing) return item;
            return {
                ...item,
                downloadCount: Math.max(
                    Number(existing.downloadCount) || 0,
                    Number(item.downloadCount) || 0
                ),
            };
        });
    }

    await Promise.all([
        ...added.map((item) => putItem(item)),
        ...resolvedUpdates.map((item) => putItem(item)),
        ...removed.map((id) => deleteItem(id)),
    ]);

    return true;
}

async function syncCollectionRowLevel(storageAdapter, type, finalItems) {
    const isProfile = type === 'profiles';
    const getAll = isProfile
        ? storageAdapter.getAllProfiles?.bind(storageAdapter)
        : storageAdapter.getAllSubscriptions?.bind(storageAdapter);
    const putItem = isProfile
        ? storageAdapter.putProfile?.bind(storageAdapter)
        : storageAdapter.putSubscription?.bind(storageAdapter);
    const deleteItem = isProfile
        ? storageAdapter.deleteProfileById?.bind(storageAdapter)
        : storageAdapter.deleteSubscriptionById?.bind(storageAdapter);

    if (!getAll || !putItem || !deleteItem || !Array.isArray(finalItems)) {
        return false;
    }

    const currentItems = await getAll();
    const currentMap = new Map(currentItems.map((item) => [item.id, item]));
    const finalMap = new Map(finalItems.map((item) => [item.id, item]));

    const toPut = [];
    const deletes = [];

    for (const item of finalItems) {
        const existing = currentMap.get(item.id);
        const nextItem =
            isProfile && existing
                ? {
                      ...item,
                      downloadCount: Math.max(
                          Number(existing.downloadCount) || 0,
                          Number(item.downloadCount) || 0
                      ),
                  }
                : item;
        if (!existing || JSON.stringify(existing) !== JSON.stringify(nextItem)) {
            toPut.push(nextItem);
        }
    }

    for (const existing of currentItems) {
        if (!finalMap.has(existing.id)) {
            deletes.push(deleteItem(existing.id));
        }
    }

    const putAll = isProfile
        ? storageAdapter.putAllProfiles?.bind(storageAdapter)
        : storageAdapter.putAllSubscriptions?.bind(storageAdapter);

    const tasks = [...deletes];
    if (toPut.length > 1 && putAll) {
        tasks.unshift(putAll(toPut));
    } else if (toPut.length > 0) {
        tasks.unshift(...toPut.map((item) => putItem(item)));
    }

    await Promise.all(tasks);
    return true;
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
        const cachedSettings = await SettingsCache.get(env);
        const [misubs, rawProfiles, settings, ruleTemplates] = await Promise.all([
            storageAdapter.getAllSubscriptions(),
            storageAdapter.getAllProfiles(),
            Promise.resolve(cachedSettings || {}).then((res) => res || {}),
            listRuleTemplates(storageAdapter).catch((error) => {
                console.warn(
                    '[API /data] Failed to load custom rule templates:',
                    error?.message || error
                );
                return [];
            }),
        ]);
        const profiles = Array.isArray(rawProfiles) ? rawProfiles.map(normalizeProfile) : [];
        const config = {
            ...defaultSettings,
            ...settings,
            isDefaultPassword: await isUsingDefaultPassword(env),
        };
        try {
            const taskContext = context || { env };
            const runPromise = maybeRunScheduledTasks(taskContext, { source: 'admin-api' });
            if (typeof taskContext.waitUntil !== 'function') {
                runPromise.catch((error) =>
                    console.warn('[ScheduledTasks] lazy check failed:', error?.message || error)
                );
            }
        } catch (taskError) {
            console.warn(
                '[ScheduledTasks] lazy check init failed:',
                taskError?.message || taskError
            );
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

// ... (existing imports)

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
                    message:
                        parseError.status === 413
                            ? parseError.message
                            : '请求数据格式错误，请检查数据格式',
                },
                parseError.status || 400
            );
        }

        const { misubs, profiles, diff } = requestData;
        const storageAdapter = await getStorageAdapter(env);
        if (!storageAdapter || storageAdapter.type === 'noop') {
            return createJsonResponse(
                {
                    success: false,
                    message: 'D1 database not available',
                },
                503
            );
        }

        let finalMisubs = misubs;
        let finalProfiles = profiles;

        // 步骤1.5: 检查是否为 Diff 模式
        if (diff) {
            console.info('[API] Processing Diff Patch...');
            // 获取当前数据
            const [currentMisubs, currentProfiles] = await Promise.all([
                typeof storageAdapter.getAllSubscriptions === 'function'
                    ? storageAdapter.getAllSubscriptions()
                    : storageAdapter.get(STORAGE_KEY_SUBS).then((res) => res || []),
                typeof storageAdapter.getAllProfiles === 'function'
                    ? storageAdapter.getAllProfiles()
                    : storageAdapter.get(STORAGE_KEY_PROFILES).then((res) => res || []),
            ]);

            // 应用补丁
            if (diff.subscriptions) {
                finalMisubs = applyPatch(currentMisubs, diff.subscriptions);
            } else {
                finalMisubs = currentMisubs; // 无变动
            }

            if (diff.profiles) {
                finalProfiles = applyPatch(currentProfiles, diff.profiles);
            } else {
                finalProfiles = currentProfiles; // 无变动
            }

            if (!Array.isArray(finalMisubs) || !Array.isArray(finalProfiles)) {
                return createJsonResponse(
                    {
                        success: false,
                        message: '增量更新结果格式错误，请检查补丁数据',
                    },
                    400
                );
            }
        } else {
            // 步骤2: 验证必需字段 (仅在非Diff模式下)
            if (typeof misubs === 'undefined' || typeof profiles === 'undefined') {
                return createJsonResponse(
                    {
                        success: false,
                        message: '请求体中缺少 misubs 或 profiles 字段',
                    },
                    400
                );
            }

            // 步骤3: 验证数据类型
            if (!Array.isArray(misubs) || !Array.isArray(profiles)) {
                return createJsonResponse(
                    {
                        success: false,
                        message: 'misubs 和 profiles 必须是数组格式',
                    },
                    400
                );
            }
        }

        if (Array.isArray(finalProfiles)) {
            finalProfiles = finalProfiles.map((p, index) => ({
                ...normalizeProfile(p),
                sortIndex: index,
            }));

            // [Fix] Sync sortIndex back to diff for correct row-level persistence
            if (diff?.profiles) {
                const profileMap = new Map(finalProfiles.map((p) => [p.id, p]));
                if (diff.profiles.added)
                    diff.profiles.added = diff.profiles.added.map((p) => ({
                        ...p,
                        sortIndex: profileMap.get(p.id)?.sortIndex,
                    }));
                if (diff.profiles.updated)
                    diff.profiles.updated = diff.profiles.updated.map((p) => ({
                        ...p,
                        sortIndex: profileMap.get(p.id)?.sortIndex,
                    }));
            }
        }

        if (Array.isArray(finalMisubs)) {
            finalMisubs = finalMisubs.map((s, index) => ({
                ...s,
                sortIndex: index,
            }));

            // [Fix] Sync sortIndex back to diff for correct row-level persistence
            if (diff?.subscriptions) {
                const subMap = new Map(finalMisubs.map((s) => [s.id, s]));
                if (diff.subscriptions.added)
                    diff.subscriptions.added = diff.subscriptions.added.map((s) => ({
                        ...s,
                        sortIndex: subMap.get(s.id)?.sortIndex,
                    }));
                if (diff.subscriptions.updated)
                    diff.subscriptions.updated = diff.subscriptions.updated.map((s) => ({
                        ...s,
                        sortIndex: subMap.get(s.id)?.sortIndex,
                    }));
            }
        }

        // 步骤4: 获取设置（带错误处理）
        let settings;
        try {
            settings = (await storageAdapter.get(STORAGE_KEY_SETTINGS)) || defaultSettings;
        } catch (settingsError) {
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
                            console.warn(
                                '[API] Notification failed for subscription:',
                                sub?.name || sub?.url,
                                notifyError
                            );
                        })
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

        // 步骤6: 保存数据到存储（使用存储适配器）
        try {
            if (diff) {
                const [subsHandled, profilesHandled] = await Promise.all([
                    diff.subscriptions
                        ? applyRowLevelDiff(storageAdapter, 'subscriptions', diff.subscriptions)
                        : false,
                    diff.profiles
                        ? applyRowLevelDiff(storageAdapter, 'profiles', diff.profiles)
                        : false,
                ]);

                const saveTasks = [];
                if (!subsHandled) saveTasks.push(storageAdapter.put(STORAGE_KEY_SUBS, finalMisubs));
                if (!profilesHandled)
                    saveTasks.push(storageAdapter.put(STORAGE_KEY_PROFILES, finalProfiles));
                if (saveTasks.length > 0) {
                    await Promise.all(saveTasks);
                }
            } else {
                const [subsHandled, profilesHandled] = await Promise.all([
                    syncCollectionRowLevel(storageAdapter, 'subscriptions', finalMisubs),
                    syncCollectionRowLevel(storageAdapter, 'profiles', finalProfiles),
                ]);

                const saveTasks = [];
                if (!subsHandled) saveTasks.push(storageAdapter.put(STORAGE_KEY_SUBS, finalMisubs));
                if (!profilesHandled)
                    saveTasks.push(storageAdapter.put(STORAGE_KEY_PROFILES, finalProfiles));
                if (saveTasks.length > 0) {
                    await Promise.all(saveTasks);
                }
            }
        } catch (storageError) {
            console.error('[API Error /misubs] Storage put failed:', storageError);
            return createJsonResponse(
                {
                    success: false,
                    message: `数据保存失败: ${storageError.message || '存储服务暂时不可用，请稍后重试'}`,
                },
                500
            );
        }

        // 步骤6.5: 清除节点缓存（订阅变动后确保拉取最新数据）
        try {
            const preserveKeys = (Array.isArray(finalMisubs) ? finalMisubs : [])
                .filter((sub) => sub?.enableNodeCache === true)
                .map((sub) => buildSubscriptionNodeCacheKey(sub));
            const cacheResult = await clearAllNodeCaches(storageAdapter, { preserveKeys });
            console.info(
                `[API] Cleared ${cacheResult.cleared} node caches after subscription update, preserved ${cacheResult.skipped || 0}`
            );
        } catch (cacheError) {
            // 缓存清除失败不影响保存结果
            console.warn('[API] Failed to clear node caches:', cacheError.message);
        }

        // 步骤7: 返回保存后的数据，确保前端能更新状态
        return createJsonResponse({
            success: true,
            message: diff ? '增量更新已保存' : '订阅源及订阅组已保存',
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
            500
        );
    }
}

/**
 * 处理设置获取API
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
function redactSettingsForResponse(settings = {}) {
    return {
        ...settings,
        webdavBackup: settings.webdavBackup
            ? { ...settings.webdavBackup, password: '' }
            : settings.webdavBackup,
    };
}

export async function handleSettingsGet(env) {
    try {
        const settings = (await SettingsCache.get(env)) || {};
        return createJsonResponse(redactSettingsForResponse({ ...defaultSettings, ...settings }));
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

        const reservedPathRoots = new Set([
            'settings',
            'login',
            'groups',
            'nodes',
            'subscriptions',
            'dashboard',
            'api',
            'explore',
            'sub',
            'cron',
            'assets',
            '@vite',
            'public',
            'profile',
            'logout',
            'auth_debug',
            'auth_check',
            'data',
            'clients',
            'system',
            'github',
            'telegram',
            'test_notification',
            'misubs',
            'node_count',
            'nodes',
            'fetch_external_url',
            'batch_update_nodes',
            'subscription_nodes',
            'debug_subscription',
            'preview',
        ]);

        const normalizePathRoot = (value) => {
            if (typeof value !== 'string') return '';
            return value.trim().replace(/^\/+/, '').split('/')[0].toLowerCase();
        };

        const rejectReservedValue = (value, fieldLabel) => {
            const pathRoot = normalizePathRoot(value);
            if (pathRoot && reservedPathRoots.has(pathRoot)) {
                return createJsonResponse(
                    {
                        success: false,
                        message: `"/${pathRoot}" 是系统保留路径，不可用作${fieldLabel}`,
                    },
                    400
                );
            }
            return null;
        };

        // 校验 customLoginPath 是否为系统保留路径
        if (newSettings.customLoginPath) {
            const rejected = rejectReservedValue(newSettings.customLoginPath, '自定义登录路径');
            if (rejected) return rejected;
        }

        // 订阅 Token 也不能使用会和路由冲突的保留路径
        if (newSettings.mytoken && newSettings.mytoken !== 'auto') {
            const rejected = rejectReservedValue(newSettings.mytoken, '自定义订阅Token');
            if (rejected) return rejected;
        }
        if (newSettings.profileToken && newSettings.profileToken !== 'profiles') {
            const rejected = rejectReservedValue(newSettings.profileToken, '订阅组分享Token');
            if (rejected) return rejected;
        }

        const storageAdapter = await getStorageAdapter(env);
        const oldSettings = (await storageAdapter.get(STORAGE_KEY_SETTINGS)) || {};
        if (newSettings.webdavBackup && oldSettings.webdavBackup) {
            const incomingPassword = newSettings.webdavBackup.password;
            if (incomingPassword === '' || incomingPassword == null) {
                newSettings.webdavBackup = {
                    ...newSettings.webdavBackup,
                    password: oldSettings.webdavBackup.password,
                };
            }
        }
        const finalSettings = { ...oldSettings, ...newSettings };

        // 使用存储适配器保存设置
        if (!storageAdapter || storageAdapter.type === 'noop') {
            return createJsonResponse(
                {
                    success: false,
                    message: 'D1 database not available',
                },
                503
            );
        }
        await storageAdapter.put(STORAGE_KEY_SETTINGS, finalSettings);
        SettingsCache.clear();

        // 纯界面偏好的保存（客户端用 X-MiSub-Save-Scope: preferences 声明，
        // 目前只有「忽略的待处理项」走这条路）不需要让整站节点缓存失效，
        // 也不该给用户发一条「设置已更新」的 TG 消息 ——
        // 「忽略」是轻量动作，每次都触发通知 + 全量缓存重建会很扰民。
        // 用请求头而不是在 body 里塞标记：body 会被 { ...oldSettings, ...newSettings }
        // 合并进设置并持久化，标记会变成脏数据。
        // 注意：只有确实不影响节点处理的载荷才允许带这个头，
        // 否则会漏掉必要的缓存失效。
        const preferencesOnly = request.headers.get('x-misub-save-scope') === 'preferences';

        if (!preferencesOnly) {
            // 清除节点缓存（设置变更可能影响节点处理逻辑）
            try {
                await clearAllNodeCaches(storageAdapter);
            } catch (cacheError) {
                console.warn('[API] Failed to clear node caches:', cacheError.message);
            }

            const message = `⚙️ *MiSub 设置更新* ⚙️\n\n您的 MiSub 应用设置已成功更新。`;
            await sendTgNotification(finalSettings, message);
        }

        return createJsonResponse({
            success: true,
            message: '设置已保存',
            data: redactSettingsForResponse(finalSettings),
        });
    } catch (e) {
        return createErrorResponse('保存设置失败', 500);
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

        await storageAdapter.delete(STORAGE_KEY_SETTINGS);

        // 清除内存缓存
        SettingsCache.clear();

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
export async function handlePublicProfilesRequest(env) {
    try {
        const storageAdapter = await getStorageAdapter(env);
        const cachedSettings = await SettingsCache.get(env);
        const [profiles, settings] = await Promise.all([
            typeof storageAdapter.getAllProfiles === 'function'
                ? storageAdapter.getAllProfiles()
                : storageAdapter.get(STORAGE_KEY_PROFILES).then((res) => res || []),
            Promise.resolve(cachedSettings || {}).then((res) => res || {}),
        ]);

        const profileToken = settings.profileToken || 'profiles';
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

        // Hero Configuration
        const hero = {
            title1: settings.heroTitle1 || '发现',
            title2: settings.heroTitle2 || '优质订阅',
            description:
                settings.heroDescription ||
                '浏览并获取由管理员分享的精选订阅组合，一键导入到您的客户端。',
        };

        // Guestbook Config (Safe subset)
        const guestbook = {
            enabled: settings.guestbook?.enabled,
            requireAudit: settings.guestbook?.requireAudit,
            allowAnonymous: settings.guestbook?.allowAnonymous,
        };

        // 过滤出公开且启用的订阅组
        const publicProfiles = profiles
            .map(normalizeProfile)
            .filter((p) => p.isPublic && p.enabled)
            .map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description || '',
                tags: Array.isArray(p.tags) ? p.tags : [],
                customId: p.customId,
                updatedAt: p.updatedAt,
                subscriptionCount: (p.subscriptions || []).length,
                manualNodeCount: (p.manualNodes || []).length,
            }));

        // Custom Page Config
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

        const publicLinks = normalizePublicLinksConfig(settings.publicLinks);
        const publicCores = normalizePublicCoresConfig(settings.publicCores);

        return createJsonResponse({
            success: true,
            data: publicProfiles,
            config: {
                profileToken,
                announcement,
                hero,
                guestbook,
                customPage,
                publicLinks,
                publicCores,
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

        // Merge with default settings to ensure enablePublicPage exists
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
        } catch {
            // Keep the safe default when the browser sends an invalid/missing path.
        }

        return createJsonResponse({
            enablePublicPage: mergedSettings.enablePublicPage,
            isLoginPath,
            customPage: {
                enabled: mergedSettings.customPage?.enabled || false,
                useDefaultLayout: mergedSettings.customPage?.useDefaultLayout !== false,
                allowExternalStylesheets:
                    mergedSettings.customPage?.allowExternalStylesheets === true,
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

/**
 * 处理密码更新API
 * @param {Object} request - HTTP请求对象
 * @param {Object} env - Cloudflare环境对象
 * @returns {Promise<Response>} HTTP响应
 */
export async function handleUpdatePassword(request, env) {
    if (request.method !== 'POST') {
        return createErrorResponse('Method Not Allowed', 405);
    }

    try {
        const { password } = await readJsonWithLimit(request, JSON_BODY_LIMITS.auth);

        if (!password || typeof password !== 'string' || password.length < 6) {
            return createErrorResponse('密码必须至少6位字符', 400);
        }

        await setAdminPassword(env, password);
        return createJsonResponse({ success: true, message: '密码已更新' });
    } catch (e) {
        console.error('[API Error /settings/password]', e);
        return createErrorResponse('Failed to update password', 500);
    }
}
