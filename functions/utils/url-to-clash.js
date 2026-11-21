/**
 * 节点 URL 转 Clash 代理对象主入口（后端增强层）
 * 纯协议解析复用于 shared/url-to-clash.js；本文件负责批量增强、元数据注入与配置生成。
 */

import { extractNodeMetadata } from './metadata-extractor.js';
import { isLocalProxyEndpoint } from './node-utils.js';
import { isVirtualInfoProxy } from '../../shared/clash-parsers/common.js';
import { urlToClashProxy } from '../../shared/url-to-clash.js';

/**
 * 批量将节点 URL 转换为 Clash 代理列表
 * @param {string[]} urls - 节点 URL 数组
 * @param {Object} options - 参数增强选项 (tfo, udp, scv 等)
 * @returns {Object[]} Clash 代理对象数组
 */
export function urlsToClashProxies(urls, options = {}) {
  if (!Array.isArray(urls)) return [];

  return urls
    .map((url) => {
      const proxy = urlToClashProxy(url);
      if (!proxy) return null;

      // [URL 参数覆盖] 补全对 TFO/UDP/SCV 的映射
      if (options.enableTfo !== undefined) proxy.tfo = options.enableTfo;

      if (options.enableUdp !== undefined) {
        const type = (proxy.type || '').toLowerCase();
        const isNativeUdp = ['hysteria2', 'hy2', 'tuic', 'hysteria', 'wireguard'].includes(type);

        if (options.enableUdp) {
          proxy.udp = true;
        } else if (!isNativeUdp) {
          proxy.udp = false;
        } else {
          proxy.udp = true; // 原生 UDP 协议即便开关关闭也保持开启
        }
      }

      if (options.skipCertVerify) proxy['skip-cert-verify'] = true;

      if (options.supportX25519mlkem768 !== undefined && proxy['reality-opts']) {
        if (options.supportX25519mlkem768) {
          proxy['reality-opts']['support-x25519mlkem768'] = true;
        } else {
          delete proxy['reality-opts']['support-x25519mlkem768'];
        }
      }

      // [智能增强] 注入元数据
      proxy.metadata = extractNodeMetadata(proxy.name);

      // [自动补全] 仅在名称中完全没有国旗/地球 Emoji 时才尝试补全，避免重复添加或干扰用户重命名
      const HAS_EMOJI_REGEX = /([\u{1F1E6}-\u{1F1FF}]{2}|[\u{1F30D}-\u{1F30F}])/u;
      if (options.addFlagEmoji !== false && proxy.metadata.flag && !HAS_EMOJI_REGEX.test(proxy.name)) {
        proxy.name = `${proxy.metadata.flag} ${proxy.name}`;
      }

      return proxy;
    })
    .filter((proxy) => proxy !== null && (isVirtualInfoProxy(proxy) || !isLocalProxyEndpoint(proxy)));
}

/**
 * 生成完整的 Clash 配置
 * @param {string[]} urls - 节点 URL 数组
 * @param {Object} options - 配置选项
 * @returns {string} Clash YAML 配置
 */
export function generateClashConfig(urls, options = {}) {
  const proxies = urlsToClashProxies(urls, options);

  if (proxies.length === 0) {
    return '';
  }

  // 构建 YAML（简化版，不使用 js-yaml 以减少依赖）
  let yaml = 'proxies:\n';

  for (const proxy of proxies) {
    // [元数据清理] 移除内部元数据字段，避免污染 YAML
    const { metadata, ...rest } = proxy;
    yaml += `  - ${JSON.stringify(rest)}\n`;
  }

  return yaml;
}
