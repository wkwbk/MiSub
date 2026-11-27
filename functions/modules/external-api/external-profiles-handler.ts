import type { MisubItem, ProfileConfig, SubscriptionItem } from '@misub/core/types.js';
import { filterAutoUpdateSubscriptions } from '@misub/core/domain/auto-update.js';
import { ensureProfileLinkId, rotateProfileLinkId } from '@misub/core/domain/profile-link.js';
import { validateSingleProfileAlias } from '@misub/core/domain/profile-alias.js';
import type { Env, StorageAdapter } from '../../types.js';
import {
  buildListMeta,
  createExternalError,
  createExternalSuccess,
  generateId,
  getExternalStorageAdapter,
  normalizeStringArray,
  paginate,
  parseBooleanParam,
  parsePagination,
  readExternalJson,
  sortBySortIndex,
} from './external-api-utils.js';
import { isManualNode, isRemoteSubscription, toExternalProfile } from './external-api-mappers.js';
import { inspectRemoteSubscription } from './external-subscriptions-handler.js';
import { SubscriptionRepository } from '../../repositories/subscription-repository.js';

export interface ExternalProfileSelector {
  id?: string | null;
  relation?: string | null;
  action?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function loadProfiles(storageAdapter: StorageAdapter): Promise<ProfileConfig[]> {
  return sortBySortIndex(await storageAdapter.getAllProfiles());
}

async function getProfileById(storageAdapter: StorageAdapter, id: string): Promise<ProfileConfig | null> {
  return await storageAdapter.getProfileById(id);
}

async function validateProfileReferences(
  storageAdapter: StorageAdapter,
  subscriptionIds: string[] | undefined = undefined,
  manualNodeIds: string[] | undefined = undefined,
): Promise<Response | null> {
  const allSubscriptions = await storageAdapter.getAllSubscriptions();
  const byId = new Map<string, MisubItem>(allSubscriptions.map((item) => [item.id, item]));

  if (subscriptionIds !== undefined) {
    for (const id of subscriptionIds) {
      const item = byId.get(id);
      if (!item) return createExternalError('subscription_id_not_found', `Subscription ${id} not found`, 400);
      if (!isRemoteSubscription(item))
        return createExternalError('invalid_profile_reference', `Subscription ${id} is not a remote subscription`, 400);
    }
  }

  if (manualNodeIds !== undefined) {
    for (const id of manualNodeIds) {
      const item = byId.get(id);
      if (!item) return createExternalError('manual_node_id_not_found', `Manual node ${id} not found`, 400);
      if (!isManualNode(item))
        return createExternalError('invalid_profile_reference', `Manual node ${id} is not a manual node`, 400);
    }
  }

  return null;
}

function dedupe(values: unknown): string[] {
  return [...new Set(normalizeStringArray(values))];
}

async function refreshProfileSubscriptions(storageAdapter: StorageAdapter, env: Env, profile: ProfileConfig) {
  const allSubscriptions = await storageAdapter.getAllSubscriptions();
  const byId = new Map<string, MisubItem>(allSubscriptions.map((item) => [item.id, item]));
  const allRemoteSubscriptions = (Array.isArray(profile.subscriptions) ? profile.subscriptions : [])
    .map((ref) => (typeof ref === 'string' ? byId.get(ref) : undefined))
    .filter((item): item is SubscriptionItem => Boolean(item) && isRemoteSubscription(item));
  const remoteSubscriptions = filterAutoUpdateSubscriptions(allRemoteSubscriptions);
  const skippedSubscriptions = allRemoteSubscriptions.length - remoteSubscriptions.length;
  const manualNodes = (Array.isArray(profile.manualNodes) ? profile.manualNodes : [])
    .map((id) => byId.get(id))
    .filter((item): item is MisubItem => Boolean(item) && isManualNode(item));

  const results: Array<{
    id: string;
    name: string;
    success: boolean;
    nodeCount: number;
    userInfo: SubscriptionItem['userInfo'] | null;
    lastError: string;
    lastUpdated: string | null;
  }> = [];
  const updatedSubscriptions: SubscriptionItem[] = [];
  for (const current of remoteSubscriptions) {
    const inspection = await inspectRemoteSubscription(env, current);
    const timestamp = nowIso();
    const updated: SubscriptionItem = {
      ...current,
      nodeCount: inspection.ok ? inspection.nodeCount : 0,
      userInfo: inspection.ok ? inspection.userInfo : inspection.userInfo || null,
      lastError: inspection.ok ? '' : inspection.message,
      lastUpdate: timestamp,
      updatedAt: timestamp,
    };
    updatedSubscriptions.push(updated);
    results.push({
      id: updated.id,
      name: updated.name || '',
      success: inspection.ok,
      nodeCount: Number(updated.nodeCount) || 0,
      userInfo: updated.userInfo || null,
      lastError: updated.lastError || '',
      lastUpdated: updated.lastUpdate || null,
    });
  }

  if (updatedSubscriptions.length > 0) {
    const RepoConstructor = SubscriptionRepository as unknown as new (options: {
      env: Env;
      storage: StorageAdapter;
    }) => { putMany(items: SubscriptionItem[]): Promise<unknown> };
    const subRepo = new RepoConstructor({ env, storage: storageAdapter });
    await subRepo.putMany(updatedSubscriptions);
  }

  return {
    profile: toExternalProfile(profile),
    results,
    summary: {
      totalSubscriptions: remoteSubscriptions.length,
      refreshedSubscriptions: results.filter((item) => item.success).length,
      failedSubscriptions: results.filter((item) => !item.success).length,
      skippedSubscriptions,
      manualNodes: manualNodes.length,
      totalNodes:
        results.filter((item) => item.success).reduce((sum, item) => sum + (Number(item.nodeCount) || 0), 0) +
        manualNodes.length,
    },
  };
}

export async function handleExternalProfilesRequest(
  request: Request,
  env: Env,
  { id = null, relation = null, action = null }: ExternalProfileSelector = {},
): Promise<Response> {
  const storageAdapter = await getExternalStorageAdapter(env);
  const url = new URL(request.url);

  if (request.method === 'GET' && !id) {
    const profiles = await loadProfiles(storageAdapter);
    const enabledFilter = parseBooleanParam(url.searchParams.get('enabled'));
    const tagFilter = (url.searchParams.get('tag') || '').trim();
    const keyword = (url.searchParams.get('keyword') || '').trim().toLowerCase();
    const filtered = profiles.filter((profile) => {
      if (enabledFilter !== undefined && (profile.enabled !== false) !== enabledFilter) return false;
      if (tagFilter) {
        const tags = Array.isArray(profile.tags) ? profile.tags : [];
        if (!tags.includes(tagFilter)) return false;
      }
      if (keyword) {
        const tagsText = Array.isArray(profile.tags) ? profile.tags.join('\n') : '';
        const haystack =
          `${profile.name || ''}\n${profile.description || ''}\n${profile.customId || ''}\n${tagsText}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
    const { page, pageSize } = parsePagination(url);
    return createExternalSuccess(
      paginate(filtered.map(toExternalProfile), page, pageSize),
      200,
      buildListMeta({ page, pageSize, total: filtered.length }),
    );
  }

  if (request.method === 'GET' && id && !relation && !action) {
    const profile = await getProfileById(storageAdapter, id);
    if (!profile) return createExternalError('profile_not_found', 'Profile not found', 404);
    return createExternalSuccess(toExternalProfile(profile));
  }

  if (request.method === 'POST' && id && action === 'refresh') {
    const profile = await getProfileById(storageAdapter, id);
    if (!profile) return createExternalError('profile_not_found', 'Profile not found', 404);
    return createExternalSuccess(await refreshProfileSubscriptions(storageAdapter, env, profile));
  }

  if (request.method === 'POST' && !id) {
    const payload = await readExternalJson(request);
    if (!String(payload?.name || '').trim())
      return createExternalError('profile_name_required', 'Profile name is required', 400);
    const subscriptionIds = payload.subscriptionIds !== undefined ? dedupe(payload.subscriptionIds) : [];
    const manualNodeIds = payload.manualNodeIds !== undefined ? dedupe(payload.manualNodeIds) : [];
    const validationError = await validateProfileReferences(storageAdapter, subscriptionIds, manualNodeIds);
    if (validationError) return validationError;
    const timestamp = nowIso();
    const allProfiles = await storageAdapter.getAllProfiles();
    const customId = String(payload.customId || '').trim();
    const aliasCheck = validateSingleProfileAlias(customId, { profiles: allProfiles });
    if (!aliasCheck.valid) {
      return createExternalError('invalid_custom_id', aliasCheck.message || 'Invalid customId', 400);
    }
    const profile = ensureProfileLinkId({
      id: generateId(),
      name: String(payload.name).trim(),
      description: String(payload.description || '').trim(),
      tags: normalizeStringArray(payload.tags),
      enabled: payload.enabled !== false,
      isPublic: payload.isPublic === true,
      customId,
      subscriptions: subscriptionIds,
      manualNodes: manualNodeIds,
      target: String(payload.target || 'clash').trim() || 'clash',
      sortIndex: Number.isFinite(Number(payload.sortIndex))
        ? Number(payload.sortIndex)
        : allProfiles.reduce((max, item) => Math.max(max, Number(item?.sortIndex) || 0), 0) + 1,
      configVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }) as ProfileConfig;
    await storageAdapter.putProfile(profile);
    return createExternalSuccess(toExternalProfile(profile), 201);
  }

  if (request.method === 'PATCH' && id && !relation) {
    const current = await getProfileById(storageAdapter, id);
    if (!current) return createExternalError('profile_not_found', 'Profile not found', 404);
    const payload = await readExternalJson(request);
    const subscriptionIds = payload.subscriptionIds !== undefined ? dedupe(payload.subscriptionIds) : undefined;
    const manualNodeIds = payload.manualNodeIds !== undefined ? dedupe(payload.manualNodeIds) : undefined;
    const validationError = await validateProfileReferences(storageAdapter, subscriptionIds, manualNodeIds);
    if (validationError) return validationError;

    const allProfiles = await storageAdapter.getAllProfiles();
    const shouldRotate = payload.rotateLinkId === true;
    const nextCustomId = shouldRotate
      ? ''
      : payload.customId !== undefined
        ? String(payload.customId || '').trim()
        : String(current.customId || '').trim();
    const legacyExempt = Boolean(current.customId && String(current.customId).trim() === nextCustomId);
    const aliasCheck = validateSingleProfileAlias(nextCustomId, {
      currentProfileId: current.id,
      profiles: allProfiles,
      legacyExempt,
    });
    if (!aliasCheck.valid) {
      return createExternalError('invalid_custom_id', aliasCheck.message || 'Invalid customId', 400);
    }

    const baseProfile = shouldRotate ? rotateProfileLinkId(current) : ensureProfileLinkId(current);
    const updated = {
      ...baseProfile,
      ...(payload.name !== undefined ? { name: String(payload.name || '').trim() } : {}),
      ...(payload.description !== undefined ? { description: String(payload.description || '').trim() } : {}),
      ...(payload.tags !== undefined ? { tags: normalizeStringArray(payload.tags) } : {}),
      ...(payload.enabled !== undefined ? { enabled: payload.enabled !== false } : {}),
      ...(payload.isPublic !== undefined ? { isPublic: payload.isPublic === true } : {}),
      ...(shouldRotate || payload.customId !== undefined ? { customId: nextCustomId } : {}),
      ...(payload.target !== undefined ? { target: String(payload.target || 'clash').trim() || 'clash' } : {}),
      ...(payload.sortIndex !== undefined ? { sortIndex: Number(payload.sortIndex) || 0 } : {}),
      ...(subscriptionIds !== undefined ? { subscriptions: subscriptionIds } : {}),
      ...(manualNodeIds !== undefined ? { manualNodes: manualNodeIds } : {}),
      configVersion: Math.max(1, Number(current.configVersion) || 1) + 1,
      updatedAt: nowIso(),
    } as ProfileConfig;
    if (!String(updated.name || '').trim())
      return createExternalError('profile_name_required', 'Profile name is required', 400);
    await storageAdapter.putProfile(updated);
    return createExternalSuccess(toExternalProfile(updated));
  }

  if (request.method === 'DELETE' && id && !relation) {
    const current = await getProfileById(storageAdapter, id);
    if (!current) return createExternalError('profile_not_found', 'Profile not found', 404);
    await storageAdapter.deleteProfileById(id);
    return createExternalSuccess({ deleted: true, id });
  }

  if (
    (request.method === 'POST' || request.method === 'DELETE') &&
    id &&
    (relation === 'subscriptions' || relation === 'manual-nodes')
  ) {
    const current = await getProfileById(storageAdapter, id);
    if (!current) return createExternalError('profile_not_found', 'Profile not found', 404);
    const payload = await readExternalJson(request);
    const isSubscriptionsRelation = relation === 'subscriptions';
    const bodyField = isSubscriptionsRelation ? 'subscriptionIds' : 'manualNodeIds';
    const incomingIds = dedupe(payload?.[bodyField]);
    const validationError = isSubscriptionsRelation
      ? await validateProfileReferences(storageAdapter, incomingIds, undefined)
      : await validateProfileReferences(storageAdapter, undefined, incomingIds);
    if (validationError) return validationError;

    let updated: ProfileConfig;
    if (isSubscriptionsRelation) {
      const currentIds = Array.isArray(current.subscriptions) ? current.subscriptions : [];
      const nextIds =
        request.method === 'POST'
          ? [...new Set([...currentIds, ...incomingIds])]
          : currentIds.filter((item) => !(typeof item === 'string' && incomingIds.includes(item)));
      updated = {
        ...current,
        subscriptions: nextIds,
        configVersion: Math.max(1, Number(current.configVersion) || 1) + 1,
        updatedAt: nowIso(),
      };
    } else {
      const currentIds = Array.isArray(current.manualNodes) ? current.manualNodes : [];
      const nextIds =
        request.method === 'POST'
          ? [...new Set([...currentIds, ...incomingIds])]
          : currentIds.filter((item) => !incomingIds.includes(item));
      updated = {
        ...current,
        manualNodes: nextIds,
        configVersion: Math.max(1, Number(current.configVersion) || 1) + 1,
        updatedAt: nowIso(),
      };
    }
    await storageAdapter.putProfile(updated);
    return createExternalSuccess(toExternalProfile(updated));
  }

  return createExternalError('method_not_allowed', 'Method Not Allowed', 405);
}
