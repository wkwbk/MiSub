import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleGithubReleaseRequest } from '../../functions/modules/handlers/github-proxy-handler.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

describe('handleGithubReleaseRequest', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('attaches GITHUB_TOKEN Authorization header and caches release in D1 cache table', async () => {
        const db = createMemoryD1();
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    tag_name: 'v2.4.1',
                    html_url:
                        'https://github.com/clash-verge-rev/clash-verge-rev/releases/tag/v2.4.1',
                    published_at: '2026-01-01T00:00:00Z',
                    name: 'v2.4.1',
                    body: 'Release notes',
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
        );
        vi.stubGlobal('fetch', fetchMock);

        const res = await handleGithubReleaseRequest(
            new Request(
                'https://example.com/api/github/release?repo=clash-verge-rev/clash-verge-rev'
            ),
            {
                MISUB_DB: db,
                GITHUB_TOKEN: '  ghp_test_token_123  ',
            }
        );

        expect(res.status).toBe(200);
        expect(res.headers.get('X-Cache-Status')).toBe('MISS');
        const body = await res.json();
        expect(body.tag_name).toBe('v2.4.1');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [calledUrl, calledInit] = fetchMock.mock.calls[0];
        expect(calledUrl).toBe(
            'https://api.github.com/repos/clash-verge-rev/clash-verge-rev/releases/latest'
        );
        expect(calledInit.headers.Authorization).toBe('Bearer ghp_test_token_123');
        expect(calledInit.cf).toBeUndefined();

        const cachedRaw = db.tables.cache.get('github_release_clash-verge-rev/clash-verge-rev');
        expect(cachedRaw).toBeTruthy();
        expect(JSON.parse(cachedRaw).data.tag_name).toBe('v2.4.1');
    });

    it('retries without token when GITHUB_TOKEN is rejected with 401', async () => {
        const db = createMemoryD1();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('Bad credentials', { status: 401 }))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        tag_name: 'v1.9.0',
                        html_url: 'https://github.com/2dust/v2rayN/releases/tag/v1.9.0',
                        published_at: '2026-02-01T00:00:00Z',
                        name: 'v1.9.0',
                        body: '',
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                )
            );
        vi.stubGlobal('fetch', fetchMock);

        const res = await handleGithubReleaseRequest(
            new Request('https://example.com/api/github/release?repo=2dust/v2rayN'),
            {
                MISUB_DB: db,
                GITHUB_TOKEN: 'expired_token',
            }
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.tag_name).toBe('v1.9.0');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer expired_token');
        expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
    });

    it('falls back to github.com release redirect and writes cache when API returns 403 rate limit', async () => {
        const db = createMemoryD1();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('API rate limit exceeded', { status: 403 }))
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 302,
                    headers: {
                        Location: 'https://github.com/chen08209/FlClash/releases/tag/v0.8.90',
                    },
                })
            );
        vi.stubGlobal('fetch', fetchMock);

        const reqUrl = 'https://example.com/api/github/release?repo=chen08209/FlClash';
        const firstRes = await handleGithubReleaseRequest(new Request(reqUrl), { MISUB_DB: db });

        expect(firstRes.status).toBe(200);
        expect(firstRes.headers.get('X-Cache-Status')).toBe('FALLBACK');
        const firstBody = await firstRes.json();
        expect(firstBody).toEqual({
            tag_name: 'v0.8.90',
            html_url: 'https://github.com/chen08209/FlClash/releases/tag/v0.8.90',
            published_at: null,
            name: 'v0.8.90',
            body: '',
        });
        expect(db.tables.cache.has('github_release_chen08209/FlClash')).toBe(true);

        // Second call should hit D1 cache directly without additional fetch calls
        const secondRes = await handleGithubReleaseRequest(new Request(reqUrl), { MISUB_DB: db });
        expect(secondRes.headers.get('X-Cache-Status')).toBe('HIT');
        expect((await secondRes.json()).tag_name).toBe('v0.8.90');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('returns stale cache when API is rate limited and stale cache exists', async () => {
        const staleTimestamp = Date.now() - 48 * 3600 * 1000;
        const db = createMemoryD1({
            'github_release_2dust/v2rayNG': {
                timestamp: staleTimestamp,
                data: {
                    tag_name: '1.8.38',
                    html_url: 'https://github.com/2dust/v2rayNG/releases/tag/1.8.38',
                    published_at: '2025-12-01T00:00:00Z',
                    name: '1.8.38',
                    body: 'Full cached changelog',
                },
            },
        });
        const fetchMock = vi
            .fn()
            .mockResolvedValue(new Response('API rate limit exceeded', { status: 429 }));
        vi.stubGlobal('fetch', fetchMock);

        const res = await handleGithubReleaseRequest(
            new Request('https://example.com/api/github/release?repo=2dust/v2rayNG'),
            { MISUB_DB: db }
        );

        expect(res.status).toBe(200);
        expect(res.headers.get('X-Cache-Status')).toBe('STALE');
        const body = await res.json();
        expect(body.tag_name).toBe('1.8.38');
        expect(body.body).toBe('Full cached changelog');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns RATE_LIMITED gracefully when both API and redirect fallback fail', async () => {
        const db = createMemoryD1();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('API rate limit exceeded', { status: 403 }))
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 302,
                    headers: {
                        Location: 'https://github.com/owner/no-release/releases',
                    },
                })
            );
        vi.stubGlobal('fetch', fetchMock);

        const res = await handleGithubReleaseRequest(
            new Request('https://example.com/api/github/release?repo=owner/no-release'),
            { MISUB_DB: db }
        );

        expect(res.status).toBe(200);
        expect(res.headers.get('X-Cache-Status')).toBe('RATE_LIMITED');
        expect(await res.json()).toEqual({ tag_name: null, rate_limited: true });
        expect(db.tables.cache.size).toBe(0);
    });
});
