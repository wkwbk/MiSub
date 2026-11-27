import type { BuiltinGeneratorOptions } from '../core/client-shared.js';
import { determineTargetFormat } from '../core/user-agent-utils.js';
import type { ShadowrocketClashSource } from '../templates/template-model.js';
import { buildOptimizedIniTemplateModel, type BuildOptimizedIniTemplateOptions } from '../templates/template-pipeline-core.js';

export type ClientAdapterOptions = BuiltinGeneratorOptions & BuildOptimizedIniTemplateOptions;

/**
 * 客户端适配器统一契约（按需动态加载 Generator 与 Template Renderer，降低 Worker 冷启动解析开销）
 */
export interface ClientAdapter {
  id: string;
  contentType: string;
  aliases?: string[];
  match: (userAgent: string, searchParams?: URLSearchParams) => boolean;
  matchesTarget: (targetFormat: string) => boolean;
  loadGenerator: () => Promise<object>;
  loadRenderer: () => Promise<object>;
  generateBuiltin: (nodeList: string, options?: ClientAdapterOptions) => Promise<string>;
  renderIniTemplate: (templateText: string, options?: ClientAdapterOptions) => Promise<string>;
  renderFromClashConfig?: (clashConfig: ShadowrocketClashSource, options?: ClientAdapterOptions) => Promise<string>;
}

const loadClashGenerator = () => import('./generators/builtin-clash-generator.js');
const loadClashRenderer = () => import('../templates/renderers/render-clash.js');
const loadSurgeGenerator = () => import('./generators/builtin-surge-generator.js');
const loadSurgeRenderer = () => import('../templates/renderers/render-surge.js');
const loadLoonGenerator = () => import('./generators/builtin-loon-generator.js');
const loadLoonRenderer = () => import('../templates/renderers/render-loon.js');
const loadQuanxGenerator = () => import('./generators/builtin-quanx-generator.js');
const loadQuanxRenderer = () => import('../templates/renderers/render-quanx.js');
const loadSingboxGenerator = () => import('./generators/builtin-singbox-generator.js');
const loadSingboxRenderer = () => import('../templates/renderers/render-singbox.js');
const loadEgernGenerator = () => import('./generators/builtin-egern-generator.js');
const loadEgernRenderer = () => import('../templates/renderers/render-egern.js');
const loadShadowrocketGenerator = () => import('./generators/builtin-shadowrocket-generator.js');
const loadShadowrocketRenderer = () => import('../templates/renderers/render-shadowrocket.js');

function normalizeTarget(targetFormat: unknown): string {
  return String(targetFormat || '')
    .trim()
    .toLowerCase();
}

function createTargetMatcher(primaryId: string, aliases: string[] = []): (targetFormat: string) => boolean {
  const accepted = new Set([primaryId, ...aliases].map((item) => item.toLowerCase()));
  return (targetFormat: string) => accepted.has(normalizeTarget(targetFormat));
}

function createDefaultUaMatcher(
  matchesTarget: (targetFormat: string) => boolean,
): (userAgent: string, searchParams?: URLSearchParams) => boolean {
  return (userAgent: string, searchParams: URLSearchParams = new URLSearchParams()) => {
    const targetFormat = determineTargetFormat(userAgent, searchParams);
    return matchesTarget(targetFormat);
  };
}

/**
 * 7 套内置客户端适配器（全部采用静态字面量 await import(...) 按需懒加载）
 */
const BUILTIN_CLIENT_ADAPTERS: ClientAdapter[] = [
  {
    id: 'clash',
    contentType: 'application/x-yaml; charset=utf-8',
    aliases: [],
    matchesTarget: createTargetMatcher('clash'),
    match: createDefaultUaMatcher(createTargetMatcher('clash')),
    loadGenerator: loadClashGenerator,
    loadRenderer: loadClashRenderer,
    async generateBuiltin(nodeList: string, options: ClientAdapterOptions = {}) {
      const { generateBuiltinClashConfig } = await (this.loadGenerator as typeof loadClashGenerator)();
      return generateBuiltinClashConfig(nodeList, options);
    },
    async renderIniTemplate(templateText: string, options: ClientAdapterOptions = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderClashFromTemplateModel } = await (this.loadRenderer as typeof loadClashRenderer)();
      return renderClashFromTemplateModel(model, {
        isChinaClient: options.isChinaClient,
        multiSocks: options.multiSocks,
      });
    },
  },
  {
    id: 'surge',
    contentType: 'text/plain; charset=utf-8',
    aliases: [],
    matchesTarget: (targetFormat: string) => {
      const normalized = normalizeTarget(targetFormat);
      return normalized === 'surge' || normalized.startsWith('surge&ver=') || normalized.startsWith('surge');
    },
    match: createDefaultUaMatcher((targetFormat: string) => {
      const normalized = normalizeTarget(targetFormat);
      return normalized === 'surge' || normalized.startsWith('surge&ver=') || normalized.startsWith('surge');
    }),
    loadGenerator: loadSurgeGenerator,
    loadRenderer: loadSurgeRenderer,
    async generateBuiltin(nodeList: string, options: ClientAdapterOptions = {}) {
      const { generateBuiltinSurgeConfig } = await (this.loadGenerator as typeof loadSurgeGenerator)();
      return generateBuiltinSurgeConfig(nodeList, options);
    },
    async renderIniTemplate(templateText: string, options: ClientAdapterOptions = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderSurgeFromTemplateModel } = await (this.loadRenderer as typeof loadSurgeRenderer)();
      return renderSurgeFromTemplateModel(model, options);
    },
  },
  {
    id: 'loon',
    contentType: 'text/plain; charset=utf-8',
    aliases: [],
    matchesTarget: createTargetMatcher('loon'),
    match: createDefaultUaMatcher(createTargetMatcher('loon')),
    loadGenerator: loadLoonGenerator,
    loadRenderer: loadLoonRenderer,
    async generateBuiltin(nodeList: string, options: ClientAdapterOptions = {}) {
      const { generateBuiltinLoonConfig } = await (this.loadGenerator as typeof loadLoonGenerator)();
      return generateBuiltinLoonConfig(nodeList, options);
    },
    async renderIniTemplate(templateText: string, options: ClientAdapterOptions = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderLoonFromTemplateModel } = await (this.loadRenderer as typeof loadLoonRenderer)();
      return renderLoonFromTemplateModel(model, options);
    },
  },
  {
    id: 'quanx',
    contentType: 'text/plain; charset=utf-8',
    aliases: [],
    matchesTarget: createTargetMatcher('quanx'),
    match: createDefaultUaMatcher(createTargetMatcher('quanx')),
    loadGenerator: loadQuanxGenerator,
    loadRenderer: loadQuanxRenderer,
    async generateBuiltin(nodeList: string, options: ClientAdapterOptions = {}) {
      const { generateBuiltinQuanxConfig } = await (this.loadGenerator as typeof loadQuanxGenerator)();
      return generateBuiltinQuanxConfig(nodeList, options);
    },
    async renderIniTemplate(templateText: string, options: ClientAdapterOptions = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderQuanxFromTemplateModel } = await (this.loadRenderer as typeof loadQuanxRenderer)();
      return renderQuanxFromTemplateModel(model, options);
    },
  },
  {
    id: 'singbox',
    contentType: 'application/json; charset=utf-8',
    aliases: ['sing-box'],
    matchesTarget: createTargetMatcher('singbox', ['sing-box']),
    match: createDefaultUaMatcher(createTargetMatcher('singbox', ['sing-box'])),
    loadGenerator: loadSingboxGenerator,
    loadRenderer: loadSingboxRenderer,
    async generateBuiltin(nodeList: string, options: ClientAdapterOptions = {}) {
      const { generateBuiltinSingboxConfig } = await (this.loadGenerator as typeof loadSingboxGenerator)();
      return generateBuiltinSingboxConfig(nodeList, options);
    },
    async renderIniTemplate(templateText: string, options: ClientAdapterOptions = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderSingboxFromTemplateModel } = await (this.loadRenderer as typeof loadSingboxRenderer)();
      return renderSingboxFromTemplateModel(model, options);
    },
  },
  {
    id: 'egern',
    contentType: 'application/x-yaml; charset=utf-8',
    aliases: [],
    matchesTarget: createTargetMatcher('egern'),
    match: createDefaultUaMatcher(createTargetMatcher('egern')),
    loadGenerator: loadEgernGenerator,
    loadRenderer: loadEgernRenderer,
    async generateBuiltin(nodeList: string, options: ClientAdapterOptions = {}) {
      const { generateBuiltinEgernConfig } = await (this.loadGenerator as typeof loadEgernGenerator)();
      return generateBuiltinEgernConfig(nodeList, options);
    },
    async renderIniTemplate(templateText: string, options: ClientAdapterOptions = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderEgernFromTemplateModel } = await (this.loadRenderer as typeof loadEgernRenderer)();
      return renderEgernFromTemplateModel(model, { isChinaClient: options.isChinaClient });
    },
  },
  {
    id: 'shadowrocket',
    contentType: 'text/plain; charset=utf-8',
    aliases: [],
    matchesTarget: createTargetMatcher('shadowrocket'),
    match: createDefaultUaMatcher(createTargetMatcher('shadowrocket')),
    loadGenerator: loadShadowrocketGenerator,
    loadRenderer: loadShadowrocketRenderer,
    async generateBuiltin(nodeList: string, options: ClientAdapterOptions = {}) {
      const { generateBuiltinShadowrocketConfig } = await (this.loadGenerator as typeof loadShadowrocketGenerator)();
      return generateBuiltinShadowrocketConfig(nodeList, options);
    },
    async renderIniTemplate(templateText: string, options: ClientAdapterOptions = {}) {
      const model = buildOptimizedIniTemplateModel(templateText, options);
      const { renderShadowrocketFromTemplateModel } = await (this.loadRenderer as typeof loadShadowrocketRenderer)();
      return renderShadowrocketFromTemplateModel(model, options);
    },
    async renderFromClashConfig(clashConfig: ShadowrocketClashSource, options: ClientAdapterOptions = {}) {
      const { renderShadowrocketConfigFromClash } = await (this.loadRenderer as typeof loadShadowrocketRenderer)();
      return renderShadowrocketConfigFromClash(clashConfig, options);
    },
  },
];

export const CLIENT_ADAPTERS: ClientAdapter[] = [...BUILTIN_CLIENT_ADAPTERS];
const BUILTIN_IDS = new Set(BUILTIN_CLIENT_ADAPTERS.map((item) => item.id));

/**
 * 动态注册扩展客户端适配器（插槽化扩展）
 */
export function registerClientAdapter(adapter: ClientAdapter): ClientAdapter {
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
 */
export function unregisterClientAdapter(id: string): boolean {
  if (!id || BUILTIN_IDS.has(id)) return false;
  const index = CLIENT_ADAPTERS.findIndex((item) => item.id === id);
  if (index === -1) return false;
  CLIENT_ADAPTERS.splice(index, 1);
  return true;
}

/**
 * 根据规范化 targetFormat 查找对应的客户端适配器
 */
export function getClientAdapter(targetFormat: string): ClientAdapter | null {
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
 */
export function resolveClientAdapter(
  userAgent: string,
  searchParams: URLSearchParams = new URLSearchParams(),
): ClientAdapter | null {
  for (const adapter of CLIENT_ADAPTERS) {
    if (!BUILTIN_IDS.has(adapter.id) && typeof adapter.match === 'function' && adapter.match(userAgent, searchParams)) {
      return adapter;
    }
  }
  const targetFormat = determineTargetFormat(userAgent, searchParams);
  return getClientAdapter(targetFormat);
}
