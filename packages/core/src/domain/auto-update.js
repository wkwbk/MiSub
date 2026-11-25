/**
 * 判断订阅是否参与自动刷新（定时任务 / 一键刷新 / 拉取时统计回写）。
 * 未设置该字段时默认开启；仅显式 `autoUpdate === false` 时视为停更。
 *
 * @param {Object} subscription
 * @returns {boolean}
 */
export function isAutoUpdateEnabled(subscription) {
  return subscription?.autoUpdate !== false;
}

/**
 * 判断订阅是否处于暂停自动刷新状态。
 *
 * @param {Object} subscription
 * @returns {boolean}
 */
export function isAutoUpdatePaused(subscription) {
  return subscription?.autoUpdate === false;
}

/**
 * 过滤出允许自动刷新的订阅列表。
 *
 * @param {Array} subscriptions
 * @returns {Array}
 */
export function filterAutoUpdateSubscriptions(subscriptions) {
  return Array.isArray(subscriptions) ? subscriptions.filter((sub) => isAutoUpdateEnabled(sub)) : [];
}
