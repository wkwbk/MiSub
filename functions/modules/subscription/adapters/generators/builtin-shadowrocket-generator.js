import * as yaml from 'js-yaml';
import { generateBuiltinClashConfig } from './builtin-clash-generator.js';
import { renderShadowrocketConfigFromClash } from '../../templates/renderers/render-shadowrocket.js';

/**
 * 生成内置原生 Shadowrocket (.conf) 配置
 * 复用内置 Clash 生成器产出的节点、策略组、分流规则与可视化规则，
 * 并渲染为 Shadowrocket 原生 INI `.conf` 格式（含手动节点置顶、区域排序、加密 DoH 与 RULE-SET 镜像）。
 */
export function generateBuiltinShadowrocketConfig(nodeList, options = {}) {
  const clashYaml = generateBuiltinClashConfig(nodeList, options);
  if (!clashYaml) {
    return '[General]\nipv6 = false\nprefer-ipv6 = false\n\n[Proxy]\nDIRECT = direct\n\n[Proxy Group]\n\n[Rule]\nFINAL,DIRECT\n';
  }
  const clashConfig = /** @type {Record<string, any> | null} */ (yaml.load(clashYaml));
  if (!clashConfig || typeof clashConfig !== 'object') {
    return '[General]\nipv6 = false\nprefer-ipv6 = false\n\n[Proxy]\nDIRECT = direct\n\n[Proxy Group]\n\n[Rule]\nFINAL,DIRECT\n';
  }
  return renderShadowrocketConfigFromClash(clashConfig, options);
}
