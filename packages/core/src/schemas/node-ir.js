import { z } from 'zod';

/**
 * 统一节点中间表示（NodeIR）支持的标准化协议枚举
 */
export const NODE_IR_PROTOCOLS = [
  'ss',
  'ssr',
  'vmess',
  'vless',
  'trojan',
  'hysteria',
  'hysteria2',
  'tuic',
  'anytls',
  'snell',
  'socks5',
  'http',
  'https',
  'wireguard',
  'naive+https',
  'naive+quic',
  'naive+http',
  'mierus',
];

export const NodeIRProtocolSchema = z.enum(NODE_IR_PROTOCOLS);

export const NodeIRTransportTypeSchema = z.enum([
  'tcp',
  'ws',
  'grpc',
  'http',
  'h2',
  'quic',
  'httpupgrade',
  'xhttp',
  'udp',
]);

export const NodeIRAuthSchema = z
  .object({
    uuid: z.string().optional(),
    password: z.string().optional(),
    username: z.string().optional(),
    cipher: z.string().optional(),
    alterId: z.number().int().nonnegative().optional(),
    psk: z.string().optional(),
    token: z.string().optional(),
    privateKey: z.string().optional(),
    publicKey: z.string().optional(),
    presharedKey: z.string().optional(),
    flow: z.string().optional(),
    encryption: z.string().optional(),
  })
  .passthrough();

export const NodeIRTransportSchema = z
  .object({
    type: NodeIRTransportTypeSchema.default('tcp'),
    path: z.string().optional(),
    host: z.union([z.string(), z.array(z.string())]).optional(),
    headers: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
    serviceName: z.string().optional(),
    mode: z.string().optional(),
    headerType: z.string().optional(),
    quicSecurity: z.string().optional(),
    quicKey: z.string().optional(),
    xhttpOpts: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const NodeIRRealitySchema = z
  .object({
    publicKey: z.string().optional(),
    shortId: z.string().optional(),
    spiderX: z.string().optional(),
    supportX25519mlkem768: z.boolean().optional(),
    mldsa65Verify: z.string().optional(),
  })
  .passthrough();

export const NodeIREchSchema = z
  .object({
    enabled: z.boolean().optional(),
    config: z.string().optional(),
    queryServerName: z.string().optional(),
  })
  .passthrough();

export const NodeIRTlsSchema = z
  .object({
    enabled: z.boolean().default(false),
    security: z.enum(['none', 'tls', 'reality']).default('none'),
    sni: z.string().optional(),
    alpn: z.array(z.string()).optional(),
    skipCertVerify: z.boolean().optional(),
    clientFingerprint: z.string().optional(),
    fingerprint: z.string().optional(),
    pinnedPeerCertSha256: z.string().optional(),
    disableSni: z.boolean().optional(),
    reality: NodeIRRealitySchema.optional(),
    ech: NodeIREchSchema.optional(),
  })
  .passthrough();

export const NodeIRMetadataSchema = z
  .object({
    region: z.string().optional(),
    regionZh: z.string().optional(),
    regionCode: z.string().optional(),
    flag: z.string().optional(),
    cleanName: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

export const NodeIRSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    protocol: NodeIRProtocolSchema,
    server: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    udp: z.boolean().optional(),
    tfo: z.boolean().optional(),
    dialerProxy: z.string().optional(),
    auth: NodeIRAuthSchema.optional(),
    transport: NodeIRTransportSchema.optional(),
    tls: NodeIRTlsSchema.optional(),
    protocolParams: z.record(z.string(), z.unknown()).optional(),
    metadata: NodeIRMetadataSchema.optional(),
    sourceUrl: z.string().optional(),
  })
  .passthrough();

/**
 * 校验并解析 NodeIR（安全模式，不抛异常）
 * @param {unknown} input
 */
export function validateNodeIR(input) {
  return NodeIRSchema.safeParse(input);
}

/**
 * 校验并解析 NodeIR（严格模式，失败抛 ZodError）
 * @param {unknown} input
 * @returns {import('../types.js').NodeIR}
 */
export function parseNodeIR(input) {
  return NodeIRSchema.parse(input);
}
