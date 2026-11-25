import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import TransformCard from '@/components/settings/sections/ServiceSettings/TransformCard.vue';

vi.mock('@/lib/api.js', () => ({
  testSubconverterBackend: vi.fn(),
}));

const { testSubconverterBackend } = await import('@/lib/api.js');

function createSettings(overrides = {}) {
  return {
    transformConfigMode: 'preset',
    transformConfig: '',
    builtinSkipCertVerify: false,
    builtinEnableUdp: false,
    ruleLevel: 'std',
    subconverter: {
      engineMode: 'external',
      defaultBackend: 'api.v1.mk',
      defaultOptions: {
        udp: true,
        emoji: true,
        scv: true,
        tfo: false,
        sort: false,
        list: false,
      },
      ...overrides.subconverter,
    },
    ...overrides,
  };
}

describe('TransformCard third-party backend test button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores previous built-in settings after switching engine and handles rejected tests', async () => {
    const settings = createSettings({
      transformConfigMode: 'builtin',
      transformConfig: 'builtin:clash_misub',
      builtinSkipCertVerify: true,
      builtinEnableUdp: true,
      subconverter: { engineMode: 'builtin' },
    });
    let wrapper;
    wrapper = mount(TransformCard, {
      props: {
        settings,
        'onUpdate:settings': (next) => {
          Object.assign(settings, next);
          wrapper?.setProps({ settings: { ...settings } });
        },
      },
      global: {
        stubs: { TransformSelector: true, RuleTemplateManager: true },
      },
    });

    expect(wrapper.find('[data-testid="builtin-engine-params"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="external-backend-card"]').exists()).toBe(false);

    const engineButtons = wrapper.findAll('button');
    await engineButtons.find((button) => button.text().includes('External backend')).trigger('click');
    expect(wrapper.find('[data-testid="builtin-engine-params"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="external-backend-card"]').exists()).toBe(true);
    await wrapper.get('[data-testid="restore-engine-settings"]').trigger('click');
    expect(wrapper.find('[data-testid="builtin-engine-params"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="external-backend-card"]').exists()).toBe(false);
    expect(settings.subconverter.engineMode).toBe('builtin');
    expect(settings.transformConfigMode).toBe('builtin');
    expect(settings.transformConfig).toBe('builtin:clash_misub');
    expect(settings.builtinSkipCertVerify).toBe(true);
    expect(settings.builtinEnableUdp).toBe(true);

    const externalSettings = createSettings();
    externalSettings.subconverter.defaultBackend = 'api.v1.mk';
    const externalWrapper = mount(TransformCard, {
      props: { settings: externalSettings },
      global: { stubs: { TransformSelector: true, RuleTemplateManager: true } },
    });
    testSubconverterBackend.mockRejectedValue(new Error('网络不可用'));
    const testButton = externalWrapper.get('[data-testid="test-subconverter-backend"]');
    await testButton.trigger('click');
    expect(testSubconverterBackend).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(externalWrapper.find('[data-testid="subconverter-backend-test-result"]').exists()).toBe(true),
    );
    await flushPromises();
    expect(externalWrapper.get('[data-testid="subconverter-backend-test-result"]').text()).toContain('网络不可用');
    expect(testButton.attributes('disabled')).toBeUndefined();
  });

  it('renders a safe backend test action and displays success feedback', async () => {
    testSubconverterBackend.mockResolvedValue({
      success: true,
      available: true,
      message: '第三方转换后端可用，响应 200，耗时 123ms。',
      endpoint: 'https://api.v1.mk/sub',
      elapsedMs: 123,
    });

    const wrapper = mount(TransformCard, {
      props: { settings: createSettings() },
      global: {
        stubs: {
          TransformSelector: true,
          RuleTemplateManager: true,
        },
      },
    });

    expect(wrapper.text()).toContain('Test backend availability');
    expect(wrapper.text()).toContain('Your real subscription links are not sent');

    await wrapper.get('[data-testid="test-subconverter-backend"]').trigger('click');
    await nextTick();
    await nextTick();

    expect(testSubconverterBackend).toHaveBeenCalledWith('api.v1.mk', 'clash');
    expect(wrapper.get('[data-testid="subconverter-backend-test-result"]').text()).toContain('第三方转换后端可用');
    expect(wrapper.get('[data-testid="subconverter-backend-test-result"]').text()).toContain('https://api.v1.mk/sub');
  });

  it('clears old backend test result after backend changes', async () => {
    const settings = createSettings();
    testSubconverterBackend.mockResolvedValue({
      success: false,
      available: false,
      error: '测试失败',
    });

    let wrapper;
    wrapper = mount(TransformCard, {
      props: {
        settings,
        'onUpdate:settings': (next) => {
          Object.assign(settings, next);
          wrapper?.setProps({ settings: { ...settings } });
        },
      },
      global: {
        stubs: {
          TransformSelector: true,
          RuleTemplateManager: true,
        },
      },
    });

    await wrapper.get('[data-testid="test-subconverter-backend"]').trigger('click');
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-testid="subconverter-backend-test-result"]').exists()).toBe(true);

    const backendInput = wrapper.get('input[type="text"]');
    await backendInput.setValue('subapi.cmliussss.net');
    await nextTick();

    expect(wrapper.find('[data-testid="subconverter-backend-test-result"]').exists()).toBe(false);
  });
});
