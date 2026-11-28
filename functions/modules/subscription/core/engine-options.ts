/**
 * 订阅转换引擎选择、Subconverter 链接构建与转换执行计划解析
 */

import type {
  AdvancedBaseConfig,
  NormalizedCustomVisualRules,
  ProfileConfig,
  SettingsConfig,
  SmartPreset,
  TransformMode,
} from '@misub/core/types.js';
import { DEFAULT_SUBCONVERTER_BACKEND } from '../../config.js';
import { assertPublicNetworkUrl } from '../../security-utils.js';
import { isHiddifyAgent, isMetaCore } from './user-agent-utils.js';
import { normalizeAdvancedBaseConfig, normalizeCustomVisualRules } from '@misub/core/domain/visual-rules-catalog.js';

type TemplateSourceKind = 'none' | 'builtin' | 'custom' | 'remote';

export interface TemplateSource {
  kind: TemplateSourceKind;
  value: string;
}

export interface BuildExternalSubconverterUrlParams {
  backend?: string;
  targetFormat?: string;
  nodeList?: string;
  requestUrl?: string;
  templateUrl?: string;
  enableUdp?: boolean;
  skipCertVerify?: boolean;
  enableFlagEmoji?: boolean;
  sort?: boolean;
  tfo?: boolean;
  list?: boolean;
  userAgent?: string;
  searchParams?: URLSearchParams;
  subName?: string;
}

export interface BuiltinRequestOptions {
  userAgent: string;
  searchParams: URLSearchParams;
  hiddifyCompatible: boolean;
  dnsMode: 'clean' | 'polluted';
}

export interface ResolvedTransformFlags {
  enableUdp: boolean;
  skipCertVerify: boolean;
  enableFlagEmoji: boolean;
  enableTfo: boolean;
}

const VALID_TRANSFORM_MODES = new Set<TransformMode>(['smart', 'template', 'external']);
const VALID_SMART_PRESETS = new Set<SmartPreset>(['minimal', 'balanced', 'full']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeTransformMode(value: unknown): TransformMode | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase() as TransformMode;
  return VALID_TRANSFORM_MODES.has(normalized) ? normalized : undefined;
}

function normalizeSmartPreset(value: unknown): SmartPreset | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase() as SmartPreset;
  return VALID_SMART_PRESETS.has(normalized) ? normalized : undefined;
}

function parseQueryBool(params: URLSearchParams, key: string): boolean | undefined {
  if (!params.has(key)) return undefined;
  const val = String(params.get(key) || '')
    .trim()
    .toLowerCase();
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0') return false;
  return undefined;
}

export function resolveTemplateSource(value: unknown): TemplateSource {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  if (!normalizedValue) return { kind: 'none', value: '' };
  if (normalizedValue.startsWith('builtin:')) {
    return { kind: 'builtin', value: normalizedValue.slice('builtin:'.length) };
  }
  if (normalizedValue.startsWith('custom:')) {
    return { kind: 'custom', value: normalizedValue.slice('custom:'.length) };
  }
  return { kind: 'remote', value: normalizedValue };
}

export function resolveExternalTemplateConfigUrl(templateSource: Partial<TemplateSource> | null | undefined): string {
  if (!templateSource || typeof templateSource !== 'object') return '';
  if (templateSource.kind !== 'remote') return '';
  return normalizeExternalTemplateConfigUrl(String(templateSource.value || '').trim());
}

function normalizeExternalTemplateConfigUrl(input: unknown): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (parsed.hostname.toLowerCase() !== 'github.com') {
      return raw;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    const markerIndex = parts.findIndex((part) => part === 'blob' || part === 'raw');
    if (parts.length < 5 || markerIndex !== 2) {
      return raw;
    }

    const [owner, repo, , branch, ...fileParts] = parts;
    if (!owner || !repo || !branch || fileParts.length === 0) {
      return raw;
    }

    const rawUrl = new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${fileParts.join('/')}`);
    rawUrl.search = parsed.search;
    return rawUrl.toString();
  } catch {
    return raw;
  }
}

export function normalizeSubconverterBackend(
  input: string | null | undefined,
  fallback = DEFAULT_SUBCONVERTER_BACKEND,
): URL {
  let backend = String(input || fallback || DEFAULT_SUBCONVERTER_BACKEND).trim();

  if (!backend || backend.includes('后端') || backend.includes('参数')) {
    backend = fallback || DEFAULT_SUBCONVERTER_BACKEND;
  }

  backend = backend.replace(/\s+/g, '');
  if (!/^https?:\/\//i.test(backend)) {
    backend = `https://${backend}`;
  }

  const externalUrl = assertPublicNetworkUrl(backend);
  if (externalUrl.pathname !== '/sub') {
    externalUrl.pathname = '/sub';
  }

  externalUrl.hash = '';
  return externalUrl;
}

export function buildExternalSubconverterUrl({
  backend,
  targetFormat,
  nodeList,
  requestUrl,
  templateUrl = '',
  enableUdp = true,
  skipCertVerify = false,
  enableFlagEmoji = true,
  sort = false,
  tfo = false,
  list = false,
  userAgent = '',
  searchParams,
  subName = '',
}: BuildExternalSubconverterUrlParams = {}): URL {
  const externalUrl = normalizeSubconverterBackend(backend);
  const params = searchParams || new URLSearchParams('');

  const [targetBase, ...targetParams] = String(targetFormat || '').split('&');
  externalUrl.searchParams.set('target', targetBase || 'clash');
  targetParams.forEach((p) => {
    const [k, v] = p.split('=');
    if (k && v) externalUrl.searchParams.set(k, v);
  });

  if (requestUrl) {
    const dataSourceUrl = new URL(requestUrl);
    const paramsToClear = [
      'target',
      'mode',
      'preset',
      'relay',
      'level',
      'engine',
      'builtin',
      'clash',
      'singbox',
      'surge',
      'loon',
      'quanx',
      'egern',
      'base64',
      'v2ray',
      'trojan',
      'nodes',
      'list',
      'backend',
      'refresh',
      'nocache',
      'debug',
    ];
    paramsToClear.forEach((p) => dataSourceUrl.searchParams.delete(p));
    dataSourceUrl.searchParams.set('base64', '');
    dataSourceUrl.searchParams.set('callback_token', 'external');
    externalUrl.searchParams.set('url', dataSourceUrl.toString());
  } else {
    const normalizedNodeList = String(nodeList || '').trim();
    if (normalizedNodeList) {
      const inlineNodeList = normalizedNodeList
        .split(/\r?\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join('|');
      externalUrl.searchParams.set('url', inlineNodeList);
    }
  }

  if (isMetaCore(userAgent, params)) {
    externalUrl.searchParams.set('meta', 'true');
  }

  const flagValues: Record<string, boolean> = {
    udp: Boolean(enableUdp),
    emoji: Boolean(enableFlagEmoji),
    scv: Boolean(skipCertVerify),
    sort: Boolean(sort),
    tfo: Boolean(tfo),
    list: Boolean(list),
  };

  Object.entries(flagValues).forEach(([paramName, defaultVal]) => {
    const val = params.has(paramName) ? params.get(paramName) === 'true' : defaultVal;
    externalUrl.searchParams.set(paramName, val ? 'true' : 'false');
  });

  const resolvedConfigUrl = resolveExternalTemplateConfigUrl(resolveTemplateSource(templateUrl));
  if (resolvedConfigUrl) {
    externalUrl.searchParams.set('config', resolvedConfigUrl);
  }

  externalUrl.searchParams.set('filename', subName);
  return externalUrl;
}

export function resolveBuiltinRequestOptions({
  searchParams,
  userAgent = '',
}: {
  searchParams?: URLSearchParams;
  userAgent?: string;
} = {}): BuiltinRequestOptions {
  const params = searchParams || new URLSearchParams('');
  const dnsMode = params.get('dns-mode') || params.get('dnsMode') || '';
  return {
    userAgent,
    searchParams: params,
    hiddifyCompatible: isHiddifyAgent(userAgent),
    dnsMode: dnsMode.toLowerCase() === 'polluted' ? 'polluted' : 'clean',
  };
}

export function resolveEffectiveNodeTransform(
  profile: (Partial<ProfileConfig> & Record<string, unknown>) | null | undefined,
  config: Partial<SettingsConfig> & Record<string, unknown> = {},
): Record<string, unknown> {
  const presets = Array.isArray(config?.nodeTransformPresets)
    ? (config.nodeTransformPresets as Array<{ id?: string; config?: Record<string, unknown> }>)
    : [];
  const profileNodeTransform =
    profile?.nodeTransform && typeof profile.nodeTransform === 'object'
      ? (profile.nodeTransform as Record<string, unknown>)
      : null;
  const presetId = typeof profile?.nodeTransformPresetId === 'string' ? profile.nodeTransformPresetId : '';
  const presetNodeTransform = presetId ? presets.find((item) => item?.id === presetId)?.config : null;
  const hasProfileNodeTransform = profileNodeTransform && Object.keys(profileNodeTransform).length > 0;

  return hasProfileNodeTransform ? profileNodeTransform : presetNodeTransform || {};
}

export function resolveAddFlagEmoji(
  profile: (Partial<ProfileConfig> & Record<string, unknown>) | null | undefined,
  config: Partial<SettingsConfig> & Record<string, unknown> = {},
): boolean | undefined {
  const explicit = resolveEffectiveNodeTransform(profile, config).addFlagEmoji;
  if (explicit === true || explicit === false) return explicit;
  if (config.enableFlagEmoji === true || config.enableFlagEmoji === false) {
    return config.enableFlagEmoji;
  }
  return undefined;
}

export type TransformPlan =
  | {
      mode: 'external';
      backend: string;
      templateUrl: string;
      templateSource: TemplateSource;
      sort: boolean;
      tfo: boolean;
      list: boolean;
      enableRelay: boolean;
      flags: ResolvedTransformFlags;
    }
  | {
      mode: 'template';
      templateSource: TemplateSource;
      smartPreset: SmartPreset;
      enableRelay: boolean;
      customVisualRules: NormalizedCustomVisualRules;
      advancedBaseConfig: AdvancedBaseConfig;
      flags: ResolvedTransformFlags;
    }
  | {
      mode: 'smart';
      smartPreset: SmartPreset;
      enableRelay: boolean;
      customVisualRules: NormalizedCustomVisualRules;
      advancedBaseConfig: AdvancedBaseConfig;
      templateSource: TemplateSource;
      flags: ResolvedTransformFlags;
    };

/**
 * 按 URL 参数 > 订阅组覆写 > 全局配置 的优先级解析订阅转换执行计划与通用开关。
 */
export function resolveTransformPlan({
  searchParams,
  userAgent = '',
  profile = null,
  config = {},
}: {
  searchParams?: URLSearchParams;
  userAgent?: string;
  targetFormat?: string;
  profile?: (Partial<ProfileConfig> & Record<string, unknown>) | null;
  config?: Partial<SettingsConfig> & Record<string, unknown>;
} = {}): TransformPlan {
  const params = searchParams || new URLSearchParams('');

  const profileUdp = typeof profile?.enableUdp === 'boolean' ? profile.enableUdp : undefined;
  const profileScv = typeof profile?.skipCertVerify === 'boolean' ? profile.skipCertVerify : undefined;
  const globalUdp = typeof config?.enableUdp === 'boolean' ? config.enableUdp : true;
  const globalScv = typeof config?.skipCertVerify === 'boolean' ? config.skipCertVerify : false;
  const resolvedEmoji = resolveAddFlagEmoji(profile, config);

  const flags: ResolvedTransformFlags = {
    enableUdp: parseQueryBool(params, 'udp') ?? profileUdp ?? globalUdp,
    skipCertVerify: parseQueryBool(params, 'scv') ?? profileScv ?? globalScv,
    enableFlagEmoji: parseQueryBool(params, 'emoji') ?? (typeof resolvedEmoji === 'boolean' ? resolvedEmoji : true),
    enableTfo: parseQueryBool(params, 'tfo') ?? false,
  };

  const profileMode = normalizeTransformMode(profile?.transformMode);
  const globalMode = normalizeTransformMode(config?.transformMode);

  const rawModeParam = normalizeTransformMode(params.get('mode'));
  const rawEngineParam = (params.get('engine') || '').trim().toLowerCase();
  const rawBuiltinParam = (params.get('builtin') || '').trim().toLowerCase();
  const hasExplicitFormat = Boolean(
    params.get('target') ||
    params.has('clash') ||
    params.has('singbox') ||
    params.has('surge') ||
    params.has('loon') ||
    params.has('quanx') ||
    params.has('egern') ||
    params.has('base64') ||
    params.has('v2ray') ||
    params.has('trojan') ||
    params.has('nodes'),
  );

  let mode: TransformMode;
  if (rawModeParam) {
    mode = rawModeParam;
  } else if (rawEngineParam === 'external' || rawBuiltinParam === 'external') {
    mode = 'external';
  } else if (
    rawEngineParam === 'builtin' ||
    rawBuiltinParam === 'true' ||
    rawBuiltinParam === '1' ||
    rawBuiltinParam === 'builtin'
  ) {
    const baseMode = profileMode || globalMode || 'smart';
    mode = baseMode === 'external' ? 'smart' : baseMode;
  } else {
    mode = profileMode || globalMode || 'smart';
    if (!hasExplicitFormat && isHiddifyAgent(userAgent) && mode === 'external') {
      mode = 'smart';
    }
  }

  const advancedBaseConfig = normalizeAdvancedBaseConfig(config?.advancedBaseConfig);
  const queryPreset = normalizeSmartPreset(params.get('preset'));
  const profilePreset = profileMode === 'smart' ? normalizeSmartPreset(profile?.smartPreset) : undefined;
  const globalPreset = normalizeSmartPreset(config?.smartPreset);
  const smartPreset: SmartPreset = queryPreset || profilePreset || globalPreset || 'balanced';

  const queryRelayParam = parseQueryBool(params, 'relay');
  const queryLevelRelay = (params.get('level') || '').trim().toLowerCase() === 'relay' ? true : undefined;
  const queryEnableRelay = queryRelayParam ?? queryLevelRelay;
  const profileEnableRelay = typeof profile?.enableRelay === 'boolean' ? profile.enableRelay : undefined;
  const globalEnableRelay = config?.enableRelay === true;
  const enableRelay = queryEnableRelay ?? profileEnableRelay ?? globalEnableRelay;

  const globalCvrRaw = (isRecord(config?.customVisualRules) ? config.customVisualRules : {}) as Record<string, unknown>;
  const useProfileCvr = profileMode === 'smart' && isRecord(profile?.customVisualRules);
  const rawCvrSource: Record<string, unknown> = queryPreset
    ? {
        groupByCountry: globalCvrRaw.groupByCountry,
        includeAutoSelect: globalCvrRaw.includeAutoSelect,
        customRules: useProfileCvr
          ? (profile!.customVisualRules as Record<string, unknown>).customRules
          : globalCvrRaw.customRules,
      }
    : useProfileCvr
      ? {
          groupByCountry: globalCvrRaw.groupByCountry,
          includeAutoSelect: globalCvrRaw.includeAutoSelect,
          ...(profile!.customVisualRules as Record<string, unknown>),
        }
      : profilePreset
        ? {
            groupByCountry: globalCvrRaw.groupByCountry,
            includeAutoSelect: globalCvrRaw.includeAutoSelect,
            customRules: globalCvrRaw.customRules,
          }
        : globalCvrRaw;
  const customVisualRules = normalizeCustomVisualRules(rawCvrSource, { smartPreset });

  if (mode === 'external') {
    const useProfileExternal = profileMode === 'external';
    const profileExt = (isRecord(profile?.externalBackend) ? profile.externalBackend : {}) as Record<string, unknown>;
    const globalExt = (isRecord(config?.externalBackend) ? config.externalBackend : {}) as Record<string, unknown>;

    const backend = String(
      params.get('backend') || (useProfileExternal ? profileExt.url : '') || globalExt.url || '',
    ).trim();
    const templateUrl = String(
      params.get('config') || (useProfileExternal ? profileExt.templateUrl : '') || globalExt.templateUrl || '',
    ).trim();
    const sort =
      parseQueryBool(params, 'sort') ??
      (useProfileExternal && typeof profileExt.sort === 'boolean' ? profileExt.sort : Boolean(globalExt.sort));
    const tfo =
      parseQueryBool(params, 'tfo') ??
      (useProfileExternal && typeof profileExt.tfo === 'boolean' ? profileExt.tfo : Boolean(globalExt.tfo));
    const list =
      parseQueryBool(params, 'list') ??
      (useProfileExternal && typeof profileExt.list === 'boolean' ? profileExt.list : Boolean(globalExt.list));

    return {
      mode: 'external',
      backend,
      templateUrl,
      templateSource: resolveTemplateSource(templateUrl),
      sort,
      tfo,
      list,
      enableRelay,
      flags,
    };
  }

  if (mode === 'template') {
    const rawTemplate =
      profileMode === 'template'
        ? String(profile?.templateConfig || '').trim()
        : String(config?.templateConfig || '').trim();
    return {
      mode: 'template',
      templateSource: resolveTemplateSource(rawTemplate),
      smartPreset,
      enableRelay,
      customVisualRules,
      advancedBaseConfig,
      flags,
    };
  }

  return {
    mode: 'smart',
    smartPreset,
    enableRelay,
    customVisualRules,
    advancedBaseConfig,
    templateSource: { kind: 'none', value: '' },
    flags,
  };
}
