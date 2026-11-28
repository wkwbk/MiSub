// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { handleDataRequest, handleSettingsGet } from '../../functions/modules/api-handler.js';
import { clearSettingsCache } from '../../functions/storage-adapter.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';
import { createStorageCache } from '@/utils/cache-helper.js';
import { useDataStore } from '@/stores/useDataStore.js';

describe('/api/data slimming, lazy ruleTemplates, and session cache quota guard', () => {
  beforeEach(() => {
    clearSettingsCache();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('omits settings-only heavy config fields and ruleTemplates from /api/data while preserving runtime fields', async () => {
    const db = createMemoryD1({
      main: {
        fileName: 'MyMiSub',
        myToken: 'main-token',
        profileToken: 'sub',
        customLoginPath: '/admin-login',
        subPortalMode: 'portal',
        defaultMultiSocksEnabled: true,
        defaultMultiSocksStartPort: 43000,
        defaultMultiSocksListen: '0.0.0.0',
        manualNodeTagOrder: ['HK'],
        subscriptionTagOrder: ['Airport'],
        profileTagOrder: ['Default'],
        dismissedHealthItems: ['missing-token'],
        customPage: { enabled: true, content: '<div>large html</div>', css: 'body {}' },
        portalCustomPage: { enabled: true, content: '<div>portal html</div>', css: '.p {}' },
        announcement: { enabled: true, title: 'Notice', content: 'Long notice' },
        webdavBackup: { enabled: true, endpoint: 'https://dav.example.com', password: 'secret' },
        turnstile: { enabled: true, siteKey: 'site', secretKey: 'secret' },
        telegramPushConfig: { enabled: true, botToken: 'push', webhookSecret: 'hook' },
        externalApi: { enabled: true, tokens: [{ name: 'cli', token: 'ext' }] },
        disguise: { pageType: 'redirect', redirectUrl: 'https://example.com' },
        guestbook: { enabled: true, allowAnonymous: false },
        customDnsOverride: 'dns:\n  enable: true',
        regionOverrides: [{ name: 'HK', pattern: 'HK' }],
        defaultOperators: [{ type: 'filter', enabled: true }],
        tokenAutoRotate: { enabled: true, intervalDays: 7, lastRotatedAt: '2026-01-01T00:00:00.000Z' },
      },
      rule_templates: [{ id: 'tpl-1', name: 'Template 1', enabled: true, content: '[custom]\nruleset=a,b' }],
    });

    const dataRes = await handleDataRequest({ MISUB_DB: db });
    const body = await dataRes.json();

    expect(body.ruleTemplates).toBeUndefined();
    expect(body.config.fileName).toBe('MyMiSub');
    expect(body.config.myToken).toBe('main-token');
    expect(body.config.profileToken).toBe('sub');
    expect(body.config.customLoginPath).toBe('/admin-login');
    expect(body.config.subPortalMode).toBe('portal');
    expect(body.config.defaultMultiSocksEnabled).toBe(true);
    expect(body.config.defaultMultiSocksStartPort).toBe(43000);
    expect(body.config.defaultMultiSocksListen).toBe('0.0.0.0');
    expect(body.config.manualNodeTagOrder).toEqual(['HK']);
    expect(body.config.subscriptionTagOrder).toEqual(['Airport']);
    expect(body.config.profileTagOrder).toEqual(['Default']);
    expect(body.config.dismissedHealthItems).toEqual(['missing-token']);
    expect(body.config.transformMode).toBeDefined();
    expect(body.config.smartPreset).toBeDefined();
    expect(body.config.customVisualRules).toBeDefined();
    expect(body.config.externalBackend).toBeDefined();
    expect(body.config.advancedBaseConfig).toBeUndefined();
    expect(body.config.shortLink).toBeDefined();

    for (const omittedKey of [
      'customPage',
      'portalCustomPage',
      'announcement',
      'webdavBackup',
      'turnstile',
      'telegramPushConfig',
      'externalApi',
      'disguise',
      'guestbook',
      'customDnsOverride',
      'regionOverrides',
      'defaultOperators',
      'tokenAutoRotate',
      'botToken',
      'hasBotToken',
      'chatId',
      'cronSecret',
      'hasCronSecret',
      'hasEnvCronSecret',
    ]) {
      expect(body.config[omittedKey]).toBeUndefined();
    }

    const settingsRes = await handleSettingsGet({ MISUB_DB: db });
    expect(settingsRes.headers.get('Cache-Control')).toBe('no-store');
    const settingsBody = await settingsRes.json();
    expect(settingsBody.customPage.content).toBe('<div>large html</div>');
    expect(settingsBody.announcement.title).toBe('Notice');
  });

  it('lazy-loads ruleTemplates once after hydrateFromData and supports forced refresh', async () => {
    setActivePinia(createPinia());
    const dataStore = useDataStore();

    const fetchMock = vi.fn(async (url) => {
      if (url === '/api/rule_templates') {
        return new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 'tpl-1', name: 'Lazy Template', enabled: true, content: '[custom]\n' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    dataStore.hydrateFromData({
      misubs: [],
      profiles: [],
      config: {
        fileName: 'MiSub',
        customPage: { enabled: true, content: '<div>ignored in session cache</div>', css: '' },
        portalCustomPage: { enabled: true, content: '<div>ignored</div>', css: '' },
        customDnsOverride: 'dns:\n  enable: true',
      },
    });

    const cached = JSON.parse(sessionStorage.getItem('misub_data_cache'));
    expect(cached.ruleTemplates).toBeUndefined();
    expect(cached.config.customPage).toBeUndefined();
    expect(cached.config.portalCustomPage).toBeUndefined();
    expect(cached.config.customDnsOverride).toBeUndefined();

    const [first, second] = await Promise.all([
      dataStore.ensureRuleTemplatesLoaded(),
      dataStore.ensureRuleTemplatesLoaded(),
    ]);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await dataStore.ensureRuleTemplatesLoaded();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await dataStore.fetchRuleTemplates({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skips oversized payloads and cleans up stale keys on QuotaExceededError in createStorageCache', () => {
    const cache = createStorageCache('test_quota_cache', 60_000, { maxBytes: 128 });

    cache.set({ small: 'ok' });
    expect(cache.get()).toEqual({ small: 'ok' });

    cache.set({ big: 'x'.repeat(200) });
    expect(sessionStorage.getItem('test_quota_cache')).toBeNull();
    expect(sessionStorage.getItem('test_quota_cache_ts')).toBeNull();
    expect(cache.get()).toBeNull();

    cache.set({ small: 'before-quota-error' });
    expect(cache.get()).toEqual({ small: 'before-quota-error' });

    const setItemSpy = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    cache.set({ small: 'triggers-quota-error' });
    setItemSpy.mockRestore();

    expect(sessionStorage.getItem('test_quota_cache')).toBeNull();
    expect(sessionStorage.getItem('test_quota_cache_ts')).toBeNull();
  });
});
