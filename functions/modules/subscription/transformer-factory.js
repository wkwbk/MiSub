import { generateBuiltinClashConfig } from './generators/builtin-clash-generator.js';
import { generateBuiltinSurgeConfig } from './generators/builtin-surge-generator.js';
import { generateBuiltinLoonConfig } from './generators/builtin-loon-generator.js';
import { generateBuiltinQuanxConfig } from './generators/builtin-quanx-generator.js';
import { generateBuiltinSingboxConfig } from './generators/builtin-singbox-generator.js';
import { generateBuiltinEgernConfig } from './generators/builtin-egern-generator.js';
import { generateBuiltinShadowrocketConfig } from './generators/builtin-shadowrocket-generator.js';

export function transformBuiltinSubscription(nodeList, targetFormat, options = {}) {
  const normalized = (targetFormat || '').toLowerCase();
  const targetKey = normalized.startsWith('surge&ver=') ? 'surge' : normalized;

  switch (targetKey) {
    case 'clash':
      return generateBuiltinClashConfig(nodeList, options);
    case 'surge':
      return generateBuiltinSurgeConfig(nodeList, options);
    case 'loon':
      return generateBuiltinLoonConfig(nodeList, options);
    case 'quanx':
      return generateBuiltinQuanxConfig(nodeList, options);
    case 'singbox':
    case 'sing-box':
      return generateBuiltinSingboxConfig(nodeList, options);
    case 'egern':
      return generateBuiltinEgernConfig(nodeList, options);
    case 'shadowrocket':
      return generateBuiltinShadowrocketConfig(nodeList, options);
    default:
      return null;
  }
}
