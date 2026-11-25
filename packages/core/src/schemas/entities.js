import { z } from 'zod';
import { NODE_PROTOCOL_REGEX } from '../protocols/constants.js';

const HTTP_URL_REGEX = /^https?:\/\/.+/i;
const HTTP_PROXY_AUTH_URL_REGEX = /^https?:\/\/[^/\s]+@[^/\s]+/i;

export const HttpUrlStringSchema = z.string().trim().regex(HTTP_URL_REGEX);

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
    lastError: z.string().optional(),
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
    enableManualNodes: z.boolean().optional(),
    enableSubscriptions: z.boolean().optional(),
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

export const SettingsSchema = z
  .object({
    fileName: z.string().optional(),
    myToken: z.string().optional(),
    profileToken: z.string().optional(),
    publicUrl: z.string().optional(),
    defaultLocale: z.string().optional(),
    transformConfigMode: z.string().optional(),
    transformConfig: z.string().optional(),
    ruleLevel: z.string().optional(),
    builtinSkipCertVerify: z.boolean().optional(),
    builtinEnableUdp: z.boolean().optional(),
    enableAccessLog: z.boolean().optional(),
    accessLogPersistenceMode: z.string().optional(),
    mergeExpireStrategy: z.enum(['max', 'min']).optional(),
    notifyThresholdDays: z.number().nonnegative().optional(),
    notifyThresholdPercent: z.number().min(0).max(100).optional(),
    enableTrafficNode: z.boolean().optional(),
    enableFlagEmoji: z.boolean().optional(),
    enablePublicPage: z.boolean().optional(),
    allowBrowserSubAccess: z.boolean().optional(),
    storageType: z.string().optional(),
    autoUpdateInterval: z.number().nonnegative().optional(),
    profileUpdateInterval: z.number().nonnegative().optional(),
    subFetchMinInterval: z.number().nonnegative().optional(),
    subFetchLimitMode: z.enum(['cache', 'strict']).optional(),
    defaultOperators: z.array(OperatorRuleSchema).optional(),
  })
  .passthrough();
