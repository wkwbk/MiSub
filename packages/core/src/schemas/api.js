import { z } from 'zod';
import { NODE_PROTOCOL_REGEX } from '../protocols/constants.js';
import {
  MisubItemSchema,
  OperatorRuleSchema,
  ProfileSchema,
  SettingsSchema,
  SubscriptionUserInfoSchema,
} from './entities.js';

const HTTP_URL_REGEX = /^https?:\/\/.+/i;
const HTTP_PROXY_AUTH_URL_REGEX = /^https?:\/\/[^/\s]+@[^/\s]+/i;

export const LoginRequestSchema = z
  .object({
    password: z.string().min(1),
    turnstileToken: z.string().optional(),
  })
  .passthrough();

export const LoginResponseSchema = z
  .object({
    success: z.boolean().optional(),
    error: z.string().optional(),
    code: z.string().optional(),
    retryAfterSeconds: z.number().int().positive().optional(),
  })
  .passthrough();

export const MisubsSaveRequestSchema = z
  .object({
    misubs: z.array(z.record(z.string(), z.unknown())),
    profiles: z.array(z.record(z.string(), z.unknown())),
    baseRevision: z.string().optional(),
    force: z.boolean().optional().default(false),
  })
  .passthrough();

export const StrictMisubsSaveRequestSchema = z
  .object({
    misubs: z.array(MisubItemSchema),
    profiles: z.array(ProfileSchema),
    baseRevision: z.string().optional(),
    force: z.boolean().optional().default(false),
  })
  .passthrough();

export const DataResponseSchema = z
  .object({
    misubs: z.array(z.record(z.string(), z.unknown())),
    profiles: z.array(z.record(z.string(), z.unknown())),
    ruleTemplates: z.array(z.record(z.string(), z.unknown())).optional(),
    config: SettingsSchema,
    dataRevision: z.string().optional(),
  })
  .passthrough();

export const ParseSubscriptionRequestSchema = z.object({
  content: z.string().min(1),
});

export const ParsedNodePreviewSchema = z
  .object({
    name: z.string(),
    url: z.string().min(1),
    protocol: z.string().optional(),
  })
  .passthrough();

export const ParseSubscriptionResponseSchema = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        nodes: z.array(ParsedNodePreviewSchema),
        totalCount: z.number().int().nonnegative(),
      })
      .optional(),
    error: z.string().optional(),
  })
  .passthrough();

export const NodeCountRequestSchema = z
  .object({
    url: z.string().trim().regex(HTTP_URL_REGEX),
    userAgent: z.string().optional(),
    fetchProxy: z.string().optional(),
    plusAsSpace: z.boolean().optional(),
  })
  .passthrough();

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export const ExternalSubscriptionCreateSchema = z
  .object({
    name: z.string().trim().optional().default(''),
    url: z
      .string()
      .trim()
      .regex(HTTP_URL_REGEX)
      .refine((v) => !HTTP_PROXY_AUTH_URL_REGEX.test(v)),
    enabled: z.boolean().optional().default(true),
    autoUpdate: z.boolean().optional().default(true),
    tags: z.array(z.string()).optional().default([]),
    userAgent: z.string().optional(),
    customUserAgent: z.string().optional(),
    proxy: z.string().optional(),
    fetchProxy: z.string().optional(),
    plusAsSpace: z.boolean().optional().default(false),
    exclude: z.string().optional(),
    include: z.string().optional(),
    notes: z.string().optional(),
    operators: z.array(OperatorRuleSchema).optional(),
  })
  .passthrough();

export const ExternalSubscriptionUpdateSchema = ExternalSubscriptionCreateSchema.partial();

export const ExternalManualNodeCreateSchema = z
  .object({
    name: z.string().trim().min(1),
    url: z
      .string()
      .trim()
      .refine((v) => (HTTP_URL_REGEX.test(v) ? HTTP_PROXY_AUTH_URL_REGEX.test(v) : NODE_PROTOCOL_REGEX.test(v))),
    enabled: z.boolean().optional().default(true),
    tags: z.array(z.string()).optional().default([]),
    remarks: z.string().optional().default(''),
    notes: z.string().optional(),
  })
  .passthrough();

export const ExternalManualNodeUpdateSchema = ExternalManualNodeCreateSchema.partial();

export const ExternalManualNodeValidateSchema = z.object({
  name: z.string().trim().optional().default(''),
  url: z
    .string()
    .trim()
    .min(1)
    .refine((v) => (HTTP_URL_REGEX.test(v) ? HTTP_PROXY_AUTH_URL_REGEX.test(v) : NODE_PROTOCOL_REGEX.test(v))),
});

export const ExternalProfileCreateSchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().optional().default(''),
    tags: z.array(z.string()).optional().default([]),
    enabled: z.boolean().optional().default(true),
    isPublic: z.boolean().optional().default(false),
    customId: z.string().trim().optional().default(''),
    subscriptions: z.array(z.string().min(1)).optional(),
    subscriptionIds: z.array(z.string().min(1)).optional(),
    manualNodes: z.array(z.string().min(1)).optional(),
    manualNodeIds: z.array(z.string().min(1)).optional(),
    target: z.string().optional().default('clash'),
  })
  .passthrough();

export const ExternalProfileUpdateSchema = ExternalProfileCreateSchema.partial();

export const ExternalApiMetaSchema = z
  .object({
    page: z.number().int().min(1).optional(),
    pageSize: z.number().int().min(1).optional(),
    total: z.number().int().nonnegative().optional(),
    totalPages: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export const ExternalApiErrorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export const ExternalSubscriptionDtoSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('subscription'),
    name: z.string(),
    url: z.string(),
    enabled: z.boolean(),
    autoUpdate: z.boolean(),
    tags: z.array(z.string()),
    userAgent: z.string(),
    proxy: z.string(),
    nodeCount: z.number().int().nonnegative(),
    userInfo: SubscriptionUserInfoSchema,
    lastError: z.string(),
    lastUpdate: z.string().nullable(),
    sortIndex: z.number(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
  })
  .passthrough();

/**
 * 构造对外 API 成功响应体校验 Schema
 * @template {import('zod').ZodTypeAny} T
 * @param {T} dataSchema
 */
export function createExternalSuccessEnvelopeSchema(dataSchema) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: ExternalApiMetaSchema.optional(),
  });
}
