import * as yaml from 'js-yaml';
import {
  normalizeUnifiedTemplateModel,
  type TemplateGroup,
  type TemplateProxy,
  type TemplateRule,
  type UnifiedTemplateModelInput,
} from '../template-model.js';
import { pinRemoteRuleUrl } from '../builtin-rules-provider.js';

export interface RenderEgernOptions {
  isChinaClient?: boolean;
  [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function s(val: unknown): string {
  if (val === undefined || val === null) return '';
  return String(val)
    .replace(/[\r\n]/g, '')
    .trim();
}

interface EgernTlsConfig {
  skip_tls_verify: boolean;
  sni: string;
  reality?: {
    public_key: string;
    short_id: string;
  };
}

interface EgernTransportConfig {
  wss?: { path: string; headers: Record<string, unknown>; skip_tls_verify: boolean; sni: string };
  ws?: { path: string; headers: Record<string, unknown> };
  grpc?: { service_name: string };
  h2?: { path: string; host: string[] };
  tls?: EgernTlsConfig;
}

function mapTransport(proxy: TemplateProxy): EgernTransportConfig | undefined {
  const network = String(proxy.network || 'tcp').toLowerCase();
  const transport: EgernTransportConfig = {};

  const realityOpts = asRecord(proxy['reality-opts']);
  const tls: EgernTlsConfig | null =
    proxy.tls || Boolean(realityOpts)
      ? {
          skip_tls_verify: Boolean(proxy['skip-cert-verify'] || proxy.skipCertVerify),
          sni: s(proxy.servername ?? proxy.sni ?? proxy.server),
        }
      : null;

  if (network === 'ws' || network === 'websocket') {
    const wsOpts = asRecord(proxy['ws-opts']);
    const wsHeaders = asRecord(wsOpts?.headers) || {};
    if (tls) {
      transport.wss = {
        path: s(wsOpts?.path || '/'),
        headers: wsHeaders,
        ...tls,
      };
    } else {
      transport.ws = {
        path: s(wsOpts?.path || '/'),
        headers: wsHeaders,
      };
    }
  } else if (network === 'grpc') {
    const grpcOpts = asRecord(proxy['grpc-opts']);
    transport.grpc = {
      service_name: s(grpcOpts?.['grpc-service-name'] || grpcOpts?.['service-name'] || grpcOpts?.serviceName || 'grpc'),
    };
    if (tls) transport.tls = tls;
  } else if (network === 'h2' || network === 'http2') {
    const h2Opts = asRecord(proxy['h2-opts']);
    transport.h2 = {
      path: s(h2Opts?.path || '/'),
      host: Array.isArray(h2Opts?.host) ? h2Opts.host.map((h) => s(h)) : [s(h2Opts?.host || proxy.server)],
    };
    if (tls) transport.tls = tls;
  } else {
    if (tls) transport.tls = tls;
  }

  if (transport.tls && realityOpts) {
    transport.tls.reality = {
      public_key: s(realityOpts['public-key'] || realityOpts.publicKey),
      short_id: s(realityOpts['short-id'] || realityOpts.shortId),
    };
  }

  return Object.keys(transport).length > 0 ? transport : undefined;
}

function mapProxy(proxy: TemplateProxy): Record<string, Record<string, unknown>> | null {
  const type = s(proxy.type).toLowerCase();
  const name = s(proxy.name);
  const server = s(proxy.server);
  const password = s(proxy.password);
  const uuid = s(proxy.uuid);

  if (type === 'trojan') {
    const trojanObj: Record<string, unknown> = {
      name,
      server,
      port: proxy.port,
      password,
      skip_tls_verify: Boolean(proxy['skip-cert-verify'] || proxy.skipCertVerify),
    };
    const sni = s(proxy.servername ?? proxy.sni ?? proxy.server);
    if (sni) trojanObj.sni = sni;

    // Egern Trojan 特殊处理: 使用 websocket 对象而非 transport
    if (proxy.network === 'ws' || proxy.network === 'websocket') {
      const wsOpts = asRecord(proxy['ws-opts']) || asRecord(proxy.wsOpts);
      const wsHeaders = asRecord(wsOpts?.headers);
      const websocket: Record<string, unknown> = {
        enabled: true,
        path: s(wsOpts?.path || '/'),
      };
      const host = s(wsHeaders?.Host || wsOpts?.host);
      if (host) websocket.host = host;
      trojanObj.websocket = websocket;
    } else {
      const transport = mapTransport(proxy);
      if (transport) trojanObj.transport = transport;
    }
    return { trojan: trojanObj };
  }

  if (type === 'vless') {
    const vlessObj: Record<string, unknown> = {
      name,
      server,
      port: proxy.port,
      user_id: uuid,
    };
    if (typeof proxy.flow === 'string' && proxy.flow) {
      vlessObj.flow = proxy.flow.includes('vision') ? 'xtls-rprx-vision' : s(proxy.flow);
    }
    const transport = mapTransport(proxy);
    if (transport) vlessObj.transport = transport;
    return { vless: vlessObj };
  }

  if (type === 'vmess') {
    const vmessObj: Record<string, unknown> = {
      name,
      server,
      port: proxy.port,
      user_id: uuid,
      security: s(proxy.cipher || 'auto'),
    };
    const transport = mapTransport(proxy);
    if (transport) vmessObj.transport = transport;
    return { vmess: vmessObj };
  }

  if (type === 'ss' || type === 'shadowsocks') {
    const ssObj: Record<string, unknown> = {
      name,
      server,
      port: proxy.port,
      method: s(proxy.cipher || proxy.method),
      password,
    };
    const pluginOpts = asRecord(proxy['plugin-opts']) || asRecord(proxy.pluginOpts) || {};
    if (proxy.plugin === 'obfs') {
      ssObj.obfs = s(pluginOpts.mode || 'http');
      ssObj.obfs_host = s(pluginOpts.host || proxy.server);
    } else if (proxy.plugin === 'v2ray-plugin' || pluginOpts.mode === 'websocket') {
      const isTls = Boolean(pluginOpts.tls || pluginOpts.mode === 'websocket-tls');
      ssObj.transport = isTls
        ? {
            wss: {
              path: s(pluginOpts.path || '/'),
              headers: pluginOpts.host ? { Host: s(pluginOpts.host) } : {},
              sni: s(proxy.servername ?? proxy.sni ?? pluginOpts.host ?? proxy.server),
              skip_tls_verify: Boolean(proxy['skip-cert-verify'] || proxy.skipCertVerify),
            },
          }
        : {
            ws: {
              path: s(pluginOpts.path || '/'),
              headers: pluginOpts.host ? { Host: s(pluginOpts.host) } : {},
            },
          };
    }
    return { shadowsocks: ssObj };
  }

  if (type === 'hysteria2' || type === 'hy2') {
    const hy2Obj: Record<string, unknown> = {
      name,
      server,
      port: proxy.port,
      auth: password,
      skip_tls_verify: Boolean(proxy['skip-cert-verify'] || proxy.skipCertVerify),
    };
    const sni = s(proxy.servername ?? proxy.sni ?? proxy.server);
    if (sni) hy2Obj.sni = sni;
    if (String(proxy.obfs || '').toLowerCase() === 'salamander' && proxy['obfs-password']) {
      hy2Obj.obfs = 'salamander';
      hy2Obj.obfs_password = s(proxy['obfs-password']);
    }
    const upVal = Number.parseInt(String(proxy.up || ''), 10);
    if (Number.isFinite(upVal) && upVal > 0) hy2Obj.up = upVal;
    const downVal = Number.parseInt(String(proxy.down || proxy['download-bandwidth'] || ''), 10);
    if (Number.isFinite(downVal) && downVal > 0) hy2Obj.down = downVal;
    return { hysteria2: hy2Obj };
  }

  if (type === 'tuic') {
    const tuicObj: Record<string, unknown> = {
      name,
      server,
      port: proxy.port,
      uuid,
      password,
      version: 5,
      congestion_control: s(proxy['congestion-controller'] || proxy['congestion-control'] || 'bbr'),
      skip_tls_verify: Boolean(proxy['skip-cert-verify'] || proxy.skipCertVerify),
    };
    const sni = s(proxy.servername ?? proxy.sni ?? proxy.server);
    if (sni) tuicObj.sni = sni;

    if (proxy.alpn) {
      tuicObj.alpn = Array.isArray(proxy.alpn) ? proxy.alpn : [s(proxy.alpn)];
    }

    if (proxy['udp-relay-mode']) {
      tuicObj.udp_relay_mode = s(proxy['udp-relay-mode']);
    }

    return { tuic: tuicObj };
  }

  if (type === 'anytls') {
    const anytlsObj: Record<string, unknown> = {
      name,
      server,
      port: proxy.port,
      password,
      udp_relay: Boolean(proxy.udp),
    };
    const sni = s(proxy.servername ?? proxy.sni ?? proxy.server);
    if (sni) anytlsObj.sni = sni;
    return { anytls: anytlsObj };
  }

  const inner: Record<string, unknown> = {
    name,
    server,
    port: proxy.port,
  };

  if (proxy.tfo) {
    inner.tcp_fast_open = true;
  }

  return { [type]: inner };
}

function mapPolicyGroup(group: TemplateGroup): Record<string, Record<string, unknown>> {
  const type = s(group.type || 'select').toLowerCase();
  const policies = Array.isArray(group.members) ? group.members.filter(Boolean).map((p) => s(p)) : [];

  if (type === 'url-test' || type === 'urltest' || type === 'auto-test') {
    return {
      auto_test: {
        name: s(group.name),
        policies,
        interval: Number(group.options?.interval) || 600,
        tolerance: Number(group.options?.tolerance) || 100,
      },
    };
  }

  if (type === 'fallback') {
    return {
      fallback: {
        name: s(group.name),
        policies,
        interval: Number(group.options?.interval) || 600,
      },
    };
  }

  return {
    select: {
      name: s(group.name),
      policies,
    },
  };
}

function mapRule(
  rule: TemplateRule,
  { isChinaClient = false }: { isChinaClient?: boolean } = {},
): Record<string, Record<string, unknown>> | null {
  if (typeof rule === 'string') return null;
  const type = s(rule.type).toLowerCase();
  if (!type) return null;
  const policy = s(rule.policy || 'DIRECT');
  const value = s(rule.value);

  if (type === 'final' || type === 'match') {
    return { default: { policy } };
  }

  if (type === 'rule-set' && /^https?:\/\//i.test(value)) {
    return {
      rule_set: {
        match: pinRemoteRuleUrl(value, { isChinaClient }),
        policy,
        update_interval: 86400,
      },
    };
  }

  const targetType = type.replace(/-/g, '_');

  return {
    [targetType]: {
      match: value,
      policy,
    },
  };
}

export function renderEgernFromTemplateModel(
  model: UnifiedTemplateModelInput,
  options: RenderEgernOptions = {},
): string {
  const normalizedModel = normalizeUnifiedTemplateModel(model);

  const proxies = normalizedModel.proxies
    .map(mapProxy)
    .filter((item): item is Record<string, Record<string, unknown>> => Boolean(item));

  const policyGroups = normalizedModel.groups
    .filter((group) => Array.isArray(group.members) && group.members.length > 0)
    .map(mapPolicyGroup);

  const rules = normalizedModel.rules
    .map((rule) => mapRule(rule, { isChinaClient: options.isChinaClient }))
    .filter((item): item is Record<string, Record<string, unknown>> => Boolean(item));

  const config: Record<string, unknown> = {
    general: {
      dns_server: ['https://223.5.5.5/dns-query', 'https://120.53.53.53/dns-query', '223.5.5.5'],
      ipv6: false,
    },
    proxies,
    policy_groups: policyGroups,
    rules,
  };

  if (normalizedModel.settings.managedConfigUrl) {
    config.auto_update = {
      url: s(normalizedModel.settings.managedConfigUrl),
      interval: normalizedModel.settings.interval || 86400,
    };
  }

  return yaml.dump(config, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: true,
  });
}
