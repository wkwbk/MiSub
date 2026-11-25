import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import { deduplicateProxyNames, parseNodeUrlLines } from '../core/client-shared.js';
import { parseIniTemplate } from './parsers/ini-template-parser.js';
import { applySmartModelOptimizations } from './template-processor.js';

/**
 * 解析 INI 模板并应用智能地区/规则优化（不绑定任何客户端渲染器，支持按需懒加载）
 * @param {string} templateText
 * @param {Record<string, any>} [options]
 * @returns {Record<string, any>}
 */
export function buildOptimizedIniTemplateModel(templateText, options = {}) {
  const nodeList = typeof options.nodeList === 'string' ? options.nodeList : '';
  const proxies = Array.isArray(options.proxies)
    ? options.proxies
    : urlsToClashProxies(parseNodeUrlLines(nodeList, { stripControl: false }), options);
  deduplicateProxyNames(proxies);

  const model = parseIniTemplate(templateText, {
    ...options,
    proxies,
  });

  return applySmartModelOptimizations(model);
}
