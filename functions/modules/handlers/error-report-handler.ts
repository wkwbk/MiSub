/**
 * 错误上报处理器
 * 接收前端错误上报并写入 D1 error_reports 表
 */

import type { Env, ErrorReportEntry, StorageAdapter } from '../../types.js';
import { StorageFactory } from '../../storage-adapter.js';
import { createErrorResponse, createJsonResponse, JSON_BODY_LIMITS, readJsonWithLimit } from '../utils.js';

const MAX_REPORT_ENTRIES = 100;
const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 2000;
const MAX_ADDITIONAL_LENGTH = 2000;
const ERROR_REPORT_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_PERSISTED_REPORTS_PER_MINUTE = 6;

const recentReportFingerprints = new Map<string, number>();
let persistedReportTimestamps: number[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function getStorageAdapter(env: Env): Promise<StorageAdapter> {
  return StorageFactory.createAdapter(env) as unknown as StorageAdapter;
}

function safeString(value: unknown, limit: number): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return text.length > limit ? text.slice(0, limit) : text;
}

function safeAdditionalData(value: unknown): unknown {
  if (!value) return null;
  try {
    const json = JSON.stringify(value);
    if (json.length > MAX_ADDITIONAL_LENGTH) return null;
    return value;
  } catch {
    return null;
  }
}

function cleanupReportBudgets(now = Date.now()): void {
  persistedReportTimestamps = persistedReportTimestamps.filter((ts) => now - ts < 60 * 1000);
  for (const [fingerprint, expiresAt] of recentReportFingerprints.entries()) {
    if (expiresAt <= now) {
      recentReportFingerprints.delete(fingerprint);
    }
  }
}

function buildReportFingerprint(body: Record<string, unknown>, request: Request): string {
  const message = safeString(body?.message, 160);
  const context = safeString(body?.context, 120);
  const url = safeString(body?.url, 200);
  const origin = safeString(request.headers.get('Origin'), 120);
  return `${context}|${message}|${url}|${origin}`;
}

function shouldPersistReport(body: Record<string, unknown>, request: Request): boolean {
  const now = Date.now();
  cleanupReportBudgets(now);

  const fingerprint = buildReportFingerprint(body, request);
  const fingerprintExpiresAt = recentReportFingerprints.get(fingerprint) || 0;
  if (fingerprintExpiresAt > now) {
    return false;
  }

  if (persistedReportTimestamps.length >= MAX_PERSISTED_REPORTS_PER_MINUTE) {
    return false;
  }

  recentReportFingerprints.set(fingerprint, now + ERROR_REPORT_COOLDOWN_MS);
  persistedReportTimestamps.push(now);
  return true;
}

export async function handleErrorReportRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method Not Allowed', 405);
  }

  // 无可用存储时静默成功（不阻塞前端）
  const storageAdapter = await getStorageAdapter(env);
  if (!storageAdapter || storageAdapter.type === 'noop') {
    return createJsonResponse({ success: true });
  }

  try {
    const rawBody = (await readJsonWithLimit(request, JSON_BODY_LIMITS.small)) as unknown;
    const body = isRecord(rawBody) ? rawBody : {};
    if (!shouldPersistReport(body, request)) {
      return createJsonResponse({ success: true, skipped: true });
    }

    const report: ErrorReportEntry = {
      id: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
      message: safeString(body?.message, MAX_MESSAGE_LENGTH) || 'Unknown error',
      context: safeString(body?.context, 200),
      stack: safeString(body?.stack, MAX_STACK_LENGTH),
      url: safeString(body?.url, 500),
      userAgent: safeString(body?.userAgent, 300),
      additionalData: safeAdditionalData(body?.additionalData),
      origin: safeString(request.headers.get('Origin'), 200),
      ip: safeString(
        request.headers.get('CF-Connecting-IP') ||
          request.headers.get('X-Real-IP') ||
          request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim(),
        100,
      ),
    };

    if (typeof storageAdapter.insertErrorReport === 'function') {
      await storageAdapter.insertErrorReport(report, MAX_REPORT_ENTRIES);
    }

    return createJsonResponse({ success: true });
  } catch (error: unknown) {
    console.error('[ErrorReport] Failed to save report:', error);
    const status =
      isRecord(error) && typeof error.status === 'number' ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Failed to save error report';
    return createErrorResponse(status === 413 ? message : 'Failed to save error report', status);
  }
}
