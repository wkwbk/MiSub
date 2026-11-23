/**
 * 订阅转换引擎选择、Subconverter 链接构建与节点转换参数解析
 */

import { DEFAULT_SUBCONVERTER_BACKEND } from '../config.js';
import { assertPublicNetworkUrl } from '../security-utils.js';
import { isHiddifyAgent, isMetaCore } from './user-agent-utils.js';
import { DEFAULT_BUILTIN_TRANSFORM, normalizeBuiltinTransform } from '../../../shared/visual-rules-catalog.js';

export function resolveTemplateUrl(mode, value, fallbackUrl = '') {
  const normalizedMode = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  const normalizedFallback = typeof fallbackUrl === 'string' ? fallbackUrl.trim() : '';

  if (normalizedMode === 'builtin' || normalizedMode === 'visual') return '';
  if (normalizedMode === 'global') return normalizedFallback;
  if (normalizedMode === 'custom_template') {
    return normalizedValue.startsWith('custom:') ? normalizedValue : '';
  }
  if (normalizedMode === 'preset' || normalizedMode === 'custom') return normalizedValue;

  return normalizedValue;
}

export function resolveTemplateSource(value) {
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

export function resolveExternalTemplateConfigUrl(templateSource) {
  if (!templateSource || typeof templateSource !== 'object') return '';
  if (templateSource.kind !== 'remote') return '';
  return normalizeExternalTemplateConfigUrl(String(templateSource.value || '').trim());
}

export function normalizeExternalTemplateConfigUrl(input) {
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

export function normalizeSubconverterBackend(input, fallback = DEFAULT_SUBCONVERTER_BACKEND) {
  let backend = String(input || fallback || DEFAULT_SUBCONVERTER_BACKEND).trim();

  // 防止历史 UI 文案或标签被误保存为后端地址。
  if (!backend || backend.includes('后端') || backend.includes('参数')) {
    backend = fallback || DEFAULT_SUBCONVERTER_BACKEND;
  }

  // 用户只需填写 host，例如 subapi.cmliussss.net 或 api.v1.mk。
  // 兼容历史完整 URL，但统一规范为 https://<host>/sub。
  backend = backend.replace(/\s+/g, '');
  if (!/^https?:\/\//i.test(backend)) {
    backend = `https://${backend}`;
  }

  const externalUrl = assertPublicNetworkUrl(backend);
  if (externalUrl.pathname !== '/sub') {
    externalUrl.pathname = '/sub';
  }

  // 历史默认值可能保存为 /sub?；URL 会自动消除空 query。
  externalUrl.hash = '';
  return externalUrl;
}

export function buildExternalSubconverterUrl({
  backend,
  targetFormat,
  nodeList,
  requestUrl,
  profileSub = {},
  globalSub = {},
  userAgent = '',
  searchParams,
  templateSource,
  subName = '',
} = {}) {
  const externalUrl = normalizeSubconverterBackend(backend);
  const params = searchParams || new URLSearchParams('');

  // [优化] 解析 targetFormat，支持带参数的格式（如 surge&ver=4）
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

  const effectiveOptions = { ...globalSub.defaultOptions };
  if (profileSub.options && typeof profileSub.options === 'object') {
    for (const [k, v] of Object.entries(profileSub.options)) {
      if (v !== null && v !== undefined) {
        effectiveOptions[k] = v;
      }
    }
  }
  const flagMap = {
    udp: 'udp',
    emoji: 'emoji',
    scv: 'scv',
    sort: 'sort',
    tfo: 'tfo',
    list: 'list',
  };

  if (isMetaCore(userAgent, params)) {
    externalUrl.searchParams.set('meta', 'true');
  }

  Object.entries(flagMap).forEach(([key, paramName]) => {
    const val = params.has(paramName) ? params.get(paramName) === 'true' : effectiveOptions[key];
    externalUrl.searchParams.set(paramName, val ? 'true' : 'false');
  });

  const externalTemplateConfigUrl = resolveExternalTemplateConfigUrl(templateSource);
  if (externalTemplateConfigUrl) {
    externalUrl.searchParams.set('config', externalTemplateConfigUrl);
  }

  externalUrl.searchParams.set('filename', subName);
  return externalUrl;
}

export function resolveBuiltinEngineFlags(config = {}, isExternalMode = false) {
  if (isExternalMode) {
    return {
      shouldSkipCertificateVerify: false,
      shouldEnableUdp: false,
    };
  }

  return {
    shouldSkipCertificateVerify: Boolean(config.builtinSkipCertVerify),
    shouldEnableUdp: Boolean(config.builtinEnableUdp),
  };
}

export function resolveEffectiveEngine({
  searchParams,
  userAgent = '',
  profileEngineMode = '',
  globalEngineMode = '',
} = {}) {
  const params = searchParams || new URLSearchParams('');
  const builtinParam = (params.get('builtin') || '').toLowerCase();
  const engineParam = (params.get('engine') || '').toLowerCase();
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

  if (engineParam) return engineParam;
  if (builtinParam === 'external') return 'external';
  if (builtinParam === 'true' || builtinParam === '1' || builtinParam === 'builtin') return 'builtin';

  if (!hasExplicitFormat && isHiddifyAgent(userAgent)) {
    return 'builtin';
  }

  return profileEngineMode || globalEngineMode || 'builtin';
}

export function resolveBuiltinRequestOptions({ searchParams, userAgent = '' } = {}) {
  const params = searchParams || new URLSearchParams('');
  const dnsMode = params.get('dns-mode') || params.get('dnsMode') || '';
  return {
    userAgent,
    searchParams: params,
    hiddifyCompatible: isHiddifyAgent(userAgent),
    dnsMode: dnsMode.toLowerCase() === 'polluted' ? 'polluted' : 'clean',
  };
}

/**
 * 解析 profile 生效的 nodeTransform（订阅组 > 预设 > 空对象）。
 *
 * @param {Object|null} profile - 当前订阅组
 * @param {Object} config - 全局设置
 * @returns {Object} 生效的 nodeTransform（可能为空对象）
 */
export function resolveEffectiveNodeTransform(profile, config = {}) {
  const presets = Array.isArray(config?.nodeTransformPresets) ? config.nodeTransformPresets : [];
  const profileNodeTransform = profile?.nodeTransform ?? null;
  const presetId = profile?.nodeTransformPresetId || '';
  const presetNodeTransform = presetId ? presets.find((item) => item?.id === presetId)?.config : null;
  const hasProfileNodeTransform = profileNodeTransform && Object.keys(profileNodeTransform).length > 0;

  return hasProfileNodeTransform ? profileNodeTransform : presetNodeTransform || {};
}

/**
 * 解析内置生成器应使用的 addFlagEmoji 开关。
 *
 * 优先级与 subscription-service 的 shouldKeepEmoji 一致：
 *   nodeTransform.addFlagEmoji（true/false） > config.enableFlagEmoji > 默认 true
 *
 * 返回 undefined 表示两边都没显式配置，保持 url-to-clash.js 的默认行为（加国旗）。
 *
 * @param {Object|null} profile - 当前订阅组
 * @param {Object} config - 全局设置
 * @returns {boolean|undefined}
 */
export function resolveAddFlagEmoji(profile, config = {}) {
  const explicit = resolveEffectiveNodeTransform(profile, config).addFlagEmoji;
  if (explicit === true || explicit === false) return explicit;
  if (config.enableFlagEmoji === true || config.enableFlagEmoji === false) {
    return config.enableFlagEmoji;
  }
  return undefined;
}

export function shouldRenderClashYamlProfileTemplateLocally({
  isExternalMode = false,
  targetFormat = '',
  templateSource = {},
} = {}) {
  if (!isExternalMode || targetFormat !== 'clash' || templateSource?.kind !== 'remote') return false;
  try {
    const parsed = new URL(String(templateSource.value || '').trim());
    return /\.ya?ml$/i.test(parsed.pathname);
  } catch {
    return /\.ya?ml(?:[?#].*)?$/i.test(String(templateSource.value || '').trim());
  }
}

/**
 * 解析当前请求生效的内置可视化分流配置（订阅组规则覆盖 > 全局配置）。
 *
 * 规则：
 * - 无订阅组或订阅组为 global：完整继承全局 builtinTransform。
 * - 订阅组启用可视化规则（mode === 'visual' 或 mode === 'builtin' 且 profile.builtinTransform.visualRulesEnabled）：
 *   继承全局通用引擎参数（groupByCountry / includeAutoSelect / enableClashApi / baseConfig 等），
 *   但使用订阅组自身的 selectedRules / customRules / rulePreset，并开启 visualRulesEnabled。
 * - 订阅组为内置自动分流（mode === 'builtin' 且未开启 visualRulesEnabled）或规则模板模式：
 *   继承全局通用引擎参数，但强制 visualRulesEnabled = false，避免被全局可视化规则劫持。
 *
 * @param {Object|null} profile - 当前订阅组
 * @param {Object} config - 全局设置
 * @returns {Object|null}
 */
export function resolveEffectiveBuiltinTransform(profile, config = {}) {
  const hasGlobalBt = Boolean(config?.builtinTransform && typeof config.builtinTransform === 'object');
  const globalBt = hasGlobalBt ? normalizeBuiltinTransform(config.builtinTransform) : null;

  if (!profile || typeof profile !== 'object') {
    return globalBt;
  }

  const rawMode = String(profile.transformConfigMode || 'global')
    .trim()
    .toLowerCase();

  if (rawMode === 'global') {
    return globalBt;
  }

  const baseBt = globalBt || normalizeBuiltinTransform(DEFAULT_BUILTIN_TRANSFORM);
  const profileBtRaw = profile.builtinTransform && typeof profile.builtinTransform === 'object' ? profile.builtinTransform : null;
  const isProfileVisual = rawMode === 'visual' || (rawMode === 'builtin' && Boolean(profileBtRaw?.visualRulesEnabled));

  if (isProfileVisual) {
    const normalizedProfileBt = normalizeBuiltinTransform(profileBtRaw || baseBt);
    return {
      ...baseBt,
      visualRulesEnabled: true,
      rulePreset: normalizedProfileBt.rulePreset,
      selectedRules: normalizedProfileBt.selectedRules,
      customRules: normalizedProfileBt.customRules,
    };
  }

  return {
    ...baseBt,
    visualRulesEnabled: false,
  };
}
