import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import NavActionGroup from '../../src/components/layout/NavActionGroup.vue';
import { useUIStore } from '../../src/stores/ui.js';

function makeRouter() {
    return createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', name: 'Home', component: { render: () => null } },
            { path: '/dashboard', name: 'Dashboard', component: { render: () => null } },
            { path: '/explore', name: 'Explore', component: { render: () => null } },
        ],
    });
}

async function mountNavActionGroup(layoutMode = 'modern') {
    const pinia = createPinia();
    setActivePinia(pinia);
    const uiStore = useUIStore();
    uiStore.layoutMode = layoutMode;

    const router = makeRouter();
    await router.push('/dashboard');
    await router.isReady();

    return mount(NavActionGroup, {
        props: {
            isLoggedIn: true,
        },
        global: {
            plugins: [pinia, router],
            stubs: {
                ThemeToggle: true,
                LanguageSwitcher: true,
            },
        },
    });
}

describe('NavActionGroup 切换布局按钮', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('现代布局与经典布局下显示不同的图标与提示文案', async () => {
        const modernWrapper = await mountNavActionGroup('modern');
        const modernBtn = modernWrapper.find('[data-testid="layout-toggle-btn"]');
        expect(modernBtn.exists()).toBe(true);
        expect(modernBtn.attributes('aria-pressed')).toBe('false');
        const modernSvg = modernBtn.find('svg').html();
        const modernTitle = modernBtn.attributes('title');

        const legacyWrapper = await mountNavActionGroup('legacy');
        const legacyBtn = legacyWrapper.find('[data-testid="layout-toggle-btn"]');
        expect(legacyBtn.exists()).toBe(true);
        expect(legacyBtn.attributes('aria-pressed')).toBe('true');
        const legacySvg = legacyBtn.find('svg').html();
        const legacyTitle = legacyBtn.attributes('title');

        expect(modernSvg).not.toBe(legacySvg);
        expect(modernTitle).not.toBe(legacyTitle);

        modernWrapper.unmount();
        legacyWrapper.unmount();
    });

    it('点击切换布局按钮会触发 toggleLayout 事件', async () => {
        const wrapper = await mountNavActionGroup('modern');
        await wrapper.find('[data-testid="layout-toggle-btn"]').trigger('click');
        expect(wrapper.emitted('toggleLayout')).toHaveLength(1);
        wrapper.unmount();
    });
});

