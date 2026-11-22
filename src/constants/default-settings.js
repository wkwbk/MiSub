import { DEFAULT_SUBCONVERTER_BACKEND } from '@/constants/subconverter-backends.js';
import { DEFAULT_PUBLIC_LINKS_CONFIG } from '@shared/default-public-links.js';
import { DEFAULT_PUBLIC_CORES_CONFIG } from '@shared/default-public-cores.js';

export const DEFAULT_SETTINGS = {
  fileName: 'MiSub',
  myToken: '',
  profileToken: 'sub',
  defaultLocale: 'zh-CN',
  cronSecret: '',
  botToken: '',
  chatId: '',
  transformConfigMode: 'builtin',
  transformConfig: '',
  ruleLevel: 'std',
  builtinSkipCertVerify: false,
  builtinEnableUdp: true,
  builtinLoonSkipCertVerify: false,
  enableAccessLog: false,
  accessLogPersistenceMode: 'light',
  mergeExpireStrategy: 'max',
  notifyThresholdDays: 3,
  notifyThresholdPercent: 90,
  enableTrafficNode: false,
  enableFlagEmoji: true,
  enablePublicPage: true,
  allowBrowserSubAccess: true,
  disguise: {
    pageType: 'default',
    redirectUrl: '',
  },
  storageType: 'd1',
  autoUpdateInterval: 0, // 分钟，0表示禁用自动更新
  profileUpdateInterval: 24, // 小时，客户端订阅默认更新间隔，0表示禁用注入
  subFetchMinInterval: 15, // 分钟，服务端最小被订阅间隔（边缘缓存与防刷），0表示禁用
  subFetchLimitMode: 'cache', // 'cache'（温和返回缓存）| 'strict'（严格返回 429）
  defaultPrefixSettings: {
    enableManualNodes: true,
    enableSubscriptions: true,
    manualNodePrefix: '\u624b\u52a8\u8282\u70b9',
    subscriptionPrefix: '',
    prependTagName: false,
  },
  manualNodeTagOrder: [], // 手动节点标签自定义顺序
  subscriptionTagOrder: [], // 订阅源标签自定义顺序
  profileTagOrder: [], // 分享组合标签自定义顺序
  // 首页「待处理事项」里被用户主动忽略的条目 id。
  // 存在设置里是为了跨设备同步（原先只存 localStorage，换设备就丢）。
  // 条目的 id 都是固定字符串（见 src/utils/dashboard-health.js），跨设备可比对。
  dismissedHealthItems: [],
  nodeTransformPresets: [],
  regionOverrides: [],
  // 公告设置
  announcement: {
    enabled: true, // 是否启用公告
    title: '2.5 版本更新说明', // 公告标题
    content:
      '为降低 Cloudflare D1 免费额度超限的风险，本版本已进行一系列优化：<br><br>• 移除 VPS 探针功能<br>• 内置订阅转换能力，不再依赖第三方转换服务<br>• 优化数据结构与读写逻辑<br>• 降低高频请求场景下的存储与缓存压力<br><br>本次更新主要聚焦于项目的长期稳定运行与免费额度控制。', // 公告内容（支持富文本/Markdown）
    type: 'info', // 类型: 'info' | 'warning' | 'success'
    dismissible: true, // 是否可关闭
    updatedAt: '2026-04-13T00:00:00.000Z', // 更新时间
  },
  // 留言板设置
  guestbook: {
    enabled: false,
    allowAnonymous: true,
  },
  // 公开页导航链接设置（测速、IP检测、服务器厂商等）
  publicLinks: DEFAULT_PUBLIC_LINKS_CONFIG,
  // 公开页代理内核设置（Xray-core、sing-box、Mihomo、Hysteria 2 等）
  publicCores: DEFAULT_PUBLIC_CORES_CONFIG,
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
    hasToken: false,
  },
  // 自定义公开页
  customDnsOverride: '',
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
  shortLink: '',
  transformConfigMode: 'global',
  transformConfig: '',
  ruleLevel: '', // 为空表示跟随全局配置
  subscriptions: [],
  manualNodes: [],
  enabled: true,
  prefixSettings: {
    enableManualNodes: true,
    enableSubscriptions: true,
    manualNodePrefix: '\u624b\u52a8\u8282\u70b9',
    subscriptionPrefix: '',
    prependTagName: null,
  },
  subconverter: {
    engineMode: '',
    backend: '',
    options: {
      udp: null,
      emoji: null,
      scv: null,
      sort: null,
      tfo: null,
      list: null,
    },
  },
  nodeTransform: null,
  nodeTransformPresetId: '',
};
