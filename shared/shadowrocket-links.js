import { utf8ToBase64 } from './base64.js';

function namedUrl(baseUrl, profileName, suffix) {
  const url = new URL(baseUrl);
  if (profileName) {
    const cleanName = String(profileName)
      .replace(/[^\p{L}\p{N}._-]+/gu, '-')
      .replace(/^[.-]+|[.-]+$/g, '');
    const file = (cleanName.replace(/\.conf$/i, '') || 'MiSub').slice(0, 64) + suffix;
    url.pathname = url.pathname.replace(/\/$/, '') + '/' + encodeURIComponent(file);
  }
  return url;
}

export function shadowrocketConfigUrl(baseUrl, profileName) {
  const url = namedUrl(baseUrl, profileName, '.conf');
  url.searchParams.set('target', 'shadowrocket');
  url.searchParams.delete('list');
  return url.toString();
}

export function shadowrocketNodesUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set('target', 'base64');
  url.searchParams.set('node-order', 'manual-region');
  url.searchParams.delete('client');
  url.searchParams.delete('list');
  return url.toString();
}

export function shadowrocketQrPayload(baseUrl, mode = 'universal', profileName = '') {
  if (!baseUrl) return '';
  if (mode === 'shadowrocket-config') {
    return `shadowrocket://config/add/${encodeURIComponent(shadowrocketConfigUrl(baseUrl, profileName))}`;
  }
  if (mode === 'shadowrocket-nodes') {
    const encoded = utf8ToBase64(shadowrocketNodesUrl(baseUrl));
    const remark = profileName ? `?remark=${encodeURIComponent(`${profileName} 节点`)}` : '';
    return `shadowrocket://add/sub://${encoded}${remark}`;
  }
  return baseUrl;
}
