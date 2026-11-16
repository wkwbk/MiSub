import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SubscriptionPanel from '@/components/subscriptions/SubscriptionPanel.vue';
import { useSubscriptions } from '@/composables/useSubscriptions.js';
import { useDataStore } from '@/stores/useDataStore.js';
import {
    collectSubscriptionGroups,
    getSubscriptionGroup,
    normalizeSubscriptionGroupName,
} from '@/utils/subscription-groups.js';

const makeSub = (id, name, url, extra = {}) => ({ id, name, url, enabled: true, ...extra });

const mountPanel = (subscriptions, extraProps = {}) =>
    mount(SubscriptionPanel, {
        props: {
            subscriptions,
            ...extraProps,
        },
        global: {
            plugins: [createPinia()],
            stubs: {
                draggable: true,
                Card: {
                    props: ['misub'],
                    template: '<div class="stub-card">{{ misub.name }}</div>',
                },
                MoreActionsMenu: { template: '<div><slot name="menu" :close="() => {}" /></div>' },
                EmptyState: true,
            },
        },
    });

describe('机场订阅标签分组', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('未设置分组时直接平铺渲染，不显示分组标签栏', async () => {
        const subs = [
            makeSub('a', 's1', 'https://sub1.gsafevpn.com/x/token1'),
            makeSub('b', 's2', 'https://sub1.gsafevpn.com/x/token2'),
            makeSub('c', 's3', 'https://other.example.com/sub'),
        ];
        const wrapper = mountPanel(subs);
        await wrapper.vm.$nextTick();

        expect(wrapper.findAll('.stub-card')).toHaveLength(3);
        expect(wrapper.find('[data-testid="subscription-group-tabs"]').exists()).toBe(false);
    });

    it('按 group 字段展示标签栏并支持筛选全部/未分组/指定分组', async () => {
        const subs = [
            makeSub('a', '共享', 'https://sub.libk.top/x/share', { group: 'Libk' }),
            makeSub('b', '自建', 'https://sub.libk.top/x/lisir', { group: 'Libk' }),
            makeSub('c', '免费', 'https://ijg.cc/helloworld'),
        ];
        const wrapper = mountPanel(subs);
        await wrapper.vm.$nextTick();

        const tabs = wrapper.get('[data-testid="subscription-group-tabs"]');
        expect(tabs.text()).toContain('Libk');
        expect(wrapper.findAll('.stub-card')).toHaveLength(3);

        const libkBtn = tabs.findAll('button').find((b) => b.text() === 'Libk');
        await libkBtn.trigger('click');
        expect(wrapper.findAll('.stub-card')).toHaveLength(2);
        expect(wrapper.text()).toContain('共享');
        expect(wrapper.text()).not.toContain('免费');

        await wrapper.get('[data-testid="subscription-group-tab-default"]').trigger('click');
        expect(wrapper.findAll('.stub-card')).toHaveLength(1);
        expect(wrapper.text()).toContain('免费');

        await wrapper.get('[data-testid="subscription-group-tab-all"]').trigger('click');
        expect(wrapper.findAll('.stub-card')).toHaveLength(3);
    });

    it('分批无限加载与分组筛选协同工作，点击加载更多可追加剩余卡片', async () => {
        const subs = [
            makeSub('a', 's1', 'https://a.example.com/1', { group: 'G1' }),
            makeSub('b', 's2', 'https://b.example.com/2', { group: 'G1' }),
            makeSub('c', 's3', 'https://c.example.com/3', { group: 'G2' }),
        ];
        const wrapper = mountPanel(subs, { batchSize: 2 });
        await wrapper.vm.$nextTick();

        expect(wrapper.findAll('.stub-card')).toHaveLength(2);
        const loadMoreBtn = wrapper.get('[data-testid="subscription-load-more-btn"]');
        await loadMoreBtn.trigger('click');
        expect(wrapper.findAll('.stub-card')).toHaveLength(3);
        expect(wrapper.find('[data-testid="subscription-load-more-btn"]').exists()).toBe(false);
    });

    it('兼容读取旧版 airportIdentity.name，并支持在 useSubscriptions 中重命名和删除分组', () => {
        const dataStore = useDataStore();
        dataStore.subscriptions = [
            makeSub('a', 's1', 'https://a.test/1', { group: '机场A' }),
            makeSub('b', 's2', 'https://b.test/2', {
                airportIdentity: { groupId: 'legacy-1', name: '机场A' },
            }),
            makeSub('c', 's3', 'https://c.test/3', { group: '机场B' }),
        ];

        const {
            subscriptionGroups,
            activeGroupFilter,
            setGroupFilter,
            renameSubscriptionGroup,
            deleteSubscriptionGroup,
        } = useSubscriptions(vi.fn());

        expect(subscriptionGroups.value).toEqual(['机场A', '机场B']);
        expect(normalizeSubscriptionGroupName('默认')).toBe('');
        expect(getSubscriptionGroup(dataStore.subscriptions[1])).toBe('机场A');

        setGroupFilter('机场A');
        renameSubscriptionGroup('机场A', '主力');
        expect(activeGroupFilter.value).toBe('主力');
        expect(collectSubscriptionGroups(dataStore.subscriptions)).toEqual(['主力', '机场B']);
        expect(dataStore.subscriptions[1].airportIdentity).toBeNull();

        deleteSubscriptionGroup('主力');
        expect(activeGroupFilter.value).toBeNull();
        expect(subscriptionGroups.value).toEqual(['机场B']);
    });
});
