/**
 * HTTP(S) / SOCKS5 协议转 Clash 代理对象
 */

import type { ClashProxy } from '../../types.js';
import { extractName, parseHostPort, parseQueryParams } from './common.js';

/**
 * 将 HTTPS URL 转换为 Clash 代理对象
 */
export function parseHttpsUrl(url: string, isTls = true): ClashProxy | null {
  try {
    const body = url.substring(isTls ? 8 : 7);
    const atIndex = body.indexOf('@');
    let userInfo = '';
    let serverPart = body;
    if (atIndex !== -1) {
      userInfo = body.substring(0, atIndex);
      serverPart = body.substring(atIndex + 1);
    }

    const queryIndex = serverPart.indexOf('?');
    const hashIndex = serverPart.indexOf('#');
    if (queryIndex !== -1) {
      serverPart = serverPart.substring(0, queryIndex);
    } else if (hashIndex !== -1) {
      serverPart = serverPart.substring(0, hashIndex);
    }

    const { server, port } = parseHostPort(serverPart);
    const params = parseQueryParams(url);
    const name = extractName(url);

    let username = '';
    let password = '';
    const colonIndex = userInfo.indexOf(':');
    if (colonIndex !== -1) {
      username = decodeURIComponent(userInfo.substring(0, colonIndex));
      password = decodeURIComponent(userInfo.substring(colonIndex + 1));
    } else {
      username = decodeURIComponent(userInfo);
    }

    const proxy: ClashProxy = {
      name: name || `HTTPS-${server}`,
      type: 'http',
      server,
      port,
      username,
      password,
    };
    if (isTls) proxy.tls = true;

    const sni = params.get('sni') || params.get('peer');
    if (sni) {
      proxy.servername = sni;
      proxy.sni = sni;
    }

    if (params.get('allowInsecure') === '1' || params.get('insecure') === '1') {
      proxy['skip-cert-verify'] = true;
    }

    proxy.udp = false;
    return proxy;
  } catch (e) {
    console.error('解析 HTTPS URL 失败:', e);
    return null;
  }
}

/**
 * 将 SOCKS5 URL 转换为 Clash 代理对象
 */
export function parseSocks5Url(url: string): ClashProxy | null {
  try {
    const body = url.substring(9);
    const hashIdx = body.indexOf('#');
    const bodyNoHash = hashIdx !== -1 ? body.substring(0, hashIdx) : body;
    const queryIdx = bodyNoHash.indexOf('?');
    const mainPart = queryIdx !== -1 ? bodyNoHash.substring(0, queryIdx) : bodyNoHash;

    const atIndex = mainPart.lastIndexOf('@');
    const userInfo = atIndex !== -1 ? mainPart.substring(0, atIndex) : '';
    const serverPart = atIndex !== -1 ? mainPart.substring(atIndex + 1) : mainPart;

    const { server, port } = parseHostPort(serverPart);
    const params = parseQueryParams(url);
    const name = extractName(url);

    let username = '';
    let password = '';
    const colonIndex = userInfo.indexOf(':');
    if (colonIndex !== -1) {
      username = decodeURIComponent(userInfo.substring(0, colonIndex));
      password = decodeURIComponent(userInfo.substring(colonIndex + 1));
    } else {
      username = decodeURIComponent(userInfo);
    }

    const useTls = params.get('tls') === '1' || params.get('tls') === 'true' || params.get('secure') === '1';
    const proxy: ClashProxy = {
      name: name || `SOCKS5-${server}`,
      type: useTls ? 'socks5-tls' : 'socks5',
      server,
      port,
      username,
      password,
      udp: false,
    };

    const sni = params.get('sni') || params.get('peer');
    if (sni) {
      proxy.servername = sni;
      proxy.sni = sni;
    }

    if (params.get('allowInsecure') === '1' || params.get('insecure') === '1') {
      proxy['skip-cert-verify'] = true;
    }

    return proxy;
  } catch (e) {
    console.error('解析 SOCKS5 URL 失败:', e);
    return null;
  }
}
