import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Login from '@/views/LoginView.vue';
import { createI18n } from '@/i18n/index.js';

describe('Login password input autofocus', () => {
  let wrapper;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('focuses the password input automatically on mount', async () => {
    wrapper = mount(Login, {
      attachTo: document.body,
      props: {
        login: vi.fn(),
      },
      global: {
        plugins: [createI18n({ initialLocale: 'en-US' })],
      },
    });

    await flushPromises();
    const input = wrapper.find('input[type="password"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes('autofocus')).toBeDefined();
    expect(document.activeElement).toBe(input.element);
  });

  it('refocuses the password input when login fails', async () => {
    const login = vi.fn().mockRejectedValue(new Error('Invalid password'));
    wrapper = mount(Login, {
      attachTo: document.body,
      props: { login },
      global: {
        plugins: [createI18n({ initialLocale: 'en-US' })],
      },
    });

    await flushPromises();
    const input = wrapper.find('input[type="password"]');
    await input.setValue('wrong-secret');
    input.element.blur();
    expect(document.activeElement).not.toBe(input.element);

    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(login).toHaveBeenCalledWith('wrong-secret');
    expect(document.activeElement).toBe(input.element);
  });
});
