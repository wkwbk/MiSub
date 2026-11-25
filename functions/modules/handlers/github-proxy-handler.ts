import type { Env, StorageAdapter } from '../../types.js';
import { createErrorResponse, createJsonResponse } from '../utils.js';
import { StorageFactory } from '../../storage-adapter.js';

interface CachedReleaseWrapper {
  data?: unknown;
  timestamp?: number;
}

interface SimplifiedReleaseData {
  tag_name: string | null;
  html_url: string;
  published_at: string | null;
  name: string;
  body?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getGithubToken(env: Env): string {
  const raw = env?.GITHUB_TOKEN;
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
}

async function fetchLatestReleaseFromApi(repo: string, githubToken: string): Promise<Response> {
  const githubUrl = `https://api.github.com/repos/${repo}/releases/latest`;
  const baseHeaders = {
    'User-Agent': 'MiSub-Proxy/1.0',
    Accept: 'application/vnd.github.v3+json',
  };

  if (githubToken) {
    const authResponse = await fetch(githubUrl, {
      headers: {
        ...baseHeaders,
        Authorization: `Bearer ${githubToken}`,
      },
    });

    if (authResponse.status !== 401) {
      return authResponse;
    }

    console.warn(`[GitHub Proxy] GITHUB_TOKEN rejected (401) for ${repo}, retrying without token`);
  }

  return fetch(githubUrl, {
    headers: baseHeaders,
    cf: {
      cacheTtl: 86400,
      cacheEverything: true,
    },
  });
}

async function fetchLatestReleaseViaRedirect(repo: string): Promise<SimplifiedReleaseData | null> {
  try {
    const releaseUrl = `https://github.com/${repo}/releases/latest`;
    const response = await fetch(releaseUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'MiSub-Proxy/1.0',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location') || response.headers.get('location') || '';
      const match = location.match(/\/releases\/tag\/([^/?#]+)/);
      if (match && match[1]) {
        const rawTag = match[1];
        let tagName = rawTag;
        try {
          tagName = decodeURIComponent(rawTag);
        } catch {
          tagName = rawTag;
        }
        return {
          tag_name: tagName,
          html_url: `https://github.com/${repo}/releases/tag/${rawTag}`,
          published_at: null,
          name: tagName,
          body: '',
        };
      }
    }
  } catch (error: unknown) {
    console.warn(`[GitHub Proxy] Redirect fallback failed for ${repo}:`, error);
  }

  return null;
}

async function safePutReleaseCache(
  storage: StorageAdapter,
  cacheKey: string,
  data: SimplifiedReleaseData,
): Promise<void> {
  try {
    await storage.put(cacheKey, {
      data,
      timestamp: Date.now(),
    });
  } catch (error: unknown) {
    console.warn(`[GitHub Proxy] Failed to write cache for ${cacheKey}:`, error);
  }
}

export async function handleGithubReleaseRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const repo = url.searchParams.get('repo');

  if (!repo || !/^[\w\-.]+\/[\w\-.]+$/.test(repo)) {
    return createErrorResponse('Invalid repo parameter. Format: owner/repo', 400);
  }

  const CACHE_KEY = `github_release_${repo}`;
  const CACHE_TTL_MS = 24 * 3600 * 1000;

  try {
    const storage = StorageFactory.createAdapter(env) as unknown as StorageAdapter;

    const cachedWrapper = await storage.get<CachedReleaseWrapper>(CACHE_KEY);

    if (cachedWrapper && cachedWrapper.timestamp) {
      const age = Date.now() - cachedWrapper.timestamp;
      if (age < CACHE_TTL_MS) {
        return createJsonResponse(cachedWrapper.data, 200, {
          'X-Cache-Status': 'HIT',
          'Cache-Control': 'public, max-age=86400',
        });
      }
    }

    const githubToken = getGithubToken(env);
    const response = await fetchLatestReleaseFromApi(repo, githubToken);

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        if (cachedWrapper?.data) {
          return createJsonResponse(cachedWrapper.data, 200, {
            'X-Cache-Status': 'STALE',
            'Cache-Control': 'public, max-age=60',
          });
        }

        const fallbackData = await fetchLatestReleaseViaRedirect(repo);
        if (fallbackData) {
          await safePutReleaseCache(storage, CACHE_KEY, fallbackData);
          return createJsonResponse(fallbackData, 200, {
            'X-Cache-Status': 'FALLBACK',
            'Cache-Control': 'public, max-age=86400',
          });
        }

        console.warn(`[GitHub Proxy] Rate limited for ${repo}, no cache available`);
        return createJsonResponse({ tag_name: null, rate_limited: true }, 200, {
          'X-Cache-Status': 'RATE_LIMITED',
          'Cache-Control': 'public, max-age=300',
        });
      }
      if (response.status === 404) {
        return createJsonResponse({ tag_name: null, not_found: true }, 200, {
          'X-Cache-Status': 'NOT_FOUND',
          'Cache-Control': 'public, max-age=3600',
        });
      }
      return createErrorResponse(`GitHub API Error: ${response.statusText}`, response.status);
    }

    const rawData = (await response.json()) as unknown;
    const data = isRecord(rawData) ? rawData : {};

    const simplifiedData: SimplifiedReleaseData = {
      tag_name: typeof data.tag_name === 'string' ? data.tag_name : null,
      html_url: typeof data.html_url === 'string' ? data.html_url : '',
      published_at: typeof data.published_at === 'string' ? data.published_at : null,
      name: typeof data.name === 'string' ? data.name : '',
      body: typeof data.body === 'string' ? data.body : '',
    };

    await safePutReleaseCache(storage, CACHE_KEY, simplifiedData);

    return createJsonResponse(simplifiedData, 200, {
      'X-Cache-Status': 'MISS',
      'Cache-Control': 'public, max-age=86400',
    });
  } catch (error: unknown) {
    console.error(`[GitHub Proxy] Error fetching ${repo}:`, error);
    return createErrorResponse('Internal Server Error', 500);
  }
}

export async function handleAppStoreReleaseRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const rawCountry = url.searchParams.get('country') || 'us';

  if (!id || !/^\d+$/.test(id)) {
    return createErrorResponse('Invalid id parameter. Expected numeric App Store ID', 400);
  }
  if (!/^[a-zA-Z]{2}$/.test(rawCountry)) {
    return createErrorResponse('Invalid country parameter. Expected 2-letter country code', 400);
  }

  const country = rawCountry.toLowerCase();
  const CACHE_KEY = `appstore_release_${country}_${id}`;
  const CACHE_TTL_MS = 24 * 3600 * 1000;

  try {
    const storage = StorageFactory.createAdapter(env) as unknown as StorageAdapter;
    const cachedWrapper = await storage.get<CachedReleaseWrapper>(CACHE_KEY);

    if (cachedWrapper && cachedWrapper.timestamp) {
      const age = Date.now() - cachedWrapper.timestamp;
      if (age < CACHE_TTL_MS) {
        return createJsonResponse(cachedWrapper.data, 200, {
          'X-Cache-Status': 'HIT',
          'Cache-Control': 'public, max-age=86400',
        });
      }
    }

    const response = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=${country}`, {
      headers: { 'User-Agent': 'MiSub-Proxy/1.0' },
      cf: {
        cacheTtl: 86400,
        cacheEverything: true,
      },
    });

    if (!response.ok) {
      if (cachedWrapper?.data) {
        return createJsonResponse(cachedWrapper.data, 200, {
          'X-Cache-Status': 'STALE',
          'Cache-Control': 'public, max-age=60',
        });
      }
      return createErrorResponse(`App Store API Error: ${response.statusText}`, response.status);
    }

    const rawData = (await response.json()) as unknown;
    const results = isRecord(rawData) && Array.isArray(rawData.results) ? rawData.results : [];
    const app = results.length > 0 && isRecord(results[0]) ? results[0] : null;
    if (!app) {
      return createJsonResponse({ tag_name: null, not_found: true }, 200, {
        'X-Cache-Status': 'NOT_FOUND',
        'Cache-Control': 'public, max-age=3600',
      });
    }

    const simplifiedData: SimplifiedReleaseData = {
      tag_name: typeof app.version === 'string' && app.version ? app.version : null,
      html_url: typeof app.trackViewUrl === 'string' ? app.trackViewUrl : '',
      published_at:
        typeof app.currentVersionReleaseDate === 'string' && app.currentVersionReleaseDate
          ? app.currentVersionReleaseDate
          : null,
      name: typeof app.trackName === 'string' ? app.trackName : '',
    };

    await safePutReleaseCache(storage, CACHE_KEY, simplifiedData);

    return createJsonResponse(simplifiedData, 200, {
      'X-Cache-Status': 'MISS',
      'Cache-Control': 'public, max-age=86400',
    });
  } catch (error: unknown) {
    console.error(`[App Store Proxy] Error fetching ${country}/${id}:`, error);
    return createErrorResponse('Internal Server Error', 500);
  }
}
