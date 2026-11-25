import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { mount } from '@vue/test-utils';
import BasicSettings from '@/components/settings/sections/BasicSettings.vue';
import { createI18n } from '@/i18n/index.js';

const showToast = vi.fn();

vi.mock('@/stores/useToastStore.js', () => ({
  useToastStore: () => ({ showToast }),
}));

const mountBasicSettings = (settings) => {
  const wrapper = mount(BasicSettings, {
    props: {
      settings,
      disguiseConfig: {
        enabled: false,
        pageType: 'default',
        redirectUrl: '',
      },
      'onUpdate:settings': (next) => {
        Object.assign(settings, next);
        wrapper.setProps({ settings: { ...settings } });
      },
    },
    global: {
      plugins: [createI18n({ initialLocale: 'zh-CN' })],
      stubs: {
        Switch: {
          template: '<div />',
        },
      },
    },
  });
  return wrapper;
};

describe('BasicSettings validation feedback', () => {
  beforeEach(() => {
    showToast.mockReset();
  });

  it('keeps reserved paths in the field and shows inline error state while allowing /sub', async () => {
    const wrapper = mountBasicSettings({
      fileName: '',
      myToken: 'settings',
      profileToken: 'dashboard',
      customLoginPath: 'login',
      enablePublicPage: true,
    });

    await wrapper.vm.$nextTick();

    expect(wrapper.props().settings.myToken).toBe('settings');
    expect(wrapper.text()).toContain('系统保留路径不可用作订阅 URL 路径');
    expect(wrapper.text()).toContain('"/login" 是系统保留路径，不可用作自定义管理后台路径');
    expect(wrapper.text()).toContain('/{URL路径}/{标识}');
    expect(wrapper.text()).toContain('旧链接将立即失效');
    expect(wrapper.props().settings.customLoginPath).toBe('login');

    const subWrapper = mountBasicSettings({
      fileName: 'MiSub',
      myToken: '',
      profileToken: 'sub',
      customLoginPath: '',
      enablePublicPage: true,
    });
    await subWrapper.vm.$nextTick();
    expect(subWrapper.text()).not.toContain('系统保留路径不可用作订阅 URL 路径');
  });

  it('allows URL path-safe symbol characters in subscription tokens for stronger secrets', async () => {
    const wrapper = mountBasicSettings({
      fileName: '',
      myToken: '!luckyss',
      profileToken: 'profile:token!$&()*+,;=@',
      customLoginPath: 'login',
      enablePublicPage: true,
    });

    await wrapper.vm.$nextTick();

    expect(wrapper.props().settings.myToken).toBe('!luckyss');
    expect(wrapper.props().settings.profileToken).toBe('profile:token!$&()*+,;=@');
    expect(wrapper.text()).not.toContain('Token 仅允许');
  });

  it('still rejects token characters that break a single URL path segment', async () => {
    const wrapper = mountBasicSettings({
      fileName: '',
      myToken: 'bad/token',
      profileToken: 'bad?token',
      customLoginPath: 'login',
      enablePublicPage: true,
    });

    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('不能包含斜杠、问号、井号或空白字符');
  });

  it('handles live editing and clearing of mytoken and profileToken without throwing', async () => {
    const settings = reactive({
      fileName: 'MiSub',
      myToken: '',
      profileToken: 'profiles',
      customLoginPath: '',
      enablePublicPage: true,
    });
    const wrapper = mountBasicSettings(settings);
    const mytokenInput = wrapper.find('input#setting-mytoken');
    const profileTokenInput = wrapper.find('input#setting-profileToken');

    await mytokenInput.setValue('my-token-1');
    await mytokenInput.setValue('');
    await mytokenInput.setValue('login');
    await profileTokenInput.setValue('share-token-1');
    await profileTokenInput.setValue('');
    await profileTokenInput.setValue('dashboard');

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('系统保留路径'), 'error');
  });

  it('generates a valid UUID token for mytoken only and keeps profileToken as a plain URL path input', async () => {
    const settings = reactive({
      fileName: 'MiSub',
      myToken: '',
      profileToken: 'profiles',
      customLoginPath: '',
      enablePublicPage: true,
    });
    const wrapper = mountBasicSettings(settings);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    await wrapper.find('[data-testid="generate-mytoken-btn"]').trigger('click');
    expect(settings.myToken).toMatch(uuidPattern);
    expect(wrapper.find('[data-testid="generate-profileToken-btn"]').exists()).toBe(false);
  });
});
