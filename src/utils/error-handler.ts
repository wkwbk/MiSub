/**
 * 全局错误处理工具类
 * @author MiSub Team
 */

import { t } from '@/i18n/index.js';
import { isChunkLoadError } from '@/utils/chunk-reload.js';
import { isNetworkErrorMessage } from '@/utils/network-error.js';

type ErrorToastType = 'info' | 'success' | 'warning' | 'error';

export type ToastHandler = (message: string, type?: ErrorToastType, duration?: number) => void;

export interface ErrorMonitoringOptions {
  endpoint?: string | null;
  headers?: Record<string, string> | null;
}

export interface ErrorInfo {
  timestamp: string;
  message: string;
  stack?: string;
  context: string;
  additionalData: Record<string, unknown>;
  count: number;
  key: string;
}

interface StoredErrorInfo extends Omit<ErrorInfo, 'timestamp'> {
  timestamp: number;
}

declare global {
  interface Window {
    __MISUB_ERROR_REPORT_URL__?: string;
    showToast?: ToastHandler;
    errorHandler?: ErrorHandler;
  }
}

let toastHandler: ToastHandler | null = null;
let monitoringEndpoint: string | null = null;
let monitoringHeaders: Record<string, string> | null = null;

function resolveMonitoringEndpoint(): string | null {
  if (typeof window !== 'undefined' && window.__MISUB_ERROR_REPORT_URL__) {
    return window.__MISUB_ERROR_REPORT_URL__;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (import.meta.env.VITE_ERROR_REPORT_URL as string | undefined) || null;
  }
  return null;
}

monitoringEndpoint = resolveMonitoringEndpoint();

export function setToastHandler(handler: ToastHandler | null | undefined): void {
  toastHandler = typeof handler === 'function' ? handler : null;
}

export function configureErrorMonitoring({ endpoint, headers }: ErrorMonitoringOptions = {}): void {
  if (endpoint !== undefined) {
    monitoringEndpoint = endpoint || null;
  }
  if (headers !== undefined) {
    monitoringHeaders = headers || null;
  }
}

/**
 * 从未知异常对象中安全提取可读的错误消息。
 */
export function extractErrorMessage(error: unknown, fallback = ''): string {
  if (error instanceof Error) {
    if (error.message) return error.message;
    const errWithData = error as { data?: { error?: unknown; message?: unknown } };
    if (typeof errWithData.data?.error === 'string' && errWithData.data.error) {
      return errWithData.data.error;
    }
    if (typeof errWithData.data?.message === 'string' && errWithData.data.message) {
      return errWithData.data.message;
    }
    return fallback;
  }

  if (typeof error === 'string') {
    return error || fallback;
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : null;
    if (data) {
      if (typeof data.error === 'string' && data.error) return data.error;
      if (typeof data.message === 'string' && data.message) return data.message;
    }
    if (typeof record.message === 'string' && record.message) return record.message;
    if (typeof record.error === 'string' && record.error) return record.error;
    return fallback;
  }

  if (error !== null && error !== undefined) {
    const text = String(error);
    if (text && text !== '[object Object]') {
      return text;
    }
  }

  return fallback;
}

function normalizeErrorPayload(error: unknown): { message: string; stack?: string } {
  const unknownFallback = t('errors.unknown');
  if (error instanceof Error) {
    return {
      message: extractErrorMessage(error, unknownFallback),
      stack: error.stack,
    };
  }
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const extracted = extractErrorMessage(error);
    return {
      message: extracted || String(error),
      stack: typeof record.stack === 'string' ? record.stack : undefined,
    };
  }
  return {
    message: typeof error === 'string' && error ? error : unknownFallback,
  };
}

class ErrorHandler {
  errorCounts: Map<string, number>;
  lastErrors: Map<string, StoredErrorInfo>;
  errorResetTime: number;

  constructor() {
    this.errorCounts = new Map();
    this.lastErrors = new Map();
    this.errorResetTime = 60000; // 1 分钟
  }

  /**
   * 处理并记录错误
   */
  handleError(
    error: unknown,
    context = '',
    additionalData: Record<string, unknown> = {},
  ): ErrorInfo {
    const normalized = normalizeErrorPayload(error);
    const errorKey = this.getErrorKey(normalized, context);

    // 更新错误计数
    this.updateErrorCount(errorKey);

    // 构建错误信息
    const errorInfo: ErrorInfo = {
      timestamp: new Date().toISOString(),
      message: normalized.message,
      stack: normalized.stack,
      context,
      additionalData,
      count: this.errorCounts.get(errorKey) || 1,
      key: errorKey,
    };

    // 记录错误
    console.error(`[${context || 'Global Error'}] ${normalized.message}`, {
      ...errorInfo,
      stack: normalized.stack,
    });

    // 保存最近的错误
    this.lastErrors.set(errorKey, {
      ...errorInfo,
      timestamp: Date.now(),
    });

    // 清理过期的错误记录
    this.cleanupOldErrors();

    // 根据错误频率决定是否显示用户通知
    if (this.shouldShowUserNotification(errorKey)) {
      this.showUserNotification(errorInfo);
    }

    // 在生产环境中发送到错误监控服务
    if (!import.meta.env.DEV && this.shouldSendToMonitoring(errorInfo)) {
      void this.sendToMonitoringService(errorInfo);
    }

    return errorInfo;
  }

  /**
   * 生成错误的唯一键
   */
  getErrorKey(error: { message?: string; stack?: string }, context: string): string {
    const message = error.message || t('errors.unknown');
    const stack = error.stack?.split('\n')[0] || '';
    return `${context}:${message}:${stack}`.substring(0, 100);
  }

  /**
   * 更新错误计数
   */
  updateErrorCount(errorKey: string): void {
    const current = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, current + 1);
  }

  /**
   * 清理过期的错误记录
   */
  cleanupOldErrors(): void {
    const now = Date.now();
    for (const [key, error] of this.lastErrors.entries()) {
      if (now - error.timestamp > this.errorResetTime) {
        this.errorCounts.delete(key);
        this.lastErrors.delete(key);
      }
    }
  }

  /**
   * 判断是否应该显示用户通知
   */
  shouldShowUserNotification(errorKey: string): boolean {
    const count = this.errorCounts.get(errorKey) || 0;

    // 第一次错误或错误次数是 5 的倍数时显示
    return count === 1 || count % 5 === 0;
  }

  /**
   * 判断是否应该发送到监控服务
   */
  shouldSendToMonitoring(errorInfo: ErrorInfo): boolean {
    // 仅发送关键错误或高频错误
    return errorInfo.count >= 3 || errorInfo.context?.includes('critical') || errorInfo.message?.includes('network');
  }

  /**
   * 显示用户通知
   */
  showUserNotification(errorInfo: ErrorInfo): void {
    const handler = toastHandler || (typeof window !== 'undefined' ? window.showToast : null);
    if (!handler) return;

    let message = this.getUserFriendlyMessage(errorInfo);

    if (errorInfo.count > 1) {
      message += ` (${t('errors.occurredCount', { count: errorInfo.count })})`;
    }

    handler(message, 'error', 5000);
  }

  /**
   * 获取用户友好的错误消息
   *
   * 文案统一走 i18n（`errors.*`）：这个函数是全局兜底提示的出口，
   * 原先硬编码中文会让英文界面下的所有错误提示都变成中文。
   */
  getUserFriendlyMessage(errorInfo: ErrorInfo): string {
    const { message, context } = errorInfo;

    if (message.includes('timeout')) {
      return t('errors.timeout');
    }
    if (message.includes('Resource load failed')) {
      const failedSrc = typeof errorInfo.additionalData?.src === 'string' ? errorInfo.additionalData.src : '';
      const fileName = failedSrc.split('/').pop() || 'unknown';
      if (typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)) {
        return t('errors.resourceLoadIntercepted', { fileName });
      }
      // 走到这里说明自动清缓存重载已经试过一次且仍然失败，
      // 所以提示「强制刷新」而不是普通刷新（普通刷新会命中同一份缓存）。
      return t('errors.resourceLoad', { fileName });
    }
    // 必须排在 network 判断之前：动态 chunk 加载失败的消息里含 "fetch"
    // （Failed to fetch dynamically imported module），会被下面的 network 分支
    // 误判成网络问题，让用户去检查网络 —— 而真实原因是发版后旧页面请求了
    // 已删除的资源，检查网络永远解决不了。判定复用 chunk-reload 的谓词，
    // 避免两处模式匹配漂移。
    if (isChunkLoadError(message)) {
      return t('errors.chunkLoadFailed');
    }
    if (isNetworkErrorMessage(message)) {
      return t('errors.network');
    }
    if (message.includes('Unauthorized') || message.includes('401')) {
      return t('errors.unauthorized');
    }
    if (/MISUB_DB|D1\s*(?:未)?绑定|D1 database not available/i.test(message)) {
      return t('errors.d1Missing');
    }
    // 这两种语言的措辞都要认：message 既可能来自服务端（中文），
    // 也可能是客户端 `throw new Error(t('store.saveFailed'))` 抛出的本地化文案。
    // 只认中文的话，英文界面下这条分支永远不命中，用户看到的是通用提示 ——
    // 分类随界面语言漂移。tests/unit/error-message-i18n-collision.test.js
    // 会断言同一个 key 的中英版本落在同一分支。
    if (/storage|保存失败|save failed/i.test(message)) {
      return t('errors.saveFailed');
    }
    if (context?.includes('subscription')) {
      return t('errors.subscriptionFailed');
    }
    if (context?.includes('batch')) {
      return t('errors.batchFailed');
    }

    return t('errors.generic');
  }

  /**
   * 发送错误到监控服务
   */
  async sendToMonitoringService(errorInfo: ErrorInfo): Promise<void> {
    try {
      const endpoint = monitoringEndpoint || resolveMonitoringEndpoint();
      if (!endpoint) return;

      const payload = {
        ...errorInfo,
        url: typeof window !== 'undefined' ? window.location.href : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        timestamp: errorInfo.timestamp || new Date().toISOString(),
      };
      const body = JSON.stringify(payload);

      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(endpoint, blob);
        return;
      }

      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...monitoringHeaders },
        body,
        keepalive: true,
      });
    } catch (e) {
      // 监控服务失败，避免无限递归
      console.warn('[Error Monitoring Failed]', e);
    }
  }

  /**
   * 获取错误统计信息
   */
  getErrorStats(): {
    totalErrors: number;
    uniqueErrors: number;
    recentErrors: StoredErrorInfo[];
  } {
    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
      uniqueErrors: this.errorCounts.size,
      recentErrors: Array.from(this.lastErrors.values()),
    };
  }

  /**
   * 重置错误统计
   */
  reset(): void {
    this.errorCounts.clear();
    this.lastErrors.clear();
  }
}

const globalErrorHandler = new ErrorHandler();

export { ErrorHandler };

export const handleError = (
  error: unknown,
  context?: string,
  data?: Record<string, unknown>,
): ErrorInfo => {
  return globalErrorHandler.handleError(error, context, data);
};

if (typeof window !== 'undefined') {
  window.errorHandler = globalErrorHandler;
}
