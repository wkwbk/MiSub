import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Button from '../../src/components/ui/Button.vue';
import Input from '../../src/components/ui/Input.vue';
import FormModal from '../../src/components/shared/FormModal.vue';

const readSource = async (path) =>
    await import('node:fs/promises').then(({ readFile }) => readFile(path, 'utf8'));

describe('MiSub visual system regression', () => {
    it('keeps global UI tokens aligned with the clean dashboard design system', async () => {
        const css = await readSource('src/assets/main.css');

        expect(css).toContain('--bg-page-dark: #09090b');
        expect(css).toContain('--surface-panel-dark: #0c0c0e');
        expect(css).toContain('--surface-card-dark: #0c0c0e');
        expect(css).toContain('--text-primary-dark: #f4f4f5');
        expect(css).toContain('--text-secondary-dark: #a1a1aa');
        expect(css).toContain('--text-muted-dark: #71717a');
        expect(css).toContain('--border-subtle-dark: #27272a');
        expect(css).toContain('font-family: var(--font-body)');
        expect(css).toContain('font-feature-settings: "cv01", "ss03"');
        expect(css).toContain('scroll-behavior: auto');
        expect(css).not.toMatch(/html\s*\{[^}]*scroll-behavior:\s*smooth/s);
        expect(css).not.toContain('COSMIC GLASS DESIGN SYSTEM');
        expect(css).not.toContain('Premium, Deep, and Fluid');
    });

    it('uses subdued, consistent button variant classes', () => {
        const primary = mount(Button, { slots: { default: '保存' } });
        expect(primary.classes().join(' ')).toContain('rounded-md');
        expect(primary.classes().join(' ')).toContain('duration-150');

        const primaryButton = primary.find('button');
        expect(primaryButton.classes().join(' ')).toContain('bg-zinc-100');
        expect(primaryButton.classes().join(' ')).toContain('text-zinc-900');
        expect(primaryButton.classes().join(' ')).not.toContain('bg-gradient-to-r');
        expect(primaryButton.classes().join(' ')).not.toContain('shadow-primary-500/20');

        const secondary = mount(Button, {
            props: { variant: 'secondary' },
            slots: { default: '取消' },
        });
        expect(secondary.find('button').classes().join(' ')).toContain('border-zinc-800');
        expect(secondary.find('button').classes().join(' ')).toContain('bg-transparent');
    });

    it('uses the shared surface and focus treatment for inputs and modals', () => {
        const input = mount(Input, {
            props: { label: '名称', modelValue: '', placeholder: '输入名称' },
        });
        const inputClasses = input.find('input').classes().join(' ');
        expect(inputClasses).toContain('bg-transparent');
        expect(inputClasses).toContain('border-zinc-800');
        expect(inputClasses).toContain('focus:border-zinc-500');

        const modal = mount(FormModal, {
            props: { show: true, title: '编辑订阅' },
            attachTo: document.body,
            slots: { default: '<div>content</div>' },
        });
        const html = document.body.innerHTML;
        expect(html).toContain('bg-[#0c0c0e]');
        expect(html).toContain('border-zinc-800');
        expect(html).toContain('backdrop-blur-sm');
        modal.unmount();
    });
});
