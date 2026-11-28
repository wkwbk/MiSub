import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick, reactive } from 'vue';
import { setLocale } from '@/i18n/index.js';
import { DEFAULT_SETTINGS } from '@/constants/default-settings.js';
import { DEFAULT_SUBCONVERTER_BACKEND } from '@/constants/subconverter-backends.js';
import { normalizeCustomVisualRules } from '@misub/core/domain/visual-rules-catalog.js';
import TransformCard from '@/components/settings/sections/ServiceSettings/TransformCard.vue';
import AdvancedBaseConfigSection from '@/components/settings/sections/ServiceSettings/AdvancedBaseConfigSection.vue';

const { testSubconverterBackend } = vi.hoisted(() => ({
  testSubconverterBackend: vi.fn(),
}));

vi.mock('@/lib/api.js', () => ({
  testSubconverterBackend,
}));

function createSettings(overrides = {}) {
  return {
    transformMode: 'smart',
    smartPreset: 'balanced',
    templateConfig: '',
    enableUdp: true,
    skipCertVerify: false,
    enableFlagEmoji: true,
    customVisualRules: {
      selectedRules: ['ai_services', 'youtube', 'google', 'private', 'cn_services', 'telegram', 'github', 'non_cn'],
      customRules: [],
      groupByCountry: true,
      includeAutoSelect: true,
    },
    externalBackend: {
      url: DEFAULT_SUBCONVERTER_BACKEND,
      templateUrl: '',
      sort: false,
      tfo: false,
      list: false,
      ...overrides.externalBackend,
    },
    ...overrides,
  };
}

function mountTransformCard(initialSettings) {
  const state = reactive({
    settings: initialSettings,
  });

  const wrapper = mount(TransformCard, {
    props: {
      settings: state.settings,
      'onUpdate:settings': (next) => {
        state.settings = next;
        wrapper.setProps({ settings: next });
      },
    },
  });

  return { wrapper, getSettings: () => state.settings };
}

function mountAdvancedSection(initialSettings) {
  const state = reactive({
    settings: initialSettings,
  });

  const wrapper = mount(AdvancedBaseConfigSection, {
    props: {
      settings: state.settings,
      'onUpdate:settings': (next) => {
        state.settings = next;
        wrapper.setProps({ settings: next });
      },
    },
  });

  return { wrapper, getSettings: () => state.settings };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

describe('TransformCard orthogonal 3-mode selector, unified flags, backend test & AdvancedBaseConfigSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale('en-US');
    testSubconverterBackend.mockReset();
  });

  it('switches non-destructively across Smart / Template / External modes without wiping saved configs', async () => {
    const initial = createSettings({
      transformMode: 'smart',
      smartPreset: 'minimal',
      templateConfig: 'builtin:clash_misub_minimal',
      skipCertVerify: true,
      enableUdp: true,
      customVisualRules: {
        selectedRules: ['private', 'cn_services', 'non_cn'],
        customRules: [],
        groupByCountry: true,
        includeAutoSelect: true,
      },
    });
    const { wrapper, getSettings } = mountTransformCard(initial);

    expect(wrapper.find('[data-testid="smart-mode-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="common-transform-params"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="common-switch-emoji"]').exists()).toBe(false);

    await wrapper.get('[data-testid="mode-btn-template"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="template-mode-panel"]').exists()).toBe(true);
    expect(getSettings().transformMode).toBe('template');
    expect(getSettings().templateConfig).toBe('builtin:clash_misub_minimal');
    expect(getSettings().customVisualRules.selectedRules).toEqual(['private', 'cn_services', 'non_cn']);

    await wrapper.get('[data-testid="mode-btn-external"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="external-backend-card"]').exists()).toBe(true);
    expect(getSettings().transformMode).toBe('external');
    expect(getSettings().templateConfig).toBe('builtin:clash_misub_minimal');
    expect(getSettings().skipCertVerify).toBe(true);
    expect(getSettings().enableUdp).toBe(true);
    expect(getSettings().customVisualRules.selectedRules).toEqual(['private', 'cn_services', 'non_cn']);

    await wrapper.get('[data-testid="mode-btn-template"]').trigger('click');
    await nextTick();
    expect(getSettings().transformMode).toBe('template');
    expect(getSettings().customVisualRules.selectedRules).toEqual(['private', 'cn_services', 'non_cn']);

    // 通用 UDP 开关直接写入顶层 single-source enableUdp（不再双写 subconverter）
    await wrapper.get('[data-testid="common-switch-udp"] input').setValue(false);
    await nextTick();
    expect(getSettings().enableUdp).toBe(false);
    expect('subconverter' in getSettings()).toBe(false);
  });

  it('provides minimal/balanced/full presets and an independent enableRelay toggle without hiding custom visual rules', async () => {
    const wrapperState = reactive({
      settings: createSettings({
        transformMode: 'smart',
        smartPreset: 'minimal',
        enableRelay: false,
      }),
    });

    const wrapper = mount(TransformCard, {
      props: {
        settings: wrapperState.settings,
        'onUpdate:settings': (next) => {
          wrapperState.settings = next;
          wrapper.setProps({ settings: next });
        },
      },
      global: {
        stubs: {
          teleport: true,
        },
      },
    });

    const presetSelect = wrapper.get('[data-testid="smart-preset-select"]');
    await presetSelect.find('button[role="combobox"]').trigger('click');
    await nextTick();
    const optionTexts = presetSelect.findAll('[role="option"]').map((item) => item.text());
    expect(optionTexts).toHaveLength(4);
    expect(optionTexts.some((txt) => /relay/i.test(txt))).toBe(false);

    const relayInfoTrigger = wrapper.get('[data-testid="relay-info-trigger"]');
    expect(relayInfoTrigger.attributes('aria-expanded')).toBe('false');
    await relayInfoTrigger.trigger('click');
    await nextTick();
    expect(relayInfoTrigger.attributes('aria-expanded')).toBe('true');
    const relayTooltip = wrapper.get('[data-testid="relay-info-tooltip"]');
    expect(relayTooltip.classes()).toContain('opacity-100');
    expect(relayTooltip.text()).toContain('relay entry group');
    await relayInfoTrigger.trigger('click');
    await nextTick();
    expect(relayInfoTrigger.attributes('aria-expanded')).toBe('false');

    await wrapper.get('[data-testid="toggle-enable-relay"] input').setValue(true);
    await nextTick();
    expect(wrapperState.settings.enableRelay).toBe(true);
    expect(wrapperState.settings.smartPreset).toBe('minimal');
    expect(wrapper.find('[data-testid="toggle-visual-customize"]').exists()).toBe(true);
  });

  it('handles rejected backend probe tests cleanly', async () => {
    const { wrapper } = mountTransformCard(
      createSettings({
        transformMode: 'external',
        externalBackend: { url: 'api.v1.mk', templateUrl: '', sort: false, tfo: false, list: false },
      }),
    );

    testSubconverterBackend.mockRejectedValue(new Error('网络不可用'));
    await wrapper.get('[data-testid="test-subconverter-backend"]').trigger('click');
    expect(testSubconverterBackend).toHaveBeenCalledWith('api.v1.mk', 'clash');

    await flushPromises();
    const banner = wrapper.get('[data-testid="subconverter-backend-test-result"]');
    expect(banner.text()).toContain('网络不可用');
  });

  it('renders a safe backend test action and displays success feedback', async () => {
    const { wrapper } = mountTransformCard(
      createSettings({
        transformMode: 'external',
        externalBackend: { url: 'api.v1.mk', templateUrl: '', sort: false, tfo: false, list: false },
      }),
    );

    expect(wrapper.text()).toContain('Test backend availability');
    testSubconverterBackend.mockResolvedValue({
      success: true,
      available: true,
      message: '第三方转换后端可用',
      endpoint: 'https://api.v1.mk/sub',
      elapsedMs: 42,
    });

    await wrapper.get('[data-testid="test-subconverter-backend"]').trigger('click');
    await flushPromises();
    const banner = wrapper.get('[data-testid="subconverter-backend-test-result"]');
    expect(banner.text()).toContain('第三方转换后端可用');
    expect(banner.text()).toContain('https://api.v1.mk/sub');
  });

  it('clears old backend test result after backend changes', async () => {
    const { wrapper } = mountTransformCard(
      createSettings({
        transformMode: 'external',
        externalBackend: { url: 'subapi.cmliussss.net', templateUrl: '', sort: false, tfo: false, list: false },
      }),
    );

    testSubconverterBackend.mockResolvedValue({
      success: true,
      available: true,
      message: '第三方转换后端可用',
      endpoint: 'https://subapi.cmliussss.net/sub',
    });

    await wrapper.get('[data-testid="test-subconverter-backend"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="subconverter-backend-test-result"]').exists()).toBe(true);

    const backendInput = wrapper.find('input[placeholder="subapi.cmliussss.net"]');
    await backendInput.setValue('api.v1.mk');
    await nextTick();
    expect(wrapper.find('[data-testid="subconverter-backend-test-result"]').exists()).toBe(false);
  });

  it('adds and edits draft custom rules without dropping empty names, spaces, or trailing commas before save', async () => {
    const { wrapper, getSettings } = mountTransformCard(
      createSettings({
        transformMode: 'smart',
        smartPreset: 'balanced',
      }),
    );

    await wrapper.get('[data-testid="toggle-visual-customize"]').trigger('click');
    await nextTick();

    await wrapper.get('[data-testid="add-custom-rule-btn"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="custom-rule-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="custom-rule-name-hint"]').exists()).toBe(true);

    const nameInput = wrapper.get('[data-testid="custom-rule-name-input"]');
    await nameInput.setValue('AI Proxy');
    await nextTick();
    expect(getSettings().customVisualRules.customRules[0].name).toBe('AI Proxy');
    expect(wrapper.find('[data-testid="custom-rule-name-hint"]').exists()).toBe(false);

    const domainInput = wrapper.get('[data-testid="custom-rule-domain-suffix-input"]');
    await domainInput.setValue('example.com, ');
    await nextTick();
    expect(domainInput.element.value).toBe('example.com, ');

    await domainInput.setValue('example.com, internal.local');
    await nextTick();
    expect(getSettings().customVisualRules.customRules[0].domainSuffix).toEqual(['example.com', 'internal.local']);

    // Adds a second blank draft rule, then verifies save-time strict normalization omits unnamed draft rules
    await wrapper.get('[data-testid="add-custom-rule-btn"]').trigger('click');
    await nextTick();
    expect(getSettings().customVisualRules.customRules).toHaveLength(2);

    const normalizedForSave = normalizeCustomVisualRules(getSettings().customVisualRules, {
      smartPreset: getSettings().smartPreset,
      allowEmptyName: false,
    });
    expect(normalizedForSave.customRules).toHaveLength(1);
    expect(normalizedForSave.customRules[0].name).toBe('AI Proxy');
  });

  it('toggles Clash API and validates Sing-Box JSON / Clash YAML in AdvancedBaseConfigSection', async () => {
    const { wrapper, getSettings } = mountAdvancedSection({
      ...DEFAULT_SETTINGS,
      advancedBaseConfig: {
        enableClashApi: false,
        externalController: '0.0.0.0:9090',
        externalUiDownloadUrl: '',
        baseConfig: { singbox: '', clash: '', surge: '' },
      },
    });

    await wrapper.get('[data-testid="clash-api-switch"] input').setValue(true);
    await nextTick();
    expect(getSettings().advancedBaseConfig.enableClashApi).toBe(true);
    expect(wrapper.find('input[placeholder="0.0.0.0:9090"]').exists()).toBe(true);

    const textarea = wrapper.get('[data-testid="visual-advanced-editor"] textarea');
    await textarea.setValue('{invalid json');
    await flushPromises();
    expect(wrapper.get('[data-testid="visual-advanced-editor"]').text()).toContain('Invalid JSON format');

    await textarea.setValue('{"log":{"level":"info"}}');
    await flushPromises();
    expect(getSettings().advancedBaseConfig.baseConfig.singbox).toBe('{"log":{"level":"info"}}');

    const clearBtn = wrapper
      .findAll('[data-testid="visual-advanced-editor"] button')
      .find((b) => b.text().includes('Clear current'));
    expect(clearBtn).toBeTruthy();
    await clearBtn.trigger('click');
    await nextTick();
    expect(getSettings().advancedBaseConfig.baseConfig.singbox).toBe('');
  });
});
