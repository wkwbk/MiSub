import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TagInput from '@/components/ui/TagInput.vue';

describe('TagInput', () => {
  it('opens suggestion dropdown on focus and toggles existing tags', async () => {
    const wrapper = mount(TagInput, {
      props: {
        modelValue: ['主力'],
        suggestions: ['主力', '流媒体', '家宽'],
        placeholder: '输入或选择标签...',
      },
      attachTo: document.body,
    });

    const input = wrapper.get('input[role="combobox"]');
    await input.trigger('focus');

    const dropdown = document.body.querySelector('[data-testid="tag-input-dropdown"]');
    expect(dropdown).not.toBeNull();
    expect(dropdown.textContent).toContain('主力');
    expect(dropdown.textContent).toContain('流媒体');
    expect(dropdown.textContent).toContain('家宽');

    const options = Array.from(dropdown.querySelectorAll('[role="option"]'));
    const mediaOption = options.find((el) => el.textContent.includes('流媒体'));
    mediaOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['主力', '流媒体']]);
    wrapper.unmount();
  });

  it('creates a new tag on Enter and removes last tag on Backspace when input is empty', async () => {
    const wrapper = mount(TagInput, {
      props: {
        modelValue: ['香港', '家宽'],
        suggestions: ['香港'],
      },
      attachTo: document.body,
    });

    const input = wrapper.get('input[role="combobox"]');
    await input.setValue('住宅IP');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['香港', '家宽', '住宅IP']]);

    await input.setValue('');
    await input.trigger('keydown', { key: 'Backspace' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['香港']]);

    wrapper.unmount();
  });
});
