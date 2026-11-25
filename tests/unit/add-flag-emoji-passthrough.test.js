import { describe, expect, it } from 'vitest';
import * as yaml from 'js-yaml';
import { generateBuiltinClashConfig } from '../../functions/modules/subscription/adapters/generators/builtin-clash-generator.js';
import {
  resolveAddFlagEmoji,
  resolveEffectiveNodeTransform,
} from '../../functions/modules/subscription/core/main-handler.js';

const NODE = 'trojan://pass@example.com:443#US-AAA-BBB-01';

describe('addFlagEmoji 透传到内置 Clash 生成器', () => {
  it('addFlagEmoji: false 时不加国旗', () => {
    const name = yaml.load(generateBuiltinClashConfig(NODE, { addFlagEmoji: false })).proxies[0].name;
    expect(name).toBe('US-AAA-BBB-01');
  });

  it('addFlagEmoji: true 时加国旗', () => {
    const name = yaml.load(generateBuiltinClashConfig(NODE, { addFlagEmoji: true })).proxies[0].name;
    expect(name).toBe('🇺🇸 US-AAA-BBB-01');
  });

  it('未传 addFlagEmoji 时默认加国旗（保持向后兼容）', () => {
    const name = yaml.load(generateBuiltinClashConfig(NODE, {})).proxies[0].name;
    expect(name).toBe('🇺🇸 US-AAA-BBB-01');
  });
});

describe('resolveEffectiveNodeTransform 回退链', () => {
  it('无 profile 或空 nodeTransform 时返回空对象', () => {
    expect(resolveEffectiveNodeTransform(null, {})).toEqual({});
    expect(resolveEffectiveNodeTransform({ nodeTransform: {} }, {})).toEqual({});
    expect(resolveEffectiveNodeTransform(undefined, undefined)).toEqual({});
  });

  it('profile 有 nodeTransform 时直接生效', () => {
    expect(resolveEffectiveNodeTransform({ nodeTransform: { addFlagEmoji: true } }, {})).toEqual({
      addFlagEmoji: true,
    });
  });

  it('profile 引用预设时使用预设配置', () => {
    const config = {
      nodeTransformPresets: [{ id: 'p1', config: { addFlagEmoji: false } }],
    };
    expect(resolveEffectiveNodeTransform({ nodeTransformPresetId: 'p1' }, config)).toEqual({
      addFlagEmoji: false,
    });
  });

  it('profile 自身优先于预设', () => {
    const config = {
      nodeTransformPresets: [{ id: 'p1', config: { addFlagEmoji: false } }],
    };
    expect(
      resolveEffectiveNodeTransform({ nodeTransformPresetId: 'p1', nodeTransform: { addFlagEmoji: true } }, config),
    ).toEqual({ addFlagEmoji: true });
  });
});

describe('resolveAddFlagEmoji 优先级', () => {
  it('profile.nodeTransform.addFlagEmoji 优先于全局 enableFlagEmoji', () => {
    expect(resolveAddFlagEmoji({ nodeTransform: { addFlagEmoji: false } }, { enableFlagEmoji: true })).toBe(false);
    expect(resolveAddFlagEmoji({ nodeTransform: { addFlagEmoji: true } }, { enableFlagEmoji: false })).toBe(true);
  });

  it('无 profile 时回退到全局 enableFlagEmoji', () => {
    expect(resolveAddFlagEmoji(null, { enableFlagEmoji: false })).toBe(false);
    expect(resolveAddFlagEmoji(null, { enableFlagEmoji: true })).toBe(true);
  });

  it('两边都未配置时返回 undefined（保持默认加国旗）', () => {
    expect(resolveAddFlagEmoji(null, {})).toBeUndefined();
  });
});
