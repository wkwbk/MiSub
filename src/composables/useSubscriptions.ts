import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useDataStore, type MutationResult, type RecordPatchOptions } from '@/stores/useDataStore.js';
import { useToastStore } from '@/stores/useToastStore.js';
import type { StoreMisubItem } from '@/queries/useAppDataQueries.js';
import type { TagBatchMode, TagBatchUpdatePayload } from '@/composables/useManualNodes.js';
import { batchUpdateNodes, fetchNodeCount } from '@/lib/api.js';
import { handleError } from '@/utils/error-handler.js';
import { TIMING } from '@/constants/timing.js';
import { t } from '@/i18n/index.js';
import { isAutoUpdateEnabled } from '@misub/core/domain/auto-update.js';
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
} from '@/utils/tags.js';

interface NodeCountPayload {
  count?: number;
  userInfo?: StoreMisubItem['userInfo'];
  data?: {
    count?: number;
    userInfo?: StoreMisubItem['userInfo'];
  };
}

interface FetchNodeCountResult {
  success: boolean;
  data?: NodeCountPayload;
  error?: string;
  errorType?: string;
  status?: number | null;
}

interface BatchUpdateResultItem {
  subscriptionId?: string;
  id?: string;
  success?: boolean;
  nodeCount?: number;
  userInfo?: StoreMisubItem['userInfo'];
  error?: string;
}

interface BatchUpdateResponseShape {
  success?: boolean;
  results?: BatchUpdateResultItem[];
  error?: string;
  message?: string;
}

const isDev = import.meta.env.DEV;

export function useSubscriptions() {
  const { showToast } = useToastStore();
  const dataStore = useDataStore();
  const { subscriptions: allSubscriptions } = storeToRefs(dataStore);

  const subscriptions = computed<StoreMisubItem[]>(() => {
    return (allSubscriptions.value || []).filter((sub) => sub.url && /^https?:\/\//.test(sub.url));
  });

  const searchQuery = ref('');
  const activeTagFilters = ref<string[]>([]);
  const refreshError = ref(false);
  const lastRefreshAt = ref<string | null>(null);
  const isRefreshing = ref(false);

  const getSubscriptionTagOrder = (): string[] => dataStore.settings?.subscriptionTagOrder || [];
  const setSubscriptionTagOrder = (nextOrder: string[]): void => {
    if (dataStore.settings && typeof dataStore.settings === 'object') {
      dataStore.settings.subscriptionTagOrder = nextOrder;
    }
    if (typeof dataStore.saveSettings === 'function') {
      dataStore
        .saveSettings({ subscriptionTagOrder: nextOrder }, { silent: true, preferencesOnly: true })
        .catch(() => {});
    }
  };

  const subscriptionTags = computed<string[]>(() => {
    return collectTags(subscriptions.value, getSubscriptionTagOrder());
  });

  function setTagFilters(filters: unknown): void {
    activeTagFilters.value = normalizeActiveTagFilters(filters);
  }

  async function renameSubscriptionTag(oldName: string, newName: string): Promise<boolean> {
    const normalizedOld = normalizeTagName(oldName);
    const normalizedNew = normalizeTagName(newName);
    if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew) return false;

    const updates: Array<{ id: string; tags: string[] }> = [];
    subscriptions.value.forEach((sub) => {
      const { nextTags, changed: itemChanged } = renameTagInList(getItemTags(sub), normalizedOld, normalizedNew);
      if (itemChanged) {
        updates.push({ id: sub.id, tags: nextTags });
      }
    });

    if (updates.length > 0) {
      const res = await dataStore.batchUpdateSubscriptionTagsRecord(updates);
      if (!res.ok) return false;
    }

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
    return true;
  }

  async function deleteSubscriptionTag(tagName: string): Promise<boolean> {
    const normalized = normalizeTagName(tagName);
    if (!normalized) return false;

    const updates: Array<{ id: string; tags: string[] }> = [];
    subscriptions.value.forEach((sub) => {
      const { nextTags, changed: itemChanged } = removeTagFromList(getItemTags(sub), normalized);
      if (itemChanged) {
        updates.push({ id: sub.id, tags: nextTags });
      }
    });

    if (updates.length > 0) {
      const res = await dataStore.batchUpdateSubscriptionTagsRecord(updates);
      if (!res.ok) return false;
    }

    const customOrder = getSubscriptionTagOrder();
    const nextOrder = customOrder.filter((tag) => tag !== normalized);
    if (nextOrder.length !== customOrder.length) {
      setSubscriptionTagOrder(nextOrder);
    }

    if (activeTagFilters.value.includes(normalized)) {
      activeTagFilters.value = activeTagFilters.value.filter((tag) => tag !== normalized);
    }
    return true;
  }

  function reorderSubscriptionTags(newOrder: string[]): void {
    setSubscriptionTagOrder(normalizeTagList(newOrder));
  }

  const filteredSubscriptions = computed<StoreMisubItem[]>(() => {
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
    const REASONABLE_TRAFFIC_LIMIT_BYTES = 10 * 1024 * 1024 * 1024 * 1024 * 1024;
    return subscriptions.value.reduce((acc, sub) => {
      if (sub.excludeTraffic) return acc;
      if (
        sub.enabled &&
        sub.userInfo &&
        typeof sub.userInfo.total === 'number' &&
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

  async function handleUpdateNodeCount(subId: string, isInitialLoad = false): Promise<boolean> {
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
      const result = (await fetchNodeCount(
        subToUpdate.url,
        subToUpdate.fetchProxy,
        Boolean(subToUpdate.plusAsSpace),
        subToUpdate.customUserAgent,
        {
          subscriptionId: subToUpdate.id,
          persist: true,
        },
      )) as FetchNodeCountResult;

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

        dataStore.applySubscriptionRuntimeUpdate(subToUpdate.id, {
          lastError: result.error,
          ...(subToUpdate.enableNodeCache !== true ? { nodeCount: 0, userInfo: null } : {}),
        });
        return false;
      }

      const data = result.data?.data || result.data || {};
      dataStore.applySubscriptionRuntimeUpdate(subToUpdate.id, {
        nodeCount: data.count || 0,
        userInfo: data.userInfo || null,
        lastError: null,
      });

      if (!isInitialLoad) {
        showToast(
          t('subscriptions.updateSuccess', {
            name: subToUpdate.name || t('subscriptions.fallbackName'),
          }),
          'success',
        );
      }
      return true;
    } catch (error: unknown) {
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
      dataStore.applySubscriptionRuntimeUpdate(subId, { isUpdating: false });
    }
  }

  async function toggleSubscription(id: string, enabled: boolean): Promise<MutationResult<StoreMisubItem>> {
    return await dataStore.patchSubscription(id, { enabled });
  }

  async function addSubscription(sub: StoreMisubItem): Promise<MutationResult<StoreMisubItem>> {
    const normalized = applyItemTags(sub, sub.tags);
    const res = await dataStore.createSubscription(normalized);
    if (res.ok && res.data?.id) {
      void handleUpdateNodeCount(res.data.id);
    }
    return res;
  }

  async function updateSubscription(
    updatedSub: StoreMisubItem,
    options: RecordPatchOptions = {},
  ): Promise<MutationResult<StoreMisubItem>> {
    const originalSub = subscriptions.value.find((s) => s.id === updatedSub.id);
    const urlChanged = Boolean(originalSub && originalSub.url !== updatedSub.url);
    const rawTags = updatedSub.tags !== undefined ? updatedSub.tags : getItemTags(updatedSub);
    const normalized = applyItemTags(updatedSub, rawTags);
    const {
      id: _id,
      sortIndex: _sortIndex,
      configVersion: _configVersion,
      version: _version,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      isUpdating: _isUpdating,
      nodeCount: _nodeCount,
      lastGoodNodeCount: _lastGood,
      userInfo: _userInfo,
      detectedName: _detectedName,
      lastError: _lastError,
      lastUpdate: _lastUpdate,
      ...patchFields
    } = normalized;

    const res = await dataStore.updateSubscriptionRecord(normalized.id, patchFields, options);
    if (res.ok && urlChanged) {
      dataStore.applySubscriptionRuntimeUpdate(normalized.id, { nodeCount: 0 });
      void handleUpdateNodeCount(normalized.id);
    }
    return res;
  }

  async function deleteSubscription(subId: string) {
    return await dataStore.deleteSubscriptionRecord(subId);
  }

  async function batchUpdateSubscriptionTags(
    subIds: string[],
    payload: TagBatchUpdatePayload,
  ): Promise<MutationResult<StoreMisubItem[]>> {
    if (!subIds || subIds.length === 0) {
      return { ok: true, data: [] };
    }

    let mode: TagBatchMode = 'replace';
    let inputTags: unknown = payload;
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
        return { id: s.id, tags: nextTags };
      })
      .filter((item): item is { id: string; tags: string[] } => item !== null);

    if (updates.length === 0) {
      return { ok: true, data: [] };
    }

    const res = await dataStore.batchUpdateSubscriptionTagsRecord(updates);
    if (res.ok) {
      showToast(t('subscriptions.batchTagsUpdated', { count: updates.length }), 'success');
    }
    return res;
  }

  async function batchDeleteSubscriptions(subIds: string[]) {
    if (!subIds || subIds.length === 0) {
      return { ok: true, data: { deletedIds: [], updatedProfiles: [] } };
    }

    const res = await dataStore.batchDeleteSubscriptionsRecord({ ids: subIds });
    if (res.ok) {
      showToast(t('subscriptions.deletedCount', { count: subIds.length }), 'success');
    }
    return res;
  }

  async function deleteAllSubscriptions() {
    const idsToRemove = subscriptions.value.map((s) => s.id);

    if (idsToRemove.length === 0) {
      showToast(t('subscriptions.noSubscriptionsToDelete'), 'info');
      return { ok: true, data: { deletedIds: [], updatedProfiles: [] } };
    }

    const res = await dataStore.batchDeleteSubscriptionsRecord({ all: true });
    if (res.ok) {
      showToast(t('subscriptions.clearedCount', { count: idsToRemove.length }), 'success');
    }
    return res;
  }

  async function addSubscriptionsFromBulk(subs: StoreMisubItem[]): Promise<MutationResult<StoreMisubItem[]>> {
    const prepared = subs.map((raw) => applyItemTags(raw, raw.tags));
    const createRes = await dataStore.createSubscriptionsBatch(prepared);
    if (!createRes.ok) {
      return createRes;
    }

    const createdList = createRes.data || prepared;
    const subsToUpdate = createdList.filter((sub) => sub.url && sub.url.startsWith('http'));

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

    return createRes;
  }

  function finalizeRefreshSummary(successCount: number, totalCount: number): void {
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
  }

  async function runSequentialFallbackUpdate(subsToUpdate: StoreMisubItem[]): Promise<void> {
    showToast(t('subscriptions.refreshFallback'), 'warning');
    let fallbackSuccessCount = 0;
    for (const sub of subsToUpdate) {
      if (await handleUpdateNodeCount(sub.id, true)) {
        fallbackSuccessCount++;
      }
    }
    finalizeRefreshSummary(fallbackSuccessCount, subsToUpdate.length);
  }

  async function batchUpdateAllSubscriptions(): Promise<void> {
    if (isRefreshing.value) {
      return;
    }

    const subsToUpdate = subscriptions.value.filter(
      (sub) =>
        sub.enabled &&
        sub.url &&
        sub.url.startsWith('http') &&
        isAutoUpdateEnabled({ autoUpdate: sub.autoUpdate }) &&
        !sub.isUpdating,
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
      const result = (await batchUpdateNodes(
        subsToUpdate.map((sub) => sub.id),
        subsToUpdate.map((sub) => ({
          id: sub.id,
          name: sub.name,
          url: sub.url,
          enabled: sub.enabled,
          autoUpdate: sub.autoUpdate !== false,
          fetchProxy: sub.fetchProxy,
          plusAsSpace: Boolean(sub.plusAsSpace),
          customUserAgent: sub.customUserAgent,
        })),
      )) as BatchUpdateResponseShape | null;

      if (result?.success) {
        let successCount = 0;
        const resultList = Array.isArray(result.results) ? result.results : [];
        const resultMap = new Map<string, BatchUpdateResultItem>(
          resultList
            .map((item): [string, BatchUpdateResultItem] => [item.subscriptionId || item.id || '', item])
            .filter(([id]) => Boolean(id)),
        );

        for (const sub of subsToUpdate) {
          const updateResult = resultMap.get(sub.id);
          if (updateResult?.success) {
            dataStore.applySubscriptionRuntimeUpdate(sub.id, {
              nodeCount: updateResult.nodeCount ?? 0,
              ...(updateResult.userInfo !== undefined ? { userInfo: updateResult.userInfo } : {}),
              lastError: null,
            });
            successCount++;
          } else {
            dataStore.applySubscriptionRuntimeUpdate(sub.id, {
              lastError: updateResult?.error || t('subscriptions.unknownError'),
              ...(sub.enableNodeCache !== true ? { nodeCount: 0, userInfo: null } : {}),
            });
          }
        }

        finalizeRefreshSummary(successCount, subsToUpdate.length);
      } else {
        const failureReason = result?.error || result?.message || t('subscriptions.unknownError');
        console.warn('[Subscriptions] Batch update failed, falling back to sequential update:', failureReason);
        await runSequentialFallbackUpdate(subsToUpdate);
      }
    } catch (error: unknown) {
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
  let autoUpdateTimerId: ReturnType<typeof setInterval> | null = null;
  let currentIntervalMs = DEFAULT_INTERVAL_MS;

  async function autoUpdateAllSubscriptions(): Promise<void> {
    try {
      const subsToUpdate = subscriptions.value.filter(
        (sub) =>
          sub.enabled &&
          sub.url &&
          sub.url.startsWith('http') &&
          isAutoUpdateEnabled({ autoUpdate: sub.autoUpdate }) &&
          !sub.isUpdating,
      );
      for (const sub of subsToUpdate) {
        await handleUpdateNodeCount(sub.id, true);
      }
    } catch (e: unknown) {
      console.error('Auto update failed', e);
    }
  }

  function startAutoUpdate(intervalMinutes: number | null = null): void {
    let intervalMs: number;
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

  function stopAutoUpdate(): void {
    if (autoUpdateTimerId) {
      clearInterval(autoUpdateTimerId);
      autoUpdateTimerId = null;
      if (isDev) console.debug('[AutoUpdate] Stopped');
    }
  }

  function restartAutoUpdate(intervalMinutes?: number | null): void {
    stopAutoUpdate();
    startAutoUpdate(intervalMinutes ?? null);
  }

  async function reorderSubscriptions(newOrder: StoreMisubItem[]): Promise<MutationResult<StoreMisubItem[]>> {
    const currentSubs = subscriptions.value;
    const reorderedVisible = [...(newOrder || [])];
    const newOrderIds = new Set(reorderedVisible.map((s) => s.id));
    const orderedSubs =
      newOrderIds.size > 0 && newOrderIds.size < currentSubs.length
        ? currentSubs.map((sub) => (newOrderIds.has(sub.id) ? (reorderedVisible.shift() ?? sub) : sub))
        : reorderedVisible;

    const currentManualNodes = (allSubscriptions.value || []).filter(
      (item) => !item.url || !/^https?:\/\//.test(item.url),
    );
    const mergedList = [...orderedSubs, ...currentManualNodes];
    return await dataStore.reorderSubscriptionsRecord(
      orderedSubs.map((s) => s.id),
      mergedList,
    );
  }

  return {
    subscriptions,
    subscriptionTags,
    activeTagFilters,
    setTagFilters,
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
    toggleSubscription,
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
