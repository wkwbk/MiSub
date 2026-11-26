import type { BoundRequestContext, Env } from '../../../types.js';
import { anonymizeLogToken, LogService } from '../../../services/log-service.js';

interface GenerationStats {
  totalNodes?: number;
  sourceCount?: number;
  successCount?: number;
  failCount?: number;
  duration?: number;
}

export interface LogAccessSuccessOptions {
  context?: (BoundRequestContext & {
    generationStats?: GenerationStats;
    accessLogPersistenceMode?: string;
  }) | null;
  env: Env;
  request: Request & {
    cf?: {
      city?: string;
      asOrganization?: string;
      asn?: number;
      [key: string]: unknown;
    };
  };
  userAgentHeader: string;
  targetFormat: string;
  token?: string | null;
  profileIdentifier?: string | null;
  profileId?: string | null;
  subName?: string | null;
  domain?: string;
}

export function shouldSkipLogging(userAgentHeader: string): boolean {
  return userAgentHeader.includes('MiSub-Backend') || userAgentHeader.includes('TelegramBot');
}

export function logAccessSuccess({
  context,
  env,
  request,
  userAgentHeader,
  targetFormat,
  token,
  profileIdentifier,
  profileId = null,
  subName,
  domain,
}: LogAccessSuccessOptions): void {
  const stats: GenerationStats = context?.generationStats || {};
  const clientIp =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Real-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'N/A';
  const country = request.headers.get('CF-IPCountry') || 'N/A';

  const payload = {
    profileId: profileId || undefined,
    profileName: subName || 'Unknown Profile',
    clientIp,
    geoInfo: {
      country,
      city: request.cf?.city,
      isp: request.cf?.asOrganization,
      asn: request.cf?.asn,
    },
    userAgent: userAgentHeader || 'Unknown',
    status: 'success',
    format: targetFormat,
    type: profileIdentifier ? 'profile' : 'token',
    token: anonymizeLogToken(profileIdentifier ? profileIdentifier : token || '', profileIdentifier ? 'profile' : 'token'),
    domain,
    persistenceMode: context?.accessLogPersistenceMode || 'light',
    details: {
      totalNodes: stats.totalNodes || 0,
      sourceCount: stats.sourceCount || 0,
      successCount: stats.successCount || 0,
      failCount: stats.failCount || 0,
      duration: stats.duration || 0,
    },
    summary: `生成 ${stats.totalNodes || 0} 个节点 (成功: ${stats.successCount || 0}, 失败: ${stats.failCount || 0})`,
  };

  if (context?.waitUntil) {
    context.waitUntil(LogService.addLog(env, payload));
  }
}
