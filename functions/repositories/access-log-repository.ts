/**
 * 访问日志仓储（AccessLogRepository）
 * - 统一封装 access_logs 行级表的批量写入（db.batch）、查询与清理
 */

import type { AccessLogEntry } from '../types.js';
import { BaseRepository } from './base-repository.js';

export class AccessLogRepository extends BaseRepository {
  isRowLogSupported(): boolean {
    return (
      this.isAvailable() &&
      typeof this.storage.insertAccessLogs === 'function' &&
      typeof this.storage.getAccessLogs === 'function' &&
      typeof this.storage.clearAccessLogs === 'function'
    );
  }

  async insertBatch(
    entries: AccessLogEntry[] = [],
    options: { maxAgeMs?: number; maxEntries?: number } = {},
  ): Promise<number> {
    if (!this.isRowLogSupported()) return 0;
    return await this.storage.insertAccessLogs(entries, options);
  }

  async getRecent({ limit = 200, minTimestamp = 0 }: { limit?: number; minTimestamp?: number } = {}): Promise<
    AccessLogEntry[]
  > {
    if (!this.isRowLogSupported()) return [];
    return (await this.storage.getAccessLogs({ limit, minTimestamp })) || [];
  }

  async clear({ profileId = '', profileName = '' }: { profileId?: string; profileName?: string } = {}): Promise<boolean> {
    if (!this.isRowLogSupported()) return false;
    return await this.storage.clearAccessLogs({ profileId, profileName });
  }
}
