import {
  normalizeUnifiedTemplateModel,
  type TemplateGroup,
  type TemplateRule,
  type TemplateRuleObject,
  type UnifiedTemplateModelInput,
} from '../template-model.js';
import { pinRemoteRuleUrl } from '../builtin-rules-provider.js';
import { buildQuanxProxyLine, filterAutoGroupMembers, resolveModelProxies } from '../../core/client-shared.js';

export interface RenderQuanxOptions {
  nodeList?: string;
  isChinaClient?: boolean;
  [key: string]: unknown;
}

function buildPolicyLine(group: TemplateGroup): string {
  const type = String(group.type || 'select').toLowerCase();
  const members = filterAutoGroupMembers(type, group.members).join(', ');
  const tolerance = group.options?.tolerance || 50;
  const interval = group.options?.interval || 300;

  if (type === 'url-test' || type === 'url-latency-benchmark') {
    return `url-latency-benchmark=${group.name}, ${members}, check-interval=${interval}, tolerance=${tolerance}`;
  }
  if (type === 'fallback' || type === 'available') {
    return `available=${group.name}, ${members}`;
  }
  return `static=${group.name}, ${members}`;
}

function buildRuleLine(rule: TemplateRule): string | null {
  if (typeof rule === 'string') return rule;
  const type = String(rule.type || '').toUpperCase();
  if (!type) return null;
  if (type === 'RULE-SET') return null;
  if (type === 'MATCH' || type === 'FINAL') return `FINAL,${rule.policy}`;
  if (type === 'GEOIP') return `GEOIP,${rule.value || 'CN'},${rule.policy}`;
  return `${type},${rule.value},${rule.policy}`;
}

export function renderQuanxFromTemplateModel(
  model: UnifiedTemplateModelInput,
  options: RenderQuanxOptions = {},
): string {
  const { isChinaClient = false } = options;
  const normalizedModel = normalizeUnifiedTemplateModel(model);
  const proxies = resolveModelProxies(normalizedModel, options);

  const remoteRules = normalizedModel.rules.filter(
    (r): r is TemplateRuleObject =>
      typeof r === 'object' &&
      r !== null &&
      String(r.type || '').toUpperCase() === 'RULE-SET' &&
      typeof r.value === 'string' &&
      r.value.startsWith('http'),
  );
  const remoteRuleSet = new Set<TemplateRule>(remoteRules);
  const filterRemoteLines = remoteRules.map(
    (r) =>
      `filter_remote, ${pinRemoteRuleUrl(r.value || '', { isChinaClient })}, tag=${r.policy}, force-policy=${r.policy}, update-interval=86400, enabled=true`,
  );
  const localRules = normalizedModel.rules.filter((r) => !remoteRuleSet.has(r));

  return [
    '[general]',
    '; 监听端口',
    'network_check_url=http://www.gstatic.com/generate_204',
    'server_check_url=http://www.gstatic.com/generate_204',
    '',
    '[dns]',
    'no-ipv6',
    'server = 223.5.5.5',
    'server = 114.114.114.114',
    '',
    '[server_local]',
    ...proxies.map((proxy) => buildQuanxProxyLine(proxy)).filter((line): line is string => Boolean(line)),
    '',
    '[policy]',
    ...normalizedModel.groups
      .filter((group) => Array.isArray(group.members) && group.members.length > 0)
      .map(buildPolicyLine)
      .filter(Boolean),
    '',
    '[filter_remote]',
    ...filterRemoteLines,
    '',
    '[filter_local]',
    ...localRules.map(buildRuleLine).filter((line): line is string => Boolean(line)),
    '',
  ].join('\n');
}
