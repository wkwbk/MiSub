/**
 * 核心领域模型与协议中间表示（TypeScript 类型契约）
 * 由 packages/core/src/schemas/* 的 Zod Schema 自动推导，供前后端共用。
 */

import type { z } from 'zod';
import type {
  NodeIRAuthSchema,
  NodeIREchSchema,
  NodeIRMetadataSchema,
  NodeIRProtocolSchema,
  NodeIRRealitySchema,
  NodeIRSchema,
  NodeIRTlsSchema,
  NodeIRTransportSchema,
  NodeIRTransportTypeSchema,
} from './schemas/node-ir.js';
import type {
  AnnouncementConfigSchema,
  CustomPageConfigSchema,
  DisguiseConfigSchema,
  DslStepSchema,
  ExternalApiConfigSchema,
  ExternalApiTokenSchema,
  GuestbookConfigSchema,
  HeroConfigSchema,
  ManualNodeSchema,
  MisubItemSchema,
  OperatorDedupParamsSchema,
  OperatorFilterParamsSchema,
  OperatorRenameParamsSchema,
  OperatorRuleSchema,
  OperatorScriptParamsSchema,
  OperatorSortKeySchema,
  OperatorSortParamsSchema,
  ProfilePrefixSettingsSchema,
  ProfileSchema,
  ProfileSubconverterSchema,
  ProfileSubscriptionRefSchema,
  RegexRuleItemSchema,
  RegexRuleObjectSchema,
  RegionOverrideRuleSchema,
  RuleTemplateSchema,
  SettingsSchema,
  ShortLinkConfigSchema,
  SubconverterConfigSchema,
  SubconverterOptionsSchema,
  SubscriptionSchema,
  SubscriptionUserInfoSchema,
  TelegramPushConfigSchema,
  TokenAutoRotateConfigSchema,
  TurnstileConfigSchema,
  TypedOperatorRuleSchema,
  WebdavBackupConfigSchema,
} from './schemas/entities.js';
import type {
  DataResponseSchema,
  ExternalApiErrorEnvelopeSchema,
  ExternalApiMetaSchema,
  ExternalManualNodeCreateSchema,
  ExternalManualNodeValidateSchema,
  ExternalProfileCreateSchema,
  ExternalSubscriptionCreateSchema,
  LoginRequestSchema,
  NodeCountRequestSchema,
  PaginationQuerySchema,
  ParsedNodePreviewSchema,
  ParseSubscriptionRequestSchema,
  ParseSubscriptionResponseSchema,
} from './schemas/api.js';

export type NodeIRProtocol = z.infer<typeof NodeIRProtocolSchema>;
export type NodeIRTransportType = z.infer<typeof NodeIRTransportTypeSchema>;
export type NodeIRAuth = z.infer<typeof NodeIRAuthSchema>;
export type NodeIRTransport = z.infer<typeof NodeIRTransportSchema>;
export type NodeIRReality = z.infer<typeof NodeIRRealitySchema>;
export type NodeIREch = z.infer<typeof NodeIREchSchema>;
export type NodeIRTls = z.infer<typeof NodeIRTlsSchema>;
export type NodeIRMetadata = z.infer<typeof NodeIRMetadataSchema>;
export type NodeIR = z.infer<typeof NodeIRSchema>;

export type RegexRuleObject = z.infer<typeof RegexRuleObjectSchema>;
export type RegexRuleItem = z.infer<typeof RegexRuleItemSchema>;
export type DslStep = z.infer<typeof DslStepSchema>;
export type OperatorFilterParams = z.infer<typeof OperatorFilterParamsSchema>;
export type OperatorRenameParams = z.infer<typeof OperatorRenameParamsSchema>;
export type OperatorSortKey = z.infer<typeof OperatorSortKeySchema>;
export type OperatorSortParams = z.infer<typeof OperatorSortParamsSchema>;
export type OperatorDedupParams = z.infer<typeof OperatorDedupParamsSchema>;
export type OperatorScriptParams = z.infer<typeof OperatorScriptParamsSchema>;
export type OperatorRule = z.infer<typeof OperatorRuleSchema>;
export type TypedOperatorRule = z.infer<typeof TypedOperatorRuleSchema>;

export type SubscriptionUserInfo = z.infer<typeof SubscriptionUserInfoSchema>;
export type SubscriptionItem = z.infer<typeof SubscriptionSchema>;
export type ManualNodeItem = z.infer<typeof ManualNodeSchema>;
export type MisubItem = z.infer<typeof MisubItemSchema>;
export type ProfileSubscriptionRef = z.infer<typeof ProfileSubscriptionRefSchema>;
export type ProfilePrefixSettings = z.infer<typeof ProfilePrefixSettingsSchema>;
export type ProfileSubconverter = z.infer<typeof ProfileSubconverterSchema>;
export type ProfileConfig = z.infer<typeof ProfileSchema>;
export type TokenAutoRotateConfig = z.infer<typeof TokenAutoRotateConfigSchema>;
export type DisguiseConfig = z.infer<typeof DisguiseConfigSchema>;
export type AnnouncementConfig = z.infer<typeof AnnouncementConfigSchema>;
export type HeroConfig = z.infer<typeof HeroConfigSchema>;
export type GuestbookConfig = z.infer<typeof GuestbookConfigSchema>;
export type WebdavBackupConfig = z.infer<typeof WebdavBackupConfigSchema>;
export type ExternalApiToken = z.infer<typeof ExternalApiTokenSchema>;
export type ExternalApiConfig = z.infer<typeof ExternalApiConfigSchema>;
export type SubconverterOptions = z.infer<typeof SubconverterOptionsSchema>;
export type SubconverterConfig = z.infer<typeof SubconverterConfigSchema>;
export type ShortLinkConfig = z.infer<typeof ShortLinkConfigSchema>;
export type TurnstileConfig = z.infer<typeof TurnstileConfigSchema>;
export type TelegramPushConfig = z.infer<typeof TelegramPushConfigSchema>;
export type CustomPageConfig = z.infer<typeof CustomPageConfigSchema>;
export type RegionOverrideRule = z.infer<typeof RegionOverrideRuleSchema>;
export type RuleTemplate = z.infer<typeof RuleTemplateSchema>;
export type SettingsConfig = z.infer<typeof SettingsSchema>;

export interface WebdavRemoteFile {
  name: string;
  path: string;
  size?: number;
  lastModified?: string;
}

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type DataResponse = z.infer<typeof DataResponseSchema>;
export type ParseSubscriptionRequest = z.infer<typeof ParseSubscriptionRequestSchema>;
export type ParsedNodePreview = z.infer<typeof ParsedNodePreviewSchema>;
export type ParseSubscriptionResponse = z.infer<typeof ParseSubscriptionResponseSchema>;
export type NodeCountRequest = z.infer<typeof NodeCountRequestSchema>;
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type ExternalSubscriptionCreate = z.infer<typeof ExternalSubscriptionCreateSchema>;
export type ExternalManualNodeCreate = z.infer<typeof ExternalManualNodeCreateSchema>;
export type ExternalManualNodeValidate = z.infer<typeof ExternalManualNodeValidateSchema>;
export type ExternalProfileCreate = z.infer<typeof ExternalProfileCreateSchema>;
export type ExternalApiMeta = z.infer<typeof ExternalApiMetaSchema>;
export type ExternalApiErrorEnvelope = z.infer<typeof ExternalApiErrorEnvelopeSchema>;

export interface NodeMetadata {
  originalName: string;
  cleanName: string;
  multiplier: number;
  region: string;
  regionZh?: string;
  regionCode?: string;
  flag: string;
  tags: string[];
}

export interface ParsedNodeInfo {
  protocol: string;
  name: string;
  region: string;
  server?: string;
  port?: string | number;
  url: string;
}

export interface ClashProxy {
  name: string;
  type: string;
  server: string;
  port: number;
  udp?: boolean;
  tfo?: boolean;
  tls?: boolean;
  skipCertVerify?: boolean;
  'skip-cert-verify'?: boolean;
  servername?: string;
  sni?: string;
  metadata?: NodeMetadata | NodeIRMetadata;
  [key: string]: unknown;
}

export interface NodeRecord {
  url: string;
  protocol: string;
  name: string;
  originalName: string;
  region: string;
  regionZh?: string;
  regionCode?: string;
  emoji: string;
  server: string;
  port: string | number;
  index?: number | string;
  tag?: string;
  tags?: string[];
  metadata?: NodeMetadata;
  regexGroups?: Record<string, string>;
  [key: string]: unknown;
}

export interface NodeIRBatchParseOptions {
  enableTfo?: boolean;
  enableUdp?: boolean;
  skipCertVerify?: boolean;
  supportX25519mlkem768?: boolean;
  addFlagEmoji?: boolean;
  extractMetadata?: boolean;
}

export interface OperatorContext {
  userAgent?: string;
  target?: string;
  nodeMetadataByUrl?: Map<string, Partial<NodeRecord>> | Record<string, Partial<NodeRecord>>;
  [key: string]: unknown;
}

export interface CustomVisualRule {
  name: string;
  action: 'proxy' | 'direct' | 'reject';
  domainSuffix: string[];
  domainKeyword: string[];
  ipCidr: string[];
  srcIpCidr: string[];
  ruleSet: string[];
}

export interface BuiltinTransformConfig {
  visualRulesEnabled: boolean;
  rulePreset: string;
  selectedRules: string[];
  customRules: CustomVisualRule[];
  groupByCountry: boolean;
  includeAutoSelect: boolean;
  enableClashApi: boolean;
  externalController: string;
  externalUiDownloadUrl: string;
  baseConfig: {
    singbox: string;
    clash: string;
    surge: string;
  };
}
