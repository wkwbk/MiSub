import { describe, expect, it } from 'vitest';
import { determineTargetFormat, isHiddifyAgent } from '../../functions/modules/subscription/core/user-agent-utils.js';
import {
  resolveBuiltinRequestOptions,
  resolveTransformPlan,
} from '../../functions/modules/subscription/core/main-handler.js';

const hiddifyUa = 'HiddifyNext/4.1.1 (android) like ClashMeta v2ray sing-box';

describe('Hiddify subscription compatibility', () => {
  it('detects Hiddify clients as sing-box-compatible by default', () => {
    const params = new URLSearchParams('');

    expect(isHiddifyAgent(hiddifyUa)).toBe(true);
    expect(determineTargetFormat(hiddifyUa, params)).toBe('singbox');
  });

  it('forces automatic Hiddify requests to smart engine even when global default is external', () => {
    const params = new URLSearchParams('');

    expect(
      resolveTransformPlan({
        searchParams: params,
        userAgent: hiddifyUa,
        profile: {},
        config: { transformMode: 'external' },
      }).mode,
    ).toBe('smart');
  });

  it('still respects explicit engine, mode, and target parameters for Hiddify requests', () => {
    expect(
      resolveTransformPlan({
        searchParams: new URLSearchParams('?engine=external'),
        userAgent: hiddifyUa,
        profile: {},
        config: { transformMode: 'smart' },
      }).mode,
    ).toBe('external');

    expect(
      resolveTransformPlan({
        searchParams: new URLSearchParams('?builtin=external'),
        userAgent: hiddifyUa,
        profile: {},
        config: { transformMode: 'smart' },
      }).mode,
    ).toBe('external');

    expect(
      resolveTransformPlan({
        searchParams: new URLSearchParams('?target=singbox'),
        userAgent: hiddifyUa,
        profile: {},
        config: { transformMode: 'external' },
      }).mode,
    ).toBe('external');
  });

  it('exposes Hiddify compatibility options for builtin rendering', () => {
    const params = new URLSearchParams('');

    expect(
      resolveBuiltinRequestOptions({
        searchParams: params,
        userAgent: hiddifyUa,
      }),
    ).toMatchObject({
      userAgent: hiddifyUa,
      searchParams: params,
      hiddifyCompatible: true,
    });
  });
});
