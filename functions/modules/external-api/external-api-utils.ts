import type { Env, StorageAdapter } from '../../types.js';
import { StorageFactory } from '../../storage-adapter.js';
import { STORAGE_KEY_SETTINGS } from '../config.js';
import { createJsonResponse, generateId, JSON_BODY_LIMITS, readJsonWithLimit } from '../utils.js';

export { generateId };

export interface ExternalApiToken {
  name?: string;
  token?: string;
  [key: string]: unknown;
}

export interface ExternalApiSettings {
  enabled?: boolean;
  tokens?: ExternalApiToken[];
  [key: string]: unknown;
}

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  requestId: string;
  [key: string]: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function getExternalStorageAdapter(env: Env): Promise<StorageAdapter> {
  const maybeTestAdapter = env?.__TEST_STORAGE_ADAPTER;
  if (maybeTestAdapter && typeof maybeTestAdapter === 'object') {
    return maybeTestAdapter as StorageAdapter;
  }
  return StorageFactory.createAdapter(env) as unknown as StorageAdapter;
}

function createRequestId(): string {
  return `req_${generateId()}`;
}

export function createExternalSuccess(
  data: unknown,
  status = 200,
  meta?: Record<string, unknown>,
): Response {
  const body: Record<string, unknown> = { success: true, data };
  if (meta) body.meta = meta;
  return createJsonResponse(body, status);
}

export function createExternalError(
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
): Response {
  const error: Record<string, unknown> = { code, message };
  if (details !== undefined) error.details = details;
  return createJsonResponse({ success: false, error }, status);
}

export function parseBooleanParam(value: string | null | undefined): boolean | undefined {
  if (value == null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

export function parsePagination(url: URL): { page: number; pageSize: number } {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get('pageSize')) || 50));
  return { page, pageSize };
}

export function buildListMeta({ page, pageSize, total }: { page: number; pageSize: number; total: number }): ListMeta {
  return { page, pageSize, total, requestId: createRequestId() };
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export async function readExternalJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await readJsonWithLimit(request, JSON_BODY_LIMITS.normal);
    return isRecord(parsed) ? parsed : {};
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : 'Invalid JSON';
    const status =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number'
        ? (error as { status: number }).status
        : 400;
    throw Object.assign(new Error(message), {
      status,
      code: 'invalid_json',
    });
  }
}

export async function getExternalApiSettings(
  env: Env,
  storageAdapter: StorageAdapter | null = null,
): Promise<ExternalApiSettings> {
  const adapter = storageAdapter || (await getExternalStorageAdapter(env));
  const settings = await adapter.get<Record<string, unknown>>(STORAGE_KEY_SETTINGS);
  if (isRecord(settings) && isRecord(settings.externalApi)) {
    return settings.externalApi as ExternalApiSettings;
  }
  return {};
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

export function sortBySortIndex<T extends { sortIndex?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aIndex = Number(a?.sortIndex) || 0;
    const bIndex = Number(b?.sortIndex) || 0;
    return aIndex - bIndex;
  });
}
