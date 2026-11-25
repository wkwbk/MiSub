/**
 * 系统设置仓储（SettingsRepository）
 * - 自动复用单次请求已预加载的 context.settings，保持单请求零多余 D1 查询
 */

import { STORAGE_KEY_SETTINGS } from '../modules/config.js';
import { BaseRepository } from './base-repository.js';

const NAMESPACE = 'settings';
const SETTINGS_CACHE_TTL_MS = 10 * 1000;
const SETTINGS_EDGE_TTL_SECONDS = 10;

export class SettingsRepository extends BaseRepository {
  invalidateCaches() {
    this.cache.invalidateNamespaceSync(this.getCacheTarget(), NAMESPACE);
  }

  async getMain({ fresh = false } = {}) {
    if (!fresh && this.context && this.context.settings !== undefined) {
      return this.context.settings || {};
    }

    const loaded = await this.cache.getOrLoad({
      target: this.getCacheTarget(),
      namespace: NAMESPACE,
      key: STORAGE_KEY_SETTINGS,
      ttlMs: SETTINGS_CACHE_TTL_MS,
      edgeTtlSeconds: SETTINGS_EDGE_TTL_SECONDS,
      fresh,
      edgeCache: this.edgeCache,
      loader: async () => (await this.storage.get(STORAGE_KEY_SETTINGS, 'json', { fresh })) || null,
    });
    const resolved = loaded || {};
    if (this.context) {
      this.context.settings = resolved;
    }
    return resolved;
  }

  async saveMain(settings) {
    await this.storage.put(STORAGE_KEY_SETTINGS, settings);
    if (this.context) {
      this.context.settings = settings;
    }
    this.invalidateCaches();
    return settings;
  }

  async getByKey(key, { fresh = false } = {}) {
    if (!key) return null;
    return await this.cache.getOrLoad({
      target: this.getCacheTarget(),
      namespace: NAMESPACE,
      key: String(key),
      ttlMs: SETTINGS_CACHE_TTL_MS,
      edgeTtlSeconds: SETTINGS_EDGE_TTL_SECONDS,
      fresh,
      edgeCache: this.edgeCache,
      loader: async () => (await this.storage.get(key, 'json', { fresh })) ?? null,
    });
  }

  async saveByKey(key, value) {
    await this.storage.put(key, value);
    this.invalidateCaches();
    return value;
  }

  async resetAll() {
    const result = await this.storage.resetAllSettings();
    if (this.context) {
      this.context.settings = {};
    }
    this.invalidateCaches();
    return result;
  }
}
