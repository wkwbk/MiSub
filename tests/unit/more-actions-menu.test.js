import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MoreActionsMenu from '@/components/shared/MoreActionsMenu.vue';

describe('MoreActionsMenu component', () => {
  let wrapper = null;

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
      wrapper = null;
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('teleports menu to body by default with popover z-index', async () => {
    wrapper = mount(MoreActionsMenu, {
      attachTo: document.body,
      slots: {
        menu: '<button type="button">Action 1</button>',
      },
    });

    await wrapper.find('button').trigger('click');
    await nextTick();

    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(wrapper.element.contains(menu)).toBe(false);
    expect(menu.classList.contains('fixed')).toBe(true);
    expect(menu.style.zIndex).toBe('var(--z-popover)');
  });

  it('recalculates position when trigger moves between opens', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    wrapper = mount(MoreActionsMenu, {
      attachTo: document.body,
      slots: {
        menu: '<button type="button">Action 1</button>',
      },
    });

    let rect = {
      top: 100,
      bottom: 132,
      left: 1000,
      right: 1032,
      width: 32,
      height: 32,
    };
    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockImplementation(() => rect);

    const trigger = wrapper.find('button');
    await trigger.trigger('click');
    await nextTick();

    let menu = document.body.querySelector('[role="menu"]');
    expect(menu.style.top).toBe('140px');

    await trigger.trigger('click');
    await nextTick();

    rect = {
      top: 300,
      bottom: 332,
      left: 1100,
      right: 1132,
      width: 32,
      height: 32,
    };

    await trigger.trigger('click');
    await nextTick();

    menu = document.body.querySelector('[role="menu"]');
    expect(menu.style.top).toBe('340px');
  });

  it('flips upward near viewport bottom and clamps horizontal position', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });

    wrapper = mount(MoreActionsMenu, {
      attachTo: document.body,
      slots: {
        menu: '<button type="button">Action 1</button>',
      },
    });

    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue({
      top: 520,
      bottom: 552,
      left: 16,
      right: 48,
      width: 32,
      height: 32,
    });

    await wrapper.find('button').trigger('click');
    await nextTick();

    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu.style.bottom).toBe('88px');
    expect(menu.style.top).toBe('');
    expect(menu.style.left).toBe('8px');
    expect(menu.style.maxHeight).toBe('504px');
  });
});
