/**
 * 节点客户端兼容性分析器
 * 根据节点链接中的协议、传输层、TLS/Reality、加密方式、插件等特征，
 * 推断常见代理客户端/内核（Xray、Sing-box、Mihomo、Surge、Loon、QuanX）的支持情况。
 */

export const CLIENT_DEFINITIONS = [
  { id: 'xray', label: 'Xray' },
  { id: 'singbox', label: 'Sing-box' },
  { id: 'mihomo', label: 'Mihomo' },
  { id: 'surge', label: 'Surge' },
  { id: 'loon', label: 'Loon' },
  { id: 'quanx', label: 'QuanX' },
];

function decodeBase64Safe(input) {
  if (!input || typeof input !== 'string') return '';
  try {
    let normalized = input.trim().replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4;
    if (pad) {
      normalized += '='.repeat(4 - pad);
    }
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

function normalizeTransport(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (!t || t === 'tcp' || t === 'raw' || t === 'none') return 'tcp';
  if (t === 'ws' || t === 'websocket') return 'ws';
  if (t === 'grpc') return 'grpc';
  if (t === 'h2' || t === 'http' || t === 'http2') return 'h2';
  if (t === 'httpupgrade') return 'httpupgrade';
  if (t === 'xhttp' || t === 'splithttp') return 'xhttp';
  if (t === 'kcp' || t === 'mkcp') return 'kcp';
  if (t === 'quic') return 'quic';
  return t;
}

function detectProtocol(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  const lower = url.trim().toLowerCase();
  if (lower.startsWith('anytls://')) return 'anytls';
  if (lower.startsWith('hysteria2://') || lower.startsWith('hy2://')) return 'hysteria2';
  if (lower.startsWith('hysteria://') || lower.startsWith('hy://')) return 'hysteria';
  if (lower.startsWith('ssr://')) return 'ssr';
  if (lower.startsWith('tuic://')) return 'tuic';
  if (lower.startsWith('ss://')) return 'ss';
  if (lower.startsWith('vmess://')) return 'vmess';
  if (lower.startsWith('vless://')) return 'vless';
  if (lower.startsWith('trojan://')) return 'trojan';
  if (lower.startsWith('socks5://') || lower.startsWith('socks://') || lower.startsWith('socks5-tls://')) {
    return 'socks5';
  }
  if (lower.startsWith('snell://')) return 'snell';
  if (lower.startsWith('wireguard://') || lower.startsWith('wg://')) return 'wireguard';
  if (
    lower.startsWith('naive+https://') ||
    lower.startsWith('naive+http://') ||
    lower.startsWith('naive+quic://') ||
    lower.startsWith('naive://')
  ) {
    return 'naive';
  }
  if (lower.startsWith('https://') || lower.startsWith('http://')) return 'http';
  return 'unknown';
}

function parseQueryParams(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.searchParams;
  } catch {
    const noHash = String(rawUrl || '').split('#')[0];
    const queryIdx = noHash.indexOf('?');
    if (queryIdx === -1) return new URLSearchParams();
    return new URLSearchParams(noHash.slice(queryIdx + 1));
  }
}

function parseSSFeatures(rawUrl) {
  let cipher = '';
  let plugin = '';
  const params = parseQueryParams(rawUrl);
  const pluginParam = params.get('plugin') || '';
  if (pluginParam) {
    plugin = pluginParam.split(';')[0].trim().toLowerCase();
  }

  const body = rawUrl.trim().slice('ss://'.length).split('#')[0].split('?')[0];
  if (body.includes('@')) {
    const userInfo = body.slice(0, body.indexOf('@'));
    let decoded = userInfo;
    if (!userInfo.includes(':')) {
      decoded = decodeBase64Safe(decodeURIComponent(userInfo)) || userInfo;
    }
    const colonIdx = decoded.indexOf(':');
    if (colonIdx !== -1) {
      cipher = decoded.slice(0, colonIdx).trim().toLowerCase();
    }
  } else {
    const decoded = decodeBase64Safe(body);
    const atIdx = decoded.lastIndexOf('@');
    if (atIdx !== -1) {
      const userInfo = decoded.slice(0, atIdx);
      const colonIdx = userInfo.indexOf(':');
      if (colonIdx !== -1) {
        cipher = userInfo.slice(0, colonIdx).trim().toLowerCase();
      }
    }
  }

  return {
    cipher,
    isSS2022: cipher.startsWith('2022-'),
    plugin,
  };
}

function parseVMessFeatures(rawUrl) {
  const body = rawUrl.trim().slice('vmess://'.length).split('#')[0];
  if (body.includes('@')) {
    const params = parseQueryParams(rawUrl);
    const transport = normalizeTransport(params.get('type') || params.get('net') || 'tcp');
    const security = (params.get('security') || params.get('tls') || 'none').toLowerCase();
    return {
      transport,
      security: security === 'tls' || security === '1' || security === 'true' ? 'tls' : 'none',
    };
  }

  const decoded = decodeBase64Safe(body);
  if (decoded) {
    try {
      const config = JSON.parse(decoded);
      const transport = normalizeTransport(config.net || 'tcp');
      const tlsVal = String(config.tls || '')
        .trim()
        .toLowerCase();
      const security = tlsVal === 'tls' || tlsVal === '1' || tlsVal === 'true' ? 'tls' : 'none';
      return { transport, security };
    } catch {}
  }

  return { transport: 'tcp', security: 'none' };
}

/**
 * 解析节点链接特征
 * @param {string} url
 */
export function parseNodeFeatures(url) {
  const raw = typeof url === 'string' ? url.trim() : '';
  const protocol = detectProtocol(raw);

  const features = {
    protocol,
    transport: '',
    security: '',
    flow: '',
    encryption: '',
    cipher: '',
    isSS2022: false,
    plugin: '',
  };

  if (protocol === 'unknown') {
    return features;
  }

  if (protocol === 'vless') {
    const params = parseQueryParams(raw);
    features.transport = normalizeTransport(params.get('type') || 'tcp');
    const sec = (params.get('security') || '').toLowerCase();
    if (sec === 'reality' || params.get('pbk')) {
      features.security = 'reality';
    } else if (sec === 'tls' || sec === 'xtls') {
      features.security = 'tls';
    } else {
      features.security = 'none';
    }
    features.flow = (params.get('flow') || '').trim().toLowerCase();
    const enc = (params.get('encryption') || 'none').trim();
    features.encryption = enc && enc.toLowerCase() !== 'none' ? enc : 'none';
    return features;
  }

  if (protocol === 'vmess') {
    const vmess = parseVMessFeatures(raw);
    features.transport = vmess.transport;
    features.security = vmess.security;
    return features;
  }

  if (protocol === 'trojan') {
    const params = parseQueryParams(raw);
    features.transport = normalizeTransport(params.get('type') || 'tcp');
    const sec = (params.get('security') || 'tls').toLowerCase();
    features.security = sec === 'reality' || params.get('pbk') ? 'reality' : sec || 'tls';
    return features;
  }

  if (protocol === 'ss') {
    const ss = parseSSFeatures(raw);
    features.cipher = ss.cipher;
    features.isSS2022 = ss.isSS2022;
    features.plugin = ss.plugin;
    return features;
  }

  return features;
}

function unsupported(reasonKey, reasonParams = {}) {
  return { supported: false, reasonKey, reasonParams };
}

const SUPPORTED = { supported: true, reasonKey: null, reasonParams: {} };

function evaluateXray(f) {
  switch (f.protocol) {
    case 'vless':
    case 'vmess':
    case 'trojan':
    case 'socks5':
    case 'http':
    case 'wireguard':
      return SUPPORTED;
    case 'ss':
      if (f.plugin === 'shadow-tls') {
        return unsupported('clientCompat.reasons.unsupportedPlugin', { plugin: f.plugin });
      }
      return SUPPORTED;
    default:
      return unsupported('clientCompat.reasons.unsupportedProtocol', {
        protocol: f.protocol.toUpperCase(),
      });
  }
}

function evaluateSingbox(f) {
  switch (f.protocol) {
    case 'vless':
      if (f.encryption && f.encryption !== 'none') {
        return unsupported('clientCompat.reasons.unsupportedVlessEncryption');
      }
      if (f.transport === 'xhttp' || f.transport === 'kcp') {
        return unsupported('clientCompat.reasons.unsupportedTransport', {
          transport: f.transport,
        });
      }
      return SUPPORTED;
    case 'vmess':
      if (f.transport === 'xhttp' || f.transport === 'kcp') {
        return unsupported('clientCompat.reasons.unsupportedTransport', {
          transport: f.transport,
        });
      }
      return SUPPORTED;
    case 'trojan':
      if (f.transport === 'xhttp' || f.transport === 'kcp') {
        return unsupported('clientCompat.reasons.unsupportedTransport', {
          transport: f.transport,
        });
      }
      return SUPPORTED;
    case 'ss':
    case 'hysteria2':
    case 'hysteria':
    case 'tuic':
    case 'anytls':
    case 'wireguard':
    case 'naive':
    case 'socks5':
    case 'http':
      return SUPPORTED;
    default:
      return unsupported('clientCompat.reasons.unsupportedProtocol', {
        protocol: f.protocol.toUpperCase(),
      });
  }
}

function evaluateMihomo(f) {
  switch (f.protocol) {
    case 'vless':
    case 'vmess':
    case 'trojan':
      if (f.transport === 'kcp') {
        return unsupported('clientCompat.reasons.unsupportedTransport', {
          transport: f.transport,
        });
      }
      return SUPPORTED;
    case 'ss':
    case 'ssr':
    case 'hysteria2':
    case 'hysteria':
    case 'tuic':
    case 'anytls':
    case 'snell':
    case 'wireguard':
    case 'socks5':
    case 'http':
      return SUPPORTED;
    default:
      return unsupported('clientCompat.reasons.unsupportedProtocol', {
        protocol: f.protocol.toUpperCase(),
      });
  }
}

function evaluateSurge(f) {
  switch (f.protocol) {
    case 'vmess':
      if (f.transport && f.transport !== 'tcp' && f.transport !== 'ws') {
        return unsupported('clientCompat.reasons.unsupportedTransport', {
          transport: f.transport,
        });
      }
      return SUPPORTED;
    case 'trojan':
      if (f.security === 'reality') {
        return unsupported('clientCompat.reasons.unsupportedReality');
      }
      if (f.transport && f.transport !== 'tcp' && f.transport !== 'ws') {
        return unsupported('clientCompat.reasons.unsupportedTransport', {
          transport: f.transport,
        });
      }
      return SUPPORTED;
    case 'ss':
    case 'hysteria2':
    case 'tuic':
    case 'snell':
    case 'anytls':
    case 'wireguard':
    case 'socks5':
    case 'http':
      return SUPPORTED;
    default:
      return unsupported('clientCompat.reasons.unsupportedProtocol', {
        protocol: f.protocol.toUpperCase(),
      });
  }
}

function evaluateLoon(f) {
  switch (f.protocol) {
    case 'vless':
      if (f.encryption && f.encryption !== 'none') {
        return unsupported('clientCompat.reasons.unsupportedVlessEncryption');
      }
      if (f.transport === 'kcp' || f.transport === 'quic') {
        return unsupported('clientCompat.reasons.unsupportedTransport', {
          transport: f.transport,
        });
      }
      return SUPPORTED;
    case 'vmess':
    case 'trojan':
      if (f.transport && f.transport !== 'tcp' && f.transport !== 'ws') {
        return unsupported('clientCompat.reasons.unsupportedTransport', {
          transport: f.transport,
        });
      }
      return SUPPORTED;
    case 'ss':
    case 'ssr':
    case 'hysteria2':
    case 'tuic':
    case 'snell':
    case 'anytls':
    case 'wireguard':
    case 'socks5':
    case 'http':
      return SUPPORTED;
    default:
      return unsupported('clientCompat.reasons.unsupportedProtocol', {
        protocol: f.protocol.toUpperCase(),
      });
  }
}

function evaluateQuanX(f) {
  switch (f.protocol) {
    case 'vless':
      if (f.encryption && f.encryption !== 'none') {
        return unsupported('clientCompat.reasons.unsupportedVlessEncryption');
      }
      if (f.transport && f.transport !== 'tcp' && f.transport !== 'ws') {
        return unsupported('clientCompat.reasons.unsupportedTransport', {
          transport: f.transport,
        });
      }
      return SUPPORTED;
    case 'vmess':
      if (f.transport && f.transport !== 'tcp' && f.transport !== 'ws') {
        return unsupported('clientCompat.reasons.unsupportedTransport', {
          transport: f.transport,
        });
      }
      return SUPPORTED;
    case 'trojan':
      if (f.security === 'reality') {
        return unsupported('clientCompat.reasons.unsupportedReality');
      }
      if (f.transport && f.transport !== 'tcp' && f.transport !== 'ws') {
        return unsupported('clientCompat.reasons.unsupportedTransport', {
          transport: f.transport,
        });
      }
      return SUPPORTED;
    case 'ss':
      if (f.isSS2022) {
        return unsupported('clientCompat.reasons.unsupportedSS2022');
      }
      return SUPPORTED;
    case 'ssr':
    case 'tuic':
    case 'anytls':
    case 'socks5':
    case 'http':
      return SUPPORTED;
    default:
      return unsupported('clientCompat.reasons.unsupportedProtocol', {
        protocol: f.protocol.toUpperCase(),
      });
  }
}

const CLIENT_EVALUATORS = {
  xray: evaluateXray,
  singbox: evaluateSingbox,
  mihomo: evaluateMihomo,
  surge: evaluateSurge,
  loon: evaluateLoon,
  quanx: evaluateQuanX,
};

/**
 * 计算单个节点在各主流客户端/内核下的兼容性
 * @param {string} url
 */
export function getNodeClientCompatibility(url) {
  const features = parseNodeFeatures(url);
  if (features.protocol === 'unknown') {
    return {
      features,
      clients: [],
      supportedCount: 0,
      totalCount: CLIENT_DEFINITIONS.length,
    };
  }

  const clients = CLIENT_DEFINITIONS.map((client) => {
    const evaluator = CLIENT_EVALUATORS[client.id];
    const result = evaluator ? evaluator(features) : SUPPORTED;
    return {
      id: client.id,
      label: client.label,
      supported: result.supported,
      reasonKey: result.reasonKey,
      reasonParams: result.reasonParams,
    };
  });

  const supportedCount = clients.filter((c) => c.supported).length;
  return {
    features,
    clients,
    supportedCount,
    totalCount: clients.length,
  };
}
