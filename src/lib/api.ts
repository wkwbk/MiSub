import type {
  ParseSubscriptionResponse,
  ProfileConfig,
  SubscriptionItem,
  SubscriptionUserInfo,
  WebdavBackupConfig,
  WebdavRemoteFile,
} from '@misub/core/types.js';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';
import { api, APIError } from '@/lib/http.js';
import { t } from '@/i18n/index.js';
import { extractErrorMessage } from '@/utils/error-handler.js';

export type ApiErrorType = 'auth' | 'server' | 'timeout' | 'network' | 'validation' | 'unknown';

export interface ApiFailureResult {
  success: false;
  error: string;
  message?: string;
  errorType: ApiErrorType | string;
  status?: number | null;
  code?: string;
  data?: unknown;
}

export interface ApiSuccessResult<T = Record<string, unknown>> {
  success: true;
  data: T;
}

export type ApiResult<T = Record<string, unknown>> = ApiSuccessResult<T> | ApiFailureResult;

export interface NodeCountPayload {
  count?: number;
  userInfo?: SubscriptionUserInfo;
  [key: string]: unknown;
}

export interface CreateShortLinkParams {
  url: string;
  slug?: string;
  profileId?: string;
  saveToProfile?: boolean;
}

export interface ShortLinkResult {
  success?: boolean;
  shortUrl?: string;
  savedToProfile?: boolean;
  profile?: ProfileConfig;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

export interface ConnectionTestResult {
  success?: boolean;
  available?: boolean;
  message?: string;
  error?: string;
  endpoint?: string;
  elapsedMs?: number;
  [key: string]: unknown;
}

export interface WebdavActionResponse {
  success?: boolean;
  message?: string;
  error?: string;
  timestamp?: string;
  file?: string;
}

export interface WebdavRemoteListResponse {
  success?: boolean;
  data?: WebdavRemoteFile[];
  message?: string;
  error?: string;
}

export interface BackupExportResponse {
  success?: boolean;
  message?: string;
  exportData?: {
    scope?: string;
    [key: string]: unknown;
  };
}

export interface BackupRestoreResponse {
  success?: boolean;
  message?: string;
  error?: string;
}

export interface TelegramActionApiResponse {
  success?: boolean;
  message?: string;
  error?: string;
  detail?: unknown;
  webhook?: {
    skipped?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface RotateTokenResponse {
  success?: boolean;
  message?: string;
  data?: {
    myToken?: string;
    rotatedAt?: string;
    notified?: boolean;
  };
}

export interface GuestbookManageItem {
  id: string;
  status: string;
  reply?: string;
  replyAt?: string | null;
  nickname?: string;
  content?: string;
  type?: string;
  isVisible?: boolean;
  createdAt?: string;
  [key: string]: unknown;
}

export interface GuestbookListResponse {
  success?: boolean;
  data?: GuestbookManageItem[];
  message?: string;
}

export interface GuestbookActionResponse {
  success?: boolean;
  data?: GuestbookManageItem;
  message?: string;
}

export interface FetchExternalApiResponse {
  success?: boolean;
  error?: string;
  content?: string;
}

export interface ReleaseMetaResponse {
  tag_name?: string;
  published_at?: string;
  [key: string]: unknown;
}

function isApiErrorInstance(error: unknown): error is APIError {
  return typeof APIError === 'function' && error instanceof APIError;
}

/**
 * 统一的 API 错误处理辅助函数
 * @param error - 错误对象
 * @param context - 错误上下文
 * @returns 标准错误响应
 */
function handleApiError(error: unknown, context = ''): ApiFailureResult {
  console.error(`[API Error - ${context}]`, error);

  let errorType: ApiErrorType = 'unknown';
  let errorMessage = t('subscriptions.unknownError');
  let status: number | null = null;

  if (isApiErrorInstance(error)) {
    status = error.status;
    if (error.status === 401) {
      errorType = 'auth';
      errorMessage = t('settings.authFailedRelogin');
    } else {
      errorType = 'server';
      const message = error.message || `HTTP ${error.status}`;
      errorMessage = formatHttpErrorMessage(error.status, message);
    }
  } else if (error instanceof Error) {
    if (error.name === 'AbortError') {
      errorType = 'timeout';
      errorMessage = t('settings.requestTimeout');
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorType = 'network';
      errorMessage = t('settings.networkFailedGeneric');
    } else if (error.message === 'UNAUTHORIZED') {
      errorType = 'auth';
      errorMessage = t('settings.authFailedRelogin');
    } else if (error.message.includes('HTTP')) {
      errorType = 'server';
      errorMessage = error.message;
    } else if (error.name === 'SyntaxError') {
      errorType = 'server';
      errorMessage = t('settings.serverResponseInvalid');
    } else {
      errorMessage = error.message || t('settings.operationFailed');
    }
  } else if (typeof error === 'string' && error) {
    errorMessage = error;
  } else {
    errorMessage = t('settings.operationFailed');
  }

  return {
    success: false,
    error: errorMessage,
    errorType,
    status,
  };
}

function extractHttpStatus(message = ''): number | null {
  const match = String(message).match(/HTTP\s+(\d{3})/i);
  return match ? Number(match[1]) : null;
}

function formatHttpErrorMessage(status: number | null | undefined, message = ''): string {
  const normalizedMessage = String(message || '').trim();
  if (!status) return normalizedMessage;
  if (new RegExp(`^HTTP\\s+${status}\\b`, 'i').test(normalizedMessage)) {
    return normalizedMessage;
  }
  return `HTTP ${status}: ${normalizedMessage || `HTTP ${status}`}`;
}

function normalizeApiFailure(
  data: Record<string, unknown> | null | undefined,
  fallbackMessage = t('settings.operationFailed'),
): ApiFailureResult {
  const rawError = data?.error;
  const rawMessage = data?.message;
  const error =
    (typeof rawError === 'string' && rawError) ||
    (typeof rawMessage === 'string' && rawMessage) ||
    fallbackMessage;
  const rawStatus = data?.status;
  const status = typeof rawStatus === 'number' ? rawStatus : extractHttpStatus(error);
  const rawErrorType = data?.errorType;
  const errorType =
    typeof rawErrorType === 'string' && rawErrorType ? rawErrorType : status ? 'server' : 'unknown';

  return {
    success: false,
    error,
    errorType,
    status,
    data,
  };
}

export async function fetchInitialData(): Promise<ApiResult<Record<string, unknown>>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超时

    const data = await api.get<Record<string, unknown>>(API_ENDPOINTS.DATA, { signal: controller.signal });

    // 检查新的认证状态响应 (200 OK with authenticated: false)
    if (data && data.authenticated === false) {
      return { success: false, error: t('settings.authFailedRelogin'), errorType: 'auth' };
    }

    return { success: true, data };
  } catch (error) {
    return handleApiError(error, 'fetchInitialData');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function login(
  password: string,
  turnstileToken = '',
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const payload: { password: string; turnstileToken?: string } = { password };
    if (turnstileToken) {
      payload.turnstileToken = turnstileToken;
    }
    const data = await api.post<Record<string, unknown>>(API_ENDPOINTS.LOGIN, payload);
    return { success: true, data };
  } catch (error) {
    if (isApiErrorInstance(error) && (error.status === 401 || error.status === 400)) {
      return {
        success: false,
        error:
          (typeof error.data?.message === 'string' && error.data.message) ||
          (typeof error.data?.error === 'string' && error.data.error) ||
          t('settings.loginFailed'),
        errorType: error.status === 401 ? 'auth' : 'validation',
        code: typeof error.data?.code === 'string' ? error.data.code : undefined,
      };
    }
    return handleApiError(error, 'login');
  }
}

export async function logoutSession(): Promise<void> {
  await api.get(API_ENDPOINTS.LOGOUT);
}

// [核心修改] saveMisubs 现在接收并发送 profiles
export async function fetchNodeCount(
  subUrl: string,
  fetchProxy = '',
  plusAsSpace = false,
  userAgent = '',
  options: { subscriptionId?: string; persist?: boolean } = {},
): Promise<ApiResult<NodeCountPayload>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

    const payload: {
      url: string;
      fetchProxy?: string;
      plusAsSpace?: boolean;
      userAgent?: string;
      subscriptionId?: string;
      persist?: boolean;
    } = { url: subUrl };
    if (options.subscriptionId) {
      payload.subscriptionId = options.subscriptionId;
    }
    if (typeof options.persist === 'boolean') {
      payload.persist = options.persist;
    }
    if (fetchProxy) {
      payload.fetchProxy = fetchProxy;
    }
    if (plusAsSpace) {
      payload.plusAsSpace = true;
    }
    if (userAgent) {
      payload.userAgent = userAgent;
    }

    const data = await api.post<Record<string, unknown>>(API_ENDPOINTS.NODE_COUNT, payload, {
      signal: controller.signal,
    });

    if (data?.success === false) {
      return normalizeApiFailure(data, t('settings.updateNodeInfoFailed'));
    }

    const unwrapped =
      data?.data && typeof data.data === 'object' ? (data.data as NodeCountPayload) : (data as NodeCountPayload);
    return { success: true, data: unwrapped }; // data 包含 { count, userInfo }
  } catch (error) {
    return handleApiError(error, 'fetchNodeCount');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchSettings(): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const data = await api.get<Record<string, unknown>>(`${API_ENDPOINTS.SETTINGS}?t=${Date.now()}`);
    return { success: true, data };
  } catch (error) {
    return handleApiError(error, 'fetchSettings');
  }
}

export async function fetchPublicConfig(): Promise<ApiResult<Record<string, unknown>>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 8000);
    const headers =
      typeof window !== 'undefined' && window.location?.pathname
        ? { 'X-MiSub-Path': window.location.pathname }
        : undefined;
    const data = await api.get<Record<string, unknown>>(API_ENDPOINTS.PUBLIC_CONFIG, {
      signal: controller.signal,
      headers,
    });
    return { success: true, data };
  } catch (error) {
    return handleApiError(error, 'fetchPublicConfig');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function saveSettings(
  settings: Record<string, unknown>,
): Promise<Record<string, unknown> | ApiFailureResult> {
  try {
    return await api.patch<Record<string, unknown>>(API_ENDPOINTS.SETTINGS, settings);
  } catch (error) {
    return handleApiError(error, 'saveSettings');
  }
}

/**
 * 恢复出厂设置（仅限设置项，不删除节点和订阅组）
 * @returns 重置结果
 */
export async function resetSettings(): Promise<Record<string, unknown> | ApiFailureResult> {
  try {
    return await api.post<Record<string, unknown>>(API_ENDPOINTS.SETTINGS_RESET, undefined);
  } catch (error) {
    return handleApiError(error, 'resetSettings');
  }
}

export async function rotateMyToken(): Promise<RotateTokenResponse> {
  return await api.post<RotateTokenResponse>(API_ENDPOINTS.SETTINGS_ROTATE_TOKEN, {});
}

/**
 * 批量更新订阅的节点信息
 * @param subscriptionIds - 要更新的订阅ID数组
 * @param subscriptions - 可选的订阅元数据（支持未保存或刚修改的订阅）
 * @returns 更新结果
 */
export async function batchUpdateNodes(
  subscriptionIds: string[],
  subscriptions: SubscriptionItem[] | Record<string, unknown>[] | null = null,
): Promise<Record<string, unknown> | ApiFailureResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 120000); // 120秒超时

    const payload: {
      subscriptionIds: string[];
      subscriptions?: SubscriptionItem[] | Record<string, unknown>[];
    } = { subscriptionIds };
    if (Array.isArray(subscriptions) && subscriptions.length > 0) {
      payload.subscriptions = subscriptions;
    }

    const result = await api.post<Record<string, unknown>>(API_ENDPOINTS.BATCH_UPDATE, payload, {
      signal: controller.signal,
    });

    if (result?.success === false) {
      return normalizeApiFailure(result, t('settings.batchUpdateFailed'));
    }

    return result;
  } catch (error) {
    return handleApiError(error, 'batchUpdateNodes');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchGithubLatestRelease(
  repo: string,
): Promise<ReleaseMetaResponse | ApiFailureResult> {
  try {
    return await api.get<ReleaseMetaResponse>(
      `${API_ENDPOINTS.GITHUB_RELEASE}?repo=${encodeURIComponent(repo)}`,
    );
  } catch (error) {
    return handleApiError(error, 'fetchGithubLatestRelease');
  }
}

export async function fetchAppStoreRelease(
  id: string,
  country: string,
): Promise<ReleaseMetaResponse | ApiFailureResult> {
  try {
    return await api.get<ReleaseMetaResponse>(
      `${API_ENDPOINTS.APPSTORE_RELEASE}?id=${encodeURIComponent(id)}&country=${encodeURIComponent(country)}`,
    );
  } catch (error) {
    return handleApiError(error, 'fetchAppStoreRelease');
  }
}

export async function testSubconverterBackend(
  backend: string,
  target = 'clash',
): Promise<ConnectionTestResult | ApiFailureResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 30000);
    const data = await api.post<ConnectionTestResult>(
      API_ENDPOINTS.SUBCONVERTER_TEST,
      { backend, target },
      { signal: controller.signal },
    );
    return data;
  } catch (error) {
    return handleApiError(error, 'testSubconverterBackend');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function testShortLinkConnection(
  shortLink: Record<string, unknown>,
): Promise<ShortLinkResult | ApiFailureResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 12000);
    const data = await api.post<ShortLinkResult>(
      API_ENDPOINTS.SHORTLINK_TEST,
      { shortLink },
      { signal: controller.signal },
    );
    return data;
  } catch (error) {
    return handleApiError(error, 'testShortLinkConnection');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function createShortLink({
  url,
  slug = '',
  profileId = '',
  saveToProfile = false,
}: CreateShortLinkParams): Promise<ShortLinkResult | ApiFailureResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 12000);
    const data = await api.post<ShortLinkResult>(
      API_ENDPOINTS.SHORTLINK_CREATE,
      { url, slug, profileId, saveToProfile },
      { signal: controller.signal },
    );
    return data;
  } catch (error) {
    return handleApiError(error, 'createShortLink');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function testWebdavConnection(webdavBackup: Partial<WebdavBackupConfig>): Promise<WebdavActionResponse> {
  return await api.post<WebdavActionResponse>(API_ENDPOINTS.BACKUP_WEBDAV_TEST, { webdavBackup });
}

export async function runWebdavBackup(scope: string): Promise<WebdavActionResponse> {
  return await api.post<WebdavActionResponse>(API_ENDPOINTS.BACKUP_WEBDAV_RUN, { scope });
}

export async function listWebdavBackups(): Promise<WebdavRemoteListResponse> {
  return await api.get<WebdavRemoteListResponse>(API_ENDPOINTS.BACKUP_WEBDAV_LIST);
}

export async function restoreWebdavBackup(file: string): Promise<WebdavActionResponse> {
  return await api.post<WebdavActionResponse>(API_ENDPOINTS.BACKUP_WEBDAV_RESTORE, { file });
}

export async function exportLocalBackup(scope: string): Promise<BackupExportResponse | null> {
  return await api.post<BackupExportResponse | null>(API_ENDPOINTS.BACKUP_EXPORT, { scope });
}

export async function restoreLocalBackup(payload: unknown, scope: string): Promise<BackupRestoreResponse | null> {
  return await api.post<BackupRestoreResponse | null>(API_ENDPOINTS.BACKUP_RESTORE, { payload, scope });
}

export async function testTelegramNotification(payload: {
  botToken?: string;
  chatId?: string;
}): Promise<TelegramActionApiResponse> {
  try {
    return await api.post<TelegramActionApiResponse>(API_ENDPOINTS.TEST_NOTIFICATION, payload);
  } catch (error) {
    if (isApiErrorInstance(error)) {
      return {
        success: false,
        error: extractErrorMessage(error, t('settings.telegramTestFailed')),
        detail: error.data?.detail ?? error.data,
      };
    }
    throw error;
  }
}

export async function setupTelegramPushBot(payload: {
  botToken: string;
  webhookSecret: string;
}): Promise<TelegramActionApiResponse> {
  try {
    return await api.post<TelegramActionApiResponse>(API_ENDPOINTS.TELEGRAM_SETUP, payload);
  } catch (error) {
    if (isApiErrorInstance(error)) {
      return {
        success: false,
        error: extractErrorMessage(error, t('settings.telegramSyncFailed')),
        detail: error.data ?? undefined,
      };
    }
    throw error;
  }
}

export async function submitPublicGuestbook(payload: {
  nickname: string;
  content: string;
  type: string;
  turnstileToken?: string;
}): Promise<{ success?: boolean; message?: string }> {
  return await api.post<{ success?: boolean; message?: string }>(API_ENDPOINTS.PUBLIC_GUESTBOOK, payload);
}

export async function fetchGuestbookMessages(): Promise<GuestbookListResponse> {
  return await api.get<GuestbookListResponse>(API_ENDPOINTS.GUESTBOOK_MANAGE);
}

export async function manageGuestbookMessage(payload: {
  action: string;
  id: string;
  replyContent?: string;
}): Promise<GuestbookActionResponse> {
  return await api.post<GuestbookActionResponse>(API_ENDPOINTS.GUESTBOOK_MANAGE, payload);
}

export async function parseSubscriptionContent(content: string): Promise<ParseSubscriptionResponse | null> {
  return await api.post<ParseSubscriptionResponse | null>(API_ENDPOINTS.PARSE_SUBSCRIPTION, { content });
}

export async function fetchExternalSubscriptionUrl(
  url: string,
  timeout = 15000,
  options: RequestInit = {},
): Promise<FetchExternalApiResponse> {
  return await api.post<FetchExternalApiResponse>(
    API_ENDPOINTS.FETCH_EXTERNAL,
    { url, timeout },
    options,
  );
}

export async function detectAirportName(url: string): Promise<{ name?: string; [key: string]: unknown }> {
  return await api.post<{ name?: string; [key: string]: unknown }>(API_ENDPOINTS.DETECT_AIRPORT_NAME, { url });
}

export async function fetchPublicResource<T = unknown>(endpoint: string): Promise<{
  success?: boolean;
  data?: T;
  message?: string;
}> {
  return await api.get<{ success?: boolean; data?: T; message?: string }>(endpoint);
}

export async function savePublicResource<T = unknown>(
  endpoint: string,
  payload: unknown,
): Promise<{
  success?: boolean;
  data?: T;
  message?: string;
}> {
  return await api.post<{ success?: boolean; data?: T; message?: string }>(endpoint, payload);
}

export async function initPublicResource<T = unknown>(endpoint: string): Promise<{
  success?: boolean;
  data?: T;
  message?: string;
}> {
  return await api.post<{ success?: boolean; data?: T; message?: string }>(`${endpoint}/init`);
}

export async function fetchNodePreview<T = Record<string, unknown>>(
  endpoint: string,
  payload: object,
): Promise<T> {
  return await api.post<T>(endpoint, payload);
}

export async function checkAdminSession(): Promise<void> {
  await api.get(API_ENDPOINTS.DATA);
}

export function isApiError(error: unknown): error is APIError {
  return isApiErrorInstance(error);
}

export function isUnauthorizedApiError(error: unknown): boolean {
  return isApiErrorInstance(error) && error.status === 401;
}
