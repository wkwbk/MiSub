import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MySubscriptionsView from '@/views/MySubscriptionsView.vue';
import { createI18n } from '@/i18n/index.js';
import { useDataStore } from '@/stores/useDataStore.js';

vi.mock('@/components/modals/LogModal.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/modals/ProfileModal.vue', () => ({
    default: { template: '<div />' },
}));
vi.mock('@/components/modals/NodePreview/NodePreviewModal.vue', () => ({
    default: { template: '<div />' },
}));
vi.mock('@/components/profiles/ProfilePanel.vue', () => ({
    default: { template: '<div />' },
}));
vi.mock('@/utils/network-error.js', () => ({
    showNetworkError: vi.fn(),
    isNetworkError: vi.fn(() => false),
}));
vi.mock('@/components/modals/QRCodeModal.vue', () => ({
    default: { template: '<div />' },
}));
vi.mock('@/components/modals/CopyLinkModal.vue', () => ({
    default: { template: '<div />' },
}));

const route = reactive({ query: {}, path: '/dashboard/settings' });

vi.mock('vue-router', async () => {
    const actual = await vi.importActual('vue-router');
    return {
        ...actual,
        useRoute: () => route,
        useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    };
});

// VTU 为了匹配 stub 名称会触发 defineAsyncComponent 的 loader，stub 并不能阻止真实模块被动态加载；
// 直接 mock 模块本身，避免测试结束后仍有真实 import 在途。
vi.mock('@/components/modals/TagManagementModal.vue', () => ({
    default: { name: 'TagManagementModal', template: '<div />' },
}));

const scrollSpy = vi.fn();
const mountedWrappers = [];
afterEach(() => {
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});

function mountView() {
    const wrapper = mount(MySubscriptionsView, {
        global: {
            plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
            stubs: {
                ProfilePanel: true,
                Modal: true,
                LogModal: true,
                ProfileModal: true,
                NodePreviewModal: true,
                QRCodeModal: true,
                CopyLinkModal: true,
            },
        },
    });
    mountedWrappers.push(wrapper);
    return wrapper;
}

describe('MySubscriptionsView 深链 focus (?focus=profiles)', () => {
    beforeEach(() => {
        scrollSpy.mockClear();
        route.query = {};
        route.path = '/dashboard/subscriptions';
        setActivePinia(createPinia());
        useDataStore().profiles = [];
        Element.prototype.scrollIntoView = scrollSpy;
    });

    it('exposes a stable anchor for the profiles section', () => {
        const wrapper = mountView();
        expect(wrapper.find('[data-testid="profiles-section"]').exists()).toBe(true);
    });

    it('scrolls to the profiles section when ?focus=profiles', async () => {
        route.query = { focus: 'profiles' };
        const wrapper = mountView();
        await wrapper.vm.$nextTick();

        expect(scrollSpy).toHaveBeenCalled();
    });

    it('does not scroll when no focus is requested', async () => {
        const wrapper = mountView();
        await wrapper.vm.$nextTick();

        expect(scrollSpy).not.toHaveBeenCalled();
    });

    it('ignores an unrecognised focus value', async () => {
        route.query = { focus: 'mytoken' };
        const wrapper = mountView();
        await wrapper.vm.$nextTick();

        // mytoken belongs to the settings page, not the subscriptions page.
        expect(scrollSpy).not.toHaveBeenCalled();
    });
});
