/**
 * 订阅流量/到期信息聚合、通知时间格式化与内置配置段落提取工具
 */

export function maskSensitiveLogValue(value) {
  const text = String(value ?? '');
  if (!text) return '';
  if (text.length <= 8) return '***';
  return `${text.slice(0, 4)}…${text.slice(-4)} (${text.length})`;
}

export function extractProxySectionFromBuiltin(content, targetFormat) {
  if (typeof content !== 'string' || content.trim() === '') return '';

  if (targetFormat === 'clash') {
    const match = content.match(/proxies:\s*\n([\s\S]*?)\n\nproxy-groups:/i);
    return match ? match[1].trim() : '';
  }

  if (targetFormat.startsWith('surge') || targetFormat === 'loon' || targetFormat === 'shadowrocket') {
    const match = content.match(/\[Proxy\]\s*\n([\s\S]*?)(?:\n\n\[|$)/i);
    if (!match) return '';
    return match[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^DIRECT\s*=\s*direct$/i.test(line))
      .join('\n');
  }

  if (targetFormat === 'quanx') {
    const match = content.match(/\[server_local\]\s*\n([\s\S]*?)(?:\n\n\[|$)/i);
    if (!match) return '';
    return match[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^DIRECT\s*=\s*direct$/i.test(line))
      .join('\n');
  }

  if (targetFormat === 'singbox' || targetFormat === 'sing-box') {
    try {
      const config = JSON.parse(content);
      if (config.outbounds && Array.isArray(config.outbounds)) {
        // 过滤掉 direct, block, dns-out 等元 outbound
        const proxies = config.outbounds.filter((o) => o.type !== 'direct' && o.type !== 'block' && o.type !== 'dns');
        return JSON.stringify(proxies, null, 2);
      }
    } catch {
      return '';
    }
  }

  return '';
}

export function buildManagedConfigUrl(requestUrl) {
  const managedUrl = new URL(requestUrl);
  managedUrl.searchParams.delete('refresh');
  managedUrl.searchParams.delete('nocache');
  return managedUrl.toString();
}

/**
 * 解析并确定客户端订阅更新周期（单位：小时）
 * 优先级：Profile 覆盖设置 > 全局设置 (profileUpdateInterval / UpdateInterval) > 默认推荐 24 小时
 * 若显式配置为 0 或负数，则视为禁用注入（返回 null）
 * @param {Object} [profile]
 * @param {Object} [config]
 * @returns {number|null} 周期（小时），若为 null 则不注入 Profile-Update-Interval
 */
export function resolveProfileUpdateInterval(profile, config) {
  const rawVal =
    profile?.profileUpdateInterval ??
    profile?.updateInterval ??
    config?.profileUpdateInterval ??
    config?.UpdateInterval;

  if (rawVal === undefined || rawVal === null || rawVal === '') {
    return 24;
  }
  const num = Number(rawVal);
  if (!Number.isFinite(num)) {
    return 24;
  }
  if (num <= 0) {
    return null;
  }
  // 兼容配置为秒（如 86400）的历史遗留情况
  if (num >= 3600 && num % 3600 === 0) {
    return Math.round(num / 3600);
  }
  return Math.round(num);
}

export function getCurrentRequestUserInfo(context, sub) {
  const currentInfo = context?.currentSubscriptionRuntimeInfo || {};
  const runtimeKey = [sub?.id, sub?.url].find((key) => key && Object.prototype.hasOwnProperty.call(currentInfo, key));
  if (runtimeKey) {
    return currentInfo[runtimeKey]?.userInfo || null;
  }
  return sub?.userInfo || null;
}

export function mergeSubscriptionUserInfo(context, subscriptions) {
  const strategy = context?.config?.mergeExpireStrategy || 'max';
  return subscriptions.reduce(
    (acc, sub) => {
      const userInfo = sub?.enabled ? getCurrentRequestUserInfo(context, sub) : null;
      if (!userInfo) return acc;

      let nextExpire = acc.expire;
      if (userInfo.expire > 0) {
        if (acc.expire === 0) {
          nextExpire = userInfo.expire;
        } else {
          nextExpire =
            strategy === 'min' ? Math.min(acc.expire, userInfo.expire) : Math.max(acc.expire, userInfo.expire);
        }
      }

      if (sub?.excludeTraffic) {
        return {
          ...acc,
          expire: nextExpire,
        };
      }

      return {
        upload: (acc.upload || 0) + (userInfo.upload || 0),
        download: (acc.download || 0) + (userInfo.download || 0),
        total: (acc.total || 0) + (userInfo.total || 0),
        expire: nextExpire,
      };
    },
    { upload: 0, download: 0, total: 0, expire: 0 },
  );
}

export function buildUserInfoHeaderFromSubscriptions(context, subscriptions, profileExpiresAt = '') {
  const totalUserInfo = mergeSubscriptionUserInfo(context, subscriptions);

  const profileExpireTimestamp = profileExpiresAt ? Math.floor(new Date(profileExpiresAt).getTime() / 1000) : 0;
  const safeUserInfo = {
    upload: isFinite(totalUserInfo.upload) ? totalUserInfo.upload : 0,
    download: isFinite(totalUserInfo.download) ? totalUserInfo.download : 0,
    total: isFinite(totalUserInfo.total) ? totalUserInfo.total : 0,
    expire:
      profileExpireTimestamp > 0 ? profileExpireTimestamp : isFinite(totalUserInfo.expire) ? totalUserInfo.expire : 0,
  };

  return safeUserInfo.total > 0
    ? `upload=${safeUserInfo.upload}; download=${safeUserInfo.download}; total=${safeUserInfo.total}; expire=${safeUserInfo.expire}`
    : null;
}

function resolveNotificationExpireDate(profileExpiresAt, mergedExpireTimestamp = 0) {
  let date = profileExpiresAt ? new Date(profileExpiresAt) : null;
  if (!date || Number.isNaN(date.getTime())) {
    const timestamp = Number(mergedExpireTimestamp);
    date =
      Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp > 1e12 ? timestamp : timestamp * 1000) : null;
  }

  return !date || Number.isNaN(date.getTime()) ? null : date;
}

export function formatNotificationExpireTime(profileExpiresAt, mergedExpireTimestamp = 0) {
  const date = resolveNotificationExpireDate(profileExpiresAt, mergedExpireTimestamp);

  if (!date) return '未设置';

  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  });
}

export function formatNotificationExpireStatus(
  profileExpiresAt,
  mergedExpireTimestamp = 0,
  now = Date.now(),
  thresholdDays = 3,
) {
  const date = resolveNotificationExpireDate(profileExpiresAt, mergedExpireTimestamp);
  if (!date) return '正常';
  if (date.getTime() <= now) return '已到期';

  const threshold = Number.isFinite(Number(thresholdDays)) ? Math.max(0, Number(thresholdDays)) : 3;
  const remainingMs = date.getTime() - now;
  if (remainingMs <= threshold * 24 * 60 * 60 * 1000) return '即将到期';
  return '正常';
}

export function formatSubscriptionExpireTime(expireTimestamp) {
  const timestamp = Number(expireTimestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';

  const date = new Date(timestamp * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function countSubscriptionNodes(nodeList, prependedContent = '') {
  const lines = String(nodeList || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const prependedLines = String(prependedContent || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (prependedLines.length > 0 && prependedLines.every((line, index) => lines[index] === line)) {
    return Math.max(0, lines.length - prependedLines.length);
  }

  return lines.length;
}
