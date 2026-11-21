<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { FolderKanban, Layers, Server } from '@lucide/vue';
import { formatBytes } from '@shared/format-utils.js';
import { useToastStore } from '@/stores/toast.js';
import { useUIStore } from '@/stores/ui.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { useSubscriptions } from '@/composables/useSubscriptions.js';
import { useManualNodes } from '@/composables/useManualNodes.js';
import { useProfiles } from '@/composables/useProfiles.js';
import { useSubscriptionForms } from '@/composables/useSubscriptionForms.js';
import { useNodeForms } from '@/composables/useNodeForms.js';
import { useBulkImportLogic } from '@/composables/useBulkImportLogic.js';
import { useSubscriptionBulkImport } from '@/composables/useSubscriptionBulkImport.js';
import { useBackupLogic } from '@/composables/useBackupLogic.js';
import { storeToRefs } from 'pinia';
import { useI18n } from '@/i18n/index.js';
import { inferAirportRootDomain } from '@/utils/airport-domain.js';
import { rememberDomainName } from '@/utils/domain-name-memory.js';
import { scheduleIdlePrefetch } from '@/utils/prefetch.js';
import { readSessionPreference, writeSessionPreference } from '@/utils/session-preference.js';
import RightPanel from '@/components/profiles/RightPanel.vue';
import ProfilePanel from '@/components/profiles/ProfilePanel.vue';
import SubscriptionPanel from '@/components/subscriptions/SubscriptionPanel.vue';
import ManualNodePanel from '@/components/nodes/ManualNodePanel.vue';
import Modal from '@/components/ui/Modal.vue';
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue';
import DashboardHeader from '@/components/dashboard/DashboardHeader.vue';
import SavePrompt from '@/components/ui/SavePrompt.vue';

const isDev = import.meta.env.DEV;

const loadSubscriptionEditModal = () => import('@/components/modals/SubscriptionEditModal.vue');
const loadManualNodeEditModal = () => import('@/components/modals/ManualNodeEditModal.vue');
const loadProfileModal = () => import('@/components/modals/ProfileModal.vue');
const loadBulkImportModal = () => import('@/components/modals/BulkImportModal.vue');
const loadCopyLinkModal = () => import('@/components/modals/CopyLinkModal.vue');
const loadQRCodeModal = () => import('@/components/modals/QRCodeModal.vue');

const SubscriptionEditModal = defineAsyncComponent(loadSubscriptionEditModal);
const ManualNodeEditModal = defineAsyncComponent(loadManualNodeEditModal);
const ManualNodeDedupModal = defineAsyncComponent(() => import('@/components/modals/ManualNodeDedupModal.vue'));

const SettingsModal = defineAsyncComponent(() => import('@/components/modals/SettingsModal.vue'));
const BulkImportModal = defineAsyncComponent(loadBulkImportModal);
const SubscriptionBulkImportModal = defineAsyncComponent(
  () => import('@/components/modals/SubscriptionBulkImportModal.vue'),
);
const ProfileModal = defineAsyncComponent(loadProfileModal);
const SubscriptionImportModal = defineAsyncComponent(() => import('@/components/modals/SubscriptionImportModal.vue'));
const LogModal = defineAsyncComponent(() => import('@/components/modals/LogModal.vue'));
const NodePreviewModal = defineAsyncComponent(() => import('@/components/modals/NodePreview/NodePreviewModal.vue'));

const BatchTagModal = defineAsyncComponent(() => import('@/components/modals/BatchTagModal.vue'));
const TagManagementModal = defineAsyncComponent(() => import('@/components/modals/TagManagementModal.vue'));
const QRCodeModal = defineAsyncComponent(loadQRCodeModal);
const CopyLinkModal = defineAsyncComponent(loadCopyLinkModal);

// --- 基础状态 ---
const { showToast } = useToastStore();
const { t } = useI18n();
const uiStore = useUIStore();
const dataStore = useDataStore();
const { settings, isDirty, isLoading } = storeToRefs(dataStore);
const { clearDirty } = dataStore; // Don't destructure markDirty directly
if (isDev) {
  console.debug('Dashboard: setup running');
}

const saveState = ref('idle');
const isDiscarding = ref(false);
let cancelModalPrefetch = () => {};

// Wrapper for markDirty to also reset saveState
const markDirty = () => {
  dataStore.markDirty();
  saveState.value = 'idle';
};

// --- 將狀態和邏輯委託給 Composables ---
// Composables now use global store, so we don't pass refs
// --- UI State ---
const isSortingSubs = ref(false);
const isSortingNodes = ref(false);
const isSortingProfiles = ref(false);
const showQRCodeModal = ref(false);
const qrCodeUrl = ref('');
const qrCodeTitle = ref('');
const showCopyModal = ref(false);
const showCopyModalProfile = ref(null);

const handleQRCode = (id, type = 'subscription') => {
  if (type === 'subscription') {
    const sub = subscriptions.value.find((s) => s.id === id);
    if (sub) {
      qrCodeUrl.value = sub.url;
      qrCodeTitle.value = sub.name || t('subscriptions.qrCodeTitle');
      showQRCodeModal.value = true;
    }
  } else if (type === 'profile') {
    const profile = profiles.value.find((p) => p.id === id);
    if (profile) {
      if (!settings.value.profileToken) {
        showToast(t('notices.noToken'), 'error');
        return;
      }
      const token = settings.value.profileToken;
      const baseUrl = window.location.origin;
      // Using similar logic to useProfiles copy link
      const idToUse = profile.customId || profile.id;
      qrCodeUrl.value = `${baseUrl}/${token}/${idToUse}`;
      qrCodeTitle.value = profile.name || t('profiles.qrCodeTitle');
      showQRCodeModal.value = true;
    }
  }
};

const handleOpenCopy = (profileId) => {
  const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
  if (profile) {
    showCopyModalProfile.value = profile;
    showCopyModal.value = true;
  }
};

const {
  subscriptions,
  subscriptionTags,
  activeTagFilters: subscriptionTagFilters,
  setTagFilters: setSubscriptionTagFilters,
  renameSubscriptionTag,
  deleteSubscriptionTag,
  reorderSubscriptionTags,
  searchQuery: subscriptionSearchQuery,
  filteredCount: filteredSubscriptionCount,
  subscriptionsCurrentPage,
  subscriptionsPerPage,
  changeSubscriptionsPage,
  isRefreshing: isRefreshingSubscriptions,
  refreshError: subscriptionRefreshError,
  lastRefreshAt: lastSubscriptionRefreshAt,
  totalRemainingTraffic,
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
} = useSubscriptions(markDirty);

const {
  manualNodes,
  manualNodesCurrentPage,
  manualNodesPerPage,
  manualNodesTotalPages,
  paginatedManualNodes,
  searchTerm,
  changeManualNodesPage,
  addNode,
  updateNode,
  deleteNode,
  deleteAllNodes,
  addNodesFromBulk,
  autoSortNodes,
  reorderManualNodes,
  activeTagFilters,
  setTagFilters,
  toggleTagFilter,
  attrFilters,
  toggleProtocolFilter,
  toggleCountryFilter,
  toggleNetworkFilter,
  clearAttrFilters,
  batchUpdateTags,
  batchDeleteNodes,
  buildDedupPlan,
  applyDedupPlan,
  manualNodeTags,
  renameTag,
  deleteTag,
  reorderTags,
  nodeInspectMap,
  isInspectingNodes,
  pingMode,
  setPingMode,
  inspectNodes,
  pingResults,
  pingingNodes,
  isPingingAll,
  pingNodeId,
  pingAllNodes,
  sortNodesByLatency,
} = useManualNodes(markDirty);

watch(
  () => manualNodes.value.map((n) => `${n.id}:${n.url}`).join('|'),
  () => {
    if (manualNodes.value.length > 0) {
      inspectNodes(manualNodes.value, { silent: true });
    }
  },
  { immediate: true },
);

const handleSortByLatency = () => {
  const ok = sortNodesByLatency();
  showToast(ok ? t('manualNodes.sortByLatencyDone') : t('manualNodes.sortByLatencyNoData'), ok ? 'success' : 'warning');
};

const handleSearchTermUpdate = (val) => {
  searchTerm.value = val;
};

const {
  profiles,
  profileTags,
  activeTagFilters: profileTagFilters,
  setTagFilters: setProfileTagFilters,
  renameProfileTag,
  deleteProfileTag,
  reorderProfileTags,
  editingProfile,
  isNewProfile,
  showProfileModal,
  showDeleteProfilesModal,
  handleProfileToggle,
  handleAddProfile,
  handleEditProfile,
  handleSaveProfile,
  handleDeleteProfile,
  handleDeleteAllProfiles,
  batchUpdateProfileTags,
  batchDeleteProfiles,
  reorderProfiles,
  filteredProfiles,
  searchQuery: profileSearchQuery,
  profilesCurrentPage,
  profilesPerPage,
  profilesTotalPages,
  paginatedProfiles,
  changeProfilesPage,
} = useProfiles(markDirty);

// --- UI State ---

// --- New Form Logic Composables ---
const {
  showModal: showSubModal,
  isNew: isNewSubscription,
  editingSubscription,
  openAdd: handleAddSubscription,
  openEdit: handleEditSubscription,
  handleSave: handleSaveSubscription,
} = useSubscriptionForms({ addSubscription, updateSubscription });

const {
  showModal: showNodeModal,
  isNew: isNewNode,
  editingNode,
  openAdd: handleAddNode,
  openEdit: handleEditNode,
  handleUrlInput: handleNodeUrlInput,
  handleSave: handleSaveNode,
} = useNodeForms({ addNode, updateNode });

const { showModal: showBulkImportModal, handleBulkImport } = useBulkImportLogic({
  addSubscriptionsFromBulk,
  addNodesFromBulk,
});

const { showModal: showSubBulkImportModal, handleSubscriptionBulkImport } = useSubscriptionBulkImport({
  addSubscriptionsFromBulk,
  updateSubscription,
});

// 使用备份 composable
const { exportBackup, importBackup } = useBackupLogic();

// --- UI State ---
const showDeleteSubsModal = ref(false);
const showDeleteNodesModal = ref(false);
const showSubscriptionImportModal = ref(false);
const showLogModal = ref(false);
const logProfileName = ref('');
const showBatchDeleteModal = ref(false);
const batchDeleteIds = ref([]);
const batchDeleteType = ref('node'); // 'node' | 'subscription' | 'profile'
const showDedupModal = ref(false);
const dedupPlan = ref(null);
const showBatchTagModal = ref(false);
const batchTagIds = ref([]);
const batchTagType = ref('node'); // 'node' | 'subscription' | 'profile'
const showNodeTagManagementModal = ref(false);
const showProfileTagManagementModal = ref(false);

// 节点预览相关状态
const showNodePreviewModal = ref(false);
const previewSubscriptionId = ref(null);
const previewProfileId = ref(null);
const previewSubscriptionName = ref('');
const previewSubscriptionUrl = ref('');
const previewProfileName = ref('');

// --- 初始化與生命週期 ---
const initializeState = async () => {
  if (isDev) {
    console.debug('Dashboard: initializeState started');
  }
  try {
    // fetchData 内部会检查数据是否已加载，避免重复请求
    await dataStore.fetchData();
    if (isDev) {
      console.debug('Dashboard: fetchData completed', {
        subs: subscriptions.value?.length,
        nodes: manualNodes.value?.length,
      });
    }
    clearDirty();
  } catch (e) {
    console.error('Dashboard: initializeState error', e);
  }
};

const handleBeforeUnload = (event) => {
  if (isDirty.value) {
    event.preventDefault();
    event.returnValue = t('common.unsavedLeaveConfirm');
  }
};

const CLASSIC_TAB_STORAGE_KEY = 'misub_classic_dashboard_tab';
const VALID_CLASSIC_TABS = ['nodes', 'subscriptions', 'profiles'];

const readInitialClassicTab = () => {
  const saved = readSessionPreference(CLASSIC_TAB_STORAGE_KEY);
  return VALID_CLASSIC_TABS.includes(saved) ? saved : 'nodes';
};

const activeTab = ref(readInitialClassicTab());

const classicTabs = computed(() => [
  {
    id: 'nodes',
    label: t('manualNodes.title'),
    count: manualNodes.value.length,
    icon: Server,
  },
  {
    id: 'subscriptions',
    label: t('subscriptions.title'),
    count: subscriptions.value.length,
    icon: Layers,
  },
  {
    id: 'profiles',
    label: t('nav.subscriptions'),
    count: profiles.value.length,
    icon: FolderKanban,
  },
]);

const setActiveTab = (tabId) => {
  if (!VALID_CLASSIC_TABS.includes(tabId) || activeTab.value === tabId) return;
  activeTab.value = tabId;
  writeSessionPreference(CLASSIC_TAB_STORAGE_KEY, tabId);
};

onMounted(() => {
  initializeState();
  cancelModalPrefetch = scheduleIdlePrefetch([
    loadSubscriptionEditModal,
    loadManualNodeEditModal,
    loadProfileModal,
    loadBulkImportModal,
    loadCopyLinkModal,
    loadQRCodeModal,
  ]);
  window.addEventListener('beforeunload', handleBeforeUnload);
  // 启动订阅自动更新定时器（每30分钟）
  startAutoUpdate();
});

onUnmounted(() => {
  cancelModalPrefetch();
  window.removeEventListener('beforeunload', handleBeforeUnload);
  // 停止订阅自动更新定时器
  stopAutoUpdate();
});

// 监听设置变更，重启自动更新定时器
watch(
  () => settings.value?.autoUpdateInterval,
  (newInterval) => {
    if (newInterval !== undefined) {
      restartAutoUpdate(newInterval);
    }
  },
);

// --- 其他 JS 逻辑 (省略) ---
const handleDiscard = async () => {
  if (isDiscarding.value || saveState.value !== 'idle') return;
  isDiscarding.value = true;
  try {
    // 强制刷新数据，忽略缓存
    await dataStore.fetchData(true);
    isSortingSubs.value = false;
    isSortingNodes.value = false;
    isSortingProfiles.value = false;
    showToast(t('notices.discardedChanges'));
  } finally {
    isDiscarding.value = false;
  }
};

const handleSave = async () => {
  saveState.value = 'saving';

  try {
    await dataStore.saveData();

    saveState.value = 'success';

    isSortingSubs.value = false;
    isSortingNodes.value = false;
    isSortingProfiles.value = false;

    setTimeout(() => {
      saveState.value = 'idle';
    }, 1500);
  } catch (error) {
    saveState.value = 'idle';
  }
};

const handleDeleteSubscriptionWithCleanup = (subId) => {
  deleteSubscription(subId);
  // cleanup 已在 deleteSubscription 内部通过 removeSubscriptionFromProfiles 实现
};
const handleDeleteNodeWithCleanup = (nodeId) => {
  deleteNode(nodeId);
  // cleanup 已在 deleteNode 内部通过 removeManualNodeFromProfiles 实现
};
const handleDeleteAllSubscriptionsWithCleanup = () => {
  deleteAllSubscriptions();
  // cleanup 已在 deleteAllSubscriptions 内部通过 removeSubscriptionFromProfiles 实现
  showDeleteSubsModal.value = false;
};
const handleDeleteAllNodesWithCleanup = () => {
  deleteAllNodes();
  // cleanup 已在 deleteAllNodes 内部通过 removeManualNodeFromProfiles 实现
  showDeleteNodesModal.value = false;
};
const handleAutoSortNodes = () => {
  autoSortNodes();
  showToast(t('manualNodes.sortedByRegion'), 'success');
};

const handleDeduplicateNodes = () => {
  const plan = buildDedupPlan();
  if (!plan || plan.removeCount === 0) {
    showToast(t('manualNodes.noDuplicates'), 'info');
    return;
  }
  dedupPlan.value = plan;
  showDedupModal.value = true;
};

const handleBatchDeleteRequest = (ids, type = 'node') => {
  if (ids && ids.length > 0) {
    batchDeleteIds.value = ids;
    batchDeleteType.value = type;
    showBatchDeleteModal.value = true;
  }
};

const confirmBatchDelete = () => {
  if (batchDeleteType.value === 'subscription') {
    batchDeleteSubscriptions(batchDeleteIds.value);
  } else if (batchDeleteType.value === 'profile') {
    batchDeleteProfiles(batchDeleteIds.value);
  } else {
    batchDeleteNodes(batchDeleteIds.value);
  }
  batchDeleteIds.value = [];
  showBatchDeleteModal.value = false;
};

const handleOpenBatchTagModal = (ids, type = 'node') => {
  batchTagIds.value = ids;
  batchTagType.value = type;
  showBatchTagModal.value = true;
};

const handleBatchTagConfirm = (payload) => {
  if (batchTagType.value === 'subscription') {
    batchUpdateSubscriptionTags(batchTagIds.value, payload);
  } else if (batchTagType.value === 'profile') {
    batchUpdateProfileTags(batchTagIds.value, payload);
  } else {
    batchUpdateTags(batchTagIds.value, payload);
  }
  batchTagIds.value = [];
};

const batchTagCandidateTags = computed(() => {
  if (batchTagType.value === 'subscription') return subscriptionTags.value;
  if (batchTagType.value === 'profile') return profileTags.value;
  return manualNodeTags.value;
});

const batchDeleteConfirmTitle = computed(() => {
  if (batchDeleteType.value === 'subscription') {
    return t('subscriptions.batchDeleteConfirmTitle');
  }
  if (batchDeleteType.value === 'profile') {
    return t('profiles.batchDeleteConfirmTitle');
  }
  return t('manualNodes.batchDeleteConfirmTitle');
});

const batchDeleteConfirmBody = computed(() => {
  if (batchDeleteType.value === 'subscription') {
    return t('subscriptions.batchDeleteConfirmBody', {
      count: batchDeleteIds.value.length,
    });
  }
  if (batchDeleteType.value === 'profile') {
    return t('profiles.batchDeleteConfirmBody', { count: batchDeleteIds.value.length });
  }
  return t('manualNodes.batchDeleteConfirmBody', { count: batchDeleteIds.value.length });
});

const handleOpenNodeTagManagement = () => {
  showNodeTagManagementModal.value = true;
};

const handleNodeTagRename = (oldName, newName) => {
  renameTag(oldName, newName);
  showToast(t('tags.tagRenamed', { oldName, newName }), 'success');
};

const handleNodeTagDelete = (tagName) => {
  deleteTag(tagName);
  showToast(t('tags.tagDeleted', { name: tagName }), 'success');
};

const handleNodeTagReorder = (newOrder) => {
  reorderTags(newOrder);
  showToast(t('tags.tagOrderUpdated'), 'success');
};

const showSubTagManagementModal = ref(false);

const handleSubTagRename = (oldName, newName) => {
  renameSubscriptionTag(oldName, newName);
  showToast(t('tags.tagRenamed', { oldName, newName }), 'success');
};

const handleSubTagDelete = (tagName) => {
  deleteSubscriptionTag(tagName);
  showToast(t('tags.tagDeleted', { name: tagName }), 'success');
};

const handleSubTagReorder = (newOrder) => {
  reorderSubscriptionTags(newOrder);
  showToast(t('tags.tagOrderUpdated'), 'success');
};

const handleProfileTagRename = (oldName, newName) => {
  renameProfileTag(oldName, newName);
  showToast(t('tags.tagRenamed', { oldName, newName }), 'success');
};

const handleProfileTagDelete = (tagName) => {
  deleteProfileTag(tagName);
  showToast(t('tags.tagDeleted', { name: tagName }), 'success');
};

const handleProfileTagReorder = (newOrder) => {
  reorderProfileTags(newOrder);
  showToast(t('tags.tagOrderUpdated'), 'success');
};

const handleApplyDetectedName = (subscriptionId, name) => {
  const target = String(name || '').trim();
  if (!target) return;
  const subscription = subscriptions.value.find((s) => s.id === subscriptionId);
  if (!subscription) return;
  // useSubscriptions.updateSubscription requires the complete subscription object.
  updateSubscription({ ...subscription, name: target });
  // Persist the confirmed name by airport root domain, matching the groups page.
  const domain = inferAirportRootDomain(subscription.url);
  if (domain) rememberDomainName(domain, target);
  showToast(t('subscriptions.nameApplied', { name: target }), 'success');
};

// 节点预览处理函数
const handlePreviewSubscription = (subscriptionId) => {
  const subscription = subscriptions.value.find((s) => s.id === subscriptionId);
  if (subscription) {
    previewSubscriptionId.value = subscriptionId;
    previewSubscriptionName.value = subscription.name || t('subscriptions.unnamed');
    previewSubscriptionUrl.value = subscription.url;
    previewProfileId.value = null;
    previewProfileName.value = '';
    showNodePreviewModal.value = true;
  }
};

const handlePreviewProfile = (profileId) => {
  const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
  if (profile) {
    previewProfileId.value = profileId;
    previewProfileName.value = profile.name;
    previewSubscriptionId.value = null;
    previewSubscriptionName.value = '';
    previewSubscriptionUrl.value = '';
    showNodePreviewModal.value = true;
  }
};

const handleViewLogs = (profileId) => {
  const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
  if (profile) {
    logProfileName.value = profile.name;
    showLogModal.value = true;
  }
};

// 备份函数由 useBackupLogic 提供
// 格式化函数由 utils.js 提供
const formattedTotalRemainingTraffic = computed(() => formatBytes(totalRemainingTraffic.value));
</script>

<template>
  <div v-if="isLoading" class="w-full">
    <SkeletonLoader type="dashboard" />
  </div>
  <div v-else class="w-full">
    <!-- Header -->
    <DashboardHeader
      :formatted-total-remaining-traffic="formattedTotalRemainingTraffic"
      @open-log="
        logProfileName = '';
        showLogModal = true;
      "
      @open-bulk-import="showBulkImportModal = true"
    />

    <SavePrompt
      :is-dirty="isDirty"
      :is-discarding="isDiscarding"
      :save-state="saveState"
      @discard="handleDiscard"
      @save="handleSave"
    />

    <!-- Main Grid -->
    <div class="grid grid-cols-1 gap-4 items-start lg:grid-cols-3">
      <!-- Left Column: Persistent Link Generator -->
      <div class="space-y-4 lg:col-span-1 lg:sticky lg:top-[4.5rem]">
        <RightPanel
          :compact="true"
          :config="settings"
          :profiles="profiles"
          @qrcode="
            (url, title) => {
              qrCodeUrl = url;
              qrCodeTitle = title;
              showQRCodeModal = true;
            }
          "
        />
      </div>

      <!-- Right Column: Tabbed Management Panels -->
      <div class="space-y-4 lg:col-span-2">
        <!-- Classic Layout Module Tabs -->
        <div
          class="flex items-center gap-1 rounded-md border border-line bg-surface p-1 overflow-x-auto"
          data-testid="classic-dashboard-tabs"
          role="tablist"
        >
          <button
            v-for="tab in classicTabs"
            :key="tab.id"
            :aria-selected="activeTab === tab.id"
            :class="[
              activeTab === tab.id
                ? 'bg-active text-fg border-line-strong font-semibold'
                : 'bg-transparent text-fg-muted border-transparent hover:bg-hover hover:text-fg',
            ]"
            :data-testid="`classic-tab-${tab.id}`"
            class="flex-1 min-w-fit inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap"
            role="tab"
            type="button"
            @click="setActiveTab(tab.id)"
          >
            <component :is="tab.icon" class="h-4 w-4 shrink-0" stroke-width="1.75" />
            <span>{{ tab.label }}</span>
            <span
              :class="[
                activeTab === tab.id
                  ? 'border-line-strong bg-surface text-fg'
                  : 'border-line bg-transparent text-fg-subtle',
              ]"
              class="rounded-md border px-1.5 py-0.5 text-[11px] font-mono leading-none"
            >
              {{ tab.count }}
            </span>
          </button>
        </div>

        <!-- Subscription Panel -->
        <SubscriptionPanel
          v-if="activeTab === 'subscriptions'"
          :active-tag-filters="subscriptionTagFilters"
          :current-page="subscriptionsCurrentPage"
          :filtered-count="filteredSubscriptionCount"
          :is-refreshing="isRefreshingSubscriptions"
          :is-sorting="isSortingSubs"
          :items-per-page="subscriptionsPerPage"
          :last-refresh-at="lastSubscriptionRefreshAt"
          :refresh-error="subscriptionRefreshError"
          :search-query="subscriptionSearchQuery"
          :subscriptions="subscriptions"
          :tags="subscriptionTags"
          searchable
          @add="handleAddSubscription"
          @applyDetectedName="handleApplyDetectedName"
          @change-page="changeSubscriptionsPage"
          @delete="handleDeleteSubscriptionWithCleanup"
          @edit="(id) => handleEditSubscription(subscriptions.find((s) => s.id === id))"
          @import="showSubBulkImportModal = true"
          @preview="handlePreviewSubscription"
          @qrcode="(id) => handleQRCode(id, 'subscription')"
          @reorder="reorderSubscriptions"
          @update:items-per-page="(val) => (subscriptionsPerPage = val)"
          @update-search="(query) => (subscriptionSearchQuery = query)"
          @set-tag-filters="setSubscriptionTagFilters"
          @manage-tags="showSubTagManagementModal = true"
          @update-node-count="handleUpdateNodeCount"
          @refresh-all="batchUpdateAllSubscriptions"
          @toggle-sort="isSortingSubs = !isSortingSubs"
          @mark-dirty="markDirty"
          @delete-all="showDeleteSubsModal = true"
          @open-batch-tag-modal="(ids) => handleOpenBatchTagModal(ids, 'subscription')"
          @batch-delete-subscriptions="(ids) => handleBatchDeleteRequest(ids, 'subscription')"
        />

        <!-- Manual Node Panel -->
        <ManualNodePanel
          v-else-if="activeTab === 'nodes'"
          :active-tag-filters="activeTagFilters"
          :attr-filters="attrFilters"
          :compact-grid="true"
          :current-page="manualNodesCurrentPage"
          :is-inspecting-nodes="isInspectingNodes"
          :is-pinging-all="isPingingAll"
          :is-sorting="isSortingNodes"
          :items-per-page="manualNodesPerPage"
          :manual-nodes="manualNodes"
          :node-inspect-map="nodeInspectMap"
          :paginated-manual-nodes="paginatedManualNodes"
          :ping-mode="pingMode"
          :ping-results="pingResults"
          :pinging-nodes="pingingNodes"
          :search-term="searchTerm"
          :tags="manualNodeTags"
          :total-pages="manualNodesTotalPages"
          @add="handleAddNode"
          @deduplicate="handleDeduplicateNodes"
          @delete="handleDeleteNodeWithCleanup"
          @edit="(id) => handleEditNode(manualNodes.find((n) => n.id === id))"
          @import="showSubscriptionImportModal = true"
          @inspect-all="inspectNodes(manualNodes, { force: true })"
          @ping="pingNodeId"
          @reorder="reorderManualNodes"
          @change-page="changeManualNodesPage"
          @update:items-per-page="(val) => (manualNodesPerPage = val)"
          @update:ping-mode="setPingMode"
          @update:search-term="handleSearchTermUpdate"
          @toggle-sort="isSortingNodes = !isSortingNodes"
          @mark-dirty="markDirty"
          @auto-sort="handleAutoSortNodes"
          @delete-all="showDeleteNodesModal = true"
          @set-tag-filters="setTagFilters"
          @toggle-tag-filter="toggleTagFilter"
          @toggle-protocol-filter="toggleProtocolFilter"
          @toggle-country-filter="toggleCountryFilter"
          @toggle-network-filter="toggleNetworkFilter"
          @clear-attr-filters="clearAttrFilters"
          @batch-delete-nodes="handleBatchDeleteRequest"
          @open-batch-tag-modal="handleOpenBatchTagModal"
          @manage-tags="handleOpenNodeTagManagement"
          @ping-all="pingAllNodes"
          @sort-by-latency="handleSortByLatency"
        />

        <!-- Profile Panel -->
        <ProfilePanel
          v-else
          :active-tag-filters="profileTagFilters"
          :current-page="profilesCurrentPage"
          :filtered-count="filteredProfiles.length"
          :is-sorting="isSortingProfiles"
          :items-per-page="profilesPerPage"
          :paginated-profiles="paginatedProfiles"
          :profiles="profiles"
          :search-query="profileSearchQuery"
          :tags="profileTags"
          :total-pages="profilesTotalPages"
          searchable
          @add="handleAddProfile"
          @delete="handleDeleteProfile"
          @deleteAll="showDeleteProfilesModal = true"
          @edit="handleEditProfile"
          @preview="handlePreviewProfile"
          @qrcode="(id) => handleQRCode(id, 'profile')"
          @reorder="reorderProfiles"
          @toggle="handleProfileToggle"
          @viewLogs="handleViewLogs"
          @update-search="(query) => (profileSearchQuery = query)"
          @set-tag-filters="setProfileTagFilters"
          @manage-tags="showProfileTagManagementModal = true"
          @change-page="changeProfilesPage"
          @update:items-per-page="(val) => (profilesPerPage = val)"
          @open-copy="handleOpenCopy"
          @toggle-sort="isSortingProfiles = !isSortingProfiles"
          @open-batch-tag-modal="(ids) => handleOpenBatchTagModal(ids, 'profile')"
          @batch-delete-profiles="(ids) => handleBatchDeleteRequest(ids, 'profile')"
        />
      </div>
    </div>
  </div>

  <BulkImportModal v-model:show="showBulkImportModal" @import="(txt, tags) => handleBulkImport(txt, tags)" />
  <SubscriptionBulkImportModal
    v-model:show="showSubBulkImportModal"
    @import="(txt, tags) => handleSubscriptionBulkImport(txt, tags)"
  />
  <LogModal v-model:show="showLogModal" :filter-profile-name="logProfileName" />
  <Modal v-model:show="showDeleteSubsModal" @confirm="handleDeleteAllSubscriptionsWithCleanup"
    ><template #title>
      <h3 class="text-lg font-bold text-red-500">
        {{ t('subscriptions.deleteAllConfirmTitle') }}
      </h3> </template
    ><template #body>
      <p class="text-sm text-fg-subtle">
        {{ t('subscriptions.deleteAllConfirmBody') }}
      </p>
    </template></Modal
  >
  <Modal v-model:show="showDeleteNodesModal" @confirm="handleDeleteAllNodesWithCleanup"
    ><template #title>
      <h3 class="text-lg font-bold text-red-500">
        {{ t('manualNodes.deleteAllConfirmTitle') }}
      </h3> </template
    ><template #body>
      <p class="text-sm text-fg-subtle">
        {{ t('manualNodes.deleteAllConfirmBody') }}
      </p>
    </template></Modal
  >
  <Modal v-model:show="showBatchDeleteModal" @confirm="confirmBatchDelete">
    <template #title>
      <h3 class="text-lg font-bold text-red-500">
        {{ batchDeleteConfirmTitle }}
      </h3>
    </template>
    <template #body>
      <p class="text-sm text-fg-muted">
        {{ batchDeleteConfirmBody }}
      </p>
    </template>
  </Modal>
  <Modal v-model:show="showDeleteProfilesModal" @confirm="handleDeleteAllProfiles"
    ><template #title>
      <h3 class="text-lg font-bold text-red-500">
        {{ t('profiles.deleteAllConfirmTitle') }}
      </h3> </template
    ><template #body>
      <p class="text-sm text-fg-subtle">
        {{ t('profiles.deleteAllConfirmBody') }}
      </p>
    </template></Modal
  >

  <ProfileModal
    v-if="showProfileModal"
    v-model:show="showProfileModal"
    :all-manual-nodes="manualNodes"
    :all-subscriptions="subscriptions"
    :is-new="isNewProfile"
    :profile="editingProfile"
    @save="handleSaveProfile"
  />

  <ManualNodeEditModal
    v-model:show="showNodeModal"
    :editing-node="editingNode"
    :is-new="isNewNode"
    :tags="manualNodeTags"
    @confirm="handleSaveNode"
    @input-url="handleNodeUrlInput"
  />
  <ManualNodeDedupModal
    v-model:show="showDedupModal"
    :plan="dedupPlan"
    @confirm="
      applyDedupPlan(dedupPlan);
      showDedupModal = false;
      dedupPlan = null;
    "
  />

  <BatchTagModal v-model:show="showBatchTagModal" :tags="batchTagCandidateTags" @confirm="handleBatchTagConfirm" />

  <TagManagementModal
    v-model:show="showNodeTagManagementModal"
    :tags="manualNodeTags"
    @delete="handleNodeTagDelete"
    @rename="handleNodeTagRename"
    @reorder="handleNodeTagReorder"
  />

  <TagManagementModal
    v-model:show="showSubTagManagementModal"
    :tags="subscriptionTags"
    @delete="handleSubTagDelete"
    @rename="handleSubTagRename"
    @reorder="handleSubTagReorder"
  />

  <TagManagementModal
    v-model:show="showProfileTagManagementModal"
    :tags="profileTags"
    @delete="handleProfileTagDelete"
    @rename="handleProfileTagRename"
    @reorder="handleProfileTagReorder"
  />

  <SubscriptionEditModal
    v-model:show="showSubModal"
    :editing-subscription="editingSubscription"
    :is-new="isNewSubscription"
    @confirm="handleSaveSubscription"
  />

  <SettingsModal
    v-model:show="uiStore.isSettingsModalVisible"
    :export-backup="exportBackup"
    :import-backup="importBackup"
  />
  <SubscriptionImportModal
    :add-nodes-from-bulk="addNodesFromBulk"
    :show="showSubscriptionImportModal"
    :tags="manualNodeTags"
    @update:show="showSubscriptionImportModal = $event"
  />

  <!-- Node preview modal -->
  <NodePreviewModal
    :profile-id="previewProfileId"
    :profile-name="previewProfileName"
    :show="showNodePreviewModal"
    :subscription-id="previewSubscriptionId"
    :subscription-name="previewSubscriptionName"
    :subscription-url="previewSubscriptionUrl"
    @update:show="showNodePreviewModal = $event"
  />

  <QRCodeModal v-model:show="showQRCodeModal" :title="qrCodeTitle" :url="qrCodeUrl" />

  <CopyLinkModal
    v-if="showCopyModal && showCopyModalProfile"
    v-model:show="showCopyModal"
    :profile="showCopyModalProfile"
    :token="settings?.profileToken"
  />
</template>
