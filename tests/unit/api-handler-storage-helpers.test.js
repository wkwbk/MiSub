import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAllSubscriptions = vi.fn();
const getAllProfiles = vi.fn();
const get = vi.fn();
const put = vi.fn();
const syncAllSubscriptions = vi.fn();
const syncAllProfiles = vi.fn();
const createAdapter = vi.fn();
const clearAllNodeCaches = vi.fn();

vi.mock('../../functions/storage-adapter.js', () => ({
  StorageFactory: {
    createAdapter: (...args) => createAdapter(...args),
  },
  STORAGE_TYPES: {
    D1: 'd1',
  },
}));

vi.mock('../../functions/modules/utils.js', () => ({
  getCookieSecret: vi.fn(),
  getAdminPassword: vi.fn(),
  normalizeLoginPath: (p) => (typeof p === 'string' && p.trim().replace(/^\/+/, '') ? `/${p.trim().replace(/^\/+/, '')}` : '/login'),
  createJsonResponse: (data, status = 200) => new Response(JSON.stringify(data), { status }),
  createErrorResponse: (data, status = 500) => new Response(JSON.stringify({ error: String(data) }), { status }),
  JSON_BODY_LIMITS: {
    auth: 16 * 1024,
    small: 128 * 1024,
    normal: 1024 * 1024,
    large: 5 * 1024 * 1024,
  },
  readJsonWithLimit: async (request) => request.json(),
}));

vi.mock('../../functions/modules/auth-middleware.js', () => ({
  authMiddleware: vi.fn(),
  handleLogin: vi.fn(),
  handleLogout: vi.fn(),
  createUnauthorizedResponse: vi.fn(),
}));

vi.mock('../../functions/modules/notifications.js', () => ({
  sendTgNotification: vi.fn(),
  checkAndNotify: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../functions/services/node-cache-service.js', () => ({
  clearAllNodeCaches: (...args) => clearAllNodeCaches(...args),
}));

describe('api-handler storage helper usage', () => {
  let infoSpy;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    getAllSubscriptions.mockReset();
    getAllProfiles.mockReset();
    get.mockReset();
    put.mockReset();
    syncAllSubscriptions.mockReset();
    syncAllProfiles.mockReset();
    createAdapter.mockReset();
    clearAllNodeCaches.mockReset();

    clearAllNodeCaches.mockResolvedValue({ cleared: 0, failed: 0, skipped: 0 });
    createAdapter.mockReturnValue({
      getAllSubscriptions,
      getAllProfiles,
      get,
      put,
      syncAllSubscriptions,
      syncAllProfiles,
    });
    get.mockResolvedValue(null);
    syncAllSubscriptions.mockResolvedValue(true);
    syncAllProfiles.mockResolvedValue(true);
  });

  afterEach(() => {
    infoSpy?.mockRestore();
  });

  it('handleDataRequest loads subscriptions and profiles through getAll helper APIs', async () => {
    const { handleDataRequest } = await import('../../functions/modules/api-handler.js');

    getAllSubscriptions.mockResolvedValue([{ id: 'sub-1', name: 'Sub One', url: 'https://a.example.com' }]);
    getAllProfiles.mockResolvedValue([{ id: 'profile-1', name: 'Profile One', subscriptions: [], manualNodes: [] }]);

    const response = await handleDataRequest({ MISUB_DB: {} });
    const payload = await response.json();

    expect(getAllSubscriptions).toHaveBeenCalled();
    expect(getAllProfiles).toHaveBeenCalled();
    expect(payload.misubs).toHaveLength(1);
    expect(payload.profiles).toHaveLength(1);
  });

  it('handleMisubsSave preserves protective caches only for subscriptions with node cache enabled', async () => {
    const { handleMisubsSave } = await import('../../functions/modules/api-handler.js');

    get.mockResolvedValue({});

    const request = {
      async json() {
        return {
          misubs: [
            {
              id: 'sub-enabled',
              name: 'Enabled',
              url: 'https://a.example.com',
              enableNodeCache: true,
            },
            {
              id: 'sub-disabled',
              name: 'Disabled',
              url: 'https://b.example.com',
              enableNodeCache: false,
            },
          ],
          profiles: [],
        };
      },
    };

    const response = await handleMisubsSave(request, { MISUB_DB: {} });

    expect(response.status).toBe(200);
    expect(clearAllNodeCaches).toHaveBeenCalledWith(expect.any(Object), {
      preserveKeys: ['node_cache_subscription_sub-enabled'],
    });
    expect(infoSpy).toHaveBeenCalledWith('[API] Cleared 0 node caches after subscription update, preserved 0');
  });

  it('handleMisubsSave delegates full save directly to syncAllSubscriptions and syncAllProfiles', async () => {
    const { handleMisubsSave } = await import('../../functions/modules/api-handler.js');

    get.mockResolvedValue({});

    const request = {
      async json() {
        return {
          misubs: [{ id: 'sub-new', name: 'New', url: 'https://new.example.com' }],
          profiles: [{ id: 'profile-new', name: 'New Profile', subscriptions: [], manualNodes: [] }],
        };
      },
    };

    const response = await handleMisubsSave(request, { MISUB_DB: {} });

    expect(response.status).toBe(200);
    expect(syncAllSubscriptions).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'sub-new', sortIndex: 0 }),
    ]);
    expect(syncAllProfiles).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'profile-new', sortIndex: 0 }),
    ]);
    expect(put).not.toHaveBeenCalled();
  });
});
