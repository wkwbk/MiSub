import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE_FORM, DEFAULT_SETTINGS } from '@/constants/default-settings.js';
import { validateProfile } from '@/utils/validation-utils.js';
import { messages } from '@/i18n/messages.js';
import { setLocale } from '@/i18n/index.js';

// 校验文案已 i18n。happy-dom 的 navigator.language 是 en-US，不钉住语言
// 会拿到英文文案（断言会以「翻译键没接上」的表象失败）。
beforeEach(() => setLocale('zh-CN'));

describe('Transform config settings', () => {
  it('defaults templateConfig to empty for built-in smart routing', () => {
    expect(DEFAULT_SETTINGS.transformMode).toBe('smart');
    expect(DEFAULT_SETTINGS.smartPreset).toBe('balanced');
    expect(DEFAULT_SETTINGS.enableRelay).toBe(false);
    expect('clashRuleLevel' in DEFAULT_SETTINGS).toBe(false);
    expect(DEFAULT_SETTINGS.templateConfig).toBe('');
    expect(DEFAULT_PROFILE_FORM.smartPreset).toBeUndefined();
    expect('clashRuleLevel' in DEFAULT_PROFILE_FORM).toBe(false);
    expect(DEFAULT_PROFILE_FORM.transformMode).toBeUndefined();
    expect(DEFAULT_PROFILE_FORM.enableUdp).toBeUndefined();
    expect(DEFAULT_PROFILE_FORM.skipCertVerify).toBeUndefined();
    expect(DEFAULT_PROFILE_FORM.enableRelay).toBeUndefined();
  });

  it('allows empty templateConfig and externalBackend.templateUrl but rejects invalid external URLs', () => {
    const emptyResult = validateProfile({
      name: 'Demo',
      customId: 'demo',
      templateConfig: '',
    });
    const invalidResult = validateProfile({
      name: 'Demo',
      customId: 'demo',
      templateConfig: 'not-a-url',
    });
    const invalidExternalResult = validateProfile({
      name: 'Demo',
      customId: 'demo',
      externalBackend: { url: 'api.v1.mk', templateUrl: 'not-a-url' },
    });

    expect(emptyResult.isValid).toBe(true);
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors.templateConfig).toContain(messages['zh-CN'].validation.invalidTransformUrl);
    expect(invalidExternalResult.isValid).toBe(false);
    expect(invalidExternalResult.errors.externalBackend).toContain(messages['zh-CN'].validation.invalidTransformUrl);
  });
});
