import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Select from '../../src/components/ui/Select.vue';

describe('Select UI component', () => {
    let wrapper = null;

    afterEach(() => {
        if (wrapper) {
            wrapper.unmount();
            wrapper = null;
        }
        document.body.innerHTML = '';
    });

    it('renders selected label, opens popover on click, and selects an option', async () => {
        wrapper = mount(Select, {
            attachTo: document.body,
            props: {
                modelValue: 'zh-CN',
                options: [
                    { value: 'zh-CN', label: '简体中文' },
                    { value: 'en-US', label: 'English' },
                ],
            },
        });

        const trigger = wrapper.find('button[role="combobox"]');
        expect(trigger.text()).toContain('简体中文');
        expect(trigger.attributes('aria-expanded')).toBe('false');

        await trigger.trigger('click');
        await nextTick();

        expect(trigger.attributes('aria-expanded')).toBe('true');
        const popover = document.body.querySelector('[role="listbox"]');
        expect(popover).not.toBeNull();

        const optionButtons = document.body.querySelectorAll('[role="option"]');
        expect(optionButtons.length).toBe(2);
        expect(optionButtons[0].getAttribute('aria-selected')).toBe('true');
        expect(optionButtons[1].getAttribute('aria-selected')).toBe('false');

        optionButtons[1].click();
        await nextTick();

        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['en-US']);
        expect(wrapper.emitted('change')?.[0]).toEqual(['en-US']);
        expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    });

    it('supports null, boolean, disabled, and grouped options', async () => {
        wrapper = mount(Select, {
            attachTo: document.body,
            props: {
                modelValue: null,
                options: [
                    { value: null, label: '跟随全局' },
                    {
                        label: '开关分组',
                        options: [
                            { value: true, label: '开启' },
                            { value: false, label: '关闭', disabled: true },
                        ],
                    },
                ],
            },
        });

        const trigger = wrapper.find('button[role="combobox"]');
        expect(trigger.text()).toContain('跟随全局');

        await trigger.trigger('click');
        await nextTick();

        const optionButtons = document.body.querySelectorAll('[role="option"]');
        expect(optionButtons.length).toBe(3);
        expect(document.body.textContent).toContain('开关分组');

        // Disabled option should not emit
        optionButtons[2].click();
        await nextTick();
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();

        // Enabled boolean option should emit true
        optionButtons[1].click();
        await nextTick();
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
    });

    it('closes on outside pointerdown and Escape key', async () => {
        wrapper = mount(Select, {
            attachTo: document.body,
            props: {
                modelValue: 'a',
                options: [
                    { value: 'a', label: 'Option A' },
                    { value: 'b', label: 'Option B' },
                ],
            },
        });

        const trigger = wrapper.find('button[role="combobox"]');
        await trigger.trigger('click');
        await nextTick();
        expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();

        // Escape closes popover
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await nextTick();
        expect(document.body.querySelector('[role="listbox"]')).toBeNull();

        // Re-open and click outside
        await trigger.trigger('click');
        await nextTick();
        expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();

        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await nextTick();
        expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    });

    it('supports multiple selection mode without closing on item click', async () => {
        wrapper = mount(Select, {
            attachTo: document.body,
            props: {
                modelValue: ['ss'],
                multiple: true,
                placeholder: '请选择',
                options: [
                    { value: 'ss', label: 'SS' },
                    { value: 'vmess', label: 'VMess' },
                ],
            },
        });

        const trigger = wrapper.find('button[role="combobox"]');
        await trigger.trigger('click');
        await nextTick();

        const optionButtons = document.body.querySelectorAll('[role="option"]');
        optionButtons[1].click();
        await nextTick();

        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['ss', 'vmess']]);
        expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    });
});

