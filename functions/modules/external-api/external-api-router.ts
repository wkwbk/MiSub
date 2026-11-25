import { Hono } from 'hono';
import {
  ExternalManualNodeCreateSchema,
  ExternalManualNodeValidateSchema,
  ExternalProfileCreateSchema,
  ExternalSubscriptionCreateSchema,
  PaginationQuerySchema,
} from '@misub/core/schemas';
import type { Env, HonoEnv } from '../../types.js';
import { ensureStandardRequest } from '../../middleware/request-context-store.js';
import { externalApiAuthMiddleware, zodJsonValidator, zodQueryValidator } from '../../middleware/hono-middlewares.js';
import { createExternalError, isRecord } from './external-api-utils.js';
import { handleExternalSubscriptionsRequest } from './external-subscriptions-handler.js';
import { handleExternalManualNodesRequest } from './external-manual-nodes-handler.js';
import { handleExternalProfilesRequest } from './external-profiles-handler.js';
import { handleExternalPreviewRequest } from './external-preview-handler.js';

interface ValidationIssueLike {
  message?: string;
}

interface ValidationErrorLike {
  issues: ReadonlyArray<ValidationIssueLike>;
}

interface ErrorWithHttpInfo {
  code?: string;
  message?: string;
  status?: number;
}

function decodeRouteParam(value: string | undefined): string {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return value || '';
  }
}

function readRawField(raw: unknown, key: string): string {
  if (!isRecord(raw)) return '';
  return String(raw[key] || '').trim();
}

function extractHttpErrorInfo(error: unknown): ErrorWithHttpInfo {
  if (typeof error !== 'object' || error === null) {
    return {};
  }
  const obj = error as Record<string, unknown>;
  return {
    code: typeof obj.code === 'string' ? obj.code : undefined,
    message: typeof obj.message === 'string' ? obj.message : undefined,
    status: typeof obj.status === 'number' ? obj.status : undefined,
  };
}

function externalParseErrorResponse(error: Error & { status?: number; code?: string }): Response {
  const info = extractHttpErrorInfo(error);
  return createExternalError(info.code || 'invalid_json', info.message || 'Invalid JSON', info.status || 400);
}

/**
 * 构建对外 API (/api/ext/v1/*) Hono 路由实例
 */
function createExternalApiRouter(): Hono<HonoEnv> {
  const externalApp = new Hono<HonoEnv>();

  externalApp.use('*', externalApiAuthMiddleware);

  // --- Subscriptions ---
  externalApp.get(
    '/subscriptions',
    zodQueryValidator(PaginationQuerySchema.partial(), (error: ValidationErrorLike) =>
      createExternalError('invalid_query', error.issues[0]?.message || 'Invalid pagination query', 400),
    ),
    (c) => handleExternalSubscriptionsRequest(c.req.raw, c.env),
  );
  externalApp.post(
    '/subscriptions',
    zodJsonValidator(ExternalSubscriptionCreateSchema, {
      onParseError: externalParseErrorResponse,
      onValidationError: (_error: ValidationErrorLike, raw: unknown) => {
        if (!readRawField(raw, 'url')) {
          return createExternalError('subscription_url_required', 'Subscription URL is required', 400);
        }
        return createExternalError('invalid_subscription_url', 'Subscription URL must use http or https', 400);
      },
    }),
    (c) => handleExternalSubscriptionsRequest(c.req.raw, c.env),
  );
  externalApp.all('/subscriptions', () => createExternalError('method_not_allowed', 'Method Not Allowed', 405));

  externalApp.all('/subscriptions/validate', (c) =>
    handleExternalSubscriptionsRequest(c.req.raw, c.env, { action: 'validate' }),
  );
  externalApp.all('/subscriptions/batch-refresh', (c) =>
    handleExternalSubscriptionsRequest(c.req.raw, c.env, { action: 'batch_refresh' }),
  );
  externalApp.all('/subscriptions/:id/refresh', (c) =>
    handleExternalSubscriptionsRequest(c.req.raw, c.env, {
      id: decodeRouteParam(c.req.param('id')),
      action: 'refresh',
    }),
  );
  externalApp.all('/subscriptions/:id', (c) =>
    handleExternalSubscriptionsRequest(c.req.raw, c.env, decodeRouteParam(c.req.param('id'))),
  );

  // --- Manual Nodes ---
  externalApp.get(
    '/manual-nodes',
    zodQueryValidator(PaginationQuerySchema.partial(), (error: ValidationErrorLike) =>
      createExternalError('invalid_query', error.issues[0]?.message || 'Invalid pagination query', 400),
    ),
    (c) => handleExternalManualNodesRequest(c.req.raw, c.env),
  );
  externalApp.post(
    '/manual-nodes',
    zodJsonValidator(ExternalManualNodeCreateSchema, {
      onParseError: externalParseErrorResponse,
      onValidationError: (_error: ValidationErrorLike, raw: unknown) => {
        if (!readRawField(raw, 'name')) {
          return createExternalError('manual_node_name_required', 'Manual node name is required', 400);
        }
        if (!readRawField(raw, 'url')) {
          return createExternalError('manual_node_url_required', 'Manual node URL is required', 400);
        }
        return createExternalError(
          'invalid_manual_node_url',
          'Manual node URL must use a supported node protocol',
          400,
        );
      },
    }),
    (c) => handleExternalManualNodesRequest(c.req.raw, c.env),
  );
  externalApp.all('/manual-nodes', () => createExternalError('method_not_allowed', 'Method Not Allowed', 405));

  externalApp.post(
    '/manual-nodes/validate',
    zodJsonValidator(ExternalManualNodeValidateSchema, {
      onParseError: externalParseErrorResponse,
      onValidationError: (_error: ValidationErrorLike, raw: unknown) => {
        if (!readRawField(raw, 'url')) {
          return createExternalError('manual_node_url_required', 'Manual node URL is required', 400);
        }
        return createExternalError(
          'invalid_manual_node_url',
          'Manual node URL must use a supported node protocol',
          400,
        );
      },
    }),
    (c) => handleExternalManualNodesRequest(c.req.raw, c.env, { action: 'validate' }),
  );
  externalApp.all('/manual-nodes/validate', () => createExternalError('method_not_allowed', 'Method Not Allowed', 405));

  externalApp.all('/manual-nodes/:id', (c) =>
    handleExternalManualNodesRequest(c.req.raw, c.env, decodeRouteParam(c.req.param('id'))),
  );

  // --- Profiles ---
  externalApp.get(
    '/profiles',
    zodQueryValidator(PaginationQuerySchema.partial(), (error: ValidationErrorLike) =>
      createExternalError('invalid_query', error.issues[0]?.message || 'Invalid pagination query', 400),
    ),
    (c) => handleExternalProfilesRequest(c.req.raw, c.env, {}),
  );
  externalApp.post(
    '/profiles',
    zodJsonValidator(ExternalProfileCreateSchema, {
      onParseError: externalParseErrorResponse,
      onValidationError: (_error: ValidationErrorLike, raw: unknown) => {
        if (!readRawField(raw, 'name')) {
          return createExternalError('profile_name_required', 'Profile name is required', 400);
        }
        return createExternalError('invalid_profile', 'Invalid profile payload', 400);
      },
    }),
    (c) => handleExternalProfilesRequest(c.req.raw, c.env, {}),
  );
  externalApp.all('/profiles', () => createExternalError('method_not_allowed', 'Method Not Allowed', 405));

  externalApp.post('/profiles/:id/preview', (c) =>
    handleExternalPreviewRequest(c.req.raw, c.env, decodeRouteParam(c.req.param('id'))),
  );
  externalApp.all('/profiles/:id/preview', () => createExternalError('method_not_allowed', 'Method Not Allowed', 405));

  externalApp.all('/profiles/:id/refresh', (c) =>
    handleExternalProfilesRequest(c.req.raw, c.env, {
      id: decodeRouteParam(c.req.param('id')),
      action: 'refresh',
    }),
  );
  externalApp.all('/profiles/:id/subscriptions', (c) =>
    handleExternalProfilesRequest(c.req.raw, c.env, {
      id: decodeRouteParam(c.req.param('id')),
      relation: 'subscriptions',
    }),
  );
  externalApp.all('/profiles/:id/manual-nodes', (c) =>
    handleExternalProfilesRequest(c.req.raw, c.env, {
      id: decodeRouteParam(c.req.param('id')),
      relation: 'manual-nodes',
    }),
  );
  externalApp.all('/profiles/:id', (c) =>
    handleExternalProfilesRequest(c.req.raw, c.env, {
      id: decodeRouteParam(c.req.param('id')),
    }),
  );

  externalApp.notFound(() => createExternalError('not_found', 'Not Found', 404));
  externalApp.onError((err) => {
    const info = extractHttpErrorInfo(err);
    return createExternalError(
      info.code || 'internal_error',
      info.message || 'Internal Server Error',
      info.status || 500,
    );
  });

  return externalApp;
}

const externalApiApp = createExternalApiRouter();

function buildNormalizedExternalRequest(request: Request): Request {
  const stdReq = ensureStandardRequest(request);
  const url = new URL(stdReq.url);
  let targetPath = url.pathname.startsWith('/api/ext/v1') ? url.pathname.slice('/api/ext/v1'.length) : url.pathname;
  targetPath = targetPath.replace(/\/+$/, '') || '/';

  if (url.pathname === targetPath) {
    return stdReq;
  }

  url.pathname = targetPath;
  const init: RequestInit & { duplex?: 'half' } = {
    method: stdReq.method,
    headers: stdReq.headers,
  };
  if (stdReq.method !== 'GET' && stdReq.method !== 'HEAD' && stdReq.body !== null) {
    init.body = stdReq.body;
    init.duplex = 'half';
  }
  return new Request(url.toString(), init);
}

export async function handleExternalApiRequest(request: Request, env: Env): Promise<Response> {
  const normalizedRequest = buildNormalizedExternalRequest(request);
  return await externalApiApp.fetch(normalizedRequest, env);
}
