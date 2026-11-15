import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDataStore } from '@/stores/useDataStore.js';
import { useToastStore } from '@/stores/toast.js';
import {
    useSubscriptionBulkImport,
    extractAirportGroupNames,
    isValidSubscriptionUrl,
} from '@/composables/useSubscriptionBulkImport.js';

describe('机场订阅专用批量导入', () => {
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
                airportIdentity: {
                    groupId: 'group-a-id',
                    name: '机场A',
                },
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

    it('extractAirportGroupNames 能提取现有订阅的分组标签（含兼容旧版 airportIdentity.name）', () => {
        dataStore.subscriptions.push(
            { id: 'sub-2', url: 'https://a2.com/sub', group: '机场A' },
            { id: 'sub-3', url: 'https://b.com/sub', airportIdentity: { groupId: 'group-b-id', name: '机场B' } },
            { id: 'sub-4', url: 'https://sub.gsafevpn.com/link', detectedName: 'GSafe机场' },
            { id: 'node-1', url: 'vless://uuid@host:443#node', group: '节点组' }
        );
        expect(extractAirportGroupNames(dataStore.subscriptions)).toEqual([
            '机场A',
            '机场B',
        ]);
    });

    it('只导入 http/https 订阅链接，忽略节点分享链接，且不填写分组时 group 为空字符串', () => {
        const input = [
            'https://new-sub.com/api/v1/client/subscribe?token=abc#MySub',
            'vless://ecb7b51b-3e4f-448b-89a4-6fd2ceef8257@cf.libk.top:443#OKRA',
            'http://another-sub.com/link',
        ].join('\n');

        importer.handleSubscriptionBulkImport(input, '');

        const urls = dataStore.subscriptions.map((s) => s.url);
        expect(urls).toContain('https://new-sub.com/api/v1/client/subscribe?token=abc#MySub');
        expect(urls).toContain('http://another-sub.com/link');
        expect(urls).not.toContain('vless://ecb7b51b-3e4f-448b-89a4-6fd2ceef8257@cf.libk.top:443#OKRA');

        const added = dataStore.subscriptions.find((s) => s.url === 'http://another-sub.com/link');
        expect(added.group).toBe('');
        expect(toastStore.toasts.at(-1)?.type).toBe('success');
        expect(toastStore.toasts.at(-1)?.message).toContain('2');
    });

    it('填写分组名称时直接写入 group 字段', () => {
        importer.handleSubscriptionBulkImport('https://sub-a2.com/sub', '机场A');
        const grouped = dataStore.subscriptions.find((s) => s.url === 'https://sub-a2.com/sub');
        expect(grouped.group).toBe('机场A');

        importer.handleSubscriptionBulkImport('https://sub-c.com/sub', '  新机场C  ');
        const created = dataStore.subscriptions.find((s) => s.url === 'https://sub-c.com/sub');
        expect(created.group).toBe('新机场C');
    });

    it('全部为非订阅链接时给出明确警告且不写入数据', () => {
        const initialCount = dataStore.subscriptions.length;
        importer.handleSubscriptionBulkImport('vless://uuid@host:443#node\nvmess://abc', '');

        expect(dataStore.subscriptions).toHaveLength(initialCount);
        expect(toastStore.toasts.at(-1)?.type).toBe('warning');
    });

    it('全部为重复订阅链接时提示已存在', () => {
        const initialCount = dataStore.subscriptions.length;
        importer.handleSubscriptionBulkImport('https://airport-a.com/sub?token=existing', '');

        expect(dataStore.subscriptions).toHaveLength(initialCount);
        expect(toastStore.toasts.at(-1)?.type).toBe('info');
    });
});

