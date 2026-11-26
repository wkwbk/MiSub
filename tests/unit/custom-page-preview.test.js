import { describe, expect, it } from 'vitest';
import { buildCustomPagePreviewSrcdoc } from '@/utils/custom-page-preview.js';
import { buildCustomPageAiPrompt } from '@/utils/custom-page-ai-prompt.js';
import { CUSTOM_PAGE_TEMPLATES } from '@/constants/custom-page-templates.js';

describe('buildCustomPagePreviewSrcdoc', () => {
  it('sanitizes unsafe HTML via DOMPurify and populates built-in mock placeholders', () => {
    const srcdoc = buildCustomPagePreviewSrcdoc({
      content: `
        <section class="wrap">
          <h1>{{title}} v{{version}}</h1>
          <p>{{description}} ({{profile_count}} / {{node_count}})</p>
          <div onclick="alert(1)" style="background:red">Unsafe attrs<img src="x" onerror="alert(2)"></div>
          <script>alert('xss')</script>
          {{hero}}
          {{announcements}}
          {{profiles}}
          {{guestbook}}
          {{theme_toggle}}
        </section>
      `,
      css: '.wrap { padding: 16px; }',
      theme: 'dark',
      useDefaultLayout: false,
      hideBranding: true,
      hideHeader: true,
      hideFooter: true,
      locale: 'zh-CN',
      siteTitle: 'My Custom Hub',
      siteDescription: 'Custom description text',
      version: '2.9.0',
    });

    expect(srcdoc).toContain('<html lang="zh-CN" class="dark">');
    expect(srcdoc).toContain('My Custom Hub v2.9.0');
    expect(srcdoc).toContain('Custom description text (3 / 68)');
    expect(srcdoc).toContain('data-slot="hero"');
    expect(srcdoc).toContain('data-slot="announcements"');
    expect(srcdoc).toContain('data-slot="profiles"');
    expect(srcdoc).toContain('data-slot="guestbook"');
    expect(srcdoc).toContain('data-slot="theme_toggle"');
    expect(srcdoc).toContain('misub-mock-profiles-grid');
    expect(srcdoc).not.toContain('alert(\'xss\')');
    expect(srcdoc).not.toContain('onclick="alert(1)"');
    expect(srcdoc).not.toContain('onerror="alert(2)"');
    expect(srcdoc).not.toContain('style="background:red"');
    expect(srcdoc).not.toContain('<header class="misub-preview-header">');
    expect(srcdoc).not.toContain('<footer class="misub-preview-footer">');
    expect(srcdoc).toContain('misub-preview-custom-layout');
  });

  it('escapes </style> sequences in user CSS and respects layout/header/footer toggles', () => {
    const srcdoc = buildCustomPagePreviewSrcdoc({
      content: '<div>{{profiles}}</div>',
      css: '.a { color: red; } </style><script>alert(1)</script>',
      theme: 'light',
      useDefaultLayout: true,
      hideBranding: false,
      hideHeader: false,
      hideFooter: false,
      locale: 'en-US',
      version: '2.9.0',
    });

    expect(srcdoc).toContain('<html lang="en-US" class="">');
    expect(srcdoc).toContain('misub-preview-default-layout');
    expect(srcdoc).toContain('<header class="misub-preview-header">');
    expect(srcdoc).toContain('<footer class="misub-preview-footer">');
    expect(srcdoc).toContain('Powered by MiSub');
    expect(srcdoc).toContain('<\\/style>');
    expect(srcdoc).not.toContain('</style><script>');
  });
});

describe('buildCustomPageAiPrompt', () => {
  it('returns localized prompt containing all placeholders and CSS variables for zh-CN and en-US', () => {
    const zhPrompt = buildCustomPageAiPrompt('zh-CN');
    const enPrompt = buildCustomPageAiPrompt('en-US');

    for (const prompt of [zhPrompt, enPrompt]) {
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
      expect(prompt).toContain('--accent');
      expect(prompt).toContain('--fg');
      expect(prompt).toContain('--line');
    }

    expect(zhPrompt).toContain('自定义公开页');
    expect(enPrompt).toContain('Custom Public Page');
  });
});

describe('Editorial Zine template adaptive light & dark modes', () => {
  it('supports both light and dark tokens without html.dark selector and includes theme_toggle', () => {
    const tpl = CUSTOM_PAGE_TEMPLATES[0];
    expect(tpl.id).toBe('editorial-zine');
    expect(tpl.content).toContain('{{theme_toggle}}');
    expect(tpl.css).toContain('--ed-bg: #f7f4ee;');
    expect(tpl.css).toContain('.dark .cp-ed {');
    expect(tpl.css).toContain('--ed-bg: #0a0a0a;');
    expect(tpl.css).toContain('.dark .cp-ed-profiles-wrap {');
    expect(tpl.css).not.toMatch(/html\.dark/);

    const lightSrcdoc = buildCustomPagePreviewSrcdoc({
      content: tpl.content,
      css: tpl.css,
      theme: 'light',
      useDefaultLayout: tpl.layoutPreset.useDefaultLayout,
      hideBranding: tpl.layoutPreset.hideBranding,
      hideHeader: tpl.layoutPreset.hideHeader,
      hideFooter: tpl.layoutPreset.hideFooter,
      locale: 'zh-CN',
      version: '2.9.0',
    });

    expect(lightSrcdoc).toContain('<html lang="zh-CN" class="">');
    expect(lightSrcdoc).toContain('data-slot="theme_toggle"');
    expect(lightSrcdoc).toContain('.dark .cp-ed');

    const darkSrcdoc = buildCustomPagePreviewSrcdoc({
      content: tpl.content,
      css: tpl.css,
      theme: 'dark',
      useDefaultLayout: tpl.layoutPreset.useDefaultLayout,
      hideBranding: tpl.layoutPreset.hideBranding,
      hideHeader: tpl.layoutPreset.hideHeader,
      hideFooter: tpl.layoutPreset.hideFooter,
      locale: 'zh-CN',
      version: '2.9.0',
    });

    expect(darkSrcdoc).toContain('<html lang="zh-CN" class="dark">');
    expect(darkSrcdoc).toContain('.dark .cp-ed-profiles-wrap');
  });
});
