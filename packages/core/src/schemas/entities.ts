import { z } from 'zod';
import { NODE_PROTOCOL_REGEX } from '../protocols/constants.js';

const HTTP_URL_REGEX = /^https?:\/\/.+/i;
const HTTP_PROXY_AUTH_URL_REGEX = /^https?:\/\/[^/\s]+@[^/\s]+/i;

const isValidHttpProtocolUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const HttpUrlStringSchema = z
  .string()
  .trim()
  .regex(HTTP_URL_REGEX)
  .refine(isValidHttpProtocolUrl, 'URL must be a valid http:// or https:// URL');

export const RegexRuleObjectSchema = z
  .object({
    pattern: z.string().min(1),
    replacement: z.string().optional(),
    flags: z.string().optional(),
  })
  .passthrough();

export const RegexRuleItemSchema = z.union([z.string(), RegexRuleObjectSchema]);

export const DslStepSchema = z.union([
  z.string(),
  z
    .object({
      action: z.string().optional(),
      field: z.string().optional(),
      op: z.string().optional(),
      value: z.unknown().optional(),
      flags: z.string().optional(),
      template: z.string().optional(),
      expression: z.string().optional(),
    })
    .passthrough(),
]);

export const OperatorFilterParamsSchema = z
  .object({
    include: z
      .object({
        enabled: z.boolean().optional(),
        rules: z.union([z.string(), z.array(RegexRuleItemSchema)]).optional(),
      })
      .passthrough()
      .optional(),
    exclude: z
      .object({
        enabled: z.boolean().optional(),
        rules: z.union([z.string(), z.array(RegexRuleItemSchema)]).optional(),
      })
      .passthrough()
      .optional(),
    protocols: z
      .object({
        enabled: z.boolean().optional(),
        values: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    regions: z
      .object({
        enabled: z.boolean().optional(),
        values: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const OperatorRenameParamsSchema = z
  .object({
    regex: z
      .object({
        enabled: z.boolean().optional(),
        rules: z.union([z.string(), z.array(RegexRuleItemSchema)]).optional(),
      })
      .passthrough()
      .optional(),
    template: z
      .object({
        enabled: z.boolean().optional(),
        template: z.string().optional(),
        indexScope: z.enum(['global', 'region', 'protocol', 'regionProtocol']).optional(),
        scope: z.string().optional(),
        offset: z.number().int().optional(),
        indexStart: z.number().int().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const OperatorSortKeySchema = z
  .object({
    key: z.string().min(1),
    order: z.enum(['asc', 'desc']).optional(),
    customOrder: z.array(z.string()).optional(),
  })
  .passthrough();

export const OperatorSortParamsSchema = z
  .object({
    keys: z.array(OperatorSortKeySchema).default([]),
  })
  .passthrough();

export const OperatorDedupParamsSchema = z
  .object({
    mode: z.enum(['serverPort', 'url']).optional(),
    includeProtocol: z.boolean().optional(),
    prefer: z
      .object({
        protocolOrder: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const OperatorScriptParamsSchema = z
  .object({
    action: z.string().optional(),
    dsl: z.array(DslStepSchema).optional(),
    code: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough();

export const OperatorRuleSchema = z
  .object({
    id: z.string().optional(),
    type: z.enum(['filter', 'rename', 'sort', 'dedup', 'script']),
    enabled: z.boolean().default(true),
    params: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

export const TypedOperatorRuleSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().optional(),
    type: z.literal('filter'),
    enabled: z.boolean().default(true),
    params: OperatorFilterParamsSchema.default({}),
  }),
  z.object({
    id: z.string().optional(),
    type: z.literal('rename'),
    enabled: z.boolean().default(true),
    params: OperatorRenameParamsSchema.default({}),
  }),
  z.object({
    id: z.string().optional(),
    type: z.literal('sort'),
    enabled: z.boolean().default(true),
    params: OperatorSortParamsSchema.default({ keys: [] }),
  }),
  z.object({
    id: z.string().optional(),
    type: z.literal('dedup'),
    enabled: z.boolean().default(true),
    params: OperatorDedupParamsSchema.default({}),
  }),
  z.object({
    id: z.string().optional(),
    type: z.literal('script'),
    enabled: z.boolean().default(true),
    params: OperatorScriptParamsSchema.default({}),
  }),
]);

export const SubscriptionUserInfoSchema = z
  .object({
    upload: z.number().nonnegative().optional(),
    download: z.number().nonnegative().optional(),
    total: z.number().nonnegative().optional(),
    expire: z.number().optional(),
  })
  .passthrough()
  .nullable();

export const RemoteSubscriptionUrlSchema = z
  .string()
  .trim()
  .regex(HTTP_URL_REGEX, 'Subscription URL must start with http:// or https://')
  .refine(isValidHttpProtocolUrl, 'Subscription URL must be a valid http:// or https:// URL')
  .refine((value) => !HTTP_PROXY_AUTH_URL_REGEX.test(value), 'Authenticated HTTP proxy URLs belong to manual nodes');

export const ManualNodeUrlSchema = z
  .string()
  .trim()
  .refine((value) => {
    if (!value) return false;
    if (/^https?:\/\//i.test(value)) {
      return HTTP_PROXY_AUTH_URL_REGEX.test(value);
    }
    return NODE_PROTOCOL_REGEX.test(value);
  }, 'Manual node URL must use a supported node protocol');

export const SubscriptionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().default(''),
    url: RemoteSubscriptionUrlSchema,
    enabled: z.boolean().default(true),
    autoUpdate: z.boolean().default(true),
    nodeCount: z.number().int().nonnegative().optional(),
    exclude: z.string().optional(),
    include: z.string().optional(),
    customUserAgent: z.string().optional(),
    fetchProxy: z.string().optional(),
    plusAsSpace: z.boolean().optional(),
    tags: z.array(z.string()).default([]),
    notes: z.string().optional(),
    operators: z.array(OperatorRuleSchema).optional(),
    nodeTransform: z.record(z.string(), z.unknown()).nullable().optional(),
    disabledNodes: z.array(z.string()).optional(),
    userInfo: SubscriptionUserInfoSchema.optional(),
    lastError: z.string().nullable().optional(),
    lastUpdate: z.string().nullable().optional(),
    sortIndex: z.number().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
  })
  .passthrough();

export const ManualNodeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().default(''),
    url: ManualNodeUrlSchema,
    enabled: z.boolean().default(true),
    status: z.string().optional(),
    colorTag: z.string().nullable().optional(),
    tags: z.array(z.string()).default([]),
    notes: z.string().optional(),
    remarks: z.string().optional(),
    latency: z.number().nullable().optional(),
    sortIndex: z.number().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
  })
  .passthrough();

export const MisubItemSchema = z.union([ManualNodeSchema, SubscriptionSchema]);

export const ProfileSubscriptionRefSchema = z.union([
  z.string().min(1),
  z
    .object({
      id: z.string().min(1),
      exclude: z.string().optional(),
      include: z.string().optional(),
      operators: z.array(OperatorRuleSchema).optional(),
    })
    .passthrough(),
]);

export const ProfilePrefixSettingsSchema = z
  .object({
    enableManualNodes: z.boolean().nullable().optional(),
    enableSubscriptions: z.boolean().nullable().optional(),
    manualNodePrefix: z.string().optional(),
    subscriptionPrefix: z.string().optional(),
    prependTagName: z.boolean().nullable().optional(),
  })
  .passthrough();

export const ProfileSubconverterSchema = z
  .object({
    engineMode: z.string().optional(),
    backend: z.string().optional(),
    options: z
      .object({
        udp: z.boolean().nullable().optional(),
        emoji: z.boolean().nullable().optional(),
        scv: z.boolean().nullable().optional(),
        sort: z.boolean().nullable().optional(),
        tfo: z.boolean().nullable().optional(),
        list: z.boolean().nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const ProfileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().default(''),
    description: z.string().optional(),
    customId: z.string().optional(),
    linkId: z.string().optional(),
    shortLink: z.string().optional(),
    enabled: z.boolean().default(true),
    isPublic: z.boolean().default(false),
    downloadCount: z.number().int().nonnegative().default(0),
    subscriptions: z.array(ProfileSubscriptionRefSchema).default([]),
    manualNodes: z.array(z.string()).default([]),
    subProfiles: z.array(z.string()).default([]),
    tags: z.array(z.string()).optional(),
    transformConfigMode: z.string().optional(),
    transformConfig: z.string().optional(),
    ruleLevel: z.string().optional(),
    target: z.string().optional(),
    prefixSettings: ProfilePrefixSettingsSchema.optional(),
    subconverter: ProfileSubconverterSchema.optional(),
    operators: z.array(OperatorRuleSchema).optional(),
    nodeTransform: z.record(z.string(), z.unknown()).nullable().optional(),
    nodeTransformPresetId: z.string().optional(),
    expiresAt: z.string().nullable().optional(),
    sortIndex: z.number().optional(),
    createdAt: z.string().nullable().optional(),
    updatedAt: z.string().nullable().optional(),
  })
  .passthrough();

export const TokenAutoRotateConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    intervalDays: z.number().int().positive().default(2),
    lastRotatedAt: z.string().nullable().optional(),
  })
  .passthrough();

export const DisguiseConfigSchema = z
  .object({
    pageType: z.enum(['default', 'redirect']).default('default'),
    redirectUrl: z.string().default(''),
  })
  .passthrough();

export const AnnouncementConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    title: z.string().default(''),
    content: z.string().default(''),
    type: z.enum(['info', 'warning', 'success', 'error']).default('info'),
    dismissible: z.boolean().default(true),
    updatedAt: z.string().nullable().optional(),
  })
  .passthrough();

export const GuestbookConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    allowAnonymous: z.boolean().default(true),
  })
  .passthrough();

export const WebdavBackupConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    endpoint: z.string().default(''),
    username: z.string().default(''),
    password: z.string().default(''),
    remotePath: z.string().default('/MiSub'),
    filenameTemplate: z.string().default('misub-backup-{datetime}.json'),
    backupScope: z.enum(['dataOnly', 'dataAndSettings']).default('dataOnly'),
    autoBackup: z.boolean().default(false),
    interval: z.enum(['hourly', 'daily', 'weekly', 'monthly']).default('daily'),
    retentionCount: z.number().int().min(1).max(100).default(7),
    lastCheckedAt: z.string().nullable().optional(),
    lastBackupAt: z.string().nullable().optional(),
    lastBackupStatus: z.string().nullable().optional(),
    lastBackupMessage: z.string().optional(),
    lastBackupFile: z.string().optional(),
  })
  .passthrough();

export const ExternalApiTokenSchema = z
  .object({
    name: z.string().default('default'),
    token: z.string().default(''),
  })
  .passthrough();

export const ExternalApiConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    tokens: z.array(ExternalApiTokenSchema).default([]),
  })
  .passthrough();

export const SubconverterOptionsSchema = z
  .object({
    udp: z.boolean().optional(),
    emoji: z.boolean().optional(),
    scv: z.boolean().optional(),
    tfo: z.boolean().optional(),
    sort: z.boolean().optional(),
    list: z.boolean().optional(),
  })
  .passthrough();

export const SubconverterConfigSchema = z
  .object({
    engineMode: z.string().optional(),
    defaultBackend: z.string().optional(),
    defaultOptions: SubconverterOptionsSchema.optional(),
  })
  .passthrough();

export const ShortLinkConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    provider: z.string().default('sink'),
    apiUrl: z.string().default(''),
    apiToken: z.string().default(''),
    hasToken: z.boolean().optional(),
  })
  .passthrough();

export const TurnstileConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    siteKey: z.string().default(''),
    secretKey: z.string().default(''),
    enableForGuestbook: z.boolean().default(true),
    enableForLogin: z.boolean().default(false),
    hasSecretKey: z.boolean().optional(),
    hasEnvKeys: z.boolean().optional(),
    loginDisabledByEnv: z.boolean().optional(),
  })
  .passthrough();

export const TelegramPushConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    botToken: z.string().default(''),
    webhookSecret: z.string().default(''),
    allowedUserIds: z.array(z.string()).default([]),
    allowAllUsers: z.boolean().default(false),
    hasBotToken: z.boolean().optional(),
    hasWebhookSecret: z.boolean().optional(),
  })
  .passthrough();

export const CustomPageConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    type: z.string().default('html'),
    content: z.string().default(''),
    css: z.string().default(''),
    iframeUrl: z.string().optional(),
    iframeHeight: z.string().optional(),
    iframeFullWidth: z.boolean().optional(),
    iframeAllowFullscreen: z.boolean().optional(),
    iframeFillViewport: z.boolean().optional(),
    iframePaddingY: z.string().optional(),
    iframeRadius: z.string().optional(),
    iframeShadow: z.boolean().optional(),
    useDefaultLayout: z.boolean().default(true),
    allowExternalStylesheets: z.boolean().default(false),
    allowScripts: z.boolean().default(false),
    hideBranding: z.boolean().default(false),
    hideHeader: z.boolean().default(false),
    hideFooter: z.boolean().default(false),
  })
  .passthrough();

export const RegionOverrideRuleSchema = z
  .object({
    pattern: z.string().default(''),
    region: z.string().default(''),
    flags: z.string().default('i'),
  })
  .passthrough();

export const HeroConfigSchema = z
  .object({
    title1: z.string().optional(),
    title2: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

export const RuleTemplateSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    content: z.string().optional(),
    type: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

export const SettingsSchema = z
  .object({
    fileName: z.string().optional(),
    myToken: z.string().optional(),
    profileToken: z.string().optional(),
    publicUrl: z.string().optional(),
    tokenAutoRotate: TokenAutoRotateConfigSchema.optional(),
    defaultLocale: z.string().optional(),
    cronSecret: z.string().optional(),
    botToken: z.string().optional(),
    hasBotToken: z.boolean().optional(),
    chatId: z.string().optional(),
    customLoginPath: z.string().optional(),
    transformConfigMode: z.string().optional(),
    transformConfig: z.string().optional(),
    ruleLevel: z.string().optional(),
    builtinSkipCertVerify: z.boolean().optional(),
    builtinEnableUdp: z.boolean().optional(),
    builtinTransform: z.record(z.string(), z.unknown()).optional(),
    enableAccessLog: z.boolean().optional(),
    accessLogPersistenceMode: z.string().optional(),
    mergeExpireStrategy: z.enum(['max', 'min']).optional(),
    notifyThresholdDays: z.number().nonnegative().optional(),
    notifyThresholdPercent: z.number().min(0).max(100).optional(),
    enableTrafficNode: z.boolean().optional(),
    enableFlagEmoji: z.boolean().optional(),
    enablePublicPage: z.boolean().optional(),
    allowBrowserSubAccess: z.boolean().optional(),
    disguise: DisguiseConfigSchema.optional(),
    storageType: z.string().optional(),
    autoUpdateInterval: z.number().nonnegative().optional(),
    profileUpdateInterval: z.number().nonnegative().optional(),
    subFetchMinInterval: z.number().nonnegative().optional(),
    subFetchLimitMode: z.enum(['cache', 'strict']).optional(),
    defaultPrefixSettings: ProfilePrefixSettingsSchema.optional(),
    manualNodeTagOrder: z.array(z.string()).optional(),
    subscriptionTagOrder: z.array(z.string()).optional(),
    profileTagOrder: z.array(z.string()).optional(),
    dismissedHealthItems: z.array(z.string()).optional(),
    defaultOperators: z.array(OperatorRuleSchema).optional(),
    nodeTransformPresets: z.array(z.record(z.string(), z.unknown())).optional(),
    regionOverrides: z.array(RegionOverrideRuleSchema).optional(),
    announcement: AnnouncementConfigSchema.optional(),
    guestbook: GuestbookConfigSchema.optional(),
    webdavBackup: WebdavBackupConfigSchema.optional(),
    externalApi: ExternalApiConfigSchema.optional(),
    subconverter: SubconverterConfigSchema.optional(),
    shortLink: ShortLinkConfigSchema.optional(),
    turnstile: TurnstileConfigSchema.optional(),
    telegramPushConfig: TelegramPushConfigSchema.optional(),
    customDnsOverride: z.string().optional(),
    customPage: CustomPageConfigSchema.optional(),
    hero: HeroConfigSchema.optional(),
    heroTitle1: z.string().optional(),
    heroTitle2: z.string().optional(),
    heroDescription: z.string().optional(),
  })
  .passthrough();
