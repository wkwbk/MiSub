import { defineComponent, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrollToPaginationStart } from '@/utils/scroll.js';
import { useStickyColumns } from '@/composables/useStickyColumn.js';
import PanelPagination from '@/components/shared/PanelPagination.vue';
import NodeTable from '@/components/nodes/ManualNodePanel/NodeTable.vue';
import ProfilePanel from '@/components/profiles/ProfilePanel.vue';
import SubscriptionPanel from '@/components/subscriptions/SubscriptionPanel.vue';
import LogModal from '@/components/modals/LogModal.vue';
import { createI18n } from '@/i18n/index.js';
import { api } from '@/lib/http.js';

vi.mock('@/lib/http.js', () => ({
  api: {
    get: vi.fn(),
    del: vi.fn(),
  },
}));

describe('scrollToPaginationStart utility', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('scrolls window back to target start below sticky nav bar when target is scrolled past top', () => {
    const header = document.createElement('header');
    header.classList.add('app-nav-bar');
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 56,
      height: 56,
      width: 1200,
      left: 0,
      right: 1200,
    });
    document.body.appendChild(header);

    const target = document.createElement('div');
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      top: -240,
      bottom: 300,
      height: 540,
      width: 800,
      left: 0,
      right: 800,
    });
    document.body.appendChild(target);

    Object.defineProperty(window, 'scrollY', { value: 600, configurable: true });
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    scrollToPaginationStart(target);

    // topOffset = 56 + 16 = 72; nextTop = 600 + (-240) - 72 = 288
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 288, behavior: 'smooth' });
  });

  it('does not scroll window when target top is already visible below sticky header', () => {
    const header = document.createElement('header');
    header.className = 'app-nav-bar';
    header.getBoundingClientRect = () => ({ top: 0, bottom: 56, height: 56, width: 1200, left: 0, right: 1200 });
    document.body.appendChild(header);

    const target = document.createElement('div');
    target.getBoundingClientRect = () => ({ top: 120, bottom: 400, height: 280, width: 800, left: 0, right: 800 });
    document.body.appendChild(target);

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    scrollToPaginationStart(target);

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('uses auto behavior when prefers-reduced-motion is enabled', () => {
    const target = document.createElement('div');
    target.getBoundingClientRect = () => ({ top: -100, bottom: 300, height: 400, width: 800, left: 0, right: 800 });
    document.body.appendChild(target);

    Object.defineProperty(window, 'scrollY', { value: 400, configurable: true });
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true });
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    scrollToPaginationStart(target);

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 284, behavior: 'auto' });
  });

  it('scrolls a scrollable target container itself back to top 0', () => {
    const scroller = document.createElement('div');
    scroller.scrollTop = 320;
    const scrollToSpy = vi.fn();
    scroller.scrollTo = scrollToSpy;
    document.body.appendChild(scroller);

    scrollToPaginationStart(scroller);

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('scrolls the nearest scrollable ancestor to bring target back to container start', () => {
    const modalBody = document.createElement('div');
    modalBody.scrollTop = 500;
    modalBody.getBoundingClientRect = () => ({ top: 100, bottom: 700, height: 600, width: 800, left: 0, right: 800 });
    const scrollToSpy = vi.fn();
    modalBody.scrollTo = scrollToSpy;

    const listStart = document.createElement('div');
    listStart.getBoundingClientRect = () => ({ top: -180, bottom: 600, height: 780, width: 800, left: 0, right: 800 });
    modalBody.appendChild(listStart);
    document.body.appendChild(modalBody);

    scrollToPaginationStart(listStart);

    // relativeTop = -180 - 100 = -280; nextTop = 500 + (-280) - 12 = 208
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 208, behavior: 'smooth' });
  });
});

describe('Pagination auto-scroll integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('PanelPagination does not emit change-page when jumping to current page', async () => {
    const wrapper = mount(PanelPagination, {
      props: {
        variant: 'panel',
        currentPage: 2,
        totalPages: 5,
      },
      global: {
        plugins: [createI18n({ initialLocale: 'zh-CN' })],
      },
    });

    const input = wrapper.get('input[type="number"]');
    await input.setValue('2');
    await input.trigger('blur');
    expect(wrapper.emitted('change-page')).toBeUndefined();

    await input.setValue('3');
    await input.trigger('keydown.enter');
    expect(wrapper.emitted('change-page')).toEqual([[3]]);
  });

  it('NodeTable scrolls back to list start when switching page', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });

    const wrapper = mount(NodeTable, {
      attachTo: document.body,
      props: {
        manualNodes: [{ id: 'n1', name: 'Node 1', url: 'ss://a' }],
        paginatedNodes: [{ id: 'n1', name: 'Node 1', url: 'ss://a' }],
        filteredNodes: [{ id: 'n1', name: 'Node 1', url: 'ss://a' }],
        selectedNodeIds: new Set(),
        basePage: 1,
        baseTotalPages: 3,
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: {
          ManualNodeCard: { template: '<div class="node-card-stub"></div>' },
          draggable: { template: '<div><slot name="item" v-for="el in modelValue" :element="el" /></div>', props: ['modelValue'] },
        },
      },
    });

    wrapper.element.getBoundingClientRect = () => ({ top: -200, bottom: 400, height: 600, width: 800, left: 0, right: 800 });

    const nextBtn = wrapper.get('button[aria-label="下一页"]');
    await nextBtn.trigger('click');
    await nextTick();

    expect(wrapper.emitted('change-page')).toEqual([[2]]);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 284, behavior: 'smooth' });

    wrapper.unmount();
  });

  it('ProfilePanel scrolls back to list start when switching page', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { value: 450, configurable: true });

    const profiles = [{ id: 'p1', name: 'Profile 1', enabled: true }];
    const wrapper = mount(ProfilePanel, {
      attachTo: document.body,
      props: {
        profiles,
        paginatedProfiles: profiles,
        currentPage: 1,
        totalPages: 3,
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: {
          ProfileCard: { template: '<div class="profile-card-stub"></div>' },
          MoreActionsMenu: { template: '<div><slot name="menu" :close="() => {}" /></div>' },
          draggable: { template: '<div><slot name="item" v-for="el in modelValue" :element="el" /></div>', props: ['modelValue'] },
        },
      },
    });

    const listContainer = wrapper.find('.profile-card-stub').element.parentElement.parentElement.parentElement;
    listContainer.getBoundingClientRect = () => ({ top: -150, bottom: 400, height: 550, width: 800, left: 0, right: 800 });

    const nextBtn = wrapper.get('button[aria-label="下一页"]');
    await nextBtn.trigger('click');
    await nextTick();

    expect(wrapper.emitted('changePage')).toEqual([[2]]);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 284, behavior: 'smooth' });

    wrapper.unmount();
  });

  it('SubscriptionPanel scrolls back to list start when switching page', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { value: 450, configurable: true });

    const subscriptions = [
      { id: 's1', name: 'Sub 1', url: 'https://example.com/1', enabled: true },
      { id: 's2', name: 'Sub 2', url: 'https://example.com/2', enabled: true },
      { id: 's3', name: 'Sub 3', url: 'https://example.com/3', enabled: true },
    ];
    const wrapper = mount(SubscriptionPanel, {
      attachTo: document.body,
      props: {
        subscriptions,
        itemsPerPage: 2,
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: {
          Card: { props: ['misub'], template: '<div class="sub-card-stub">{{ misub.name }}</div>' },
          MoreActionsMenu: { template: '<div><slot name="menu" :close="() => {}" /></div>' },
          draggable: { template: '<div><slot name="item" v-for="el in modelValue" :element="el" /></div>', props: ['modelValue'] },
        },
      },
    });

    const listContainer = wrapper.find('.sub-card-stub').element.parentElement.parentElement.parentElement;
    listContainer.getBoundingClientRect = () => ({ top: -150, bottom: 400, height: 550, width: 800, left: 0, right: 800 });

    const nextBtn = wrapper.get('button[aria-label="下一页"]');
    await nextBtn.trigger('click');
    await nextTick();

    expect(wrapper.emitted('changePage')).toEqual([[2]]);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 284, behavior: 'smooth' });

    wrapper.unmount();
  });

  it('LogModal scrolls its log list container back to top when switching page', async () => {
    const logs = Array.from({ length: 25 }, (_, i) => ({
      id: `log-${i + 1}`,
      profileName: 'Main',
      status: 'success',
      timestamp: Date.now() - i * 1000,
      clientIp: '127.0.0.1',
      userAgent: 'Clash/1.0',
    }));
    api.get.mockResolvedValue({ data: logs });

    const wrapper = mount(LogModal, {
      attachTo: document.body,
      props: {
        show: false,
      },
      global: {
        plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
        stubs: {
          Modal: {
            props: ['show'],
            template: '<div v-if="show"><slot name="title" /><slot name="body" /></div>',
          },
        },
      },
    });

    await wrapper.setProps({ show: true });
    await nextTick();
    await nextTick();

    const scrollContainer = wrapper.get('.overflow-y-auto').element;
    scrollContainer.scrollTop = 420;
    const scrollToSpy = vi.fn();
    scrollContainer.scrollTo = scrollToSpy;

    const buttons = wrapper.findAll('button');
    const nextBtn = buttons.find((btn) => btn.text().trim() === '下一页');
    await nextBtn.trigger('click');
    await nextTick();

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

    wrapper.unmount();
  });

  it('useStickyColumns refreshStickyColumnsNow updates sticky-bottom top synchronously when column shrinks on pagination', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 1200, configurable: true });

    let rightHeight = 1500;
    const gridRef = ref(null);
    const leftColRef = ref(null);
    const rightColRef = ref(null);

    const Harness = defineComponent({
      setup() {
        const apiSticky = useStickyColumns(gridRef, [leftColRef, rightColRef]);
        return { gridRef, leftColRef, rightColRef, ...apiSticky };
      },
      template: '<div ref="gridRef"><div ref="leftColRef"></div><div ref="rightColRef"></div></div>',
    });

    const wrapper = mount(Harness, { attachTo: document.body });

    Object.defineProperty(gridRef.value, 'offsetHeight', { get: () => 2500, configurable: true });
    gridRef.value.getBoundingClientRect = () => ({ top: -1050, bottom: 1450, height: 2500, width: 1200, left: 0, right: 1200 });
    Object.defineProperty(leftColRef.value, 'offsetHeight', { get: () => 2500, configurable: true });
    Object.defineProperty(rightColRef.value, 'offsetHeight', { get: () => rightHeight, configurable: true });

    // 初始进入 sticky-bottom: minTop = 900 - 24 - 1500 = -624px
    wrapper.vm.refreshStickyColumnsNow();
    expect(rightColRef.value.style.position).toBe('sticky');
    expect(rightColRef.value.style.top).toBe('-624px');

    // 模拟切换下一页后右侧栏少了一项导致高度缩短 200px -> minTop = 900 - 24 - 1300 = -424px
    rightHeight = 1300;
    wrapper.vm.refreshStickyColumnsNow();
    expect(rightColRef.value.style.position).toBe('sticky');
    expect(rightColRef.value.style.top).toBe('-424px');

    wrapper.unmount();
  });
});
