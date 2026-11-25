import { generateCombinedNodeList } from './subscription-service.js';
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

function getTemplateExtension(templateUrl) {
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
  templateSource,
  builtinTemplateEntry = /** @type {Record<string, any> | null} */ (null),
) {
  if (builtinTemplateEntry?.format === 'ini') return true;
  if (templateSource?.kind === 'custom') return true;
  return getTemplateExtension(templateSource?.value) === 'ini';
}

function stripInternalProxyFields(proxy) {
  if (!proxy || typeof proxy !== 'object') return proxy;
  const { metadata: _metadata, ...publicProxy } = proxy;
  return publicProxy;
}

function deduplicateProxyNames(proxies) {
  const seen = new Map();
  proxies.forEach((proxy) => {
    if (!proxy?.name) return;
    const originalName = proxy.name;
    const count = seen.get(originalName) || 0;
    seen.set(originalName, count + 1);
    if (count > 0) {
      proxy.name = `${originalName} ${count + 1}`;
    }
  });
}

export function isClashYamlProfileTemplate(templateText) {
  if (typeof templateText !== 'string' || templateText.trim() === '') return false;

  try {
    const parsed = /** @type {Record<string, any> | null} */ (yaml.load(templateText));
    return Boolean(
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray(parsed['proxy-groups']) &&
      Array.isArray(parsed.rules),
    );
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
function normalizeYamlChainConfigs(config) {
  const rawDeclaration = config['x-misub-chain-proxy'];
  delete config['x-misub-chain-proxy'];

  let declarations = [];
  if (Array.isArray(rawDeclaration)) {
    declarations = rawDeclaration;
  } else if (rawDeclaration && typeof rawDeclaration === 'object') {
    declarations = [rawDeclaration];
  }

  return declarations
    .filter((declaration) => declaration && typeof declaration === 'object' && !Array.isArray(declaration))
    .map((declaration) => ({
      ...declaration,
      group: declaration.group ?? declaration['landing-group'],
      entry: declaration.entry ?? declaration['entry-group'],
      prefix: declaration.prefix ?? declaration['clone-prefix'],
    }));
}

function renderClashYamlProfileTemplate(templateText, nodeList, options = {}) {
  const config = /** @type {Record<string, any> | null} */ (yaml.load(templateText));
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return '';
  }

  const nodeUrls = String(nodeList || '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const proxies = urlsToClashProxies(nodeUrls, options).map(stripInternalProxyFields);
  deduplicateProxyNames(proxies);

  const chainConfigs = normalizeYamlChainConfigs(config);
  config.proxies = proxies;
  if (chainConfigs.length > 0) {
    applyMihomoChainProxyToClashConfig(config, {
      chainConfigs,
      enableDialerProxy: Boolean(options.isMeta),
    });
  }

  return yaml.dump(
    {
      ...config,
      'allow-lan': false,
      'bind-address': '127.0.0.1',
      ipv6: false,
      'external-controller': '127.0.0.1:9090',
      dns: resolveSafeDnsConfig(config.dns, {
        mode: options.dnsMode,
        proxyGroup: '🌐 DNS 出口',
      }),
      proxies: config.proxies,
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
  static async processNodes(context, config, params) {
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

  static async renderOutput(options) {
    const {
      targetFormat,
      combinedNodeList,
      subName,
      config,
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
    const headers = userInfoHeader ? { 'Subscription-Userinfo': userInfoHeader } : {};

    const shouldApplyTemplate = !builtinOptions.hiddifyCompatible;
    const builtinTemplateEntry =
      shouldApplyTemplate && templateSource.kind === 'builtin' ? getBuiltinTemplate(templateSource.value) : null;
    const customTemplateEntry =
      shouldApplyTemplate && templateSource.kind === 'custom'
        ? await resolveRuleTemplateSource(storageAdapter, templateSource)
        : null;
    const remoteTemplateUrl = shouldApplyTemplate && templateSource.kind === 'remote' ? templateSource.value : '';

    if (builtinTemplateEntry || customTemplateEntry || remoteTemplateUrl) {
      const templateText =
        builtinTemplateEntry?.content ||
        customTemplateEntry?.content ||
        (await fetchTransformTemplate(storageAdapter, remoteTemplateUrl));
      const isIniTemplate = isIniTemplateSource(templateSource, builtinTemplateEntry || customTemplateEntry);

      if (templateText && isIniTemplate) {
        const renderParams = {
          nodeList: combinedNodeList,
          fileName: subName,
          targetFormat,
          ruleLevel: builtinOptions.ruleLevel,
          interval:
            builtinOptions.interval ||
            (config.profileUpdateInterval ? config.profileUpdateInterval * 3600 : config.UpdateInterval || 86400),
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
          finalContent = await adapter.renderFromClashConfig(
            /** @type {Record<string, any>} */ (yaml.load(renderedYaml)),
            builtinOptions,
          );
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
