<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue';
import { FileText, Plus, Upload, Wrench, X } from '@lucide/vue';
import { useDataStore } from '@/stores/useDataStore.js';
import { useBulkImportLogic } from '@/composables/useBulkImportLogic.js';
import { storeToRefs } from 'pinia';
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue';
import RightPanel from '@/components/profiles/RightPanel.vue';
import { useSubscriptions } from '@/composables/useSubscriptions.js';
import { useRouter } from 'vue-router';
import { useProfiles } from '@/composables/useProfiles.js';
import { useManualNodes } from '@/composables/useManualNodes.js';
import { formatBytes } from '@misub/core/utils/format-utils.js';
import StatCards from '@/components/dashboard/StatCards.vue';
import {
  addDismissedHealthItem,
  clearLegacyDismissedHealthItemIds,
  filterDismissedHealthItems,
  isHealthItemDismissed,
  normalizeDismissedHealthItemIds,
  readLegacyDismissedHealthItemIds,
} from '@/utils/health-item-dismissal.js';
import { getDashboardHealthItems, resolveHealthItemCopy, shouldShowFullGuide } from '@/utils/dashboard-health.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { useI18n } from '@/i18n/index.js';
import { prefetchLoader, scheduleIdlePrefetch } from '@/utils/prefetch.js';

const loadImportModal = () => import('@/components/modals/ImportModal.vue');
const loadProfileModal = () => import('@/components/modals/ProfileModal.vue');
const loadLogModal = () => import('@/components/modals/LogModal.vue');
const loadQRCodeModal = () => import('@/components/modals/QRCodeModal.vue');

const { t } = useI18n();
const { showToast } = useToastStore();

const dataStore = useDataStore();
const { settings, profiles, activeProfiles, isLoading, lastUpdated } = storeToRefs(dataStore);
const { markDirty } = dataStore;

const {
  totalRemainingTraffic: trafficVal,
  enabledSubscriptionsCount,
  subscriptions,
  addSubscriptionsFromBulk,
} = useSubscriptions(markDirty);

const { manualNodes, addNodesFromBulk } = useManualNodes(markDirty);

const router = useRouter();

const formattedTotalRemainingTraffic = computed(() => formatBytes(trafficVal.value));

const totalNodesCount = computed(() => {
  return (subscriptions.value || []).reduce((acc, sub) => acc + (sub.nodeCount || 0), 0);
});

const subscriptionsCount = computed(() => (subscriptions.value || []).length);
const manualNodesCount = computed(() => (manualNodes.value || []).length);
const enabledManualNodesCount = computed(() => (manualNodes.value || []).filter((node) => node.enabled).length);
const activeProfilesCount = computed(() => (activeProfiles.value || []).length);

const lastUpdatedTime = computed(() => {
  if (!lastUpdated.value) return t('dashboard.never');
  return new Date(lastUpdated.value).toLocaleString();
});

const trafficStats = computed(() => {
  let totalUsed = 0;
  let totalMax = 0;
  (subscriptions.value || []).forEach((sub) => {
    if (sub.excludeTraffic) return;
    if (sub.userInfo) {
      totalUsed += (sub.userInfo.upload || 0) + (sub.userInfo.download || 0);
      totalMax += sub.userInfo.total || 0;
    }
  });
  const percentage = totalMax > 0 ? Math.min(100, (totalUsed / totalMax) * 100).toFixed(1) : 0;
  return {
    used: formatBytes(totalUsed),
    total: formatBytes(totalMax),
    percentage,
  };
});

// 已忽略的待处理项，直接派生自设置（settings.dismissedHealthItems）。
// 放在设置里而不是 localStorage，是为了跨设备同步。
// 用 computed 而不是本地 ref 镜像：保存成功后 settings 更新，列表自动重算。
const dismissedHealthItemIds = computed(() => normalizeDismissedHealthItemIds(settings.value?.dismissedHealthItems));

const allHealthItems = computed(() =>
  getDashboardHealthItems({
    subscriptions: subscriptions.value || [],
    profiles: profiles.value || [],
    settings: settings.value || {},
    totalNodesCount: totalNodesCount.value,
  }).map((item) => resolveHealthItemCopy(item, t)),
);

const dashboardHealthItems = computed(() =>
  filterDismissedHealthItems(allHealthItems.value, dismissedHealthItemIds.value),
);

const dismissedHealthItemsCount = computed(() => allHealthItems.value.length - dashboardHealthItems.value.length);

const hasHealthItems = computed(() => dashboardHealthItems.value.length > 0);

const HEALTH_ITEMS_COLLAPSED_COUNT = 4;
const showAllHealthItems = ref(false);
const visibleHealthItems = computed(() =>
  showAllHealthItems.value
    ? dashboardHealthItems.value
    : dashboardHealthItems.value.slice(0, HEALTH_ITEMS_COLLAPSED_COUNT),
);
const hiddenHealthItemsCount = computed(() =>
  Math.max(0, dashboardHealthItems.value.length - visibleHealthItems.value.length),
);

const showFullGuide = computed(() =>
  shouldShowFullGuide({
    subscriptions: subscriptions.value || [],
    profiles: profiles.value || [],
  }),
);

const readinessText = computed(() => {
  if (subscriptionsCount.value === 0) return t('dashboard.readiness.waitingForSubscriptions');
  if (activeProfilesCount.value === 0) return t('dashboard.readiness.waitingForProfiles');
  if (totalNodesCount.value === 0) return t('dashboard.readiness.needsRefresh');
  if (hasHealthItems.value) return t('dashboard.readiness.hasPendingItems');
  return t('dashboard.readiness.ready');
});

const readinessToneClass = computed(() => {
  return 'bg-transparent text-fg-muted border-line';
});

const readinessDotClass = computed(() => {
  if (!hasHealthItems.value && totalNodesCount.value > 0) {
    return 'bg-emerald-500';
  }
  return 'bg-amber-500';
});

const healthToneClasses = {
  danger: 'border-line bg-transparent text-fg',
  warning: 'border-line bg-transparent text-fg',
  info: 'border-line bg-transparent text-fg',
};

const healthDotClasses = {
  danger: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
};

const handleStatNavigate = (path, query = {}) => {
  router.push({ path, query });
};

const { showModal: showBulkImportModal, handleBulkImport } = useBulkImportLogic({
  addSubscriptionsFromBulk,
  addNodesFromBulk,
});

const openBulkImportModal = () => {
  showBulkImportModal.value = true;
};

const ImportModal = defineAsyncComponent(loadImportModal);

const { handleAddProfile, handleSaveProfile, editingProfile, isNewProfile, showProfileModal } = useProfiles(markDirty);

const ProfileModal = defineAsyncComponent(loadProfileModal);

const showLogModal = ref(false);
const LogModal = defineAsyncComponent(loadLogModal);

//
// error card links to the filtered list AND offers "打开日志"), and reading
const handleHealthAction = (item) => {
  if (item.actionRoute) {
    router.push({ path: item.actionRoute, query: item.actionQuery || {} });
  }
};

const handleHealthSecondaryAction = (item) => {
  if (item.action === 'openLog') {
    showLogModal.value = true;
  }
};

// 隐藏某个待处理项只是记一条偏好，底层问题不动，所以「全部恢复」能把它放回来。
// 这份偏好现在存在设置里并同步到服务端（跨设备生效），
// 写入失败必须明确告知用户，否则表现为「点了没反应」且没有任何提示。
// silent=true：忽略某个待处理项不该弹「设置已更新」，失败文案也用下面更贴切的两句。
// preferencesOnly=true：这个字段不影响节点处理，让服务端跳过清缓存与 TG 通知。
const persistDismissedHealthItems = async (ids) => {
  try {
    await dataStore.saveSettings({ dismissedHealthItems: ids }, { silent: true, preferencesOnly: true });
    return true;
  } catch {
    // saveSettings 已在控制台留下原因，这里只负责给用户一句能看懂的提示
    return false;
  }
};

const isUpdatingHealthDismissal = ref(false);

const dismissHealthItemById = async (id) => {
  if (isUpdatingHealthDismissal.value) return;
  const current = dismissedHealthItemIds.value;
  // 已经忽略过就不必再往返一次服务端
  if (isHealthItemDismissed(current, id)) return;
  isUpdatingHealthDismissal.value = true;
  try {
    const persisted = await persistDismissedHealthItems(addDismissedHealthItem(current, id));
    if (!persisted) {
      showToast(t('dashboard.health.dismissFailed'), 'error');
    }
  } finally {
    isUpdatingHealthDismissal.value = false;
  }
};

const restoreDismissedHealthItems = async () => {
  if (isUpdatingHealthDismissal.value || dismissedHealthItemIds.value.length === 0) return;
  isUpdatingHealthDismissal.value = true;
  try {
    const persisted = await persistDismissedHealthItems([]);
    if (!persisted) {
      showToast(t('dashboard.health.restoreFailed'), 'error');
    }
  } finally {
    isUpdatingHealthDismissal.value = false;
  }
};

let cancelModalPrefetch = () => {};

// 一次性迁移：旧版的忽略记录只存在本机 localStorage，不并进设置的话，
// 升级后用户之前忽略过的项会全部复活。
// 规则：只在服务端还没有这份列表时采用本机记录（bootstrap）；
// 服务端已有数据就以服务端为准 —— 它更新、且汇总了所有设备，
// 否则会把用户在别的设备上「全部恢复」掉的项又塞回来。
// 无论走哪条分支都要清掉旧键，否则每次启动都会重复迁移。
onMounted(async () => {
  cancelModalPrefetch = scheduleIdlePrefetch([loadProfileModal, loadImportModal, loadLogModal, loadQRCodeModal]);

  const legacy = readLegacyDismissedHealthItemIds();
  if (legacy.length === 0) return;

  if (dismissedHealthItemIds.value.length === 0) {
    const persisted = await persistDismissedHealthItems(normalizeDismissedHealthItemIds(legacy));
    // 写不进去就先留着旧键，下次启动再试（清了就等于把用户的记录丢了）
    if (!persisted) return;
  }
  clearLegacyDismissedHealthItemIds();
});

onUnmounted(() => {
  cancelModalPrefetch();
});

const QRCodeModal = defineAsyncComponent(loadQRCodeModal);
const showQRCodeModal = ref(false);
const qrCodeUrl = ref('');
const qrCodeTitle = ref('');

const handleQRCode = (url, title) => {
  qrCodeUrl.value = url;
  qrCodeTitle.value = title;
  showQRCodeModal.value = true;
};
</script>

<template>
  <div class="space-y-4 text-fg">
    <div v-if="isLoading" class="p-4">
      <SkeletonLoader type="dashboard" />
    </div>

    <template v-else>
      <section
        class="relative overflow-hidden bg-surface border border-line rounded-md p-4 sm:p-5 transition-[color,background-color,border-color,box-shadow] duration-200"
      >
        <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2.5">
              <h1 class="text-xl sm:text-2xl font-semibold tracking-tight text-fg">
                {{ t('dashboard.title') }}
              </h1>
              <span
                :class="readinessToneClass"
                class="inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium"
              >
                <span :class="readinessDotClass" class="h-1.5 w-1.5 rounded-full shrink-0"></span>
                {{ readinessText }}
              </span>
            </div>
            <p class="mt-2 text-xs sm:text-sm text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{{ t('dashboard.subtitle') }}</span>
              <span class="hidden sm:inline text-fg-subtle">|</span>
              <span class="w-full sm:w-auto text-xs sm:text-sm"
                >{{ t('dashboard.lastUpdate') }}:
                <span class="font-mono text-fg-muted">{{ lastUpdatedTime }}</span></span
              >
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto">
            <button
              class="min-h-10 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium bg-transparent text-fg-muted hover:bg-hover hover:text-fg hover:border-line-strong rounded-md transition-colors border border-line shadow-none"
              @click="showLogModal = true"
              @focus="prefetchLoader(loadLogModal)"
              @mouseenter="prefetchLoader(loadLogModal)"
            >
              <FileText class="h-4 w-4 shrink-0" stroke-width="1.5" />
              {{ t('dashboard.actions.viewLog') }}
            </button>
            <button
              class="min-h-10 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium bg-transparent text-fg-muted hover:bg-hover hover:text-fg hover:border-line-strong rounded-md transition-colors border border-line shadow-none"
              @click="openBulkImportModal"
              @focus="prefetchLoader(loadImportModal)"
              @mouseenter="prefetchLoader(loadImportModal)"
            >
              <Upload class="h-4 w-4 shrink-0" stroke-width="1.5" />
              {{ t('dashboard.actions.bulkImport') }}
            </button>
            <button
              class="min-h-10 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-fg bg-active hover:bg-hover rounded-md transition-colors border border-line-strong shadow-none"
              @click="handleAddProfile"
              @focus="prefetchLoader(loadProfileModal)"
              @mouseenter="prefetchLoader(loadProfileModal)"
            >
              <Plus class="h-4 w-4 shrink-0" stroke-width="2" />
              {{ t('dashboard.actions.addProfile') }}
            </button>
          </div>
        </div>
      </section>

      <StatCards
        :active-profiles-count="activeProfilesCount"
        :active-subscriptions-count="enabledSubscriptionsCount"
        :enabled-manual-nodes-count="enabledManualNodesCount"
        :formatted-total-remaining-traffic="formattedTotalRemainingTraffic"
        :manual-nodes-count="manualNodesCount"
        :subscriptions-count="subscriptionsCount"
        :total-nodes-count="totalNodesCount"
        :traffic-stats="trafficStats"
        @navigate="handleStatNavigate"
      />

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 space-y-4">
          <section
            class="bg-surface p-5 rounded-md border border-line transition-[color,background-color,border-color,box-shadow] duration-200"
          >
            <div
              class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 mb-4 border-b border-line"
            >
              <div>
                <h3 class="text-base font-semibold text-fg flex items-center gap-2">
                  <span
                    :class="hasHealthItems ? 'bg-amber-500' : 'bg-emerald-500'"
                    class="h-1.5 w-1.5 rounded-full shrink-0"
                  ></span>
                  {{ t('dashboard.health.title') }}
                </h3>
                <p class="mt-1 text-xs sm:text-sm text-fg-muted">
                  {{ t('dashboard.health.subtitle') }}
                </p>
              </div>
              <span
                class="text-xs font-mono font-medium text-fg-muted border border-line rounded-md px-2 py-0.5 self-start sm:self-auto"
                >{{
                  t('dashboard.health.itemsCount', {
                    count: dashboardHealthItems.length,
                  })
                }}</span
              >
            </div>

            <div v-if="hasHealthItems" class="grid gap-3">
              <div
                v-for="item in visibleHealthItems"
                :key="item.id"
                :class="healthToneClasses[item.tone] || healthToneClasses.info"
                class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border p-3.5 font-mono"
              >
                <div class="flex gap-3 min-w-0 font-sans">
                  <span
                    :class="healthDotClasses[item.tone] || healthDotClasses.info"
                    class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                  ></span>
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-fg font-mono">
                      {{ item.title }}
                    </p>
                    <p class="mt-0.5 text-xs sm:text-sm text-fg-muted">
                      {{ item.description }}
                    </p>
                  </div>
                </div>
                <div class="flex shrink-0 flex-col sm:flex-row gap-2 font-sans">
                  <button
                    v-if="item.actionLabel"
                    class="min-h-9 inline-flex items-center justify-center gap-1.5 rounded-md border border-line-strong bg-active text-fg px-3 py-1.5 text-xs font-semibold hover:bg-hover transition-colors shadow-none"
                    type="button"
                    @click="handleHealthAction(item)"
                  >
                    <Wrench class="h-3.5 w-3.5 shrink-0" stroke-width="1.75" />
                    {{ item.actionLabel }}
                  </button>
                  <button
                    v-if="item.secondaryActionLabel"
                    class="min-h-9 inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-transparent text-fg-muted px-3 py-1.5 text-xs font-medium hover:bg-hover hover:text-fg hover:border-line-strong transition-colors shadow-none"
                    type="button"
                    @click="handleHealthSecondaryAction(item)"
                  >
                    {{ item.secondaryActionLabel }}
                  </button>
                  <button
                    :aria-label="t('dashboard.health.dismissItem')"
                    :disabled="isUpdatingHealthDismissal"
                    :title="t('dashboard.health.dismissItem')"
                    class="min-h-9 inline-flex items-center justify-center gap-1 rounded-md border border-line bg-transparent text-fg-muted px-3 py-1.5 text-xs font-medium hover:bg-hover hover:text-fg hover:border-line-strong transition-colors shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="health-item-dismiss"
                    type="button"
                    @click="dismissHealthItemById(item.id)"
                  >
                    <X class="h-3.5 w-3.5 shrink-0" stroke-width="1.75" />
                    {{ t('dashboard.health.dismiss') }}
                  </button>
                </div>
              </div>
              <button
                v-if="hiddenHealthItemsCount > 0 || showAllHealthItems"
                class="min-h-9 justify-self-start rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-mono font-medium text-fg-muted hover:bg-hover hover:text-fg transition-colors shadow-none"
                type="button"
                @click="showAllHealthItems = !showAllHealthItems"
              >
                {{
                  showAllHealthItems
                    ? t('dashboard.health.showLess')
                    : t('dashboard.health.showMore', {
                        count: hiddenHealthItemsCount,
                      })
                }}
              </button>
            </div>
            <div v-else class="rounded-md border border-line bg-transparent p-4 text-fg flex items-start gap-3">
              <span class="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
              <div>
                <p class="text-sm font-medium text-fg">
                  {{ t('dashboard.health.allGood') }}
                </p>
                <p class="mt-1 text-xs sm:text-sm text-fg-muted">
                  {{ t('dashboard.health.allGoodDesc') }}
                </p>
              </div>
            </div>
            <button
              v-if="dismissedHealthItemsCount > 0"
              :disabled="isUpdatingHealthDismissal"
              class="mt-3 justify-self-start text-xs font-mono font-medium text-fg-muted underline decoration-line-strong underline-offset-4 hover:text-fg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="health-items-restore"
              type="button"
              @click="restoreDismissedHealthItems"
            >
              {{
                t('dashboard.health.restoreDismissed', {
                  count: dismissedHealthItemsCount,
                })
              }}
            </button>
          </section>

          <section
            v-if="showFullGuide"
            class="bg-surface p-5 rounded-md border border-line transition-[color,background-color,border-color,box-shadow] duration-200"
          >
            <h3 class="text-base font-semibold text-fg pb-4 mb-4 border-b border-line flex items-center gap-2">
              <span class="h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0"></span>
              {{ t('dashboard.guide.title') }}
            </h3>
            <div
              class="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line-subtle border border-line rounded-md overflow-hidden md:[&>*:nth-child(n+3)]:border-t md:[&>*:nth-child(n+3)]:border-line-subtle"
            >
              <div class="p-4 bg-transparent">
                <h4 class="text-sm font-mono font-medium text-fg mb-1.5">
                  {{ t('dashboard.guide.step1Title') }}
                </h4>
                <p class="text-xs sm:text-sm text-fg-muted">
                  {{ t('dashboard.guide.step1Desc') }}
                </p>
              </div>
              <div class="p-4 bg-transparent">
                <h4 class="text-sm font-mono font-medium text-fg mb-1.5">
                  {{ t('dashboard.guide.step2Title') }}
                </h4>
                <p class="text-xs sm:text-sm text-fg-muted">
                  {{ t('dashboard.guide.step2Desc') }}
                </p>
              </div>
              <div class="p-4 bg-transparent">
                <h4 class="text-sm font-mono font-medium text-fg mb-1.5">
                  {{ t('dashboard.guide.step3Title') }}
                </h4>
                <p class="text-xs sm:text-sm text-fg-muted">
                  {{ t('dashboard.guide.step3Desc') }}
                </p>
              </div>
              <div class="p-4 bg-transparent">
                <h4 class="text-sm font-mono font-medium text-fg mb-1.5">
                  {{ t('dashboard.guide.step4Title') }}
                </h4>
                <p class="text-xs sm:text-sm text-fg-muted">
                  {{ t('dashboard.guide.step4Desc') }}
                </p>
              </div>
            </div>
          </section>
        </div>

        <div class="lg:col-span-1">
          <RightPanel :config="settings" :profiles="profiles" @qrcode="handleQRCode" />
        </div>
      </div>

      <ImportModal
        v-if="showBulkImportModal"
        :show="showBulkImportModal"
        mode="bulk"
        @import="(txt, tag) => handleBulkImport(txt, tag)"
        @update:show="showBulkImportModal = $event"
        @files-imported="(nodes, group) => addNodesFromBulk(nodes, group)"
      />

      <ProfileModal
        v-if="showProfileModal"
        v-model:show="showProfileModal"
        :all-manual-nodes="manualNodes"
        :all-subscriptions="subscriptions"
        :is-new="isNewProfile"
        :profile="editingProfile"
        @save="handleSaveProfile"
      />

      <LogModal :show="showLogModal" @update:show="showLogModal = $event" />

      <QRCodeModal v-model:show="showQRCodeModal" :title="qrCodeTitle" :url="qrCodeUrl" />
    </template>
  </div>
</template>
