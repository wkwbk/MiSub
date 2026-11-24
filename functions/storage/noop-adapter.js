/**
 * 无存储降级适配器（未绑定 D1 时降级为空操作）
 */
export class NoopStorageAdapter {
  constructor() {
    this.type = 'noop';
  }
  async get() {
    return null;
  }
  async put() {
    return true;
  }
  async delete() {
    return true;
  }
  async list() {
    return [];
  }
  async getSubscriptionById() {
    return null;
  }
  async getRemoteSubscriptions() {
    return [];
  }
  async getManualNodes() {
    return [];
  }
  async getAllSubscriptions() {
    return [];
  }
  async getProfileById() {
    return null;
  }
  async getPublicProfileByIdentifier() {
    return null;
  }
  async getAllProfiles() {
    return [];
  }
  async incrementProfileDownloadCount() {
    return null;
  }
  async resetProfileDownloadCounts() {
    return false;
  }
  async getAllGuestbookMessages() {
    return [];
  }
  async getGuestbookMessageById() {
    return null;
  }
  async putGuestbookMessage(msg) {
    return msg;
  }
  async deleteGuestbookMessageById() {
    return false;
  }
  async insertAccessLogs() {
    return 0;
  }
  async getAccessLogs() {
    return [];
  }
  async clearAccessLogs() {
    return true;
  }
  async insertErrorReport() {
    return true;
  }
  async getErrorReports() {
    return [];
  }
  async clearErrorReports() {
    return true;
  }
  async getProfileSources() {
    return [];
  }
  async getSubscriptionsByIds() {
    return [];
  }
  async updateSubscriptionById() {
    return null;
  }
  async putSubscription(item) {
    return item;
  }
  async deleteSubscriptionById() {
    return false;
  }
  async putProfile(item) {
    return item;
  }
  async deleteProfileById() {
    return false;
  }
  async putAllSubscriptions() {
    return true;
  }
  async putAllProfiles() {
    return true;
  }
  async resetAllSettings() {
    return true;
  }
  async cleanupMaintenance() {
    return {
      removedExpiredCache: 0,
    };
  }
}
