import type {
  ManualNodeItem,
  MisubItem,
  ProfileConfig,
  SettingsConfig,
  SubscriptionItem,
} from '@misub/core/types.js';
import type { MultiTierCache } from './repositories/multi-tier-cache.js';
import type { SubscriptionRepository } from './repositories/subscription-repository.js';
import type { NodeRepository } from './repositories/node-repository.js';
import type { ProfileRepository } from './repositories/profile-repository.js';
import type { SettingsRepository } from './repositories/settings-repository.js';
import type { AccessLogRepository } from './repositories/access-log-repository.js';

export interface Env {
  MISUB_DB?: D1Database;
  ASSETS?: AssetsBinding;
  ADMIN_PASSWORD?: string;
  COOKIE_SECRET?: string;
  CRON_SECRET?: string;
  GITHUB_TOKEN?: string;
  CORS_ORIGINS?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  DISABLE_LOGIN_TURNSTILE?: string;
  ENABLE_AUTH_DIAGNOSTICS?: string;
  SUBCONVERTER_DEFAULT_BACKEND?: string;
  [key: string]: unknown;
}

interface AppVariables {
  externalTokenName?: string;
  validatedBody?: unknown;
}

export interface HonoEnv {
  Bindings: Env;
  Variables: AppVariables;
}

export interface GuestbookMessage {
  id: string;
  nickname?: string;
  content?: string;
  type?: string;
  status?: string;
  reply?: string;
  replyAt?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface AccessLogEntry {
  id?: string;
  timestamp?: number | string;
  profileId?: string;
  profileName?: string;
  [key: string]: unknown;
}

export interface ErrorReportEntry {
  id?: string;
  receivedAt?: number | string;
  [key: string]: unknown;
}

export interface BatchCachePutEntry {
  key: string;
  value: unknown;
  expiresAt?: number | null;
}

export interface BatchItemUpdate {
  id: string;
  updater: (item: MisubItem) => MisubItem | void;
}

export interface StorageAdapter {
  type: string;
  db?: D1Database;
  get<T = unknown>(key: string, type?: string, options?: { fresh?: boolean }): Promise<T | null>;
  put(key: string, value: unknown): Promise<boolean | { upserted: number; deleted: number }>;
  delete(key: string): Promise<boolean>;
  list(prefix?: string): Promise<Array<{ name: string }>>;
  getSubscriptionById(id: string): Promise<MisubItem | null>;
  getRemoteSubscriptions(options?: { fresh?: boolean }): Promise<SubscriptionItem[]>;
  getManualNodes(options?: { fresh?: boolean }): Promise<ManualNodeItem[]>;
  getAllSubscriptions(options?: { fresh?: boolean }): Promise<MisubItem[]>;
  getProfileById(idOrCustomId: string): Promise<ProfileConfig | null>;
  getPublicProfileByIdentifier(identifier: string): Promise<ProfileConfig | null>;
  getAllProfiles(options?: { fresh?: boolean }): Promise<ProfileConfig[]>;
  incrementProfileDownloadCount(idOrCustomId: string): Promise<number | null>;
  resetProfileDownloadCounts(options?: { profileId?: string }): Promise<boolean>;
  getAllGuestbookMessages(): Promise<GuestbookMessage[]>;
  getGuestbookMessageById(id: string): Promise<GuestbookMessage | null>;
  putGuestbookMessage(message: GuestbookMessage): Promise<GuestbookMessage>;
  deleteGuestbookMessageById(id: string): Promise<boolean>;
  insertAccessLogs(
    entries?: AccessLogEntry[],
    options?: { maxAgeMs?: number; maxEntries?: number },
  ): Promise<number>;
  getAccessLogs(options?: { limit?: number; minTimestamp?: number }): Promise<AccessLogEntry[]>;
  clearAccessLogs(options?: { profileId?: string; profileName?: string }): Promise<boolean>;
  insertErrorReport(report: ErrorReportEntry, maxEntries?: number): Promise<boolean>;
  getErrorReports(limit?: number): Promise<ErrorReportEntry[]>;
  clearErrorReports(): Promise<boolean>;
  getProfileSources(subscriptionIds?: string[], manualNodeIds?: string[]): Promise<MisubItem[]>;
  getSubscriptionsByIds(ids?: string[]): Promise<MisubItem[]>;
  updateSubscriptionById(id: string, updater: (item: MisubItem) => MisubItem): Promise<MisubItem | null>;
  updateSubscriptionRuntimeFields?(
    id: string,
    fields: Record<string, unknown>,
    options?: { preferredTable?: 'subscriptions' | 'nodes' },
  ): Promise<MisubItem | null>;
  putSubscription(item: MisubItem, options?: { skipOtherTableDelete?: boolean }): Promise<MisubItem>;
  compareAndSwapSubscription?(
    item: MisubItem,
    expectedConfigVersion: number,
    options?: { skipOtherTableDelete?: boolean },
  ): Promise<{ updated: boolean; current: MisubItem | null }>;
  deleteSubscriptionById(id: string): Promise<boolean>;
  deleteSubscriptionsByIds?(ids: string[]): Promise<number>;
  putProfile(item: ProfileConfig): Promise<ProfileConfig>;
  updateProfileRuntimeFields?(idOrCustomId: string, fields: Record<string, unknown>): Promise<ProfileConfig | null>;
  compareAndSwapProfile?(
    item: ProfileConfig,
    expectedConfigVersion: number,
  ): Promise<{ updated: boolean; current: ProfileConfig | null }>;
  deleteProfileById(id: string): Promise<boolean>;
  deleteProfilesByIds?(ids: string[]): Promise<number>;
  putAllSubscriptions(items: MisubItem[]): Promise<boolean>;
  syncAllSubscriptions(items: MisubItem[]): Promise<boolean | { upserted: number; deleted: number }>;
  putAllProfiles(items: ProfileConfig[]): Promise<boolean>;
  syncAllProfiles(items: ProfileConfig[]): Promise<boolean | { upserted: number; deleted: number }>;
  cleanupMaintenance?(options?: { now?: number }): Promise<{ removedExpiredCache: number }>;
  getManyCacheEntries(keys?: string[], now?: number): Promise<Map<string, unknown>>;
  putManyCacheEntries(entries?: BatchCachePutEntry[]): Promise<boolean>;
  deleteManyKeys(keys?: string[]): Promise<number>;
  batchUpdateItemsById(
    updates?: BatchItemUpdate[],
    options?: { preferredTable?: 'subscriptions' | 'nodes' },
  ): Promise<MisubItem[]>;
  resetAllSettings(): Promise<boolean>;
}

export interface Repositories {
  storage: StorageAdapter;
  cache: MultiTierCache;
  subscriptions: SubscriptionRepository;
  nodes: NodeRepository;
  profiles: ProfileRepository;
  settings: SettingsRepository;
  accessLogs: AccessLogRepository;
}

export interface BoundRequestContext {
  request?: Request;
  env?: Env;
  params?: Record<string, string | string[] | undefined>;
  data?: Record<string, unknown>;
  waitUntil?: (promise: Promise<unknown>) => void;
  passThroughOnException?: () => void;
  next?: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  storage?: StorageAdapter;
  settings?: Partial<SettingsConfig> & Record<string, unknown>;
  config?: SettingsConfig & Record<string, unknown>;
  repos?: Repositories;
  [key: string]: unknown;
}

export interface PagesFunctionContext {
  request: Request;
  env: Env;
  params?: Record<string, string | string[] | undefined>;
  data?: Record<string, unknown>;
  waitUntil?: (promise: Promise<unknown>) => void;
  passThroughOnException?: () => void;
  next?: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}
