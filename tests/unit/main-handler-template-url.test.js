import { describe, expect, it } from 'vitest';
import {
  buildExternalSubconverterUrl,
  buildManagedConfigUrl,
  extractProxySectionFromBuiltin,
  formatNotificationExpireStatus,
  formatNotificationExpireTime,
  resolveExternalTemplateConfigUrl,
  resolveTemplateSource,
  resolveTransformPlan,
} from '../../functions/modules/subscription/core/main-handler.js';

describe('Main handler template url', () => {
  it('formats Telegram expiration with profile priority and merged fallback', () => {
    const now = Date.parse('2029-01-01T00:00:00Z');
    const mergedExpire = Math.floor(Date.parse('2030-01-01T00:00:00Z') / 1000);

    expect(formatNotificationExpireTime('2031-01-02T03:04:05Z', mergedExpire, now)).toContain('2031');
    expect(formatNotificationExpireTime('', mergedExpire, now)).toContain('2030');
    expect(formatNotificationExpireTime('', 0, now)).toBe('未设置');
    expect(formatNotificationExpireTime('', mergedExpire, Date.parse('2032-01-01T00:00:00Z'))).toContain('2030');
  });

  it('formats expiration status independently from expiration time', () => {
    const now = Date.parse('2029-01-01T00:00:00Z');
    const soon = Math.floor(Date.parse('2029-01-04T00:00:00Z') / 1000);
    const later = Math.floor(Date.parse('2029-02-01T00:00:00Z') / 1000);
    const expired = Math.floor(Date.parse('2028-12-31T00:00:00Z') / 1000);

    expect(formatNotificationExpireStatus('', 0, now)).toBe('正常');
    expect(formatNotificationExpireStatus('', later, now, 3)).toBe('正常');
    expect(formatNotificationExpireStatus('', soon, now, 3)).toBe('即将到期');
    expect(formatNotificationExpireStatus('', expired, now, 3)).toBe('已到期');
  });

  it('should preserve subscription url while removing cache flags', () => {
    const url = buildManagedConfigUrl('https://example.com/sub?profile=demo&refresh=1&nocache=1');

    expect(url).toBe('https://example.com/sub?profile=demo');
  });

  it('should extract QuanX nodes from server_local section for list mode', () => {
    const content = [
      '[General]',
      'skip-proxy = localhost',
      '',
      '[server_local]',
      'DIRECT = direct',
      'shadowsocks=1.2.3.4:443, method=aes-128-gcm, password=test, tag=HK-01',
      '',
      '[policy]',
      'Proxy = select, HK-01, DIRECT',
    ].join('\n');

    expect(extractProxySectionFromBuiltin(content, 'quanx')).toBe(
      'shadowsocks=1.2.3.4:443, method=aes-128-gcm, password=test, tag=HK-01',
    );
  });

  it('should resolve template sources cleanly per transform mode', () => {
    const smartPlan = resolveTransformPlan({
      profile: { transformMode: 'smart', templateConfig: 'https://example.com/a.yaml' },
      config: { transformMode: 'template', templateConfig: 'https://example.com/fallback.yaml' },
    });
    expect(smartPlan.mode).toBe('smart');
    expect(smartPlan.templateSource).toEqual({ kind: 'none', value: '' });

    const inheritTemplatePlan = resolveTransformPlan({
      profile: {},
      config: { transformMode: 'template', templateConfig: 'https://example.com/fallback.yaml' },
    });
    expect(inheritTemplatePlan.mode).toBe('template');
    expect(inheritTemplatePlan.templateSource).toEqual({
      kind: 'remote',
      value: 'https://example.com/fallback.yaml',
    });

    const profileCustomTemplatePlan = resolveTransformPlan({
      profile: { transformMode: 'template', templateConfig: 'custom:tpl-a' },
      config: { transformMode: 'template', templateConfig: 'https://example.com/fallback.yaml' },
    });
    expect(profileCustomTemplatePlan.templateSource).toEqual({ kind: 'custom', value: 'tpl-a' });

    expect(resolveTemplateSource('builtin:clash_acl4ssr_full')).toEqual({
      kind: 'builtin',
      value: 'clash_acl4ssr_full',
    });
    expect(resolveTemplateSource('custom:tpl-a')).toEqual({ kind: 'custom', value: 'tpl-a' });
    expect(resolveExternalTemplateConfigUrl(resolveTemplateSource('builtin:clash_acl4ssr_full'))).toBe('');
    expect(resolveExternalTemplateConfigUrl(resolveTemplateSource('custom:tpl-a'))).toBe('');
    expect(resolveExternalTemplateConfigUrl(resolveTemplateSource('https://example.com/preset.yaml'))).toBe(
      'https://example.com/preset.yaml',
    );
  });

  it('should forward remote YAML config URLs to external subconverter backends', () => {
    const externalUrl = buildExternalSubconverterUrl({
      backend: 'https://sub.example.com/sub',
      targetFormat: 'clash',
      nodeList: 'ss://node-a#A\nss://node-b#B',
      templateUrl: 'https://raw.githubusercontent.com/Luckylos/shellcrashyaml/main/subconverter-shellcrash-needs.yaml',
      subName: 'ShellCrash',
    });

    expect(externalUrl.searchParams.get('target')).toBe('clash');
    expect(externalUrl.searchParams.get('url')).toBe('ss://node-a#A|ss://node-b#B');
    expect(externalUrl.searchParams.get('config')).toBe(
      'https://raw.githubusercontent.com/Luckylos/shellcrashyaml/main/subconverter-shellcrash-needs.yaml',
    );
  });

  it('should normalize GitHub blob config URLs before forwarding to external subconverter backends', () => {
    const externalUrl = buildExternalSubconverterUrl({
      backend: 'https://sub.example.com/sub',
      targetFormat: 'clash',
      nodeList: 'ss://node-a#A',
      templateUrl: 'https://github.com/Luckylos/shellcrashyaml/blob/main/subconverter-shellcrash-needs.yaml',
      subName: 'ShellCrash',
    });

    expect(externalUrl.searchParams.get('config')).toBe(
      'https://raw.githubusercontent.com/Luckylos/shellcrashyaml/main/subconverter-shellcrash-needs.yaml',
    );
  });

  it('treats remote Clash YAML profiles strictly as template mode rather than external mode', () => {
    const externalPlan = resolveTransformPlan({
      profile: {
        transformMode: 'external',
        externalBackend: {
          url: 'api.v1.mk',
          templateUrl:
            'https://raw.githubusercontent.com/Luckylos/shellcrashyaml/refs/heads/main/subconverter-shellcrash-needs.yaml',
        },
      },
      config: { transformMode: 'smart' },
    });
    expect(externalPlan.mode).toBe('external');

    const templatePlan = resolveTransformPlan({
      profile: {
        transformMode: 'template',
        templateConfig:
          'https://raw.githubusercontent.com/Luckylos/shellcrashyaml/refs/heads/main/subconverter-shellcrash-needs.yaml',
      },
      config: { transformMode: 'smart' },
    });
    expect(templatePlan.mode).toBe('template');
    expect(templatePlan.templateSource).toEqual({
      kind: 'remote',
      value:
        'https://raw.githubusercontent.com/Luckylos/shellcrashyaml/refs/heads/main/subconverter-shellcrash-needs.yaml',
    });
  });
});
