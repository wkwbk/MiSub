import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDataStore } from '../../src/stores/useDataStore.js';
import { useToastStore } from '../../src/stores/toast.js';
import {
    useSubscriptionBulkImport,
    extractAirportGroupNames,
    isValidSubscriptionUrl,
} from '../../src/composables/useSubscriptionBulkImport.js';

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

    it('extractAirportGroupNames 能提取显式命名与按域名/识别名自动聚合的机场分组', () => {
        dataStore.subscriptions.push(
            { id: 'sub-2', url: 'https://a2.com/sub', airportIdentity: { groupId: 'group-a-id', name: '机场A' } },
            { id: 'sub-3', url: 'https://b.com/sub', airportIdentity: { groupId: 'group-b-id', name: '机场B' } },
            { id: 'sub-4', url: 'https://sub.gsafevpn.com/link', detectedName: 'GSafe机场', airportIdentity: null },
            { id: 'sub-5', url: 'https://sub.mycloud.io/link', airportIdentity: null },
            { id: 'node-1', url: 'vless://uuid@host:443#node' }
        );
        expect(extractAirportGroupNames(dataStore.subscriptions)).toEqual([
            '机场A',
            '机场B',
            'GSafe机场',
            'Mycloud',
        ]);
    });

    it('只导入 http/https 订阅链接，忽略节点分享链接，且不填写分组时 airportIdentity 为 null', () => {
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
        expect(added.airportIdentity).toBeNull();
        expect(toastStore.toasts.at(-1)?.type).toBe('success');
        expect(toastStore.toasts.at(-1)?.message).toContain('2');
    });

    it('选择已有机场分组时复用其 groupId，输入新分组时生成新 groupId', () => {
        importer.handleSubscriptionBulkImport('https://sub-a2.com/sub', '机场A');
        const reused = dataStore.subscriptions.find((s) => s.url === 'https://sub-a2.com/sub');
        expect(reused.airportIdentity).toEqual({
            groupId: 'group-a-id',
            name: '机场A',
        });

        importer.handleSubscriptionBulkImport('https://sub-c.com/sub', '新机场C');
        const created = dataStore.subscriptions.find((s) => s.url === 'https://sub-c.com/sub');
        expect(created.airportIdentity?.name).toBe('新机场C');
        expect(created.airportIdentity?.groupId).toBeTruthy();
        expect(created.airportIdentity?.groupId).not.toBe('group-a-id');
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

