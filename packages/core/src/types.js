/**
 * 核心领域模型与协议中间表示（JSDoc typedef 契约）
 * 由 packages/core/src/schemas/* 的 Zod Schema 自动推导，供 jsconfig checkJs 跨端静态检查。
 */

/**
 * @typedef {import('zod').infer<typeof import('./schemas/node-ir.js').NodeIRProtocolSchema>} NodeIRProtocol
 * @typedef {import('zod').infer<typeof import('./schemas/node-ir.js').NodeIRTransportTypeSchema>} NodeIRTransportType
 * @typedef {import('zod').infer<typeof import('./schemas/node-ir.js').NodeIRAuthSchema>} NodeIRAuth
 * @typedef {import('zod').infer<typeof import('./schemas/node-ir.js').NodeIRTransportSchema>} NodeIRTransport
 * @typedef {import('zod').infer<typeof import('./schemas/node-ir.js').NodeIRRealitySchema>} NodeIRReality
 * @typedef {import('zod').infer<typeof import('./schemas/node-ir.js').NodeIREchSchema>} NodeIREch
 * @typedef {import('zod').infer<typeof import('./schemas/node-ir.js').NodeIRTlsSchema>} NodeIRTls
 * @typedef {import('zod').infer<typeof import('./schemas/node-ir.js').NodeIRMetadataSchema>} NodeIRMetadata
 * @typedef {import('zod').infer<typeof import('./schemas/node-ir.js').NodeIRSchema>} NodeIR
 *
 * @typedef {import('zod').infer<typeof import('./schemas/entities.js').OperatorRuleSchema>} OperatorRule
 * @typedef {import('zod').infer<typeof import('./schemas/entities.js').TypedOperatorRuleSchema>} TypedOperatorRule
 * @typedef {import('zod').infer<typeof import('./schemas/entities.js').SubscriptionUserInfoSchema>} SubscriptionUserInfo
 * @typedef {import('zod').infer<typeof import('./schemas/entities.js').SubscriptionSchema>} SubscriptionItem
 * @typedef {import('zod').infer<typeof import('./schemas/entities.js').ManualNodeSchema>} ManualNodeItem
 * @typedef {import('zod').infer<typeof import('./schemas/entities.js').MisubItemSchema>} MisubItem
 * @typedef {import('zod').infer<typeof import('./schemas/entities.js').ProfileSubscriptionRefSchema>} ProfileSubscriptionRef
 * @typedef {import('zod').infer<typeof import('./schemas/entities.js').ProfilePrefixSettingsSchema>} ProfilePrefixSettings
 * @typedef {import('zod').infer<typeof import('./schemas/entities.js').ProfileSubconverterSchema>} ProfileSubconverter
 * @typedef {import('zod').infer<typeof import('./schemas/entities.js').ProfileSchema>} ProfileConfig
 * @typedef {import('zod').infer<typeof import('./schemas/entities.js').SettingsSchema>} SettingsConfig
 *
 * @typedef {import('zod').infer<typeof import('./schemas/api.js').LoginRequestSchema>} LoginRequest
 * @typedef {import('zod').infer<typeof import('./schemas/api.js').MisubsSaveRequestSchema>} MisubsSaveRequest
 * @typedef {import('zod').infer<typeof import('./schemas/api.js').DataResponseSchema>} DataResponse
 * @typedef {import('zod').infer<typeof import('./schemas/api.js').ParseSubscriptionRequestSchema>} ParseSubscriptionRequest
 * @typedef {import('zod').infer<typeof import('./schemas/api.js').ParseSubscriptionResponseSchema>} ParseSubscriptionResponse
 * @typedef {import('zod').infer<typeof import('./schemas/api.js').NodeCountRequestSchema>} NodeCountRequest
 * @typedef {import('zod').infer<typeof import('./schemas/api.js').PaginationQuerySchema>} PaginationQuery
 * @typedef {import('zod').infer<typeof import('./schemas/api.js').ExternalSubscriptionCreateSchema>} ExternalSubscriptionCreate
 * @typedef {import('zod').infer<typeof import('./schemas/api.js').ExternalManualNodeCreateSchema>} ExternalManualNodeCreate
 * @typedef {import('zod').infer<typeof import('./schemas/api.js').ExternalManualNodeValidateSchema>} ExternalManualNodeValidate
 * @typedef {import('zod').infer<typeof import('./schemas/api.js').ExternalProfileCreateSchema>} ExternalProfileCreate
 * @typedef {import('zod').infer<typeof import('./schemas/api.js').ExternalApiErrorEnvelopeSchema>} ExternalApiErrorEnvelope
 */

export {};
