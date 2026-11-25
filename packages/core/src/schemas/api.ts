import { z } from 'zod';
import {
  HttpUrlStringSchema,
  ManualNodeUrlSchema,
  OperatorRuleSchema,
  RemoteSubscriptionUrlSchema,
  SettingsSchema,
} from './entities.js';

export const LoginRequestSchema = z
  .object({
    password: z.string().min(1),
    turnstileToken: z.string().optional(),
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
    url: HttpUrlStringSchema,
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
    url: RemoteSubscriptionUrlSchema,
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

export const ExternalManualNodeCreateSchema = z
  .object({
    name: z.string().trim().min(1),
    url: ManualNodeUrlSchema,
    enabled: z.boolean().optional().default(true),
    tags: z.array(z.string()).optional().default([]),
    remarks: z.string().optional().default(''),
    notes: z.string().optional(),
  })
  .passthrough();

export const ExternalManualNodeValidateSchema = z.object({
  name: z.string().trim().optional().default(''),
  url: z.string().trim().min(1).pipe(ManualNodeUrlSchema),
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

/**
 * 构造对外 API 成功响应体校验 Schema
 */
export function createExternalSuccessEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: ExternalApiMetaSchema.optional(),
  });
}
