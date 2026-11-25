import { SETTINGS_KEYS } from '../storage/d1-schema.js';
import { DEFAULT_BUILTIN_TRANSFORM } from '@misub/core/domain/visual-rules-catalog.js';

export const STORAGE_KEY_SETTINGS = SETTINGS_KEYS.MAIN;

export const COOKIE_NAME = 'auth_session';
export const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
export const SESSION_RENEW_THRESHOLD = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_SUBCONVERTER_BACKEND = 'subapi.cmliussss.net';

export const DEFAULT_SETTINGS = {
  fileName: 'MiSub',
  myToken: '',
  profileToken: 'sub',
  publicUrl: '',
  tokenAutoRotate: {
    enabled: false,
    intervalDays: 2,
    lastRotatedAt: null,
  },
  defaultLocale: 'zh-CN',
  cronSecret: '',
  botToken: '',
  chatId: '',
  transformConfigMode: 'builtin',
  transformConfig: '',
  ruleLevel: 'std',
  builtinSkipCertVerify: false,
  builtinEnableUdp: true,
  builtinTransform: { ...DEFAULT_BUILTIN_TRANSFORM, baseConfig: { ...DEFAULT_BUILTIN_TRANSFORM.baseConfig } },
  enableAccessLog: false,
  accessLogPersistenceMode: 'light',
  notifyThresholdDays: 3,
  notifyThresholdPercent: 90,
  enableTrafficNode: false,
  enableFlagEmoji: true,
  enablePublicPage: true,
  allowBrowserSubAccess: true,
  mergeExpireStrategy: 'max',
  disguise: {
    pageType: 'default',
    redirectUrl: '',
  },
  storageType: 'd1',
  autoUpdateInterval: 0,
  profileUpdateInterval: 24, // 客户端订阅默认更新间隔（小时），0 表示禁用注入 Profile-Update-Interval
  subFetchMinInterval: 15, // 服务端最小拉取间隔（分钟），0 表示禁用（回退默认 3 分钟节点缓存）
  subFetchLimitMode: 'cache', // 超频处理模式：'cache'（温和返回边缘缓存）| 'strict'（严格返回 429）
  defaultPrefixSettings: {
    enableManualNodes: true,
    enableSubscriptions: true,
    manualNodePrefix: '手动节点',
    prependTagName: false,
  },
  defaultOperators: [], // 新版操作符链式处理 (New Unified Pipeline)
  manualNodeTagOrder: [],
  subscriptionTagOrder: [],
  profileTagOrder: [],
  dismissedHealthItems: [],
  customDnsOverride: '',
  regionOverrides: [], // 自定义节点地区覆盖规则：{ pattern, region, flags }
  nodeTransformPresets: [],
  // 公告设置
  announcement: {
    enabled: false,
    title: '',
    content: '',
    type: 'info',
    dismissible: true,
    updatedAt: null,
  },
  // 留言板设置
  guestbook: {
    enabled: false,
    allowAnonymous: true,
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
  webdavBackup: {
    enabled: false,
    endpoint: '',
    username: '',
    password: '',
    remotePath: '/MiSub',
    filenameTemplate: 'misub-backup-{datetime}.json',
    backupScope: 'dataOnly',
    autoBackup: false,
    interval: 'daily',
    retentionCount: 7,
    lastCheckedAt: null,
    lastBackupAt: null,
    lastBackupStatus: null,
    lastBackupMessage: '',
    lastBackupFile: '',
  },
  externalApi: {
    enabled: false,
    tokens: [
      {
        name: 'default',
        token: '',
      },
    ],
  },
  // 订阅转换设置
  subconverter: {
    engineMode: 'builtin',
    defaultBackend: DEFAULT_SUBCONVERTER_BACKEND,
    defaultOptions: {
      udp: true,
      emoji: true,
      scv: true,
      tfo: false,
      sort: false,
      list: false,
    },
  },
  // 短链服务设置（支持 Sink）
  shortLink: {
    enabled: false,
    provider: 'sink',
    apiUrl: '',
    apiToken: '',
  },
  // Cloudflare Turnstile 人机验证设置
  turnstile: {
    enabled: false,
    siteKey: '',
    secretKey: '',
    enableForGuestbook: true,
    enableForLogin: false,
  },
};

export const SYSTEM_CONSTANTS = {
  VERSION: '2.8.7',
  FETCHER_USER_AGENT: 'v2rayN/7.23',
};
