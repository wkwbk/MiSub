/**
 * 通知服务 (核心实现)
 * @author MiSub Team
 */

export interface TgNotificationSettings {
  botToken?: string;
  chatId?: string;
  [key: string]: unknown;
}

interface IpGeolocationInfo {
  country?: string;
  city?: string;
  isp?: string;
  asn?: string | number;
}

interface IpGeolocationProvider {
  name: string;
  supports?: (ip: string) => boolean;
  buildUrl: (ip: string) => string;
  requestInit?: RequestInit;
  read?: (response: Response) => Promise<unknown>;
  parse: (data: unknown) => IpGeolocationInfo | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asOptionalAsn(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

/**
 * 转义 Telegram HTML 模式下的特殊字符
 */
export function tgEscape(text: unknown): string {
  if (typeof text !== 'string') return String(text || '');
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function splitIpCnLocation(value: string | undefined): string[] {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function isLikelyCarrier(value: string | undefined): boolean {
  return /(?:移动|联通|电信|電信|广电|廣電|铁通|鐵通|教育网|教育網|宽带|寬帶|通信|通訊|网络|網絡|中华电信|中華電信|台湾大哥大|台灣大哥大|远传|遠傳|台湾之星|台灣之星|亚太电信|亞太電信)$/i.test(
    String(value || '').trim(),
  );
}

function parseIpCnHtml(html: unknown): IpGeolocationInfo | null {
  const text = String(html || '');
  const description = text
    .match(/<meta\s+name=["']description["']\s+content=["'][^"']*?归属地为[：:]\s*([^，,"'<]+?)(?:，|提供|["'])/i)?.[1]
    ?.trim();
  const tableLocation = text
    .match(/所在地理位置[\s\S]*?<td[^>]*>[\s\S]*?<span[^>]*>\s*([^<]+?)\s*<\/span>/i)?.[1]
    ?.trim();
  const tableParts = splitIpCnLocation(tableLocation);
  const descriptionParts = splitIpCnLocation(description);

  if (tableParts.length > 0) {
    const result: IpGeolocationInfo = {
      country: tableParts[0],
      city: tableParts.slice(1).join(' '),
    };
    const descriptionStartsWithTable = tableParts.every((part, index) => descriptionParts[index] === part);
    const extraParts = descriptionStartsWithTable ? descriptionParts.slice(tableParts.length) : [];
    const carrier = extraParts.at(-1);

    if (isLikelyCarrier(carrier)) {
      const extraPlaceParts = extraParts.slice(0, -1);
      result.city = [...tableParts.slice(1), ...extraPlaceParts].join(' ');
      result.isp = carrier;
    }

    return result;
  }

  if (descriptionParts.length === 0) return null;
  const carrier = descriptionParts.at(-1);
  const hasCarrier = isLikelyCarrier(carrier);
  const placeParts = hasCarrier ? descriptionParts.slice(0, -1) : descriptionParts;
  return {
    country: placeParts[0],
    city: placeParts.slice(1).join(' '),
    isp: hasCarrier ? carrier : undefined,
  };
}

const IP_GEOLOCATION_PROVIDERS: IpGeolocationProvider[] = [
  {
    name: 'ip.cn',
    supports: (ip) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip),
    buildUrl: (ip) => `https://ip.cn/ip/${encodeURIComponent(ip)}.html`,
    requestInit: {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: 'https://ip.cn/',
      },
    },
    read: (response) => response.text(),
    parse: parseIpCnHtml,
  },
  {
    name: 'ipwho.is',
    buildUrl: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}`,
    parse: (data) => {
      if (!isRecord(data) || !data.success) return null;
      const conn = isRecord(data.connection) ? data.connection : null;
      return {
        country: asOptionalString(data.country),
        city: asOptionalString(data.city),
        isp: asOptionalString(conn?.org) || asOptionalString(conn?.isp),
        asn: asOptionalAsn(conn?.asn),
      };
    },
  },
  {
    name: 'ipapi.co',
    buildUrl: (ip) => `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    parse: (data) => {
      if (!isRecord(data) || data.error) return null;
      return {
        country: asOptionalString(data.country_name) || asOptionalString(data.country),
        city: asOptionalString(data.city),
        isp: asOptionalString(data.org) || asOptionalString(data.network),
        asn: asOptionalAsn(data.asn),
      };
    },
  },
  {
    name: 'ipinfo.io',
    buildUrl: (ip) => `https://ipinfo.io/${encodeURIComponent(ip)}/json`,
    parse: (data) => {
      if (!isRecord(data) || data.bogon || data.error) return null;
      const orgStr = asOptionalString(data.org);
      return {
        country: asOptionalString(data.country),
        city: asOptionalString(data.city),
        isp: orgStr,
        asn: asOptionalAsn(data.asn) || String(orgStr || '').match(/^AS\d+/)?.[0],
      };
    },
  },
];

function hasGeolocationValue(info: IpGeolocationInfo | null | undefined): info is IpGeolocationInfo {
  return Boolean(
    info && Object.values(info).some((value) => value !== undefined && value !== null && String(value).trim() !== ''),
  );
}

function mergeMissingGeolocationValues(
  current: IpGeolocationInfo = {},
  incoming: IpGeolocationInfo = {},
): IpGeolocationInfo {
  const merged: IpGeolocationInfo = { ...current };
  if (!merged.country && incoming.country) merged.country = incoming.country;
  if (!merged.city && incoming.city) merged.city = incoming.city;
  if (!merged.isp && incoming.isp) merged.isp = incoming.isp;
  if (!merged.asn && incoming.asn) merged.asn = incoming.asn;
  return merged;
}

async function fetchIpGeolocation(clientIp: string): Promise<IpGeolocationInfo | null> {
  if (
    !clientIp ||
    clientIp === 'N/A' ||
    clientIp === 'Unknown' ||
    !/^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+$/i.test(clientIp)
  )
    return null;

  let result: IpGeolocationInfo = {};
  for (const provider of IP_GEOLOCATION_PROVIDERS) {
    if (provider.supports && !provider.supports(clientIp)) continue;
    try {
      const response = await fetch(provider.buildUrl(clientIp), {
        cf: { timeout: 3000 },
        ...provider.requestInit,
      });
      if (!response.ok) continue;
      const body = provider.read ? await provider.read(response) : await response.json();
      const info = provider.parse(body);
      if (!hasGeolocationValue(info)) continue;

      result = mergeMissingGeolocationValues(result, info);
      if (result.country && result.city && result.isp && result.asn) return result;
    } catch (error) {
      console.debug(`[NotificationService] ${provider.name} geolocation failed:`, error);
    }
  }

  return hasGeolocationValue(result) ? result : null;
}

/**
 * 发送基本的Telegram通知
 */
export async function sendTgNotification(settings: TgNotificationSettings, message: string): Promise<boolean> {
  if (!settings.botToken || !settings.chatId) {
    return false;
  }

  // 为所有消息添加时间戳
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const fullMessage = `${message}\n\n<b>时间:</b> <code>${now} (UTC+8)</code>`;

  const url = `https://api.telegram.org/bot${settings.botToken}/sendMessage`;
  const payload = {
    chat_id: settings.chatId,
    text: fullMessage,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[NotificationService] TG API Error:', response.status, errorData);
    }

    return response.ok;
  } catch (error) {
    console.error('[NotificationService] Network Error:', error);
    return false;
  }
}

/**
 * 增强版TG通知，包含IP地理位置信息
 */
export async function sendEnhancedTgNotification(
  settings: TgNotificationSettings,
  type: string,
  clientIp: string,
  additionalData = '',
): Promise<boolean> {
  if (!settings.botToken || !settings.chatId) {
    return false;
  }

  let locationInfo = '';

  const ipInfo = await fetchIpGeolocation(clientIp);
  if (ipInfo) {
    const asn = ipInfo.asn ? (String(ipInfo.asn).startsWith('AS') ? ipInfo.asn : `AS${ipInfo.asn}`) : 'N/A';
    locationInfo = `
<b>国家:</b> <code>${tgEscape(ipInfo.country || 'N/A')}</code>
<b>城市:</b> <code>${tgEscape(ipInfo.city || 'N/A')}</code>
<b>ISP:</b> <code>${tgEscape(ipInfo.isp || 'N/A')}</code>
<b>ASN:</b> <code>${tgEscape(asn)}</code>`;
  }

  // 构建完整消息
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const message = `${type}

<b>IP 地址:</b> <code>${tgEscape(clientIp)}</code>${locationInfo}

${additionalData}

<b>时间:</b> <code>${now} (UTC+8)</code>`;

  const url = `https://api.telegram.org/bot${settings.botToken}/sendMessage`;
  const payload = {
    chat_id: settings.chatId,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[NotificationService] TG API Error (Enhanced):', response.status, errorData);
    }

    return response.ok;
  } catch (error) {
    console.error('[NotificationService] Network Error (Enhanced):', error);
    return false;
  }
}

/**
 * 调试发送Telegram通知（返回详细错误信息）
 */
export async function debugTgNotification(
  settings: TgNotificationSettings,
  message: string,
): Promise<{ success: boolean; response?: unknown; error?: string }> {
  if (!settings.botToken || !settings.chatId) {
    return { success: false, error: 'botToken or chatId not configured' };
  }

  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const fullMessage = `${message}\n\n<b>时间:</b> <code>${now} (UTC+8)</code>`;

  const url = `https://api.telegram.org/bot${settings.botToken}/sendMessage`;
  const payload = {
    chat_id: settings.chatId,
    text: fullMessage,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      return { success: true, response: data };
    } else {
      return {
        success: false,
        error: `Telegram API Error: ${response.status} ${response.statusText}`,
        response: data,
      };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Network/Fetch Error: ${msg}`,
    };
  }
}
