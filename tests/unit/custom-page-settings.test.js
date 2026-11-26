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

const mountSettings = (settings = {}) => {
  const wrapper = mount(CustomPageSettings, {
    props: {
      settings: buildSettings(settings),
      'onUpdate:settings': (next) => wrapper.setProps({ settings: next }),
    },
  });
  return wrapper;
};

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

  it('keeps only the Dark Editorial Zine template without external site attribution and applies scoped, script-free HTML/CSS', async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);
    const wrapper = mountSettings();

    try {
      const buttons = wrapper.findAll('[data-testid="custom-page-template"]');
      expect(buttons.length).toBe(1);

      const templateText = buttons[0].text();
      expect(templateText).toContain('Dark Editorial Zine');
      expect(templateText).not.toContain('saas.sin.fan');
      expect(templateText).not.toContain('Minimal navigation');
      expect(templateText).not.toContain('Personal homepage');
      expect(templateText).not.toContain('Subscription portal');

      await buttons[0].trigger('click');
      const { content, css, useDefaultLayout, hideHeader, hideFooter, hideBranding } =
        wrapper.props('settings').customPage;

      expect(content).toBeTruthy();
      expect(css).toBeTruthy();
      expect(content).not.toMatch(/<script/i);
      expect(css).not.toMatch(/(^|\n)\s*\*\s*\{/);
      expect(useDefaultLayout).toBe(false);
      expect(hideHeader).toBe(true);
      expect(hideFooter).toBe(true);
      expect(hideBranding).toBe(true);
    } finally {
      window.confirm = originalConfirm;
    }
  });
});
