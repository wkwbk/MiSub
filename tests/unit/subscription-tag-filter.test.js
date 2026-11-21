import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SubscriptionPanel from '@/components/subscriptions/SubscriptionPanel.vue';
import { useSubscriptions } from '@/composables/useSubscriptions.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { collectTags } from '@/utils/tags.js';

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

describe('机场订阅多选标签交集筛选', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('未设置任何标签时不显示标签筛选栏', async () => {
    const subs = [
      makeSub('a', 's1', 'https://sub1.gsafevpn.com/x/token1'),
      makeSub('b', 's2', 'https://sub1.gsafevpn.com/x/token2'),
      makeSub('c', 's3', 'https://other.example.com/sub'),
    ];
    const wrapper = mountPanel(subs);
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.stub-card')).toHaveLength(3);
    expect(wrapper.find('[data-testid="subscription-tag-tabs"]').exists()).toBe(false);
  });

  it('支持多选标签交集筛选、无标签筛选以及恢复全部', async () => {
    const subs = [
      makeSub('a', '主力解锁', 'https://sub.libk.top/x/share', { tags: ['主力', '流媒体'] }),
      makeSub('b', '主力日常', 'https://sub.libk.top/x/lisir', { tags: ['主力'] }),
      makeSub('c', '免费无标', 'https://ijg.cc/helloworld'),
    ];
    const wrapper = mountPanel(subs);
    await wrapper.vm.$nextTick();

    const tabs = wrapper.get('[data-testid="subscription-tag-tabs"]');
    expect(tabs.text()).toContain('主力');
    expect(tabs.text()).toContain('流媒体');

    const mainBtn = tabs.findAll('button').find((b) => b.text() === '主力');
    await mainBtn.trigger('click');
    expect(wrapper.findAll('.stub-card')).toHaveLength(2);

    const mediaBtn = wrapper
      .get('[data-testid="subscription-tag-tabs"]')
      .findAll('button')
      .find((b) => b.text() === '流媒体');
    await mediaBtn.trigger('click');
    expect(wrapper.findAll('.stub-card')).toHaveLength(1);
    expect(wrapper.text()).toContain('主力解锁');
    expect(wrapper.text()).not.toContain('主力日常');

    await wrapper.get('[data-testid="subscription-tag-tab-untagged"]').trigger('click');
    expect(wrapper.findAll('.stub-card')).toHaveLength(1);
    expect(wrapper.text()).toContain('免费无标');

    await wrapper.get('[data-testid="subscription-tag-tab-all"]').trigger('click');
    expect(wrapper.findAll('.stub-card')).toHaveLength(3);
  });

  it('分页与标签筛选协同工作，翻页和筛选后页码正确重置', async () => {
    const subs = [
      makeSub('a', 's1', 'https://a.example.com/1', { tags: ['T1'] }),
      makeSub('b', 's2', 'https://b.example.com/2', { tags: ['T1'] }),
      makeSub('c', 's3', 'https://c.example.com/3', { tags: ['T2'] }),
    ];
    const wrapper = mountPanel(subs, { itemsPerPage: 2 });
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.stub-card')).toHaveLength(2);
    await wrapper.get('button[aria-label="Next"]').trigger('click');
    expect(wrapper.findAll('.stub-card')).toHaveLength(1);
    expect(wrapper.text()).toContain('s3');

    const t1Btn = wrapper
      .get('[data-testid="subscription-tag-tabs"]')
      .findAll('button')
      .find((b) => b.text() === 'T1');
    await t1Btn.trigger('click');
    expect(wrapper.findAll('.stub-card')).toHaveLength(2);
    expect(wrapper.text()).toContain('s1');
    expect(wrapper.text()).toContain('s2');
  });

  it('支持在 useSubscriptions 中重命名和删除标签', () => {
    const dataStore = useDataStore();
    dataStore.subscriptions = [
      makeSub('a', 's1', 'https://a.test/1', { tags: ['机场A'] }),
      makeSub('b', 's2', 'https://b.test/2', { tags: ['机场A', '流媒体'] }),
      makeSub('c', 's3', 'https://c.test/3', { tags: ['机场B', '备用'] }),
    ];

    const { subscriptionTags, activeTagFilters, setTagFilters, renameSubscriptionTag, deleteSubscriptionTag } =
      useSubscriptions(vi.fn());

    expect(subscriptionTags.value).toEqual(['机场A', '流媒体', '机场B', '备用']);

    setTagFilters(['机场A']);
    renameSubscriptionTag('机场A', '主力');
    expect(activeTagFilters.value).toEqual(['主力']);
    expect(collectTags(dataStore.subscriptions)).toEqual(['主力', '流媒体', '机场B', '备用']);

    deleteSubscriptionTag('主力');
    expect(activeTagFilters.value).toEqual([]);
    expect(subscriptionTags.value).toEqual(['流媒体', '机场B', '备用']);
  });
});
