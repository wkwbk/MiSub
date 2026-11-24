import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS as BACKEND_DEFAULT_SETTINGS, STORAGE_KEY_SETTINGS } from '../../functions/modules/config.js';
import { DEFAULT_SETTINGS as FRONTEND_DEFAULT_SETTINGS } from '../../src/constants/default-settings.js';
import {
  isTokenRotationDue,
  resolvePublicBaseUrl,
  rotateSubscriptionToken,
} from '../../functions/modules/handlers/rotate-token.js';
import { StorageFactory } from '../../functions/storage-adapter.js';
import { handleCronTrigger } from '../../functions/modules/notifications.js';

describe('subscription myToken scheduled rotation & domain fallback (B.8)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults tokenAutoRotate.enabled to false so existing deployments never unexpectedly break subscriptions', () => {
    expect(BACKEND_DEFAULT_SETTINGS.tokenAutoRotate.enabled).toBe(false);
    expect(FRONTEND_DEFAULT_SETTINGS.tokenAutoRotate.enabled).toBe(false);
    expect(isTokenRotationDue(BACKEND_DEFAULT_SETTINGS)).toBe(false);
  });

  it('evaluates intervalDays and skips when not forced & disabled or not due', async () => {
    const now = Date.parse('2026-06-10T00:00:00.000Z');
    const oneDayAgo = '2026-06-09T00:00:00.000Z';
    const threeDaysAgo = '2026-06-07T00:00:00.000Z';

    expect(
      isTokenRotationDue({ tokenAutoRotate: { enabled: true, intervalDays: 2, lastRotatedAt: oneDayAgo } }, now),
    ).toBe(false);
    expect(
      isTokenRotationDue({ tokenAutoRotate: { enabled: true, intervalDays: 2, lastRotatedAt: threeDaysAgo } }, now),
    ).toBe(true);

    const settingsStore = {
      myToken: 'initial-token',
      tokenAutoRotate: { enabled: false, intervalDays: 2, lastRotatedAt: threeDaysAgo },
    };
    const putSpy = vi.fn(async (_k, v) => Object.assign(settingsStore, v));
    vi.spyOn(StorageFactory, 'createAdapter').mockReturnValue({
      type: 'd1',
      get: vi.fn().mockResolvedValue(settingsStore),
      put: putSpy,
    });

    const skippedRes = await rotateSubscriptionToken({}, { force: false, now });
    expect(skippedRes).toEqual({ rotated: false, skipped: true, reason: 'disabled' });
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('resolves domain fallback priority: settings.publicUrl > MISUB_PUBLIC_URL > CF_PAGES_URL > request.origin', () => {
    expect(
      resolvePublicBaseUrl(
        { publicUrl: 'https://custom.example.com/' },
        { MISUB_PUBLIC_URL: 'https://env.example.com', CF_PAGES_URL: 'https://pages.dev' },
        new Request('https://req.example.com/cron/rotate-token'),
      ),
    ).toBe('https://custom.example.com');

    expect(
      resolvePublicBaseUrl(
        { publicUrl: '' },
        { MISUB_PUBLIC_URL: 'misub.example.com', CF_PAGES_URL: 'https://pages.dev' },
        new Request('https://req.example.com/cron/rotate-token'),
      ),
    ).toBe('https://misub.example.com');

    expect(resolvePublicBaseUrl({}, { CF_PAGES_URL: 'https://misub-demo.pages.dev' }, null)).toBe(
      'https://misub-demo.pages.dev',
    );
  });

  it('rotates myToken, uses normalized profileToken path, updates lastRotatedAt, and sends TG notification', async () => {
    const saved = {
      myToken: 'old-token-123',
      profileToken: '/custom-sub/',
      botToken: '123456:ABCDEF',
      chatId: '99887766',
      tokenAutoRotate: { enabled: true, intervalDays: 2, lastRotatedAt: '2026-06-01T00:00:00.000Z' },
    };

    const adapter = {
      type: 'd1',
      get: vi.fn(async () => ({ ...saved })),
      put: vi.fn(async (_key, nextVal) => {
        Object.assign(saved, nextVal);
        return true;
      }),
      getAllSubscriptions: vi.fn().mockResolvedValue([
        { id: 's1', name: 'Airport1', url: 'https://a.example/sub', enabled: true, nodeCount: 15 },
        { id: 's2', name: 'Paused', url: 'https://b.example/sub', enabled: false, nodeCount: 99 },
        { id: 'n1', name: 'Manual', url: 'vless://11111111-1111-1111-1111-111111111111@1.1.1.1:443#M1', enabled: true },
      ]),
    };
    vi.spyOn(StorageFactory, 'createAdapter').mockReturnValue(adapter);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const now = Date.parse('2026-06-10T12:00:00.000Z');
    const result = await rotateSubscriptionToken(
      { MISUB_PUBLIC_URL: 'https://sub.example.com' },
      { force: false, now, source: 'unit-test' },
    );

    expect(result.rotated).toBe(true);
    expect(result.myToken).toMatch(/^[a-f0-9]{32}$/);
    expect(result.myToken).not.toBe('old-token-123');
    expect(result.subUrl).toBe(`https://sub.example.com/custom-sub/${result.myToken}`);
    expect(result.stats).toEqual({
      remoteSubscriptions: 1,
      remoteNodes: 15,
      manualNodes: 1,
      totalNodes: 16,
    });
    expect(result.notified).toBe(true);
    expect(saved.myToken).toBe(result.myToken);
    expect(saved.tokenAutoRotate.lastRotatedAt).toBe(new Date(now).toISOString());

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const tgBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(tgBody.text).toContain(result.myToken);
    expect(tgBody.text).toContain(`https://sub.example.com/custom-sub/${result.myToken}?clash`);
    expect(tgBody.text).toContain('16');
  });

  it('runs due token rotation during handleCronTrigger even with no auto-updatable subscriptions', async () => {
    const saved = {
      myToken: 'before-cron',
      profileToken: 'sub',
      tokenAutoRotate: { enabled: true, intervalDays: 1, lastRotatedAt: '2026-01-01T00:00:00.000Z' },
    };
    const adapter = {
      type: 'd1',
      getRemoteSubscriptions: vi.fn().mockResolvedValue([]),
      getAllSubscriptions: vi.fn().mockResolvedValue([]),
      get: vi.fn(async (key) => (key === STORAGE_KEY_SETTINGS ? { ...saved } : null)),
      put: vi.fn(async (_k, v) => Object.assign(saved, v)),
    };
    vi.spyOn(StorageFactory, 'createAdapter').mockReturnValue(adapter);

    const res = await handleCronTrigger({ CF_PAGES_URL: 'https://demo.pages.dev' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.tokenRotation?.rotated).toBe(true);
    expect(body.tokenRotation?.subUrl).toContain('https://demo.pages.dev/sub/');
  });
});
