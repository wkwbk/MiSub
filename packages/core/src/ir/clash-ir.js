import { NodeIRSchema } from '../schemas/node-ir.js';

const CLASH_TYPE_TO_IR_PROTOCOL = {
  ss: 'ss',
  shadowsocks: 'ss',
  ssr: 'ssr',
  shadowsocksr: 'ssr',
  vmess: 'vmess',
  vless: 'vless',
  trojan: 'trojan',
  hysteria2: 'hysteria2',
  hy2: 'hysteria2',
  hy: 'hysteria2',
  hysteria: 'hysteria',
  tuic: 'tuic',
  anytls: 'anytls',
  snell: 'snell',
  socks5: 'socks5',
  'socks5-tls': 'socks5',
  http: 'http',
  https: 'https',
  wireguard: 'wireguard',
  mieru: 'mierus',
  mierus: 'mierus',
};

function resolveProtocolFromClashProxy(proxy) {
  const rawType = String(proxy?.type || '').toLowerCase();
  if (rawType === 'http' || rawType === 'https') {
    return rawType === 'https' || proxy.tls === true ? 'https' : 'http';
  }
  if (rawType === 'naive' || String(proxy?.protocol || '').toLowerCase() === 'naive') {
    if (proxy.scheme === 'naive+http') return 'naive+http';
    return proxy.quic ? 'naive+quic' : 'naive+https';
  }
  return CLASH_TYPE_TO_IR_PROTOCOL[rawType] || null;
}

function normalizeAlpn(alpn) {
  if (Array.isArray(alpn)) {
    const items = alpn.map((item) => String(item).trim()).filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  if (typeof alpn === 'string' && alpn.trim()) {
    const items = alpn
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  return undefined;
}

function extractTransportFromClashProxy(proxy, protocol) {
  const rawNetwork = proxy.network
    ? String(proxy.network).toLowerCase()
    : protocol === 'hysteria' && proxy.protocol === 'udp'
      ? 'udp'
      : 'tcp';

  const transport = { type: rawNetwork };
  const wsOpts = proxy['ws-opts'] || proxy.wsOpts;
  if (rawNetwork === 'ws' && wsOpts) {
    if (wsOpts.path !== undefined) transport.path = String(wsOpts.path);
    if (wsOpts.headers && typeof wsOpts.headers === 'object') {
      transport.headers = { ...wsOpts.headers };
      if (wsOpts.headers.Host) transport.host = String(wsOpts.headers.Host);
    }
  }

  const grpcOpts = proxy['grpc-opts'] || proxy.grpcOpts;
  if (rawNetwork === 'grpc' && grpcOpts) {
    if (grpcOpts['grpc-service-name']) transport.serviceName = String(grpcOpts['grpc-service-name']);
    if (grpcOpts['grpc-mode']) transport.mode = String(grpcOpts['grpc-mode']);
  }

  const h2Opts = proxy['h2-opts'] || proxy.h2Opts;
  const httpOpts = proxy['http-opts'] || proxy.httpOpts;
  if ((rawNetwork === 'h2' || rawNetwork === 'http') && (h2Opts || httpOpts)) {
    const opts = rawNetwork === 'h2' ? h2Opts : httpOpts;
    if (opts.path !== undefined) {
      transport.path = Array.isArray(opts.path) ? String(opts.path[0] || '') : String(opts.path);
    }
    if (opts.host !== undefined) transport.host = opts.host;
    if (opts.headers && typeof opts.headers === 'object') {
      transport.headers = { ...opts.headers };
      if (!transport.host && opts.headers.Host) transport.host = opts.headers.Host;
    }
  }

  const quicOpts = proxy['quic-opts'] || proxy.quicOpts;
  if (rawNetwork === 'quic' && quicOpts) {
    if (quicOpts.header?.type) transport.headerType = String(quicOpts.header.type);
    if (quicOpts.security) transport.quicSecurity = String(quicOpts.security);
    if (quicOpts.key) transport.quicKey = String(quicOpts.key);
  }

  const httpupgradeOpts = proxy['httpupgrade-opts'] || proxy.httpupgradeOpts;
  if (rawNetwork === 'httpupgrade' && httpupgradeOpts) {
    if (httpupgradeOpts.path) transport.path = String(httpupgradeOpts.path);
    if (httpupgradeOpts.host) transport.host = String(httpupgradeOpts.host);
  }

  const xhttpOpts = proxy['xhttp-opts'] || proxy.xhttpOpts;
  if (rawNetwork === 'xhttp' && xhttpOpts) {
    if (xhttpOpts.path) transport.path = String(xhttpOpts.path);
    if (xhttpOpts.host) transport.host = String(xhttpOpts.host);
    if (xhttpOpts.mode) transport.mode = String(xhttpOpts.mode);
    if (xhttpOpts.headers && typeof xhttpOpts.headers === 'object') {
      transport.headers = { ...xhttpOpts.headers };
    }
    transport.xhttpOpts = { ...xhttpOpts };
  }

  return transport;
}

function extractTlsFromClashProxy(proxy, protocol, rawType) {
  const realityOpts = proxy['reality-opts'] || proxy.realityOpts;
  const echOpts = proxy['ech-opts'] || proxy.echOpts;
  const implicitTls =
    protocol === 'trojan' ||
    protocol === 'https' ||
    protocol === 'hysteria2' ||
    protocol === 'hysteria' ||
    protocol === 'tuic' ||
    protocol === 'anytls' ||
    protocol === 'naive+https' ||
    protocol === 'naive+quic' ||
    rawType === 'socks5-tls';

  const enabled = Boolean(proxy.tls || realityOpts || echOpts || implicitTls);
  const security = realityOpts ? 'reality' : enabled ? 'tls' : 'none';
  const tls = { enabled, security };

  const sni = proxy.servername !== undefined ? proxy.servername : proxy.sni;
  if (sni !== undefined) tls.sni = String(sni);

  const alpn = normalizeAlpn(proxy.alpn);
  if (alpn) tls.alpn = alpn;

  const scv = proxy['skip-cert-verify'] ?? proxy.skipCertVerify;
  if (scv !== undefined) tls.skipCertVerify = Boolean(scv);

  const clientFingerprint = proxy['client-fingerprint'] ?? (protocol !== 'hysteria2' ? proxy.fingerprint : undefined);
  if (clientFingerprint) tls.clientFingerprint = String(clientFingerprint);

  if (protocol === 'hysteria2' && proxy.fingerprint) {
    tls.fingerprint = String(proxy.fingerprint);
  }

  const pinned =
    proxy.pinnedPeerCertSha256 || proxy['pinned-peer-cert-sha256'] || proxy['peer-cert-sha256'] || proxy.certSha256;
  if (pinned) tls.pinnedPeerCertSha256 = String(pinned);

  if (proxy['disable-sni'] !== undefined) tls.disableSni = Boolean(proxy['disable-sni']);

  if (realityOpts && typeof realityOpts === 'object') {
    const reality = {};
    if (realityOpts['public-key']) reality.publicKey = String(realityOpts['public-key']);
    if (realityOpts['short-id']) reality.shortId = String(realityOpts['short-id']);
    if (realityOpts['spider-x']) reality.spiderX = String(realityOpts['spider-x']);
    const sxm = realityOpts['support-x25519mlkem768'] ?? realityOpts.support_x25519mlkem768;
    if (sxm !== undefined) {
      reality.supportX25519mlkem768 = sxm === true || sxm === 'true' || sxm === 1 || sxm === '1';
    }
    const mldsa = realityOpts['mldsa65-verify'] ?? realityOpts.mldsa65Verify;
    if (mldsa) reality.mldsa65Verify = String(mldsa);
    if (Object.keys(reality).length > 0) tls.reality = reality;
  }

  if (echOpts && typeof echOpts === 'object') {
    const ech = {};
    if (echOpts.enable !== undefined) ech.enabled = Boolean(echOpts.enable);
    if (echOpts.config) ech.config = String(echOpts.config);
    if (echOpts['query-server-name']) ech.queryServerName = String(echOpts['query-server-name']);
    if (Object.keys(ech).length > 0) tls.ech = ech;
  }

  return tls;
}

function extractProtocolParams(proxy, protocol, rawType) {
  const params = {};
  switch (protocol) {
    case 'ss':
      if (proxy.plugin) params.plugin = proxy.plugin;
      if (proxy['plugin-opts']) params.pluginOpts = { ...proxy['plugin-opts'] };
      break;
    case 'ssr':
      if (proxy.protocol) params.ssrProtocol = proxy.protocol;
      if (proxy.obfs) params.obfs = proxy.obfs;
      if (proxy['obfs-param'] !== undefined) params.obfsParam = proxy['obfs-param'];
      if (proxy['protocol-param'] !== undefined) params.protocolParam = proxy['protocol-param'];
      if (proxy.group !== undefined) params.group = proxy.group;
      if (proxy.udpport !== undefined) params.udpport = proxy.udpport;
      break;
    case 'hysteria2':
    case 'hysteria':
      if (proxy.obfs) params.obfs = proxy.obfs;
      if (proxy['obfs-password'] !== undefined) params.obfsPassword = proxy['obfs-password'];
      if (proxy.ports !== undefined) params.ports = proxy.ports;
      if (proxy['hop-interval'] !== undefined) params.hopInterval = proxy['hop-interval'];
      if (proxy.up !== undefined || proxy['up-mbps'] !== undefined) params.up = proxy.up ?? proxy['up-mbps'];
      if (proxy.down !== undefined || proxy['down-mbps'] !== undefined) params.down = proxy.down ?? proxy['down-mbps'];
      if (proxy['fast-open'] !== undefined) params.fastOpen = Boolean(proxy['fast-open']);
      if (proxy['handshake-timeout'] !== undefined) params.handshakeTimeout = Number(proxy['handshake-timeout']);
      if (proxy['realm-opts']) params.realmOpts = { ...proxy['realm-opts'] };
      if (protocol === 'hysteria' && proxy.protocol) params.hyProtocol = proxy.protocol;
      break;
    case 'tuic': {
      const congestion = proxy['congestion-controller'] || proxy['congestion-control'] || proxy.congestion;
      if (congestion) params.congestionController = congestion;
      if (proxy['udp-relay-mode']) params.udpRelayMode = proxy['udp-relay-mode'];
      if (proxy['udp-over-stream'] !== undefined) params.udpOverStream = Boolean(proxy['udp-over-stream']);
      if (proxy['zero-rtt-handshake'] !== undefined || proxy['reduce-rtt'] !== undefined) {
        params.zeroRttHandshake = Boolean(proxy['zero-rtt-handshake'] ?? proxy['reduce-rtt']);
      }
      if (proxy.heartbeat !== undefined) params.heartbeat = proxy.heartbeat;
      if (proxy['heartbeat-interval'] !== undefined) params.heartbeatInterval = proxy['heartbeat-interval'];
      if (proxy['request-timeout'] !== undefined) params.requestTimeout = Number(proxy['request-timeout']);
      if (proxy.cwnd !== undefined) params.cwnd = Number(proxy.cwnd);
      if (proxy['bbr-profile']) params.bbrProfile = proxy['bbr-profile'];
      if (proxy['max-udp-relay-packet-size'] !== undefined) {
        params.maxUdpRelayPacketSize = Number(proxy['max-udp-relay-packet-size']);
      }
      if (proxy['max-open-streams'] !== undefined) params.maxOpenStreams = Number(proxy['max-open-streams']);
      if (proxy['fast-open'] !== undefined) params.fastOpen = Boolean(proxy['fast-open']);
      break;
    }
    case 'snell':
      if (proxy.version !== undefined) params.version = Number(proxy.version);
      if (proxy.reuse !== undefined) params.reuse = Boolean(proxy.reuse);
      if (proxy['obfs-opts'] || proxy.pluginOpts) {
        params.obfsOpts = { ...(proxy['obfs-opts'] || proxy.pluginOpts) };
      }
      if (proxy.ecn !== undefined) params.ecn = Boolean(proxy.ecn);
      break;
    case 'anytls':
      if (proxy.padding !== undefined) params.padding = proxy.padding;
      break;
    case 'naive+https':
    case 'naive+quic':
    case 'naive+http':
      if (proxy.padding !== undefined) params.padding = proxy.padding;
      if (proxy['extra-headers']) params.extraHeaders = proxy['extra-headers'];
      if (protocol === 'naive+quic' || proxy.quic) params.quic = true;
      break;
    case 'socks5':
      if (rawType === 'socks5-tls' || proxy.tls === true) params.socksTls = true;
      break;
    case 'wireguard':
      if (proxy.ip || proxy['local-address']) params.ip = proxy.ip || proxy['local-address'];
      if (proxy.ipv6) params.ipv6 = proxy.ipv6;
      if (proxy['allowed-ips'] || proxy.allowedIPs) params.allowedIps = proxy['allowed-ips'] || proxy.allowedIPs;
      if (proxy.reserved) params.reserved = proxy.reserved;
      if (proxy.mtu !== undefined) params.mtu = Number(proxy.mtu);
      if (proxy.dns) params.dns = proxy.dns;
      if (proxy['persistent-keepalive'] !== undefined) {
        params.persistentKeepalive = Number(proxy['persistent-keepalive']);
      }
      if (proxy['remote-dns-resolve'] !== undefined) params.remoteDnsResolve = Boolean(proxy['remote-dns-resolve']);
      break;
    case 'mierus':
      if (proxy.transport) params.transport = proxy.transport;
      if (proxy.multiplexing !== undefined) params.multiplexing = proxy.multiplexing;
      if (proxy['handshake-mode']) params.handshakeMode = proxy['handshake-mode'];
      if (proxy.mtu !== undefined) params.mtu = Number(proxy.mtu);
      if (proxy.profile) params.profile = proxy.profile;
      break;
  }
  return params;
}

/**
 * 将 Clash / Mihomo 代理对象标准化为统一节点中间表示（NodeIR）
 * @param {Record<string, any>} proxy
 * @param {{ validate?: boolean, sourceUrl?: string }} [options]
 * @returns {import('../types.js').NodeIR | null}
 */
export function clashProxyToNodeIR(proxy, options = {}) {
  if (!proxy || typeof proxy !== 'object') return null;
  const protocol = resolveProtocolFromClashProxy(proxy);
  const server = proxy.server ? String(proxy.server).trim() : '';
  const port = Number(proxy.port);
  if (!protocol || !server || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  const rawType = String(proxy.type || '').toLowerCase();
  const auth = {};
  if (proxy.uuid || proxy.UUID) auth.uuid = String(proxy.uuid || proxy.UUID);
  if (proxy.password !== undefined || proxy.auth !== undefined) auth.password = String(proxy.password ?? proxy.auth);
  if (proxy.username !== undefined) auth.username = String(proxy.username);
  if (proxy.cipher) auth.cipher = String(proxy.cipher);
  if (proxy.alterId !== undefined && Number.isFinite(Number(proxy.alterId))) {
    auth.alterId = Math.max(0, Math.trunc(Number(proxy.alterId)));
  }
  if (proxy.psk !== undefined) auth.psk = String(proxy.psk);
  if (proxy.token !== undefined) auth.token = String(proxy.token);
  if (proxy['private-key']) auth.privateKey = String(proxy['private-key']);
  if (proxy['public-key'] || proxy.publicKey) auth.publicKey = String(proxy['public-key'] || proxy.publicKey);
  if (proxy['preshared-key'] || proxy.presharedKey) {
    auth.presharedKey = String(proxy['preshared-key'] || proxy.presharedKey);
  }
  if (proxy.flow) auth.flow = String(proxy.flow);
  if (proxy.encryption) auth.encryption = String(proxy.encryption);

  const protocolParams = extractProtocolParams(proxy, protocol, rawType);

  const ir = {
    name: String(proxy.name || `${protocol}-${server}`).trim() || `${protocol}-${server}`,
    protocol,
    server,
    port,
    ...(proxy.id ? { id: String(proxy.id) } : {}),
    ...(proxy.udp !== undefined ? { udp: Boolean(proxy.udp) } : {}),
    ...(proxy.tfo !== undefined ? { tfo: Boolean(proxy.tfo) } : {}),
    ...(proxy['dialer-proxy'] ? { dialerProxy: String(proxy['dialer-proxy']) } : {}),
    ...(Object.keys(auth).length > 0 ? { auth } : {}),
    transport: extractTransportFromClashProxy(proxy, protocol),
    tls: extractTlsFromClashProxy(proxy, protocol, rawType),
    ...(Object.keys(protocolParams).length > 0 ? { protocolParams } : {}),
    ...(proxy.metadata && typeof proxy.metadata === 'object' ? { metadata: proxy.metadata } : {}),
    ...(options.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
  };

  if (options.validate === false) return /** @type {import('../types.js').NodeIR} */ (ir);
  const parsed = NodeIRSchema.safeParse(ir);
  return parsed.success ? parsed.data : null;
}

/**
 * 将标准 NodeIR 还原为 Clash / Mihomo 代理对象
 * @param {import('../types.js').NodeIR} ir
 * @returns {Record<string, any> | null}
 */
export function nodeIRToClashProxy(ir) {
  if (!ir || typeof ir !== 'object') return null;

  const protocol = String(ir.protocol || '').toLowerCase();
  const clashType =
    protocol === 'mierus'
      ? 'mieru'
      : protocol === 'https'
        ? 'http'
        : protocol.startsWith('naive+')
          ? 'naive'
          : protocol;

  const auth = /** @type {Record<string, any>} */ (ir.auth || {});
  const transport = /** @type {Record<string, any>} */ (ir.transport || {});
  const tls = /** @type {Record<string, any>} */ (ir.tls || {});
  const pp = /** @type {Record<string, any>} */ (ir.protocolParams || {});

  /** @type {Record<string, any>} */
  const proxy = {
    name: ir.name,
    type: clashType,
    server: ir.server,
    port: ir.port,
  };

  if (protocol === 'socks5' && (pp.socksTls || tls.enabled)) {
    proxy.type = 'socks5-tls';
  }

  if (ir.udp !== undefined) proxy.udp = ir.udp;
  if (ir.tfo !== undefined) proxy.tfo = ir.tfo;
  if (ir.dialerProxy) proxy['dialer-proxy'] = ir.dialerProxy;

  // Auth fields
  if (auth.uuid !== undefined) proxy.uuid = auth.uuid;
  if (auth.password !== undefined) proxy.password = auth.password;
  if (protocol === 'hysteria2' && auth.password !== undefined) proxy.auth = auth.password;
  if (auth.username !== undefined) proxy.username = auth.username;
  if (auth.cipher !== undefined) proxy.cipher = auth.cipher;
  if (auth.alterId !== undefined) proxy.alterId = auth.alterId;
  if (auth.psk !== undefined) proxy.psk = auth.psk;
  if (auth.token !== undefined) proxy.token = auth.token;
  if (auth.privateKey !== undefined) proxy['private-key'] = auth.privateKey;
  if (auth.publicKey !== undefined) proxy['public-key'] = auth.publicKey;
  if (auth.presharedKey !== undefined) proxy['preshared-key'] = auth.presharedKey;
  if (auth.flow !== undefined) proxy.flow = auth.flow;
  if (auth.encryption !== undefined) proxy.encryption = auth.encryption;

  // Transport fields
  const network = transport.type && transport.type !== 'tcp' && transport.type !== 'udp' ? transport.type : '';
  if (network) {
    proxy.network = network;
    if (network === 'ws') {
      /** @type {Record<string, any>} */
      const wsOpts = {};
      if (transport.path !== undefined) wsOpts.path = transport.path;
      const headers = transport.headers ? { ...transport.headers } : {};
      if (transport.host && !headers.Host) headers.Host = String(transport.host);
      if (Object.keys(headers).length > 0) wsOpts.headers = headers;
      if (Object.keys(wsOpts).length > 0) proxy['ws-opts'] = wsOpts;
    } else if (network === 'grpc') {
      /** @type {Record<string, any>} */
      const grpcOpts = {};
      if (transport.serviceName) grpcOpts['grpc-service-name'] = transport.serviceName;
      if (transport.mode) grpcOpts['grpc-mode'] = transport.mode;
      if (Object.keys(grpcOpts).length > 0) proxy['grpc-opts'] = grpcOpts;
    } else if (network === 'h2' || network === 'http') {
      /** @type {Record<string, any>} */
      const opts = {};
      if (transport.path !== undefined) opts.path = transport.path;
      if (transport.host !== undefined) opts.host = transport.host;
      if (transport.headers) opts.headers = { ...transport.headers };
      proxy[`${network}-opts`] = opts;
    } else if (network === 'quic') {
      /** @type {Record<string, any>} */
      const quicOpts = {};
      if (transport.headerType) quicOpts.header = { type: transport.headerType };
      if (transport.quicSecurity) quicOpts.security = transport.quicSecurity;
      if (transport.quicKey) quicOpts.key = transport.quicKey;
      if (Object.keys(quicOpts).length > 0) proxy['quic-opts'] = quicOpts;
    } else if (network === 'httpupgrade') {
      /** @type {Record<string, any>} */
      const opts = {};
      if (transport.path !== undefined) opts.path = transport.path;
      if (transport.host !== undefined) opts.host = transport.host;
      if (Object.keys(opts).length > 0) proxy['httpupgrade-opts'] = opts;
    } else if (network === 'xhttp') {
      /** @type {Record<string, any>} */
      const xhttpOpts = transport.xhttpOpts ? { ...transport.xhttpOpts } : {};
      if (transport.path !== undefined && xhttpOpts.path === undefined) xhttpOpts.path = transport.path;
      if (transport.host !== undefined && xhttpOpts.host === undefined) xhttpOpts.host = transport.host;
      if (transport.mode !== undefined && xhttpOpts.mode === undefined) xhttpOpts.mode = transport.mode;
      if (transport.headers && !xhttpOpts.headers) xhttpOpts.headers = { ...transport.headers };
      if (Object.keys(xhttpOpts).length > 0) proxy['xhttp-opts'] = xhttpOpts;
    }
  }

  // TLS / Reality / ECH fields
  const setExplicitTls =
    protocol === 'vmess' ||
    protocol === 'vless' ||
    protocol === 'ss' ||
    protocol === 'https' ||
    protocol === 'socks5' ||
    tls.security === 'reality';
  if (tls.enabled && setExplicitTls) {
    proxy.tls = true;
  }
  if (tls.sni !== undefined) {
    proxy.servername = tls.sni;
    proxy.sni = tls.sni;
  }
  if (Array.isArray(tls.alpn) && tls.alpn.length > 0) proxy.alpn = [...tls.alpn];
  if (tls.skipCertVerify !== undefined) proxy['skip-cert-verify'] = tls.skipCertVerify;
  if (tls.clientFingerprint) proxy['client-fingerprint'] = tls.clientFingerprint;
  if (tls.fingerprint && protocol === 'hysteria2') proxy.fingerprint = tls.fingerprint;
  if (tls.pinnedPeerCertSha256) proxy.pinnedPeerCertSha256 = tls.pinnedPeerCertSha256;
  if (tls.disableSni !== undefined) proxy['disable-sni'] = tls.disableSni;

  if (tls.reality) {
    /** @type {Record<string, any>} */
    const realityOpts = {};
    if (tls.reality.publicKey) realityOpts['public-key'] = tls.reality.publicKey;
    if (tls.reality.shortId) realityOpts['short-id'] = tls.reality.shortId;
    if (tls.reality.spiderX) realityOpts['spider-x'] = tls.reality.spiderX;
    if (tls.reality.supportX25519mlkem768 !== undefined) {
      realityOpts['support-x25519mlkem768'] = tls.reality.supportX25519mlkem768;
    }
    if (tls.reality.mldsa65Verify) realityOpts['mldsa65-verify'] = tls.reality.mldsa65Verify;
    if (Object.keys(realityOpts).length > 0) proxy['reality-opts'] = realityOpts;
  }

  if (tls.ech) {
    /** @type {Record<string, any>} */
    const echOpts = {};
    if (tls.ech.enabled !== undefined) echOpts.enable = tls.ech.enabled;
    if (tls.ech.config) echOpts.config = tls.ech.config;
    if (tls.ech.queryServerName) echOpts['query-server-name'] = tls.ech.queryServerName;
    if (Object.keys(echOpts).length > 0) proxy['ech-opts'] = echOpts;
  }

  // Protocol-specific fields
  switch (protocol) {
    case 'ss':
      if (pp.plugin) proxy.plugin = pp.plugin;
      if (pp.pluginOpts) proxy['plugin-opts'] = { ...pp.pluginOpts };
      break;
    case 'ssr':
      if (pp.ssrProtocol) proxy.protocol = pp.ssrProtocol;
      if (pp.obfs) proxy.obfs = pp.obfs;
      if (pp.obfsParam !== undefined) proxy['obfs-param'] = pp.obfsParam;
      if (pp.protocolParam !== undefined) proxy['protocol-param'] = pp.protocolParam;
      if (pp.group !== undefined) proxy.group = pp.group;
      if (pp.udpport !== undefined) proxy.udpport = pp.udpport;
      break;
    case 'hysteria2':
    case 'hysteria':
      if (pp.obfs) proxy.obfs = pp.obfs;
      if (pp.obfsPassword !== undefined) proxy['obfs-password'] = pp.obfsPassword;
      if (pp.ports !== undefined) proxy.ports = pp.ports;
      if (pp.hopInterval !== undefined) proxy['hop-interval'] = pp.hopInterval;
      if (pp.up !== undefined) proxy.up = pp.up;
      if (pp.down !== undefined) proxy.down = pp.down;
      if (pp.fastOpen !== undefined) proxy['fast-open'] = pp.fastOpen;
      if (pp.handshakeTimeout !== undefined) proxy['handshake-timeout'] = pp.handshakeTimeout;
      if (pp.realmOpts) proxy['realm-opts'] = { ...pp.realmOpts };
      if (protocol === 'hysteria' && pp.hyProtocol) proxy.protocol = pp.hyProtocol;
      break;
    case 'tuic':
      if (pp.congestionController) proxy['congestion-controller'] = pp.congestionController;
      if (pp.udpRelayMode) proxy['udp-relay-mode'] = pp.udpRelayMode;
      if (pp.udpOverStream !== undefined) proxy['udp-over-stream'] = pp.udpOverStream;
      if (pp.zeroRttHandshake !== undefined) {
        proxy['zero-rtt-handshake'] = pp.zeroRttHandshake;
        proxy['reduce-rtt'] = pp.zeroRttHandshake;
      }
      if (pp.heartbeat !== undefined) proxy.heartbeat = pp.heartbeat;
      if (pp.heartbeatInterval !== undefined) proxy['heartbeat-interval'] = pp.heartbeatInterval;
      if (pp.requestTimeout !== undefined) proxy['request-timeout'] = pp.requestTimeout;
      if (pp.cwnd !== undefined) proxy.cwnd = pp.cwnd;
      if (pp.bbrProfile) proxy['bbr-profile'] = pp.bbrProfile;
      if (pp.maxUdpRelayPacketSize !== undefined) proxy['max-udp-relay-packet-size'] = pp.maxUdpRelayPacketSize;
      if (pp.maxOpenStreams !== undefined) proxy['max-open-streams'] = pp.maxOpenStreams;
      if (pp.fastOpen !== undefined) proxy['fast-open'] = pp.fastOpen;
      break;
    case 'snell':
      if (pp.version !== undefined) proxy.version = pp.version;
      if (pp.reuse !== undefined) proxy.reuse = pp.reuse;
      if (pp.obfsOpts) proxy['obfs-opts'] = { ...pp.obfsOpts };
      if (pp.ecn !== undefined) proxy.ecn = pp.ecn;
      break;
    case 'anytls':
      if (pp.padding !== undefined) proxy.padding = pp.padding;
      break;
    case 'naive+https':
    case 'naive+quic':
    case 'naive+http':
      if (pp.padding !== undefined) proxy.padding = pp.padding;
      if (pp.extraHeaders) proxy['extra-headers'] = pp.extraHeaders;
      if (protocol === 'naive+quic' || pp.quic) proxy.quic = true;
      if (protocol === 'naive+http') proxy.scheme = 'naive+http';
      break;
    case 'wireguard':
      if (pp.ip) proxy.ip = pp.ip;
      if (pp.ipv6) proxy.ipv6 = pp.ipv6;
      if (pp.allowedIps) proxy['allowed-ips'] = pp.allowedIps;
      if (pp.reserved) proxy.reserved = pp.reserved;
      if (pp.mtu !== undefined) proxy.mtu = pp.mtu;
      if (pp.dns) proxy.dns = pp.dns;
      if (pp.persistentKeepalive !== undefined) proxy['persistent-keepalive'] = pp.persistentKeepalive;
      if (pp.remoteDnsResolve !== undefined) proxy['remote-dns-resolve'] = pp.remoteDnsResolve;
      break;
    case 'mierus':
      if (pp.transport) proxy.transport = pp.transport;
      if (pp.multiplexing !== undefined) proxy.multiplexing = pp.multiplexing;
      if (pp.handshakeMode) proxy['handshake-mode'] = pp.handshakeMode;
      if (pp.mtu !== undefined) proxy.mtu = pp.mtu;
      if (pp.profile) proxy.profile = pp.profile;
      break;
  }

  if (ir.metadata) {
    proxy.metadata = { ...ir.metadata };
  }

  return proxy;
}
