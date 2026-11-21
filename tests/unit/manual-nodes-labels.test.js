import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { MAIN_NAV_ITEMS } from '@/constants/navigation.js';
import NodeActions from '@/components/nodes/ManualNodePanel/NodeActions.vue';
import { createI18n } from '@/i18n/index.js';

describe('manual nodes labels', () => {
  const mountNodeActions = (props = {}) =>
    mount(NodeActions, {
      props: {
        manualNodesCount: 89,
        filteredNodesCount: 89,
        searchTerm: '',
        activeTagFilters: [],
        manualNodeTags: [],
        isSorting: false,
        isSelectionMode: false,
        ...props,
      },
      global: {
        plugins: [createI18n({ initialLocale: 'zh-CN' })],
        stubs: {
          MoreActionsMenu: {
            template: '<div><slot name="menu" :close="() => {}" /></div>',
          },
        },
      },
    });

  it('keeps the top navigation label in sync with the panel title', () => {
    const navItem = MAIN_NAV_ITEMS.find((item) => item.path === '/dashboard/nodes');
    const wrapper = mountNodeActions();

    const panelTitle = wrapper.find('h2').text();
    expect(navItem?.name).toBe(panelTitle);
  });

  it('keeps the mobile toolbar inside the viewport and renders the full-width search bar', () => {
    const wrapper = mountNodeActions({
      manualNodesCount: 24,
      filteredNodesCount: 0,
      searchTerm: '测试',
      manualNodeTags: ['香港', '日本'],
    });
    const tagScroller = wrapper.get('[data-testid="manual-node-mobile-tags"]');
    const toolbarActions = wrapper.get('[data-testid="manual-node-toolbar-actions"]');
    const search = wrapper.get('[data-testid="manual-node-search"]');
    const searchInput = search.get('input[type="text"]');

    expect(tagScroller.classes()).toEqual(
      expect.arrayContaining(['w-full', 'min-w-0', 'overflow-x-auto', 'md:hidden']),
    );
    expect(toolbarActions.classes()).toEqual(
      expect.arrayContaining(['w-full', 'min-w-0', 'flex-wrap', 'sm:flex-nowrap']),
    );
    expect(toolbarActions.find('[data-testid="manual-node-search"]').exists()).toBe(false);
    expect(toolbarActions.find('.view-mode-toggle').exists()).toBe(false);
    expect(search.classes()).toEqual(expect.arrayContaining(['relative', 'mt-4']));
    expect(searchInput.attributes('type')).toBe('text');
    expect(search.text()).toContain('0/24');
  });

  it('hides tag filter bars when there are no tags and no active filters', () => {
    const wrapper = mountNodeActions({
      manualNodeTags: [],
      activeTagFilters: [],
    });

    expect(wrapper.find('[data-testid="manual-node-mobile-tags"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="manual-node-tag-tabs"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="manage-manual-node-tags"]').exists()).toBe(false);
  });
});
