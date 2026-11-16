// FILE: src/composables/useSubscriptions.js
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useDataStore } from '@/stores/useDataStore';
import { useToastStore } from '@/stores/toast.js';
import { batchUpdateNodes, fetchNodeCount } from '@/lib/api.js';
import { handleError } from '@/utils/errorHandler.js';
import { TIMING } from '@/constants/timing.js';
import { t } from '@/i18n/index.js';
import {
    collectSubscriptionGroups,
    getSubscriptionGroup,
    normalizeSubscriptionGroupName,
} from '@/utils/subscription-groups.js';

const isDev = import.meta.env.DEV;

export function useSubscriptions(markDirty) {
    const { showToast } = useToastStore();
    const dataStore = useDataStore();
    // Rename the store ref to avoid confusion, as it contains ALL items
    const { subscriptions: allSubscriptions } = storeToRefs(dataStore);

    // Filtered computed property: Only http/https links are "Subscriptions"
    const subscriptions = computed(() => {
        return (allSubscriptions.value || []).filter(
            (sub) => sub.url && /^https?:\/\//.test(sub.url)
        );
    });

    const searchQuery = ref('');
    const activeGroupFilter = ref(null);
    const refreshError = ref(false);
    const lastRefreshAt = ref(null);
    const isRefreshing = ref(false);
    const subscriptionGroups = computed(() => collectSubscriptionGroups(subscriptions.value));

    function setGroupFilter(group) {
        activeGroupFilter.value = group || null;
    }

    function renameSubscriptionGroup(oldName, newName) {
        const normalizedOld = normalizeSubscriptionGroupName(oldName);
        const normalizedNew = normalizeSubscriptionGroupName(newName);
        if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew) return;

        let changed = false;
        subscriptions.value.forEach((sub) => {
            if (getSubscriptionGroup(sub) === normalizedOld) {
                dataStore.updateSubscription(sub.id, {
                    ...sub,
                    group: normalizedNew,
                    airportIdentity: null,
                });
                changed = true;
            }
        });
        if (activeGroupFilter.value === normalizedOld) {
            activeGroupFilter.value = normalizedNew;
        }
        if (changed) markDirty();
    }

    function deleteSubscriptionGroup(groupName) {
        const normalized = normalizeSubscriptionGroupName(groupName);
        if (!normalized) return;

        let changed = false;
        subscriptions.value.forEach((sub) => {
            if (getSubscriptionGroup(sub) === normalized) {
                dataStore.updateSubscription(sub.id, {
                    ...sub,
                    group: '',
                    airportIdentity: null,
                });
                changed = true;
            }
        });
        if (activeGroupFilter.value === normalized) {
            activeGroupFilter.value = null;
        }
        if (changed) markDirty();
    }
    const filteredSubscriptions = computed(() => {
        const query = searchQuery.value.trim().toLowerCase();
        if (!query) return subscriptions.value;

        return subscriptions.value.filter((sub) =>
            [
                sub.name,
                sub.description,
                sub.remark,
                sub.note,
                sub.website,
                sub.url,
                sub.customId,
            ].some((value) =>
                String(value || '')
                    .toLowerCase()
                    .includes(query)
            )
        );
    });

    const enabledSubscriptions = computed(() => subscriptions.value.filter((s) => s.enabled));

    const totalRemainingTraffic = computed(() => {
        const REASONABLE_TRAFFIC_LIMIT_BYTES = 10 * 1024 * 1024 * 1024 * 1024 * 1024; // 10 PB in bytes
        return subscriptions.value.reduce((acc, sub) => {
            if (sub.excludeTraffic) return acc;
            if (
                sub.enabled &&
                sub.userInfo &&
                sub.userInfo.total > 0 &&
                sub.userInfo.total < REASONABLE_TRAFFIC_LIMIT_BYTES
            ) {
                const used = (sub.userInfo.upload || 0) + (sub.userInfo.download || 0);
                const remaining = sub.userInfo.total - used;
                return acc + Math.max(0, remaining);
            }
            return acc;
        }, 0);
    });

    async function handleUpdateNodeCount(subId, isInitialLoad = false) {
        // Find in the filtered list
        const subToUpdate = subscriptions.value.find((s) => s.id === subId);
        if (!subToUpdate) return false;
        // Double check URL just in case
        if (!subToUpdate.url.startsWith('http')) return false;

        if (!isInitialLoad) {
            subToUpdate.isUpdating = true;
        }

        // 添加超时保护:如果30秒后仍在更新状态,强制重置
        const timeoutId = setTimeout(() => {
            if (subToUpdate.isUpdating) {
                console.warn(
                    `[handleUpdateNodeCount] Timeout protection triggered for ${subToUpdate.name}`
                );
                subToUpdate.isUpdating = false;
                if (!isInitialLoad) {
                    showToast(
                        t('subscriptions.updateTimeoutReset', {
                            name: subToUpdate.name || t('subscriptions.fallbackName'),
                        }),
                        'warning'
                    );
                }
            }
        }, TIMING.REQUEST_TIMEOUT_MS);

        try {
            const result = await fetchNodeCount(
                subToUpdate.url,
                subToUpdate.fetchProxy,
                Boolean(subToUpdate.plusAsSpace),
                subToUpdate.customUserAgent
            );

            // 清除超时保护
            clearTimeout(timeoutId);

            // 检查是否成功
            if (!result.success) {
                const subscriptionName = subToUpdate.name || t('subscriptions.fallbackName');
                let userMessage = t('subscriptions.updateFailed', { name: subscriptionName });

                // 根据 errorType 提供更友好的错误提示
                switch (result.errorType) {
                    case 'timeout':
                        userMessage = t('subscriptions.updateTimeoutRetry', {
                            name: subscriptionName,
                        });
                        break;
                    case 'network':
                        userMessage = t('subscriptions.networkFailed', { name: subscriptionName });
                        break;
                    case 'server':
                        userMessage = t('subscriptions.serverError', { name: subscriptionName });
                        break;
                    default:
                        userMessage = t('subscriptions.updateFailedWithMessage', {
                            name: subscriptionName,
                            message: result.error || t('subscriptions.unknownError'),
                        });
                }

                if (result.errorType === 'server' && (result.error || result.status)) {
                    userMessage = t('subscriptions.updateFailedWithMessage', {
                        name: subscriptionName,
                        message: result.error || `HTTP ${result.status}`,
                    });
                }

                // 只有非静默加载时才显示 Toast
                if (!isInitialLoad) showToast(userMessage, 'error');
                console.error(
                    `[handleUpdateNodeCount] Failed for ${subToUpdate.name}:`,
                    result.error
                );

                // 重要: 记录错误到本地对象中(非持久化,仅用于UI展示,直到下次持久化保存)
                subToUpdate.lastError = result.error;
                if (subToUpdate.enableNodeCache !== true) {
                    subToUpdate.nodeCount = 0;
                    subToUpdate.userInfo = null;
                    if (!isInitialLoad) {
                        markDirty();
                        void dataStore.saveData();
                    }
                }
                return false; // 开启保护性缓存节点时，失败保留旧值
            }

            // 成功获取数据
            const data = result.data.data || result.data; // 兼容后端返回结构
            subToUpdate.nodeCount = data.count || 0;
            subToUpdate.userInfo = data.userInfo || null;
            subToUpdate.lastError = null; // 成功后清除错误状态

            if (!isInitialLoad) {
                showToast(
                    t('subscriptions.updateSuccess', {
                        name: subToUpdate.name || t('subscriptions.fallbackName'),
                    }),
                    'success'
                );
                markDirty();
                // 自动保存手动更新的结果
                void dataStore.saveData();
            }
            return true;
        } catch (error) {
            // 清除超时保护
            clearTimeout(timeoutId);

            handleError(error, 'Subscription Update Error', {
                subscriptionName: subToUpdate.name,
                subscriptionId: subId,
                isInitialLoad,
            });

            const errorMessage = t('subscriptions.updateUnexpectedError', {
                name: subToUpdate.name || t('subscriptions.fallbackName'),
            });
            if (!isInitialLoad) {
                showToast(errorMessage, 'error');
            }
            return false;
        } finally {
            if (subToUpdate) subToUpdate.isUpdating = false;
        }
    }

    function addSubscription(sub) {
        dataStore.addSubscription(sub);
        handleUpdateNodeCount(sub.id);
        markDirty();
    }

    function updateSubscription(updatedSub) {
        // Verify it exists in our filtered list
        const originalSub = subscriptions.value.find((s) => s.id === updatedSub.id);
        if (originalSub) {
            const urlChanged = originalSub.url !== updatedSub.url;
            dataStore.updateSubscription(updatedSub.id, updatedSub);

            if (urlChanged) {
                // Re-fetch from filtered list to get the reactive object
                const sub = subscriptions.value.find((s) => s.id === updatedSub.id);
                if (sub) {
                    sub.nodeCount = 0;
                    handleUpdateNodeCount(sub.id);
                }
            }
            markDirty();
        }
    }

    function deleteSubscription(subId) {
        dataStore.removeSubscription(subId);
        // 清理组合订阅中对该订阅源的引用
        dataStore.removeSubscriptionFromProfiles(subId);
        markDirty();
    }

    function deleteAllSubscriptions() {
        // Only remove the subscriptions visible in this composable (i.e. HTTP subs)
        // Avoid removing manual nodes which are also in dataStore but filtered out here
        const idsToRemove = subscriptions.value.map((s) => s.id);

        // 如果没有订阅，提示并返回
        if (idsToRemove.length === 0) {
            showToast(t('subscriptions.noSubscriptionsToDelete'), 'info');
            return;
        }

        idsToRemove.forEach((id) => dataStore.removeSubscription(id));
        // 清理组合订阅中对这些订阅源的引用
        dataStore.removeSubscriptionFromProfiles(idsToRemove);

        markDirty();
        showToast(t('subscriptions.clearedCount', { count: idsToRemove.length }), 'success');
    }

    async function addSubscriptionsFromBulk(subs) {
        // Reverse insert to maintain order
        for (let i = subs.length - 1; i >= 0; i--) {
            dataStore.addSubscription(subs[i]);
        }
        markDirty();

        const subsToUpdate = subs.filter((sub) => sub.url && sub.url.startsWith('http'));

        if (subsToUpdate.length > 0) {
            showToast(t('subscriptions.batchUpdating', { count: subsToUpdate.length }), 'info');

            // Use individual updates instead of batch backend update
            // This avoids 400 error because backend doesn't have these IDs yet.
            const updatePromises = subsToUpdate.map((sub) => handleUpdateNodeCount(sub.id));

            // handleUpdateNodeCount 内部已逐个提示失败，自身不抛出，
            // 所以 Promise.allSettled 恒为 fulfilled —— 原先包在这里的 try/catch 是死代码。
            // 改为按返回值统计真实失败数，避免「有失败却提示全部完成」。
            const results = await Promise.allSettled(updatePromises);
            const failedCount = results.filter(
                (result) => result.status === 'rejected' || result.value === false
            ).length;
            if (failedCount > 0) {
                showToast(
                    t('subscriptions.bulkUpdatePartial', {
                        failed: failedCount,
                        total: subsToUpdate.length,
                    }),
                    'warning'
                );
            } else {
                showToast(t('subscriptions.bulkImportUpdateDone'), 'success');
            }
        } else {
            showToast(t('subscriptions.bulkImportDone'), 'success');
        }
    }

    function finalizeRefreshSummary(successCount, totalCount) {
        const failedCount = totalCount - successCount;
        refreshError.value = failedCount > 0;
        showToast(
            t('subscriptions.refreshDone', {
                success: successCount,
                total: totalCount,
                failed: failedCount,
            }),
            failedCount === 0 ? 'success' : successCount > 0 ? 'warning' : 'error'
        );

        if (successCount > 0) {
            markDirty();
            void dataStore.saveData();
        }
    }

    async function runSequentialFallbackUpdate(subsToUpdate) {
        showToast(t('subscriptions.refreshFallback'), 'warning');
        let fallbackSuccessCount = 0;
        for (const sub of subsToUpdate) {
            if (await handleUpdateNodeCount(sub.id, true)) {
                fallbackSuccessCount++;
            }
        }
        finalizeRefreshSummary(fallbackSuccessCount, subsToUpdate.length);
    }

    async function batchUpdateAllSubscriptions() {
        if (isRefreshing.value) {
            return;
        }

        const subsToUpdate = subscriptions.value.filter(
            (sub) => sub.enabled && sub.url && sub.url.startsWith('http') && !sub.isUpdating
        );

        if (subsToUpdate.length === 0) {
            showToast(t('subscriptions.noRefreshableSubscriptions'), 'info');
            return;
        }

        isRefreshing.value = true;
        refreshError.value = false;
        subsToUpdate.forEach((sub) => {
            sub.isUpdating = true;
        });
        showToast(t('subscriptions.refreshing', { count: subsToUpdate.length }), 'info');

        try {
            const result = await batchUpdateNodes(
                subsToUpdate.map((sub) => sub.id),
                subsToUpdate.map((sub) => ({
                    id: sub.id,
                    name: sub.name,
                    url: sub.url,
                    enabled: sub.enabled,
                    fetchProxy: sub.fetchProxy,
                    plusAsSpace: Boolean(sub.plusAsSpace),
                    customUserAgent: sub.customUserAgent,
                }))
            );

            if (result?.success) {
                let successCount = 0;
                const resultMap = new Map(
                    (Array.isArray(result.results) ? result.results : [])
                        .map((item) => [item.subscriptionId || item.id, item])
                        .filter(([id]) => Boolean(id))
                );

                for (const sub of subsToUpdate) {
                    const updateResult = resultMap.get(sub.id);
                    if (updateResult?.success) {
                        sub.nodeCount = updateResult.nodeCount ?? 0;
                        if (updateResult.userInfo !== undefined) {
                            sub.userInfo = updateResult.userInfo;
                        }
                        sub.lastError = null;
                        successCount++;
                    } else {
                        sub.lastError = updateResult?.error || t('subscriptions.unknownError');
                        if (sub.enableNodeCache !== true) {
                            sub.nodeCount = 0;
                            sub.userInfo = null;
                        }
                    }
                }

                finalizeRefreshSummary(successCount, subsToUpdate.length);
            } else {
                const failureReason =
                    result?.error || result?.message || t('subscriptions.unknownError');
                console.warn(
                    '[Subscriptions] Batch update failed, falling back to sequential update:',
                    failureReason
                );
                await runSequentialFallbackUpdate(subsToUpdate);
            }
        } catch (error) {
            handleError(error, 'Batch Subscription Update Error', {
                subscriptionCount: subsToUpdate.length,
            });
            await runSequentialFallbackUpdate(subsToUpdate);
        } finally {
            lastRefreshAt.value = new Date().toISOString();
            isRefreshing.value = false;
            subsToUpdate.forEach((sub) => {
                sub.isUpdating = false;
            });
        }
    }

    // ========== 定时自动更新功能 ==========
    const DEFAULT_INTERVAL_MS = TIMING.AUTO_UPDATE_INTERVAL_MS;
    let autoUpdateTimerId = null;
    let currentIntervalMs = DEFAULT_INTERVAL_MS;

    async function autoUpdateAllSubscriptions() {
        try {
            const subsToUpdate = subscriptions.value.filter(
                (sub) => sub.enabled && sub.url && sub.url.startsWith('http') && !sub.isUpdating
            );
            for (const sub of subsToUpdate) {
                await handleUpdateNodeCount(sub.id, true);
            }
        } catch (e) {
            // 后台定时任务：handleUpdateNodeCount 内部已逐个提示失败，
            // 且用户此刻可能不在页面上，这里只记日志，避免无意义的打扰。
            console.error('Auto update failed', e);
        }
    }

    function startAutoUpdate(intervalMinutes = null) {
        // 如果传入间隔，使用传入值；否则从 settings 读取
        let intervalMs;
        if (intervalMinutes !== null) {
            intervalMs = intervalMinutes * 60 * 1000;
        } else {
            const settings = dataStore.settings;
            const settingsInterval = Number(settings?.autoUpdateInterval);
            if (settingsInterval === 0) {
                intervalMs = 0;
            } else if (Number.isFinite(settingsInterval) && settingsInterval > 0) {
                intervalMs = settingsInterval * 60 * 1000;
            } else {
                intervalMs = DEFAULT_INTERVAL_MS;
            }
        }

        // 如果间隔为0，表示禁用自动更新
        if (intervalMs === 0) {
            stopAutoUpdate();
            if (isDev) console.debug('[AutoUpdate] Disabled by user setting');
            return;
        }

        // 如果间隔没变且定时器已运行，不需要重启
        if (autoUpdateTimerId && intervalMs === currentIntervalMs) {
            return;
        }

        // 停止旧定时器
        stopAutoUpdate();

        // 启动新定时器
        currentIntervalMs = intervalMs;
        autoUpdateTimerId = setInterval(() => {
            void autoUpdateAllSubscriptions();
        }, intervalMs);

        if (isDev)
            console.debug(`[AutoUpdate] Started with interval: ${intervalMs / 60000} minutes`);
    }

    function stopAutoUpdate() {
        if (autoUpdateTimerId) {
            clearInterval(autoUpdateTimerId);
            autoUpdateTimerId = null;
            if (isDev) console.debug('[AutoUpdate] Stopped');
        }
    }

    function restartAutoUpdate(intervalMinutes) {
        stopAutoUpdate();
        startAutoUpdate(intervalMinutes);
    }

    function reorderSubscriptions(newOrder) {
        // 1. Get all Manual Nodes (to preserve them)
        // We can't rely just on manualNodes computed because it might be filtered or not imported here.
        // Instead, filter from source of truth: allSubscriptions
        const currentManualNodes = (allSubscriptions.value || []).filter(
            (item) => !item.url || !/^https?:\/\//.test(item.url)
        );

        // 2. Combine New Ordered Subscriptions + Existing Manual Nodes
        // Logic: Manual Nodes at top, Subscriptions at bottom
        const mergedList = [...currentManualNodes, ...newOrder];

        // 3. Update Store
        dataStore.overwriteSubscriptions(mergedList);

        // 4. Mark Dirty
        markDirty();
    }

    return {
        subscriptions,
        subscriptionGroups,
        activeGroupFilter,
        setGroupFilter,
        renameSubscriptionGroup,
        deleteSubscriptionGroup,
        searchQuery,
        filteredSubscriptions,
        filteredCount: computed(() => filteredSubscriptions.value.length),
        isRefreshing,
        refreshError,
        lastRefreshAt,
        totalRemainingTraffic,
        enabledSubscriptionsCount: computed(() => enabledSubscriptions.value.length),
        addSubscription,
        updateSubscription,
        deleteSubscription,
        deleteAllSubscriptions,
        addSubscriptionsFromBulk,
        handleUpdateNodeCount,
        batchUpdateAllSubscriptions,
        startAutoUpdate,
        stopAutoUpdate,
        restartAutoUpdate,
        reorderSubscriptions,
    };
}
