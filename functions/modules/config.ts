import type { OperatorRule, SettingsConfig } from '@misub/core/types.js';
import { SETTINGS_KEYS } from '../storage/d1-schema.js';
import { DEFAULT_BUILTIN_TRANSFORM } from '@misub/core/domain/visual-rules-catalog.js';
import { DEFAULT_SHARED_SETTINGS, DEFAULT_SUBCONVERTER_BACKEND } from '@misub/core/domain/default-settings.js';

export const STORAGE_KEY_SETTINGS = SETTINGS_KEYS.MAIN;

export const COOKIE_NAME = 'auth_session';
export const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
export const SESSION_RENEW_THRESHOLD = 7 * 24 * 60 * 60 * 1000;
export { DEFAULT_SUBCONVERTER_BACKEND };

export const DEFAULT_SETTINGS: SettingsConfig & {
  cronSecret: string;
  botToken: string;
  chatId: string;
  tokenAutoRotate: {
    enabled: boolean;
    intervalDays: number;
    lastRotatedAt: string | null;
  };
  builtinTransform: typeof DEFAULT_BUILTIN_TRANSFORM;
  enableFlagEmoji: boolean;
  disguise: {
    pageType: 'default' | 'redirect';
    redirectUrl: string;
  };
  defaultPrefixSettings: {
    enableManualNodes: boolean;
    enableSubscriptions: boolean;
    manualNodePrefix: string;
    prependTagName: boolean;
  };
  manualNodeTagOrder: string[];
  subscriptionTagOrder: string[];
  profileTagOrder: string[];
  dismissedHealthItems: string[];
  customDnsOverride: string;
  regionOverrides: Array<Record<string, unknown>>;
  nodeTransformPresets: Array<Record<string, unknown>>;
  announcement: {
    enabled: boolean;
    title: string;
    content: string;
    type: string;
    dismissible: boolean;
    updatedAt: string | null;
  };
  guestbook: {
    enabled: boolean;
    allowAnonymous: boolean;
    requireAudit?: boolean;
  };
  customPage: {
    enabled: boolean;
    type: string;
    content: string;
    css: string;
    useDefaultLayout: boolean;
    allowExternalStylesheets: boolean;
    allowScripts: boolean;
    hideBranding: boolean;
    hideHeader: boolean;
    hideFooter: boolean;
  };
  webdavBackup: {
    enabled: boolean;
    endpoint: string;
    username: string;
    password: string;
    remotePath: string;
    filenameTemplate: string;
    backupScope: string;
    autoBackup: boolean;
    interval: string;
    retentionCount: number;
    lastCheckedAt: string | null;
    lastBackupAt: string | null;
    lastBackupStatus: string | null;
    lastBackupMessage: string;
    lastBackupFile: string;
  };
  externalApi: {
    enabled: boolean;
    tokens: Array<{ name: string; token: string }>;
  };
  subconverter: {
    engineMode: string;
    defaultBackend: string;
    defaultOptions: {
      udp: boolean;
      emoji: boolean;
      scv: boolean;
      tfo: boolean;
      sort: boolean;
      list: boolean;
    };
  };
  shortLink: {
    enabled: boolean;
    provider: string;
    apiUrl: string;
    apiToken: string;
  };
  turnstile: {
    enabled: boolean;
    siteKey: string;
    secretKey: string;
    enableForGuestbook: boolean;
    enableForLogin: boolean;
  };
  customLoginPath?: string;
  heroTitle1?: string;
  heroTitle2?: string;
  heroDescription?: string;
} = {
  ...DEFAULT_SHARED_SETTINGS,
  defaultOperators: [] as OperatorRule[],
  // 公告设置
  announcement: {
    enabled: false,
    title: '',
    content: '',
    type: 'info',
    dismissible: true,
    updatedAt: null,
  },
  // 自定义公开页设置
  customPage: {
    enabled: false, // 是否启用自定义页面
    type: 'html', // 页面渲染方式
    content: '', // 页面代码内容
    css: '', // 自定义全局样式
    useDefaultLayout: true, // 是否包裹在默认的基础布局中 (包含背景、容器等)
    allowExternalStylesheets: false, // 是否允许加载 HTML 源码中的外链样式表
    allowScripts: false, // 是否允许执行 HTML 源码中的 script
    hideBranding: false, // 是否隐藏公开页中的 MiSub 品牌标识
    hideHeader: false, // 自定义公开页是否隐藏全局页头
    hideFooter: false, // 自定义公开页是否隐藏全局页脚
  },
};

export const SYSTEM_CONSTANTS = {
  VERSION: '2.8.7',
  FETCHER_USER_AGENT: 'v2rayN/7.23',
};
