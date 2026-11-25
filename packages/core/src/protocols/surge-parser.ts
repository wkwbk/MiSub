import { generateNodeId } from '../utils/id.js';
import { utf8ToBase64 as base64Encode } from '../utils/base64.js';

function cleanName(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/"/g, '');
}

/**
 * 解析单行 Surge 节点配置
 * @param {string} rawLine
 * @returns {Object|null}
 */
export function parseSurgeLine(rawLine: string) {
  if (!rawLine || typeof rawLine !== 'string') return null;
  const line = rawLine.trim();
  if (!line || line.startsWith('#') || line.startsWith(';') || line.startsWith('//')) return null;

  const lowerLine = line.toLowerCase();
  if (lowerLine.startsWith('[')) return null;

  const equalIndex = line.indexOf('=');
  if (equalIndex === -1) return null;

  const valuePrefix = line
    .slice(equalIndex + 1)
    .split(',')[0]
    .trim()
    .toLowerCase();

  if (lowerLine.startsWith('vmess') || valuePrefix === 'vmess') {
    return parseSurgeVmess(line);
  }
  if (
    lowerLine.startsWith('ss') ||
    lowerLine.startsWith('shadowsocks') ||
    valuePrefix === 'ss' ||
    valuePrefix === 'shadowsocks'
  ) {
    return parseSurgeSS(line);
  }
  if (lowerLine.startsWith('trojan') || valuePrefix === 'trojan') {
    return parseSurgeTrojan(line);
  }
  if (
    lowerLine.startsWith('http-proxy') ||
    lowerLine.startsWith('https-proxy') ||
    valuePrefix === 'http-proxy' ||
    valuePrefix === 'https-proxy' ||
    valuePrefix === 'http' ||
    valuePrefix === 'https'
  ) {
    return parseSurgeHTTP(line);
  }
  if (lowerLine.startsWith('snell') || valuePrefix === 'snell') {
    return parseSurgeSnell(line);
  }
  if (
    lowerLine.startsWith('hysteria2') ||
    lowerLine.startsWith('hy2') ||
    valuePrefix === 'hysteria2' ||
    valuePrefix === 'hy2'
  ) {
    return parseSurgeHysteria2(line);
  }
  if (lowerLine.startsWith('tuic') || valuePrefix === 'tuic' || valuePrefix === 'tuic-v5') {
    return parseSurgeTUIC(line);
  }
  if (lowerLine.startsWith('vless') || valuePrefix === 'vless') {
    return parseSurgeVless(line);
  }
  if (lowerLine.startsWith('anytls') || valuePrefix === 'anytls') {
    return parseSurgeAnytls(line);
  }
  if (lowerLine.startsWith('wireguard') || valuePrefix === 'wireguard') {
    return parseSurgeWireGuard(line);
  }
  if (lowerLine.startsWith('socks5') || valuePrefix === 'socks5') {
    return parseSurgeSocks5(line);
  }

  return null;
}

/**
 * 解析 Surge 配置文本
 * @param {string} content
 * @returns {Array<Object>}
 */
export function parseSurgeConfig(content: string) {
  if (!content || typeof content !== 'string') return [];
  const nodes: NonNullable<ReturnType<typeof parseSurgeLine>>[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const node = parseSurgeLine(lines[i]);
    if (node) nodes.push(node);
  }

  return nodes;
}

/**
 * 解析 Surge AnyTLS 配置
 */
function parseSurgeAnytls(line: string) {
  try {
    const parts = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!parts) return null;

    const name = parts[1].trim();
    const params = parts[2].split(',').map((p) => p.trim());
    const [_protocol, server, port, ...options] = params;

    if (!server || !port) return null;

    let password = '';
    const urlParams: string[] = [];

    options.forEach((opt) => {
      const match = opt.match(/^([\w-]+)\s*=\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const k = key.toLowerCase();
        const v = value.replace(/^["']|["']$/g, '');
        if (k === 'password') password = v;
        else if (k === 'sni') urlParams.push(`sni=${encodeURIComponent(v)}`);
        else if (k === 'alpn') urlParams.push(`alpn=${encodeURIComponent(v)}`);
        else if (k === 'skip-cert-verify' && v === 'true') urlParams.push('insecure=1');
      }
    });

    if (!password) password = options[0] || '';

    const query = urlParams.length > 0 ? `?${urlParams.join('&')}` : '';
    const finalName = cleanName(name);

    return {
      id: generateNodeId(),
      name: finalName,
      url: `anytls://${encodeURIComponent(password)}@${server}:${port}${query}#${encodeURIComponent(finalName)}`,
      enabled: true,
      protocol: 'anytls',
      source: 'surge',
    };
  } catch {
    return null;
  }
}

/**
 * 解析 Surge VMess 配置
 * 格式: name = vmess, server, port, username=uuid, [其他参数...]
 */
function parseSurgeVmess(line: string) {
  try {
    const parts = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!parts) return null;

    const name = parts[1].trim();
    const config = parts[2];
    const params = config.split(',').map((p) => p.trim());

    if (params.length < 4) return null;

    const [protocol, server, port, ...options] = params;

    if (protocol.toLowerCase() !== 'vmess' || !server || !port) return null;

    const vmessConfig: {
      v: string;
      ps: string;
      add: string;
      port: number;
      id: string;
      aid: number;
      net: string;
      type: string;
      host: string;
      path: string;
      tls: string;
      sni?: string;
    } = {
      v: '2',
      ps: name,
      add: server,
      port: parseInt(port, 10),
      id: '',
      aid: 0,
      net: 'tcp',
      type: 'none',
      host: '',
      path: '',
      tls: '',
    };

    options.forEach((opt) => {
      const match = opt.match(/^(\w+(?:-\w+)*)\s*=\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const cleanValue = value.replace(/^["']|["']$/g, '');

        switch (key.toLowerCase()) {
          case 'username':
          case 'uuid':
          case 'id':
            vmessConfig.id = cleanValue;
            break;
          case 'alterid':
          case 'aid':
            vmessConfig.aid = parseInt(cleanValue, 10);
            break;
          case 'network':
          case 'net':
            vmessConfig.net = cleanValue;
            break;
          case 'ws':
            if (cleanValue === 'true') vmessConfig.net = 'ws';
            break;
          case 'ws-path':
          case 'path':
            vmessConfig.path = cleanValue;
            break;
          case 'ws-headers':
          case 'host':
            vmessConfig.host = cleanValue;
            break;
          case 'tls':
            vmessConfig.tls = cleanValue === 'true' ? 'tls' : '';
            break;
          case 'sni':
            vmessConfig.sni = cleanValue;
            break;
        }
      } else if (!vmessConfig.id && opt && !opt.includes('=')) {
        vmessConfig.id = opt.replace(/^["']|["']$/g, '');
      }
    });

    if (!vmessConfig.id) return null;

    const url = `vmess://${base64Encode(JSON.stringify(vmessConfig))}`;

    return {
      id: generateNodeId(),
      name: name,
      url: url,
      enabled: true,
      protocol: 'vmess',
      source: 'surge',
    };
  } catch (e) {
    console.error('Surge VMess 解析失败:', e);
    return null;
  }
}

/**
 * 解析 Surge Shadowsocks 配置
 * 兼容：
 * 1) name = ss, server, port, encrypt-method=xxx, password=xxx, ...
 * 2) name = ss, server, port, method, password
 * 3) ss=name, server, port, method, password (旧式前缀)
 */
function parseSurgeSS(line: string) {
  try {
    const parts = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!parts) return null;

    const leftKey = parts[1].trim();
    const params = parts[2].split(',').map((p) => p.trim());
    const firstLower = (params[0] || '').toLowerCase();

    let nodeName = leftKey;
    let server = '';
    let port = '';
    let method = '';
    let password = '';
    let obfsMode = '';
    let obfsHost = '';

    if (firstLower === 'ss' || firstLower === 'shadowsocks') {
      const [_protocol, srv, prt, ...rest] = params;
      server = srv;
      port = prt;
      const positional: string[] = [];
      rest.forEach((opt) => {
        const kvMatch = opt.match(/^([\w-]+)\s*=\s*(.+)$/);
        if (kvMatch) {
          const k = kvMatch[1].toLowerCase();
          const v = kvMatch[2].replace(/^["']|["']$/g, '');
          if (k === 'encrypt-method' || k === 'method' || k === 'cipher') method = v;
          else if (k === 'password') password = v;
          else if (k === 'obfs') obfsMode = v;
          else if (k === 'obfs-host') obfsHost = v;
        } else if (opt) {
          positional.push(opt.replace(/^["']|["']$/g, ''));
        }
      });
      if (!method && positional[0]) method = positional[0];
      if (!password && positional[1]) password = positional[1];
    } else if (leftKey.toLowerCase() === 'ss' || leftKey.toLowerCase() === 'shadowsocks') {
      const [legacyName, srv, prt, m, p] = params;
      nodeName = legacyName || leftKey;
      server = srv;
      port = prt;
      method = m;
      password = p;
    } else {
      return null;
    }

    if (!server || !port || !method || !password) return null;

    const userinfo = base64Encode(`${method}:${password}`);
    const finalName = cleanName(nodeName);
    const urlParams: string[] = [];
    if (obfsMode) {
      urlParams.push('plugin=obfs');
      urlParams.push(`obfs=${encodeURIComponent(obfsMode)}`);
      if (obfsHost) urlParams.push(`obfs-host=${encodeURIComponent(obfsHost)}`);
    }
    const query = urlParams.length > 0 ? `?${urlParams.join('&')}` : '';

    return {
      id: generateNodeId(),
      name: finalName,
      url: `ss://${userinfo}@${server}:${port}${query}#${encodeURIComponent(finalName)}`,
      enabled: true,
      protocol: 'ss',
      source: 'surge',
    };
  } catch {
    return null;
  }
}

/**
 * 解析 Surge Trojan 配置
 */
function parseSurgeTrojan(line: string) {
  try {
    const parts = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!parts) return null;

    const name = parts[1].trim();
    const params = parts[2].split(',').map((p) => p.trim());
    const [_protocol, server, port, ...options] = params;

    if (!server || !port) return null;
    let password = '';
    const urlParams: string[] = [];

    options.forEach((opt) => {
      const match = opt.match(/^([\w-]+)\s*=\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const k = key.toLowerCase();
        const v = value.replace(/^["']|["']$/g, '');
        if (k === 'password') {
          password = v;
        } else if (k === 'sni') {
          urlParams.push(`sni=${encodeURIComponent(v)}`);
        } else if (k === 'skip-cert-verify' && v === 'true') {
          urlParams.push('allowInsecure=1');
        }
      } else if (!password && opt) {
        password = opt.replace(/^["']|["']$/g, '');
      }
    });

    if (!password) return null;

    const finalName = cleanName(name);
    const query = urlParams.length > 0 ? `?${urlParams.join('&')}` : '';
    return {
      id: generateNodeId(),
      name: finalName,
      url: `trojan://${encodeURIComponent(password)}@${server}:${port}${query}#${encodeURIComponent(finalName)}`,
      enabled: true,
      protocol: 'trojan',
      source: 'surge',
    };
  } catch {
    return null;
  }
}

/**
 * 解析 Surge HTTP/HTTPS 代理配置
 */
function parseSurgeHTTP(line: string) {
  try {
    const parts = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!parts) return null;

    const name = parts[1].trim();
    const params = parts[2].split(',').map((p) => p.trim());
    const [protocol, server, port, ...rest] = params;

    if (!server || !port) return null;

    const isHTTPS =
      line.toLowerCase().startsWith('https-proxy') ||
      protocol.toLowerCase() === 'https' ||
      protocol.toLowerCase() === 'https-proxy';
    const urlProtocol = isHTTPS ? 'https' : 'http';
    const finalName = cleanName(name);

    let username = '';
    let password = '';
    const positional: string[] = [];
    rest.forEach((opt) => {
      const match = opt.match(/^([\w-]+)\s*=\s*(.+)$/);
      if (match) {
        const k = match[1].toLowerCase();
        const v = match[2].replace(/^["']|["']$/g, '');
        if (k === 'username') username = v;
        else if (k === 'password') password = v;
      } else if (opt) {
        positional.push(opt.replace(/^["']|["']$/g, ''));
      }
    });
    if (!username && positional[0]) username = positional[0];
    if (!password && positional[1]) password = positional[1];

    const auth = username
      ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}@`
      : '';

    return {
      id: generateNodeId(),
      name: finalName,
      url: `${urlProtocol}://${auth}${server}:${port}#${encodeURIComponent(finalName)}`,
      enabled: true,
      protocol: protocol,
      source: 'surge',
    };
  } catch {
    return null;
  }
}

/**
 * 解析 Surge SOCKS5 配置
 */
function parseSurgeSocks5(line: string) {
  try {
    const parts = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!parts) return null;

    const name = parts[1].trim();
    const params = parts[2].split(',').map((p) => p.trim());
    const [protocol, server, port, ...rest] = params;
    if (protocol.toLowerCase() !== 'socks5' || !server || !port) return null;

    let username = '';
    let password = '';
    const positional: string[] = [];
    const urlParams: string[] = [];

    rest.forEach((opt) => {
      const match = opt.match(/^([\w-]+)\s*=\s*(.+)$/);
      if (match) {
        const k = match[1].toLowerCase();
        const v = match[2].replace(/^["']|["']$/g, '');
        if (k === 'username') username = v;
        else if (k === 'password') password = v;
        else if (k === 'tls' && v === 'true') urlParams.push('tls=1');
        else if (k === 'sni') urlParams.push(`sni=${encodeURIComponent(v)}`);
        else if (k === 'skip-cert-verify' && v === 'true') urlParams.push('allowInsecure=1');
      } else if (opt) {
        positional.push(opt.replace(/^["']|["']$/g, ''));
      }
    });
    if (!username && positional[0]) username = positional[0];
    if (!password && positional[1]) password = positional[1];

    const auth = username
      ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ''}@`
      : '';
    const query = urlParams.length > 0 ? `?${urlParams.join('&')}` : '';
    const finalName = cleanName(name);

    return {
      id: generateNodeId(),
      name: finalName,
      url: `socks5://${auth}${server}:${port}${query}#${encodeURIComponent(finalName)}`,
      enabled: true,
      protocol: 'socks5',
      source: 'surge',
    };
  } catch {
    return null;
  }
}

/**
 * 解析 Surge Snell 配置
 * 格式: name = snell, server, port, psk=xxx, version=5, obfs=http, obfs-host=example.com, reuse=true, tfo=true
 */
function parseSurgeSnell(line: string) {
  try {
    const parts = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!parts) return null;

    const name = parts[1].trim();
    const config = parts[2];
    const params = config.split(',').map((p) => p.trim());

    if (params.length < 4) return null;

    const [protocol, server, port, ...options] = params;

    if (protocol.toLowerCase() !== 'snell' || !server || !port) return null;

    const proxy: {
      server: string;
      port: number;
      psk: string;
      version: number;
      reuse: boolean;
      tfo: boolean;
      'obfs-opts'?: { mode?: string; host?: string };
    } = {
      server: server,
      port: parseInt(port, 10),
      psk: '',
      version: 4,
      reuse: true,
      tfo: false,
    };

    options.forEach((opt) => {
      const match = opt.match(/^(\w+(?:-\w+)*)\s*=\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const cleanValue = value.replace(/^["']|["']$/g, '');

        switch (key.toLowerCase()) {
          case 'psk':
            proxy.psk = cleanValue;
            break;
          case 'version':
            proxy.version = parseInt(cleanValue, 10);
            break;
          case 'obfs':
            if (!proxy['obfs-opts']) proxy['obfs-opts'] = {};
            proxy['obfs-opts'].mode = cleanValue;
            break;
          case 'obfs-host':
            if (!proxy['obfs-opts']) proxy['obfs-opts'] = {};
            proxy['obfs-opts'].host = cleanValue;
            break;
          case 'reuse':
            proxy.reuse = cleanValue === 'true';
            break;
          case 'tfo':
            proxy.tfo = cleanValue === 'true';
            break;
        }
      } else if (!proxy.psk && opt) {
        proxy.psk = opt.replace(/^["']|["']$/g, '');
      }
    });

    if (!proxy.psk) return null;

    const urlParams: string[] = [];
    if (proxy.version) urlParams.push(`version=${proxy.version}`);
    if (proxy.reuse !== undefined) urlParams.push(`reuse=${proxy.reuse}`);
    if (proxy.tfo !== undefined) urlParams.push(`tfo=${proxy.tfo}`);

    if (proxy['obfs-opts']) {
      if (proxy['obfs-opts'].mode) urlParams.push(`obfs=${proxy['obfs-opts'].mode}`);
      if (proxy['obfs-opts'].host) urlParams.push(`obfs-host=${encodeURIComponent(proxy['obfs-opts'].host)}`);
    }

    const query = urlParams.length > 0 ? `?${urlParams.join('&')}` : '';
    const url = `snell://${encodeURIComponent(proxy.psk)}@${proxy.server}:${proxy.port}${query}#${encodeURIComponent(name)}`;

    return {
      id: generateNodeId(),
      name: name,
      url: url,
      enabled: true,
      protocol: 'snell',
      source: 'surge',
    };
  } catch (e) {
    console.error('Surge Snell 解析失败:', e);
    return null;
  }
}

/**
 * 解析 Surge Hysteria2 配置
 * 格式: name = hysteria2, server, port, password=xxx, sni=xxx, ...
 */
function parseSurgeHysteria2(line: string) {
  try {
    const parts = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!parts) return null;

    const name = parts[1].trim();
    const config = parts[2];
    const params = config.split(',').map((p) => p.trim());

    if (params.length < 3) return null;

    const [protocol, server, port, ...options] = params;
    const lp = protocol.toLowerCase();
    if (lp !== 'hysteria2' && lp !== 'hy2') return null;
    if (!server || !port) return null;

    let password = '';
    const urlParams: string[] = [];

    options.forEach((opt) => {
      const match = opt.match(/^([\w-]+)\s*=\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const v = value.replace(/^["']|["']$/g, '');
        const k = key.toLowerCase();
        if (k === 'password') password = v;
        else if (k === 'sni') urlParams.push(`sni=${encodeURIComponent(v)}`);
        else if (k === 'skip-cert-verify' && v === 'true') urlParams.push('insecure=1');
        else if (k === 'download-bandwidth') urlParams.push(`down=${encodeURIComponent(v)}`);
      } else if (!password && opt) {
        password = opt.replace(/^["']|["']$/g, '');
      }
    });

    if (!password) return null;

    const query = urlParams.length > 0 ? `?${urlParams.join('&')}` : '';
    const url = `hysteria2://${encodeURIComponent(password)}@${server}:${port}${query}#${encodeURIComponent(name)}`;

    return {
      id: generateNodeId(),
      name,
      url,
      enabled: true,
      protocol: 'hysteria2',
      source: 'surge',
    };
  } catch (e) {
    console.error('Surge Hysteria2 解析失败:', e);
    return null;
  }
}

/**
 * 解析 Surge TUIC / TUIC-v5 配置
 * 格式: name = tuic, server, port, token=xxx, alpn=h3, ...
 *   或: name = tuic-v5, server, port, password=xxx, uuid=xxx, alpn=h3, ...
 */
function parseSurgeTUIC(line: string) {
  try {
    const parts = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!parts) return null;

    const name = parts[1].trim();
    const config = parts[2];
    const params = config.split(',').map((p) => p.trim());

    if (params.length < 3) return null;

    const [protocol, server, port, ...options] = params;
    const lp = protocol.toLowerCase();
    if ((lp !== 'tuic' && lp !== 'tuic-v5') || !server || !port) return null;

    let token = '';
    let uuid = '';
    let password = '';
    const urlParams: string[] = [];

    options.forEach((opt) => {
      const match = opt.match(/^([\w-]+)\s*=\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const v = value.replace(/^["']|["']$/g, '');
        const k = key.toLowerCase();
        if (k === 'token') token = v;
        else if (k === 'uuid') uuid = v;
        else if (k === 'password') password = v;
        else if (k === 'sni') urlParams.push(`sni=${encodeURIComponent(v)}`);
        else if (k === 'alpn') urlParams.push(`alpn=${encodeURIComponent(v)}`);
        else if (k === 'skip-cert-verify' && v === 'true') urlParams.push('insecure=1');
      } else if (!token && !uuid && opt) {
        token = opt.replace(/^["']|["']$/g, '');
      }
    });

    let auth = '';
    if (uuid && password) {
      auth = `${encodeURIComponent(uuid)}:${encodeURIComponent(password)}`;
    } else if (token) {
      auth = encodeURIComponent(token);
    } else if (uuid) {
      auth = encodeURIComponent(uuid);
    }

    if (!auth) return null;

    const query = urlParams.length > 0 ? `?${urlParams.join('&')}` : '';
    const url = `tuic://${auth}@${server}:${port}${query}#${encodeURIComponent(name)}`;

    return {
      id: generateNodeId(),
      name,
      url,
      enabled: true,
      protocol: 'tuic',
      source: 'surge',
    };
  } catch (e) {
    console.error('Surge TUIC 解析失败:', e);
    return null;
  }
}

/**
 * 解析 Surge VLESS 配置
 * 格式: name = vless, server, port, username=uuid, ...
 */
function parseSurgeVless(line: string) {
  try {
    const parts = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!parts) return null;

    const name = parts[1].trim();
    const config = parts[2];
    const params = config.split(',').map((p) => p.trim());

    if (params.length < 4) return null;

    const [protocol, server, port, ...options] = params;
    if (protocol.toLowerCase() !== 'vless' || !server || !port) return null;

    let uuid = '';
    const urlParams = ['encryption=none'];

    options.forEach((opt) => {
      const match = opt.match(/^([\w-]+)\s*=\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const v = value.replace(/^["']|["']$/g, '');
        const k = key.toLowerCase();
        if (k === 'username' || k === 'uuid') uuid = v;
        else if (k === 'sni') urlParams.push(`sni=${encodeURIComponent(v)}`);
        else if (k === 'ws' && v === 'true') urlParams.push('type=ws');
        else if (k === 'ws-path') urlParams.push(`path=${encodeURIComponent(v)}`);
        else if (k === 'ws-headers') {
          const hostMatch = v.match(/Host:(.+)/i);
          if (hostMatch) urlParams.push(`host=${encodeURIComponent(hostMatch[1].trim())}`);
        } else if (k === 'tls' && v === 'true') urlParams.push('security=tls');
        else if (k === 'skip-cert-verify' && v === 'true') urlParams.push('allowInsecure=1');
      } else if (!uuid && opt) {
        uuid = opt.replace(/^["']|["']$/g, '');
      }
    });

    if (!uuid) return null;

    const url = `vless://${uuid}@${server}:${port}?${urlParams.join('&')}#${encodeURIComponent(name)}`;

    return {
      id: generateNodeId(),
      name,
      url,
      enabled: true,
      protocol: 'vless',
      source: 'surge',
    };
  } catch (e) {
    console.error('Surge VLESS 解析失败:', e);
    return null;
  }
}

/**
 * 解析 Surge WireGuard 配置
 */
function parseSurgeWireGuard(line: string) {
  try {
    const parts = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!parts) return null;

    const name = parts[1].trim();
    const config = parts[2];
    const params = config.split(',').map((p) => p.trim());

    const [protocol, server, port, ...options] = params;
    if (protocol.toLowerCase() !== 'wireguard') return null;

    if (!server || !port) return null;

    const urlParams: string[] = [];
    let privateKey = '';
    options.forEach((opt) => {
      const match = opt.match(/^([\w-]+)\s*=\s*(.+)$/);
      if (!match) return;
      const [, key, value] = match;
      const k = key.toLowerCase();
      const v = value.replace(/^['"]|['"]$/g, '');
      if (k === 'private-key') privateKey = v;
      else if (k === 'peer-public-key' || k === 'public-key') urlParams.push(`publickey=${encodeURIComponent(v)}`);
      else if (k === 'client-id') urlParams.push(`reserved=${encodeURIComponent(v.replace(/\//g, ','))}`);
      else if (k === 'self-ip') urlParams.push(`address=${encodeURIComponent(v)}`);
      else if (k === 'mtu') urlParams.push(`mtu=${encodeURIComponent(v)}`);
      else if (k === 'preshared-key') urlParams.push(`presharedkey=${encodeURIComponent(v)}`);
    });

    if (!privateKey) return null;
    const query = urlParams.length ? `?${urlParams.join('&')}` : '';
    return {
      id: generateNodeId(),
      name,
      url: `wireguard://${encodeURIComponent(privateKey)}@${server}:${port}${query}#${encodeURIComponent(name)}`,
      enabled: true,
      protocol: 'wireguard',
      source: 'surge',
    };
  } catch (e) {
    console.error('Surge WireGuard 解析失败:', e);
    return null;
  }
}
