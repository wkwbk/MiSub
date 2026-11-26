export interface ApiErrorData {
  message?: string;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

export class APIError extends Error {
  status: number;
  data: ApiErrorData | null;

  constructor(message: string, status = 500, data: ApiErrorData | null = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

interface UnauthorizedContext {
  url: string;
  data: unknown;
}

export type UnauthorizedHandler = (context: UnauthorizedContext) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function configureUnauthorizedHandler(handler: UnauthorizedHandler | null | undefined): void {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
}

const buildHeaders = (headers?: HeadersInit, body?: BodyInit | null): Headers => {
  if (headers instanceof Headers) {
    return headers;
  }
  const resolved = new Headers(headers || {});
  if (!resolved.has('Content-Type') && body !== undefined) {
    resolved.set('Content-Type', 'application/json');
  }
  return resolved;
};

const parseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

function asErrorData(value: unknown): ApiErrorData | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ApiErrorData)
    : null;
}

export async function request<T = Record<string, unknown>>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const { headers, body, ...rest } = options;
  const response = await fetch(url, {
    credentials: 'include',
    ...rest,
    body,
    headers: buildHeaders(headers, body),
  });

  const data = await parseJson(response);
  if (!response.ok) {
    if (response.status === 401) {
      try {
        unauthorizedHandler?.({ url, data });
      } catch (error) {
        console.warn('[HTTP] Unauthorized handler failed:', error);
      }
    }
    const errorData = asErrorData(data);
    const message =
      (typeof errorData?.message === 'string' && errorData.message) ||
      (typeof errorData?.error === 'string' && errorData.error) ||
      `HTTP ${response.status}`;
    throw new APIError(message, response.status, errorData);
  }

  return data as T;
}

const stringifyBody = (data: unknown): string | undefined =>
  data === undefined ? undefined : JSON.stringify(data);

export const api = {
  get: <T = Record<string, unknown>>(url: string, options: RequestInit = {}): Promise<T> =>
    request<T>(url, { ...options, method: 'GET' }),
  post: <T = Record<string, unknown>>(
    url: string,
    data?: unknown,
    options: RequestInit = {},
  ): Promise<T> => request<T>(url, { ...options, method: 'POST', body: stringifyBody(data) }),
  put: <T = Record<string, unknown>>(
    url: string,
    data?: unknown,
    options: RequestInit = {},
  ): Promise<T> => request<T>(url, { ...options, method: 'PUT', body: stringifyBody(data) }),
  patch: <T = Record<string, unknown>>(
    url: string,
    data?: unknown,
    options: RequestInit = {},
  ): Promise<T> => request<T>(url, { ...options, method: 'PATCH', body: stringifyBody(data) }),
  del: <T = Record<string, unknown>>(url: string, options: RequestInit = {}): Promise<T> =>
    request<T>(url, { ...options, method: 'DELETE' }),
};
