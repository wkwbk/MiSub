
export const SUBSCRIPTION_STATUS_FILTERS = {
  missing: 'all',
  disabled: 'disabled',
  error: 'error',
  expired: 'expired',
  'low-traffic': 'low-traffic',
  'zero-nodes': 'zero-nodes',
};

export function resolveSubscriptionStatusFilter(status) {
  if (typeof status !== 'string') return null;
  const key = status.trim().toLowerCase();
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(SUBSCRIPTION_STATUS_FILTERS, key)
    ? SUBSCRIPTION_STATUS_FILTERS[key]
    : null;
}

export function matchesSubscriptionStatus(sub, filter, now = Date.now()) {
  if (!filter || filter === 'all') return true;
  if (!sub) return false;

  switch (filter) {
    case 'disabled':
      return !sub.enabled;
    case 'error':
      return Boolean(sub.lastError);
    case 'expired':
      return getSubscriptionTrafficState(sub, now) === 'expired';
    case 'low-traffic':
      return getSubscriptionTrafficState(sub, now) === 'low';
    case 'zero-nodes':
      return Number(sub.nodeCount || 0) === 0;
    default:
      return true;
  }
}

export function getSubscriptionTrafficState(sub, now = Date.now()) {
  const info = sub?.userInfo;
  if (!sub?.enabled || !info) return null;

  const total = Number(info.total || 0);
  const used = Number(info.upload || 0) + Number(info.download || 0);
  const expire = Number(info.expire || 0);

  if (expire > 0 && expire * 1000 < now) return 'expired';
  if (total > 0 && Math.max(0, total - used) / total <= 0.2) return 'low';
  return null;
}

export const SETTINGS_TAB_IDS = ['basic', 'home', 'custom-page', 'global', 'transform', 'service', 'system'];

export const SETTINGS_ACTIVE_TAB_STORAGE_KEY = 'misub:settings-active-tab';

export function resolveSettingsTab(tab) {
  if (typeof tab !== 'string') return null;
  const raw = tab.trim().toLowerCase();
  if (!raw) return null;
  const normalized = raw === 'custompage' ? 'custom-page' : raw;
  return SETTINGS_TAB_IDS.includes(normalized) ? normalized : null;
}

export const SETTINGS_FOCUS_TABS = {
  mytoken: 'basic',
  profiletoken: 'basic',
};

export const SETTINGS_FOCUS_ANCHORS = {
  mytoken: 'setting-mytoken',
  profiletoken: 'setting-profileToken',
};

function normalizeFocusKey(focus) {
  if (typeof focus !== 'string') return '';
  return focus.trim().toLowerCase();
}

export function resolveSettingsFocusTab(focus) {
  const key = normalizeFocusKey(focus);
  if (!key) return null;
  return SETTINGS_FOCUS_TABS[key] || null;
}

export function resolveSettingsFocusAnchor(focus) {
  const key = normalizeFocusKey(focus);
  if (!key) return null;
  return SETTINGS_FOCUS_ANCHORS[key] || null;
}

export function resolveProfileFocus(focus) {
  if (typeof focus !== 'string') return null;
  return focus.trim().toLowerCase() === 'profiles' ? 'profiles' : null;
}

export function countSubscriptionsByStatus(subscriptions = [], filter) {
  return subscriptions.filter((sub) => matchesSubscriptionStatus(sub, filter)).length;
}
