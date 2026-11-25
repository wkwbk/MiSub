import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import { getUniqueName } from '../core/name-utils.js';
import { parseIniTemplate } from './parsers/ini-template-parser.js';
import { applySmartModelOptimizations } from './template-processor.js';

/**
 * 处理重名节点，确保每个节点名称唯一
 * @param {Object[]} proxies - 代理对象数组
 */
export function deduplicateNames(proxies) {
  if (!Array.isArray(proxies)) return;
  const usedNames = new Map();
  proxies.forEach((proxy) => {
    if (proxy && proxy.name) {
      proxy.name = getUniqueName(proxy.name, usedNames);
    }
  });
}

/**
 * 解析 INI 模板并应用智能地区/规则优化（不绑定任何客户端渲染器，支持按需懒加载）
 * @param {string} templateText
 * @param {Record<string, any>} [options]
 * @returns {Record<string, any>}
 */
export function buildOptimizedIniTemplateModel(templateText, options = {}) {
  const nodeList = typeof options.nodeList === 'string' ? options.nodeList : '';
  const proxyUrls = nodeList
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const proxies = Array.isArray(options.proxies) ? options.proxies : urlsToClashProxies(proxyUrls, options);
  deduplicateNames(proxies);

  const model = parseIniTemplate(templateText, {
    ...options,
    proxies,
  });

  return applySmartModelOptimizations(model);
}
