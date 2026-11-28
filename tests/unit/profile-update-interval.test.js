import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleMisubRequest,
  resolveProfileUpdateInterval,
} from '../../functions/modules/subscription/core/main-handler.js';

const createAdapter = vi.fn();

vi.mock('../../functions/storage-adapter.js', () => ({
  StorageFactory: {
    createAdapter: (...args) => createAdapter(...args),
    resolveKV: (env) => env?.MISUB_KV || null,
  },
  STORAGE_TYPES: { KV: 'kv', D1: 'd1' },
}));

function createStorageAdapter({ settings = {}, subscriptions = [], profiles = [] } = {}) {
  const store = new Map([
    ['main', settings],
    ['subscriptions', subscriptions],
    ['profiles', profiles],
  ]);

  return {
    store,
    get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    put: vi.fn(async (key, value) => {
      store.set(key, value);
      return true;
    }),
    getAllSubscriptions: vi.fn(async () => subscriptions),
    getAllProfiles: vi.fn(async () => profiles),
    getSubscriptionsByIds: vi.fn(async (ids) => subscriptions.filter((item) => ids.includes(item.id))),
  };
}

describe('Profile-Update-Interval logic and subscription response headers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('resolveProfileUpdateInterval', () => {
    it('returns default 24 hours when no custom interval is provided', () => {
      expect(resolveProfileUpdateInterval(null, null)).toBe(24);
      expect(resolveProfileUpdateInterval({}, {})).toBe(24);
      expect(resolveProfileUpdateInterval(undefined, {})).toBe(24);
    });

    it('prefers profile-level override over global config', () => {
      const profile = { profileUpdateInterval: 12 };
      const config = { profileUpdateInterval: 48 };
      expect(resolveProfileUpdateInterval(profile, config)).toBe(12);
    });

    it('falls back to global config when profile has no setting', () => {
      const profile = {};
      const config = { profileUpdateInterval: 12 };
      expect(resolveProfileUpdateInterval(profile, config)).toBe(12);
    });

    it('handles numeric string values', () => {
      expect(resolveProfileUpdateInterval(null, { profileUpdateInterval: '18' })).toBe(18);
    });

    it('converts seconds (e.g. 86400 or 43200) to hours', () => {
      expect(resolveProfileUpdateInterval(null, { UpdateInterval: 86400 })).toBe(24);
      expect(resolveProfileUpdateInterval(null, { UpdateInterval: 43200 })).toBe(12);
    });

    it('returns null when explicitly set to 0 or negative (disabled)', () => {
      expect(resolveProfileUpdateInterval(null, { profileUpdateInterval: 0 })).toBeNull();
      expect(resolveProfileUpdateInterval({ profileUpdateInterval: 0 }, { profileUpdateInterval: 24 })).toBeNull();
      expect(resolveProfileUpdateInterval(null, { profileUpdateInterval: -1 })).toBeNull();
    });
  });

  describe('handleMisubRequest HTTP headers integration', () => {
    const dummyNode = 'trojan://pass@example.com:443#TestNode';
    const subscriptions = [
      {
        id: 'sub-test',
        name: 'TestSub',
        url: 'https://airport.example/sub',
        enabled: true,
      },
    ];

    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(dummyNode, { status: 200 })),
      );
    });

    it('includes Profile-Update-Interval: 24 by default on Clash target even without traffic header', async () => {
      const adapter = createStorageAdapter({
        settings: {
          myToken: 'test-token',
          enableFlagEmoji: false,
          enableTrafficNode: false,
        },
        subscriptions,
      });
      createAdapter.mockReturnValue(adapter);

      const response = await handleMisubRequest({
        request: new Request('https://misub.example/sub/test-token?target=clash&refresh=1', {
          headers: { 'User-Agent': 'ClashMeta' },
        }),
        env: {},
        waitUntil: vi.fn(),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Profile-Update-Interval')).toBe('24');
      // Ensure absence of traffic header does not break update interval
      expect(response.headers.get('Subscription-Userinfo')).toBeNull();
    });

    it('includes Profile-Update-Interval on raw base64 subscription request', async () => {
      const adapter = createStorageAdapter({
        settings: {
          myToken: 'test-token',
          profileUpdateInterval: 12,
          enableFlagEmoji: false,
        },
        subscriptions,
      });
      createAdapter.mockReturnValue(adapter);

      const response = await handleMisubRequest({
        request: new Request('https://misub.example/sub/test-token?target=base64&refresh=1', {
          headers: { 'User-Agent': 'v2rayN/6.0' },
        }),
        env: {},
        waitUntil: vi.fn(),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Profile-Update-Interval')).toBe('12');
    });

    it('includes Profile-Update-Interval on node plain export', async () => {
      const adapter = createStorageAdapter({
        settings: {
          myToken: 'test-token',
          profileUpdateInterval: 18,
          enableFlagEmoji: false,
        },
        subscriptions,
      });
      createAdapter.mockReturnValue(adapter);

      const response = await handleMisubRequest({
        request: new Request('https://misub.example/sub/test-token?target=node&refresh=1', {
          headers: { 'User-Agent': 'curl/7.88.1' },
        }),
        env: {},
        waitUntil: vi.fn(),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Profile-Update-Interval')).toBe('18');
    });

    it('omits Profile-Update-Interval when profileUpdateInterval is set to 0 (disabled)', async () => {
      const adapter = createStorageAdapter({
        settings: {
          myToken: 'test-token',
          profileUpdateInterval: 0,
          enableFlagEmoji: false,
        },
        subscriptions,
      });
      createAdapter.mockReturnValue(adapter);

      const response = await handleMisubRequest({
        request: new Request('https://misub.example/sub/test-token?target=clash&refresh=1', {
          headers: { 'User-Agent': 'ClashMeta' },
        }),
        env: {},
        waitUntil: vi.fn(),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Profile-Update-Interval')).toBeNull();
    });

    it('includes Profile-Update-Interval on external 302 redirects', async () => {
      const adapter = createStorageAdapter({
        settings: {
          myToken: 'test-token',
          profileUpdateInterval: 12,
          transformMode: 'external',
          externalBackend: { url: 'sub.example' },
        },
        subscriptions,
      });
      createAdapter.mockReturnValue(adapter);

      const response = await handleMisubRequest({
        request: new Request('https://misub.example/sub/test-token?target=clash&refresh=1', {
          headers: { 'User-Agent': 'ClashMeta' },
        }),
        env: {},
        waitUntil: vi.fn(),
      });

      expect(response.status).toBe(302);
      expect(response.headers.get('Profile-Update-Interval')).toBe('12');
    });
  });
});
