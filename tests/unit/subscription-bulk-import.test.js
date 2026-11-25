import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDataStore } from '@/stores/useDataStore.js';
import { useToastStore } from '@/stores/useToastStore.js';
import {
  extractSubscriptionTagNames,
  isValidSubscriptionUrl,
  useSubscriptionBulkImport,
} from '@/composables/useSubscriptionBulkImport.js';

describe('机场订阅专用批量导入（多标签支持）', () => {
  let dataStore;
  let toastStore;
  let importer;

  beforeEach(() => {
    setActivePinia(createPinia());
    dataStore = useDataStore();
    toastStore = useToastStore();

    dataStore.subscriptions = [
      {
        id: 'sub-1',
        url: 'https://airport-a.com/sub?token=existing',
        name: 'Airport A',
        enabled: true,
        tags: ['机场A'],
      },
    ];

    importer = useSubscriptionBulkImport({
      addSubscriptionsFromBulk: (subs) => {
        subs.forEach((sub) => dataStore.addSubscription(sub));
      },
    });
  });

  it('isValidSubscriptionUrl 仅允许 http:// 和 https:// 链接', () => {
    expect(isValidSubscriptionUrl('https://example.com/sub?token=123')).toBe(true);
    expect(isValidSubscriptionUrl('http://example.com/sub')).toBe(true);
    expect(isValidSubscriptionUrl('vless://uuid@host:443#node')).toBe(false);
    expect(isValidSubscriptionUrl('vmess://eyJhZGQiOiIxIn0=')).toBe(false);
    expect(isValidSubscriptionUrl('not a url')).toBe(false);
  });

  it('extractSubscriptionTagNames 能提取现有订阅的去重标签列表并忽略手动节点标签', () => {
    dataStore.subscriptions.push(
      { id: 'sub-2', url: 'https://a2.com/sub', tags: ['机场A', '主力'] },
      {
        id: 'sub-3',
        url: 'https://b.com/sub',
        tags: ['机场B'],
      },
      { id: 'sub-4', url: 'https://sub.gsafevpn.com/link', detectedName: 'GSafe机场' },
      { id: 'node-1', url: 'vless://uuid@host:443#node', tags: ['节点标签'] },
    );
    expect(extractSubscriptionTagNames(dataStore.subscriptions)).toEqual(['机场A', '主力', '机场B']);
  });

  it('只导入 http/https 订阅链接，忽略节点分享链接，且不填写标签时 tags 为空数组', () => {
    const input = [
      'https://new-sub.com/api/v1/client/subscribe?token=abc#MySub',
      'vless://ecb7b51b-3e4f-448b-89a4-6fd2ceef8257@cf.libk.top:443#OKRA',
      'http://another-sub.com/link',
    ].join('\n');

    importer.handleSubscriptionBulkImport(input, []);

    const urls = dataStore.subscriptions.map((s) => s.url);
    expect(urls).toContain('https://new-sub.com/api/v1/client/subscribe?token=abc#MySub');
    expect(urls).toContain('http://another-sub.com/link');
    expect(urls).not.toContain('vless://ecb7b51b-3e4f-448b-89a4-6fd2ceef8257@cf.libk.top:443#OKRA');

    const added = dataStore.subscriptions.find((s) => s.url === 'http://another-sub.com/link');
    expect(added.tags).toEqual([]);
    expect(added).not.toHaveProperty('group');
    expect(toastStore.toasts.at(-1)?.type).toBe('success');
    expect(toastStore.toasts.at(-1)?.message).toContain('2');
  });

  it('填写标签时规范化写入 tags 数组', () => {
    importer.handleSubscriptionBulkImport('https://sub-a2.com/sub', ['机场A', '流媒体']);
    const tagged = dataStore.subscriptions.find((s) => s.url === 'https://sub-a2.com/sub');
    expect(tagged.tags).toEqual(['机场A', '流媒体']);
    expect(tagged).not.toHaveProperty('group');

    importer.handleSubscriptionBulkImport('https://sub-c.com/sub', ['  新机场C  ']);
    const created = dataStore.subscriptions.find((s) => s.url === 'https://sub-c.com/sub');
    expect(created.tags).toEqual(['新机场C']);
  });

  it('全部为非订阅链接时给出明确警告且不写入数据', () => {
    const initialCount = dataStore.subscriptions.length;
    importer.handleSubscriptionBulkImport('vless://uuid@host:443#node\nvmess://abc', []);

    expect(dataStore.subscriptions).toHaveLength(initialCount);
    expect(toastStore.toasts.at(-1)?.type).toBe('warning');
  });

  it('全部为重复订阅链接时提示已存在', () => {
    const initialCount = dataStore.subscriptions.length;
    importer.handleSubscriptionBulkImport('https://airport-a.com/sub?token=existing', []);

    expect(dataStore.subscriptions).toHaveLength(initialCount);
    expect(toastStore.toasts.at(-1)?.type).toBe('info');
  });
});
