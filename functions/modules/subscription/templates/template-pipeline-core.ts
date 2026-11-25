import type { NodeIRBatchParseOptions } from '@misub/core/types.js';
import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import { deduplicateProxyNames, parseNodeUrlLines } from '../core/client-shared.js';
import { parseIniTemplate, type ParseIniTemplateOptions } from './parsers/ini-template-parser.js';
import { applySmartModelOptimizations } from './template-processor.js';
import type { TemplateProxy, UnifiedTemplateModel } from './template-model.js';

export interface BuildOptimizedIniTemplateOptions extends ParseIniTemplateOptions, NodeIRBatchParseOptions {
  nodeList?: string;
}

/**
 * 解析 INI 模板并应用智能地区/规则优化（不绑定任何客户端渲染器，支持按需懒加载）
 */
export function buildOptimizedIniTemplateModel(
  templateText: string,
  options: BuildOptimizedIniTemplateOptions = {},
): UnifiedTemplateModel {
  const nodeList = typeof options.nodeList === 'string' ? options.nodeList : '';
  const proxies: TemplateProxy[] = Array.isArray(options.proxies)
    ? options.proxies
    : (urlsToClashProxies(parseNodeUrlLines(nodeList, { stripControl: false }), options) as TemplateProxy[]);
  deduplicateProxyNames(proxies);

  const model = parseIniTemplate(templateText, {
    ...options,
    proxies,
  });

  return applySmartModelOptimizations(model);
}
