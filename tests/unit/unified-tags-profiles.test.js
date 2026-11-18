import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useDataStore } from '@/stores/useDataStore.js';
import { useProfiles } from '@/composables/useProfiles.js';
import { useSubscriptions } from '@/composables/useSubscriptions.js';
import ProfilePanel from '@/components/profiles/ProfilePanel.vue';
import ProfileCard from '@/components/profiles/ProfileCard.vue';
import SubscriptionPanel from '@/components/subscriptions/SubscriptionPanel.vue';
import Card from '@/components/ui/Card.vue';
import PublicProfileCard from '@/components/public/ProfileCard.vue';
import HeroProfileCard from '@/components/public/HeroProfileCard.vue';
import { createI18n } from '@/i18n/index.js';
import { UNTAGGED_KEY } from '@/utils/tags.js';
import { generateCombinedNodeList } from '../../functions/services/subscription-service.js';

describe('分享管理（Profiles）标签功能与公开卡片展示', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('useProfiles 支持按多标签交集筛选、无标签筛选、关键词搜标签，以及标签重命名/删除/排序', () => {
        const dataStore = useDataStore();
        dataStore.profiles = [
            { id: 'p1', name: '家庭主力', customId: 'home', tags: ['Clash', '家人', '流媒体'] },
            { id: 'p2', name: '软路由', customId: 'router', tags: ['Clash', '路由器'] },
            { id: 'p3', name: '兜底测试', customId: 'test', tags: [] },
        ];

        const {
            profileTags,
            filteredProfiles,
            searchQuery,
            setTagFilters,
            toggleTagFilter,
            renameProfileTag,
            deleteProfileTag,
            reorderProfileTags,
        } = useProfiles(vi.fn());

        expect(profileTags.value).toEqual(['Clash', '家人', '流媒体', '路由器']);

        // 多选交集：Clash + 家人 -> 只命中 p1
        toggleTagFilter('Clash');
        expect(filteredProfiles.value.map((p) => p.id)).toEqual(['p1', 'p2']);
        toggleTagFilter('家人');
        expect(filteredProfiles.value.map((p) => p.id)).toEqual(['p1']);

        // 无标签筛选 -> 只命中 p3
        setTagFilters([UNTAGGED_KEY]);
        expect(filteredProfiles.value.map((p) => p.id)).toEqual(['p3']);

        // 关键词搜索标签
        setTagFilters([]);
        searchQuery.value = '路由器';
        expect(filteredProfiles.value.map((p) => p.id)).toEqual(['p2']);
        searchQuery.value = '';

        // 调整顺序、重命名与删除
        reorderProfileTags(['路由器', 'Clash', '家人', '流媒体']);
        expect(profileTags.value[0]).toBe('路由器');

        renameProfileTag('Clash', 'Mihomo');
        expect(dataStore.profiles[0].tags).toEqual(['Mihomo', '家人', '流媒体']);

        deleteProfileTag('家人');
        expect(dataStore.profiles[0].tags).toEqual(['Mihomo', '流媒体']);
    });

    it('ProfilePanel 展示标签筛选栏并在菜单中提供标签管理入口', async () => {
        const profiles = [
            { id: 'p1', name: '主力组合', tags: ['Clash', '流媒体'], enabled: true },
            { id: 'p2', name: '未标组合', tags: [], enabled: true },
        ];
        const wrapper = mount(ProfilePanel, {
            props: {
                profiles,
                paginatedProfiles: profiles,
                tags: ['Clash', '流媒体'],
                activeTagFilters: [],
                currentPage: 1,
                totalPages: 1,
                searchable: true,
            },
            global: {
                plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
                stubs: {
                    MoreActionsMenu: {
                        template: '<div><slot name="menu" :close="() => {}" /></div>',
                    },
                    draggable: true,
                },
            },
        });

        const tabs = wrapper.get('[data-testid="profile-tag-tabs"]');
        expect(tabs.text()).toContain('全部');
        expect(tabs.text()).toContain('无标签');
        expect(tabs.text()).toContain('Clash');
        expect(tabs.text()).toContain('流媒体');

        await wrapper.get('[data-testid="manage-profile-tags"]').trigger('click');
        expect(wrapper.emitted('manage-tags')).toHaveLength(1);
    });

    it('对外公开页卡片展示分享组合的标签徽章', () => {
        const profile = {
            id: 'pub-1',
            name: '公开流媒体组合',
            description: '高速解锁',
            tags: ['流媒体', '低延迟'],
        };

        const cardWrapper = mount(PublicProfileCard, {
            props: { profile, isQrExpanded: false },
            global: {
                plugins: [createI18n({ initialLocale: 'zh-CN' })],
                stubs: { QRCodeOverlay: true },
            },
        });
        expect(cardWrapper.get('[data-testid="public-profile-card-tags"]').text()).toContain(
            '流媒体'
        );
        expect(cardWrapper.get('[data-testid="public-profile-card-tags"]').text()).toContain(
            '低延迟'
        );

        const heroWrapper = mount(HeroProfileCard, {
            props: { profile, isQrExpanded: false },
            global: {
                plugins: [createI18n({ initialLocale: 'zh-CN' })],
                stubs: { QRCodeOverlay: true },
            },
        });
        expect(heroWrapper.get('[data-testid="public-hero-profile-tags"]').text()).toContain(
            '流媒体'
        );
    });

    it('开启首个标签前缀（prependTagName）时，手工节点取 tags[0] 作为名称前缀', async () => {
        const result = await generateCombinedNodeList(
            {},
            { enableAccessLog: false },
            'ClashMeta',
            [
                {
                    id: 'node-1',
                    name: '香港原生',
                    url: 'trojan://pass@example.com:443#hk',
                    tags: ['家宽', '解锁Netflix'],
                    enabled: true,
                },
            ],
            '',
            {
                enableManualNodes: false,
                prependTagName: true,
            },
            false
        );

        expect(decodeURIComponent(result)).toContain('家宽 - 香港原生');
    });

    it('订阅管理与分享管理均支持批量设置标签与批量删除，且卡片标签统一位于左上角标题之前', async () => {
        const dataStore = useDataStore();
        dataStore.subscriptions = [
            { id: 's1', name: '主力机场', url: 'https://a.test/sub', tags: ['主力'], enabled: true },
            { id: 's2', name: '备用机场', url: 'https://b.test/sub', tags: [], enabled: true },
        ];
        dataStore.profiles = [
            {
                id: 'p1',
                name: '主力组合',
                subscriptions: ['s1', 's2'],
                manualNodes: [],
                tags: ['Clash'],
                enabled: true,
            },
            {
                id: 'p2',
                name: '备用组合',
                subscriptions: ['s2'],
                manualNodes: [],
                tags: [],
                enabled: true,
            },
        ];

        const { batchUpdateSubscriptionTags, batchDeleteSubscriptions } = useSubscriptions(vi.fn());
        const { batchUpdateProfileTags, batchDeleteProfiles } = useProfiles(vi.fn());

        batchUpdateSubscriptionTags(['s1', 's2'], { mode: 'append', tags: ['流媒体'] });
        expect(dataStore.subscriptions[0].tags).toEqual(['主力', '流媒体']);
        expect(dataStore.subscriptions[1].tags).toEqual(['流媒体']);

        batchUpdateProfileTags(['p1', 'p2'], { mode: 'append', tags: ['家人'] });
        expect(dataStore.profiles[0].tags).toEqual(['Clash', '家人']);
        expect(dataStore.profiles[1].tags).toEqual(['家人']);

        // 验证订阅卡片与分享卡片的标签位于卡片标题之前（左上角）
        const subCardWrapper = mount(Card, {
            props: { misub: dataStore.subscriptions[0] },
            global: {
                plugins: [createI18n({ initialLocale: 'zh-CN' })],
                stubs: { Switch: true },
            },
        });
        const subTagsEl = subCardWrapper.get('[data-testid="subscription-card-tags"]').element;
        const subTitleEl = subCardWrapper.get('h3').element;
        expect(
            subTagsEl.compareDocumentPosition(subTitleEl) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();

        const profileCardWrapper = mount(ProfileCard, {
            props: { profile: dataStore.profiles[0] },
            global: {
                plugins: [createI18n({ initialLocale: 'zh-CN' })],
                stubs: { Switch: true },
            },
        });
        const profileTagsEl = profileCardWrapper.get('[data-testid="profile-card-tags"]').element;
        const profileTitleEl = profileCardWrapper.get('p').element;
        expect(
            profileTagsEl.compareDocumentPosition(profileTitleEl) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();

        // 验证面板批量操作入口
        const subPanelWrapper = mount(SubscriptionPanel, {
            props: {
                subscriptions: dataStore.subscriptions,
                tags: ['主力', '流媒体'],
            },
            global: {
                plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
                stubs: {
                    MoreActionsMenu: {
                        template: '<div><slot name="menu" :close="() => {}" /></div>',
                    },
                    draggable: true,
                    Switch: true,
                },
            },
        });
        await subPanelWrapper.get('[data-testid="subscription-bulk-actions-toggle"]').trigger('click');
        expect(subPanelWrapper.text()).toContain('全选本页');

        const profilePanelWrapper = mount(ProfilePanel, {
            props: {
                profiles: dataStore.profiles,
                paginatedProfiles: dataStore.profiles,
                tags: ['Clash', '家人'],
            },
            global: {
                plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
                stubs: {
                    MoreActionsMenu: {
                        template: '<div><slot name="menu" :close="() => {}" /></div>',
                    },
                    draggable: true,
                    Switch: true,
                },
            },
        });
        await profilePanelWrapper.get('[data-testid="profile-bulk-actions-toggle"]').trigger('click');
        expect(profilePanelWrapper.text()).toContain('全选本页');

        // 批量删除
        batchDeleteSubscriptions(['s1']);
        expect(dataStore.subscriptions.map((s) => s.id)).toEqual(['s2']);
        expect(dataStore.profiles[0].subscriptions).toEqual(['s2']);

        batchDeleteProfiles(['p2']);
        expect(dataStore.profiles.map((p) => p.id)).toEqual(['p1']);
    });
});
