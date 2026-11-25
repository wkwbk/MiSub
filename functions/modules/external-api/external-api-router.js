import { Hono } from 'hono';
import {
  ExternalManualNodeCreateSchema,
  ExternalManualNodeValidateSchema,
  ExternalProfileCreateSchema,
  ExternalSubscriptionCreateSchema,
  PaginationQuerySchema,
} from '@misub/core/schemas';
import { ensureStandardRequest } from '../../middleware/request-context-store.js';
import { externalApiAuthMiddleware, zodJsonValidator, zodQueryValidator } from '../../middleware/hono-middlewares.js';
import { createExternalError } from './external-api-utils.js';
import { handleExternalSubscriptionsRequest } from './external-subscriptions-handler.js';
import { handleExternalManualNodesRequest } from './external-manual-nodes-handler.js';
import { handleExternalProfilesRequest } from './external-profiles-handler.js';
import { handleExternalPreviewRequest } from './external-preview-handler.js';

function decodeRouteParam(value) {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return value || '';
  }
}

function externalParseErrorResponse(error) {
  return createExternalError(error?.code || 'invalid_json', error?.message || 'Invalid JSON', error?.status || 400);
}

/**
 * 构建对外 API (/api/ext/v1/*) Hono 路由实例
 */
function createExternalApiRouter() {
  const externalApp = /** @type {Hono<{ Bindings: Record<string, any>; Variables: Record<string, any> }>} */ (
    new Hono()
  );

  externalApp.use('*', externalApiAuthMiddleware);

  // --- Subscriptions ---
  externalApp.get(
    '/subscriptions',
    zodQueryValidator(PaginationQuerySchema.partial(), (error) =>
      createExternalError('invalid_query', error.issues[0]?.message || 'Invalid pagination query', 400),
    ),
    (c) => handleExternalSubscriptionsRequest(c.req.raw, c.env),
  );
  externalApp.post(
    '/subscriptions',
    zodJsonValidator(ExternalSubscriptionCreateSchema, {
      onParseError: externalParseErrorResponse,
      onValidationError: (_error, /** @type {Record<string, any>} */ raw) => {
        if (!String(raw?.url || '').trim()) {
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
    zodQueryValidator(PaginationQuerySchema.partial(), (error) =>
      createExternalError('invalid_query', error.issues[0]?.message || 'Invalid pagination query', 400),
    ),
    (c) => handleExternalManualNodesRequest(c.req.raw, c.env),
  );
  externalApp.post(
    '/manual-nodes',
    zodJsonValidator(ExternalManualNodeCreateSchema, {
      onParseError: externalParseErrorResponse,
      onValidationError: (_error, /** @type {Record<string, any>} */ raw) => {
        if (!String(raw?.name || '').trim()) {
          return createExternalError('manual_node_name_required', 'Manual node name is required', 400);
        }
        if (!String(raw?.url || '').trim()) {
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
      onValidationError: (_error, /** @type {Record<string, any>} */ raw) => {
        if (!String(raw?.url || '').trim()) {
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
    zodQueryValidator(PaginationQuerySchema.partial(), (error) =>
      createExternalError('invalid_query', error.issues[0]?.message || 'Invalid pagination query', 400),
    ),
    (c) => handleExternalProfilesRequest(c.req.raw, c.env, {}),
  );
  externalApp.post(
    '/profiles',
    zodJsonValidator(ExternalProfileCreateSchema, {
      onParseError: externalParseErrorResponse,
      onValidationError: (_error, /** @type {Record<string, any>} */ raw) => {
        if (!String(raw?.name || '').trim()) {
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
  externalApp.onError((/** @type {any} */ err) =>
    createExternalError(err?.code || 'internal_error', err?.message || 'Internal Server Error', err?.status || 500),
  );

  return externalApp;
}

const externalApiApp = createExternalApiRouter();

function buildNormalizedExternalRequest(request) {
  const stdReq = ensureStandardRequest(request);
  const url = new URL(stdReq.url);
  let targetPath = url.pathname.startsWith('/api/ext/v1') ? url.pathname.slice('/api/ext/v1'.length) : url.pathname;
  targetPath = targetPath.replace(/\/+$/, '') || '/';

  if (url.pathname === targetPath) {
    return stdReq;
  }

  url.pathname = targetPath;
  const init = {
    method: stdReq.method,
    headers: stdReq.headers,
  };
  if (stdReq.method !== 'GET' && stdReq.method !== 'HEAD' && stdReq.body !== null) {
    init.body = stdReq.body;
    init.duplex = 'half';
  }
  return new Request(url.toString(), init);
}

export async function handleExternalApiRequest(request, env) {
  const normalizedRequest = buildNormalizedExternalRequest(request);
  return await externalApiApp.fetch(normalizedRequest, env);
}
