import { describe, expect, it } from 'vitest';
import { handleSettingsReset } from '../../functions/modules/api-handler.js';
import { createMemoryD1 } from '../helpers/memory-d1.js';

describe('handleSettingsReset (factory reset)', () => {
  it('clears all settings rows and node caches while preserving subscriptions and profiles', async () => {
    const db = createMemoryD1({
      main: { fileName: 'CustomName', cronSecret: 'sec-123', botToken: 'tg-token' },
      rule_templates: [{ id: 'tpl-1', name: 'My Template', content: '[custom]\nruleset=a,b' }],
      clients: [{ id: 'custom-client', name: 'Custom Client' }],
      node_cache_profile_1: { nodes: ['ss://abc'], timestamp: Date.now() },
      subscriptions: [{ id: 'sub-1', name: 'Airport A', url: 'https://example.com/sub', enabled: true }],
      profiles: [{ id: 'prof-1', name: 'Profile A', enabled: true, subscriptions: ['sub-1'] }],
    });

    const response = await handleSettingsReset({ MISUB_DB: db });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    // settings 表中所有配置键（main / rule_templates / clients）均已清空
    expect(db.tables.settings.size).toBe(0);
    // 节点缓存已清除
    expect(db.tables.cache.has('node_cache_profile_1')).toBe(false);
    // 订阅与订阅组数据保留
    expect(db.tables.subscriptions.size).toBe(1);
    expect(db.tables.profiles.size).toBe(1);
  });
});
