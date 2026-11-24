import { timingSafeStringEqual } from '../auth-middleware.js';
import { createExternalError, getExternalApiSettings } from './external-api-utils.js';

export async function authenticateExternalApiRequest(request, env, storageAdapter = null) {
  const settings = await getExternalApiSettings(env, storageAdapter);
  if (settings.enabled !== true) {
    return {
      ok: false,
      response: createExternalError('forbidden', 'External API is disabled', 403),
    };
  }

  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return {
      ok: false,
      response: createExternalError('unauthorized', 'Invalid or missing bearer token', 401),
    };
  }

  const token = match[1].trim();
  if (!token) {
    return {
      ok: false,
      response: createExternalError('unauthorized', 'Invalid or missing bearer token', 401),
    };
  }
  const tokens = Array.isArray(settings.tokens) ? settings.tokens : [];
  let matchedToken = null;
  for (const item of tokens) {
    const configured = String(item?.token || '').trim();
    if (!configured) continue;
    const isMatched = await timingSafeStringEqual(configured, token);
    if (isMatched && !matchedToken) {
      matchedToken = item;
    }
  }
  if (!matchedToken) {
    return {
      ok: false,
      response: createExternalError('unauthorized', 'Invalid or missing bearer token', 401),
    };
  }

  return {
    ok: true,
    tokenName: matchedToken.name || 'default',
  };
}
