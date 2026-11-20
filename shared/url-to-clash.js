/**
 * 节点 URL 转 Clash 代理对象（前后端共享纯协议解析层）
 * 支持特殊参数：dialer-proxy、reality-opts 等
 */

import { extractName } from './clash-parsers/common.js';
import { parseTrojanUrl, parseVlessUrl, parseVmessUrl } from './clash-parsers/v2ray.js';
import { parseSsdUrl, parseSsrUrl, parseSsUrl } from './clash-parsers/shadowsocks.js';
import {
    parseAnytlsUrl,
    parseHysteria2Url,
    parseSnellUrl,
    parseTuicUrl,
    parseWireguardUrl,
} from './clash-parsers/modern.js';
import { parseHttpsUrl, parseSocks5Url } from './clash-parsers/basic.js';

/**
 * 将节点 URL 转换为 Clash 代理对象
 * @param {string} url - 节点 URL
 * @returns {Object|null} Clash 代理对象
 */
export function urlToClashProxy(url) {
    if (!url || typeof url !== 'string') return null;

    if (/^mierus:\/\//i.test(url)) {
        try {
            const body = url.slice(url.indexOf('//') + 2);
            const hashIndex = body.indexOf('#');
            const beforeHash = hashIndex < 0 ? body : body.slice(0, hashIndex);
            const queryIndex = beforeHash.indexOf('?');
            const authority = queryIndex < 0 ? beforeHash : beforeHash.slice(0, queryIndex);
            const query = new URLSearchParams(
                queryIndex < 0 ? '' : beforeHash.slice(queryIndex + 1)
            );
            let server;
            let port;
            if (authority.startsWith('[')) {
                const end = authority.indexOf(']');
                server = authority.slice(1, end);
                port = Number(authority.slice(end + 2));
            } else {
                const split = authority.lastIndexOf(':');
                server = authority.slice(0, split);
                port = Number(authority.slice(split + 1));
            }
            const proxy = {
                name: extractName(url) || `Mieru-${server}`,
                type: 'mieru',
                server,
                port,
            };
            for (const key of ['username', 'password', 'transport', 'handshake-mode', 'profile'])
                if (query.has(key)) proxy[key] = query.get(key);
            for (const key of ['udp', 'multiplexing'])
                if (query.has(key)) proxy[key] = query.get(key) === 'true';
            if (query.has('mtu')) proxy.mtu = Number(query.get('mtu'));
            return proxy;
        } catch {
            return null;
        }
    }

    const lowerUrl = url.toLowerCase();

    if (lowerUrl.startsWith('vless://')) {
        return parseVlessUrl(url);
    } else if (lowerUrl.startsWith('trojan://')) {
        return parseTrojanUrl(url);
    } else if (lowerUrl.startsWith('vmess://')) {
        return parseVmessUrl(url);
    } else if (lowerUrl.startsWith('ssr://')) {
        return parseSsrUrl(url);
    } else if (lowerUrl.startsWith('ssd://')) {
        return parseSsdUrl(url);
    } else if (lowerUrl.startsWith('ss://')) {
        return parseSsUrl(url);
    } else if (lowerUrl.startsWith('hysteria2://') || lowerUrl.startsWith('hy2://')) {
        return parseHysteria2Url(url);
    } else if (lowerUrl.startsWith('tuic://')) {
        return parseTuicUrl(url);
    } else if (lowerUrl.startsWith('snell://')) {
        return parseSnellUrl(url);
    } else if (lowerUrl.startsWith('wireguard://')) {
        return parseWireguardUrl(url);
    } else if (lowerUrl.startsWith('anytls://')) {
        return parseAnytlsUrl(url);
    } else if (lowerUrl.startsWith('https://')) {
        return parseHttpsUrl(url);
    } else if (lowerUrl.startsWith('http://')) {
        return parseHttpsUrl(url, false);
    } else if (lowerUrl.startsWith('socks5://')) {
        return parseSocks5Url(url);
    }

    // 不支持的协议
    return null;
}
