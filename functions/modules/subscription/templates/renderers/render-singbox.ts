import {
  normalizeUnifiedTemplateModel,
  type TemplateGroup,
  type TemplateProxy,
  type TemplateRule,
  type UnifiedTemplateModelInput,
} from '../template-model.js';
import { buildSingboxDnsConfig, DNS_PROXY_GROUP, SINGBOX_CN_RULE_SET } from '../../security/safe-dns.js';
import { getSingboxDnsRuleSet, pinRemoteRuleUrl, type SingboxRuleSetDefinition } from '../builtin-rules-provider.js';
import { SINGBOX_SNIFF_RULE } from '../../core/sniffing-config.js';
import {
  applySingboxShadowsocksPlugin,
  applySingboxTuicExtraFields,
  buildSingboxConfigEnvelope,
  DEFAULT_TEST_URL,
  filterAutoGroupMembers,
  resolveModelProxies,
} from '../../core/client-shared.js';

export interface RenderSingboxOptions {
  nodeList?: string;
  isChinaClient?: boolean;
  [key: string]: unknown;
}

interface SingboxTlsBlock {
  enabled: boolean;
  server_name: string;
  insecure: boolean;
  alpn?: unknown[];
  utls?: { enabled: boolean; fingerprint: string };
  reality?: { enabled: boolean; public_key: string; short_id: string };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function sanitizeTag(value: unknown): string {
  return String(value || '').trim() || 'Untitled';
}

function parsePort(port: unknown): number | undefined {
  const num = Number.parseInt(String(port), 10);
  return Number.isFinite(num) ? num : undefined;
}

function buildOutbound(proxy: TemplateProxy): Record<string, unknown> | null {
  if (!proxy || !proxy.server || !proxy.port) return null;

  const type = String(proxy.type || '').toLowerCase();
  const tag = sanitizeTag(proxy.name);
  const server = proxy.server;
  const serverPort = parsePort(proxy.port);
  if (!serverPort) return null;

  if (type === 'http' || type === 'https') {
    const outbound: Record<string, unknown> = {
      tag,
      type: 'http',
      server,
      server_port: serverPort,
      username: proxy.username || undefined,
      password: proxy.password || undefined,
    };
    if (type === 'https' || proxy.tls || proxy.sni || proxy.servername) {
      outbound.tls = {
        enabled: true,
        server_name: proxy.servername ?? proxy.sni ?? server,
        insecure: proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true,
      };
    }
    return outbound;
  }

  if (type === 'trojan') {
    return {
      tag,
      type: 'trojan',
      server,
      server_port: serverPort,
      password: proxy.password || '',
      tls: {
        enabled: true,
        server_name: proxy.servername ?? proxy.sni ?? server,
        insecure: proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true,
      },
    };
  }

  if (type === 'ss' || type === 'shadowsocks') {
    const outbound: Record<string, unknown> = {
      tag,
      type: 'shadowsocks',
      server,
      server_port: serverPort,
      method: proxy.cipher || 'aes-128-gcm',
      password: proxy.password || '',
    };
    // sing-box 的 Shadowsocks 出站使用 SIP003 plugin/plugin_opts；
    // `transport` 仅属于 V2Ray 传输协议，SFA 会严格拒绝它。
    applySingboxShadowsocksPlugin(outbound, proxy);
    return outbound;
  }

  if (type === 'vmess') {
    const outbound: Record<string, unknown> = {
      tag,
      type: 'vmess',
      server,
      server_port: serverPort,
      uuid: proxy.uuid || '',
      security: proxy.cipher || 'auto',
      alter_id: Number.isFinite(Number(proxy.alterId)) ? Number(proxy.alterId) : 0,
    };

    const network = proxy.network || '';
    if (network === 'ws') {
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      outbound.transport = {
        type: 'ws',
        path: wsOpts?.path || '/',
        headers: asRecord(wsOpts?.headers) || {},
      };
    } else if (network === 'grpc') {
      const grpcOpts = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts);
      outbound.transport = {
        type: 'grpc',
        service_name: grpcOpts?.['grpc-service-name'] || grpcOpts?.serviceName || 'grpc',
      };
    } else if (network === 'h2' || network === 'http') {
      const opts = asRecord(proxy[`${network}-opts`]) || asRecord(proxy[`${network}Opts`]);
      outbound.transport = {
        type: 'http',
        host: opts?.host ? (Array.isArray(opts.host) ? opts.host : [opts.host]) : [],
        path: opts?.path || '/',
      };
    }

    if (proxy.tls || proxy.sni || proxy.servername) {
      const tls: SingboxTlsBlock = {
        enabled: true,
        server_name: String(proxy.servername ?? proxy.sni ?? server),
        insecure: proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true,
      };
      if (proxy.alpn) tls.alpn = Array.isArray(proxy.alpn) ? proxy.alpn : [proxy.alpn];
      outbound.tls = tls;
    }
    return outbound;
  }

  if (type === 'vless') {
    const outbound: Record<string, unknown> = {
      tag,
      type: 'vless',
      server,
      server_port: serverPort,
      uuid: proxy.uuid || '',
    };
    if (proxy.flow) outbound.flow = proxy.flow;

    const network = proxy.network || '';
    if (network === 'ws') {
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      outbound.transport = {
        type: 'ws',
        path: wsOpts?.path || '/',
        headers: asRecord(wsOpts?.headers) || {},
      };
    } else if (network === 'grpc') {
      const grpcOpts = asRecord(proxy['grpc-opts']) || asRecord(proxy.grpcOpts);
      outbound.transport = {
        type: 'grpc',
        service_name: grpcOpts?.['grpc-service-name'] || grpcOpts?.serviceName || 'grpc',
      };
    } else if (network === 'httpupgrade') {
      const httpupgradeOpts = asRecord(proxy['httpupgrade-opts']) || asRecord(proxy.httpupgradeOpts);
      outbound.transport = {
        type: 'httpupgrade',
        path: httpupgradeOpts?.path || '/',
        host: httpupgradeOpts?.host || '',
      };
    }

    if (proxy.tls || proxy.sni || proxy.servername) {
      const tls: SingboxTlsBlock = {
        enabled: true,
        server_name: String(proxy.servername ?? proxy.sni ?? server),
        insecure: proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true,
      };

      const fingerprint = proxy['client-fingerprint'] || proxy.clientFingerprint || proxy.fp;
      if (fingerprint) {
        tls.utls = {
          enabled: true,
          fingerprint: String(fingerprint),
        };
      }

      const realityOpts = asRecord(proxy['reality-opts']) || asRecord(proxy.realityOpts);
      if (realityOpts) {
        tls.reality = {
          enabled: true,
          public_key: String(realityOpts['public-key'] || realityOpts.publicKey || ''),
          short_id: String(realityOpts['short-id'] || realityOpts.shortId || ''),
        };
      }
      outbound.tls = tls;
    }
    return outbound;
  }

  if (type === 'hysteria2' || type === 'hy2') {
    return {
      tag,
      type: 'hysteria2',
      server,
      server_port: serverPort,
      password: proxy.password || '',
      tls: {
        enabled: true,
        server_name: proxy.servername ?? proxy.sni ?? server,
        insecure: proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true,
      },
    };
  }

  if (type === 'tuic') {
    const tls: SingboxTlsBlock = {
      enabled: true,
      server_name: String(proxy.servername ?? proxy.sni ?? server),
      insecure: proxy['skip-cert-verify'] === true || proxy.skipCertVerify === true,
    };
    if (proxy.alpn) tls.alpn = Array.isArray(proxy.alpn) ? proxy.alpn : [proxy.alpn];
    const outbound: Record<string, unknown> = {
      tag,
      type: 'tuic',
      server,
      server_port: serverPort,
      uuid: proxy.uuid || '',
      password: proxy.password || '',
      tls,
    };
    applySingboxTuicExtraFields(outbound, proxy);
    return outbound;
  }

  if (type === 'wireguard') {
    return {
      tag,
      type: 'wireguard',
      server,
      server_port: serverPort,
      local_address: Array.isArray(proxy.ip) ? proxy.ip : proxy.ip ? [proxy.ip] : [],
      private_key: proxy['private-key'] || '',
      peer_public_key: proxy['public-key'] || '',
      pre_shared_key: proxy['preshared-key'] || '',
    };
  }

  return null;
}

function mapGroupType(type: unknown): 'selector' | 'urltest' {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'select') return 'selector';
  if (normalized === 'url-test') return 'urltest';
  if (normalized === 'load-balance') return 'selector';
  return 'selector';
}

function buildGroupOutbounds(groups: TemplateGroup[]): Array<Record<string, unknown>> {
  return groups.map((group) => {
    const mappedType = mapGroupType(group.type);
    const outbounds = filterAutoGroupMembers(mappedType, group.members);
    const outbound: Record<string, unknown> = {
      tag: sanitizeTag(group.name),
      type: mappedType,
      outbounds,
    };

    if (mappedType === 'urltest') {
      outbound.url = group.options?.url || DEFAULT_TEST_URL;
      outbound.interval = `${group.options?.interval || 300}s`;
    }

    if (mappedType === 'selector' && outbounds.length > 0) {
      outbound.default = outbounds[0];
    }

    return outbound;
  });
}

function mapRuleToSingbox(rule: TemplateRule): Record<string, unknown> | null {
  if (typeof rule === 'string') return null;
  const type = String(rule.type || '').toLowerCase();
  if (type === 'rule-set') {
    return {
      rule_set: sanitizeTag(`${rule.policy}_${rule.value}`),
      outbound: rule.policy,
    };
  }
  if (type === 'geoip') {
    const value = String(rule.value || 'cn').toLowerCase();
    return {
      rule_set: [`geoip-${value}`],
      outbound: rule.policy,
    };
  }
  if (type === 'geosite') {
    const value = String(rule.value || 'cn').toLowerCase();
    return {
      rule_set: [`geosite-${value}`],
      outbound: rule.policy,
    };
  }
  if (type === 'match' || type === 'final') {
    return {
      outbound: rule.policy,
    };
  }
  if (type === 'domain-suffix') {
    return {
      domain_suffix: [rule.value],
      outbound: rule.policy,
    };
  }
  if (type === 'domain-keyword') {
    return {
      domain_keyword: [rule.value],
      outbound: rule.policy,
    };
  }
  return null;
}

function detectRuleSetFormat(url: unknown): 'binary' | 'source' {
  const raw = String(url || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'source';
  return raw.endsWith('.srs') ? 'binary' : 'source';
}

function buildRuleSets(
  rules: TemplateRule[],
  { isChinaClient = false }: { isChinaClient?: boolean } = {},
): SingboxRuleSetDefinition[] {
  const seenRemote = new Set<string>();
  const remoteRuleSets: SingboxRuleSetDefinition[] = [];
  rules.forEach((rule) => {
    if (typeof rule !== 'object' || rule === null) return;
    if (String(rule.type || '').toLowerCase() !== 'rule-set' || rule.source !== 'remote') return;
    const val = String(rule.value || '');
    const tag = sanitizeTag(`${rule.policy}_${val}`);
    if (seenRemote.has(tag)) return;
    seenRemote.add(tag);
    remoteRuleSets.push({
      tag,
      type: 'remote',
      format: detectRuleSetFormat(val),
      url: pinRemoteRuleUrl(val, { isChinaClient }),
      update_interval: '24h',
      download_detour: DNS_PROXY_GROUP,
    });
  });

  const implicitRuleSets: SingboxRuleSetDefinition[] = [];
  const seen = new Set<string>();

  rules.forEach((rule) => {
    if (typeof rule !== 'object' || rule === null) return;
    const type = String(rule.type || '').toLowerCase();
    if (type === 'geoip' || type === 'geosite') {
      const value = String(rule.value || 'cn').toLowerCase();
      const tag = `${type}-${value}`;
      if (!seen.has(tag)) {
        seen.add(tag);
        implicitRuleSets.push({
          tag,
          type: 'remote',
          format: 'binary',
          url:
            type === 'geoip'
              ? pinRemoteRuleUrl(`https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-${value}.srs`, {
                  isChinaClient,
                })
              : pinRemoteRuleUrl(
                  `https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-${value}.srs`,
                  { isChinaClient },
                ),
          update_interval: '24h',
          download_detour: DNS_PROXY_GROUP,
        });
      }
    }
  });

  return [...remoteRuleSets, ...implicitRuleSets];
}

export function renderSingboxFromTemplateModel(
  model: UnifiedTemplateModelInput,
  options: RenderSingboxOptions = {},
): string {
  const normalizedModel = normalizeUnifiedTemplateModel(model);
  const proxies = resolveModelProxies(normalizedModel, options);
  const proxyOutbounds = proxies.map(buildOutbound).filter((item): item is Record<string, unknown> => Boolean(item));
  const groupOutbounds = buildGroupOutbounds(
    normalizedModel.groups.filter((g) => Array.isArray(g.members) && g.members.length > 0),
  );
  const ruleSetObjects = [
    getSingboxDnsRuleSet({ isChinaClient: options.isChinaClient }),
    ...buildRuleSets(normalizedModel.rules, { isChinaClient: options.isChinaClient }).filter(
      (ruleSet) => ruleSet.tag !== SINGBOX_CN_RULE_SET,
    ),
  ];
  // 首条为域名嗅探：还原硬编码 IP 直连流量的真实域名后再进入模板分流规则
  const routeRules = [
    { ...SINGBOX_SNIFF_RULE },
    ...normalizedModel.rules.map(mapRuleToSingbox).filter((item): item is Record<string, unknown> => Boolean(item)),
  ];
  const defaultOutbound = normalizedModel.groups.find((group) => group.name !== DNS_PROXY_GROUP)?.name || 'DIRECT';
  const dnsConfig = buildSingboxDnsConfig(normalizedModel.settings?.customDnsOverride, {
    mode: normalizedModel.settings?.dnsMode,
    proxyGroup: DNS_PROXY_GROUP,
  });

  const config = buildSingboxConfigEnvelope({
    dnsConfig,
    proxyOutbounds,
    groupOutbounds,
    finalOutbound: defaultOutbound,
    ruleSets: ruleSetObjects,
    routeRules,
  });

  return JSON.stringify(config, null, 2) + '\n';
}
