import { normalizeUnifiedTemplateModel } from '../template-model.js';
import { pinRemoteRuleUrl } from '../builtin-rules-provider.js';
import { buildQuanxProxyLine, filterAutoGroupMembers, resolveModelProxies } from '../../core/client-shared.js';

function buildPolicyLine(group) {
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

function buildRuleLine(rule) {
  const type = String(rule.type || '').toUpperCase();
  if (!type) return null;
  if (type === 'RULE-SET') return null;
  if (type === 'MATCH' || type === 'FINAL') return `FINAL,${rule.policy}`;
  if (type === 'GEOIP') return `GEOIP,${rule.value || 'CN'},${rule.policy}`;
  return `${type},${rule.value},${rule.policy}`;
}

export function renderQuanxFromTemplateModel(model, options = {}) {
  const { isChinaClient = false } = options;
  const normalizedModel = normalizeUnifiedTemplateModel(model);
  const proxies = resolveModelProxies(normalizedModel, options);

  const remoteRules = normalizedModel.rules.filter(
    (r) => String(r.type).toUpperCase() === 'RULE-SET' && r.value.startsWith('http'),
  );
  const filterRemoteLines = remoteRules.map(
    (r) =>
      `filter_remote, ${pinRemoteRuleUrl(r.value, { isChinaClient })}, tag=${r.policy}, force-policy=${r.policy}, update-interval=86400, enabled=true`,
  );
  const localRules = normalizedModel.rules.filter((r) => !remoteRules.includes(r));

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
    ...proxies.map((proxy) => buildQuanxProxyLine(proxy)).filter(Boolean),
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
    ...localRules.map(buildRuleLine).filter(Boolean),
    '',
  ].join('\n');
}
