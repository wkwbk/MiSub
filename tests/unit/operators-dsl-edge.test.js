import { describe, expect, it } from 'vitest';
import {
  applyFilterRules,
  buildRuleSet,
  evaluateDslExpression,
  filterNodes,
  matchesDslCondition,
  renderDslTemplate,
  runOperatorChain,
} from '@misub/core';
import { buildSafeRegex as buildLegacySafeRegex } from '@misub/core/operators/legacy-adapter.js';

describe('@misub/core Expression DSL, Operator Runner & Legacy Adapter Edges', () => {
  it('evaluates nested DSL expressions, templates, logical ops, and blocks prototype pollution', () => {
    const ctx = {
      name: '  hk-vip-01  ',
      region: 'HK',
      regionZh: '香港',
      protocol: 'vless',
      port: 443,
      server: 'hk1.example.com',
    };

    expect(evaluateDslExpression("region === 'US' || port === 443 && region === 'HK'", ctx)).toBe(true);
    expect(evaluateDslExpression("region === 'US' || port === 80 && region === 'HK'", ctx)).toBe(false);
    expect(evaluateDslExpression('port >= 80 && port < 443', ctx)).toBe(false);
    expect(evaluateDslExpression("contains(name, 'VIP') && match(server, '^hk\\\\d+\\\\.')", ctx)).toBe(true);
    expect(evaluateDslExpression('nonExistentFn(name)', ctx)).toBe(false);

    // Escaped string literals and nested helpers in template rendering
    const rendered = renderDslTemplate(
      "{upper(trim(region))}-{title(protocol)}-{replace(trim(name), 'vip', 'PRO')}-{fallback(missingField, 'N/A')}-{pick(match(protocol, 'vless'), 'TLS', 'PLAIN')}",
      ctx,
    );
    expect(rendered).toBe('HK-Vless-hk-PRO-01-N/A-TLS');

    // Prototype property reads are blocked cleanly
    expect(renderDslTemplate('{constructor}|{__proto__}|{toString}', ctx)).toBe('||');

    // matchesDslCondition variants + invalid regex safety
    expect(matchesDslCondition(ctx, { field: 'protocol', op: 'eq', value: 'vless' })).toBe(true);
    expect(matchesDslCondition(ctx, { field: 'protocol', op: 'ne', value: 'vmess' })).toBe(true);
    expect(matchesDslCondition(ctx, { field: 'name', op: 'not_contains', value: 'US' })).toBe(true);
    expect(matchesDslCondition(ctx, { field: 'protocol', op: 'in', value: ['vless', 'trojan'] })).toBe(true);
    expect(matchesDslCondition(ctx, { field: 'name', op: 'regex', value: '[unclosed(' })).toBe(false);
    expect(matchesDslCondition(ctx, { field: 'name', op: 'unknown_op', value: 'x' })).toBe(false);
  });

  it('executes complex multi-operator pipelines (filter, rename scopes, dedup priority, sort, script)', async () => {
    const rawUrls = [
      `vless://11111111-1111-1111-1111-111111111111@shared.example.com:443?encryption=none#${encodeURIComponent('HK-Node-Short')}`,
      `trojan://pass@shared.example.com:443#${encodeURIComponent('HK-Node-Longer-Name')}`,
      `hy2://pass@jp.example.com:443#${encodeURIComponent('JP-Fast')}`,
      `vless://22222222-2222-2222-2222-222222222222@us.example.com:443?encryption=none#${encodeURIComponent('US-Expired-Test')}`,
      `socks5://u:p@sg.example.com:1080#${encodeURIComponent('SG-Socks')}`,
    ];

    const result = await runOperatorChain(
      rawUrls,
      [
        // Disabled operator must be skipped completely
        {
          type: 'filter',
          enabled: false,
          params: { exclude: { enabled: true, rules: ['HK'] } },
        },
        // Filter out Expired/Test and keep vless/trojan/hysteria2 (hy2 alias) + socks5 (socks alias)
        {
          type: 'filter',
          params: {
            exclude: { enabled: true, rules: ['Expired|Test'] },
            protocols: { enabled: true, values: ['vless', 'trojan', 'hysteria2', 'socks'] },
          },
        },
        // Deduplicate on server:port preferring vless over trojan even with shorter name
        {
          type: 'dedup',
          params: {
            mode: 'serverPort',
            includeProtocol: false,
            prefer: { protocolOrder: ['vless', 'trojan', 'ss'] },
          },
        },
        // Rename with regex + template regionProtocol index scope + offset
        {
          type: 'rename',
          params: {
            regex: {
              enabled: true,
              rules: [{ pattern: '-(Short|Fast)$', replacement: '-{regionZh}' }],
            },
            template: {
              enabled: true,
              template: '{name} #{index}',
              indexScope: 'regionProtocol',
              offset: 10,
            },
          },
        },
        // Script DSL step reading target from context
        {
          type: 'script',
          params: {
            dsl: [
              { action: 'filter', field: 'protocol', op: 'ne', value: 'socks5' },
              { action: 'rename', template: '{name} [{upper(target)}]' },
            ],
          },
        },
        // Sort alphabetically descending by name
        {
          type: 'sort',
          params: {
            keys: [{ key: 'name', order: 'desc' }],
          },
        },
      ],
      { target: 'clash', userAgent: 'Clash-Verge/1.7.0' },
    );

    const decodedNames = result.map((url) => decodeURIComponent(url.split('#')[1] || ''));
    expect(decodedNames).toHaveLength(2);
    expect(result.some((url) => url.startsWith('vless://11111111'))).toBe(true);
    expect(result.some((url) => url.startsWith('trojan://pass@shared.example.com'))).toBe(false);
    expect(result.some((url) => url.includes('US-Expired-Test'))).toBe(false);
    expect(decodedNames[0]).toContain('#10 [CLASH]');
    expect(decodedNames[1]).toContain('#10 [CLASH]');
  });

  it('handles legacy filter divider syntax, proto whitelist, and unsafe ReDoS rejection', () => {
    const nodes = [
      `vless://id@hk.example.com:443#${encodeURIComponent('HK-VIP')}`,
      `trojan://p@hk.example.com:443#${encodeURIComponent('HK-官网')}`,
      `hy2://p@jp.example.com:443#${encodeURIComponent('JP-专线')}`,
      `ss://YWVz@us.example.com:8388#${encodeURIComponent('US-Free')}`,
    ];

    // Divider puts exclude rules above --- and keep whitelist below ---
    const filtered = applyFilterRules(nodes, {
      exclude: '官网\n---\nproto:vless,hy2',
    });
    expect(filtered.map((n) => decodeURIComponent(n.split('#')[1]))).toEqual(['HK-VIP', 'JP-专线']);

    // Unsafe nested quantifier regex rejected gracefully without throwing
    const badRules = buildRuleSet(['(a+)+$', 'HK']);
    expect(badRules.hasRules).toBe(true);
    const matched = filterNodes(nodes, badRules, 'include');
    expect(matched.map((n) => decodeURIComponent(n.split('#')[1]))).toEqual(['HK-VIP', 'HK-官网']);

    // Combined pattern > 2048 chars returns null safely
    const hugePatterns = Array.from({ length: 150 }, (_, i) => `node_prefix_${i}_pattern`);
    expect(buildLegacySafeRegex(hugePatterns)).toBeNull();
  });
});
