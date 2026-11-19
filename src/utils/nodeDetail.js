import * as yaml from 'js-yaml';
import { urlToClashProxy } from '../../functions/utils/url-to-clash.js';
import { extractHostAndPort } from '@/lib/utils.js';

const BASIC_KEYS = new Set([
    'name',
    'type',
    'server',
    'port',
    'udp',
    'tfo',
    'dialer-proxy',
    'ip-version',
    'interface-name',
    'routing-mark',
    'mtu',
    'version',
    'profile',
    'multiplexing',
]);

const AUTH_KEYS = new Set([
    'uuid',
    'password',
    'cipher',
    'alterId',
    'flow',
    'encryption',
    'username',
    'auth',
    'token',
    'psk',
    'private-key',
    'public-key',
    'pre-shared-key',
    'reserved',
    'ip',
    'ipv6',
    'protocol',
    'protocol-param',
    'obfs',
    'obfs-param',
    'obfs-password',
    'up',
    'down',
    'congestion-controller',
    'udp-relay-mode',
    'reduce-rtt',
    'fast-open',
    'heartbeat-interval',
    'request-timeout',
    'max-open-streams',
    'idle-session-check-interval',
    'idle-session-timeout',
    'min-idle-session',
    'plugin',
    'plugin-opts',
]);

const TRANSPORT_KEYS = new Set([
    'network',
    'ws-opts',
    'grpc-opts',
    'h2-opts',
    'http-opts',
    'xhttp-opts',
    'transport',
    'handshake-mode',
]);

const SECURITY_KEYS = new Set([
    'tls',
    'sni',
    'servername',
    'alpn',
    'skip-cert-verify',
    'client-fingerprint',
    'fingerprint',
    'reality-opts',
    'disable-sni',
    'smux',
    'ech-opts',
    'packet-encoding',
    'xudp',
    'global-padding',
    'authenticated-length',
]);

const COPYABLE_KEYS = new Set([
    'server',
    'uuid',
    'password',
    'token',
    'psk',
    'private-key',
    'public-key',
    'pre-shared-key',
    'sni',
    'servername',
    'reality-opts.public-key',
    'reality-opts.short-id',
    'ws-opts.path',
    'ws-opts.headers.Host',
    'grpc-opts.grpc-service-name',
]);

const FIELD_LABELS = {
    name: 'Name',
    type: 'Protocol',
    server: 'Server',
    port: 'Port',
    udp: 'UDP',
    tfo: 'TCP Fast Open',
    'dialer-proxy': 'Dialer Proxy',
    'ip-version': 'IP Version',
    uuid: 'UUID',
    password: 'Password',
    cipher: 'Cipher',
    alterId: 'AlterId',
    flow: 'Flow',
    encryption: 'Encryption',
    username: 'Username',
    token: 'Token',
    psk: 'PSK',
    'private-key': 'Private Key',
    'public-key': 'Public Key',
    'pre-shared-key': 'Pre-Shared Key',
    reserved: 'Reserved',
    obfs: 'Obfs',
    'obfs-param': 'Obfs Param',
    'obfs-password': 'Obfs Password',
    plugin: 'Plugin',
    network: 'Network',
    transport: 'Transport',
    tls: 'TLS',
    sni: 'SNI',
    servername: 'Server Name',
    alpn: 'ALPN',
    'skip-cert-verify': 'Skip Cert Verify',
    'client-fingerprint': 'Client Fingerprint',
    fingerprint: 'Fingerprint',
    'disable-sni': 'Disable SNI',
    'packet-encoding': 'Packet Encoding',
    'ws-opts.path': 'WS Path',
    'ws-opts.headers.Host': 'WS Host',
    'ws-opts.max-early-data': 'WS Max Early Data',
    'ws-opts.early-data-header-name': 'WS Early Data Header',
    'grpc-opts.grpc-service-name': 'gRPC Service Name',
    'h2-opts.host': 'H2 Host',
    'h2-opts.path': 'H2 Path',
    'http-opts.method': 'HTTP Method',
    'http-opts.path': 'HTTP Path',
    'xhttp-opts.path': 'xHTTP Path',
    'xhttp-opts.host': 'xHTTP Host',
    'xhttp-opts.mode': 'xHTTP Mode',
    'reality-opts.public-key': 'Reality Public Key',
    'reality-opts.short-id': 'Reality Short ID',
    'reality-opts.support-x25519mlkem768': 'Reality X25519MLKEM768',
};

function detectProtocolFromUrl(url) {
    if (!url || typeof url !== 'string') return 'unknown';
    const match = url.trim().match(/^([a-z0-9+.-]+):\/\//i);
    if (!match) return 'unknown';
    const scheme = match[1].toLowerCase();
    if (scheme === 'hy2') return 'hysteria2';
    if (scheme === 'hy') return 'hysteria';
    if (scheme === 'socks') return 'socks5';
    return scheme;
}

function isPlainObject(val) {
    return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function formatLeafValue(val) {
    if (typeof val === 'boolean') {
        return { value: val, display: val ? 'true' : 'false', kind: 'boolean' };
    }
    if (Array.isArray(val)) {
        const allPrimitive = val.every((item) => !isPlainObject(item) && !Array.isArray(item));
        const text = allPrimitive ? val.join(', ') : JSON.stringify(val);
        return { value: text, display: text, kind: allPrimitive ? 'array' : 'json' };
    }
    if (isPlainObject(val)) {
        const text = JSON.stringify(val);
        return { value: text, display: text, kind: 'json' };
    }
    const text = String(val);
    return { value: text, display: text, kind: 'string' };
}

function flattenEntries(prefix, value, target) {
    if (value === undefined || value === null || value === '') return;

    if (isPlainObject(value)) {
        const entries = Object.entries(value);
        if (entries.length === 0) return;
        for (const [childKey, childVal] of entries) {
            const fullKey = prefix ? `${prefix}.${childKey}` : childKey;
            if (isPlainObject(childVal)) {
                flattenEntries(fullKey, childVal, target);
            } else if (childVal !== undefined && childVal !== null && childVal !== '') {
                const formatted = formatLeafValue(childVal);
                target.push({
                    key: fullKey,
                    label: FIELD_LABELS[fullKey] || fullKey,
                    ...formatted,
                    copyable: COPYABLE_KEYS.has(fullKey) || formatted.display.length >= 24,
                });
            }
        }
        return;
    }

    const formatted = formatLeafValue(value);
    target.push({
        key: prefix,
        label: FIELD_LABELS[prefix] || prefix,
        ...formatted,
        copyable: COPYABLE_KEYS.has(prefix) || formatted.display.length >= 24,
    });
}

/**
 * 解析节点详情配置，复用后端 urlToClashProxy 解析器
 * @param {Object|string|null} node - 节点对象或节点 URL 字符串
 * @returns {Object} 结构化的节点详情数据
 */
export function parseNodeDetail(node) {
    const rawUrl = typeof node === 'string' ? node.trim() : String(node?.url || '').trim();
    const fallbackName = typeof node === 'object' && node ? String(node.name || '').trim() : '';

    let parsedProxy = null;
    if (rawUrl) {
        try {
            parsedProxy = urlToClashProxy(rawUrl);
        } catch {
            parsedProxy = null;
        }
    }

    if (parsedProxy && typeof parsedProxy === 'object') {
        const { metadata: _metadata, ...cleanProxy } = parsedProxy;
        const basicItems = [];
        const authItems = [];
        const transportItems = [];
        const securityItems = [];
        const extraItems = [];

        for (const [key, value] of Object.entries(cleanProxy)) {
            if (BASIC_KEYS.has(key)) {
                flattenEntries(key, value, basicItems);
            } else if (AUTH_KEYS.has(key)) {
                flattenEntries(key, value, authItems);
            } else if (TRANSPORT_KEYS.has(key)) {
                flattenEntries(key, value, transportItems);
            } else if (SECURITY_KEYS.has(key)) {
                flattenEntries(key, value, securityItems);
            } else {
                flattenEntries(key, value, extraItems);
            }
        }

        const sections = [
            { id: 'basic', items: basicItems },
            { id: 'auth', items: authItems },
            { id: 'transport', items: transportItems },
            { id: 'security', items: securityItems },
            { id: 'extra', items: extraItems },
        ].filter((section) => section.items.length > 0);

        let formattedYaml = '';
        try {
            formattedYaml = yaml.dump(cleanProxy, { lineWidth: -1, noRefs: true }).trim();
        } catch {
            formattedYaml = '';
        }

        return {
            parsed: true,
            name: fallbackName || cleanProxy.name || '',
            protocol: String(cleanProxy.type || detectProtocolFromUrl(rawUrl)).toUpperCase(),
            server: cleanProxy.server || '',
            port: cleanProxy.port ?? '',
            proxy: cleanProxy,
            sections,
            rawUrl,
            formattedYaml,
            formattedJson: JSON.stringify(cleanProxy, null, 2),
        };
    }

    const hostAndPort = rawUrl ? extractHostAndPort(rawUrl) : { host: '', port: '' };
    const protocol = detectProtocolFromUrl(rawUrl);
    const basicItems = [];
    if (fallbackName) {
        flattenEntries('name', fallbackName, basicItems);
    }
    if (protocol && protocol !== 'unknown') {
        flattenEntries('type', protocol, basicItems);
    }
    if (hostAndPort.host) {
        flattenEntries('server', hostAndPort.host, basicItems);
    }
    if (hostAndPort.port) {
        flattenEntries('port', hostAndPort.port, basicItems);
    }

    return {
        parsed: false,
        name: fallbackName,
        protocol: protocol.toUpperCase(),
        server: hostAndPort.host || '',
        port: hostAndPort.port || '',
        proxy: null,
        sections: basicItems.length > 0 ? [{ id: 'basic', items: basicItems }] : [],
        rawUrl,
        formattedYaml: '',
        formattedJson: '',
    };
}
