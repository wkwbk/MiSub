import type { BuiltinTransformConfig, ProfileSubscriptionRef } from '@misub/core/types.js';
import { DEFAULT_SHARED_SETTINGS } from '@misub/core/domain/default-settings.js';

export const DEFAULT_SETTINGS = {
  ...DEFAULT_SHARED_SETTINGS,
  builtinTransform: {
    ...DEFAULT_SHARED_SETTINGS.builtinTransform,
    baseConfig: { ...DEFAULT_SHARED_SETTINGS.builtinTransform.baseConfig },
  } as BuiltinTransformConfig,
  defaultPrefixSettings: {
    ...DEFAULT_SHARED_SETTINGS.defaultPrefixSettings,
    subscriptionPrefix: '',
  },
  // 公告设置（管理端预览默认值）
  announcement: {
    enabled: true, // 是否启用公告
    title: '2.5 版本更新说明', // 公告标题
    content:
      '为降低 Cloudflare D1 免费额度超限的风险，本版本已进行一系列优化：<br><br>• 移除 VPS 探针功能<br>• 内置订阅转换能力，不再依赖第三方转换服务<br>• 优化数据结构与读写逻辑<br>• 降低高频请求场景下的存储与缓存压力<br><br>本次更新主要聚焦于项目的长期稳定运行与免费额度控制。', // 公告内容（支持富文本/Markdown）
    type: 'info' as 'info' | 'warning' | 'success' | 'error', // 类型: 'info' | 'warning' | 'success' | 'error'
    dismissible: true, // 是否可关闭
    updatedAt: '2026-04-13T00:00:00.000Z' as string | null, // 更新时间
  },
  // 短链服务设置（支持 Sink）
  shortLink: {
    ...DEFAULT_SHARED_SETTINGS.shortLink,
    hasToken: false,
  },
  // Cloudflare Turnstile 人机验证设置
  turnstile: {
    ...DEFAULT_SHARED_SETTINGS.turnstile,
    hasSecretKey: false,
    hasEnvKeys: false,
    loginDisabledByEnv: false,
  },
  // 自定义公开页
  customPage: {
    enabled: false,
    type: 'html',
    content: '',
    css: '',
    iframeUrl: '',
    iframeHeight: '100vh',
    iframeFullWidth: true,
    iframeAllowFullscreen: true,
    iframeFillViewport: false,
    iframePaddingY: '0px',
    iframeRadius: '0px',
    iframeShadow: false,
    useDefaultLayout: true,
    allowExternalStylesheets: false,
    allowScripts: false,
    hideBranding: false,
    hideHeader: false,
    hideFooter: false,
  },
};

export const DEFAULT_PROFILE_FORM = {
  name: '',
  customId: '',
  linkId: '',
  shortLink: '',
  transformConfigMode: 'global',
  transformConfig: '',
  ruleLevel: '', // 为空表示跟随全局配置
  subscriptions: [] as ProfileSubscriptionRef[],
  manualNodes: [] as string[],
  enabled: true,
  prefixSettings: {
    enableManualNodes: true,
    enableSubscriptions: true,
    manualNodePrefix: '\u624b\u52a8\u8282\u70b9',
    subscriptionPrefix: '',
    prependTagName: null as boolean | null,
  },
  subconverter: {
    engineMode: '',
    backend: '',
    options: {
      udp: null as boolean | null,
      emoji: null as boolean | null,
      scv: null as boolean | null,
      sort: null as boolean | null,
      tfo: null as boolean | null,
      list: null as boolean | null,
    },
  },
  nodeTransform: null as Record<string, unknown> | null,
  nodeTransformPresetId: '',
};
