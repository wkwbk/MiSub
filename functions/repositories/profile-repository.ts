/**
 * 订阅组仓储（ProfileRepository）
 * - 三级缓存读穿透（Memory -> Cache API -> D1），并支持负向哨兵防穿透
 * - 写操作主动清理命名空间与各层级缓存代数
 */

import type { MisubItem, ProfileConfig } from '@misub/core/types.js';
import { resolvePublicProfile } from '@misub/core/domain/profile-link.js';
import { BaseRepository } from './base-repository.js';

const NAMESPACE = 'profiles';
const PROFILE_CACHE_TTL_MS = 30 * 1000;
const PROFILE_EDGE_TTL_SECONDS = 30;
const NEGATIVE_CACHE_TTL_MS = 5 * 1000;

export class ProfileRepository extends BaseRepository {
  invalidateCaches(): void {
    this.cache.invalidateNamespaceSync(this.getCacheTarget(), NAMESPACE);
  }

  async getAll({ fresh = false }: { fresh?: boolean } = {}): Promise<ProfileConfig[]> {
    const result = await this.cache.getOrLoad<ProfileConfig[]>({
      target: this.getCacheTarget(),
      namespace: NAMESPACE,
      key: 'all',
      ttlMs: PROFILE_CACHE_TTL_MS,
      edgeTtlSeconds: PROFILE_EDGE_TTL_SECONDS,
      fresh,
      edgeCache: this.edgeCache,
      loader: async () => {
        const rows = await this.storage.getAllProfiles();
        return Array.isArray(rows) ? rows : [];
      },
    });
    return result ?? [];
  }

  async getById(idOrCustomId: string, { fresh = false }: { fresh?: boolean } = {}): Promise<ProfileConfig | null> {
    const targetId = typeof idOrCustomId === 'string' ? idOrCustomId.trim() : '';
    if (!targetId) return null;

    return await this.cache.getOrLoad<ProfileConfig | null>({
      target: this.getCacheTarget(),
      namespace: NAMESPACE,
      key: `id:${targetId}`,
      ttlMs: PROFILE_CACHE_TTL_MS,
      negativeTtlMs: NEGATIVE_CACHE_TTL_MS,
      edgeTtlSeconds: PROFILE_EDGE_TTL_SECONDS,
      fresh,
      edgeCache: this.edgeCache,
      loader: async () => {
        if (typeof this.storage.getProfileById === 'function') {
          return (await this.storage.getProfileById(targetId)) || null;
        }
        const all = await this.getAll({ fresh });
        return all.find((p) => p?.id === targetId || p?.customId === targetId || p?.linkId === targetId) || null;
      },
    });
  }

  async getPublicByIdentifier(
    identifier: string,
    { fresh = false }: { fresh?: boolean } = {},
  ): Promise<ProfileConfig | null> {
    const target = typeof identifier === 'string' ? identifier.trim() : '';
    if (!target) return null;

    return await this.cache.getOrLoad<ProfileConfig | null>({
      target: this.getCacheTarget(),
      namespace: NAMESPACE,
      key: `public:${target.toLowerCase()}`,
      ttlMs: PROFILE_CACHE_TTL_MS,
      negativeTtlMs: NEGATIVE_CACHE_TTL_MS,
      edgeTtlSeconds: PROFILE_EDGE_TTL_SECONDS,
      fresh,
      edgeCache: this.edgeCache,
      loader: async () => {
        if (typeof this.storage.getPublicProfileByIdentifier === 'function') {
          return (await this.storage.getPublicProfileByIdentifier(target)) || null;
        }
        const all = await this.getAll({ fresh });
        return resolvePublicProfile(all || [], target) || null;
      },
    });
  }

  async getSources(subscriptionIds: string[] = [], manualNodeIds: string[] = []): Promise<MisubItem[]> {
    const subIds = Array.isArray(subscriptionIds) ? subscriptionIds.filter(Boolean) : [];
    const nodeIds = Array.isArray(manualNodeIds) ? manualNodeIds.filter(Boolean) : [];
    if (subIds.length === 0 && nodeIds.length === 0) return [];

    if (typeof this.storage.getProfileSources === 'function') {
      return (await this.storage.getProfileSources(subIds, nodeIds)) || [];
    }
    const mergedIds = Array.from(new Set([...subIds, ...nodeIds]));
    if (typeof this.storage.getSubscriptionsByIds === 'function') {
      return (await this.storage.getSubscriptionsByIds(mergedIds)) || [];
    }
    const idSet = new Set(mergedIds);
    const all = (await this.storage.getAllSubscriptions()) || [];
    return all.filter((item) => item?.id && idSet.has(item.id));
  }

  async save(profile: ProfileConfig): Promise<ProfileConfig | null> {
    if (!profile?.id) return null;
    const saved = await this.storage.putProfile(profile);
    this.invalidateCaches();
    return saved;
  }

  async putMany(profiles: ProfileConfig[] = []): Promise<boolean> {
    const validProfiles = (Array.isArray(profiles) ? profiles : []).filter((item) => item?.id);
    if (validProfiles.length === 0) return true;

    if (typeof this.storage.putAllProfiles === 'function') {
      const result = await this.storage.putAllProfiles(validProfiles);
      this.invalidateCaches();
      return result;
    }

    for (const profile of validProfiles) {
      await this.storage.putProfile(profile);
    }
    this.invalidateCaches();
    return true;
  }

  async syncAll(profiles: ProfileConfig[] = []): Promise<boolean | { upserted: number; deleted: number }> {
    const result = await this.storage.syncAllProfiles(Array.isArray(profiles) ? profiles : []);
    this.invalidateCaches();
    return result;
  }

  async deleteById(id: string): Promise<boolean> {
    const deleted = await this.storage.deleteProfileById(id);
    this.invalidateCaches();
    return deleted;
  }

  async incrementDownloadCount(idOrCustomId: string): Promise<number | null> {
    if (typeof this.storage.incrementProfileDownloadCount !== 'function') return null;
    const nextCount = await this.storage.incrementProfileDownloadCount(idOrCustomId);
    this.invalidateCaches();
    return nextCount;
  }

  async resetDownloadCounts(options: { profileId?: string } = {}): Promise<boolean> {
    if (typeof this.storage.resetProfileDownloadCounts !== 'function') return false;
    const result = await this.storage.resetProfileDownloadCounts(options);
    this.invalidateCaches();
    return result;
  }
}
