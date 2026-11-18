import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useDataStore } from '@/stores/useDataStore.js';
import { useProfiles } from '@/composables/useProfiles.js';
import ProfilePanel from '@/components/profiles/ProfilePanel.vue';
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

    it('开启首个标签前缀（prependGroupName）时，手工节点取 tags[0] 作为名称前缀', async () => {
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
                prependGroupName: true,
            },
            false
        );

        expect(decodeURIComponent(result)).toContain('家宽 - 香港原生');
    });
});
