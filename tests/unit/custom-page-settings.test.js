import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import CustomPageSettings from '@/components/settings/sections/CustomPageSettings.vue';

vi.mock('@/components/ui/Switch.vue', () => ({
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<button class="switch-stub" type="button" @click="$emit(\'update:modelValue\', !modelValue)">{{ String(modelValue) }}</button>',
  },
}));

const mountedWrappers = [];

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

const mountSettings = (settings = {}, extraProps = {}) => {
  const wrapper = mount(CustomPageSettings, {
    attachTo: document.body,
    props: {
      settings: buildSettings(settings),
      ...extraProps,
      'onUpdate:settings': (next) => wrapper.setProps({ settings: next }),
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
};

afterEach(() => {
  while (mountedWrappers.length > 0) {
    mountedWrappers.pop()?.unmount();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CustomPageSettings safety messaging & compact configuration', () => {
  it('collapses security rules into a header tooltip instead of full-width rows', () => {
    const wrapper = mountSettings();
    const trigger = wrapper.find('[data-testid="custom-page-security-tooltip-trigger"]');
    const tooltip = wrapper.find('[data-testid="custom-page-security-tooltip"]');

    expect(trigger.exists()).toBe(true);
    expect(tooltip.exists()).toBe(true);

    const tooltipText = tooltip.text();
    expect(tooltipText).toContain('External stylesheets are safely disabled');
    expect(tooltipText).toContain('Script execution is safely disabled');
    expect(tooltipText).toContain('Always disabled');
    expect(wrapper.text()).not.toContain('允许外链样式表');
    expect(wrapper.text()).not.toContain('允许脚本执行');
  });

  it('renders the 4 layout and display switches in a compact horizontal group and updates settings', async () => {
    const wrapper = mountSettings();
    const layoutGroup = wrapper.find('[data-testid="custom-page-layout-options"]');
    expect(layoutGroup.exists()).toBe(true);

    const switches = layoutGroup.findAll('.switch-stub');
    expect(switches).toHaveLength(4);

    await switches[0].trigger('click');
    await switches[1].trigger('click');
    await switches[2].trigger('click');
    await switches[3].trigger('click');

    const { useDefaultLayout, hideBranding, hideHeader, hideFooter } = wrapper.props('settings').customPage;
    expect(useDefaultLayout).toBe(false);
    expect(hideBranding).toBe(true);
    expect(hideHeader).toBe(true);
    expect(hideFooter).toBe(true);
  });

  it('keeps legacy script and external stylesheet flags disabled when applying templates', async () => {
    const wrapper = mountSettings({
      customPage: {
        allowExternalStylesheets: true,
        allowScripts: true,
      },
    });

    await wrapper.find('[data-testid="custom-page-template"]').trigger('click');

    expect(wrapper.props('settings').customPage.allowExternalStylesheets).toBe(false);
    expect(wrapper.props('settings').customPage.allowScripts).toBe(false);
  });

  it('keeps only the Dark Editorial Zine template without external site attribution and applies scoped, script-free HTML/CSS', async () => {
    const wrapper = mountSettings();

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
  });

  it('requires lightweight confirmation before overwriting existing non-empty code with a template', async () => {
    const wrapper = mountSettings({
      customPage: {
        content: '<section>My custom page</section>',
        css: '.custom { color: red; }',
      },
    });

    await wrapper.find('[data-testid="custom-page-template"]').trigger('click');
    await nextTick();

    // Should NOT immediately overwrite existing content
    expect(wrapper.props('settings').customPage.content).toBe('<section>My custom page</section>');
    const confirmBtn = document.body.querySelector('[data-testid="confirm-popover-confirm"]');
    expect(confirmBtn).not.toBeNull();

    confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(wrapper.props('settings').customPage.content).toContain('cp-ed');
    expect(wrapper.props('settings').customPage.css).toContain('.cp-ed');
  });
});

describe('CustomPageSettings live preview, fullscreen workbench, AI prompt, and HTML import', () => {
  it('renders live preview with DOMPurify sanitization, mock slots, viewport and theme toggles', async () => {
    vi.useFakeTimers();
    const wrapper = mountSettings({
      customPage: {
        content:
          '<div class="demo" onclick="alert(1)" style="color:red">Hello<script>alert(2)</script>{{hero}}{{announcements}}{{profiles}}{{guestbook}}</div>',
        css: '.demo { padding: 12px; }',
      },
    });

    const iframe = wrapper.find('[data-testid="custom-page-preview-iframe"]');
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes('sandbox')).toBe('');

    const initialSrcdoc = iframe.attributes('srcdoc') || '';
    expect(initialSrcdoc).toContain('Hello');
    expect(initialSrcdoc).toContain('data-slot="hero"');
    expect(initialSrcdoc).toContain('data-slot="announcements"');
    expect(initialSrcdoc).toContain('data-slot="profiles"');
    expect(initialSrcdoc).toContain('data-slot="guestbook"');
    expect(initialSrcdoc).not.toContain('<script>alert(2)</script>');
    expect(initialSrcdoc).not.toContain('onclick="alert(1)"');
    expect(initialSrcdoc).not.toContain('style="color:red"');

    // Toggle dark theme in preview
    await wrapper.find('[data-testid="preview-theme-dark"]').trigger('click');
    expect(wrapper.find('[data-testid="custom-page-preview-iframe"]').attributes('srcdoc')).toContain('class="dark"');

    // Toggle mobile viewport in preview
    await wrapper.find('[data-testid="preview-viewport-mobile"]').trigger('click');
    expect(wrapper.find('[data-testid="preview-viewport-mobile"]').attributes('aria-pressed')).toBe('true');

    // Edit HTML content and verify debounced preview update
    await wrapper.find('[data-testid="custom-page-html-textarea"]').setValue('<p>Updated live</p>');
    vi.advanceTimersByTime(200);
    await nextTick();
    expect(wrapper.find('[data-testid="custom-page-preview-iframe"]').attributes('srcdoc')).toContain('Updated live');
  });

  it('opens fullscreen workbench, saves on Ctrl/Cmd + S, and exits on Escape or button click', async () => {
    const wrapper = mountSettings({
      customPage: {
        content: '<div>Workbench</div>',
      },
    });

    await wrapper.find('[data-testid="custom-page-fullscreen-btn"]').trigger('click');
    await nextTick();

    const workbench = document.body.querySelector('[data-testid="custom-page-fullscreen-workbench"]');
    expect(workbench).not.toBeNull();

    const saveEvent = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });
    window.dispatchEvent(saveEvent);
    expect(saveEvent.defaultPrevented).toBe(true);
    expect(wrapper.emitted('save')).toHaveLength(1);

    const metaSaveEvent = new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true });
    window.dispatchEvent(metaSaveEvent);
    expect(metaSaveEvent.defaultPrevented).toBe(true);
    expect(wrapper.emitted('save')).toHaveLength(2);

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(escEvent);
    await nextTick();
    expect(document.body.querySelector('[data-testid="custom-page-fullscreen-workbench"]')).toBeNull();

    // Re-open and close via close button
    await wrapper.find('[data-testid="custom-page-fullscreen-btn"]').trigger('click');
    await nextTick();
    const closeBtn = document.body.querySelector('[data-testid="custom-page-fullscreen-close"]');
    expect(closeBtn).not.toBeNull();
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(document.body.querySelector('[data-testid="custom-page-fullscreen-workbench"]')).toBeNull();
  });

  it('copies the standardized AI customization prompt with all placeholders and CSS variables', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    const wrapper = mountSettings();
    await wrapper.find('[data-testid="custom-page-copy-ai-prompt"]').trigger('click');
    await nextTick();

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const prompt = writeTextMock.mock.calls[0][0];
    expect(prompt).toContain('{{profiles}}');
    expect(prompt).toContain('{{announcements}}');
    expect(prompt).toContain('{{hero}}');
    expect(prompt).toContain('{{guestbook}}');
    expect(prompt).toContain('{{theme_toggle}}');
    expect(prompt).toContain('{{title}}');
    expect(prompt).toContain('{{description}}');
    expect(prompt).toContain('{{profile_count}}');
    expect(prompt).toContain('{{node_count}}');
    expect(prompt).toContain('{{version}}');
    expect(prompt).toContain('--canvas');
    expect(prompt).toContain('--surface');
    expect(prompt).toContain('--fg');
    expect(prompt).toContain('--line');
    expect(prompt).toContain('--accent');
    expect(prompt).toContain('DOMPurify');
  });

  it('imports an .html file and splits style tags from body markup while stripping scripts', async () => {
    const wrapper = mountSettings();
    const fileInput = wrapper.find('[data-testid="custom-page-html-file-input"]');
    const htmlSource = `<!DOCTYPE html>
<html>
  <head>
    <style>body { background: #111; } .hero-card { color: #fff; }</style>
  </head>
  <body class="landing">
    <main class="hero-card">{{profiles}}</main>
    <script>window.hacked = true;</script>
  </body>
</html>`;

    const mockFile = {
      name: 'custom-landing.html',
      size: htmlSource.length,
      type: 'text/html',
      text: vi.fn().mockResolvedValue(htmlSource),
    };

    Object.defineProperty(fileInput.element, 'files', {
      value: [mockFile],
      configurable: true,
    });

    await fileInput.trigger('change');
    await nextTick();
    await nextTick();

    const updated = wrapper.props('settings').customPage;
    expect(updated.content).toContain('hero-card');
    expect(updated.content).toContain('{{profiles}}');
    expect(updated.content).toContain('custom-page-body');
    expect(updated.content).not.toContain('<script');
    expect(updated.css).toContain('.custom-page-body { background: #111; }');
    expect(updated.css).toContain('.hero-card { color: #fff; }');
    expect(updated.allowScripts).toBe(false);
    expect(updated.allowExternalStylesheets).toBe(false);
  });
});
