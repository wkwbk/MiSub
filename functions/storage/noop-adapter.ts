import type { ManualNodeItem, MisubItem, ProfileConfig, SubscriptionItem } from '@misub/core/types.js';
import type {
  AccessLogEntry,
  BatchCachePutEntry,
  BatchItemUpdate,
  ErrorReportEntry,
  GuestbookMessage,
  StorageAdapter,
} from '../types.js';

/**
 * 无存储降级适配器（未绑定 D1 时降级为空操作）
 */
export class NoopStorageAdapter implements StorageAdapter {
  type: string;

  constructor() {
    this.type = 'noop';
  }
  async get<T = unknown>(_key: string, _type?: string, _options?: { fresh?: boolean }): Promise<T | null> {
    return null;
  }
  async put(_key: string, _value: unknown): Promise<boolean | { upserted: number; deleted: number }> {
    return true;
  }
  async delete(_key: string): Promise<boolean> {
    return true;
  }
  async list(_prefix?: string): Promise<Array<{ name: string }>> {
    return [];
  }
  async getSubscriptionById(_id: string): Promise<MisubItem | null> {
    return null;
  }
  async getRemoteSubscriptions(): Promise<SubscriptionItem[]> {
    return [];
  }
  async getManualNodes(): Promise<ManualNodeItem[]> {
    return [];
  }
  async getAllSubscriptions(): Promise<MisubItem[]> {
    return [];
  }
  async getProfileById(_idOrCustomId: string): Promise<ProfileConfig | null> {
    return null;
  }
  async getPublicProfileByIdentifier(_identifier: string): Promise<ProfileConfig | null> {
    return null;
  }
  async getAllProfiles(): Promise<ProfileConfig[]> {
    return [];
  }
  async incrementProfileDownloadCount(_idOrCustomId: string): Promise<number | null> {
    return null;
  }
  async resetProfileDownloadCounts(_options?: { profileId?: string }): Promise<boolean> {
    return false;
  }
  async getAllGuestbookMessages(): Promise<GuestbookMessage[]> {
    return [];
  }
  async getGuestbookMessageById(_id: string): Promise<GuestbookMessage | null> {
    return null;
  }
  async putGuestbookMessage(msg: GuestbookMessage): Promise<GuestbookMessage> {
    return msg;
  }
  async deleteGuestbookMessageById(_id: string): Promise<boolean> {
    return false;
  }
  async insertAccessLogs(
    _entries?: AccessLogEntry[],
    _options?: { maxAgeMs?: number; maxEntries?: number },
  ): Promise<number> {
    return 0;
  }
  async getAccessLogs(_options?: { limit?: number; minTimestamp?: number }): Promise<AccessLogEntry[]> {
    return [];
  }
  async clearAccessLogs(_options?: { profileId?: string; profileName?: string }): Promise<boolean> {
    return true;
  }
  async insertErrorReport(_report: ErrorReportEntry, _maxEntries?: number): Promise<boolean> {
    return true;
  }
  async getErrorReports(_limit?: number): Promise<ErrorReportEntry[]> {
    return [];
  }
  async clearErrorReports(): Promise<boolean> {
    return true;
  }
  async getProfileSources(_subscriptionIds?: string[], _manualNodeIds?: string[]): Promise<MisubItem[]> {
    return [];
  }
  async getSubscriptionsByIds(_ids?: string[]): Promise<MisubItem[]> {
    return [];
  }
  async updateSubscriptionById(_id: string, _updater: (item: MisubItem) => MisubItem): Promise<MisubItem | null> {
    return null;
  }
  async putSubscription(item: MisubItem, _options?: { skipOtherTableDelete?: boolean }): Promise<MisubItem> {
    return item;
  }
  async deleteSubscriptionById(_id: string): Promise<boolean> {
    return false;
  }
  async putProfile(item: ProfileConfig): Promise<ProfileConfig> {
    return item;
  }
  async deleteProfileById(_id: string): Promise<boolean> {
    return false;
  }
  async putAllSubscriptions(_items: MisubItem[]): Promise<boolean> {
    return true;
  }
  async syncAllSubscriptions(_items: MisubItem[]): Promise<boolean | { upserted: number; deleted: number }> {
    return { upserted: 0, deleted: 0 };
  }
  async putAllProfiles(_items: ProfileConfig[]): Promise<boolean> {
    return true;
  }
  async syncAllProfiles(_items: ProfileConfig[]): Promise<boolean | { upserted: number; deleted: number }> {
    return { upserted: 0, deleted: 0 };
  }
  async resetAllSettings(): Promise<boolean> {
    return true;
  }
  async getManyCacheEntries(_keys?: string[], _now?: number): Promise<Map<string, unknown>> {
    return new Map();
  }
  async putManyCacheEntries(_entries?: BatchCachePutEntry[]): Promise<boolean> {
    return true;
  }
  async deleteManyKeys(_keys?: string[]): Promise<number> {
    return 0;
  }
  async batchUpdateItemsById(
    _updates?: BatchItemUpdate[],
    _options?: { preferredTable?: 'subscriptions' | 'nodes' },
  ): Promise<MisubItem[]> {
    return [];
  }
  async cleanupMaintenance(_options?: { now?: number }): Promise<{ removedExpiredCache: number }> {
    return {
      removedExpiredCache: 0,
    };
  }
}
