import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import DatePicker from '@/components/ui/DatePicker.vue';
import { setLocale } from '@/i18n/index.js';

describe('DatePicker UI component', () => {
  let wrapper = null;

  beforeEach(() => {
    setLocale('zh-CN');
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
      wrapper = null;
    }
    document.body.innerHTML = '';
  });

  it('renders placeholder when empty, opens calendar popover, and selects a date', async () => {
    wrapper = mount(DatePicker, {
      attachTo: document.body,
      props: {
        modelValue: '2026-11-23',
        placeholder: '选择日期',
      },
    });

    const trigger = wrapper.find('[role="button"]');
    expect(trigger.text()).toContain('2026-11-23');
    expect(trigger.attributes('aria-expanded')).toBe('false');

    await trigger.trigger('click');
    await nextTick();

    expect(trigger.attributes('aria-expanded')).toBe('true');
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('2026年 11月');

    const dayBtn = document.body.querySelector('[data-date="2026-11-28"]');
    expect(dayBtn).not.toBeNull();
    dayBtn.click();
    await nextTick();

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2026-11-28']);
    expect(wrapper.emitted('change')?.[0]).toEqual(['2026-11-28']);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('supports month and year view navigation', async () => {
    wrapper = mount(DatePicker, {
      attachTo: document.body,
      props: {
        modelValue: '2026-11-23',
      },
    });

    await wrapper.find('[role="button"]').trigger('click');
    await nextTick();

    const dialog = document.body.querySelector('[role="dialog"]');
    const titleBtn = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.includes('2026年 11月'));
    expect(titleBtn).toBeTruthy();

    // Switch to months view
    titleBtn.click();
    await nextTick();
    expect(dialog.textContent).toContain('1月');
    expect(dialog.textContent).toContain('12月');

    // Switch to years view
    const yearTitleBtn = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === '2026年');
    expect(yearTitleBtn).toBeTruthy();
    yearTitleBtn.click();
    await nextTick();

    const year2027Btn = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === '2027');
    expect(year2027Btn).toBeTruthy();
    year2027Btn.click();
    await nextTick();

    const marchBtn = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === '3月');
    expect(marchBtn).toBeTruthy();
    marchBtn.click();
    await nextTick();

    expect(dialog.textContent).toContain('2027年 3月');
    const targetDay = document.body.querySelector('[data-date="2027-03-15"]');
    expect(targetDay).not.toBeNull();
    targetDay.click();
    await nextTick();

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2027-03-15']);
  });

  it('supports presets, inline clear button, and Escape / outside click dismissal', async () => {
    wrapper = mount(DatePicker, {
      attachTo: document.body,
      props: {
        modelValue: '2026-11-23',
        presets: [{ label: '固定日期', value: '2026-12-31' }],
      },
    });

    // Inline clear button clears without opening popover
    const clearBtn = wrapper.find('button[aria-label="清除"]');
    expect(clearBtn.exists()).toBe(true);
    await clearBtn.trigger('click');
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['']);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    // Open and click preset
    await wrapper.find('[role="button"]').trigger('click');
    await nextTick();
    const dialog = document.body.querySelector('[role="dialog"]');
    const presetBtn = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === '固定日期');
    expect(presetBtn).toBeTruthy();
    presetBtn.click();
    await nextTick();

    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['2026-12-31']);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    // Reopen and close with Escape
    await wrapper.find('[role="button"]').trigger('click');
    await nextTick();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    // Reopen and close on outside pointerdown
    await wrapper.find('[role="button"]').trigger('click');
    await nextTick();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await nextTick();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
