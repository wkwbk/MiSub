import type { SubscriptionItem } from '../types.js';

export type SubscriptionLike = Partial<SubscriptionItem>;

/**
 * 判断订阅是否参与自动刷新（定时任务 / 一键刷新 / 拉取时统计回写）。
 * 未设置该字段时默认开启；仅显式 `autoUpdate === false` 时视为停更。
 */
export function isAutoUpdateEnabled(subscription: SubscriptionLike | null | undefined): boolean {
  return subscription?.autoUpdate !== false;
}

/**
 * 判断订阅是否处于暂停自动刷新状态。
 */
export function isAutoUpdatePaused(subscription: SubscriptionLike | null | undefined): boolean {
  return subscription?.autoUpdate === false;
}

/**
 * 过滤出允许自动刷新的订阅列表。
 */
export function filterAutoUpdateSubscriptions<T extends SubscriptionLike>(subscriptions: T[]): T[] {
  return Array.isArray(subscriptions) ? subscriptions.filter((sub) => isAutoUpdateEnabled(sub)) : [];
}
