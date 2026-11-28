/**
 * 细粒度资源 CRUD 处理器（Subscriptions / Manual Nodes / Profiles）
 * - 单条与批量配置即时落库
 * - 行级乐观锁（config_version CAS + 409 VERSION_CONFLICT）
 * - 配置字段与运行态/统计字段严格解耦
 * - 级联清理订阅组引用 & 增量精准清除节点缓存
 */

import type { MisubItem, ProfileConfig, ProfileSubscriptionRef, SubscriptionItem } from '@misub/core/types.js';
import {
  isValidHttpUrlString,
  isValidManualNodeUrl,
  isValidRemoteSubscriptionUrl,
} from '@misub/core/utils/url-validators.js';
import { generateNodeId, generateProfileId, generateSubscriptionId } from '@misub/core/utils/id.js';
import {
  ensureProfileLinkId,
  normalizeProfileIdentifier,
  rotateProfileLinkId,
} from '@misub/core/domain/profile-link.js';
import { getProfileSubscriptionId } from '@misub/core/domain/profile-subscription-ref.js';
import {
  MAX_MULTI_SOCKS_START_PORT,
  MAX_MULTI_SOCKS_TCP_PORT,
  MIN_MULTI_SOCKS_PORT,
  normalizeOptionalListenOverride,
  normalizeProfilePortalMode,
  parseOptionalInteger,
} from '@misub/core/domain/multi-socks.js';
import { validateSingleProfileAlias } from '@misub/core/domain/profile-alias.js';
import { normalizeCustomVisualRules } from '@misub/core/domain/visual-rules-catalog.js';
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
  'transformMode',
  'smartPreset',
  'customVisualRules',
  'templateConfig',
  'externalBackend',
  'enableUdp',
  'skipCertVerify',
  'enableRelay',
  'target',
  'prefixSettings',
  'operators',
  'nodeTransform',
  'nodeTransformPresetId',
  'expiresAt',
  'fetchMinInterval',
  'fetchLimitMode',
  'portalMode',
  'portalRedirectUrl',
  'portalNotice',
  'multiSocksEnabled',
  'multiSocksLite',
  'multiSocksStartPort',
  'multiSocksListen',
  'multiSocksUsername',
  'multiSocksPassword',
  'multiSocksMaxPorts',
  'sortIndex',
] as const;

const VALID_PROFILE_TRANSFORM_MODES = new Set(['smart', 'template', 'external']);
const VALID_PROFILE_SMART_PRESETS = new Set(['minimal', 'balanced', 'full']);

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
  return isRecord(error) && typeof error.status === 'number' ? error.status : undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

function bumpConfigVersion(current: unknown): number {
  return Math.max(1, Number(current) || 1) + 1;
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

function preserveRuntimeFields(target: RecordObj, current: RecordObj, runtimeFields: readonly string[]): RecordObj {
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

function ensureStorageAvailable(
  env: EnvLike,
  context: BoundRequestContext | null,
): {
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

async function withWriteContext(
  env: EnvLike,
  context: BoundRequestContext | null,
  operation: (repos: Repositories) => Promise<Response>,
): Promise<Response> {
  try {
    const { repos, errorResponse } = ensureStorageAvailable(env, context);
    if (errorResponse || !repos) return errorResponse!;
    return await operation(repos);
  } catch (error) {
    console.error('[Resource CRUD] Storage write failed:', error);
    return createJsonResponse(
      {
        success: false,
        message: `数据保存失败: ${getErrorMessage(error) || '存储服务暂时不可用，请稍后重试'}`,
      },
      500,
    );
  }
}

async function withJsonWriteContext(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null,
  maxBytes: number,
  operation: (repos: Repositories, body: RecordObj) => Promise<Response>,
): Promise<Response> {
  return await withWriteContext(env, context, async (repos) => {
    const { body, errorResponse } = await parseJsonRequestBody(request, maxBytes);
    if (errorResponse || !body) return errorResponse!;
    return await operation(repos, body);
  });
}

interface CasRepository<T> {
  compareAndSwap: (
    item: T,
    expectedConfigVersion: number,
    options?: { skipOtherTableDelete?: boolean },
  ) => Promise<{ updated: boolean; current: T | null }>;
  save: (item: T, options?: { skipOtherTableDelete?: boolean }) => Promise<T | null>;
}

async function persistWithCas<T>(
  repo: CasRepository<T>,
  nextItem: T,
  expected: { present: boolean; value: number },
  force: boolean,
  notFoundMessage: string,
  saveOptions?: { skipOtherTableDelete?: boolean },
): Promise<{ saved?: T; errorResponse?: Response }> {
  if (expected.present && !force) {
    const cas = saveOptions
      ? await repo.compareAndSwap(nextItem, expected.value, saveOptions)
      : await repo.compareAndSwap(nextItem, expected.value);
    if (!cas.updated) {
      return {
        errorResponse: cas.current
          ? buildVersionConflictResponse(cas.current)
          : createJsonResponse({ success: false, message: notFoundMessage }, 404),
      };
    }
    return { saved: cas.current || nextItem };
  }
  const saved = saveOptions ? await repo.save(nextItem, saveOptions) : await repo.save(nextItem);
  return { saved: saved || nextItem };
}

function resolveBatchDeleteIds(
  body: RecordObj,
  existingIds: Set<string>,
  missingMessage: string,
): { targetIds?: string[]; errorResponse?: Response } {
  if (body.all === true) {
    return { targetIds: Array.from(existingIds) };
  }
  if (Array.isArray(body.ids)) {
    return {
      targetIds: Array.from(
        new Set(body.ids.map((v) => String(v || '').trim()).filter((v) => v && existingIds.has(v))),
      ),
    };
  }
  return { errorResponse: createJsonResponse({ success: false, message: missingMessage }, 400) };
}

function buildToggledItems<T extends { id: string; enabled?: boolean; configVersion?: number }>(
  items: T[],
  {
    enabled,
    all,
    targetIdSet,
    timestamp,
    normalizeExtra,
  }: {
    enabled: boolean;
    all: boolean;
    targetIdSet: Set<string>;
    timestamp: string;
    normalizeExtra?: (item: T) => Partial<T>;
  },
): T[] {
  const updated: T[] = [];
  for (const item of items) {
    if (!all && !targetIdSet.has(item.id)) continue;
    if (Boolean(item.enabled) === enabled) continue;
    const next: RecordObj = {
      ...(item as RecordObj),
      ...(normalizeExtra ? (normalizeExtra(item) as RecordObj) : {}),
      enabled,
      configVersion: bumpConfigVersion(item.configVersion),
      updatedAt: timestamp,
    };
    delete next.version;
    updated.push(next as T);
  }
  return updated;
}

function buildTagUpdatedItems<T extends { id: string; configVersion?: number }>(
  byId: Map<string, T>,
  updates: unknown[],
  timestamp: string,
  normalizeExtra?: (item: T) => Partial<T>,
): T[] {
  const updated: T[] = [];
  for (const entry of updates) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue;
    const current = byId.get(entry.id.trim());
    if (!current) continue;
    const next: RecordObj = {
      ...(current as RecordObj),
      ...(normalizeExtra ? (normalizeExtra(current) as RecordObj) : {}),
      tags: normalizeTagArray(entry.tags),
      configVersion: bumpConfigVersion(current.configVersion),
      updatedAt: timestamp,
    };
    delete next.version;
    updated.push(next as T);
  }
  return updated;
}

function buildReorderedItems<T extends { id: string; sortIndex?: number; configVersion?: number }>(
  items: T[],
  orderedIds: unknown[],
  timestamp: string,
  normalizeExtra?: (item: T) => Partial<T>,
): { reorderedItems: T[]; changedItems: T[] } {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const ordered: T[] = [];

  for (const rawId of orderedIds) {
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (!id || seen.has(id)) continue;
    const found = byId.get(id);
    if (found) {
      seen.add(id);
      ordered.push(found);
    }
  }
  for (const item of items) {
    if (!seen.has(item.id)) {
      ordered.push(item);
    }
  }

  const changedItems: T[] = [];
  const reorderedItems = ordered.map((item, idx) => {
    const prevSort = Number(item.sortIndex);
    if (Number.isFinite(prevSort) && prevSort === idx) {
      return item;
    }
    const next: RecordObj = {
      ...(item as RecordObj),
      ...(normalizeExtra ? (normalizeExtra(item) as RecordObj) : {}),
      sortIndex: idx,
      configVersion: bumpConfigVersion(item.configVersion),
      updatedAt: timestamp,
    };
    delete next.version;
    const typed = next as T;
    changedItems.push(typed);
    return typed;
  });

  return { reorderedItems, changedItems };
}

async function loadNotificationSettings(repos: Repositories): Promise<NotificationSettings> {
  try {
    const loaded = await repos.settings.getMain();
    return isRecord(loaded) && Object.keys(loaded).length > 0 ? (loaded as NotificationSettings) : defaultSettings;
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

    const cacheOptions: { preserveKeys: string[]; preserveProfileKeys?: string[]; skipTokenCaches?: boolean } = {
      preserveKeys,
    };
    if (preserveProfileKeys.length > 0) cacheOptions.preserveProfileKeys = preserveProfileKeys;
    if (changedSubIds.size === 0) cacheOptions.skipTokenCaches = true;

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
        configVersion: bumpConfigVersion(profile.configVersion),
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

// ==================== Subscriptions & Nodes Descriptor ====================

interface MisubWriteRepo {
  getById: (id: string, options?: { fresh?: boolean }) => Promise<MisubItem | null>;
  save: (item: MisubItem, options?: { skipOtherTableDelete?: boolean }) => Promise<MisubItem | null>;
  putMany: (items: MisubItem[]) => Promise<boolean>;
  deleteById: (id: string) => Promise<boolean>;
  deleteManyByIds: (ids: string[]) => Promise<number>;
  compareAndSwap: (
    item: MisubItem,
    expectedConfigVersion: number,
    options?: { skipOtherTableDelete?: boolean },
  ) => Promise<{ updated: boolean; current: MisubItem | null }>;
}

interface MisubResourceDescriptor {
  kind: 'subscription' | 'node';
  missingIdMessage: string;
  notFoundMessage: string;
  invalidUrlMessage: string;
  invalidParamMessage: string;
  invalidBatchItemMessage: string;
  deleteIdsMissingMessage: string;
  editableFields: readonly string[];
  runtimeFields: readonly string[];
  matchesRecord: (item: MisubItem) => boolean;
  validateUrl: (url: string) => boolean;
  generateId: () => string;
  getRepo: (repos: Repositories) => MisubWriteRepo;
  prepareCreatedExtras?: (rawBody: RecordObj) => RecordObj;
  preparePatchExtras?: (patch: RecordObj) => void;
  clearRuntimeOnUrlChange: (nextObj: RecordObj) => void;
  notify?: (items: MisubItem[], repos: Repositories, env: EnvLike, context: BoundRequestContext | null) => void;
  pruneKey: 'subscriptionIds' | 'manualNodeIds';
}

const SUBSCRIPTION_DESCRIPTOR: MisubResourceDescriptor = {
  kind: 'subscription',
  missingIdMessage: '缺少订阅 ID',
  notFoundMessage: '订阅源不存在',
  invalidUrlMessage: '请输入有效的 http:// 或 https:// 订阅链接',
  invalidParamMessage: '订阅参数无效',
  invalidBatchItemMessage: '批量导入条目格式无效',
  deleteIdsMissingMessage: '请提供要删除的订阅 ID 列表或 all: true',
  editableFields: SUBSCRIPTION_EDITABLE_FIELDS,
  runtimeFields: SUBSCRIPTION_RUNTIME_FIELDS,
  matchesRecord: (item) => !isManualNodeRecord(item),
  validateUrl: isValidRemoteSubscriptionUrl,
  generateId: generateSubscriptionId,
  getRepo: (repos) => repos.subscriptions as unknown as MisubWriteRepo,
  prepareCreatedExtras: (rawBody) => ({ autoUpdate: rawBody.autoUpdate !== false }),
  preparePatchExtras: (patch) => {
    if (Object.prototype.hasOwnProperty.call(patch, 'autoUpdate')) {
      patch.autoUpdate = patch.autoUpdate !== false;
    }
  },
  clearRuntimeOnUrlChange: (nextObj) => {
    nextObj.nodeCount = 0;
    nextObj.userInfo = null;
    nextObj.lastError = null;
    nextObj.lastUpdate = null;
    delete nextObj.lastGoodNodeCount;
    delete nextObj.detectedName;
  },
  notify: (items, repos, env, context) => triggerSubscriptionNotifications(items, repos, env, context),
  pruneKey: 'subscriptionIds',
};

const NODE_DESCRIPTOR: MisubResourceDescriptor = {
  kind: 'node',
  missingIdMessage: '缺少节点 ID',
  notFoundMessage: '手动节点不存在',
  invalidUrlMessage: '请输入有效的代理节点链接',
  invalidParamMessage: '节点参数无效',
  invalidBatchItemMessage: '批量导入节点格式无效',
  deleteIdsMissingMessage: '请提供要删除的节点 ID 列表或 all: true',
  editableFields: NODE_EDITABLE_FIELDS,
  runtimeFields: NODE_RUNTIME_FIELDS,
  matchesRecord: (item) => isManualNodeRecord(item),
  validateUrl: isValidManualNodeUrl,
  generateId: generateNodeId,
  getRepo: (repos) => repos.nodes as unknown as MisubWriteRepo,
  clearRuntimeOnUrlChange: (nextObj) => {
    for (const field of NODE_RUNTIME_FIELDS) {
      delete nextObj[field];
    }
  },
  pruneKey: 'manualNodeIds',
};

function buildCreatedMisubItem(
  desc: MisubResourceDescriptor,
  rawBody: RecordObj,
  sortIndex: number,
  timestamp: string,
): { item?: MisubItem; error?: string } {
  const url = String(rawBody.url || '').trim();
  if (!url || !desc.validateUrl(url)) {
    return { error: desc.invalidUrlMessage };
  }
  const id = typeof rawBody.id === 'string' && rawBody.id.trim() ? rawBody.id.trim() : desc.generateId();
  const picked = pickAllowedFields(rawBody, desc.editableFields);
  const { isUpdating: _omitUpdating, ...cleaned } = picked;
  const item: RecordObj = {
    ...cleaned,
    ...(desc.prepareCreatedExtras ? desc.prepareCreatedExtras(rawBody) : {}),
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
  delete item.version;
  for (const field of desc.runtimeFields) {
    delete item[field];
  }
  return { item: item as unknown as MisubItem };
}

async function createMisubSingle(
  desc: MisubResourceDescriptor,
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null,
): Promise<Response> {
  return await withJsonWriteContext(request, env, context, JSON_BODY_LIMITS.normal, async (repos, body) => {
    const [existingAll, existingProfiles] = await Promise.all([
      repos.subscriptions.getAll({ fresh: true }),
      repos.profiles.getAll({ fresh: true }),
    ]);
    const peers = existingAll.filter((item) => desc.matchesRecord(item));
    const minSort = peers.reduce((min, item) => Math.min(min, Number(item.sortIndex) || 0), 0);
    const nextSortIndex = peers.length > 0 ? minSort - 1 : 0;

    const { item, error } = buildCreatedMisubItem(desc, body, nextSortIndex, nowIso());
    if (error || !item) {
      return createJsonResponse({ success: false, message: error || desc.invalidParamMessage }, 400);
    }

    const saved = (await desc.getRepo(repos).save(item, { skipOtherTableDelete: true })) || item;
    const nextAll = [saved, ...existingAll.filter((entry) => entry.id !== saved.id)];

    if (desc.notify && shouldCheckSubscriptionNotification(saved, undefined)) {
      desc.notify([saved], repos, env, context);
    }
    await invalidateNodeCachesIncremental(repos, {
      previousMisubs: existingAll,
      finalMisubs: nextAll,
      previousProfiles: existingProfiles,
      finalProfiles: existingProfiles,
    });

    return createJsonResponse({ success: true, data: saved }, 201);
  });
}

async function createMisubBatchFromBody(
  desc: MisubResourceDescriptor,
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
  const peers = existingAll.filter((item) => desc.matchesRecord(item));
  const minSort = peers.reduce((min, item) => Math.min(min, Number(item.sortIndex) || 0), 0);
  const baseSort = peers.length > 0 ? minSort - rawItems.length : 0;
  const timestamp = nowIso();

  const createdItems: MisubItem[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const rawEntry = rawItems[i];
    if (!isRecord(rawEntry)) {
      return createJsonResponse({ success: false, message: desc.invalidBatchItemMessage }, 400);
    }
    const { item, error } = buildCreatedMisubItem(desc, rawEntry, baseSort + i, timestamp);
    if (error || !item) {
      return createJsonResponse({ success: false, message: error || desc.invalidParamMessage }, 400);
    }
    createdItems.push(item);
  }

  await desc.getRepo(repos).putMany(createdItems);
  const createdIds = new Set(createdItems.map((item) => item.id));
  const nextAll = [...createdItems, ...existingAll.filter((entry) => !createdIds.has(entry.id))];

  if (desc.notify) {
    desc.notify(
      createdItems.filter((item) => shouldCheckSubscriptionNotification(item, undefined)),
      repos,
      env,
      context,
    );
  }
  await invalidateNodeCachesIncremental(repos, {
    previousMisubs: existingAll,
    finalMisubs: nextAll,
    previousProfiles: existingProfiles,
    finalProfiles: existingProfiles,
  });

  return createJsonResponse({ success: true, data: createdItems }, 201);
}

async function patchMisubSingle(
  desc: MisubResourceDescriptor,
  request: Request,
  env: EnvLike,
  id: string,
  context: BoundRequestContext | null,
): Promise<Response> {
  return await withJsonWriteContext(request, env, context, JSON_BODY_LIMITS.normal, async (repos, body) => {
    const targetId = String(id || '').trim();
    if (!targetId) {
      return createJsonResponse({ success: false, message: desc.missingIdMessage }, 400);
    }

    const expected = getExpectedConfigVersionFromBody(body);
    if (!expected.valid) {
      return createJsonResponse({ success: false, message: 'configVersion 格式无效' }, 400);
    }
    const force = Boolean(body.force);

    const repo = desc.getRepo(repos);
    const current = await repo.getById(targetId, { fresh: true });
    if (!current || !desc.matchesRecord(current)) {
      return createJsonResponse({ success: false, message: desc.notFoundMessage }, 404);
    }

    const patch = pickAllowedFields(body, desc.editableFields);
    if (Object.prototype.hasOwnProperty.call(patch, 'url')) {
      const nextUrl = String(patch.url || '').trim();
      if (!nextUrl || !desc.validateUrl(nextUrl)) {
        return createJsonResponse({ success: false, message: desc.invalidUrlMessage }, 400);
      }
      patch.url = nextUrl;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'tags')) patch.tags = normalizeTagArray(patch.tags);
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) patch.name = String(patch.name ?? '').trim();
    if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) patch.enabled = patch.enabled !== false;
    desc.preparePatchExtras?.(patch);

    const urlChanged = Object.prototype.hasOwnProperty.call(patch, 'url') && patch.url !== current.url;
    let nextObj: RecordObj = {
      ...(current as RecordObj),
      ...patch,
      id: current.id,
      configVersion: bumpConfigVersion(current.configVersion),
      updatedAt: nowIso(),
    };
    delete nextObj.isUpdating;
    delete nextObj.version;

    if (urlChanged) {
      desc.clearRuntimeOnUrlChange(nextObj);
    } else {
      nextObj = preserveRuntimeFields(nextObj, current as RecordObj, desc.runtimeFields);
    }

    const casResult = await persistWithCas(
      repo,
      nextObj as unknown as MisubItem,
      expected,
      force,
      desc.notFoundMessage,
      { skipOtherTableDelete: true },
    );
    if (casResult.errorResponse) return casResult.errorResponse;
    const saved = casResult.saved!;

    const [existingAll, existingProfiles] = await Promise.all([
      repos.subscriptions.getAll({ fresh: true }),
      repos.profiles.getAll({ fresh: true }),
    ]);
    const previousMisubs = existingAll.map((entry) => (entry.id === current.id ? current : entry));

    if (desc.notify && shouldCheckSubscriptionNotification(saved, current)) {
      desc.notify([saved], repos, env, context);
    }
    await invalidateNodeCachesIncremental(repos, {
      previousMisubs,
      finalMisubs: existingAll,
      previousProfiles: existingProfiles,
      finalProfiles: existingProfiles,
      skipCachePreserveSubIds: urlChanged && desc.kind === 'subscription' ? [saved.id] : [],
    });

    return createJsonResponse({ success: true, data: saved });
  });
}

async function deleteMisubSingle(
  desc: MisubResourceDescriptor,
  env: EnvLike,
  id: string,
  context: BoundRequestContext | null,
): Promise<Response> {
  return await withWriteContext(env, context, async (repos) => {
    const targetId = String(id || '').trim();
    if (!targetId) {
      return createJsonResponse({ success: false, message: desc.missingIdMessage }, 400);
    }

    const repo = desc.getRepo(repos);
    const current = await repo.getById(targetId, { fresh: true });
    if (!current || !desc.matchesRecord(current)) {
      return createJsonResponse({ success: false, message: desc.notFoundMessage }, 404);
    }

    const previousMisubs = await repos.subscriptions.getAll({ fresh: true });
    await repo.deleteById(targetId);
    const { previousProfiles, finalProfiles, updatedProfiles } = await pruneProfileReferencesAndPersist(repos, {
      [desc.pruneKey]: [targetId],
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

async function deleteMisubBatchFromBody(
  desc: MisubResourceDescriptor,
  repos: Repositories,
  body: RecordObj,
): Promise<Response> {
  const previousMisubs = await repos.subscriptions.getAll({ fresh: true });
  const existingPeerIds = new Set(previousMisubs.filter((item) => desc.matchesRecord(item)).map((item) => item.id));
  const resolved = resolveBatchDeleteIds(body, existingPeerIds, desc.deleteIdsMissingMessage);
  if (resolved.errorResponse) return resolved.errorResponse;

  const targetIds = resolved.targetIds!;
  if (targetIds.length === 0) {
    return createJsonResponse({ success: true, data: { deletedIds: [], updatedProfiles: [] } });
  }

  await desc.getRepo(repos).deleteManyByIds(targetIds);
  const deleteSet = new Set(targetIds);
  const { previousProfiles, finalProfiles, updatedProfiles } = await pruneProfileReferencesAndPersist(repos, {
    [desc.pruneKey]: targetIds,
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

async function tagsMisubBatchFromBody(
  desc: MisubResourceDescriptor,
  repos: Repositories,
  body: RecordObj,
): Promise<Response> {
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
  const byId = new Map(previousMisubs.filter((item) => desc.matchesRecord(item)).map((item) => [item.id, item]));
  const updatedItems = buildTagUpdatedItems(byId, body.updates, nowIso());

  if (updatedItems.length > 0) {
    await desc.getRepo(repos).putMany(updatedItems);
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

async function reorderMisubFromBody(
  desc: MisubResourceDescriptor,
  repos: Repositories,
  body: RecordObj,
): Promise<Response> {
  if (!Array.isArray(body.orderedIds)) {
    return createJsonResponse({ success: false, message: 'orderedIds 必须为数组' }, 400);
  }

  const [previousMisubs, existingProfiles] = await Promise.all([
    repos.subscriptions.getAll({ fresh: true }),
    repos.profiles.getAll({ fresh: true }),
  ]);
  const peers = previousMisubs.filter((item) => desc.matchesRecord(item));
  const { reorderedItems, changedItems } = buildReorderedItems(peers, body.orderedIds, nowIso());

  if (changedItems.length > 0) {
    await desc.getRepo(repos).putMany(changedItems);
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

async function toggleMisubBatchFromBody(
  desc: MisubResourceDescriptor,
  repos: Repositories,
  body: RecordObj,
): Promise<Response> {
  const enabled = body.action === 'enable';
  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const targetIdSet = new Set(rawIds.map((v) => String(v || '').trim()).filter(Boolean));
  if (body.all !== true && targetIdSet.size === 0) {
    return createJsonResponse({ success: true, data: [] });
  }

  const [previousMisubs, existingProfiles] = await Promise.all([
    repos.subscriptions.getAll({ fresh: true }),
    repos.profiles.getAll({ fresh: true }),
  ]);
  const peers = previousMisubs.filter((item) => desc.matchesRecord(item));
  const updatedItems = buildToggledItems(peers, { enabled, all: body.all === true, targetIdSet, timestamp: nowIso() });

  if (updatedItems.length > 0) {
    await desc.getRepo(repos).putMany(updatedItems);
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

async function dispatchMisubBatch(
  desc: MisubResourceDescriptor,
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null,
): Promise<Response> {
  return await withJsonWriteContext(request, env, context, JSON_BODY_LIMITS.large, async (repos, body) => {
    if (Array.isArray(body.items)) {
      return await createMisubBatchFromBody(desc, repos, env, context, body);
    }
    const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
    if (action === 'enable' || action === 'disable') {
      return await toggleMisubBatchFromBody(desc, repos, { ...body, action });
    }
    if (action === 'delete') return await deleteMisubBatchFromBody(desc, repos, body);
    if (action === 'tags') return await tagsMisubBatchFromBody(desc, repos, body);
    if (action === 'reorder') return await reorderMisubFromBody(desc, repos, body);
    return createJsonResponse({ success: false, message: '不支持的批量操作或缺少 items 参数' }, 400);
  });
}

// ==================== Subscriptions Handlers ====================

export const handleSubscriptionCreate = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  createMisubSingle(SUBSCRIPTION_DESCRIPTOR, req, env, ctx);

export const handleSubscriptionsBatchCreate = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  dispatchMisubBatch(SUBSCRIPTION_DESCRIPTOR, req, env, ctx);

export const handleSubscriptionsBatch = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  dispatchMisubBatch(SUBSCRIPTION_DESCRIPTOR, req, env, ctx);

export const handleSubscriptionPatch = (
  req: Request,
  env: EnvLike,
  id: string,
  ctx: BoundRequestContext | null = null,
) => patchMisubSingle(SUBSCRIPTION_DESCRIPTOR, req, env, id, ctx);

export const handleSubscriptionDelete = (env: EnvLike, id: string, ctx: BoundRequestContext | null = null) =>
  deleteMisubSingle(SUBSCRIPTION_DESCRIPTOR, env, id, ctx);

export const handleSubscriptionsBatchDelete = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  withJsonWriteContext(req, env, ctx, JSON_BODY_LIMITS.normal, (repos, body) =>
    deleteMisubBatchFromBody(SUBSCRIPTION_DESCRIPTOR, repos, body),
  );

export const handleSubscriptionsBatchTags = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  withJsonWriteContext(req, env, ctx, JSON_BODY_LIMITS.large, (repos, body) =>
    tagsMisubBatchFromBody(SUBSCRIPTION_DESCRIPTOR, repos, body),
  );

export const handleSubscriptionsReorder = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  withJsonWriteContext(req, env, ctx, JSON_BODY_LIMITS.normal, (repos, body) =>
    reorderMisubFromBody(SUBSCRIPTION_DESCRIPTOR, repos, body),
  );

// ==================== Manual Nodes Handlers ====================

export const handleNodeCreate = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  createMisubSingle(NODE_DESCRIPTOR, req, env, ctx);

export const handleNodesBatchCreate = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  dispatchMisubBatch(NODE_DESCRIPTOR, req, env, ctx);

export const handleNodesBatch = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  dispatchMisubBatch(NODE_DESCRIPTOR, req, env, ctx);

export const handleNodePatch = (req: Request, env: EnvLike, id: string, ctx: BoundRequestContext | null = null) =>
  patchMisubSingle(NODE_DESCRIPTOR, req, env, id, ctx);

export const handleNodeDelete = (env: EnvLike, id: string, ctx: BoundRequestContext | null = null) =>
  deleteMisubSingle(NODE_DESCRIPTOR, env, id, ctx);

export const handleNodesBatchDelete = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  withJsonWriteContext(req, env, ctx, JSON_BODY_LIMITS.normal, (repos, body) =>
    deleteMisubBatchFromBody(NODE_DESCRIPTOR, repos, body),
  );

export const handleNodesBatchTags = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  withJsonWriteContext(req, env, ctx, JSON_BODY_LIMITS.large, (repos, body) =>
    tagsMisubBatchFromBody(NODE_DESCRIPTOR, repos, body),
  );

export const handleNodesReorder = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  withJsonWriteContext(req, env, ctx, JSON_BODY_LIMITS.normal, (repos, body) =>
    reorderMisubFromBody(NODE_DESCRIPTOR, repos, body),
  );

// ==================== Profiles Handlers ====================

function validateAndNormalizeProfilePortalSocksPatch(target: RecordObj): string | null {
  if (Object.prototype.hasOwnProperty.call(target, 'portalMode')) {
    const rawMode = target.portalMode;
    if (rawMode === '' || rawMode === null) {
      target.portalMode = 'inherit';
    } else if (rawMode !== 'inherit' && normalizeProfilePortalMode(rawMode) !== rawMode) {
      return '浏览器门户打开行为参数无效';
    }
  }

  if (Object.prototype.hasOwnProperty.call(target, 'portalRedirectUrl')) {
    const trimmedUrl = String(target.portalRedirectUrl ?? '').trim();
    if (trimmedUrl && !isValidHttpUrlString(trimmedUrl)) {
      return '门户跳转链接必须是有效的 http:// 或 https:// 地址';
    }
    target.portalRedirectUrl = trimmedUrl;
  }

  if (Object.prototype.hasOwnProperty.call(target, 'portalNotice')) {
    target.portalNotice = String(target.portalNotice ?? '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(target, 'multiSocksEnabled')) {
    const rawEnabled = target.multiSocksEnabled;
    if (rawEnabled === '' || rawEnabled === null) {
      target.multiSocksEnabled = null;
    } else if (typeof rawEnabled !== 'boolean') {
      return '多端口 SOCKS5 开关参数无效';
    }
  }

  if (Object.prototype.hasOwnProperty.call(target, 'multiSocksLite')) {
    const rawLite = target.multiSocksLite;
    if (rawLite === '' || rawLite === null) {
      target.multiSocksLite = null;
    } else if (typeof rawLite !== 'boolean') {
      return '多端口 SOCKS5 轻量模式参数无效';
    }
  }

  if (Object.prototype.hasOwnProperty.call(target, 'multiSocksStartPort')) {
    const rawPort = target.multiSocksStartPort;
    if (rawPort === '' || rawPort === null) {
      target.multiSocksStartPort = null;
    } else {
      const parsedPort = parseOptionalInteger(rawPort);
      if (parsedPort === null || parsedPort < MIN_MULTI_SOCKS_PORT || parsedPort > MAX_MULTI_SOCKS_START_PORT) {
        return `起始端口必须为 ${MIN_MULTI_SOCKS_PORT} 到 ${MAX_MULTI_SOCKS_START_PORT} 之间的整数`;
      }
      target.multiSocksStartPort = parsedPort;
    }
  }

  if (Object.prototype.hasOwnProperty.call(target, 'multiSocksListen')) {
    const rawListen = target.multiSocksListen;
    if (rawListen === '' || rawListen === null) {
      target.multiSocksListen = '';
    } else {
      const normalizedListen = normalizeOptionalListenOverride(rawListen);
      if (!normalizedListen) {
        return '监听地址仅支持 127.0.0.1 或 0.0.0.0';
      }
      target.multiSocksListen = normalizedListen;
    }
  }

  if (Object.prototype.hasOwnProperty.call(target, 'multiSocksUsername')) {
    target.multiSocksUsername = String(target.multiSocksUsername ?? '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(target, 'multiSocksPassword')) {
    target.multiSocksPassword = String(target.multiSocksPassword ?? '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(target, 'multiSocksMaxPorts')) {
    const rawMaxPorts = target.multiSocksMaxPorts;
    if (rawMaxPorts === '' || rawMaxPorts === null) {
      target.multiSocksMaxPorts = null;
    } else {
      const parsedMaxPorts = parseOptionalInteger(rawMaxPorts);
      if (parsedMaxPorts === null || parsedMaxPorts < 1 || parsedMaxPorts > MAX_MULTI_SOCKS_TCP_PORT) {
        return `最大端口数必须为 1 到 ${MAX_MULTI_SOCKS_TCP_PORT} 之间的整数`;
      }
      target.multiSocksMaxPorts = parsedMaxPorts;
    }
  }

  return null;
}

function normalizeNullableBoolFlag(raw: unknown): boolean | null {
  if (raw === true || raw === false) return raw;
  return null;
}

function applyProfileTransformFields(target: RecordObj, patch: RecordObj): string | null {
  delete target.transformConfigMode;
  delete target.transformConfig;
  delete target.ruleLevel;
  delete target.builtinTransform;
  delete target.subconverter;
  delete target.clashRuleLevel;

  if (Object.prototype.hasOwnProperty.call(patch, 'transformMode')) {
    const raw = patch.transformMode;
    if (raw === null || raw === '') {
      delete target.transformMode;
    } else {
      const normalized = String(raw).trim().toLowerCase();
      if (!VALID_PROFILE_TRANSFORM_MODES.has(normalized)) {
        return '转换模式仅支持 smart、template 或 external';
      }
      target.transformMode = normalized;
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'smartPreset')) {
    const raw = patch.smartPreset;
    if (raw === null || raw === '') {
      delete target.smartPreset;
    } else {
      const normalized = String(raw).trim().toLowerCase();
      if (!VALID_PROFILE_SMART_PRESETS.has(normalized)) {
        return '智能分流预设仅支持 minimal、balanced 或 full';
      }
      target.smartPreset = normalized;
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'enableUdp')) {
    if (patch.enableUdp === null) {
      delete target.enableUdp;
    } else if (typeof patch.enableUdp === 'boolean') {
      target.enableUdp = patch.enableUdp;
    } else {
      return 'enableUdp 覆写值必须为布尔值或 null';
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'skipCertVerify')) {
    if (patch.skipCertVerify === null) {
      delete target.skipCertVerify;
    } else if (typeof patch.skipCertVerify === 'boolean') {
      target.skipCertVerify = patch.skipCertVerify;
    } else {
      return 'skipCertVerify 覆写值必须为布尔值或 null';
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'enableRelay')) {
    if (patch.enableRelay === null) {
      delete target.enableRelay;
    } else if (typeof patch.enableRelay === 'boolean') {
      target.enableRelay = patch.enableRelay;
    } else {
      return 'enableRelay 覆写值必须为布尔值或 null';
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'templateConfig')) {
    const trimmed = String(patch.templateConfig ?? '').trim();
    if (!trimmed) {
      delete target.templateConfig;
    } else {
      target.templateConfig = trimmed;
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'customVisualRules')) {
    if (patch.customVisualRules === null) {
      delete target.customVisualRules;
    } else if (isRecord(patch.customVisualRules)) {
      const normalizedCvr = normalizeCustomVisualRules(patch.customVisualRules, { allowEmptyName: false });
      target.customVisualRules = {
        ...(Array.isArray(patch.customVisualRules.selectedRules) ? { selectedRules: normalizedCvr.selectedRules } : {}),
        customRules: normalizedCvr.customRules,
        groupByCountry: normalizedCvr.groupByCountry,
        includeAutoSelect: normalizedCvr.includeAutoSelect,
      };
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'externalBackend')) {
    if (patch.externalBackend === null) {
      delete target.externalBackend;
    } else if (isRecord(patch.externalBackend)) {
      target.externalBackend = {
        url: String(patch.externalBackend.url ?? '').trim(),
        templateUrl: String(patch.externalBackend.templateUrl ?? '').trim(),
        sort: normalizeNullableBoolFlag(patch.externalBackend.sort),
        tfo: normalizeNullableBoolFlag(patch.externalBackend.tfo),
        list: normalizeNullableBoolFlag(patch.externalBackend.list),
      };
    }
  }

  return null;
}

export async function handleProfileCreate(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await withJsonWriteContext(request, env, context, JSON_BODY_LIMITS.normal, async (repos, body) => {
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
    const portalSocksValidationError = validateAndNormalizeProfilePortalSocksPatch(picked);
    if (portalSocksValidationError) {
      return createJsonResponse({ success: false, message: portalSocksValidationError }, 400);
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
    const transformError = applyProfileTransformFields(normalized as RecordObj, picked);
    if (transformError) {
      return createJsonResponse({ success: false, message: transformError }, 400);
    }
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
  return await withJsonWriteContext(request, env, context, JSON_BODY_LIMITS.normal, async (repos, body) => {
    const targetId = String(id || '').trim();
    if (!targetId) {
      return createJsonResponse({ success: false, message: '缺少订阅组 ID' }, 400);
    }

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
    const portalSocksValidationError = validateAndNormalizeProfilePortalSocksPatch(patch);
    if (portalSocksValidationError) {
      return createJsonResponse({ success: false, message: portalSocksValidationError }, 400);
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

    const merged = normalizeProfile(
      ensureProfileLinkId({
        ...baseProfile,
        ...patch,
        id: current.id,
        ...(preservedLinkId ? { linkId: preservedLinkId } : {}),
        downloadCount: Number(current.downloadCount) || 0,
        configVersion: bumpConfigVersion(current.configVersion),
        updatedAt: nowIso(),
      }),
    ) as ProfileConfig;
    const transformError = applyProfileTransformFields(merged as RecordObj, patch);
    if (transformError) {
      return createJsonResponse({ success: false, message: transformError }, 400);
    }
    delete (merged as RecordObj).version;

    const casResult = await persistWithCas(repos.profiles, merged, expected, force, '订阅组不存在');
    if (casResult.errorResponse) return casResult.errorResponse;
    const saved = casResult.saved!;

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
  return await withWriteContext(env, context, async (repos) => {
    const targetId = String(id || '').trim();
    if (!targetId) {
      return createJsonResponse({ success: false, message: '缺少订阅组 ID' }, 400);
    }

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

async function deleteProfilesBatchFromBody(repos: Repositories, body: RecordObj): Promise<Response> {
  const [allMisubs, previousProfiles] = await Promise.all([
    repos.subscriptions.getAll({ fresh: true }),
    repos.profiles.getAll({ fresh: true }),
  ]);
  const byId = new Map(previousProfiles.map((p) => [p.id, p]));
  const resolved = resolveBatchDeleteIds(body, new Set(byId.keys()), '请提供要删除的订阅组 ID 列表或 all: true');
  if (resolved.errorResponse) return resolved.errorResponse;

  const targetIds = resolved.targetIds!;
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

async function tagsProfilesBatchFromBody(repos: Repositories, body: RecordObj): Promise<Response> {
  if (!Array.isArray(body.updates)) {
    return createJsonResponse({ success: false, message: 'updates 必须为数组' }, 400);
  }
  if (body.updates.length === 0) {
    return createJsonResponse({ success: true, data: [] });
  }

  const previousProfiles = await repos.profiles.getAll({ fresh: true });
  const byId = new Map(previousProfiles.map((p) => [p.id, p]));
  const updatedProfiles = buildTagUpdatedItems(byId, body.updates, nowIso(), (p) => ({
    downloadCount: Number(p.downloadCount) || 0,
  }));

  if (updatedProfiles.length > 0) {
    await repos.profiles.putMany(updatedProfiles);
  }

  return createJsonResponse({ success: true, data: updatedProfiles });
}

async function reorderProfilesFromBody(repos: Repositories, body: RecordObj): Promise<Response> {
  if (!Array.isArray(body.orderedIds)) {
    return createJsonResponse({ success: false, message: 'orderedIds 必须为数组' }, 400);
  }

  const previousProfiles = await repos.profiles.getAll({ fresh: true });
  const { reorderedItems, changedItems } = buildReorderedItems(previousProfiles, body.orderedIds, nowIso(), (p) => ({
    downloadCount: Number(p.downloadCount) || 0,
  }));

  if (changedItems.length > 0) {
    await repos.profiles.putMany(changedItems);
  }

  return createJsonResponse({ success: true, data: reorderedItems });
}

export const handleProfilesBatchDelete = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  withJsonWriteContext(req, env, ctx, JSON_BODY_LIMITS.normal, deleteProfilesBatchFromBody);

export const handleProfilesBatchTags = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  withJsonWriteContext(req, env, ctx, JSON_BODY_LIMITS.large, tagsProfilesBatchFromBody);

export const handleProfilesReorder = (req: Request, env: EnvLike, ctx: BoundRequestContext | null = null) =>
  withJsonWriteContext(req, env, ctx, JSON_BODY_LIMITS.normal, reorderProfilesFromBody);

export async function handleProfilesBatchAction(
  request: Request,
  env: EnvLike,
  context: BoundRequestContext | null = null,
): Promise<Response> {
  return await withJsonWriteContext(request, env, context, JSON_BODY_LIMITS.large, async (repos, body) => {
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
      const updatedProfiles = buildToggledItems(previousProfiles, {
        enabled,
        all: body.all === true,
        targetIdSet,
        timestamp: nowIso(),
        normalizeExtra: (p) => ({ downloadCount: Number(p.downloadCount) || 0 }),
      });
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
    if (action === 'delete') return await deleteProfilesBatchFromBody(repos, body);
    if (action === 'tags') return await tagsProfilesBatchFromBody(repos, body);
    if (action === 'reorder') return await reorderProfilesFromBody(repos, body);

    return createJsonResponse({ success: false, message: '不支持的批量操作' }, 400);
  });
}
