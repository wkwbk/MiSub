import type { ClashProxy, SettingsConfig } from '@misub/core/types.js';
import type { BoundRequestContext, StorageAdapter } from '../types.js';
import type { ClashChainConfig } from '../modules/subscription/core/mihomo-chain-proxy.js';
import type { ChainProxyConfig, TemplateProxy } from '../modules/subscription/templates/template-model.js';
import {
  buildMihomoSocksListeners,
  buildMultiSocksBindings,
  type EffectiveMultiSocksConfig,
} from '@misub/core/domain/multi-socks.js';
import { deduplicateProxyNames, sanitizeClashProxiesForOutput } from '../modules/subscription/core/client-shared.js';
import { GEOX_URLS } from '../modules/subscription/templates/builtin-rules-provider.js';
import { generateCombinedNodeList, type SubscriptionSourceItem } from './subscription-service.js';
import { getClientAdapter } from '../modules/subscription/adapters/adapter-registry.js';
import {
  loadShadowrocketRuleBundle,
  usesShadowrocketRuleBundle,
} from '../modules/subscription/core/shadowrocket-rule-bundle.js';
import { getBuiltinTemplate } from '../modules/subscription/templates/builtin-template-registry.js';
import { fetchTransformTemplate } from '../modules/subscription/cache/transform-template-cache.js';
import { resolveRuleTemplateSource } from '../modules/handlers/rule-template-handler.js';
import { base64EncodeUtf8 } from '../modules/utils.js';
import * as yaml from 'js-yaml';
import { urlsToClashProxies } from '@misub/core/protocols/url-to-clash.js';
import { resolveSafeDnsConfig } from '../modules/subscription/security/safe-dns.js';
import { applyMihomoChainProxyToClashConfig } from '../modules/subscription/core/mihomo-chain-proxy.js';

export interface TemplateSourceDescriptor {
  kind?: string;
  value?: string;
}

export interface TemplateEntryLike {
  format?: string;
  content?: string;
}

export interface ProcessNodesParams {
  userAgent: string;
  targetMisubs: SubscriptionSourceItem[];
  prependedContent?: string;
  generationSettings?: Record<string, unknown> | null;
  isDebugToken?: boolean;
  shouldSkipCertVerify?: boolean;
}

export interface RenderOutputBuiltinOptions {
  hiddifyCompatible?: boolean;
  injectSmartGroups?: boolean;
  enableRelay?: boolean;
  interval?: number;
  skipCertVerify?: boolean;
  enableUdp?: boolean;
  enableTfo?: boolean;
  addFlagEmoji?: boolean;
  regionOverrides?: Record<string, unknown>;
  isMeta?: boolean;
  customDnsOverride?: string;
  dnsMode?: string;
  isChinaClient?: boolean;
  preferredProxyKeys?: string[];
  compactNames?: boolean;
  multiSocks?: EffectiveMultiSocksConfig | null;
  [key: string]: unknown;
}

export interface RenderOutputOptions {
  targetFormat: string;
  combinedNodeList: string;
  subName?: string;
  config?: Partial<SettingsConfig> & Record<string, unknown>;
  builtinOptions?: RenderOutputBuiltinOptions;
  templateSource?: TemplateSourceDescriptor;
  managedConfigUrl?: string;
  storageAdapter?: StorageAdapter;
  userInfoHeader?: string;
  ruleBundleContext?: Record<string, unknown>;
}

export interface RenderOutputResult {
  content: string;
  contentType: string;
  headers: Record<string, string>;
  fileName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getTemplateExtension(templateUrl: unknown): string {
  const raw = typeof templateUrl === 'string' ? templateUrl.trim() : '';
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    return parsed.pathname.split('/').pop()?.split('.').pop()?.toLowerCase() || '';
  } catch {
    const cleanPath = raw.split('#')[0].split('?')[0];
    return cleanPath.split('/').pop()?.split('.').pop()?.toLowerCase() || '';
  }
}

export function isIniTemplateSource(
  templateSource: TemplateSourceDescriptor | null | undefined,
  builtinTemplateEntry: TemplateEntryLike | null = null,
): boolean {
  if (builtinTemplateEntry?.format === 'ini') return true;
  if (templateSource?.kind === 'custom') return true;
  return getTemplateExtension(templateSource?.value) === 'ini';
}

export function isClashYamlProfileTemplate(templateText: unknown): boolean {
  if (typeof templateText !== 'string' || templateText.trim() === '') return false;

  try {
    const parsed = yaml.load(templateText);
    return Boolean(isRecord(parsed) && Array.isArray(parsed['proxy-groups']) && Array.isArray(parsed.rules));
  } catch {
    return false;
  }
}

/**
 * Extract the MiSub-only YAML chain declaration and normalize it to the unified model.
 *
 * Example:
 * x-misub-chain-proxy:
 *   entry-group: 🔗 链式前置
 *   landing-group: 🔗 链式落地
 *   clone-prefix: "🔗 链式落地|"
 */
function normalizeYamlChainConfigs(config: Record<string, unknown>): ChainProxyConfig[] {
  const rawDeclaration = config['x-misub-chain-proxy'];
  delete config['x-misub-chain-proxy'];

  let declarations: unknown[] = [];
  if (Array.isArray(rawDeclaration)) {
    declarations = rawDeclaration;
  } else if (rawDeclaration && typeof rawDeclaration === 'object') {
    declarations = [rawDeclaration];
  }

  return declarations
    .filter((declaration): declaration is Record<string, unknown> => isRecord(declaration))
    .map((declaration) => ({
      ...declaration,
      group: (declaration.group ?? declaration['landing-group']) as string | undefined,
      entry: (declaration.entry ?? declaration['entry-group']) as string | undefined,
      prefix: (declaration.prefix ?? declaration['clone-prefix']) as string | undefined,
    }));
}

function renderClashYamlProfileTemplate(
  templateText: string,
  nodeList: string,
  options: RenderOutputBuiltinOptions = {},
): string {
  const loaded = yaml.load(templateText);
  if (!isRecord(loaded)) {
    return '';
  }
  const config: ClashChainConfig = { ...loaded };

  const nodeUrls = String(nodeList || '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const rawProxies = urlsToClashProxies(nodeUrls, options);
  deduplicateProxyNames(rawProxies);

  const multiSocksListeners = options.multiSocks?.enabled
    ? buildMihomoSocksListeners(buildMultiSocksBindings(rawProxies, options.multiSocks))
    : [];
  const proxies = sanitizeClashProxiesForOutput(
    rawProxies as Array<ClashProxy & Record<string, unknown>>,
  ) as unknown as TemplateProxy[];

  const chainConfigs = normalizeYamlChainConfigs(config);
  config.proxies = proxies;
  if (chainConfigs.length > 0) {
    applyMihomoChainProxyToClashConfig(config, {
      chainConfigs,
      enableDialerProxy: Boolean(options.isMeta),
    });
  }

  const allowLanMultiSocks = Boolean(options.multiSocks?.enabled && options.multiSocks.listen === '0.0.0.0');

  return yaml.dump(
    {
      ...config,
      'allow-lan': allowLanMultiSocks,
      'bind-address': allowLanMultiSocks ? '*' : '127.0.0.1',
      ipv6: false,
      'unified-delay': config['unified-delay'] ?? true,
      'tcp-concurrent': config['tcp-concurrent'] ?? true,
      'geodata-mode': config['geodata-mode'] ?? true,
      'geodata-loader': config['geodata-loader'] ?? 'memconservative',
      'geox-url': config['geox-url'] ?? { ...GEOX_URLS },
      'external-controller': '127.0.0.1:9090',
      dns: resolveSafeDnsConfig(config.dns, {
        mode: options.dnsMode,
        proxyGroup: '🌐 DNS 出口',
      }),
      proxies: config.proxies,
      ...(multiSocksListeners.length > 0 ? { listeners: multiSocksListeners } : {}),
    },
    {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    },
  );
}

export class ProcessorService {
  static async processNodes(
    context: BoundRequestContext,
    config: Partial<SettingsConfig> & Record<string, unknown>,
    params: ProcessNodesParams,
  ): Promise<string> {
    const { userAgent, targetMisubs, prependedContent, generationSettings, isDebugToken, shouldSkipCertVerify } =
      params;

    const combinedNodeList = await generateCombinedNodeList(
      context,
      { ...config, enableAccessLog: false },
      userAgent,
      targetMisubs,
      prependedContent,
      generationSettings,
      isDebugToken,
      shouldSkipCertVerify,
    );

    return combinedNodeList;
  }

  static async renderOutput(options: RenderOutputOptions): Promise<RenderOutputResult> {
    const {
      targetFormat,
      combinedNodeList,
      subName,
      config = {},
      builtinOptions = {},
      templateSource = { kind: 'none', value: '' },
      managedConfigUrl,
      storageAdapter,
      userInfoHeader,
      ruleBundleContext,
    } = options || {};

    if (targetFormat === 'base64') {
      return {
        content: base64EncodeUtf8(combinedNodeList),
        contentType: 'text/plain; charset=utf-8',
        headers: userInfoHeader ? { 'Subscription-Userinfo': userInfoHeader } : {},
      };
    }

    const adapter = getClientAdapter(targetFormat);
    const builtinProxyContent = adapter
      ? await adapter.generateBuiltin(combinedNodeList, {
          ...builtinOptions,
          managedConfigUrl,
        })
      : null;

    if (!adapter || !builtinProxyContent) {
      return {
        content: base64EncodeUtf8(combinedNodeList),
        contentType: 'text/plain; charset=utf-8',
        headers: userInfoHeader ? { 'Subscription-Userinfo': userInfoHeader } : {},
      };
    }

    let finalContent = builtinProxyContent;
    let contentType = 'text/plain; charset=utf-8';
    const headers: Record<string, string> = userInfoHeader ? { 'Subscription-Userinfo': userInfoHeader } : {};

    const shouldApplyTemplate = !builtinOptions.hiddifyCompatible;
    const builtinTemplateEntry =
      shouldApplyTemplate && templateSource.kind === 'builtin' ? getBuiltinTemplate(templateSource.value || '') : null;
    const customTemplateEntry =
      shouldApplyTemplate && templateSource.kind === 'custom' && storageAdapter
        ? await resolveRuleTemplateSource(storageAdapter, templateSource)
        : null;
    const remoteTemplateUrl = shouldApplyTemplate && templateSource.kind === 'remote' ? templateSource.value || '' : '';

    if (builtinTemplateEntry || customTemplateEntry || remoteTemplateUrl) {
      const templateText =
        builtinTemplateEntry?.content ||
        customTemplateEntry?.content ||
        (await fetchTransformTemplate(storageAdapter, remoteTemplateUrl));
      const isIniTemplate = isIniTemplateSource(templateSource, builtinTemplateEntry || customTemplateEntry);

      if (templateText && isIniTemplate) {
        const isCustomOrRemoteTemplate = templateSource.kind === 'custom' || templateSource.kind === 'remote';
        const renderParams = {
          nodeList: combinedNodeList,
          fileName: subName,
          targetFormat,
          injectSmartGroups: builtinOptions.injectSmartGroups ?? !isCustomOrRemoteTemplate,
          interval:
            builtinOptions.interval ||
            (config.profileUpdateInterval
              ? Number(config.profileUpdateInterval) * 3600
              : Number(config.UpdateInterval) || 86400),
          managedConfigUrl,
          skipCertVerify: builtinOptions.skipCertVerify,
          enableUdp: builtinOptions.enableUdp,
          enableTfo: builtinOptions.enableTfo,
          addFlagEmoji: builtinOptions.addFlagEmoji,
          regionOverrides: builtinOptions.regionOverrides,
          isMeta: builtinOptions.isMeta,
          customDnsOverride: builtinOptions.customDnsOverride || '',
          dnsMode: builtinOptions.dnsMode || 'clean',
          isChinaClient: builtinOptions.isChinaClient,
          multiSocks: builtinOptions.multiSocks,
        };

        if (adapter.id === 'shadowrocket') {
          const wantsRuleBundle = Boolean(
            (customTemplateEntry || templateSource.kind === 'custom') && usesShadowrocketRuleBundle(templateText),
          );
          const ruleBundle = wantsRuleBundle
            ? await loadShadowrocketRuleBundle(
                ruleBundleContext || { storageAdapter, isChinaClient: builtinOptions.isChinaClient },
              )
            : null;
          finalContent = await adapter.renderIniTemplate(templateText, {
            ...renderParams,
            preferredProxyKeys: builtinOptions.preferredProxyKeys,
            compactNames: builtinOptions.compactNames,
            ruleBundle,
          });
          if (wantsRuleBundle) {
            headers['X-MiSub-Shadowrocket-Rules'] = finalContent.includes('\n# Shadowrocket-Rule-Sets v1\n')
              ? 'aggregated'
              : 'local-fallback';
          }
        } else {
          finalContent = await adapter.renderIniTemplate(templateText, renderParams);
          contentType = adapter.contentType || contentType;
        }
      } else if (
        templateText &&
        (adapter.id === 'clash' || adapter.id === 'shadowrocket') &&
        isClashYamlProfileTemplate(templateText)
      ) {
        const renderedYaml = renderClashYamlProfileTemplate(templateText, combinedNodeList, builtinOptions);
        if (adapter.id === 'shadowrocket' && typeof adapter.renderFromClashConfig === 'function') {
          const parsedClash = yaml.load(renderedYaml);
          finalContent = await adapter.renderFromClashConfig(isRecord(parsedClash) ? parsedClash : {}, builtinOptions);
        } else {
          finalContent = renderedYaml;
          contentType = 'application/x-yaml; charset=utf-8';
        }
        headers['X-MiSub-Template-Mode'] = 'clash-yaml-profile';
      }
    }

    if (contentType === 'text/plain; charset=utf-8' && adapter.contentType) {
      contentType = adapter.contentType;
    }

    return {
      content: finalContent,
      contentType,
      headers,
      ...(adapter.id === 'shadowrocket'
        ? { fileName: `${String(subName || 'MiSub-Shadowrocket').replace(/\.conf$/i, '')}.conf` }
        : {}),
    };
  }
}
