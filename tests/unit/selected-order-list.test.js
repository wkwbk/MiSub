import { defineComponent } from 'vue';
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SelectedOrderList from '@/components/modals/ProfileModal/SelectedOrderList.vue';
import { createI18n } from '@/i18n/index.js';

const DraggableStub = defineComponent({
  name: 'Draggable',
  props: {
    modelValue: {
      type: Array,
      default: () => [],
    },
  },
  emits: ['update:modelValue'],
  template: `
    <div>
      <template v-for="(element, index) in modelValue" :key="element.id">
        <slot name="item" :element="element" :index="index" />
      </template>
    </div>
  `,
});

const sampleItems = [
  { id: 'n2', name: 'US-10' },
  { id: 'n1', name: 'HK-1' },
  { id: 'n3', name: 'US-2' },
];

const mountList = (items = sampleItems, layout = 'split') =>
  mount(SelectedOrderList, {
    props: {
      modelValue: items,
      unnamedLabel: 'Unnamed',
      layout,
    },
    global: {
      plugins: [createI18n()],
      stubs: { Draggable: DraggableStub },
    },
  });

describe('SelectedOrderList', () => {
  it('sorts items by name ascending (natural numeric), descending, and reverse', async () => {
    const wrapper = mountList();

    await wrapper.get('[data-test="sort-asc"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0].map((i) => i.id)).toEqual(['n1', 'n3', 'n2']);

    await wrapper.get('[data-test="sort-desc"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[1]?.[0].map((i) => i.id)).toEqual(['n2', 'n3', 'n1']);

    await wrapper.get('[data-test="sort-reverse"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[2]?.[0].map((i) => i.id)).toEqual(['n3', 'n1', 'n2']);
  });

  it('moves items to top and bottom', async () => {
    const wrapper = mountList();

    const moveTopButtons = wrapper.findAll('[data-test="move-top"]');
    await moveTopButtons[2].trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0].map((i) => i.id)).toEqual(['n3', 'n2', 'n1']);

    const moveBottomButtons = wrapper.findAll('[data-test="move-bottom"]');
    await moveBottomButtons[0].trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[1]?.[0].map((i) => i.id)).toEqual(['n1', 'n3', 'n2']);
  });

  it('jumps an item to a target position by editing its index badge', async () => {
    const wrapper = mountList();

    const badges = wrapper.findAll('[data-test="position-badge"]');
    await badges[2].trigger('click');

    const input = wrapper.get('[data-test="position-input"]');
    await input.setValue('1');
    await input.trigger('keydown.enter');

    expect(wrapper.emitted('update:modelValue')?.[0]?.[0].map((i) => i.id)).toEqual(['n3', 'n2', 'n1']);
  });

  it('shows empty state in split layout when no items are selected', () => {
    const wrapper = mountList([], 'split');
    expect(wrapper.text()).toContain('No items selected yet');
  });
});
