import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick, reactive } from 'vue';
import { setLocale } from '@/i18n/index.js';
import { resolveTemplateSource, resolveTransformPlan } from '../../functions/modules/subscription/core/main-handler.js';
import ProfileForm from '@/components/modals/ProfileModal/ProfileForm.vue';
import ProfileModal from '@/components/modals/ProfileModal.vue';
import Modal from '@/components/ui/Modal.vue';

const globalSettings = {
  transformMode: 'smart',
  smartPreset: 'balanced',
  enableRelay: false,
  templateConfig: '',
  enableUdp: true,
  skipCertVerify: false,
  enableFlagEmoji: true,
  customVisualRules: {
    selectedRules: ['ai_services', 'youtube', 'cn_services'],
    customRules: [{ name: 'GlobalCustom', action: 'direct', domainSuffix: ['global.local'] }],
    groupByCountry: false,
    includeAutoSelect: true,
  },
  externalBackend: {
    url: 'subapi.cmliussss.net',
    templateUrl: 'https://example.com/global.ini',
    sort: false,
    tfo: false,
    list: false,
  },
};

describe('resolveTransformPlan (orthogonal profile inheritance & overrides)', () => {
  it('inherits global mode, rules, and flags when profile leaves overrides undefined', () => {
    const directPlan = resolveTransformPlan({ config: globalSettings });
    const profileGlobalPlan = resolveTransformPlan({ profile: {}, config: globalSettings });

    for (const plan of [directPlan, profileGlobalPlan]) {
      expect(plan.mode).toBe('smart');
      expect(plan.smartPreset).toBe('balanced');
      expect(plan.customVisualRules.selectedRules).toEqual(['ai_services', 'youtube', 'cn_services']);
      expect(plan.customVisualRules.customRules.map((r) => r.name)).toEqual(['GlobalCustom']);
      expect(plan.customVisualRules.groupByCountry).toBe(false);
      expect(plan.customVisualRules.includeAutoSelect).toBe(true);
      expect(plan.flags).toMatchObject({
        enableUdp: true,
        skipCertVerify: false,
        enableFlagEmoji: true,
      });
    }
  });

  it('applies profile customVisualRules override and inherits unspecified global group toggles & flags', () => {
    const plan = resolveTransformPlan({
      profile: {
        transformMode: 'smart',
        smartPreset: 'minimal',
        customVisualRules: {
          selectedRules: ['private', 'cn_services', 'non_cn'],
          customRules: [],
        },
        enableUdp: false,
      },
      config: globalSettings,
    });

    expect(plan.mode).toBe('smart');
    expect(plan.smartPreset).toBe('minimal');
    expect(plan.customVisualRules.selectedRules).toEqual(['private', 'cn_services', 'non_cn']);
    expect(plan.customVisualRules.groupByCountry).toBe(false);
    expect(plan.customVisualRules.includeAutoSelect).toBe(true);
    expect(plan.flags.enableUdp).toBe(false);
    expect(plan.flags.skipCertVerify).toBe(false);
  });

  it('resolves enableRelay precedence as URL (?relay=1|0 / ?level=relay) > profile.enableRelay > global enableRelay without altering smartPreset', () => {
    const queryRelay = resolveTransformPlan({
      searchParams: new URLSearchParams('relay=1'),
      config: { ...globalSettings, smartPreset: 'minimal', enableRelay: false },
    });
    expect(queryRelay.mode).toBe('smart');
    expect(queryRelay.smartPreset).toBe('minimal');
    expect(queryRelay.enableRelay).toBe(true);

    const legacyLevelRelay = resolveTransformPlan({
      searchParams: new URLSearchParams('level=relay'),
      config: { ...globalSettings, smartPreset: 'full', enableRelay: false },
    });
    expect(legacyLevelRelay.mode).toBe('smart');
    expect(legacyLevelRelay.smartPreset).toBe('full');
    expect(legacyLevelRelay.enableRelay).toBe(true);

    const queryRelayFalseOverridesAll = resolveTransformPlan({
      searchParams: new URLSearchParams('relay=0&level=relay'),
      profile: { transformMode: 'smart', smartPreset: 'full', enableRelay: true },
      config: { ...globalSettings, enableRelay: true },
    });
    expect(queryRelayFalseOverridesAll.enableRelay).toBe(false);
    expect(queryRelayFalseOverridesAll.smartPreset).toBe('full');

    const profileRelayInheritMode = resolveTransformPlan({
      profile: { enableRelay: true },
      config: { ...globalSettings, enableRelay: false },
    });
    expect(profileRelayInheritMode.mode).toBe('smart');
    expect(profileRelayInheritMode.enableRelay).toBe(true);

    const profileRelayDisableOverride = resolveTransformPlan({
      profile: { transformMode: 'smart', smartPreset: 'minimal', enableRelay: false },
      config: { ...globalSettings, enableRelay: true },
    });
    expect(profileRelayDisableOverride.enableRelay).toBe(false);
    expect(profileRelayDisableOverride.smartPreset).toBe('minimal');

    const inheritedGlobalRelay = resolveTransformPlan({
      profile: { transformMode: 'smart' },
      config: { ...globalSettings, enableRelay: true },
    });
    expect(inheritedGlobalRelay.enableRelay).toBe(true);
  });

  it('resolves template and external plans independently including external flags', () => {
    const templatePlan = resolveTransformPlan({
      profile: {
        transformMode: 'template',
        templateConfig: 'builtin:clash_misub_minimal',
      },
      config: globalSettings,
    });
    expect(templatePlan).toMatchObject({
      mode: 'template',
      templateSource: { kind: 'builtin', value: 'clash_misub_minimal' },
    });

    const yamlTemplatePlan = resolveTransformPlan({
      profile: {
        transformMode: 'template',
        templateConfig: 'https://example.com/rules.yaml',
      },
      config: globalSettings,
    });
    expect(yamlTemplatePlan).toMatchObject({
      mode: 'template',
      templateSource: resolveTemplateSource('https://example.com/rules.yaml'),
    });

    const externalPlan = resolveTransformPlan({
      profile: {
        transformMode: 'external',
        skipCertVerify: true,
        externalBackend: {
          url: 'api.v1.mk',
          templateUrl: 'https://example.com/custom.ini',
          sort: true,
          tfo: true,
          list: null,
        },
      },
      config: globalSettings,
    });
    expect(externalPlan).toMatchObject({
      mode: 'external',
      backend: 'api.v1.mk',
      templateUrl: 'https://example.com/custom.ini',
      sort: true,
      tfo: true,
      list: false,
      flags: {
        enableUdp: true,
        skipCertVerify: true,
        enableFlagEmoji: true,
      },
    });
  });
});

describe('ProfileForm orthogonal 3+1 mode editor & tri-state node parameter overrides', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setLocale('zh-CN');
  });

  it('supports follow-global summary, non-destructive mode switching, and tri-state node parameter overrides', async () => {
    const state = reactive({
      profile: {
        name: '测试订阅组',
        customId: 'demo',
        enabled: true,
        transformMode: null,
        smartPreset: null,
        templateConfig: 'https://example.com/custom.ini',
        externalBackend: {
          url: '',
          templateUrl: '',
          sort: null,
          tfo: null,
          list: null,
        },
        enableUdp: null,
        skipCertVerify: null,
        enableRelay: null,
        prefixSettings: {
          enableManualNodes: null,
          enableSubscriptions: null,
          manualNodePrefix: '',
          prependTagName: null,
        },
        operators: [],
      },
    });

    const wrapper = mount(ProfileForm, {
      props: {
        localProfile: state.profile,
        showAdvanced: true,
        globalSettings: {
          transformMode: 'smart',
          smartPreset: 'minimal',
          enableRelay: true,
          customVisualRules: {
            selectedRules: ['private', 'cn_services', 'non_cn'],
            customRules: [],
            groupByCountry: true,
            includeAutoSelect: true,
          },
          externalBackend: { url: 'subapi.cmliussss.net', templateUrl: '', sort: false, tfo: false, list: false },
        },
        uiText: {},
        'onUpdate:localProfile': (next) => {
          state.profile = next;
          wrapper.setProps({ localProfile: next });
        },
      },
      global: {
        stubs: {
          teleport: true,
        },
      },
    });

    // 默认处于跟随全局状态，显示只读摘要（含全局预设与 Relay 状态），并渲染正交节点参数覆写区
    expect(wrapper.find('[data-testid="profile-follow-global-summary"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="profile-follow-global-summary"]').text()).toContain('精简');
    expect(wrapper.get('[data-testid="profile-follow-global-summary"]').text()).toContain('链式中转');
    expect(wrapper.find('[data-testid="profile-node-flags-override"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="profile-override-udp"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="profile-override-scv"]').exists()).toBe(true);

    // 切换 UDP 覆写为 false，切换跳过证书校验覆写为 true
    const udpSelect = wrapper.get('[data-testid="profile-override-udp"]');
    await udpSelect.find('button[role="combobox"]').trigger('click');
    await nextTick();
    await udpSelect
      .findAll('[role="option"]')
      .find((o) => o.text().includes('关闭'))
      .trigger('click');
    await nextTick();
    expect(state.profile.enableUdp).toBe(false);

    const scvSelect = wrapper.get('[data-testid="profile-override-scv"]');
    await scvSelect.find('button[role="combobox"]').trigger('click');
    await nextTick();
    await scvSelect
      .findAll('[role="option"]')
      .find((o) => o.text().includes('开启'))
      .trigger('click');
    await nextTick();
    expect(state.profile.skipCertVerify).toBe(true);

    // 切换到智能分流并确认继承预设规则且不覆盖已有 templateConfig，同时支持三态链式中转覆写与自定义规则组合
    await wrapper.get('[data-testid="mode-btn-smart"]').trigger('click');
    await nextTick();
    expect(state.profile.transformMode).toBe('smart');
    expect(state.profile.customVisualRules.selectedRules).toEqual(['private', 'cn_services', 'non_cn']);
    expect(state.profile.templateConfig).toBe('https://example.com/custom.ini');
    expect(wrapper.find('[data-testid="profile-override-relay"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="toggle-visual-customize"]').exists()).toBe(true);

    const relaySelect = wrapper.get('[data-testid="profile-override-relay"]');
    await relaySelect.find('button[role="combobox"]').trigger('click');
    await nextTick();
    await relaySelect
      .findAll('[role="option"]')
      .find((o) => o.text().includes('开启'))
      .trigger('click');
    await nextTick();
    expect(state.profile.enableRelay).toBe(true);

    // 切换到第三方后端：不清空已保存的 templateConfig 与 customVisualRules，且正交覆写保留
    await wrapper.get('[data-testid="mode-btn-external"]').trigger('click');
    await nextTick();
    expect(state.profile.transformMode).toBe('external');
    expect(state.profile.templateConfig).toBe('https://example.com/custom.ini');
    expect(state.profile.customVisualRules.selectedRules).toEqual(['private', 'cn_services', 'non_cn']);
    expect(state.profile.enableUdp).toBe(false);
    expect(state.profile.skipCertVerify).toBe(true);
    expect(state.profile.enableRelay).toBe(true);

    // 切回跟随全局：清空 transformMode 为 null（PATCH 语义）
    await wrapper.get('[data-testid="mode-btn-global"]').trigger('click');
    await nextTick();
    expect(state.profile.transformMode).toBeNull();
  });

  it('ProfileModal buildPreparedProfile omits null overrides on create (isNew=true) and preserves explicit null on PATCH (isNew=false)', async () => {
    const createWrapper = mount(ProfileModal, {
      props: {
        show: true,
        isNew: true,
        profile: {
          name: '新建订阅组',
          enabled: true,
          transformMode: null,
          smartPreset: null,
          enableUdp: null,
          skipCertVerify: null,
          enableRelay: null,
        },
      },
    });
    await nextTick();
    createWrapper.findComponent(Modal).vm.$emit('confirm');
    await nextTick();
    const savedOnCreate = createWrapper.emitted('save')?.[0]?.[0];
    expect(savedOnCreate).toBeTruthy();
    expect('transformMode' in savedOnCreate).toBe(false);
    expect('smartPreset' in savedOnCreate).toBe(false);
    expect('enableUdp' in savedOnCreate).toBe(false);
    expect('skipCertVerify' in savedOnCreate).toBe(false);
    expect('enableRelay' in savedOnCreate).toBe(false);

    const patchWrapper = mount(ProfileModal, {
      props: {
        show: true,
        isNew: false,
        profile: {
          id: 'p-edit',
          name: '编辑订阅组',
          enabled: true,
          transformMode: null,
          smartPreset: null,
          enableUdp: null,
          skipCertVerify: null,
          enableRelay: null,
        },
      },
    });
    await nextTick();
    patchWrapper.findComponent(Modal).vm.$emit('confirm');
    await nextTick();
    const savedOnPatch = patchWrapper.emitted('save')?.[0]?.[0];
    expect(savedOnPatch).toBeTruthy();
    expect(savedOnPatch.transformMode).toBeNull();
    expect(savedOnPatch.smartPreset).toBeNull();
    expect(savedOnPatch.enableUdp).toBeNull();
    expect(savedOnPatch.skipCertVerify).toBeNull();
    expect(savedOnPatch.enableRelay).toBeNull();
  });
});
