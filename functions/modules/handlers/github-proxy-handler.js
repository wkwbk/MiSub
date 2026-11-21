import { createErrorResponse, createJsonResponse } from '../utils.js';
import { StorageFactory } from '../../storage-adapter.js';

function getGithubToken(env) {
  const raw = env?.GITHUB_TOKEN;
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
}

async function fetchLatestReleaseFromApi(repo, githubToken) {
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

/**
 * Fallback when GitHub REST API is rate-limited (403/429) and no cached data exists:
 * resolve the latest release tag via github.com redirect without consuming REST API quota.
 */
async function fetchLatestReleaseViaRedirect(repo) {
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
  } catch (error) {
    console.warn(`[GitHub Proxy] Redirect fallback failed for ${repo}:`, error);
  }

  return null;
}

async function safePutReleaseCache(storage, cacheKey, data) {
  try {
    await storage.put(cacheKey, {
      data,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.warn(`[GitHub Proxy] Failed to write cache for ${cacheKey}:`, error);
  }
}

/**
 * Handle proxied GitHub release requests with caching
 * GET /api/github/release?repo=owner/repo
 */
export async function handleGithubReleaseRequest(request, env) {
  const url = new URL(request.url);
  const repo = url.searchParams.get('repo');

  if (!repo || !/^[\w\-.]+\/[\w\-.]+$/.test(repo)) {
    return createErrorResponse('Invalid repo parameter. Format: owner/repo', 400);
  }

  const CACHE_KEY = `github_release_${repo}`;
  const CACHE_TTL_MS = 24 * 3600 * 1000; // 24 hours

  try {
    const storage = StorageFactory.createAdapter(env);

    // Try to get from cache
    const cachedWrapper = await storage.get(CACHE_KEY);

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
      // Handle rate limit or not found
      if (response.status === 403 || response.status === 429) {
        // return cached stale data if available
        if (cachedWrapper?.data) {
          return createJsonResponse(cachedWrapper.data, 200, {
            'X-Cache-Status': 'STALE',
            'Cache-Control': 'public, max-age=60',
          });
        }

        // Try non-API redirect fallback so client versions still resolve & cache without GITHUB_TOKEN
        const fallbackData = await fetchLatestReleaseViaRedirect(repo);
        if (fallbackData) {
          await safePutReleaseCache(storage, CACHE_KEY, fallbackData);
          return createJsonResponse(fallbackData, 200, {
            'X-Cache-Status': 'FALLBACK',
            'Cache-Control': 'public, max-age=86400',
          });
        }

        // No cache or fallback available, return empty data instead of error
        // to prevent frontend errors
        console.warn(`[GitHub Proxy] Rate limited for ${repo}, no cache available`);
        return createJsonResponse({ tag_name: null, rate_limited: true }, 200, {
          'X-Cache-Status': 'RATE_LIMITED',
          'Cache-Control': 'public, max-age=300', // Retry after 5 min
        });
      }
      // For other errors (404, etc.), also return gracefully
      if (response.status === 404) {
        return createJsonResponse({ tag_name: null, not_found: true }, 200, {
          'X-Cache-Status': 'NOT_FOUND',
          'Cache-Control': 'public, max-age=3600',
        });
      }
      return createErrorResponse(`GitHub API Error: ${response.statusText}`, response.status);
    }

    const data = await response.json();

    // Extract only needed fields
    const simplifiedData = {
      tag_name: data.tag_name,
      html_url: data.html_url,
      published_at: data.published_at,
      name: data.name,
      body: data.body || '',
    };

    await safePutReleaseCache(storage, CACHE_KEY, simplifiedData);

    return createJsonResponse(simplifiedData, 200, {
      'X-Cache-Status': 'MISS',
      'Cache-Control': 'public, max-age=86400',
    });
  } catch (error) {
    console.error(`[GitHub Proxy] Error fetching ${repo}:`, error);
    return createErrorResponse('Internal Server Error', 500);
  }
}
