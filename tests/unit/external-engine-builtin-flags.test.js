import { describe, expect, it } from 'vitest';
import {
  buildExternalSubconverterUrl,
  resolveTransformPlan,
} from '../../functions/modules/subscription/core/main-handler.js';

describe('resolveTransformPlan single-source flags & external URL building', () => {
  it('shares unified enableUdp / skipCertVerify / enableFlagEmoji across builtin and external modes', () => {
    for (const transformMode of ['smart', 'template', 'external']) {
      const plan = resolveTransformPlan({
        config: {
          transformMode,
          enableUdp: false,
          skipCertVerify: true,
          enableFlagEmoji: false,
        },
      });
      expect(plan.flags).toMatchObject({
        enableUdp: false,
        skipCertVerify: true,
        enableFlagEmoji: false,
      });
    }
  });

  it('applies URL > Profile > Global tri-state precedence across all transform modes and external URLs', () => {
    const profileOverridePlan = resolveTransformPlan({
      profile: {
        transformMode: 'external',
        enableUdp: false,
        skipCertVerify: true,
      },
      config: {
        transformMode: 'smart',
        enableUdp: true,
        skipCertVerify: false,
        enableFlagEmoji: true,
        externalBackend: {
          url: 'subapi.cmliussss.net',
          templateUrl: 'https://example.com/global.ini',
          sort: false,
          tfo: false,
          list: false,
        },
      },
    });
    expect(profileOverridePlan.mode).toBe('external');
    expect(profileOverridePlan.flags).toMatchObject({
      enableUdp: false,
      skipCertVerify: true,
      enableFlagEmoji: true,
    });

    const urlOverridePlan = resolveTransformPlan({
      searchParams: new URLSearchParams('udp=1&scv=0&emoji=0&tfo=1'),
      profile: {
        transformMode: 'external',
        enableUdp: false,
        skipCertVerify: true,
      },
      config: {
        transformMode: 'smart',
        enableUdp: false,
        skipCertVerify: true,
        enableFlagEmoji: true,
      },
    });
    expect(urlOverridePlan.flags).toEqual({
      enableUdp: true,
      skipCertVerify: false,
      enableFlagEmoji: false,
      enableTfo: true,
    });

    const externalUrl = buildExternalSubconverterUrl({
      backend: 'api.v1.mk',
      targetFormat: 'clash',
      nodeList: 'ss://YWVzLTEyOC1nY206cGFzcw@1.2.3.4:8388#HK-01',
      templateUrl: 'https://example.com/rules.ini',
      enableUdp: profileOverridePlan.flags.enableUdp,
      skipCertVerify: profileOverridePlan.flags.skipCertVerify,
      enableFlagEmoji: profileOverridePlan.flags.enableFlagEmoji,
      sort: true,
      tfo: false,
      list: false,
      subName: 'SubTest',
    });
    expect(externalUrl.searchParams.get('udp')).toBe('false');
    expect(externalUrl.searchParams.get('scv')).toBe('true');
    expect(externalUrl.searchParams.get('emoji')).toBe('true');
    expect(externalUrl.searchParams.get('sort')).toBe('true');
  });

  it('overrides global customVisualRules.selectedRules when ?preset=minimal or profile smartPreset=minimal is active', () => {
    const config = {
      transformMode: 'smart',
      smartPreset: 'full',
      customVisualRules: {
        selectedRules: ['ad_block', 'ai_services', 'youtube', 'google'],
        customRules: [{ name: 'LAN', action: 'direct', ipCidr: ['10.0.0.0/8'] }],
      },
    };

    const queryPlan = resolveTransformPlan({
      searchParams: new URLSearchParams('preset=minimal'),
      config,
    });
    expect(queryPlan.customVisualRules.selectedRules).toEqual(['private', 'cn_services', 'non_cn']);
    expect(queryPlan.customVisualRules.customRules).toHaveLength(1);

    const profilePlan = resolveTransformPlan({
      profile: { transformMode: 'smart', smartPreset: 'minimal' },
      config,
    });
    expect(profilePlan.customVisualRules.selectedRules).toEqual(['private', 'cn_services', 'non_cn']);
  });
});
