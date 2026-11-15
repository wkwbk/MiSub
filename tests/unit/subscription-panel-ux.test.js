import { DOMWrapper, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import SubscriptionPanel from '../../src/components/subscriptions/SubscriptionPanel.vue';
import { createI18n } from '../../src/i18n/index.js';

const baseProps = {
    isSorting: false,
};

function mountPanel(props = {}) {
    return mount(SubscriptionPanel, {
        attachTo: document.body,
        props: {
            ...baseProps,
            subscriptions: [],
            ...props,
        },
        global: {
            plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
            stubs: {
                Card: {
                    props: ['misub'],
                    template: '<article class="card-stub">{{ misub.name }}</article>',
                },
                EmptyState: {
                    props: ['title', 'description'],
                    template:
                        '<div class="empty-state-stub"><h3>{{ title }}</h3><p>{{ description }}</p><slot /></div>',
                },
                MoreActionsMenu: { template: '<div><slot name="menu" :close="() => {}" /></div>' },
                draggable: {
                    template:
                        '<div><slot name="item" v-for="element in modelValue" :element="element" /></div>',
                    props: ['modelValue'],
                },
            },
        },
    });
}

describe('SubscriptionPanel UX', () => {
    it('keeps the panel header focused on local actions instead of duplicating dashboard statistics', () => {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const wrapper = mountPanel({
            subscriptions: [
                {
                    id: 's1',
                    name: '主力机场',
                    url: 'https://example.com/a',
                    enabled: true,
                    nodeCount: 12,
                    userInfo: {
                        upload: 1,
                        download: 2,
                        total: 100,
                        expire: nowSeconds + 3 * 24 * 60 * 60,
                    },
                },
                {
                    id: 's2',
                    name: '备用机场',
                    url: 'https://example.com/b',
                    enabled: false,
                    nodeCount: 8,
                    lastError: 'timeout',
                },
                {
                    id: 's3',
                    name: '更新中',
                    url: 'https://example.com/c',
                    enabled: true,
                    nodeCount: 0,
                    isUpdating: true,
                },
            ],
        });

        expect(wrapper.text()).toContain('机场订阅');
        expect(wrapper.text()).toContain(
            '维护机场订阅源，添加/导入后可在卡片中查看节点、流量与到期信息。'
        );
        expect(wrapper.text()).not.toContain('启用 2/3');
        expect(wrapper.text()).not.toContain('节点 20');
        expect(wrapper.text()).not.toContain('待处理 3');
        expect(wrapper.text()).not.toContain('状态正常');
    });

    it('does not duplicate add and bulk import buttons in the empty state', () => {
        const wrapper = mountPanel();

        expect(wrapper.find('[data-testid="empty-add-subscription"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="empty-import-subscriptions"]').exists()).toBe(false);
        expect(wrapper.text()).not.toContain('添加机场订阅');
    });

    it('distinguishes search with no matches from an actually empty list', async () => {
        const wrapper = mountPanel({
            searchable: true,
            searchQuery: 'missing',
            subscriptions: [{ id: 's1', name: '机场一', url: 'https://one.test/sub' }],
            paginatedSubscriptions: [],
            filteredCount: 0,
        });

        expect(wrapper.text()).toContain('没有找到匹配的机场订阅');
        expect(wrapper.get('[data-testid="subscription-no-search-results"]').exists()).toBe(true);
        expect(wrapper.get('[data-testid="clear-subscription-search"]').exists()).toBe(true);
        await wrapper.get('[data-testid="clear-subscription-search"]').trigger('click');
        expect(wrapper.emitted('updateSearch')).toEqual([['']]);
    });

    it('renders batched results inside collapsed site groups', async () => {
        const wrapper = mountPanel({
            subscriptions: [
                { id: 'a1', name: 'A1', url: 'https://sub.example.com/1' },
                { id: 'a2', name: 'A2', url: 'https://sub.example.com/2' },
                { id: 'b1', name: 'B1', url: 'https://other.test/1' },
            ],
            batchSize: 1,
        });

        expect(wrapper.text()).toContain('A1');
        expect(wrapper.text()).toContain('A2');
        expect(wrapper.text()).not.toContain('B1');
        expect(wrapper.findAll('.card-stub')).toHaveLength(2);
        expect(wrapper.get('button[aria-expanded="false"]').exists()).toBe(true);
        await wrapper.get('button[aria-expanded="false"]').trigger('click');
        expect(wrapper.get('button[aria-expanded="true"]').exists()).toBe(true);
    });

    it('uses a concise list search hint that fits mobile screens', () => {
        const wrapper = mountPanel({ searchable: true });
        const search = wrapper.get('[data-testid="subscription-search"]');

        expect(search.attributes('placeholder')).toBe('搜索名称、备注或链接');
        expect(search.attributes('aria-label')).toBe('搜索机场订阅名称、备注或链接...');
    });

    it('opens the new group dialog, cancels, and creates a group with checked subscriptions', async () => {
        const subscriptions = [
            {
                id: 's1',
                name: 'Alpha',
                url: 'https://alpha.test/a',
            },
            { id: 's2', name: 'Beta', url: 'https://beta.test/b' },
        ];
        const wrapper = mountPanel({ subscriptions, paginatedSubscriptions: subscriptions });
        await wrapper.get('[data-testid="create-airport-group"]').trigger('click');
        expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
        const dialogButtons = () =>
            Array.from(document.body.querySelectorAll('[role="dialog"] button')).map(
                (el) => new DOMWrapper(el)
            );
        await dialogButtons().find((button) => button.text() === '取消').trigger('click');
        expect(wrapper.emitted('assign-airport-group')).toBeUndefined();

        await wrapper.get('[data-testid="create-airport-group"]').trigger('click');
        await new DOMWrapper(
            document.body.querySelector('[role="dialog"] [data-testid="airport-group-name-input"]')
        ).setValue('Custom Group');
        const checkboxes = document.body.querySelectorAll('[role="dialog"] input[type="checkbox"]');
        checkboxes[0].click();
        checkboxes[1].click();
        await wrapper.vm.$nextTick();
        await dialogButtons().find((button) => button.text() === '保存分组').trigger('click');
        const [[ids, identity]] = wrapper.emitted('assign-airport-group');
        expect(ids).toEqual(['s1', 's2']);
        expect(identity.name).toBe('Custom Group');
        expect(identity.groupId).toBeTruthy();
    });

    it('submits a new identity using the selected group row subscription IDs', async () => {
        const subscriptions = [
            { id: 's1', name: 'A', url: 'https://same.test/a' },
            { id: 's2', name: 'B', url: 'https://same.test/b' },
            { id: 's3', name: 'C', url: 'https://other.test/c' },
        ];
        const wrapper = mountPanel({ subscriptions, paginatedSubscriptions: subscriptions });
        await wrapper.get('[data-testid="edit-airport-group"]').trigger('click');
        const dialogQuery = (selector) =>
            new DOMWrapper(document.body.querySelector(`[role="dialog"] ${selector}`));
        await dialogQuery('[data-testid="airport-group-name-input"]').setValue('New Airport');
        const saveButton = Array.from(document.body.querySelectorAll('[role="dialog"] button'))
            .map((el) => new DOMWrapper(el))
            .find((button) => button.text() === '保存分组');
        await saveButton.trigger('click');
        const [[ids, identity]] = wrapper.emitted('assign-airport-group');
        expect(ids).toEqual(['s1', 's2']);
        expect(identity).toMatchObject({ name: 'New Airport' });
        expect(identity.groupId).toBeTruthy();
    });

    it('keeps two-column desktop grid and shows sorting banner when sorting a single subscription', async () => {
        const single = [{ id: 's1', name: '免费', url: 'https://ijg.cc/helloworld' }];
        const wrapper = mountPanel({
            subscriptions: single,
            paginatedSubscriptions: single,
            isSorting: true,
        });

        const banner = wrapper.find('[data-testid="subscription-sorting-banner"]');
        expect(banner.exists()).toBe(true);
        expect(banner.text()).toContain('当前处于排序模式');

        const finishButton = wrapper.find('[data-testid="subscription-finish-sort"]');
        expect(finishButton.exists()).toBe(true);
        await finishButton.trigger('click');
        expect(wrapper.emitted('toggleSort')).toHaveLength(1);

        const sortGrid = wrapper.find('.grid.gap-4');
        expect(sortGrid.exists()).toBe(true);
        expect(sortGrid.classes()).toContain('grid-cols-1');
        expect(sortGrid.classes()).toContain('md:grid-cols-2');

        const dragItem = sortGrid.find('.cursor-move');
        expect(dragItem.exists()).toBe(true);
        expect(dragItem.classes()).toContain('border-dashed');

        const card = sortGrid.find('.card-stub');
        expect(card.exists()).toBe(true);
        expect(card.classes()).toContain('pointer-events-none');
        expect(card.classes()).toContain('select-none');
    });

    it('does not emit markDirty when drag ends at the same index', async () => {
        const subs = [
            { id: 's1', name: 'A', url: 'https://a.test/sub' },
            { id: 's2', name: 'B', url: 'https://b.test/sub' },
        ];
        const wrapper = mountPanel({
            subscriptions: subs,
            paginatedSubscriptions: subs,
            isSorting: true,
        });

        const draggableComp = wrapper.findComponent('.contents');
        await draggableComp.vm.$emit('end', { oldIndex: 0, newIndex: 0 });
        expect(wrapper.emitted('markDirty')).toBeUndefined();

        await draggableComp.vm.$emit('end', { oldIndex: 0, newIndex: 1 });
        expect(wrapper.emitted('markDirty')).toHaveLength(1);
    });

    it('preserves group structure and supports group + intra-group reordering during sorting', async () => {
        const subs = [
            { id: 'a1', name: '共享', url: 'https://sub.libk.top/x/share' },
            { id: 'c1', name: '免费', url: 'https://ijg.cc/helloworld' },
            { id: 'a2', name: '自建', url: 'https://sub.libk.top/x/lisir' },
            { id: 'b1', name: '甲1', url: 'https://alpha.example.com/1' },
            { id: 'b2', name: '甲2', url: 'https://alpha.example.com/2' },
        ];
        const wrapper = mountPanel({
            subscriptions: subs,
            paginatedSubscriptions: subs,
            isSorting: true,
        });

        const groupCards = wrapper.findAll('[data-testid="sortable-subscription-group"]');
        expect(groupCards).toHaveLength(2);
        expect(groupCards[0].text()).toContain('Libk');
        expect(groupCards[1].text()).toContain('Example');

        // 组内排序：把 Libk 组的「自建」移到「共享」前面
        const innerDraggable = groupCards[0].findComponent('.contents');
        await innerDraggable.vm.$emit('update:modelValue', [subs[2], subs[0]]);
        expect(wrapper.emitted('reorder')?.[0][0].map((item) => item.id)).toEqual([
            'a2',
            'a1',
            'b1',
            'b2',
            'c1',
        ]);
    });
});
