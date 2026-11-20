// FILE: src/composables/useSubscriptions.js
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useDataStore } from '@/stores/useDataStore';
import { useToastStore } from '@/stores/toast.js';
import { batchUpdateNodes, fetchNodeCount } from '@/lib/api.js';
import { handleError } from '@/utils/errorHandler.js';
import { TIMING } from '@/constants/timing.js';
import { t } from '@/i18n/index.js';
import { useListPagination } from '@/composables/useListPagination.js';
import {
  applyItemTags,
  collectTags,
  computeBatchUpdatedTags,
  getItemTags,
  matchesTagFilter,
  normalizeActiveTagFilters,
  normalizeTagList,
  normalizeTagName,
  removeTagFromList,
  renameTagInList,
  toggleTagFilterValue,
} from '@/utils/tags.js';

const isDev = import.meta.env.DEV;

export function useSubscriptions(markDirty) {
  const { showToast } = useToastStore();
  const dataStore = useDataStore();
  const { subscriptions: allSubscriptions } = storeToRefs(dataStore);

  // Filtered computed property: Only http/https links are "Subscriptions"
  const subscriptions = computed(() => {
    return (allSubscriptions.value || []).filter((sub) => sub.url && /^https?:\/\//.test(sub.url));
  });

  const searchQuery = ref('');
  const activeTagFilters = ref([]);
  const refreshError = ref(false);
  const lastRefreshAt = ref(null);
  const isRefreshing = ref(false);

  const getSubscriptionTagOrder = () => dataStore.settings?.subscriptionTagOrder || [];
  const setSubscriptionTagOrder = (nextOrder) => {
    if (dataStore.settings && typeof dataStore.settings === 'object') {
      dataStore.settings.subscriptionTagOrder = nextOrder;
    }
  };

  const subscriptionTags = computed(() => {
    return collectTags(subscriptions.value, getSubscriptionTagOrder());
  });

  function setTagFilters(filters) {
    activeTagFilters.value = normalizeActiveTagFilters(filters);
  }

  function toggleTagFilter(tag) {
    activeTagFilters.value = toggleTagFilterValue(activeTagFilters.value, tag);
  }

  function renameSubscriptionTag(oldName, newName) {
    const normalizedOld = normalizeTagName(oldName);
    const normalizedNew = normalizeTagName(newName);
    if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew) return;

    let changed = false;
    subscriptions.value.forEach((sub) => {
      const { nextTags, changed: itemChanged } = renameTagInList(getItemTags(sub), normalizedOld, normalizedNew);
      if (itemChanged) {
        dataStore.updateSubscription(sub.id, applyItemTags(sub, nextTags));
        changed = true;
      }
    });

    const customOrder = getSubscriptionTagOrder();
    if (customOrder.includes(normalizedOld)) {
      const nextOrder = normalizeTagList(customOrder.map((tag) => (tag === normalizedOld ? normalizedNew : tag)));
      setSubscriptionTagOrder(nextOrder);
    }

    if (activeTagFilters.value.includes(normalizedOld)) {
      activeTagFilters.value = normalizeTagList(
        activeTagFilters.value.map((tag) => (tag === normalizedOld ? normalizedNew : tag)),
      );
    }

    if (changed) markDirty();
  }

  function deleteSubscriptionTag(tagName) {
    const normalized = normalizeTagName(tagName);
    if (!normalized) return;

    let changed = false;
    subscriptions.value.forEach((sub) => {
      const { nextTags, changed: itemChanged } = removeTagFromList(getItemTags(sub), normalized);
      if (itemChanged) {
        dataStore.updateSubscription(sub.id, applyItemTags(sub, nextTags));
        changed = true;
      }
    });

    const customOrder = getSubscriptionTagOrder();
    const nextOrder = customOrder.filter((tag) => tag !== normalized);
    if (nextOrder.length !== customOrder.length) {
      setSubscriptionTagOrder(nextOrder);
    }

    if (activeTagFilters.value.includes(normalized)) {
      activeTagFilters.value = activeTagFilters.value.filter((tag) => tag !== normalized);
    }

    if (changed) markDirty();
  }

  function reorderSubscriptionTags(newOrder) {
    setSubscriptionTagOrder(normalizeTagList(newOrder));
    markDirty();
  }

  const filteredSubscriptions = computed(() => {
    const tagMatched = subscriptions.value.filter((sub) => matchesTagFilter(sub, activeTagFilters.value));

    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return tagMatched;

    return tagMatched.filter((sub) =>
      [
        sub.name,
        sub.description,
        sub.remark,
        sub.note,
        sub.notes,
        sub.website,
        sub.url,
        sub.customId,
        ...getItemTags(sub),
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(query),
      ),
    );
  });

  const {
    currentPage: subscriptionsCurrentPage,
    itemsPerPage: subscriptionsPerPage,
    totalPages: subscriptionsTotalPages,
    paginatedItems: paginatedSubscriptions,
    changePage: changeSubscriptionsPage,
  } = useListPagination(filteredSubscriptions, {
    storageKey: 'subscriptionsPPS',
    resetDeps: [searchQuery, activeTagFilters],
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
    const subToUpdate = subscriptions.value.find((s) => s.id === subId);
    if (!subToUpdate) return false;
    if (!subToUpdate.url.startsWith('http')) return false;
    if (!isInitialLoad && subToUpdate.isUpdating) return false;

    if (!isInitialLoad) {
      subToUpdate.isUpdating = true;
    }

    const timeoutId = setTimeout(() => {
      if (subToUpdate.isUpdating) {
        console.warn(`[handleUpdateNodeCount] Timeout protection triggered for ${subToUpdate.name}`);
        subToUpdate.isUpdating = false;
        if (!isInitialLoad) {
          showToast(
            t('subscriptions.updateTimeoutReset', {
              name: subToUpdate.name || t('subscriptions.fallbackName'),
            }),
            'warning',
          );
        }
      }
    }, TIMING.REQUEST_TIMEOUT_MS);

    try {
      const result = await fetchNodeCount(
        subToUpdate.url,
        subToUpdate.fetchProxy,
        Boolean(subToUpdate.plusAsSpace),
        subToUpdate.customUserAgent,
      );

      clearTimeout(timeoutId);

      if (!result.success) {
        const subscriptionName = subToUpdate.name || t('subscriptions.fallbackName');
        let userMessage = t('subscriptions.updateFailed', { name: subscriptionName });

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

        if (!isInitialLoad) showToast(userMessage, 'error');
        console.error(`[handleUpdateNodeCount] Failed for ${subToUpdate.name}:`, result.error);

        subToUpdate.lastError = result.error;
        if (subToUpdate.enableNodeCache !== true) {
          subToUpdate.nodeCount = 0;
          subToUpdate.userInfo = null;
          if (!isInitialLoad) {
            markDirty();
            void dataStore.saveData();
          }
        }
        return false;
      }

      const data = result.data.data || result.data;
      subToUpdate.nodeCount = data.count || 0;
      subToUpdate.userInfo = data.userInfo || null;
      subToUpdate.lastError = null;

      if (!isInitialLoad) {
        showToast(
          t('subscriptions.updateSuccess', {
            name: subToUpdate.name || t('subscriptions.fallbackName'),
          }),
          'success',
        );
        markDirty();
        void dataStore.saveData();
      }
      return true;
    } catch (error) {
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
    const normalized = applyItemTags(sub, sub.tags);
    dataStore.addSubscription(normalized);
    handleUpdateNodeCount(normalized.id);
    markDirty();
  }

  function updateSubscription(updatedSub) {
    const originalSub = subscriptions.value.find((s) => s.id === updatedSub.id);
    if (originalSub) {
      const urlChanged = originalSub.url !== updatedSub.url;
      const rawTags = updatedSub.tags !== undefined ? updatedSub.tags : getItemTags(updatedSub);
      const normalized = applyItemTags(updatedSub, rawTags);
      dataStore.updateSubscription(normalized.id, normalized);

      if (urlChanged) {
        const sub = subscriptions.value.find((s) => s.id === normalized.id);
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
    dataStore.removeSubscriptionFromProfiles(subId);
    markDirty();
  }

  function batchUpdateSubscriptionTags(subIds, payload) {
    if (!subIds || subIds.length === 0) return;

    let mode = 'replace';
    let inputTags = payload;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      mode = payload.mode || 'append';
      inputTags = payload.tags;
    }

    const idsSet = new Set(subIds);
    const updates = subscriptions.value
      .filter((s) => idsSet.has(s.id))
      .map((s) => {
        const { nextTags, changed } = computeBatchUpdatedTags(getItemTags(s), inputTags, mode);
        if (!changed) return null;
        return { id: s.id, updates: applyItemTags(s, nextTags) };
      })
      .filter(Boolean);

    if (updates.length > 0) {
      updates.forEach(({ id, updates: nextSub }) => {
        dataStore.updateSubscription(id, nextSub);
      });
      markDirty();
      showToast(t('subscriptions.batchTagsUpdated', { count: updates.length }), 'success');
    }
  }

  function batchDeleteSubscriptions(subIds) {
    if (!subIds || subIds.length === 0) return;

    subIds.forEach((id) => {
      dataStore.removeSubscription(id);
    });
    dataStore.removeSubscriptionFromProfiles(subIds);

    markDirty();
    showToast(t('subscriptions.deletedCount', { count: subIds.length }), 'success');
  }

  function deleteAllSubscriptions() {
    const idsToRemove = subscriptions.value.map((s) => s.id);

    if (idsToRemove.length === 0) {
      showToast(t('subscriptions.noSubscriptionsToDelete'), 'info');
      return;
    }

    idsToRemove.forEach((id) => dataStore.removeSubscription(id));
    dataStore.removeSubscriptionFromProfiles(idsToRemove);

    markDirty();
    showToast(t('subscriptions.clearedCount', { count: idsToRemove.length }), 'success');
  }

  async function addSubscriptionsFromBulk(subs) {
    for (let i = subs.length - 1; i >= 0; i--) {
      const raw = subs[i];
      const normalized = applyItemTags(raw, raw.tags);
      dataStore.addSubscription(normalized);
    }
    markDirty();

    const subsToUpdate = subs.filter((sub) => sub.url && sub.url.startsWith('http'));

    if (subsToUpdate.length > 0) {
      showToast(t('subscriptions.batchUpdating', { count: subsToUpdate.length }), 'info');

      const updatePromises = subsToUpdate.map((sub) => handleUpdateNodeCount(sub.id));
      const results = await Promise.allSettled(updatePromises);
      const failedCount = results.filter((result) => result.status === 'rejected' || result.value === false).length;
      if (failedCount > 0) {
        showToast(
          t('subscriptions.bulkUpdatePartial', {
            failed: failedCount,
            total: subsToUpdate.length,
          }),
          'warning',
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
      failedCount === 0 ? 'success' : successCount > 0 ? 'warning' : 'error',
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
      (sub) => sub.enabled && sub.url && sub.url.startsWith('http') && !sub.isUpdating,
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
        })),
      );

      if (result?.success) {
        let successCount = 0;
        const resultMap = new Map(
          (Array.isArray(result.results) ? result.results : [])
            .map((item) => [item.subscriptionId || item.id, item])
            .filter(([id]) => Boolean(id)),
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
        const failureReason = result?.error || result?.message || t('subscriptions.unknownError');
        console.warn('[Subscriptions] Batch update failed, falling back to sequential update:', failureReason);
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
        (sub) => sub.enabled && sub.url && sub.url.startsWith('http') && !sub.isUpdating,
      );
      for (const sub of subsToUpdate) {
        await handleUpdateNodeCount(sub.id, true);
      }
    } catch (e) {
      console.error('Auto update failed', e);
    }
  }

  function startAutoUpdate(intervalMinutes = null) {
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

    if (intervalMs === 0) {
      stopAutoUpdate();
      if (isDev) console.debug('[AutoUpdate] Disabled by user setting');
      return;
    }

    if (autoUpdateTimerId && intervalMs === currentIntervalMs) {
      return;
    }

    stopAutoUpdate();

    currentIntervalMs = intervalMs;
    autoUpdateTimerId = setInterval(() => {
      void autoUpdateAllSubscriptions();
    }, intervalMs);

    if (isDev) console.debug(`[AutoUpdate] Started with interval: ${intervalMs / 60000} minutes`);
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
    const currentManualNodes = (allSubscriptions.value || []).filter(
      (item) => !item.url || !/^https?:\/\//.test(item.url),
    );
    const mergedList = [...currentManualNodes, ...newOrder];
    dataStore.overwriteSubscriptions(mergedList);
    markDirty();
  }

  return {
    subscriptions,
    subscriptionTags,
    activeTagFilters,
    setTagFilters,
    toggleTagFilter,
    renameSubscriptionTag,
    deleteSubscriptionTag,
    reorderSubscriptionTags,
    searchQuery,
    filteredSubscriptions,
    filteredCount: computed(() => filteredSubscriptions.value.length),
    subscriptionsCurrentPage,
    subscriptionsPerPage,
    subscriptionsTotalPages,
    paginatedSubscriptions,
    changeSubscriptionsPage,
    isRefreshing,
    refreshError,
    lastRefreshAt,
    totalRemainingTraffic,
    enabledSubscriptionsCount: computed(() => enabledSubscriptions.value.length),
    addSubscription,
    updateSubscription,
    deleteSubscription,
    deleteAllSubscriptions,
    batchUpdateSubscriptionTags,
    batchDeleteSubscriptions,
    addSubscriptionsFromBulk,
    handleUpdateNodeCount,
    batchUpdateAllSubscriptions,
    startAutoUpdate,
    stopAutoUpdate,
    restartAutoUpdate,
    reorderSubscriptions,
  };
}
