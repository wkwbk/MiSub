import { beforeEach, describe, expect, it } from 'vitest';
import { validateProfile } from '@/utils/validation-utils.js';
import { messages } from '@/i18n/messages.js';
import { setLocale } from '@/i18n/index.js';

// 校验文案已 i18n，必须钉住语言（happy-dom 默认 en-US）
beforeEach(() => setLocale('zh-CN'));

describe('Issue #380: SubConverter 配置文件自定义无法使用', () => {
  it('应该允许 custom: 前缀的模板名称（不验证为 URL）', () => {
    const profile = {
      name: 'Test Profile',
      customId: 'test',
      transformMode: 'template',
      templateConfig: 'custom:我的自定义规则',
    };

    const result = validateProfile(profile);

    expect(result.isValid).toBe(true);
    expect(result.errors.templateConfig).toBeUndefined();
  });

  it('应该允许 builtin: 前缀的预设模板名称', () => {
    const profile = {
      name: 'Test Profile',
      customId: 'test',
      transformMode: 'template',
      templateConfig: 'builtin:ACL4SSR_Online_Full',
    };

    const result = validateProfile(profile);

    expect(result.isValid).toBe(true);
    expect(result.errors.templateConfig).toBeUndefined();
  });

  it('preset 模式下应该要求有效的 URL', () => {
    const profile = {
      name: 'Test Profile',
      customId: 'test',
      transformMode: 'template',
      templateConfig: 'not-a-url',
    };

    const result = validateProfile(profile);

    expect(result.isValid).toBe(false);
    expect(result.errors.templateConfig).toBeDefined();
    expect(result.errors.templateConfig[0]).toContain('URL');
  });

  it('preset 模式下应该接受有效的 URL', () => {
    const profile = {
      name: 'Test Profile',
      customId: 'test',
      transformMode: 'template',
      templateConfig: 'https://example.com/config.ini',
    };

    const result = validateProfile(profile);

    expect(result.isValid).toBe(true);
    expect(result.errors.templateConfig).toBeUndefined();
  });

  it('应该拒绝 custom: 后面为空的模板名称', () => {
    const profile = {
      name: 'Test Profile',
      customId: 'test',
      transformMode: 'template',
      templateConfig: 'custom:',
    };

    const result = validateProfile(profile);

    expect(result.isValid).toBe(false);
    expect(result.errors.templateConfig).toBeDefined();
    expect(result.errors.templateConfig[0]).toContain(messages['zh-CN'].validation.templateNameEmpty);
  });

  it('应该拒绝 custom: 后面只有空格的模板名称', () => {
    const profile = {
      name: 'Test Profile',
      customId: 'test',
      transformMode: 'template',
      templateConfig: 'custom:   ',
    };

    const result = validateProfile(profile);

    expect(result.isValid).toBe(false);
    expect(result.errors.templateConfig).toBeDefined();
    expect(result.errors.templateConfig[0]).toContain(messages['zh-CN'].validation.templateNameEmpty);
  });

  it('应该拒绝 builtin: 后面为空的模板名称', () => {
    const profile = {
      name: 'Test Profile',
      customId: 'test',
      transformMode: 'template',
      templateConfig: 'builtin:',
    };

    const result = validateProfile(profile);

    expect(result.isValid).toBe(false);
    expect(result.errors.templateConfig).toBeDefined();
    expect(result.errors.templateConfig[0]).toContain(messages['zh-CN'].validation.templateNameEmpty);
  });
});
