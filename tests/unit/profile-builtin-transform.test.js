import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import {
  resolveEffectiveBuiltinTransform,
  resolveTemplateUrl,
} from '../../functions/modules/subscription/core/engine-options.js';
import ProfileForm from '@/components/modals/ProfileModal/ProfileForm.vue';
import { setLocale } from '@/i18n/index.js';

describe('resolveEffectiveBuiltinTransform', () => {
  const globalConfig = {
    transformConfigMode: 'builtin',
    builtinTransform: {
      visualRulesEnabled: true,
      rulePreset: 'comprehensive',
      selectedRules: ['ai_services', 'youtube', 'cn_services', 'non_cn'],
      customRules: [{ name: 'GlobalRule', action: 'proxy', domainSuffix: ['example.com'] }],
      groupByCountry: false,
      includeAutoSelect: false,
      enableClashApi: true,
      externalController: '127.0.0.1:9090',
      externalUiDownloadUrl: 'https://example.com/ui.zip',
      baseConfig: { singbox: '{"log":{}}', clash: 'mode: rule', surge: '' },
    },
  };

  it('直连模式或 global 模式下完整继承全局 builtinTransform', () => {
    const direct = resolveEffectiveBuiltinTransform(null, globalConfig);
    expect(direct.visualRulesEnabled).toBe(true);
    expect(direct.selectedRules).toEqual(['ai_services', 'youtube', 'cn_services', 'non_cn']);
    expect(direct.groupByCountry).toBe(false);
    expect(direct.enableClashApi).toBe(true);

    const globalProfile = resolveEffectiveBuiltinTransform({ transformConfigMode: 'global' }, globalConfig);
    expect(globalProfile).toEqual(direct);
  });

  it('订阅组选择内置自动分流时，即使全局开了可视化规则也应关闭 visualRulesEnabled 并保留通用开关', () => {
    const result = resolveEffectiveBuiltinTransform(
      { transformConfigMode: 'builtin', ruleLevel: 'base' },
      globalConfig,
    );
    expect(result.visualRulesEnabled).toBe(false);
    expect(result.groupByCountry).toBe(false);
    expect(result.includeAutoSelect).toBe(false);
    expect(result.enableClashApi).toBe(true);
    expect(result.baseConfig.clash).toBe('mode: rule');
  });

  it('订阅组启用独立可视化规则时，使用订阅组规则并继承全局通用引擎参数', () => {
    const profile = {
      transformConfigMode: 'builtin',
      builtinTransform: {
        visualRulesEnabled: true,
        selectedRules: ['private', 'cn_services', 'non_cn'],
        customRules: [{ name: 'FamilyDirect', action: 'direct', domainSuffix: ['lan.local'] }],
      },
    };
    const result = resolveEffectiveBuiltinTransform(profile, globalConfig);
    expect(result.visualRulesEnabled).toBe(true);
    expect(result.rulePreset).toBe('minimal');
    expect(result.selectedRules).toEqual(['private', 'cn_services', 'non_cn']);
    expect(result.customRules).toHaveLength(1);
    expect(result.customRules[0].name).toBe('FamilyDirect');
    // 继承全局通用引擎参数
    expect(result.groupByCountry).toBe(false);
    expect(result.enableClashApi).toBe(true);
    expect(result.externalController).toBe('127.0.0.1:9090');
    expect(result.baseConfig.singbox).toBe('{"log":{}}');
  });

  it('订阅组使用 visual 模式或模板模式时表现正确', () => {
    expect(resolveTemplateUrl('visual', 'https://ignored.example/a.ini', 'https://global.example/b.ini')).toBe('');

    const visualModeResult = resolveEffectiveBuiltinTransform(
      {
        transformConfigMode: 'visual',
        builtinTransform: { selectedRules: ['ai_services', 'non_cn'] },
      },
      globalConfig,
    );
    expect(visualModeResult.visualRulesEnabled).toBe(true);
    expect(visualModeResult.selectedRules).toEqual(['ai_services', 'non_cn']);

    const presetResult = resolveEffectiveBuiltinTransform(
      { transformConfigMode: 'preset', transformConfig: 'builtin:ACL4SSR_Online_Full' },
      globalConfig,
    );
    expect(presetResult.visualRulesEnabled).toBe(false);
  });
});

describe('ProfileForm 与设置页规则方案对齐', () => {
  beforeEach(() => setLocale('zh-CN'));

  const baseUiText = {
    prefixTitle: '节点名称与可见性',
    manualPrefixLabel: '手动节点前缀文本',
    manualPrefixToggle: '手动节点展示',
    subscriptionPrefixToggle: '机场订阅前缀',
    enable: '开启',
    disable: '关闭',
  };

  it('全局启用可视化规则时，跟随全局提示显示内置可视化规则，且可切换至独立可视化规则编辑', async () => {
    const localProfile = {
      name: '家人共享',
      customId: 'family',
      tags: [],
      isPublic: false,
      description: '',
      transformConfigMode: 'global',
      transformConfig: '',
      ruleLevel: '',
      expiresAt: '',
      fetchMinInterval: '',
      fetchLimitMode: '',
      prefixSettings: {
        enableManualNodes: null,
        enableSubscriptions: null,
        manualNodePrefix: '',
        prependTagName: null,
      },
      subconverter: {
        engineMode: '',
        backend: '',
        options: { udp: null, emoji: null, scv: null, sort: null, tfo: null, list: null },
      },
      operators: [],
    };

    const globalSettings = {
      transformConfigMode: 'builtin',
      subconverter: { engineMode: 'builtin' },
      builtinTransform: {
        visualRulesEnabled: true,
        selectedRules: ['private', 'cn_services', 'non_cn'],
        customRules: [],
      },
    };

    const wrapper = mount(ProfileForm, {
      props: {
        localProfile,
        showAdvanced: true,
        uiText: baseUiText,
        globalSettings,
        prefixToggleOptions: [{ label: '默认', value: null }],
        tagPrefixToggleOptions: [{ label: '默认', value: null }],
        profileTags: [],
        'onUpdate:localProfile': (next) => {
          Object.assign(localProfile, next);
          wrapper.setProps({ localProfile: { ...localProfile } });
        },
      },
      global: {
        stubs: {
          TagInput: true,
          OperatorChain: true,
          TransformSelector: true,
          RuleTemplateModal: true,
        },
      },
    });

    expect(wrapper.text()).toContain('当前全局：内置可视化规则');
    expect(wrapper.find('[data-testid="visual-rules-editor"]').exists()).toBe(false);

    // 切换到独立可视化规则
    wrapper.vm.ruleSourceSelection = 'visual';
    await wrapper.vm.$nextTick();

    expect(localProfile.transformConfigMode).toBe('builtin');
    expect(localProfile.builtinTransform.visualRulesEnabled).toBe(true);
    expect(localProfile.builtinTransform.selectedRules).toEqual(['private', 'cn_services', 'non_cn']);
    expect(wrapper.find('[data-testid="visual-rules-editor"]').exists()).toBe(true);

    // 切回内置自动分流
    wrapper.vm.ruleSourceSelection = 'builtin';
    await wrapper.vm.$nextTick();
    expect(localProfile.builtinTransform.visualRulesEnabled).toBe(false);
    expect(wrapper.find('[data-testid="visual-rules-editor"]').exists()).toBe(false);
  });
});
