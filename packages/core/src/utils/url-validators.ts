import { NODE_PROTOCOL_REGEX } from '../protocols/constants.js';

export const HTTP_URL_REGEX = /^https?:\/\/.+/i;
export const HTTP_PROXY_AUTH_URL_REGEX = /^https?:\/\/[^/\s]+@[^/\s]+/i;

export function isValidHttpUrlString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!HTTP_URL_REGEX.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidRemoteSubscriptionUrl(value: unknown): boolean {
  if (!isValidHttpUrlString(value)) return false;
  const trimmed = String(value).trim();
  return !HTTP_PROXY_AUTH_URL_REGEX.test(trimmed);
}

export function isValidManualNodeUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    return HTTP_PROXY_AUTH_URL_REGEX.test(trimmed);
  }
  return NODE_PROTOCOL_REGEX.test(trimmed);
}
