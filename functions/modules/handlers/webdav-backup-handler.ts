import type { MisubItem, ProfileConfig } from '@misub/core/types.js';
import { utf8ToBase64 } from '@misub/core/utils/base64.js';
import type { Env, StorageAdapter } from '../../types.js';
import { StorageFactory } from '../../storage-adapter.js';
import { SETTINGS_KEYS } from '../../storage/d1-schema.js';
import { STORAGE_KEY_SETTINGS } from '../config.js';
import { listRuleTemplates, STORAGE_KEY_RULE_TEMPLATES, type RuleTemplateItem } from './rule-template-handler.js';
import { createErrorResponse, createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from '../utils.js';

const BACKUP_TYPE = 'misub-backup';
const BACKUP_VERSION = 1;
const BACKUP_SCOPES = {
  DATA_ONLY: 'dataOnly',
  DATA_AND_SETTINGS: 'dataAndSettings',
} as const;

type BackupScope = (typeof BACKUP_SCOPES)[keyof typeof BACKUP_SCOPES];

interface WebdavBackupConfig {
  enabled: boolean;
  endpoint: string;
  username: string;
  password: string;
  remotePath: string;
  filenameTemplate: string;
  backupScope: string;
  autoBackup: boolean;
  interval: string;
  retentionCount: number;
  lastCheckedAt: string | null;
  lastBackupAt: string | null;
  lastBackupStatus: string | null;
  lastBackupMessage: string;
  lastBackupFile: string;
  [key: string]: unknown;
}

interface BackupDataSection {
  subscriptions: MisubItem[];
  profiles: ProfileConfig[];
  ruleTemplates: RuleTemplateItem[];
  settings: Record<string, unknown> | null;
  clients?: unknown;
  publicCores?: unknown;
  publicLinks?: unknown;
}

export interface BackupPayload {
  version: number;
  app: string;
  type: string;
  scope: BackupScope;
  exportedAt: string;
  source: {
    storageType: string;
    trigger: string;
  };
  data: BackupDataSection;
  [key: string]: unknown;
}

const RESTORE_SNAPSHOT_KEY = 'misub_restore_snapshot_latest';
const BACKUP_FILENAME_PREFIX = 'misub-backup-';
const BACKUP_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;
const DEFAULT_WEBDAV_CONFIG: WebdavBackupConfig = {
  enabled: false,
  endpoint: '',
  username: '',
  password: '',
  remotePath: '/MiSub',
  filenameTemplate: 'misub-backup-{datetime}.json',
  backupScope: BACKUP_SCOPES.DATA_ONLY,
  autoBackup: false,
  interval: 'daily',
  retentionCount: 7,
  lastCheckedAt: null,
  lastBackupAt: null,
  lastBackupStatus: null,
  lastBackupMessage: '',
  lastBackupFile: '',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getHttpStatus(error: unknown, fallback: number): number {
  return isRecord(error) && typeof error.status === 'number' ? error.status : fallback;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function cloneJson<T>(value: T): T {
  return value == null ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function normalizeScope(scope: unknown): BackupScope {
  return scope === BACKUP_SCOPES.DATA_AND_SETTINGS ? BACKUP_SCOPES.DATA_AND_SETTINGS : BACKUP_SCOPES.DATA_ONLY;
}

function normalizeWebdavConfig(settings: Record<string, unknown> = {}): WebdavBackupConfig {
  const rawWebdav = isRecord(settings.webdavBackup) ? settings.webdavBackup : {};
  return { ...DEFAULT_WEBDAV_CONFIG, ...rawWebdav };
}

function sanitizeRuntimeSecrets(settings: Record<string, unknown> = {}): Record<string, unknown> {
  const sanitized = cloneJson(settings) || {};
  delete sanitized.webdavBackup;
  delete sanitized.adminPassword;
  delete sanitized.ADMIN_PASSWORD;
  delete sanitized.password;
  delete sanitized.cookieSecret;
  delete sanitized.COOKIE_SECRET;
  delete sanitized.githubToken;
  delete sanitized.GITHUB_TOKEN;
  delete sanitized.sessionSecret;
  delete sanitized.lastBackupAt;
  delete sanitized.lastBackupStatus;
  delete sanitized.lastBackupMessage;
  delete sanitized.lastBackupFile;
  delete sanitized.publicLinks;
  delete sanitized.publicCores;
  return sanitized;
}

function sanitizeSettingsForBackup(settings: Record<string, unknown> = {}): Record<string, unknown> {
  return sanitizeRuntimeSecrets(settings);
}

function sanitizeSettingsForRestore(settings: Record<string, unknown> = {}): Record<string, unknown> {
  return sanitizeRuntimeSecrets(settings);
}

async function getStorage(env: Env): Promise<{ storageType: string; storageAdapter: StorageAdapter }> {
  return {
    storageType: 'd1',
    storageAdapter: StorageFactory.createAdapter(env) as unknown as StorageAdapter,
  };
}

async function readBusinessData(storageAdapter: StorageAdapter) {
  const [subscriptions, profiles, ruleTemplates] = await Promise.all([
    storageAdapter.getAllSubscriptions(),
    storageAdapter.getAllProfiles(),
    listRuleTemplates(storageAdapter).catch(() => [] as RuleTemplateItem[]),
  ]);

  return {
    subscriptions: Array.isArray(subscriptions) ? subscriptions : [],
    profiles: Array.isArray(profiles) ? profiles : [],
    ruleTemplates: Array.isArray(ruleTemplates) ? ruleTemplates : [],
  };
}

function stripEntityConfigVersion<T>(items: T[]): T[] {
  return items.map((item) => {
    if (!isRecord(item)) return item;
    const copy: Record<string, unknown> = { ...item };
    delete copy.configVersion;
    delete copy.version;
    return copy as T;
  });
}

export async function buildBackupPayload(
  env: Env,
  options: { scope?: unknown; trigger?: string } = {},
): Promise<BackupPayload> {
  const { storageAdapter, storageType } = await getStorage(env);
  const loadedSettings = await storageAdapter.get<Record<string, unknown>>(STORAGE_KEY_SETTINGS);
  const settings = isRecord(loadedSettings) ? loadedSettings : {};
  const backupConfig = normalizeWebdavConfig(settings);
  const scope = normalizeScope(options.scope || backupConfig.backupScope);
  const businessData = await readBusinessData(storageAdapter);

  const payload: BackupPayload = {
    version: BACKUP_VERSION,
    app: 'MiSub',
    type: BACKUP_TYPE,
    scope,
    exportedAt: new Date().toISOString(),
    source: {
      storageType,
      trigger: options.trigger || 'manual',
    },
    data: {
      subscriptions: stripEntityConfigVersion(cloneJson(businessData.subscriptions)),
      profiles: stripEntityConfigVersion(cloneJson(businessData.profiles)),
      ruleTemplates: cloneJson(businessData.ruleTemplates),
      settings: null,
    },
  };

  if (scope === BACKUP_SCOPES.DATA_AND_SETTINGS) {
    const [clients, publicCores, publicLinks] = await Promise.all([
      storageAdapter.get(SETTINGS_KEYS.CLIENTS).catch(() => null),
      storageAdapter.get(SETTINGS_KEYS.PUBLIC_CORES).catch(() => null),
      storageAdapter.get(SETTINGS_KEYS.PUBLIC_LINKS).catch(() => null),
    ]);
    payload.data.settings = sanitizeSettingsForBackup(settings);
    if (clients && (typeof clients === 'object' || Array.isArray(clients))) {
      payload.data.clients = cloneJson(clients);
    }
    if (publicCores && typeof publicCores === 'object') {
      payload.data.publicCores = cloneJson(publicCores);
    }
    if (publicLinks && typeof publicLinks === 'object') {
      payload.data.publicLinks = cloneJson(publicLinks);
    }
  }

  return payload;
}

function normalizeBackupPayload(raw: unknown): BackupPayload {
  if (!isRecord(raw)) {
    throw new Error('无效的备份文件格式');
  }

  if (raw.type === BACKUP_TYPE && isRecord(raw.data)) {
    const rawData = raw.data;
    const rawSettings = isRecord(rawData.settings) ? rawData.settings : null;
    return {
      version: typeof raw.version === 'number' ? raw.version : BACKUP_VERSION,
      app: typeof raw.app === 'string' ? raw.app : 'MiSub',
      type: BACKUP_TYPE,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
      source: isRecord(raw.source)
        ? {
            storageType: typeof raw.source.storageType === 'string' ? raw.source.storageType : 'd1',
            trigger: typeof raw.source.trigger === 'string' ? raw.source.trigger : 'import',
          }
        : { storageType: 'd1', trigger: 'import' },
      ...raw,
      scope: normalizeScope(raw.scope),
      data: {
        subscriptions: Array.isArray(rawData.subscriptions) ? (rawData.subscriptions as MisubItem[]) : [],
        profiles: Array.isArray(rawData.profiles) ? (rawData.profiles as ProfileConfig[]) : [],
        ruleTemplates: Array.isArray(rawData.ruleTemplates) ? (rawData.ruleTemplates as RuleTemplateItem[]) : [],
        settings: rawSettings,
        clients:
          rawData.clients && (typeof rawData.clients === 'object' || Array.isArray(rawData.clients))
            ? rawData.clients
            : null,
        publicCores:
          (rawData.publicCores && typeof rawData.publicCores === 'object' ? rawData.publicCores : null) ||
          (rawSettings && isRecord(rawSettings.publicCores) ? rawSettings.publicCores : null),
        publicLinks:
          (rawData.publicLinks && typeof rawData.publicLinks === 'object' ? rawData.publicLinks : null) ||
          (rawSettings && isRecord(rawSettings.publicLinks) ? rawSettings.publicLinks : null),
      },
    };
  }

  if (Array.isArray(raw.subscriptions)) {
    return {
      version: BACKUP_VERSION,
      app: 'MiSub',
      type: BACKUP_TYPE,
      scope: BACKUP_SCOPES.DATA_ONLY,
      exportedAt: typeof raw.exportedAt === 'string' && raw.exportedAt ? raw.exportedAt : new Date().toISOString(),
      source: { storageType: 'legacy-local', trigger: 'import' },
      data: {
        subscriptions: [
          ...(raw.subscriptions as MisubItem[]),
          ...(Array.isArray(raw.manualNodes) ? (raw.manualNodes as MisubItem[]) : []),
        ],
        profiles: Array.isArray(raw.profiles) ? (raw.profiles as ProfileConfig[]) : [],
        ruleTemplates: Array.isArray(raw.ruleTemplates) ? (raw.ruleTemplates as RuleTemplateItem[]) : [],
        settings: null,
      },
    };
  }

  throw new Error('无效的备份文件格式');
}

async function syncEntityCollection<T extends { id: string }>(
  finalItems: T[],
  getAll: (() => Promise<T[]>) | undefined,
  putItem: ((item: T) => Promise<unknown>) | undefined,
  deleteItem: ((id: string) => Promise<unknown>) | undefined,
  putAllFallback: (items: T[]) => Promise<unknown>,
): Promise<void> {
  if (getAll && putItem && deleteItem) {
    const currentItems = await getAll();
    const finalMap = new Map(finalItems.filter((item) => item?.id).map((item) => [item.id, item]));
    const currentMap = new Map(
      (Array.isArray(currentItems) ? currentItems : []).filter((item) => item?.id).map((item) => [item.id, item]),
    );

    for (const item of finalMap.values()) {
      const existing = currentMap.get(item.id);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(item)) {
        await putItem(item);
      }
    }
    for (const id of currentMap.keys()) {
      if (!finalMap.has(id)) {
        await deleteItem(id);
      }
    }
    return;
  }

  await putAllFallback(finalItems);
}

async function syncCollection(
  storageAdapter: StorageAdapter,
  type: 'subscriptions' | 'profiles',
  items: MisubItem[] | ProfileConfig[],
): Promise<void> {
  if (type === 'profiles') {
    const finalItems = Array.isArray(items) ? (items as ProfileConfig[]) : [];
    await syncEntityCollection(
      finalItems,
      storageAdapter.getAllProfiles?.bind(storageAdapter),
      storageAdapter.putProfile?.bind(storageAdapter),
      storageAdapter.deleteProfileById?.bind(storageAdapter),
      (all) => storageAdapter.putAllProfiles(all),
    );
    return;
  }

  const finalItems = Array.isArray(items) ? (items as MisubItem[]) : [];
  await syncEntityCollection(
    finalItems,
    storageAdapter.getAllSubscriptions?.bind(storageAdapter),
    storageAdapter.putSubscription?.bind(storageAdapter),
    storageAdapter.deleteSubscriptionById?.bind(storageAdapter),
    (all) => storageAdapter.putAllSubscriptions(all),
  );
}

async function createPreRestoreSnapshot(
  env: Env,
  storageAdapter: StorageAdapter,
  scope: BackupScope,
): Promise<BackupPayload> {
  const snapshot = await buildBackupPayload(env, {
    scope: scope === BACKUP_SCOPES.DATA_AND_SETTINGS ? BACKUP_SCOPES.DATA_AND_SETTINGS : BACKUP_SCOPES.DATA_ONLY,
    trigger: 'pre-restore',
  });
  await storageAdapter.put(RESTORE_SNAPSHOT_KEY, snapshot);
  return snapshot;
}

export async function restoreBackupPayload(
  env: Env,
  rawPayload: unknown,
  options: { scope?: unknown; createSnapshot?: boolean } = {},
) {
  const payload = normalizeBackupPayload(rawPayload);
  const scope = normalizeScope(options.scope || payload.scope);
  const { storageAdapter } = await getStorage(env);

  if (options.createSnapshot !== false) {
    await createPreRestoreSnapshot(env, storageAdapter, scope);
  }

  await syncCollection(storageAdapter, 'subscriptions', payload.data.subscriptions);
  await syncCollection(storageAdapter, 'profiles', payload.data.profiles);
  await storageAdapter.put(
    STORAGE_KEY_RULE_TEMPLATES,
    Array.isArray(payload.data.ruleTemplates) ? payload.data.ruleTemplates : [],
  );

  if (scope === BACKUP_SCOPES.DATA_AND_SETTINGS && payload.data.settings) {
    const loadedCurrent = await storageAdapter.get<Record<string, unknown>>(STORAGE_KEY_SETTINGS, 'json', {
      fresh: true,
    });
    const currentSettings = isRecord(loadedCurrent) ? loadedCurrent : {};
    const restoredSettings = sanitizeSettingsForRestore(payload.data.settings);
    const finalSettings = {
      ...restoredSettings,
      webdavBackup: currentSettings.webdavBackup,
    };
    await storageAdapter.put(STORAGE_KEY_SETTINGS, finalSettings);

    if (payload.data.clients && (typeof payload.data.clients === 'object' || Array.isArray(payload.data.clients))) {
      await storageAdapter.put(SETTINGS_KEYS.CLIENTS, payload.data.clients);
    }
    if (payload.data.publicCores && typeof payload.data.publicCores === 'object') {
      await storageAdapter.put(SETTINGS_KEYS.PUBLIC_CORES, payload.data.publicCores);
    }
    if (payload.data.publicLinks && typeof payload.data.publicLinks === 'object') {
      await storageAdapter.put(SETTINGS_KEYS.PUBLIC_LINKS, payload.data.publicLinks);
    }
  }

  return {
    success: true,
    message: '备份已恢复',
    scope,
    restored: {
      subscriptions: payload.data.subscriptions.length,
      profiles: payload.data.profiles.length,
      ruleTemplates: payload.data.ruleTemplates.length,
      settings: scope === BACKUP_SCOPES.DATA_AND_SETTINGS && !!payload.data.settings,
    },
  };
}

function joinWebdavPath(base: string, path: string): string {
  const trimmedBase = String(base || '').replace(/\/+$/, '');
  const parts = String(path || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part));
  return [trimmedBase, ...parts].join('/');
}

function decodeWebdavPathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function normalizeWebdavHref(endpoint: string, href: string): string | null {
  const endpointUrl = new URL(endpoint);
  const hrefUrl = new URL(String(href || '').replace(/&amp;/gi, '&'), `${endpointUrl.origin}/`);

  if (hrefUrl.origin !== endpointUrl.origin) return null;

  const endpointPath = endpointUrl.pathname.replace(/\/+$/, '');
  const hrefPath = hrefUrl.pathname;
  if (hrefPath !== endpointPath && !hrefPath.startsWith(`${endpointPath}/`)) return null;

  const relativePath = hrefPath.slice(endpointPath.length);
  const decodedParts = relativePath.split('/').filter(Boolean).map(decodeWebdavPathSegment);
  return decodedParts.length ? `/${decodedParts.join('/')}` : '/';
}

function toBasicAuth(username: string, password: string): string {
  const raw = `${username || ''}:${password || ''}`;
  if (typeof btoa === 'function') {
    return utf8ToBase64(raw);
  }
  return Buffer.from(raw, 'utf8').toString('base64');
}

function assertSafeWebdavConfig(config: WebdavBackupConfig): void {
  if (!config.endpoint || !/^https:\/\//i.test(config.endpoint)) {
    throw new Error('WebDAV 地址必须使用 https://');
  }
  if (!config.username || !config.password) {
    throw new Error('请填写 WebDAV 用户名和密码');
  }
}

async function webdavFetch(config: WebdavBackupConfig, path: string, init: RequestInit = {}): Promise<Response> {
  assertSafeWebdavConfig(config);
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Basic ${toBasicAuth(config.username, config.password)}`);
  const url = joinWebdavPath(config.endpoint, path);
  return fetch(url, { ...init, headers });
}

async function ensureRemoteDirectory(config: WebdavBackupConfig): Promise<void> {
  const parts = String(config.remotePath || '/MiSub')
    .split('/')
    .filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    const response = await webdavFetch(config, current, { method: 'MKCOL' });
    if (![200, 201, 204, 405].includes(response.status)) {
      throw new Error(`创建 WebDAV 目录失败: HTTP ${response.status}`);
    }
  }
}

export function formatBackupFilename(template = DEFAULT_WEBDAV_CONFIG.filenameTemplate, now = new Date()): string {
  const utcPlus8 = new Date(now.getTime() + BACKUP_TIMEZONE_OFFSET_MS);
  const datetime = utcPlus8.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const date = utcPlus8.toISOString().slice(0, 10);
  const safeTemplate = template || DEFAULT_WEBDAV_CONFIG.filenameTemplate;
  return safeTemplate.replace(/\{datetime\}/g, datetime).replace(/\{date\}/g, date);
}

async function updateBackupStatus(env: Env, patch: Partial<WebdavBackupConfig>): Promise<WebdavBackupConfig> {
  const { storageAdapter } = await getStorage(env);
  const loaded = await storageAdapter.get<Record<string, unknown>>(STORAGE_KEY_SETTINGS, 'json', { fresh: true });
  const settings = isRecord(loaded) ? loaded : {};
  const webdavBackup: WebdavBackupConfig = { ...normalizeWebdavConfig(settings), ...patch };
  await storageAdapter.put(STORAGE_KEY_SETTINGS, { ...settings, webdavBackup });
  return webdavBackup;
}

export async function performWebdavBackup(env: Env, options: { scope?: unknown; trigger?: string } = {}) {
  const { storageAdapter } = await getStorage(env);
  const loaded = await storageAdapter.get<Record<string, unknown>>(STORAGE_KEY_SETTINGS);
  const settings = isRecord(loaded) ? loaded : {};
  const config = normalizeWebdavConfig(settings);
  assertSafeWebdavConfig(config);

  const payload = await buildBackupPayload(env, {
    scope: options.scope || config.backupScope,
    trigger: options.trigger || 'manual',
  });
  const filename = formatBackupFilename(config.filenameTemplate);
  const remotePath = `${String(config.remotePath || '/MiSub').replace(/\/+$/, '')}/${filename}`;
  const body = JSON.stringify(payload, null, 2);

  try {
    await ensureRemoteDirectory(config);
    const response = await webdavFetch(config, remotePath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body,
    });
    if (!response.ok && response.status !== 201 && response.status !== 204) {
      throw new Error(`WebDAV 上传失败: HTTP ${response.status}`);
    }

    const retentionCount = Math.floor(Number(config.retentionCount) || 0);
    if (retentionCount > 0) {
      try {
        const remoteDir = String(config.remotePath || '/MiSub').replace(/\/+$/, '');
        const listResponse = await webdavFetch(config, remoteDir || '/', {
          method: 'PROPFIND',
          headers: { Depth: '1' },
        });
        if (listResponse.ok) {
          const xml = await listResponse.text();
          const existingFiles = Array.from(xml.matchAll(/<[^:>]*:?href[^>]*>([^<]+)<\/[^:>]*:?href>/gi))
            .map((match) => normalizeWebdavHref(config.endpoint, match[1]))
            .filter(
              (href): href is string =>
                typeof href === 'string' && href.endsWith('.json') && href.includes(BACKUP_FILENAME_PREFIX),
            )
            .map((href) => ({ path: href, name: href.split('/').filter(Boolean).pop() || '' }))
            .sort((a, b) => String(b.name).localeCompare(String(a.name)));
          const staleFiles = existingFiles.slice(retentionCount);
          for (const file of staleFiles) {
            await webdavFetch(config, file.path, { method: 'DELETE' }).catch(() => {});
          }
        }
      } catch (pruneError: unknown) {
        console.warn('[WebDAV Backup] Failed to prune old backups:', getErrorMessage(pruneError, String(pruneError)));
      }
    }

    await updateBackupStatus(env, {
      lastBackupAt: payload.exportedAt,
      lastBackupStatus: 'success',
      lastBackupMessage: '备份成功',
      lastBackupFile: remotePath,
    });

    return {
      success: true,
      message: '备份成功',
      file: remotePath,
      size: body.length,
      scope: payload.scope,
      timestamp: payload.exportedAt,
    };
  } catch (error: unknown) {
    await updateBackupStatus(env, {
      lastBackupAt: new Date().toISOString(),
      lastBackupStatus: 'failed',
      lastBackupMessage: getErrorMessage(error, '备份失败'),
    });
    throw error;
  }
}

export async function handleWebdavBackupTest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return createErrorResponse('Method Not Allowed', 405);
  try {
    const { storageAdapter } = await getStorage(env);
    const loaded = await storageAdapter.get<Record<string, unknown>>(STORAGE_KEY_SETTINGS);
    const settings = isRecord(loaded) ? loaded : {};
    const rawBody = await readJsonWithLimit(request, JSON_BODY_LIMITS.large).catch((e: unknown) => {
      if (isRecord(e) && e.status === 413) throw e;
      return {};
    });
    const body = isRecord(rawBody) ? rawBody : {};
    const savedConfig = normalizeWebdavConfig(settings);
    const incoming = isRecord(body.webdavBackup) ? body.webdavBackup : body;
    const config: WebdavBackupConfig = {
      ...savedConfig,
      ...incoming,
      password:
        typeof incoming.password === 'string' && incoming.password ? incoming.password : savedConfig.password,
    };
    assertSafeWebdavConfig(config);
    await ensureRemoteDirectory(config);
    return createJsonResponse({ success: true, message: 'WebDAV 连接测试成功' });
  } catch (error: unknown) {
    return createJsonResponse(
      { success: false, message: getErrorMessage(error, 'WebDAV 连接测试失败') },
      getHttpStatus(error, 400),
    );
  }
}

export async function handleManualWebdavBackup(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return createErrorResponse('Method Not Allowed', 405);
  try {
    const rawBody = await readJsonWithLimit(request, JSON_BODY_LIMITS.large).catch((e: unknown) => {
      if (isRecord(e) && e.status === 413) throw e;
      return {};
    });
    const body = isRecord(rawBody) ? rawBody : {};
    const result = await performWebdavBackup(env, { scope: body.scope, trigger: 'manual' });
    return createJsonResponse(result);
  } catch (error: unknown) {
    return createJsonResponse(
      { success: false, message: getErrorMessage(error, '备份失败') },
      getHttpStatus(error, 500),
    );
  }
}

export async function handleBackupExport(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return createErrorResponse('Method Not Allowed', 405);
  try {
    const rawBody = await readJsonWithLimit(request, JSON_BODY_LIMITS.large).catch((e: unknown) => {
      if (isRecord(e) && e.status === 413) throw e;
      return {};
    });
    const body = isRecord(rawBody) ? rawBody : {};
    const payload = await buildBackupPayload(env, {
      scope: body.scope,
      trigger: 'local-export',
    });
    return createJsonResponse({ success: true, exportData: payload });
  } catch (error: unknown) {
    return createJsonResponse(
      { success: false, message: getErrorMessage(error, '导出失败') },
      getHttpStatus(error, 500),
    );
  }
}

export async function handleBackupRestore(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return createErrorResponse('Method Not Allowed', 405);
  try {
    const rawBody = (await readJsonWithLimit(request, JSON_BODY_LIMITS.large)) as unknown;
    const body = isRecord(rawBody) ? rawBody : {};
    const payload = body?.payload || body?.backup || rawBody;
    const result = await restoreBackupPayload(env, payload, { scope: body?.scope });
    return createJsonResponse(result);
  } catch (error: unknown) {
    return createJsonResponse(
      { success: false, message: getErrorMessage(error, '恢复失败') },
      getHttpStatus(error, 400),
    );
  }
}

export async function listWebdavBackupFiles(env: Env): Promise<Array<{ path: string; name: string | undefined }>> {
  const { storageAdapter } = await getStorage(env);
  const loaded = await storageAdapter.get<Record<string, unknown>>(STORAGE_KEY_SETTINGS);
  const settings = isRecord(loaded) ? loaded : {};
  const config = normalizeWebdavConfig(settings);
  const remoteDir = String(config.remotePath || '/MiSub').replace(/\/+$/, '');
  const response = await webdavFetch(config, remoteDir || '/', {
    method: 'PROPFIND',
    headers: { Depth: '1' },
  });
  if (!response.ok) throw new Error(`列出 WebDAV 备份失败: HTTP ${response.status}`);

  const xml = await response.text();
  const hrefs = Array.from(xml.matchAll(/<[^:>]*:?href[^>]*>([^<]+)<\/[^:>]*:?href>/gi))
    .map((match) => normalizeWebdavHref(config.endpoint, match[1]))
    .filter((href): href is string => typeof href === 'string' && href.length > 0);
  const files = hrefs
    .filter((href) => href.endsWith('.json') && href.includes(BACKUP_FILENAME_PREFIX))
    .map((href) => ({
      path: href,
      name: href.split('/').filter(Boolean).pop(),
    }))
    .sort((a, b) => String(b.name).localeCompare(String(a.name)));

  return files;
}

export async function handleWebdavBackupList(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return createErrorResponse('Method Not Allowed', 405);
  try {
    const files = await listWebdavBackupFiles(env);
    return createJsonResponse({ success: true, data: files });
  } catch (error: unknown) {
    return createJsonResponse(
      { success: false, message: getErrorMessage(error, '获取备份列表失败'), data: [] },
      400,
    );
  }
}

export async function fetchWebdavBackupFile(env: Env, filePath: string): Promise<unknown> {
  const { storageAdapter } = await getStorage(env);
  const loaded = await storageAdapter.get<Record<string, unknown>>(STORAGE_KEY_SETTINGS);
  const settings = isRecord(loaded) ? loaded : {};
  const config = normalizeWebdavConfig(settings);
  const response = await webdavFetch(config, filePath, { method: 'GET' });
  if (!response.ok) throw new Error(`读取 WebDAV 备份失败: HTTP ${response.status}`);
  return response.json();
}

export async function handleWebdavRestore(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return createErrorResponse('Method Not Allowed', 405);
  try {
    const rawBody = (await readJsonWithLimit(request, JSON_BODY_LIMITS.large)) as unknown;
    const body = isRecord(rawBody) ? rawBody : {};
    const payload =
      body.payload ||
      (typeof body.file === 'string' && body.file ? await fetchWebdavBackupFile(env, body.file) : null);
    const result = await restoreBackupPayload(env, payload, { scope: body.scope });
    return createJsonResponse(result);
  } catch (error: unknown) {
    return createJsonResponse(
      { success: false, message: getErrorMessage(error, '恢复失败') },
      getHttpStatus(error, 400),
    );
  }
}
