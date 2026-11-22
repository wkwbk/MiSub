import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageFactory } from '../../functions/storage-adapter.js';
import {
  handleShortLinkCreate,
  handleShortLinkTest,
  normalizeSinkApiUrl,
  validateShortSlug,
} from '../../functions/modules/handlers/shortlink-handler.js';

function createMockRequest(body, method = 'POST') {
  return new Request('https://misub.example.com/api/shortlink/create', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('shortlink-handler', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('normalizeSinkApiUrl', () => {
    it('prepends https:// when protocol is omitted and trims trailing slash', () => {
      expect(normalizeSinkApiUrl('ijg.cc')).toBe('https://ijg.cc');
      expect(normalizeSinkApiUrl('https://ijg.cc///')).toBe('https://ijg.cc');
      expect(normalizeSinkApiUrl('http://sink.local:8787/sub/')).toBe('http://sink.local:8787/sub');
    });

    it('rejects empty or invalid URLs', () => {
      expect(() => normalizeSinkApiUrl('')).toThrow();
      expect(() => normalizeSinkApiUrl('ftp://ijg.cc')).toThrow();
    });
  });

  describe('validateShortSlug', () => {
    it('allows empty slug for random generation and valid custom slugs', () => {
      expect(validateShortSlug('')).toBe('');
      expect(validateShortSlug('  ')).toBe('');
      expect(validateShortSlug('my_sub-01')).toBe('my_sub-01');
    });

    it('rejects slugs with spaces or illegal characters', () => {
      expect(() => validateShortSlug('bad/slug')).toThrow();
      expect(() => validateShortSlug('bad slug')).toThrow();
    });
  });

  describe('handleShortLinkTest', () => {
    it('verifies Sink connectivity with Bearer token', async () => {
      vi.spyOn(StorageFactory, 'createAdapter').mockReturnValue({
        type: 'd1',
        get: vi.fn().mockResolvedValue({ shortLink: { apiUrl: 'ijg.cc', apiToken: 'saved-token' } }),
      });

      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ links: [] }), { status: 200 }));
      globalThis.fetch = fetchMock;

      const res = await handleShortLinkTest(createMockRequest({ shortLink: { apiUrl: 'ijg.cc', apiToken: '' } }), {});
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.apiUrl).toBe('https://ijg.cc');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://ijg.cc/api/link/list?limit=1',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer saved-token',
          }),
        }),
      );
    });

    it('returns clear error on 401 unauthorized', async () => {
      vi.spyOn(StorageFactory, 'createAdapter').mockReturnValue({
        type: 'd1',
        get: vi.fn().mockResolvedValue({}),
      });

      globalThis.fetch = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const res = await handleShortLinkTest(
        createMockRequest({ shortLink: { apiUrl: 'ijg.cc', apiToken: 'bad-token' } }),
        {},
      );
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.message).toContain('Token');
    });
  });

  describe('handleShortLinkCreate', () => {
    it('creates random short link when slug is omitted and syncs to profile', async () => {
      const syncAllProfiles = vi.fn().mockResolvedValue(true);
      vi.spyOn(StorageFactory, 'createAdapter').mockReturnValue({
        type: 'd1',
        get: vi.fn().mockResolvedValue({
          shortLink: { enabled: true, provider: 'sink', apiUrl: 'ijg.cc', apiToken: 'test-token' },
        }),
        getAllProfiles: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Main', customId: 'main' }]),
        syncAllProfiles,
      });

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ link: { slug: 'abc123', url: 'https://misub.example.com/sub/main' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      globalThis.fetch = fetchMock;

      const res = await handleShortLinkCreate(
        createMockRequest({
          url: 'https://misub.example.com/sub/main',
          slug: '',
          profileId: 'p1',
          saveToProfile: true,
        }),
        {},
      );
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.shortUrl).toBe('https://ijg.cc/abc123');
      expect(json.slug).toBe('abc123');
      expect(json.savedToProfile).toBe(true);

      const [, fetchInit] = fetchMock.mock.calls[0];
      expect(JSON.parse(fetchInit.body)).toEqual({ url: 'https://misub.example.com/sub/main' });
      expect(syncAllProfiles).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'p1', shortLink: 'https://ijg.cc/abc123' })]),
      );
    });

    it('creates custom short link and reports 409 conflict cleanly', async () => {
      vi.spyOn(StorageFactory, 'createAdapter').mockReturnValue({
        type: 'd1',
        get: vi.fn().mockResolvedValue({
          shortLink: { enabled: true, provider: 'sink', apiUrl: 'https://ijg.cc', apiToken: 'test-token' },
        }),
      });

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ statusMessage: 'Slug already exists' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await handleShortLinkCreate(
        createMockRequest({
          url: 'https://misub.example.com/sub/main',
          slug: 'my-vip',
        }),
        {},
      );
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.success).toBe(false);
      expect(json.message).toContain('my-vip');
    });

    it('rejects creation when shortLink service is disabled', async () => {
      vi.spyOn(StorageFactory, 'createAdapter').mockReturnValue({
        type: 'd1',
        get: vi.fn().mockResolvedValue({
          shortLink: { enabled: false, provider: 'sink', apiUrl: 'ijg.cc', apiToken: 'test-token' },
        }),
      });

      const res = await handleShortLinkCreate(createMockRequest({ url: 'https://misub.example.com/sub/main' }), {});
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
    });
  });
});
