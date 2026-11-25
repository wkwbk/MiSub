import { determineTargetFormat } from '../core/user-agent-utils.js';
import { buildOptimizedIniTemplateModel } from '../templates/template-pipeline-core.js';

/**
 * 客户端适配器统一契约（按需动态加载 Generator 与 Template Renderer，降低 Worker 冷启动解析开销）
 * @typedef {Object} ClientAdapter
 * @property {string} id - 适配器唯一标识（如 clash / surge / quanx / loon / singbox / egern / shadowrocket）
 * @property {string} contentType - 默认响应 MIME 类型
 * @property {string[]} [aliases] - 支持的目标格式别名
 * @property {(userAgent: string, searchParams?: URLSearchParams) => boolean} match - 判断 UA / Query 是否命中本客户端
 * @property {(targetFormat: string) => boolean} matchesTarget - 判断已规范化 targetFormat 是否命中本适配器
 * @property {() => Promise<Record<string, any>>} loadGenerator - 懒加载内置配置生成器模块
 * @property {() => Promise<Record<string, any>>} loadRenderer - 懒加载模板渲染器模块
 * @property {(nodeList: string, options?: Record<string, any>) => Promise<string>} generateBuiltin - 生成内置客户端配置
 * @property {(templateText: string, options?: Record<string, any>) => Promise<string>} renderIniTemplate - 按 INI 模板渲染配置
 * @property {(clashConfig: Record<string, any>, options?: Record<string, any>) => Promise<string>} [renderFromClashConfig] - 可选：从 Clash 配置对象转换输出
 */

function normalizeTarget(targetFormat) {
  return String(targetFormat || '')
    .trim()
    .toLowerCase();
}

function createTargetMatcher(primaryId, aliases = []) {
  const accepted = new Set([primaryId, ...aliases].map((item) => item.toLowerCase()));
  return (targetFormat) => accepted.has(normalizeTarget(targetFormat));
}

function createDefaultUaMatcher(matchesTarget) {
  return (userAgent, searchParams = new URLSearchParams()) => {
    const targetFormat = determineTargetFormat(userAgent, searchParams);
    return matchesTarget(targetFormat);
  };
}

/**
 * 7 套内置客户端适配器（全部采用静态字面量 await import(...) 按需懒加载）
 * @type {ClientAdapter[]}
 */
const BUILTIN_CLIENT_ADAPTERS = [
  {
    id: 'clash',
    contentType: 'application/x-yaml; charset=utf-8',
    aliases: [],
    matchesTarget: createTargetMatcher('clash'),
    match: createDefaultUaMatcher(createTargetMatcher('clash')),
    loadGenerator: () => import('./generators/builtin-clash-generator.js'),
    loadRenderer: () => import('../templates/renderers/render-clash.js'),
    async generateBuiltin(nodeList, options = {}) {
      const { generateBuiltinClashConfig } = await this.loadGenerator();
      return generateBuiltinClashConfig(nodeList, options);
    },
    async renderIniTemplate(templateText, options = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderClashFromTemplateModel } = await this.loadRenderer();
      return renderClashFromTemplateModel(model, { isChinaClient: options.isChinaClient });
    },
  },
  {
    id: 'surge',
    contentType: 'text/plain; charset=utf-8',
    aliases: [],
    matchesTarget: (targetFormat) => {
      const normalized = normalizeTarget(targetFormat);
      return normalized === 'surge' || normalized.startsWith('surge&ver=') || normalized.startsWith('surge');
    },
    match: createDefaultUaMatcher((targetFormat) => {
      const normalized = normalizeTarget(targetFormat);
      return normalized === 'surge' || normalized.startsWith('surge&ver=') || normalized.startsWith('surge');
    }),
    loadGenerator: () => import('./generators/builtin-surge-generator.js'),
    loadRenderer: () => import('../templates/renderers/render-surge.js'),
    async generateBuiltin(nodeList, options = {}) {
      const { generateBuiltinSurgeConfig } = await this.loadGenerator();
      return generateBuiltinSurgeConfig(nodeList, options);
    },
    async renderIniTemplate(templateText, options = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderSurgeFromTemplateModel } = await this.loadRenderer();
      return renderSurgeFromTemplateModel(model, options);
    },
  },
  {
    id: 'loon',
    contentType: 'text/plain; charset=utf-8',
    aliases: [],
    matchesTarget: createTargetMatcher('loon'),
    match: createDefaultUaMatcher(createTargetMatcher('loon')),
    loadGenerator: () => import('./generators/builtin-loon-generator.js'),
    loadRenderer: () => import('../templates/renderers/render-loon.js'),
    async generateBuiltin(nodeList, options = {}) {
      const { generateBuiltinLoonConfig } = await this.loadGenerator();
      return generateBuiltinLoonConfig(nodeList, options);
    },
    async renderIniTemplate(templateText, options = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderLoonFromTemplateModel } = await this.loadRenderer();
      return renderLoonFromTemplateModel(model, options);
    },
  },
  {
    id: 'quanx',
    contentType: 'text/plain; charset=utf-8',
    aliases: [],
    matchesTarget: createTargetMatcher('quanx'),
    match: createDefaultUaMatcher(createTargetMatcher('quanx')),
    loadGenerator: () => import('./generators/builtin-quanx-generator.js'),
    loadRenderer: () => import('../templates/renderers/render-quanx.js'),
    async generateBuiltin(nodeList, options = {}) {
      const { generateBuiltinQuanxConfig } = await this.loadGenerator();
      return generateBuiltinQuanxConfig(nodeList, options);
    },
    async renderIniTemplate(templateText, options = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderQuanxFromTemplateModel } = await this.loadRenderer();
      return renderQuanxFromTemplateModel(model, options);
    },
  },
  {
    id: 'singbox',
    contentType: 'application/json; charset=utf-8',
    aliases: ['sing-box'],
    matchesTarget: createTargetMatcher('singbox', ['sing-box']),
    match: createDefaultUaMatcher(createTargetMatcher('singbox', ['sing-box'])),
    loadGenerator: () => import('./generators/builtin-singbox-generator.js'),
    loadRenderer: () => import('../templates/renderers/render-singbox.js'),
    async generateBuiltin(nodeList, options = {}) {
      const { generateBuiltinSingboxConfig } = await this.loadGenerator();
      return generateBuiltinSingboxConfig(nodeList, options);
    },
    async renderIniTemplate(templateText, options = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderSingboxFromTemplateModel } = await this.loadRenderer();
      return renderSingboxFromTemplateModel(model, options);
    },
  },
  {
    id: 'egern',
    contentType: 'application/x-yaml; charset=utf-8',
    aliases: [],
    matchesTarget: createTargetMatcher('egern'),
    match: createDefaultUaMatcher(createTargetMatcher('egern')),
    loadGenerator: () => import('./generators/builtin-egern-generator.js'),
    loadRenderer: () => import('../templates/renderers/render-egern.js'),
    async generateBuiltin(nodeList, options = {}) {
      const { generateBuiltinEgernConfig } = await this.loadGenerator();
      return generateBuiltinEgernConfig(nodeList, options);
    },
    async renderIniTemplate(templateText, options = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderEgernFromTemplateModel } = await this.loadRenderer();
      return renderEgernFromTemplateModel(model, { isChinaClient: options.isChinaClient });
    },
  },
  {
    id: 'shadowrocket',
    contentType: 'text/plain; charset=utf-8',
    aliases: [],
    matchesTarget: createTargetMatcher('shadowrocket'),
    match: createDefaultUaMatcher(createTargetMatcher('shadowrocket')),
    loadGenerator: () => import('./generators/builtin-shadowrocket-generator.js'),
    loadRenderer: () => import('../templates/renderers/render-shadowrocket.js'),
    async generateBuiltin(nodeList, options = {}) {
      const { generateBuiltinShadowrocketConfig } = await this.loadGenerator();
      return generateBuiltinShadowrocketConfig(nodeList, options);
    },
    async renderIniTemplate(templateText, options = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderShadowrocketFromTemplateModel } = await this.loadRenderer();
      return renderShadowrocketFromTemplateModel(model, options);
    },
    async renderFromClashConfig(clashConfig, options = {}) {
      const { renderShadowrocketConfigFromClash } = await this.loadRenderer();
      return renderShadowrocketConfigFromClash(clashConfig, options);
    },
  },
];

/** @type {ClientAdapter[]} */
export const CLIENT_ADAPTERS = [...BUILTIN_CLIENT_ADAPTERS];
const BUILTIN_IDS = new Set(BUILTIN_CLIENT_ADAPTERS.map((item) => item.id));

/**
 * 动态注册扩展客户端适配器（插槽化扩展）
 * @param {ClientAdapter} adapter
 */
export function registerClientAdapter(adapter) {
  if (!adapter || typeof adapter.id !== 'string' || !adapter.id.trim()) {
    throw new Error('ClientAdapter must provide a non-empty id');
  }
  const index = CLIENT_ADAPTERS.findIndex((item) => item.id === adapter.id);
  if (index !== -1) {
    CLIENT_ADAPTERS[index] = adapter;
  } else {
    // 扩展适配器排在内置适配器之前，优先参与匹配
    CLIENT_ADAPTERS.unshift(adapter);
  }
  return adapter;
}

/**
 * 注销自定义客户端适配器（保护内置适配器不被误删）
 * @param {string} id
 */
export function unregisterClientAdapter(id) {
  if (!id || BUILTIN_IDS.has(id)) return false;
  const index = CLIENT_ADAPTERS.findIndex((item) => item.id === id);
  if (index === -1) return false;
  CLIENT_ADAPTERS.splice(index, 1);
  return true;
}

/**
 * 根据规范化 targetFormat 查找对应的客户端适配器
 * @param {string} targetFormat
 * @returns {ClientAdapter | null}
 */
export function getClientAdapter(targetFormat) {
  const normalized = normalizeTarget(targetFormat);
  if (!normalized) return null;
  for (const adapter of CLIENT_ADAPTERS) {
    if (typeof adapter.matchesTarget === 'function' && adapter.matchesTarget(normalized)) {
      return adapter;
    }
    if (adapter.id === normalized || adapter.aliases?.includes(normalized)) {
      return adapter;
    }
  }
  return null;
}

/**
 * 根据请求头 User-Agent 与查询参数识别并匹配最佳 ClientAdapter
 * @param {string} userAgent
 * @param {URLSearchParams} [searchParams]
 * @returns {ClientAdapter | null}
 */
export function resolveClientAdapter(userAgent, searchParams = new URLSearchParams()) {
  for (const adapter of CLIENT_ADAPTERS) {
    if (!BUILTIN_IDS.has(adapter.id) && typeof adapter.match === 'function' && adapter.match(userAgent, searchParams)) {
      return adapter;
    }
  }
  const targetFormat = determineTargetFormat(userAgent, searchParams);
  return getClientAdapter(targetFormat);
}
