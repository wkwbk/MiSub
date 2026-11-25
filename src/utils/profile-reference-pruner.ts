import type { MisubItem, ProfileConfig } from '@misub/core/types.js';
import { getProfileSubscriptionId } from '@misub/core/domain/profile-subscription-ref.js';

export interface PruneProfilesResult<T extends Partial<ProfileConfig> = ProfileConfig> {
  profiles: T[];
  modified: boolean;
}

export function removeProfileRefsFromProfiles<T extends Partial<ProfileConfig> = ProfileConfig>(
  profiles: T[] = [],
  profileIds: string | string[] = [],
): PruneProfilesResult<T> {
  const idsToRemove = Array.isArray(profileIds) ? new Set(profileIds) : new Set([profileIds]);
  if (idsToRemove.size === 0 || !Array.isArray(profiles) || profiles.length === 0) {
    return { profiles, modified: false };
  }

  let modified = false;
  const nextProfiles = profiles.map((profile) => {
    if (!Array.isArray(profile?.subProfiles) || profile.subProfiles.length === 0) {
      return profile;
    }
    const filtered = profile.subProfiles.filter((id) => !idsToRemove.has(id));
    if (filtered.length !== profile.subProfiles.length) {
      modified = true;
      return { ...profile, subProfiles: filtered };
    }
    return profile;
  });

  return { profiles: modified ? nextProfiles : profiles, modified };
}

export function removeManualNodeRefsFromProfiles<T extends Partial<ProfileConfig> = ProfileConfig>(
  profiles: T[] = [],
  nodeIds: string | string[] = [],
): PruneProfilesResult<T> {
  const idsToRemove = Array.isArray(nodeIds) ? new Set(nodeIds) : new Set([nodeIds]);
  if (idsToRemove.size === 0 || !Array.isArray(profiles) || profiles.length === 0) {
    return { profiles, modified: false };
  }

  let modified = false;
  const nextProfiles = profiles.map((profile) => {
    if (!Array.isArray(profile?.manualNodes) || profile.manualNodes.length === 0) {
      return profile;
    }
    const filtered = profile.manualNodes.filter((id) => !idsToRemove.has(id));
    if (filtered.length !== profile.manualNodes.length) {
      modified = true;
      return { ...profile, manualNodes: filtered };
    }
    return profile;
  });

  return { profiles: modified ? nextProfiles : profiles, modified };
}

export function removeSubscriptionRefsFromProfiles<T extends Partial<ProfileConfig> = ProfileConfig>(
  profiles: T[] = [],
  subIds: string | string[] = [],
): PruneProfilesResult<T> {
  const idsToRemove = Array.isArray(subIds) ? new Set(subIds) : new Set([subIds]);
  if (idsToRemove.size === 0 || !Array.isArray(profiles) || profiles.length === 0) {
    return { profiles, modified: false };
  }

  let modified = false;
  const nextProfiles = profiles.map((profile) => {
    if (!Array.isArray(profile?.subscriptions) || profile.subscriptions.length === 0) {
      return profile;
    }
    const filtered = profile.subscriptions.filter((entry) => !idsToRemove.has(getProfileSubscriptionId(entry)));
    if (filtered.length !== profile.subscriptions.length) {
      modified = true;
      return { ...profile, subscriptions: filtered };
    }
    return profile;
  });

  return { profiles: modified ? nextProfiles : profiles, modified };
}

/**
 * 订阅组引用自愈：清理已不存在的订阅源/手动节点 ID 及重复引用（保留对象格式覆盖项）
 */
export function pruneInvalidProfileReferences<T extends Partial<ProfileConfig> = ProfileConfig>(
  profiles: T[] = [],
  subscriptions: Array<Partial<MisubItem>> = [],
): PruneProfilesResult<T> {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return { profiles, modified: false };
  }

  const validIds = new Set(
    (Array.isArray(subscriptions) ? subscriptions : [])
      .map((item) => item?.id)
      .filter((id): id is string => Boolean(id)),
  );
  let modified = false;

  const nextProfiles = profiles.map((profile) => {
    let nextProfile = profile;

    if (Array.isArray(profile?.manualNodes) && profile.manualNodes.length > 0) {
      const seenIds = new Set<string>();
      const filteredManualNodes = profile.manualNodes.filter((id) => {
        if (validIds.has(id) && !seenIds.has(id)) {
          seenIds.add(id);
          return true;
        }
        return false;
      });
      if (filteredManualNodes.length !== profile.manualNodes.length) {
        modified = true;
        nextProfile = { ...nextProfile, manualNodes: filteredManualNodes };
      }
    }

    if (Array.isArray(profile?.subscriptions) && profile.subscriptions.length > 0) {
      const seenIds = new Set<string>();
      const filteredSubscriptions = profile.subscriptions.filter((entry) => {
        const subId = getProfileSubscriptionId(entry);
        if (subId && validIds.has(subId) && !seenIds.has(subId)) {
          seenIds.add(subId);
          return true;
        }
        return false;
      });
      if (filteredSubscriptions.length !== profile.subscriptions.length) {
        modified = true;
        nextProfile = { ...nextProfile, subscriptions: filteredSubscriptions };
      }
    }

    return nextProfile;
  });

  return { profiles: modified ? nextProfiles : profiles, modified };
}
