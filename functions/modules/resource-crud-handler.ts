/**
 * 细粒度资源 CRUD 处理器（Subscriptions / Manual Nodes / Profiles）
 * - 单条与批量配置即时落库
 * - 行级乐观锁（config_version CAS + 409 VERSION_CONFLICT）
 * - 配置字段与运行态/统计字段严格解耦
 * - 级联清理订阅组引用 & 增量精准清除节点缓存
 */

import type { ManualNodeItem, MisubItem, ProfileConfig, ProfileSubscriptionRef, SubscriptionItem } from '@misub/core/types.js';
import { isValidManualNodeUrl, isValidRemoteSubscriptionUrl } from '@misub/core/utils/url-validators.js';
import { generateNodeId, generateProfileId, generateSubscriptionId } from '@misub/core/utils/id.js';
import { ensureProfileLinkId, normalizeProfileIdentifier, rotateProfileLinkId } from '@misub/core/domain/profile-link.js';
import { getProfileSubscriptionId } from '@misub/core/domain/profile-subscription-ref.js';
import { validateSingleProfileAlias } from '@misub/core/domain/profile-alias.js';
import type { BoundRequestContext, Env, Repositories } from '../types.js';
import { createRepositories } from '../repositories/index.js';
import { isManualNodeRecord } from '../storage/d1-schema.js';
import { DEFAULT_SETTINGS as defaultSettings } from './config.js';
import { checkAndNotify, type NotifiableSubscription, type NotificationSettings } from './notifications.js';
import { clearAllNodeCaches } from '../services/node-cache-service.js';
import { buildSubscriptionNodeCacheKey } from '../services/subscription-service.js';
import { createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from './utils.js';
import {
  getAffectedProfileIds,
  getChangedSubscriptionIds,
  normalizeProfile,
  shouldCheckSubscriptionNotification,
} from './api-handler.js';

type EnvLike = Env | null | undefined;
type RecordObj = Record<string, unknown>;

const SUBSCRIPTION_EDITABLE_FIELDS = [
  'name',
  'url',
  'enabled',
  'autoUpdate',
  'exclude',
  'include',
  'customUserAgent',
  'fetchProxy',
  'plusAsSpace',
  'tags',
  'notes',
  'remarks',
  'remark',
  'note',
  'description',
  'website',
  'operators',
  'nodeTransform',
  'disabledNodes',
  'enableNodeCache',
  'excludeTraffic',
  'colorTag',
  'customId',
  'sortIndex',
] as const;

const NODE_EDITABLE_FIELDS = [
  'name',
  'url',
  'enabled',
  'tags',
  'notes',
  'remarks',
  'remark',
  'note',
  'colorTag',
  'protocol',
  'source',
  'sortIndex',
] as const;

const PROFILE_EDITABLE_FIELDS = [
  'name',
  'description',
  'desc',
  'remark',
  'customId',
  'linkId',
  'shortLink',
  'enabled',
  'isPublic',
  'subscriptions',
  'manualNodes',
  'subProfiles',
  'tags',
  'transformConfigMode',
  'transformConfig',
  'ruleLevel',
  'target',
  'prefixSettings',
  'subconverter',
  'operators',
  'nodeTransform',
  'nodeTransformPresetId',
  'expiresAt',
  'fetchMinInterval',
  'fetchLimitMode',
  'sortIndex',
] as const;

const SUBSCRIPTION_RUNTIME_FIELDS = [
  'nodeCount',
  'lastGoodNodeCount',
  'userInfo',
  'detectedName',
  'lastError',
  'lastUpdate',
] as const;

const NODE_RUNTIME_FIELDS = ['latency', 'status', 'latencyMode', 'lastTestedAt'] as const;

function isRecord(value: unknown): value is RecordObj {
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

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeTagArray(rawTags: unknown): string[] {
  let source: unknown[] = [];
  if (Array.isArray(rawTags)) {
    source = rawTags;
  } else if (typeof rawTags === 'string') {
    source = rawTags.split(/[,，]/);
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of source) {
    const trimmed = typeof item === 'string' ? item.trim() : '';
    if (trimmed && trimmed !== '__untagged__' && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

function pickAllowedFields(source: RecordObj, allowedFields: readonly string[]): RecordObj {
  const picked: RecordObj = {};
  for (const key of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      picked[key] = source[key];
    }
  }
  return picked;
}

function parseExpectedConfigVersion(raw: unknown): { present: boolean; valid: boolean; value: number } {
  if (raw === undefined || raw === null) {
    return { present: false, valid: true, value: 1 };
  }
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 1) {
    return { present: true, valid: false, value: 0 };
  }
  return { present: true, valid: true, value: num };
}

function getExpectedConfigVersionFromBody(body: RecordObj) {
  return parseExpectedConfigVersion(body.configVersion ?? body.expectedConfigVersion ?? body.expectedVersion);
}

function preserveRuntimeFields(
  target: RecordObj,
  current: RecordObj,
  runtimeFields: readonly string[],
): RecordObj {
  const next = { ...target };
  for (const field of runtimeFields) {
    if (Object.prototype.hasOwnProperty.call(current, field) && current[field] !== undefined) {
      next[field] = current[field];
    } else {
      delete next[field];
    }
  }
  return next;
}

function ensureStorageAvailable(env: EnvLike, context: BoundRequestContext | null): {
  repos?: Repositories;
  errorResponse?: Response;
} {
  const repos = createRepositories(env, context);
  if (!repos.storage || repos.storage.type === 'noop') {
    return {
      errorResponse: createJsonResponse({ success: false, message: 'D1 database not available' }, 503),
    };
  }
  return { repos };
}

async function parseJsonRequestBody(
  request: Request,
  maxBytes = JSON_BODY_LIMITS.normal,
): Promise<{ body?: RecordObj; errorResponse?: Response }> {
  try {
    const parsed = await readJsonWithLimit(request, maxBytes);
    if (!isRecord(parsed)) {
      return {
        errorResponse: createJsonResponse({ success: false, message: '请求体必须是 JSON 对象' }, 400),
      };
    }
    return { body: parsed };
  } catch (error: unknown) {
    const status = getErrorStatus(error);
    return {
      errorResponse: createJsonResponse(
        {
          success: false,
          message: status === 413 ? getErrorMessage(error) : '请求数据格式错误，请检查数据格式',
        },
        status || 400,
      ),
    };
  }
}

async function loadNotificationSettings(repos: Repositories): Promise<NotificationSettings> {
  try {
    const loaded = await repos.settings.getMain();
    return isRecord(loaded) && Object.keys(loaded).length > 0
      ? (loaded as NotificationSettings)
      : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function triggerSubscriptionNotifications(
  subsToNotify: MisubItem[],
  repos: Repositories,
  env: EnvLike,
  context: BoundRequestContext | null,
): void {
  if (!subsToNotify.length) return;
  const run = async () => {
    const settings = await loadNotificationSettings(repos);
    await Promise.allSettled(
      subsToNotify.map((sub) =>
        checkAndNotify(sub as NotifiableSubscription, settings, env).catch((err: unknown) => {
          console.warn('[API] Notification failed for subscription:', sub?.name || sub?.url, err);
        }),
      ),
    );
  };
  const promise = run().catch((err: unknown) => {
    console.warn('[API] Notification batch error:', err);
  });
  if (typeof context?.waitUntil === 'function') {
    context.waitUntil(promise);
  }
}

async function invalidateNodeCachesIncremental(
  repos: Repositories,
  {
    previousMisubs,
    finalMisubs,
    previousProfiles,
    finalProfiles,
    extraAffectedProfileIds = [],
    skipCachePreserveSubIds = [],
  }: {
    previousMisubs: MisubItem[];
    finalMisubs: MisubItem[];
    previousProfiles: ProfileConfig[];
    finalProfiles: ProfileConfig[];
    extraAffectedProfileIds?: string[];
    skipCachePreserveSubIds?: string[];
  },
): Promise<void> {
  try {
    const skipSubSet = new Set(skipCachePreserveSubIds);
    const preserveKeys = finalMisubs
      .filter((sub) => sub?.enableNodeCache === true && !skipSubSet.has(sub.id))
      .map((sub) => buildSubscriptionNodeCacheKey(sub as Partial<SubscriptionItem>));

    const changedSubIds = getChangedSubscriptionIds(
      previousMisubs as Array<Partial<SubscriptionItem> & RecordObj>,
      finalMisubs as Array<Partial<SubscriptionItem> & RecordObj>,
    );
    const normalizedPrevProfiles = previousProfiles.map((p) => normalizeProfile(p));
    const normalizedNextProfiles = finalProfiles.map((p) => normalizeProfile(p));
    const affectedProfileIds = getAffectedProfileIds(normalizedPrevProfiles, normalizedNextProfiles, changedSubIds);
    for (const extraId of extraAffectedProfileIds) {
      if (extraId) affectedProfileIds.add(extraId);
    }

    // Ensure parent composite profiles referencing extraAffectedProfileIds are also invalidated
    if (extraAffectedProfileIds.length > 0) {
      const profileIdByIdentifier = new Map<string, string>();
      for (const profile of normalizedNextProfiles) {
        if (!profile?.id) continue;
        profileIdByIdentifier.set(String(profile.id), String(profile.id));
        if (profile.customId) profileIdByIdentifier.set(String(profile.customId), String(profile.id));
        if (profile.linkId) profileIdByIdentifier.set(String(profile.linkId), String(profile.id));
      }
      let propagated = true;
      while (propagated) {
        propagated = false;
        for (const profile of normalizedNextProfiles) {
          if (!profile?.id || affectedProfileIds.has(String(profile.id))) continue;
          const refs = Array.isArray(profile.subProfiles) ? profile.subProfiles : [];
          if (refs.some((refId) => affectedProfileIds.has(profileIdByIdentifier.get(String(refId)) || String(refId)))) {
            affectedProfileIds.add(String(profile.id));
            propagated = true;
          }
        }
      }
    }

    const preserveProfileKeys: string[] = [];
    for (const profile of normalizedNextProfiles) {
      if (!profile?.id || affectedProfileIds.has(String(profile.id))) continue;
      const identifiers = new Set(
        [profile.id, profile.customId, profile.linkId].map((v) => String(v || '').trim()).filter(Boolean),
      );
      for (const pid of identifiers) {
        preserveProfileKeys.push(`node_cache_profile_${pid}`);
      }
    }

    const cacheOptions: {
      preserveKeys: string[];
      preserveProfileKeys?: string[];
      skipTokenCaches?: boolean;
    } = { preserveKeys };
    if (preserveProfileKeys.length > 0) {
      cacheOptions.preserveProfileKeys = preserveProfileKeys;
    }
    if (changedSubIds.size === 0) {
      cacheOptions.skipTokenCaches = true;
    }

    await clearAllNodeCaches(repos.storage, cacheOptions);
  } catch (error: unknown) {
    console.warn('[API] Failed to clear node caches:', getErrorMessage(error));
  }
}

async function pruneProfileReferencesAndPersist(
  repos: Repositories,
  {
    subscriptionIds = [],
    manualNodeIds = [],
    profileIdentifiers = [],
  }: {
    subscriptionIds?: string[];
    manualNodeIds?: string[];
    profileIdentifiers?: string[];
  },
): Promise<{ previousProfiles: ProfileConfig[]; finalProfiles: ProfileConfig[]; updatedProfiles: ProfileConfig[] }> {
  const previousProfiles = await repos.profiles.getAll({ fresh: true });
  const subSet = new Set(subscriptionIds.filter(Boolean));
  const nodeSet = new Set(manualNodeIds.filter(Boolean));
  const profSet = new Set(profileIdentifiers.filter(Boolean));
  const timestamp = nowIso();
  const updatedProfiles: ProfileConfig[] = [];

  const finalProfiles = previousProfiles.map((profile) => {
    let changed = false;
    let nextProfile: ProfileConfig = profile;

    if (subSet.size > 0 && Array.isArray(profile.subscriptions)) {
      const filteredSubs = (profile.subscriptions as ProfileSubscriptionRef[]).filter(
        (entry) => !subSet.has(getProfileSubscriptionId(entry)),
      );
      if (filteredSubs.length !== profile.subscriptions.length) {
        nextProfile = { ...nextProfile, subscriptions: filteredSubs };
        changed = true;
      }
    }

    if (nodeSet.size > 0 && Array.isArray(profile.manualNodes)) {
      const filteredNodes = profile.manualNodes.filter((id) => !nodeSet.has(id));
      if (filteredNodes.length !== profile.manualNodes.length) {
        nextProfile = { ...nextProfile, manualNodes: filteredNodes };
        changed = true;
      }
    }

    if (profSet.size > 0 && Array.isArray(profile.subProfiles)) {
      const filteredSubProfiles = profile.subProfiles.filter((id) => !profSet.has(id));
      if (filteredSubProfiles.length !== profile.subProfiles.length) {
        nextProfile = { ...nextProfile, subProfiles: filteredSubProfiles };
        changed = true;
      }
    }

    if (changed) {
      nextProfile = {
        ...nextProfile,
        downloadCount: Number(profile.downloadCount) || 0,
        configVersion: Math.max(1, Number(profile.configVersion) || 1) + 1,
        updatedAt: timestamp,
      };
      delete (nextProfile as RecordObj).version;
      updatedProfiles.push(nextProfile);
    }
    return nextProfile;
  });

  if (updatedProfiles.length > 0) {
    await repos.profiles.putMany(updatedProfiles);
  }

  return { previousProfiles, finalProfiles, updatedProfiles };
}

function buildVersionConflictResponse(current: unknown): Response {
  return createJsonResponse(
    {
      success: false,
      code: 'VERSION_CONFLICT',
      message: '该记录已在其他终端或标签页更新，请选择加载最新内容或强制覆盖保存',
      current,
    },
    409,
  );
}

function buildStorageSaveErrorResponse(error: unknown): Response {
  const message = getErrorMessage(error);
  return createJsonResponse(
    {
      success: false,
      message: `数据保存失败: ${message || '存储服务暂时不可用，请稍后重试'}`,
    },
    500,
  );
}

async function runStorageWrite(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    console.error('[Resource CRUD] Storage write failed:', error);
    return buildStorageSaveErrorResponse(error);
  }
}

// ==================== Subscriptions Handlers ====================

function buildCreatedSubscription(
  rawBody: RecordObj,
  sortIndex: number,
  timestamp: string,
): { item?: SubscriptionItem; error?: string } {
  const url = String(rawBody.url || '').trim();
  if (!url || !isValidRemoteSubscriptionUrl(url)) {
    return { error: '请输入有效的 http:// 或 https:// 订阅链接' };
  }
  const id = typeof rawBody.id === 'string' && rawBody.id.trim() ? rawBody.id.trim() : generateSubscriptionId();
  const picked = pickAllowedFields(rawBody, SUBSCRIPTION_EDITABLE_FIELDS);
  const { isUpdating: _omitUpdating, ...cleaned } = picked;
  const item: SubscriptionItem = {
    ...(cleaned as Partial<SubscriptionItem>),
    id,
    name: String(rawBody.name ?? '').trim(),
    url,
    enabled: rawBody.enabled !== false,
    autoUpdate: rawBody.autoUpdate !== false,
    tags: normalizeTagArray(rawBody.tags),
    sortIndex: Number.isFinite(Number(rawBody.sortIndex)) ? Number(rawBody.sortIndex) : sortIndex,
    configVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  delete (item as RecordObj).version;
  for (const field of SUBSCRIPTION_RUNTIME_FIELDS) {
    delete (item as RecordObj)[field];
  }
  return { item };
}

export async function handleSubscriptionCreate(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await runStorageWrite(async () => {
    const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
    if (storageErr || !repos) return storageErr!;

    const { body, errorResponse: parseErr } = await parseJsonRequestBody(request);
    if (parseErr || !body) return parseErr!;

    const [existingAll, existingProfiles] = await Promise.all([
      repos.subscriptions.getAll({ fresh: true }),
      repos.profiles.getAll({ fresh: true }),
    ]);
    const existingRemote = existingAll.filter((item) => !isManualNodeRecord(item));
    const minSort = existingRemote.reduce((min, item) => Math.min(min, Number(item.sortIndex) || 0), 0);
    const nextSortIndex = existingRemote.length > 0 ? minSort - 1 : 0;

    const { item, error } = buildCreatedSubscription(body, nextSortIndex, nowIso());
    if (error || !item) {
      return createJsonResponse({ success: false, message: error || '订阅参数无效' }, 400);
    }

    const saved = (await repos.subscriptions.save(item, { skipOtherTableDelete: true })) || item;
    const nextAll = [saved, ...existingAll.filter((entry) => entry.id !== saved.id)];

    triggerSubscriptionNotifications(
      shouldCheckSubscriptionNotification(saved, undefined) ? [saved] : [],
      repos,
      env,
      context,
    );
    await invalidateNodeCachesIncremental(repos, {
      previousMisubs: existingAll,
      finalMisubs: nextAll,
      previousProfiles: existingProfiles,
      finalProfiles: existingProfiles,
    });

    return createJsonResponse({ success: true, data: saved }, 201);
  });
}

export async function handleSubscriptionsBatchCreate(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await handleSubscriptionsBatch(request, env, context);
}

async function createSubscriptionsBatchFromBody(
  repos: Repositories,
  env: EnvLike,
  context: BoundRequestContext | null,
  body: RecordObj,
): Promise<Response> {
  const rawItems = body.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return createJsonResponse({ success: false, message: 'items 必须为非空数组' }, 400);
  }

  const [existingAll, existingProfiles] = await Promise.all([
    repos.subscriptions.getAll({ fresh: true }),
    repos.profiles.getAll({ fresh: true }),
  ]);
  const existingRemote = existingAll.filter((item) => !isManualNodeRecord(item));
  const minSort = existingRemote.reduce((min, item) => Math.min(min, Number(item.sortIndex) || 0), 0);
  const baseSort = existingRemote.length > 0 ? minSort - rawItems.length : 0;
  const timestamp = nowIso();

  const createdItems: SubscriptionItem[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const rawEntry = rawItems[i];
    if (!isRecord(rawEntry)) {
      return createJsonResponse({ success: false, message: '批量导入条目格式无效' }, 400);
    }
    const { item, error } = buildCreatedSubscription(rawEntry, baseSort + i, timestamp);
    if (error || !item) {
      return createJsonResponse({ success: false, message: error || '订阅参数无效' }, 400);
    }
    createdItems.push(item);
  }

  await repos.subscriptions.putMany(createdItems);
  const createdIds = new Set(createdItems.map((item) => item.id));
  const nextAll = [...createdItems, ...existingAll.filter((entry) => !createdIds.has(entry.id))];

  triggerSubscriptionNotifications(
    createdItems.filter((item) => shouldCheckSubscriptionNotification(item, undefined)),
    repos,
    env,
    context,
  );
  await invalidateNodeCachesIncremental(repos, {
    previousMisubs: existingAll,
    finalMisubs: nextAll,
    previousProfiles: existingProfiles,
    finalProfiles: existingProfiles,
  });

  return createJsonResponse({ success: true, data: createdItems }, 201);
}

export async function handleSubscriptionsBatch(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await runStorageWrite(async () => {
    const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
    if (storageErr || !repos) return storageErr!;

    const { body, errorResponse: parseErr } = await parseJsonRequestBody(request, JSON_BODY_LIMITS.large);
    if (parseErr || !body) return parseErr!;

    if (Array.isArray(body.items)) {
      return await createSubscriptionsBatchFromBody(repos, env, context, body);
    }

    const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
    if (action === 'enable' || action === 'disable') {
      const enabled = action === 'enable';
      const rawIds = Array.isArray(body.ids) ? body.ids : [];
      const targetIdSet = new Set(rawIds.map((v) => String(v || '').trim()).filter(Boolean));
      if (body.all !== true && targetIdSet.size === 0) {
        return createJsonResponse({ success: true, data: [] });
      }
      const [previousMisubs, existingProfiles] = await Promise.all([
        repos.subscriptions.getAll({ fresh: true }),
        repos.profiles.getAll({ fresh: true }),
      ]);
      const timestamp = nowIso();
      const updatedItems: SubscriptionItem[] = [];
      for (const item of previousMisubs) {
        if (isManualNodeRecord(item)) continue;
        if (body.all !== true && !targetIdSet.has(item.id)) continue;
        if (Boolean(item.enabled) === enabled) continue;
        const next: SubscriptionItem = {
          ...(item as SubscriptionItem),
          enabled,
          configVersion: Math.max(1, Number(item.configVersion) || 1) + 1,
          updatedAt: timestamp,
        };
        delete (next as RecordObj).version;
        updatedItems.push(next);
      }
      if (updatedItems.length > 0) {
        await repos.subscriptions.putMany(updatedItems);
        const updatedMap = new Map(updatedItems.map((item) => [item.id, item]));
        const finalMisubs = previousMisubs.map((item) => updatedMap.get(item.id) || item);
        await invalidateNodeCachesIncremental(repos, {
          previousMisubs,
          finalMisubs,
          previousProfiles: existingProfiles,
          finalProfiles: existingProfiles,
        });
      }
      return createJsonResponse({ success: true, data: updatedItems });
    }
    if (action === 'delete') {
      return await deleteSubscriptionsBatchFromBody(repos, body);
    }
    if (action === 'tags') {
      return await tagsSubscriptionsBatchFromBody(repos, body);
    }
    if (action === 'reorder') {
      return await reorderSubscriptionsFromBody(repos, body);
    }

    return createJsonResponse({ success: false, message: '不支持的批量操作或缺少 items 参数' }, 400);
  });
}

export async function handleSubscriptionPatch(
  request: Request,
  env: EnvLike,
  id: string,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await runStorageWrite(async () => {
    const targetId = String(id || '').trim();
    if (!targetId) {
      return createJsonResponse({ success: false, message: '缺少订阅 ID' }, 400);
    }

    const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
    if (storageErr || !repos) return storageErr!;

    const { body, errorResponse: parseErr } = await parseJsonRequestBody(request);
    if (parseErr || !body) return parseErr!;

    const expected = getExpectedConfigVersionFromBody(body);
    if (!expected.valid) {
      return createJsonResponse({ success: false, message: 'configVersion 格式无效' }, 400);
    }
    const force = Boolean(body.force);

    const current = await repos.subscriptions.getById(targetId, { fresh: true });
    if (!current || isManualNodeRecord(current)) {
      return createJsonResponse({ success: false, message: '订阅源不存在' }, 404);
    }

    const patch = pickAllowedFields(body, SUBSCRIPTION_EDITABLE_FIELDS);
    if (Object.prototype.hasOwnProperty.call(patch, 'url')) {
      const nextUrl = String(patch.url || '').trim();
      if (!nextUrl || !isValidRemoteSubscriptionUrl(nextUrl)) {
        return createJsonResponse({ success: false, message: '请输入有效的 http:// 或 https:// 订阅链接' }, 400);
      }
      patch.url = nextUrl;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'tags')) {
      patch.tags = normalizeTagArray(patch.tags);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      patch.name = String(patch.name ?? '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
      patch.enabled = patch.enabled !== false;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'autoUpdate')) {
      patch.autoUpdate = patch.autoUpdate !== false;
    }

    const currentConfigVersion = Math.max(1, Number(current.configVersion) || 1);
    const urlChanged = Object.prototype.hasOwnProperty.call(patch, 'url') && patch.url !== current.url;
    let nextObj: RecordObj = {
      ...(current as RecordObj),
      ...patch,
      id: current.id,
      configVersion: currentConfigVersion + 1,
      updatedAt: nowIso(),
    };
    delete nextObj.isUpdating;
    delete nextObj.version;

    if (urlChanged) {
      nextObj.nodeCount = 0;
      nextObj.userInfo = null;
      nextObj.lastError = null;
      nextObj.lastUpdate = null;
      delete nextObj.lastGoodNodeCount;
      delete nextObj.detectedName;
    } else {
      nextObj = preserveRuntimeFields(nextObj, current as RecordObj, SUBSCRIPTION_RUNTIME_FIELDS);
    }

    const nextItem = nextObj as SubscriptionItem;
    let saved: SubscriptionItem;
    if (expected.present && !force) {
      const cas = await repos.subscriptions.compareAndSwap(nextItem, expected.value, { skipOtherTableDelete: true });
      if (!cas.updated) {
        if (!cas.current) {
          return createJsonResponse({ success: false, message: '订阅源不存在' }, 404);
        }
        return buildVersionConflictResponse(cas.current);
      }
      saved = (cas.current || nextItem) as SubscriptionItem;
    } else {
      saved = ((await repos.subscriptions.save(nextItem, { skipOtherTableDelete: true })) || nextItem) as SubscriptionItem;
    }

    const [existingAll, existingProfiles] = await Promise.all([
      repos.subscriptions.getAll({ fresh: true }),
      repos.profiles.getAll({ fresh: true }),
    ]);
    const previousMisubs = existingAll.map((entry) => (entry.id === current.id ? current : entry));

    triggerSubscriptionNotifications(
      shouldCheckSubscriptionNotification(saved, current) ? [saved] : [],
      repos,
      env,
      context,
    );
    await invalidateNodeCachesIncremental(repos, {
      previousMisubs,
      finalMisubs: existingAll,
      previousProfiles: existingProfiles,
      finalProfiles: existingProfiles,
      skipCachePreserveSubIds: urlChanged ? [saved.id] : [],
    });

    return createJsonResponse({ success: true, data: saved });
  });
}

export async function handleSubscriptionDelete(
  env: EnvLike,
  id: string,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await runStorageWrite(async () => {
    const targetId = String(id || '').trim();
    if (!targetId) {
      return createJsonResponse({ success: false, message: '缺少订阅 ID' }, 400);
    }

    const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
    if (storageErr || !repos) return storageErr!;

    const current = await repos.subscriptions.getById(targetId, { fresh: true });
    if (!current || isManualNodeRecord(current)) {
      return createJsonResponse({ success: false, message: '订阅源不存在' }, 404);
    }

    const previousMisubs = await repos.subscriptions.getAll({ fresh: true });
    await repos.subscriptions.deleteById(targetId);
    const { previousProfiles, finalProfiles, updatedProfiles } = await pruneProfileReferencesAndPersist(repos, {
      subscriptionIds: [targetId],
    });

    await invalidateNodeCachesIncremental(repos, {
      previousMisubs,
      finalMisubs: previousMisubs.filter((item) => item.id !== targetId),
      previousProfiles,
      finalProfiles,
      extraAffectedProfileIds: updatedProfiles.map((p) => p.id),
    });

    return createJsonResponse({ success: true, data: { id: targetId, updatedProfiles } });
  });
}

export async function handleSubscriptionsBatchDelete(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
  if (storageErr || !repos) return storageErr!;

  const { body, errorResponse: parseErr } = await parseJsonRequestBody(request);
  if (parseErr || !body) return parseErr!;

  return await deleteSubscriptionsBatchFromBody(repos, body);
}

async function deleteSubscriptionsBatchFromBody(repos: Repositories, body: RecordObj): Promise<Response> {
  const previousMisubs = await repos.subscriptions.getAll({ fresh: true });
  const existingRemoteIds = new Set(
    previousMisubs.filter((item) => !isManualNodeRecord(item)).map((item) => item.id),
  );

  let targetIds: string[];
  if (body.all === true) {
    targetIds = Array.from(existingRemoteIds);
  } else if (Array.isArray(body.ids)) {
    targetIds = Array.from(
      new Set(body.ids.map((v) => String(v || '').trim()).filter((v) => v && existingRemoteIds.has(v))),
    );
  } else {
    return createJsonResponse({ success: false, message: '请提供要删除的订阅 ID 列表或 all: true' }, 400);
  }

  if (targetIds.length === 0) {
    return createJsonResponse({ success: true, data: { deletedIds: [], updatedProfiles: [] } });
  }

  await repos.subscriptions.deleteManyByIds(targetIds);
  const deleteSet = new Set(targetIds);
  const { previousProfiles, finalProfiles, updatedProfiles } = await pruneProfileReferencesAndPersist(repos, {
    subscriptionIds: targetIds,
  });

  await invalidateNodeCachesIncremental(repos, {
    previousMisubs,
    finalMisubs: previousMisubs.filter((item) => !deleteSet.has(item.id)),
    previousProfiles,
    finalProfiles,
    extraAffectedProfileIds: updatedProfiles.map((p) => p.id),
  });

  return createJsonResponse({ success: true, data: { deletedIds: targetIds, updatedProfiles } });
}

export async function handleSubscriptionsBatchTags(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
  if (storageErr || !repos) return storageErr!;

  const { body, errorResponse: parseErr } = await parseJsonRequestBody(request, JSON_BODY_LIMITS.large);
  if (parseErr || !body) return parseErr!;

  return await tagsSubscriptionsBatchFromBody(repos, body);
}

async function tagsSubscriptionsBatchFromBody(repos: Repositories, body: RecordObj): Promise<Response> {
  if (!Array.isArray(body.updates)) {
    return createJsonResponse({ success: false, message: 'updates 必须为数组' }, 400);
  }
  if (body.updates.length === 0) {
    return createJsonResponse({ success: true, data: [] });
  }

  const [previousMisubs, existingProfiles] = await Promise.all([
    repos.subscriptions.getAll({ fresh: true }),
    repos.profiles.getAll({ fresh: true }),
  ]);
  const byId = new Map(
    previousMisubs.filter((item) => !isManualNodeRecord(item)).map((item) => [item.id, item]),
  );

  const timestamp = nowIso();
  const updatedItems: SubscriptionItem[] = [];
  for (const entry of body.updates) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue;
    const current = byId.get(entry.id.trim());
    if (!current) continue;
    const updated: SubscriptionItem = {
      ...(current as SubscriptionItem),
      tags: normalizeTagArray(entry.tags),
      configVersion: Math.max(1, Number(current.configVersion) || 1) + 1,
      updatedAt: timestamp,
    };
    delete (updated as RecordObj).version;
    updatedItems.push(updated);
  }

  if (updatedItems.length > 0) {
    await repos.subscriptions.putMany(updatedItems);
    const updatedMap = new Map(updatedItems.map((item) => [item.id, item]));
    const finalMisubs = previousMisubs.map((item) => updatedMap.get(item.id) || item);
    await invalidateNodeCachesIncremental(repos, {
      previousMisubs,
      finalMisubs,
      previousProfiles: existingProfiles,
      finalProfiles: existingProfiles,
    });
  }

  return createJsonResponse({ success: true, data: updatedItems });
}

export async function handleSubscriptionsReorder(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
  if (storageErr || !repos) return storageErr!;

  const { body, errorResponse: parseErr } = await parseJsonRequestBody(request);
  if (parseErr || !body) return parseErr!;

  return await reorderSubscriptionsFromBody(repos, body);
}

async function reorderSubscriptionsFromBody(repos: Repositories, body: RecordObj): Promise<Response> {
  if (!Array.isArray(body.orderedIds)) {
    return createJsonResponse({ success: false, message: 'orderedIds 必须为数组' }, 400);
  }

  const [previousMisubs, existingProfiles] = await Promise.all([
    repos.subscriptions.getAll({ fresh: true }),
    repos.profiles.getAll({ fresh: true }),
  ]);
  const remoteSubs = previousMisubs.filter((item) => !isManualNodeRecord(item));
  const remoteById = new Map(remoteSubs.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const ordered: SubscriptionItem[] = [];

  for (const rawId of body.orderedIds) {
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (!id || seen.has(id)) continue;
    const found = remoteById.get(id);
    if (found) {
      seen.add(id);
      ordered.push(found as SubscriptionItem);
    }
  }
  for (const item of remoteSubs) {
    if (!seen.has(item.id)) {
      ordered.push(item as SubscriptionItem);
    }
  }

  const timestamp = nowIso();
  const changedItems: SubscriptionItem[] = [];
  const reorderedItems: SubscriptionItem[] = ordered.map((item, idx) => {
    const prevSort = Number(item.sortIndex);
    if (Number.isFinite(prevSort) && prevSort === idx) {
      return item;
    }
    const next: SubscriptionItem = {
      ...item,
      sortIndex: idx,
      configVersion: Math.max(1, Number(item.configVersion) || 1) + 1,
      updatedAt: timestamp,
    };
    delete (next as RecordObj).version;
    changedItems.push(next);
    return next;
  });

  if (changedItems.length > 0) {
    await repos.subscriptions.putMany(changedItems);
    const changedMap = new Map(changedItems.map((item) => [item.id, item]));
    const finalMisubs = previousMisubs.map((item) => changedMap.get(item.id) || item);
    await invalidateNodeCachesIncremental(repos, {
      previousMisubs,
      finalMisubs,
      previousProfiles: existingProfiles,
      finalProfiles: existingProfiles,
    });
  }

  return createJsonResponse({ success: true, data: reorderedItems });
}

// ==================== Manual Nodes Handlers ====================

function buildCreatedNode(
  rawBody: RecordObj,
  sortIndex: number,
  timestamp: string,
): { item?: ManualNodeItem; error?: string } {
  const url = String(rawBody.url || '').trim();
  if (!url || !isValidManualNodeUrl(url)) {
    return { error: '请输入有效的代理节点链接' };
  }
  const id = typeof rawBody.id === 'string' && rawBody.id.trim() ? rawBody.id.trim() : generateNodeId();
  const picked = pickAllowedFields(rawBody, NODE_EDITABLE_FIELDS);
  const item: ManualNodeItem = {
    ...(picked as Partial<ManualNodeItem>),
    id,
    name: String(rawBody.name ?? '').trim(),
    url,
    enabled: rawBody.enabled !== false,
    tags: normalizeTagArray(rawBody.tags),
    sortIndex: Number.isFinite(Number(rawBody.sortIndex)) ? Number(rawBody.sortIndex) : sortIndex,
    configVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  delete (item as RecordObj).version;
  for (const field of NODE_RUNTIME_FIELDS) {
    delete (item as RecordObj)[field];
  }
  return { item };
}

export async function handleNodeCreate(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await runStorageWrite(async () => {
    const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
    if (storageErr || !repos) return storageErr!;

    const { body, errorResponse: parseErr } = await parseJsonRequestBody(request);
    if (parseErr || !body) return parseErr!;

    const [existingAll, existingProfiles] = await Promise.all([
      repos.subscriptions.getAll({ fresh: true }),
      repos.profiles.getAll({ fresh: true }),
    ]);
    const existingNodes = existingAll.filter((item) => isManualNodeRecord(item));
    const minSort = existingNodes.reduce((min, item) => Math.min(min, Number(item.sortIndex) || 0), 0);
    const nextSortIndex = existingNodes.length > 0 ? minSort - 1 : 0;

    const { item, error } = buildCreatedNode(body, nextSortIndex, nowIso());
    if (error || !item) {
      return createJsonResponse({ success: false, message: error || '节点参数无效' }, 400);
    }

    const saved = (await repos.nodes.save(item)) || item;
    const nextAll = [saved, ...existingAll.filter((entry) => entry.id !== saved.id)];

    await invalidateNodeCachesIncremental(repos, {
      previousMisubs: existingAll,
      finalMisubs: nextAll,
      previousProfiles: existingProfiles,
      finalProfiles: existingProfiles,
    });

    return createJsonResponse({ success: true, data: saved }, 201);
  });
}

export async function handleNodesBatchCreate(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await handleNodesBatch(request, env, context);
}

async function createNodesBatchFromBody(
  repos: Repositories,
  body: RecordObj,
): Promise<Response> {
  const rawItems = body.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return createJsonResponse({ success: false, message: 'items 必须为非空数组' }, 400);
  }

  const [existingAll, existingProfiles] = await Promise.all([
    repos.subscriptions.getAll({ fresh: true }),
    repos.profiles.getAll({ fresh: true }),
  ]);
  const existingNodes = existingAll.filter((item) => isManualNodeRecord(item));
  const minSort = existingNodes.reduce((min, item) => Math.min(min, Number(item.sortIndex) || 0), 0);
  const baseSort = existingNodes.length > 0 ? minSort - rawItems.length : 0;
  const timestamp = nowIso();

  const createdItems: ManualNodeItem[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const rawEntry = rawItems[i];
    if (!isRecord(rawEntry)) {
      return createJsonResponse({ success: false, message: '批量导入节点格式无效' }, 400);
    }
    const { item, error } = buildCreatedNode(rawEntry, baseSort + i, timestamp);
    if (error || !item) {
      return createJsonResponse({ success: false, message: error || '节点参数无效' }, 400);
    }
    createdItems.push(item);
  }

  await repos.nodes.putMany(createdItems);
  const createdIds = new Set(createdItems.map((item) => item.id));
  const nextAll = [...createdItems, ...existingAll.filter((entry) => !createdIds.has(entry.id))];

  await invalidateNodeCachesIncremental(repos, {
    previousMisubs: existingAll,
    finalMisubs: nextAll,
    previousProfiles: existingProfiles,
    finalProfiles: existingProfiles,
  });

  return createJsonResponse({ success: true, data: createdItems }, 201);
}

export async function handleNodesBatch(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await runStorageWrite(async () => {
    const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
    if (storageErr || !repos) return storageErr!;

    const { body, errorResponse: parseErr } = await parseJsonRequestBody(request, JSON_BODY_LIMITS.large);
    if (parseErr || !body) return parseErr!;

    if (Array.isArray(body.items)) {
      return await createNodesBatchFromBody(repos, body);
    }

    const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
    if (action === 'enable' || action === 'disable') {
      const enabled = action === 'enable';
      const rawIds = Array.isArray(body.ids) ? body.ids : [];
      const targetIdSet = new Set(rawIds.map((v) => String(v || '').trim()).filter(Boolean));
      if (body.all !== true && targetIdSet.size === 0) {
        return createJsonResponse({ success: true, data: [] });
      }
      const [previousMisubs, existingProfiles] = await Promise.all([
        repos.subscriptions.getAll({ fresh: true }),
        repos.profiles.getAll({ fresh: true }),
      ]);
      const timestamp = nowIso();
      const updatedItems: ManualNodeItem[] = [];
      for (const item of previousMisubs) {
        if (!isManualNodeRecord(item)) continue;
        if (body.all !== true && !targetIdSet.has(item.id)) continue;
        if (Boolean(item.enabled) === enabled) continue;
        const next: ManualNodeItem = {
          ...(item as ManualNodeItem),
          enabled,
          configVersion: Math.max(1, Number(item.configVersion) || 1) + 1,
          updatedAt: timestamp,
        };
        delete (next as RecordObj).version;
        updatedItems.push(next);
      }
      if (updatedItems.length > 0) {
        await repos.nodes.putMany(updatedItems);
        const updatedMap = new Map(updatedItems.map((item) => [item.id, item]));
        const finalMisubs = previousMisubs.map((item) => updatedMap.get(item.id) || item);
        await invalidateNodeCachesIncremental(repos, {
          previousMisubs,
          finalMisubs,
          previousProfiles: existingProfiles,
          finalProfiles: existingProfiles,
        });
      }
      return createJsonResponse({ success: true, data: updatedItems });
    }
    if (action === 'delete') {
      return await deleteNodesBatchFromBody(repos, body);
    }
    if (action === 'tags') {
      return await tagsNodesBatchFromBody(repos, body);
    }
    if (action === 'reorder') {
      return await reorderNodesFromBody(repos, body);
    }

    return createJsonResponse({ success: false, message: '不支持的批量操作或缺少 items 参数' }, 400);
  });
}

export async function handleNodePatch(
  request: Request,
  env: EnvLike,
  id: string,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await runStorageWrite(async () => {
    const targetId = String(id || '').trim();
    if (!targetId) {
      return createJsonResponse({ success: false, message: '缺少节点 ID' }, 400);
    }

    const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
    if (storageErr || !repos) return storageErr!;

    const { body, errorResponse: parseErr } = await parseJsonRequestBody(request);
    if (parseErr || !body) return parseErr!;

    const expected = getExpectedConfigVersionFromBody(body);
    if (!expected.valid) {
      return createJsonResponse({ success: false, message: 'configVersion 格式无效' }, 400);
    }
    const force = Boolean(body.force);

    const current = await repos.nodes.getById(targetId, { fresh: true });
    if (!current || !isManualNodeRecord(current)) {
      return createJsonResponse({ success: false, message: '手动节点不存在' }, 404);
    }

    const patch = pickAllowedFields(body, NODE_EDITABLE_FIELDS);
    if (Object.prototype.hasOwnProperty.call(patch, 'url')) {
      const nextUrl = String(patch.url || '').trim();
      if (!nextUrl || !isValidManualNodeUrl(nextUrl)) {
        return createJsonResponse({ success: false, message: '请输入有效的代理节点链接' }, 400);
      }
      patch.url = nextUrl;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'tags')) {
      patch.tags = normalizeTagArray(patch.tags);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      patch.name = String(patch.name ?? '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
      patch.enabled = patch.enabled !== false;
    }

    const currentConfigVersion = Math.max(1, Number(current.configVersion) || 1);
    const urlChanged = Object.prototype.hasOwnProperty.call(patch, 'url') && patch.url !== current.url;
    let nextObj: RecordObj = {
      ...(current as RecordObj),
      ...patch,
      id: current.id,
      configVersion: currentConfigVersion + 1,
      updatedAt: nowIso(),
    };
    delete nextObj.version;

    if (urlChanged) {
      for (const field of NODE_RUNTIME_FIELDS) {
        delete nextObj[field];
      }
    } else {
      nextObj = preserveRuntimeFields(nextObj, current as RecordObj, NODE_RUNTIME_FIELDS);
    }

    const nextItem = nextObj as ManualNodeItem;
    let saved: ManualNodeItem;
    if (expected.present && !force) {
      const cas = await repos.nodes.compareAndSwap(nextItem, expected.value, { skipOtherTableDelete: true });
      if (!cas.updated) {
        if (!cas.current) {
          return createJsonResponse({ success: false, message: '手动节点不存在' }, 404);
        }
        return buildVersionConflictResponse(cas.current);
      }
      saved = (cas.current || nextItem) as ManualNodeItem;
    } else {
      saved = ((await repos.nodes.save(nextItem)) || nextItem) as ManualNodeItem;
    }

    const [existingAll, existingProfiles] = await Promise.all([
      repos.subscriptions.getAll({ fresh: true }),
      repos.profiles.getAll({ fresh: true }),
    ]);
    const previousMisubs = existingAll.map((entry) => (entry.id === current.id ? current : entry));

    await invalidateNodeCachesIncremental(repos, {
      previousMisubs,
      finalMisubs: existingAll,
      previousProfiles: existingProfiles,
      finalProfiles: existingProfiles,
    });

    return createJsonResponse({ success: true, data: saved });
  });
}

export async function handleNodeDelete(
  env: EnvLike,
  id: string,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await runStorageWrite(async () => {
    const targetId = String(id || '').trim();
    if (!targetId) {
      return createJsonResponse({ success: false, message: '缺少节点 ID' }, 400);
    }

    const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
    if (storageErr || !repos) return storageErr!;

    const current = await repos.nodes.getById(targetId, { fresh: true });
    if (!current || !isManualNodeRecord(current)) {
      return createJsonResponse({ success: false, message: '手动节点不存在' }, 404);
    }

    const previousMisubs = await repos.subscriptions.getAll({ fresh: true });
    await repos.nodes.deleteById(targetId);
    const { previousProfiles, finalProfiles, updatedProfiles } = await pruneProfileReferencesAndPersist(repos, {
      manualNodeIds: [targetId],
    });

    await invalidateNodeCachesIncremental(repos, {
      previousMisubs,
      finalMisubs: previousMisubs.filter((item) => item.id !== targetId),
      previousProfiles,
      finalProfiles,
      extraAffectedProfileIds: updatedProfiles.map((p) => p.id),
    });

    return createJsonResponse({ success: true, data: { id: targetId, updatedProfiles } });
  });
}

export async function handleNodesBatchDelete(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
  if (storageErr || !repos) return storageErr!;

  const { body, errorResponse: parseErr } = await parseJsonRequestBody(request);
  if (parseErr || !body) return parseErr!;

  return await deleteNodesBatchFromBody(repos, body);
}

async function deleteNodesBatchFromBody(repos: Repositories, body: RecordObj): Promise<Response> {
  const previousMisubs = await repos.subscriptions.getAll({ fresh: true });
  const existingNodeIds = new Set(
    previousMisubs.filter((item) => isManualNodeRecord(item)).map((item) => item.id),
  );

  let targetIds: string[];
  if (body.all === true) {
    targetIds = Array.from(existingNodeIds);
  } else if (Array.isArray(body.ids)) {
    targetIds = Array.from(
      new Set(body.ids.map((v) => String(v || '').trim()).filter((v) => v && existingNodeIds.has(v))),
    );
  } else {
    return createJsonResponse({ success: false, message: '请提供要删除的节点 ID 列表或 all: true' }, 400);
  }

  if (targetIds.length === 0) {
    return createJsonResponse({ success: true, data: { deletedIds: [], updatedProfiles: [] } });
  }

  await repos.nodes.deleteManyByIds(targetIds);
  const deleteSet = new Set(targetIds);
  const { previousProfiles, finalProfiles, updatedProfiles } = await pruneProfileReferencesAndPersist(repos, {
    manualNodeIds: targetIds,
  });

  await invalidateNodeCachesIncremental(repos, {
    previousMisubs,
    finalMisubs: previousMisubs.filter((item) => !deleteSet.has(item.id)),
    previousProfiles,
    finalProfiles,
    extraAffectedProfileIds: updatedProfiles.map((p) => p.id),
  });

  return createJsonResponse({ success: true, data: { deletedIds: targetIds, updatedProfiles } });
}

export async function handleNodesBatchTags(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
  if (storageErr || !repos) return storageErr!;

  const { body, errorResponse: parseErr } = await parseJsonRequestBody(request, JSON_BODY_LIMITS.large);
  if (parseErr || !body) return parseErr!;

  return await tagsNodesBatchFromBody(repos, body);
}

async function tagsNodesBatchFromBody(repos: Repositories, body: RecordObj): Promise<Response> {
  if (!Array.isArray(body.updates)) {
    return createJsonResponse({ success: false, message: 'updates 必须为数组' }, 400);
  }
  if (body.updates.length === 0) {
    return createJsonResponse({ success: true, data: [] });
  }

  const [previousMisubs, existingProfiles] = await Promise.all([
    repos.subscriptions.getAll({ fresh: true }),
    repos.profiles.getAll({ fresh: true }),
  ]);
  const byId = new Map(
    previousMisubs.filter((item) => isManualNodeRecord(item)).map((item) => [item.id, item as ManualNodeItem]),
  );

  const timestamp = nowIso();
  const updatedItems: ManualNodeItem[] = [];
  for (const entry of body.updates) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue;
    const current = byId.get(entry.id.trim());
    if (!current) continue;
    const next: ManualNodeItem = {
      ...current,
      tags: normalizeTagArray(entry.tags),
      configVersion: Math.max(1, Number(current.configVersion) || 1) + 1,
      updatedAt: timestamp,
    };
    delete (next as RecordObj).version;
    updatedItems.push(next);
  }

  if (updatedItems.length > 0) {
    await repos.nodes.putMany(updatedItems);
    const updatedMap = new Map(updatedItems.map((item) => [item.id, item]));
    const finalMisubs = previousMisubs.map((item) => updatedMap.get(item.id) || item);
    await invalidateNodeCachesIncremental(repos, {
      previousMisubs,
      finalMisubs,
      previousProfiles: existingProfiles,
      finalProfiles: existingProfiles,
    });
  }

  return createJsonResponse({ success: true, data: updatedItems });
}

export async function handleNodesReorder(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
  if (storageErr || !repos) return storageErr!;

  const { body, errorResponse: parseErr } = await parseJsonRequestBody(request);
  if (parseErr || !body) return parseErr!;

  return await reorderNodesFromBody(repos, body);
}

async function reorderNodesFromBody(repos: Repositories, body: RecordObj): Promise<Response> {
  if (!Array.isArray(body.orderedIds)) {
    return createJsonResponse({ success: false, message: 'orderedIds 必须为数组' }, 400);
  }

  const [previousMisubs, existingProfiles] = await Promise.all([
    repos.subscriptions.getAll({ fresh: true }),
    repos.profiles.getAll({ fresh: true }),
  ]);
  const manualNodes = previousMisubs.filter((item) => isManualNodeRecord(item)) as ManualNodeItem[];
  const byId = new Map(manualNodes.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const ordered: ManualNodeItem[] = [];

  for (const rawId of body.orderedIds) {
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (!id || seen.has(id)) continue;
    const found = byId.get(id);
    if (found) {
      seen.add(id);
      ordered.push(found);
    }
  }
  for (const item of manualNodes) {
    if (!seen.has(item.id)) {
      ordered.push(item);
    }
  }

  const timestamp = nowIso();
  const changedItems: ManualNodeItem[] = [];
  const reorderedItems: ManualNodeItem[] = ordered.map((item, idx) => {
    const prevSort = Number(item.sortIndex);
    if (Number.isFinite(prevSort) && prevSort === idx) {
      return item;
    }
    const next: ManualNodeItem = {
      ...item,
      sortIndex: idx,
      configVersion: Math.max(1, Number(item.configVersion) || 1) + 1,
      updatedAt: timestamp,
    };
    delete (next as RecordObj).version;
    changedItems.push(next);
    return next;
  });

  if (changedItems.length > 0) {
    await repos.nodes.putMany(changedItems);
    const changedMap = new Map(changedItems.map((item) => [item.id, item]));
    const finalMisubs = previousMisubs.map((item) => changedMap.get(item.id) || item);
    await invalidateNodeCachesIncremental(repos, {
      previousMisubs,
      finalMisubs,
      previousProfiles: existingProfiles,
      finalProfiles: existingProfiles,
    });
  }

  return createJsonResponse({ success: true, data: reorderedItems });
}

// ==================== Profiles Handlers ====================

export async function handleProfileCreate(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await runStorageWrite(async () => {
    const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
    if (storageErr || !repos) return storageErr!;

    const { body, errorResponse: parseErr } = await parseJsonRequestBody(request);
    if (parseErr || !body) return parseErr!;

    const name = String(body.name ?? '').trim();
    if (!name) {
      return createJsonResponse({ success: false, message: '订阅组名称不能为空' }, 400);
    }

    const existingProfiles = await repos.profiles.getAll({ fresh: true });
    const rawCustomId = normalizeProfileIdentifier(body.customId);
    const aliasCheck = validateSingleProfileAlias(rawCustomId, { profiles: existingProfiles });
    if (!aliasCheck.valid) {
      return createJsonResponse(
        {
          success: false,
          message: aliasCheck.message || '自定义别名校验失败',
          code: aliasCheck.code || 'invalid_custom_id',
        },
        400,
      );
    }

    const minSort = existingProfiles.reduce((min, item) => Math.min(min, Number(item.sortIndex) || 0), 0);
    const nextSortIndex = existingProfiles.length > 0 ? minSort - 1 : 0;
    const timestamp = nowIso();
    const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : generateProfileId();
    const picked = pickAllowedFields(body, PROFILE_EDITABLE_FIELDS);
    if (!Object.prototype.hasOwnProperty.call(picked, 'ruleLevel') && typeof body.clashRuleLevel === 'string') {
      picked.ruleLevel = body.clashRuleLevel;
    }

    const normalized = normalizeProfile(
      ensureProfileLinkId({
        ...picked,
        id,
        name,
        customId: aliasCheck.alias,
        tags: normalizeTagArray(body.tags),
        downloadCount: 0,
        sortIndex: Number.isFinite(Number(body.sortIndex)) ? Number(body.sortIndex) : nextSortIndex,
        configVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ) as ProfileConfig;
    delete (normalized as RecordObj).version;

    const saved = (await repos.profiles.save(normalized)) || normalized;
    return createJsonResponse({ success: true, data: saved }, 201);
  });
}

export async function handleProfilePatch(
  request: Request,
  env: EnvLike,
  id: string,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await runStorageWrite(async () => {
    const targetId = String(id || '').trim();
    if (!targetId) {
      return createJsonResponse({ success: false, message: '缺少订阅组 ID' }, 400);
    }

    const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
    if (storageErr || !repos) return storageErr!;

    const { body, errorResponse: parseErr } = await parseJsonRequestBody(request);
    if (parseErr || !body) return parseErr!;

    const expected = getExpectedConfigVersionFromBody(body);
    if (!expected.valid) {
      return createJsonResponse({ success: false, message: 'configVersion 格式无效' }, 400);
    }
    const force = Boolean(body.force);

    const current = await repos.profiles.getById(targetId, { fresh: true });
    if (!current) {
      return createJsonResponse({ success: false, message: '订阅组不存在' }, 404);
    }

    const patch = pickAllowedFields(body, PROFILE_EDITABLE_FIELDS);
    if (!Object.prototype.hasOwnProperty.call(patch, 'ruleLevel') && typeof body.clashRuleLevel === 'string') {
      patch.ruleLevel = body.clashRuleLevel;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      const nextName = String(patch.name ?? '').trim();
      if (!nextName) {
        return createJsonResponse({ success: false, message: '订阅组名称不能为空' }, 400);
      }
      patch.name = nextName;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'tags')) {
      patch.tags = normalizeTagArray(patch.tags);
    }

    const shouldRotateLink = body.rotateLinkId === true;
    const allProfiles = await repos.profiles.getAll({ fresh: true });
    if (shouldRotateLink || Object.prototype.hasOwnProperty.call(patch, 'customId')) {
      const nextAlias = shouldRotateLink ? '' : normalizeProfileIdentifier(patch.customId);
      const prevAlias = normalizeProfileIdentifier(current.customId);
      const legacyExempt = Boolean(prevAlias && prevAlias === nextAlias);
      const aliasCheck = validateSingleProfileAlias(nextAlias, {
        currentProfileId: current.id,
        profiles: allProfiles,
        legacyExempt,
      });
      if (!aliasCheck.valid) {
        return createJsonResponse(
          {
            success: false,
            message: aliasCheck.message || '自定义别名校验失败',
            code: aliasCheck.code || 'invalid_custom_id',
          },
          400,
        );
      }
      patch.customId = aliasCheck.alias;
    }

    const baseProfile = shouldRotateLink ? rotateProfileLinkId(current) : ensureProfileLinkId(current);
    const preservedLinkId = !normalizeProfileIdentifier(patch.linkId)
      ? normalizeProfileIdentifier(baseProfile.linkId)
      : normalizeProfileIdentifier(patch.linkId);

    const currentConfigVersion = Math.max(1, Number(current.configVersion) || 1);
    const merged = normalizeProfile(
      ensureProfileLinkId({
        ...baseProfile,
        ...patch,
        id: current.id,
        ...(preservedLinkId ? { linkId: preservedLinkId } : {}),
        downloadCount: Number(current.downloadCount) || 0,
        configVersion: currentConfigVersion + 1,
        updatedAt: nowIso(),
      }),
    ) as ProfileConfig;
    delete (merged as RecordObj).clashRuleLevel;
    delete (merged as RecordObj).version;

    let saved: ProfileConfig;
    if (expected.present && !force) {
      const cas = await repos.profiles.compareAndSwap(merged, expected.value);
      if (!cas.updated) {
        if (!cas.current) {
          return createJsonResponse({ success: false, message: '订阅组不存在' }, 404);
        }
        return buildVersionConflictResponse(cas.current);
      }
      saved = cas.current || merged;
    } else {
      saved = (await repos.profiles.save(merged)) || merged;
    }

    const allMisubs = await repos.subscriptions.getAll({ fresh: true });
    const finalProfiles = allProfiles.map((p) => (p.id === saved.id ? saved : p));
    await invalidateNodeCachesIncremental(repos, {
      previousMisubs: allMisubs,
      finalMisubs: allMisubs,
      previousProfiles: allProfiles,
      finalProfiles,
      extraAffectedProfileIds: [saved.id],
    });

    return createJsonResponse({ success: true, data: saved });
  });
}

export async function handleProfileDelete(
  env: EnvLike,
  id: string,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await runStorageWrite(async () => {
    const targetId = String(id || '').trim();
    if (!targetId) {
      return createJsonResponse({ success: false, message: '缺少订阅组 ID' }, 400);
    }

    const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
    if (storageErr || !repos) return storageErr!;

    const current = await repos.profiles.getById(targetId, { fresh: true });
    if (!current) {
      return createJsonResponse({ success: false, message: '订阅组不存在' }, 404);
    }

    const [allMisubs, previousProfiles] = await Promise.all([
      repos.subscriptions.getAll({ fresh: true }),
      repos.profiles.getAll({ fresh: true }),
    ]);
    await repos.profiles.deleteById(targetId);

    const removedIdentifiers = [current.id, current.customId].filter((v): v is string => Boolean(v));
    const { finalProfiles, updatedProfiles } = await pruneProfileReferencesAndPersist(repos, {
      profileIdentifiers: removedIdentifiers,
    });

    await invalidateNodeCachesIncremental(repos, {
      previousMisubs: allMisubs,
      finalMisubs: allMisubs,
      previousProfiles,
      finalProfiles,
      extraAffectedProfileIds: [targetId, ...updatedProfiles.map((p) => p.id)],
    });

    return createJsonResponse({ success: true, data: { id: targetId, updatedProfiles } });
  });
}

export async function handleProfilesBatchDelete(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
  if (storageErr || !repos) return storageErr!;

  const { body, errorResponse: parseErr } = await parseJsonRequestBody(request);
  if (parseErr || !body) return parseErr!;

  return await deleteProfilesBatchFromBody(repos, body);
}

async function deleteProfilesBatchFromBody(repos: Repositories, body: RecordObj): Promise<Response> {
  const [allMisubs, previousProfiles] = await Promise.all([
    repos.subscriptions.getAll({ fresh: true }),
    repos.profiles.getAll({ fresh: true }),
  ]);
  const byId = new Map(previousProfiles.map((p) => [p.id, p]));

  let targetIds: string[];
  if (body.all === true) {
    targetIds = previousProfiles.map((p) => p.id);
  } else if (Array.isArray(body.ids)) {
    targetIds = Array.from(
      new Set(body.ids.map((v) => String(v || '').trim()).filter((v) => v && byId.has(v))),
    );
  } else {
    return createJsonResponse({ success: false, message: '请提供要删除的订阅组 ID 列表或 all: true' }, 400);
  }

  if (targetIds.length === 0) {
    return createJsonResponse({ success: true, data: { deletedIds: [], updatedProfiles: [] } });
  }

  const removedIdentifiers: string[] = [];
  for (const pid of targetIds) {
    const profile = byId.get(pid);
    if (profile?.id) removedIdentifiers.push(profile.id);
    if (profile?.customId) removedIdentifiers.push(profile.customId);
  }

  await repos.profiles.deleteManyByIds(targetIds);
  const { finalProfiles, updatedProfiles } = await pruneProfileReferencesAndPersist(repos, {
    profileIdentifiers: removedIdentifiers,
  });

  await invalidateNodeCachesIncremental(repos, {
    previousMisubs: allMisubs,
    finalMisubs: allMisubs,
    previousProfiles,
    finalProfiles,
    extraAffectedProfileIds: [...targetIds, ...updatedProfiles.map((p) => p.id)],
  });

  return createJsonResponse({ success: true, data: { deletedIds: targetIds, updatedProfiles } });
}

export async function handleProfilesBatchTags(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
  if (storageErr || !repos) return storageErr!;

  const { body, errorResponse: parseErr } = await parseJsonRequestBody(request, JSON_BODY_LIMITS.large);
  if (parseErr || !body) return parseErr!;

  return await tagsProfilesBatchFromBody(repos, body);
}

async function tagsProfilesBatchFromBody(repos: Repositories, body: RecordObj): Promise<Response> {
  if (!Array.isArray(body.updates)) {
    return createJsonResponse({ success: false, message: 'updates 必须为数组' }, 400);
  }
  if (body.updates.length === 0) {
    return createJsonResponse({ success: true, data: [] });
  }

  const previousProfiles = await repos.profiles.getAll({ fresh: true });
  const byId = new Map(previousProfiles.map((p) => [p.id, p]));
  const timestamp = nowIso();
  const updatedProfiles: ProfileConfig[] = [];

  for (const entry of body.updates) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue;
    const current = byId.get(entry.id.trim());
    if (!current) continue;
    const next: ProfileConfig = {
      ...current,
      tags: normalizeTagArray(entry.tags),
      downloadCount: Number(current.downloadCount) || 0,
      configVersion: Math.max(1, Number(current.configVersion) || 1) + 1,
      updatedAt: timestamp,
    };
    delete (next as RecordObj).version;
    updatedProfiles.push(next);
  }

  if (updatedProfiles.length > 0) {
    await repos.profiles.putMany(updatedProfiles);
  }

  return createJsonResponse({ success: true, data: updatedProfiles });
}

export async function handleProfilesReorder(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
  if (storageErr || !repos) return storageErr!;

  const { body, errorResponse: parseErr } = await parseJsonRequestBody(request);
  if (parseErr || !body) return parseErr!;

  return await reorderProfilesFromBody(repos, body);
}

async function reorderProfilesFromBody(repos: Repositories, body: RecordObj): Promise<Response> {
  if (!Array.isArray(body.orderedIds)) {
    return createJsonResponse({ success: false, message: 'orderedIds 必须为数组' }, 400);
  }

  const previousProfiles = await repos.profiles.getAll({ fresh: true });
  const byId = new Map(previousProfiles.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const ordered: ProfileConfig[] = [];

  for (const rawId of body.orderedIds) {
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (!id || seen.has(id)) continue;
    const found = byId.get(id);
    if (found) {
      seen.add(id);
      ordered.push(found);
    }
  }
  for (const item of previousProfiles) {
    if (!seen.has(item.id)) {
      ordered.push(item);
    }
  }

  const timestamp = nowIso();
  const changedItems: ProfileConfig[] = [];
  const reorderedItems: ProfileConfig[] = ordered.map((item, idx) => {
    const prevSort = Number(item.sortIndex);
    if (Number.isFinite(prevSort) && prevSort === idx) {
      return item;
    }
    const next: ProfileConfig = {
      ...item,
      downloadCount: Number(item.downloadCount) || 0,
      sortIndex: idx,
      configVersion: Math.max(1, Number(item.configVersion) || 1) + 1,
      updatedAt: timestamp,
    };
    delete (next as RecordObj).version;
    changedItems.push(next);
    return next;
  });

  if (changedItems.length > 0) {
    await repos.profiles.putMany(changedItems);
  }

  return createJsonResponse({ success: true, data: reorderedItems });
}

export async function handleProfilesBatchAction(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await runStorageWrite(async () => {
    const { repos, errorResponse: storageErr } = ensureStorageAvailable(env, context);
    if (storageErr || !repos) return storageErr!;

    const { body, errorResponse: parseErr } = await parseJsonRequestBody(request, JSON_BODY_LIMITS.large);
    if (parseErr || !body) return parseErr!;

    const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
    if (action === 'enable' || action === 'disable') {
      const enabled = action === 'enable';
      const rawIds = Array.isArray(body.ids) ? body.ids : [];
      const targetIdSet = new Set(rawIds.map((v) => String(v || '').trim()).filter(Boolean));
      if (body.all !== true && targetIdSet.size === 0) {
        return createJsonResponse({ success: true, data: [] });
      }
      const [allMisubs, previousProfiles] = await Promise.all([
        repos.subscriptions.getAll({ fresh: true }),
        repos.profiles.getAll({ fresh: true }),
      ]);
      const timestamp = nowIso();
      const updatedProfiles: ProfileConfig[] = [];
      for (const profile of previousProfiles) {
        if (body.all !== true && !targetIdSet.has(profile.id)) continue;
        if (Boolean(profile.enabled) === enabled) continue;
        const next: ProfileConfig = {
          ...profile,
          enabled,
          downloadCount: Number(profile.downloadCount) || 0,
          configVersion: Math.max(1, Number(profile.configVersion) || 1) + 1,
          updatedAt: timestamp,
        };
        delete (next as RecordObj).version;
        updatedProfiles.push(next);
      }
      if (updatedProfiles.length > 0) {
        await repos.profiles.putMany(updatedProfiles);
        const updatedMap = new Map(updatedProfiles.map((p) => [p.id, p]));
        const finalProfiles = previousProfiles.map((p) => updatedMap.get(p.id) || p);
        await invalidateNodeCachesIncremental(repos, {
          previousMisubs: allMisubs,
          finalMisubs: allMisubs,
          previousProfiles,
          finalProfiles,
          extraAffectedProfileIds: updatedProfiles.map((p) => p.id),
        });
      }
      return createJsonResponse({ success: true, data: updatedProfiles });
    }
    if (action === 'delete') {
      return await deleteProfilesBatchFromBody(repos, body);
    }
    if (action === 'tags') {
      return await tagsProfilesBatchFromBody(repos, body);
    }
    if (action === 'reorder') {
      return await reorderProfilesFromBody(repos, body);
    }

    return createJsonResponse({ success: false, message: '不支持的批量操作' }, 400);
  });
}
