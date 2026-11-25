import { generateNodeId } from '../utils/id.js';
import { utf8ToBase64 as base64Encode } from '../utils/base64.js';

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return value || '';
  }
}

function cleanTag(value: string): string {
  return String(value || '')
    .trim()
    .replace(/"/g, '');
}

function parseServerPortToken(value: string) {
  const token = safeDecodeURIComponent(value).trim();
  const lastColon = token.lastIndexOf(':');
  if (lastColon === -1) return null;
  return {
    server: token.slice(0, lastColon).trim(),
    port: token.slice(lastColon + 1).trim(),
  };
}

function parseKeyValueParams(parts: string[]): Map<string, string> {
  const map = new Map<string, string>();
  parts.forEach((param) => {
    const [key, ...rest] = param.split('=');
    if (!key || rest.length === 0) return;
    map.set(key.trim().toLowerCase(), rest.join('=').trim());
  });
  return map;
}

/**
 * 解析单行 Quantumult X 配置
 * @param {string} rawLine
 * @param {{ allowUntitled?: boolean }} [options]
 * @returns {Object|null}
 */
export function parseQuantumultXLine(rawLine: string, options: { allowUntitled?: boolean } = {}) {
  if (!rawLine || typeof rawLine !== 'string') return null;
  const trimmedLine = rawLine.trim();
  if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith(';') || trimmedLine.startsWith('//')) {
    return null;
  }
  if (trimmedLine.startsWith('[')) return null;

  const lower = trimmedLine.toLowerCase();
  if (/^vmess\s*=/.test(lower)) {
    return parseQuantumultXVmess(trimmedLine, options);
  }
  if (/^vless\s*=/.test(lower)) {
    return parseQuantumultXVless(trimmedLine, options);
  }
  if (/^(?:shadowsocks|ss)\s*=/.test(lower)) {
    return parseQuantumultXSS(trimmedLine, options);
  }
  if (/^trojan\s*=/.test(lower)) {
    return parseQuantumultXTrojan(trimmedLine, options);
  }
  if (/^(?:hysteria2|hy2)\s*=/.test(lower)) {
    return parseQuantumultXHysteria2(trimmedLine, options);
  }
  if (/^tuic\s*=/.test(lower)) {
    return parseQuantumultXTuic(trimmedLine, options);
  }
  if (/^anytls\s*=/.test(lower)) {
    return parseQuantumultXAnyTLS(trimmedLine, options);
  }
  if (/^socks5\s*=/.test(lower)) {
    return parseQuantumultXSocks5(trimmedLine, options);
  }
  if (/^https?\s*=/.test(lower)) {
    return parseQuantumultXHTTP(trimmedLine, options);
  }

  return null;
}

/**
 * 解析 Quantumult X 配置文本
 * @param {string} content
 * @param {{ allowUntitled?: boolean }} [options]
 * @returns {Array<Object>}
 */
export function parseQuantumultXConfig(content: string, options: { allowUntitled?: boolean } = {}) {
  if (!content || typeof content !== 'string') return [];
  const nodes: NonNullable<ReturnType<typeof parseQuantumultXLine>>[] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const node = parseQuantumultXLine(line, options);
    if (node) nodes.push(node);
  }

  return nodes;
}

/**
 * 解析 Quantumult X VMess 配置
 */
function parseQuantumultXVmess(line: string, options: { allowUntitled?: boolean } = {}) {
  try {
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) return null;

    const config = line.slice(equalIndex + 1);
    const params = config.split(',').map((p) => p.trim());

    let name = '';
    let server = '';
    let port = '';
    let id = '';
    let aid = '0';
    let extra = [];

    if (params[0]?.includes(':')) {
      const serverPort = parseServerPortToken(params[0]);
      if (!serverPort) return null;
      const kv = parseKeyValueParams(params.slice(1));
      name = safeDecodeURIComponent(kv.get('tag') || '') || (options.allowUntitled ? 'Untitled' : '');
      server = serverPort.server;
      port = serverPort.port;
      id = safeDecodeURIComponent(kv.get('password') || kv.get('uuid') || '');
      aid = safeDecodeURIComponent(kv.get('alterid') || '0');
      extra = params.slice(1);
    } else {
      if (params.length < 6) return null;
      const [rawName, rawServer, rawPort, _rawMethod, rawId, rawAid, ...rest] = params;
      name = safeDecodeURIComponent(rawName || '');
      server = safeDecodeURIComponent(rawServer || '');
      port = safeDecodeURIComponent(rawPort || '');
      id = safeDecodeURIComponent(rawId || '');
      aid = rawAid ? safeDecodeURIComponent(rawAid) : '0';
      extra = rest;
    }

    if (!name || !server || !port || !id) return null;

    const vmessConfig = {
      v: '2',
      ps: cleanTag(name),
      add: server.trim(),
      port: parseInt(port.trim(), 10),
      id: id.trim(),
      aid: aid ? parseInt(aid.trim(), 10) : 0,
      net: 'tcp',
      type: 'none',
      host: '',
      path: '',
      tls: '',
    };

    extra.forEach((param) => {
      const [key, ...rest] = param.split('=');
      const value = rest.join('=').trim();
      if (key && value) {
        switch (key.toLowerCase()) {
          case 'net':
          case 'type':
            vmessConfig.net = safeDecodeURIComponent(value);
            break;
          case 'host':
            vmessConfig.host = safeDecodeURIComponent(value);
            break;
          case 'path':
            vmessConfig.path = safeDecodeURIComponent(value);
            break;
          case 'tls':
          case 'over-tls':
            vmessConfig.tls = value === 'true' ? 'true' : '';
            break;
          case 'obfs':
            if (value.toLowerCase() === 'ws') vmessConfig.net = 'ws';
            if (value.toLowerCase() === 'wss') {
              vmessConfig.net = 'ws';
              vmessConfig.tls = 'true';
            }
            if (value.toLowerCase() === 'over-tls') {
              vmessConfig.tls = 'true';
            }
            break;
          case 'obfs-host':
          case 'tls-host':
            vmessConfig.host = safeDecodeURIComponent(value);
            break;
          case 'obfs-uri':
            vmessConfig.path = safeDecodeURIComponent(value);
            break;
        }
      }
    });

    return {
      id: generateNodeId(),
      name: vmessConfig.ps,
      url: `vmess://${base64Encode(JSON.stringify(vmessConfig))}`,
      enabled: true,
      protocol: 'vmess',
      source: 'quantumultx',
    };
  } catch {
    return null;
  }
}

/**
 * 解析 Quantumult X Shadowsocks 配置
 */
function parseQuantumultXSS(line: string, options: { allowUntitled?: boolean } = {}) {
  try {
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) return null;

    const config = line.slice(equalIndex + 1);
    const params = config.split(',').map((p) => p.trim());

    let name = '';
    let server = '';
    let port = '';
    let method = '';
    let password = '';
    let extra = [];

    if (params[0]?.includes(':')) {
      const serverPort = parseServerPortToken(params[0]);
      if (!serverPort) return null;
      const kv = parseKeyValueParams(params.slice(1));
      name = safeDecodeURIComponent(kv.get('tag') || '') || (options.allowUntitled ? 'Untitled' : '');
      server = serverPort.server;
      port = serverPort.port;
      method = safeDecodeURIComponent(kv.get('method') || kv.get('cipher') || '');
      password = safeDecodeURIComponent(kv.get('password') || '');
      extra = params.slice(1);
    } else {
      if (params.length < 5) return null;
      const [rawName, rawServer, rawPort, rawMethod, rawPassword, ...rest] = params;
      name = safeDecodeURIComponent(rawName || '');
      server = safeDecodeURIComponent(rawServer || '');
      port = safeDecodeURIComponent(rawPort || '');
      method = safeDecodeURIComponent(rawMethod || '');
      password = safeDecodeURIComponent(rawPassword || '');
      extra = rest;
    }

    if (!name || !server || !port || !method || !password) return null;

    const userinfo = base64Encode(`${method.trim()}:${password.trim()}`);
    const finalName = cleanTag(name);
    const kv = parseKeyValueParams(extra);
    const obfs = kv.get('obfs');
    const obfsHost = kv.get('obfs-host');
    const obfsUri = kv.get('obfs-uri');

    const urlParams: string[] = [];
    if (obfs === 'ws' || obfs === 'wss') {
      const pluginParts = ['v2ray-plugin', 'mode=websocket'];
      if (obfsHost) pluginParts.push(`host=${obfsHost}`);
      if (obfsUri) pluginParts.push(`path=${obfsUri}`);
      if (obfs === 'wss') pluginParts.push('tls');
      urlParams.push(`plugin=${encodeURIComponent(pluginParts.join(';'))}`);
    } else if (obfs === 'http' || obfs === 'tls') {
      urlParams.push('plugin=obfs');
      urlParams.push(`obfs=${encodeURIComponent(obfs)}`);
      if (obfsHost) urlParams.push(`obfs-host=${encodeURIComponent(obfsHost)}`);
    }

    const query = urlParams.length > 0 ? `?${urlParams.join('&')}` : '';

    return {
      id: generateNodeId(),
      name: finalName,
      url: `ss://${userinfo}@${server.trim()}:${port.trim()}${query}#${encodeURIComponent(finalName)}`,
      enabled: true,
      protocol: 'ss',
      source: 'quantumultx',
    };
  } catch {
    return null;
  }
}

/**
 * 解析 Quantumult X Trojan 配置
 */
function parseQuantumultXTrojan(line: string, options: { allowUntitled?: boolean } = {}) {
  try {
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) return null;

    const config = line.slice(equalIndex + 1);
    const params = config.split(',').map((p) => p.trim());

    let name = '';
    let server = '';
    let port = '';
    let password = '';
    let extra = [];

    if (params[0]?.includes(':')) {
      const serverPort = parseServerPortToken(params[0]);
      if (!serverPort) return null;
      const kv = parseKeyValueParams(params.slice(1));
      name = safeDecodeURIComponent(kv.get('tag') || '') || (options.allowUntitled ? 'Untitled' : '');
      server = serverPort.server;
      port = serverPort.port;
      password = safeDecodeURIComponent(kv.get('password') || '');
      extra = params.slice(1);
    } else {
      if (params.length < 4) return null;
      const [rawName, rawServer, rawPort, rawPassword, ...rest] = params;
      name = safeDecodeURIComponent(rawName || '');
      server = safeDecodeURIComponent(rawServer || '');
      port = safeDecodeURIComponent(rawPort || '');
      password = safeDecodeURIComponent(rawPassword || '');
      extra = rest;
    }

    if (!name || !server || !port || !password) return null;

    const urlParams: string[] = [];
    let hasReality = false;
    extra.forEach((param) => {
      const [rawKey, ...rest] = param.split('=');
      const key = (rawKey || '').trim().toLowerCase();
      const value = rest
        .join('=')
        .trim()
        .replace(/^["']|["']$/g, '');
      if (!key || !value) return;
      if (key === 'tls-host' || key === 'obfs-host' || key === 'sni') {
        urlParams.push(`sni=${encodeURIComponent(value)}`);
      } else if (key === 'tls-verification' && value === 'false') {
        urlParams.push('allowInsecure=1');
      } else if (key === 'reality-base64-pubkey' || key === 'reality-pubkey') {
        hasReality = true;
        urlParams.push(`pbk=${encodeURIComponent(value)}`);
      } else if (key === 'reality-hex-shortid' || key === 'reality-shortid') {
        hasReality = true;
        urlParams.push(`sid=${encodeURIComponent(value)}`);
      } else if (key === 'reality-support-x25519mlkem768' || key === 'support-x25519mlkem768') {
        urlParams.push(`support-x25519mlkem768=${value === 'true' || value === '1' ? 'true' : 'false'}`);
      } else if (key === 'obfs' && value === 'ws') {
        urlParams.push('type=ws');
      } else if (key === 'obfs' && value === 'wss') {
        urlParams.push('type=ws');
      } else if (key === 'obfs-uri') {
        urlParams.push(`path=${encodeURIComponent(value)}`);
      }
    });
    if (hasReality) {
      urlParams.unshift('security=reality');
    }

    const query = urlParams.length ? `?${Array.from(new Set(urlParams)).join('&')}` : '';
    const finalName = cleanTag(name);

    return {
      id: generateNodeId(),
      name: finalName,
      url: `trojan://${encodeURIComponent(password.trim())}@${server.trim()}:${port.trim()}${query}#${encodeURIComponent(finalName)}`,
      enabled: true,
      protocol: 'trojan',
      source: 'quantumultx',
    };
  } catch {
    return null;
  }
}

function parseQuantumultXVless(line: string, options: { allowUntitled?: boolean } = {}) {
  try {
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) return null;

    const config = line.slice(equalIndex + 1);
    const params = config.split(',').map((p) => p.trim());
    let name = '';
    let server = '';
    let port = '';
    let uuid = '';
    let extra = [];

    if (params[0]?.includes(':')) {
      const serverPort = parseServerPortToken(params[0]);
      if (!serverPort) return null;
      const kv = parseKeyValueParams(params.slice(1));
      name = safeDecodeURIComponent(kv.get('tag') || '') || (options.allowUntitled ? 'Untitled' : '');
      server = serverPort.server;
      port = serverPort.port;
      uuid = safeDecodeURIComponent(kv.get('password') || kv.get('uuid') || '');
      extra = params.slice(1);
    } else {
      if (params.length < 4) return null;
      const [rawName, rawServer, rawPort, rawUuid, ...rest] = params;
      name = safeDecodeURIComponent(rawName || '');
      server = safeDecodeURIComponent(rawServer || '');
      port = safeDecodeURIComponent(rawPort || '');
      uuid = safeDecodeURIComponent(rawUuid || '');
      extra = rest;
    }
    if (!name || !server || !port || !uuid) return null;

    const urlParams: string[] = [];
    let hasReality = false;
    let hasTls = false;
    let isWs = false;

    extra.forEach((param) => {
      const [rawKey, ...rest] = param.split('=');
      const key = (rawKey || '').trim().toLowerCase();
      const value = rest
        .join('=')
        .trim()
        .replace(/^["']|["']$/g, '');
      if (!key || !value) return;

      switch (key) {
        case 'transport':
        case 'type':
          if (value.toLowerCase() === 'ws') isWs = true;
          urlParams.push(`type=${encodeURIComponent(value)}`);
          break;
        case 'obfs':
          if (value.toLowerCase() === 'over-tls') {
            hasTls = true;
          } else if (value.toLowerCase() === 'ws') {
            isWs = true;
            urlParams.push('type=ws');
          } else if (value.toLowerCase() === 'wss') {
            isWs = true;
            hasTls = true;
            urlParams.push('type=ws');
          }
          break;
        case 'path':
        case 'obfs-uri':
          urlParams.push(`path=${encodeURIComponent(value)}`);
          break;
        case 'host':
        case 'tls-host':
        case 'sni':
          urlParams.push(`host=${encodeURIComponent(value)}`);
          urlParams.push(`sni=${encodeURIComponent(value)}`);
          break;
        case 'obfs-host':
          if (isWs) urlParams.push(`host=${encodeURIComponent(value)}`);
          urlParams.push(`sni=${encodeURIComponent(value)}`);
          break;
        case 'tls':
        case 'over-tls':
          if (value === 'true') hasTls = true;
          break;
        case 'tls-verification':
          if (value === 'true' || value === 'false') {
            urlParams.push(`allowInsecure=${value === 'false' ? '1' : '0'}`);
          }
          break;
        case 'skip-cert-verify':
          if (value === 'true' || value === 'false') {
            urlParams.push(`allowInsecure=${value === 'true' ? '1' : '0'}`);
          }
          break;
        case 'flow':
        case 'vless-flow':
          urlParams.push(`flow=${encodeURIComponent(value)}`);
          break;
        case 'reality-base64-pubkey':
        case 'reality-pubkey':
          hasReality = true;
          urlParams.push(`pbk=${encodeURIComponent(value)}`);
          break;
        case 'reality-hex-shortid':
        case 'reality-shortid':
          hasReality = true;
          urlParams.push(`sid=${encodeURIComponent(value)}`);
          break;
        case 'reality-support-x25519mlkem768':
        case 'support-x25519mlkem768':
          urlParams.push(`support-x25519mlkem768=${value === 'true' || value === '1' ? 'true' : 'false'}`);
          break;
      }
    });

    if (hasReality) {
      urlParams.push('security=reality');
    } else if (hasTls) {
      urlParams.push('security=tls');
    }

    const query = urlParams.length ? `?${Array.from(new Set(urlParams)).join('&')}` : '';
    const finalName = cleanTag(name);

    return {
      id: generateNodeId(),
      name: finalName,
      url: `vless://${uuid.trim()}@${server.trim()}:${port.trim()}${query}#${encodeURIComponent(finalName)}`,
      enabled: true,
      protocol: 'vless',
      source: 'quantumultx',
    };
  } catch {
    return null;
  }
}

function parseQuantumultXHysteria2(line: string, options: { allowUntitled?: boolean } = {}) {
  try {
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) return null;
    const config = line.slice(equalIndex + 1);
    const params = config.split(',').map((p) => p.trim());
    let name = '';
    let server = '';
    let port = '';
    let password = '';
    let extra = [];

    if (params[0]?.includes(':')) {
      const serverPort = parseServerPortToken(params[0]);
      if (!serverPort) return null;
      const kv = parseKeyValueParams(params.slice(1));
      name = safeDecodeURIComponent(kv.get('tag') || '') || (options.allowUntitled ? 'Untitled' : '');
      server = serverPort.server;
      port = serverPort.port;
      password = safeDecodeURIComponent(kv.get('password') || '');
      extra = params.slice(1);
    } else {
      if (params.length < 4) return null;
      const [rawName, rawServer, rawPort, rawPassword, ...rest] = params;
      name = safeDecodeURIComponent(rawName || '');
      server = safeDecodeURIComponent(rawServer || '');
      port = safeDecodeURIComponent(rawPort || '');
      password = safeDecodeURIComponent(rawPassword || '');
      extra = rest;
    }
    if (!name || !server || !port || !password) return null;

    const urlParams: string[] = [];
    extra.forEach((param) => {
      const [key, value] = param.split('=').map((p) => p.trim());
      if (!key || !value) return;
      if (key.toLowerCase() === 'sni' || key.toLowerCase() === 'peer' || key.toLowerCase() === 'tls-host')
        urlParams.push(`sni=${encodeURIComponent(value)}`);
      if (key.toLowerCase() === 'insecure' || key.toLowerCase() === 'tls-verification')
        urlParams.push(`insecure=${value === 'false' ? '1' : value}`);
    });

    const query = urlParams.length ? `?${urlParams.join('&')}` : '';
    const finalName = cleanTag(name);
    return {
      id: generateNodeId(),
      name: finalName,
      url: `hysteria2://${encodeURIComponent(password.trim())}@${server.trim()}:${port.trim()}${query}#${encodeURIComponent(finalName)}`,
      enabled: true,
      protocol: 'hysteria2',
      source: 'quantumultx',
    };
  } catch {
    return null;
  }
}

function parseQuantumultXTuic(line: string, options: { allowUntitled?: boolean } = {}) {
  try {
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) return null;
    const config = line.slice(equalIndex + 1);
    const params = config.split(',').map((p) => p.trim());
    let name = '';
    let server = '';
    let port = '';
    let uuid = '';
    let password = '';
    let extra = [];

    if (params[0]?.includes(':')) {
      const serverPort = parseServerPortToken(params[0]);
      if (!serverPort) return null;
      const kv = parseKeyValueParams(params.slice(1));
      name = safeDecodeURIComponent(kv.get('tag') || '') || (options.allowUntitled ? 'Untitled' : '');
      server = serverPort.server;
      port = serverPort.port;
      uuid = safeDecodeURIComponent(kv.get('uuid') || params[1] || '');
      password = safeDecodeURIComponent(kv.get('password') || kv.get('token') || params[2] || '');
      extra = params.slice(3);
    } else {
      if (params.length < 4) return null;
      const [rawName, rawServer, rawPort, rawUuid, rawPassword, ...rest] = params;
      name = safeDecodeURIComponent(rawName || '');
      server = safeDecodeURIComponent(rawServer || '');
      port = safeDecodeURIComponent(rawPort || '');
      uuid = safeDecodeURIComponent(rawUuid || '');
      password = safeDecodeURIComponent(rawPassword || '');
      extra = rest;
    }
    if (!name || !server || !port || !uuid) return null;

    const auth = password
      ? `${encodeURIComponent(uuid.trim())}:${encodeURIComponent(password.trim())}`
      : encodeURIComponent(uuid.trim());
    const urlParams: string[] = [];
    extra.forEach((param) => {
      const [key, value] = param.split('=').map((p) => p.trim());
      if (!key || !value) return;
      if (key.toLowerCase() === 'sni' || key.toLowerCase() === 'peer')
        urlParams.push(`sni=${encodeURIComponent(value)}`);
      if (key.toLowerCase() === 'congestion-controller')
        urlParams.push(`congestion_control=${encodeURIComponent(value)}`);
      if (key.toLowerCase() === 'udp-relay') urlParams.push(`udp_relay_mode=${encodeURIComponent(value)}`);
    });

    const query = urlParams.length ? `?${urlParams.join('&')}` : '';
    const finalName = cleanTag(name);
    return {
      id: generateNodeId(),
      name: finalName,
      url: `tuic://${auth}@${server.trim()}:${port.trim()}${query}#${encodeURIComponent(finalName)}`,
      enabled: true,
      protocol: 'tuic',
      source: 'quantumultx',
    };
  } catch {
    return null;
  }
}

function parseQuantumultXAnyTLS(line: string, options: { allowUntitled?: boolean } = {}) {
  try {
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) return null;
    const config = line.slice(equalIndex + 1);
    const rawParams = config.split(',').map((p) => p.trim());
    const params: string[] = [];
    for (const param of rawParams) {
      if (
        /^[A-Za-z][A-Za-z0-9_-]*=/.test(param) ||
        param.includes(':') ||
        params.length < 1 ||
        (params.length < 3 && !/^[A-Za-z][A-Za-z0-9_-]*=/.test(param))
      ) {
        params.push(param);
      } else if (params.length > 0) {
        params[params.length - 1] = `${params[params.length - 1]},${param}`;
      }
    }
    let name = '';
    let server = '';
    let port = '';
    let extra = [];

    if (params[0]?.includes(':')) {
      const serverPort = parseServerPortToken(params[0]);
      if (!serverPort) return null;
      const kv = parseKeyValueParams(params.slice(1));
      name = safeDecodeURIComponent(kv.get('tag') || '') || (options.allowUntitled ? 'Untitled' : '');
      server = serverPort.server;
      port = serverPort.port;
      extra = params.slice(1);
    } else {
      if (params.length < 3) return null;
      const [rawName, rawServer, rawPort, ...rest] = params;
      name = safeDecodeURIComponent(rawName || '');
      server = safeDecodeURIComponent(rawServer || '');
      port = safeDecodeURIComponent(rawPort || '');
      extra = rest;
    }
    if (!name || !server || !port) return null;

    let password = '';
    const urlParams: string[] = [];
    extra.forEach((param) => {
      const [key, value] = param.split('=').map((p) => p.trim());
      if (!key || !value) return;
      switch (key.toLowerCase()) {
        case 'password':
          password = safeDecodeURIComponent(value);
          break;
        case 'sni':
        case 'peer':
        case 'tls-host':
          urlParams.push(`sni=${encodeURIComponent(value)}`);
          break;
        case 'alpn':
          urlParams.push(`alpn=${encodeURIComponent(value)}`);
          break;
        case 'tls-verification':
          if (value === 'false') urlParams.push('allowInsecure=1');
          break;
      }
    });

    const query = urlParams.length ? `?${urlParams.join('&')}` : '';
    const finalName = cleanTag(name);
    return {
      id: generateNodeId(),
      name: finalName,
      url: `anytls://${encodeURIComponent(password.trim())}@${server.trim()}:${port.trim()}${query}#${encodeURIComponent(finalName)}`,
      enabled: true,
      protocol: 'anytls',
      source: 'quantumultx',
    };
  } catch {
    return null;
  }
}

/**
 * 解析 Quantumult X SOCKS5 配置
 */
function parseQuantumultXSocks5(line: string, options: { allowUntitled?: boolean } = {}) {
  try {
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) return null;

    const config = line.slice(equalIndex + 1);
    const params = config.split(',').map((p) => p.trim());
    let name = '';
    let server = '';
    let port = '';
    let username = '';
    let password = '';

    if (params[0]?.includes(':')) {
      const serverPort = parseServerPortToken(params[0]);
      if (!serverPort) return null;
      const kv = parseKeyValueParams(params.slice(1));
      name = safeDecodeURIComponent(kv.get('tag') || '') || (options.allowUntitled ? 'Untitled' : '');
      server = serverPort.server;
      port = serverPort.port;
      username = safeDecodeURIComponent(kv.get('username') || '');
      password = safeDecodeURIComponent(kv.get('password') || '');
    } else {
      if (params.length < 3) return null;
      const [rawName, rawServer, rawPort, rawUser, rawPass] = params;
      name = safeDecodeURIComponent(rawName || '');
      server = safeDecodeURIComponent(rawServer || '');
      port = safeDecodeURIComponent(rawPort || '');
      username = safeDecodeURIComponent(rawUser || '');
      password = safeDecodeURIComponent(rawPass || '');
    }
    if (!name || !server || !port) return null;

    const userinfo =
      username && password ? `${encodeURIComponent(username.trim())}:${encodeURIComponent(password.trim())}@` : '';
    const finalName = cleanTag(name);

    return {
      id: generateNodeId(),
      name: finalName,
      url: `socks5://${userinfo}${server.trim()}:${port.trim()}#${encodeURIComponent(finalName)}`,
      enabled: true,
      protocol: 'socks5',
      source: 'quantumultx',
    };
  } catch {
    return null;
  }
}

/**
 * 解析 Quantumult X HTTP/HTTPS 配置
 */
function parseQuantumultXHTTP(line: string, options: { allowUntitled?: boolean } = {}) {
  try {
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) return null;

    const config = line.slice(equalIndex + 1);
    const params = config.split(',').map((p) => p.trim());

    let name = '';
    let server = '';
    let port = '';
    let username = '';
    let password = '';
    let extra = [];

    if (params[0]?.includes(':')) {
      const serverPort = parseServerPortToken(params[0]);
      if (!serverPort) return null;
      const kv = parseKeyValueParams(params.slice(1));
      name = safeDecodeURIComponent(kv.get('tag') || '') || (options.allowUntitled ? 'Untitled' : '');
      server = serverPort.server;
      port = serverPort.port;
      username = safeDecodeURIComponent(kv.get('username') || '');
      password = safeDecodeURIComponent(kv.get('password') || '');
      extra = params.slice(1);
    } else {
      if (params.length < 3) return null;
      const [rawName, rawServer, rawPort, rawUsername, rawPassword, ...rest] = params;
      name = safeDecodeURIComponent(rawName || '');
      server = safeDecodeURIComponent(rawServer || '');
      port = safeDecodeURIComponent(rawPort || '');
      username = rawUsername ? safeDecodeURIComponent(rawUsername) : '';
      password = rawPassword ? safeDecodeURIComponent(rawPassword) : '';
      extra = rest;
    }

    if (!name || !server || !port) return null;

    let userinfo = '';
    if (username && password) {
      userinfo = `${encodeURIComponent(username.trim())}:${encodeURIComponent(password.trim())}@`;
    }

    const kv = parseKeyValueParams(extra);
    const scheme = line.trim().toLowerCase().startsWith('https') || kv.get('over-tls') === 'true' ? 'https' : 'http';
    const finalName = cleanTag(name);

    return {
      id: generateNodeId(),
      name: finalName,
      url: `${scheme}://${userinfo}${server.trim()}:${port.trim()}#${encodeURIComponent(finalName)}`,
      enabled: true,
      protocol: scheme,
      source: 'quantumultx',
    };
  } catch {
    return null;
  }
}
