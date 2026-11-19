import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsView from '@/views/SettingsView.vue';
import SettingsSidebar from '@/components/settings/SettingsSidebar.vue';
import { createI18n } from '@/i18n/index.js';
import { SETTINGS_ACTIVE_TAB_STORAGE_KEY, resolveSettingsTab } from '@/utils/dashboard-deeplink.js';

const route = reactive({ query: {}, path: '/dashboard/settings' });
const replaceSpy = vi.fn((target) => {
    if (target?.query) {
        route.query = { ...target.query };
    }
    return Promise.resolve();
});

vi.mock('vue-router', async () => {
    const actual = await vi.importActual('vue-router');
    return {
        ...actual,
        useRoute: () => route,
        useRouter: () => ({ push: vi.fn(), replace: replaceSpy }),
    };
});

vi.mock('@/composables/useSettingsLogic.js', () => ({
    useSettingsLogic: () => ({
        settings: { mytoken: 'stable-token', profileToken: 'share-token' },
        disguiseConfig: {},
        isLoading: false,
        isSaving: false,
        restartCountdown: null,
        hasWhitespace: false,
        loadSettings: vi.fn(),
        handleSave: vi.fn(),
        handleReset: vi.fn(),
        exportBackup: vi.fn(),
        importBackup: vi.fn(),
    }),
}));

const mountedWrappers = [];

function mountSettingsView() {
    const wrapper = mount(SettingsView, {
        global: {
            plugins: [createPinia(), createI18n({ initialLocale: 'zh-CN' })],
            stubs: {
                BasicSettings: true,
                HomeSettings: true,
                GlobalSettings: true,
                ServiceSettings: true,
                CustomPageSettings: true,
                SystemSettings: true,
                WebdavBackupSettings: true,
            },
        },
    });
    mountedWrappers.push(wrapper);
    return wrapper;
}

describe('Settings navigation persistence & responsive sidebar UX', () => {
    beforeEach(() => {
        replaceSpy.mockClear();
        route.query = {};
        route.path = '/dashboard/settings';
        sessionStorage.clear();
        setActivePinia(createPinia());
    });

    afterEach(() => {
        while (mountedWrappers.length > 0) {
            mountedWrappers.pop().unmount();
        }
        sessionStorage.clear();
    });

    describe('resolveSettingsTab', () => {
        it('normalises valid tab ids and rejects unknown values', () => {
            expect(resolveSettingsTab('service')).toBe('service');
            expect(resolveSettingsTab('  SYSTEM ')).toBe('system');
            expect(resolveSettingsTab('custom-page')).toBe('custom-page');
            expect(resolveSettingsTab('customPage')).toBe('custom-page');
            expect(resolveSettingsTab('unknown')).toBeNull();
            expect(resolveSettingsTab('')).toBeNull();
            expect(resolveSettingsTab(null)).toBeNull();
        });
    });

    describe('SettingsView tab persistence across refresh and navigation', () => {
        it('restores activeTab from URL ?tab= query on refresh instead of resetting to basic', () => {
            route.query = { tab: 'service' };
            const wrapper = mountSettingsView();

            expect(wrapper.vm.activeTab).toBe('service');
            expect(sessionStorage.getItem(SETTINGS_ACTIVE_TAB_STORAGE_KEY)).toBe('service');
        });

        it('updates URL query via router.replace and sessionStorage when switching tabs', async () => {
            const wrapper = mountSettingsView();
            expect(wrapper.vm.activeTab).toBe('basic');

            const serviceBtn = wrapper.find('[data-desktop-tab="service"]');
            await serviceBtn.trigger('click');

            expect(wrapper.vm.activeTab).toBe('service');
            expect(replaceSpy).toHaveBeenCalledWith({ query: { tab: 'service' } });
            expect(sessionStorage.getItem(SETTINGS_ACTIVE_TAB_STORAGE_KEY)).toBe('service');

            // Switching back to basic cleans up ?tab from the URL
            const basicBtn = wrapper.find('[data-desktop-tab="basic"]');
            await basicBtn.trigger('click');

            expect(wrapper.vm.activeTab).toBe('basic');
            expect(replaceSpy).toHaveBeenLastCalledWith({ query: {} });
            expect(sessionStorage.getItem(SETTINGS_ACTIVE_TAB_STORAGE_KEY)).toBe('basic');
        });

        it('restores last visited tab from sessionStorage when re-entering /dashboard/settings without query', () => {
            sessionStorage.setItem(SETTINGS_ACTIVE_TAB_STORAGE_KEY, 'system');
            const wrapper = mountSettingsView();

            expect(wrapper.vm.activeTab).toBe('system');
            expect(replaceSpy).toHaveBeenCalledWith({ query: { tab: 'system' } });
        });

        it('clears stale ?focus query param when user manually switches to another tab', async () => {
            Element.prototype.scrollIntoView = vi.fn();
            route.query = { focus: 'mytoken' };
            const wrapper = mountSettingsView();
            expect(wrapper.vm.activeTab).toBe('basic');

            await wrapper.find('[data-desktop-tab="global"]').trigger('click');

            expect(wrapper.vm.activeTab).toBe('global');
            expect(replaceSpy).toHaveBeenCalledWith({ query: { tab: 'global' } });
        });

        it('reacts to browser history changes on route.query.tab', async () => {
            route.query = { tab: 'service' };
            const wrapper = mountSettingsView();
            expect(wrapper.vm.activeTab).toBe('service');

            route.query = { tab: 'custom-page' };
            await wrapper.vm.$nextTick();
            expect(wrapper.vm.activeTab).toBe('custom-page');

            route.query = {};
            await wrapper.vm.$nextTick();
            expect(wrapper.vm.activeTab).toBe('basic');
        });
    });

    describe('SettingsSidebar mobile & desktop ergonomics', () => {
        it('uses a single-row horizontal scrollable tablist on mobile instead of a multi-row grid', () => {
            const wrapper = mount(SettingsSidebar, {
                props: { activeTab: 'basic' },
                global: {
                    plugins: [createI18n({ initialLocale: 'zh-CN' })],
                },
            });

            const mobileTablist = wrapper.find('[data-testid="settings-mobile-tablist"]');
            expect(mobileTablist.exists()).toBe(true);
            expect(mobileTablist.classes()).toContain('overflow-x-auto');
            expect(mobileTablist.classes()).not.toContain('grid-cols-2');

            const mobileButtons = mobileTablist.findAll('[role="tab"]');
            expect(mobileButtons).toHaveLength(6);
            mobileButtons.forEach((btn) => {
                expect(btn.classes()).toContain('whitespace-nowrap');
                expect(btn.classes()).toContain('shrink-0');
            });
        });

        it('opens the mobile quick-switcher menu, selects a tab, and closes on Escape', async () => {
            const wrapper = mount(SettingsSidebar, {
                props: { activeTab: 'basic' },
                global: {
                    plugins: [createI18n({ initialLocale: 'zh-CN' })],
                },
            });

            expect(wrapper.find('[data-testid="settings-mobile-menu"]').exists()).toBe(false);

            const trigger = wrapper.find('[data-testid="settings-mobile-menu-trigger"]');
            await trigger.trigger('click');

            const menu = wrapper.find('[data-testid="settings-mobile-menu"]');
            expect(menu.exists()).toBe(true);
            expect(menu.text()).toContain('站点展示');
            expect(menu.text()).toContain('转换引擎、DNS、Bot 与定时');

            // Press Escape closes menu
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            await wrapper.vm.$nextTick();
            expect(wrapper.find('[data-testid="settings-mobile-menu"]').exists()).toBe(false);

            // Re-open and pick a section
            await trigger.trigger('click');
            const buttons = wrapper.find('[data-testid="settings-mobile-menu"]').findAll('button');
            const serviceItem = buttons.find((b) => b.text().includes('服务集成'));
            await serviceItem.trigger('click');

            expect(wrapper.emitted('update:activeTab')?.[0]).toEqual(['service']);
            expect(wrapper.find('[data-testid="settings-mobile-menu"]').exists()).toBe(false);
            wrapper.unmount();
        });

        it('supports keyboard ArrowDown / ArrowUp / End / Home navigation on desktop tabs', async () => {
            const wrapper = mount(SettingsSidebar, {
                props: { activeTab: 'basic' },
                global: {
                    plugins: [createI18n({ initialLocale: 'en-US' })],
                },
            });

            // English copy check (no Chinese or raw keys)
            expect(wrapper.text()).toContain('Tokens, language & access control');
            expect(wrapper.text()).not.toMatch(/[\u4e00-\u9fff]/);
            expect(wrapper.text()).not.toContain('settings.');

            const basicTab = wrapper.find('[data-desktop-tab="basic"]');
            await basicTab.trigger('keydown', { key: 'ArrowDown' });
            expect(wrapper.emitted('update:activeTab')?.[0]).toEqual(['home']);

            await basicTab.trigger('keydown', { key: 'End' });
            expect(wrapper.emitted('update:activeTab')?.[1]).toEqual(['system']);
        });

        it('integrates scroll-to-top inside the teleported floating settings footer when scrolled down', async () => {
            const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
            Object.defineProperty(window, 'scrollY', {
                value: 0,
                writable: true,
                configurable: true,
            });

            const wrapper = mountSettingsView();
            const teleportedFooter = document.body.querySelector('[data-testid="settings-footer"]');
            expect(teleportedFooter).not.toBeNull();
            expect(wrapper.element.contains(teleportedFooter)).toBe(false);
            expect(
                document.body.querySelector('[data-testid="settings-footer-scroll-top"]')
            ).toBeNull();

            window.scrollY = 420;
            window.dispatchEvent(new Event('scroll'));
            await new Promise((resolve) => window.requestAnimationFrame(resolve));
            await wrapper.vm.$nextTick();

            const scrollTopBtn = document.body.querySelector(
                '[data-testid="settings-footer-scroll-top"]'
            );
            expect(scrollTopBtn).not.toBeNull();

            scrollTopBtn.click();
            await wrapper.vm.$nextTick();
            expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

            window.scrollY = 0;
            scrollToSpy.mockRestore();
            wrapper.unmount();
            expect(document.body.querySelector('[data-testid="settings-footer"]')).toBeNull();
        });
    });
});
