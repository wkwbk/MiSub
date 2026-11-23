import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import CustomPageSettings from '@/components/settings/sections/CustomPageSettings.vue';

vi.mock('@/components/ui/Switch.vue', () => ({
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<button class="switch-stub" type="button" @click="$emit(\'update:modelValue\', !modelValue)">{{ String(modelValue) }}</button>',
  },
}));

const buildSettings = (settings = {}) => ({
  ...settings,
  customPage: {
    enabled: true,
    type: 'html',
    content: '',
    css: '',
    useDefaultLayout: true,
    allowExternalStylesheets: true,
    allowScripts: true,
    hideBranding: false,
    hideHeader: false,
    hideFooter: false,
    ...settings.customPage,
  },
});

const mountSettings = (settings = {}) =>
  mount(CustomPageSettings, {
    props: {
      settings: buildSettings(settings),
    },
  });

describe('CustomPageSettings safety messaging', () => {
  it('shows fixed-disabled security messaging instead of toggles for scripts and external stylesheets', () => {
    const wrapper = mountSettings();
    const text = wrapper.text();

    expect(text).toContain('External stylesheets are safely disabled');
    expect(text).toContain('Script execution is safely disabled');
    expect(text).toContain('Always disabled');
    expect(text).not.toContain('允许外链样式表');
    expect(text).not.toContain('允许脚本执行');
  });

  it('keeps legacy script and external stylesheet flags disabled when applying templates', async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);
    const wrapper = mountSettings({
      customPage: {
        allowExternalStylesheets: true,
        allowScripts: true,
      },
    });

    try {
      await wrapper.find('[data-testid="custom-page-template"]').trigger('click');

      expect(wrapper.props('settings').customPage.allowExternalStylesheets).toBe(false);
      expect(wrapper.props('settings').customPage.allowScripts).toBe(false);
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it('applies scoped, script-free preset templates without global CSS resets', async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);
    const wrapper = mountSettings();

    try {
      const buttons = wrapper.findAll('[data-testid="custom-page-template"]');
      expect(buttons.length).toBe(3);

      for (const button of buttons) {
        await button.trigger('click');
        const { content, css } = wrapper.props('settings').customPage;

        expect(content).toBeTruthy();
        expect(css).toBeTruthy();
        expect(content).not.toMatch(/<script/i);
        expect(css).not.toMatch(/(^|\n)\s*\*\s*\{/);
      }

      // First template (Minimal Nav) auto-applies immersive fullscreen layout preset
      await buttons[0].trigger('click');
      expect(wrapper.props('settings').customPage.useDefaultLayout).toBe(false);
      expect(wrapper.props('settings').customPage.hideHeader).toBe(true);
      expect(wrapper.props('settings').customPage.hideFooter).toBe(true);

      // Third template (Sub Portal) keeps native header & footer
      await buttons[2].trigger('click');
      expect(wrapper.props('settings').customPage.useDefaultLayout).toBe(false);
      expect(wrapper.props('settings').customPage.hideHeader).toBe(false);
      expect(wrapper.props('settings').customPage.hideFooter).toBe(false);
    } finally {
      window.confirm = originalConfirm;
    }
  });
});
