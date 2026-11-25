export function buildFetchProxyUrl(fetchProxy: unknown, targetUrl: string, userAgent = ''): string {
  const proxyPrefix = typeof fetchProxy === 'string' ? fetchProxy.trim() : '';
  if (!proxyPrefix) return targetUrl;

  const encodedTarget = encodeURIComponent(targetUrl);
  const ua = typeof userAgent === 'string' ? userAgent.trim() : '';

  if (!ua || /[?&]ua=/i.test(proxyPrefix)) {
    return `${proxyPrefix}${encodedTarget}`;
  }

  const urlParamIndex = proxyPrefix.search(/[?&]url=$/i);
  if (urlParamIndex !== -1) {
    const separator = proxyPrefix[urlParamIndex];
    const beforeUrlParam = proxyPrefix.slice(0, urlParamIndex);
    const urlParam = proxyPrefix.slice(urlParamIndex + 1);
    return `${beforeUrlParam}${separator}ua=${encodeURIComponent(ua)}&${urlParam}${encodedTarget}`;
  }

  return `${proxyPrefix}${encodedTarget}`;
}
