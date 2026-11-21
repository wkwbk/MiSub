import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import FormModal from '@/components/shared/FormModal.vue';

const readSource = async (path) => await import('node:fs/promises').then(({ readFile }) => readFile(path, 'utf8'));

describe('MiSub visual system regression', () => {
  it('keeps global UI tokens aligned with the pure neutral semantic design system', async () => {
    const css = await readSource('src/assets/main.css');

    expect(css).toContain('--canvas: #f4f4f4');
    expect(css).toContain('--surface: #ffffff');
    expect(css).toContain('--canvas: #0a0a0a');
    expect(css).toContain('--surface: #141414');
    expect(css).toContain('--fg: #fafafa');
    expect(css).toContain('--fg-muted: #a3a3a3');
    expect(css).toContain('--fg-subtle: #737373');
    expect(css).toContain('--line: rgba(255, 255, 255, 0.11)');
    expect(css).toContain('font-family: var(--font-body)');
    expect(css).toMatch(/font-feature-settings:\s*['"]cv01['"],\s*['"]ss03['"]/);
    expect(css).toContain('scroll-behavior: auto');
    expect(css).not.toMatch(/html\s*\{[^}]*scroll-behavior:\s*smooth/s);
    expect(css).not.toContain('COSMIC GLASS DESIGN SYSTEM');
    expect(css).not.toContain('Premium, Deep, and Fluid');
  });

  it('uses subdued, consistent button variant classes', () => {
    const primary = mount(Button, { slots: { default: '保存' } });
    expect(primary.classes().join(' ')).toContain('rounded-md');
    expect(primary.classes().join(' ')).toContain('duration-200');

    const primaryButton = primary.find('button');
    expect(primaryButton.classes().join(' ')).toContain('bg-accent');
    expect(primaryButton.classes().join(' ')).toContain('text-accent-fg');
    expect(primaryButton.classes().join(' ')).not.toContain('bg-gradient-to-r');
    expect(primaryButton.classes().join(' ')).not.toContain('shadow-primary-500/20');

    const secondary = mount(Button, {
      props: { variant: 'secondary' },
      slots: { default: '取消' },
    });
    expect(secondary.find('button').classes().join(' ')).toContain('border-line');
    expect(secondary.find('button').classes().join(' ')).toContain('bg-transparent');
    expect(secondary.find('button').classes().join(' ')).toContain('hover:bg-hover');
  });

  it('defines semantic hover and danger tokens for both light and dark modes', async () => {
    const css = await readSource('src/assets/main.css');

    expect(css).toContain('--hover: #f0f0f0');
    expect(css).toContain('--hover: #222222');
    expect(css).toContain('--hover-danger-bg-light: #fee2e2');
    expect(css).toContain('--hover-danger-border-light: #fca5a5');
    expect(css).toContain('--hover-danger-bg-dark: rgba(239, 68, 68, 0.16)');
    expect(css).toContain('--hover-danger-border-dark: rgba(239, 68, 68, 0.45)');
  });

  it('uses the shared surface and focus treatment for inputs and modals', () => {
    const input = mount(Input, {
      props: { label: '名称', modelValue: '', placeholder: '输入名称' },
    });
    const inputClasses = input.find('input').classes().join(' ');
    expect(inputClasses).toContain('bg-inset');
    expect(inputClasses).toContain('border-line');
    expect(inputClasses).toContain('focus:border-line-strong');

    const modal = mount(FormModal, {
      props: { show: true, title: '编辑订阅' },
      attachTo: document.body,
      slots: { default: '<div>content</div>' },
    });
    const html = document.body.innerHTML;
    expect(html).toContain('modal-surface');
    expect(html).toContain('border-line');
    expect(html).toContain('backdrop-blur-sm');
    modal.unmount();
  });
});
