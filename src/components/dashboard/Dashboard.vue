<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { ManualNodeItem, ProfileConfig, SubscriptionItem } from '@misub/core/types.js';
import { FolderKanban, Layers, Server } from '@lucide/vue';
import { formatBytes } from '@misub/core/utils/format-utils.js';
import { getProfileShareIdentifier } from '@misub/core/domain/profile-link.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { useUIStore } from '@/stores/useUiStore.js';
import { useDataStore } from '@/stores/useDataStore.js';
import { useSubscriptions } from '@/composables/useSubscriptions.js';
import { useManualNodes, type TagBatchMode } from '@/composables/useManualNodes.js';
import type { DedupPlan } from '@/composables/manual-nodes/dedup.js';
import { useProfiles } from '@/composables/useProfiles.js';
import { useSubscriptionForms } from '@/composables/useSubscriptionForms.js';
import { useNodeForms } from '@/composables/useNodeForms.js';
import { useBulkImportLogic } from '@/composables/useBulkImportLogic.js';
import { useSubscriptionBulkImport } from '@/composables/useSubscriptionBulkImport.js';
import { useBackupLogic } from '@/composables/useBackupLogic.js';
import { storeToRefs } from 'pinia';
import { useI18n } from '@/i18n/index.js';
import { inferAirportRootDomain } from '@misub/core/domain/airport-domain.js';
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
const loadImportModal = () => import('@/components/modals/ImportModal.vue');
const loadCopyLinkModal = () => import('@/components/modals/CopyLinkModal.vue');
const loadQRCodeModal = () => import('@/components/modals/QRCodeModal.vue');

const SubscriptionEditModal = defineAsyncComponent(loadSubscriptionEditModal);
const ManualNodeEditModal = defineAsyncComponent(loadManualNodeEditModal);
const ManualNodeDedupModal = defineAsyncComponent(() => import('@/components/modals/ManualNodeDedupModal.vue'));

const SettingsModal = defineAsyncComponent(() => import('@/components/modals/SettingsModal.vue'));
const ImportModal = defineAsyncComponent(loadImportModal);
const ProfileModal = defineAsyncComponent(loadProfileModal);
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
const { clearDirty } = dataStore;
if (isDev) {
  console.debug('Dashboard: setup running');
}

const saveState = ref<'idle' | 'saving' | 'success'>('idle');
const isDiscarding = ref(false);
let cancelModalPrefetch = () => {};

const markDirty = () => {
  dataStore.markDirty();
  saveState.value = 'idle';
};

// --- 將狀態和邏輯委託給 Composables ---
const isSortingSubs = ref(false);
const isSortingNodes = ref(false);
const isSortingProfiles = ref(false);
const showQRCodeModal = ref(false);
const qrCodeUrl = ref('');
const qrCodeTitle = ref('');
const qrCodeIsSubscription = ref(false);
const showCopyModal = ref(false);
const showCopyModalProfile = ref<ProfileConfig | null>(null);

const handleQRCode = (id: string, type: 'subscription' | 'profile' = 'subscription') => {
  if (type === 'subscription') {
    const sub = subscriptions.value.find((s) => s.id === id);
    if (sub) {
      qrCodeUrl.value = sub.url;
      qrCodeTitle.value = sub.name || t('subscriptions.qrCodeTitle');
      qrCodeIsSubscription.value = false;
      showQRCodeModal.value = true;
    }
  } else if (type === 'profile') {
    const profile = profiles.value.find((p) => p.id === id);
    if (profile) {
      const token = (settings.value.profileToken || '').trim().replace(/^\/+|\/+$/g, '') || 'sub';
      const baseUrl = window.location.origin;
      const idToUse = getProfileShareIdentifier(profile);
      qrCodeUrl.value = `${baseUrl}/${token}/${idToUse}`;
      qrCodeTitle.value = profile.name || t('profiles.qrCodeTitle');
      qrCodeIsSubscription.value = true;
      showQRCodeModal.value = true;
    }
  }
};

const handleOpenCopy = (profileId: string) => {
  const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
  if (profile) {
    showCopyModalProfile.value = profile;
    showCopyModal.value = true;
  }
};

const {
  subscriptions: rawSubscriptions,
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
const subscriptions = rawSubscriptions as unknown as Ref<SubscriptionItem[]>;

const {
  manualNodes: rawManualNodes,
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
const manualNodes = rawManualNodes as unknown as Ref<ManualNodeItem[]>;

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

const handleSearchTermUpdate = (val: string) => {
  searchTerm.value = val;
};

const {
  profiles: rawProfiles,
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
const profiles = rawProfiles as unknown as Ref<ProfileConfig[]>;

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

const showDeleteSubsModal = ref(false);
const showDeleteNodesModal = ref(false);
const showSubscriptionImportModal = ref(false);
const showLogModal = ref(false);
const logProfileName = ref('');
const logProfileId = ref('');
const showBatchDeleteModal = ref(false);
const batchDeleteIds = ref<string[]>([]);
const batchDeleteType = ref<'node' | 'subscription' | 'profile'>('node');
const showDedupModal = ref(false);
const dedupPlan = ref<DedupPlan | null>(null);
const showBatchTagModal = ref(false);
const batchTagIds = ref<string[]>([]);
const batchTagType = ref<'node' | 'subscription' | 'profile'>('node');
const showNodeTagManagementModal = ref(false);
const showProfileTagManagementModal = ref(false);

// 节点预览相关状态
const showNodePreviewModal = ref(false);
const previewSubscriptionId = ref<string | null>(null);
const previewProfileId = ref<string | null>(null);
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

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (isDirty.value) {
    event.preventDefault();
    event.returnValue = t('common.unsavedLeaveConfirm');
  }
};

const CLASSIC_TAB_STORAGE_KEY = 'misub_classic_dashboard_tab';
const VALID_CLASSIC_TABS = ['nodes', 'subscriptions', 'profiles'];

const readInitialClassicTab = () => {
  const saved = readSessionPreference(CLASSIC_TAB_STORAGE_KEY);
  return saved && VALID_CLASSIC_TABS.includes(saved) ? saved : 'nodes';
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

const setActiveTab = (tabId: string) => {
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
    loadImportModal,
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
    const ok = await dataStore.saveData();
    if (!ok) {
      saveState.value = 'idle';
      return;
    }

    saveState.value = 'success';

    isSortingSubs.value = false;
    isSortingNodes.value = false;
    isSortingProfiles.value = false;

    setTimeout(() => {
      saveState.value = 'idle';
    }, 1500);
  } catch {
    saveState.value = 'idle';
  }
};

const handleDeleteSubscriptionWithCleanup = (subId: string) => {
  deleteSubscription(subId);
  // cleanup 已在 deleteSubscription 内部通过 removeSubscriptionFromProfiles 实现
};
const handleDeleteNodeWithCleanup = (nodeId: string) => {
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

const handleBatchDeleteRequest = (ids: string[], type: 'node' | 'subscription' | 'profile' = 'node') => {
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

const handleOpenBatchTagModal = (ids: string[], type: 'node' | 'subscription' | 'profile' = 'node') => {
  batchTagIds.value = ids;
  batchTagType.value = type;
  showBatchTagModal.value = true;
};

const handleBatchTagConfirm = (payload: { tags: string[]; mode: TagBatchMode }) => {
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

const handleNodeTagRename = (oldName: string, newName: string) => {
  renameTag(oldName, newName);
  showToast(t('tags.tagRenamed', { oldName, newName }), 'success');
};

const handleNodeTagDelete = (tagName: string) => {
  deleteTag(tagName);
  showToast(t('tags.tagDeleted', { name: tagName }), 'success');
};

const handleNodeTagReorder = (newOrder: string[]) => {
  reorderTags(newOrder);
  showToast(t('tags.tagOrderUpdated'), 'success');
};

const showSubTagManagementModal = ref(false);

const handleSubTagRename = (oldName: string, newName: string) => {
  renameSubscriptionTag(oldName, newName);
  showToast(t('tags.tagRenamed', { oldName, newName }), 'success');
};

const handleSubTagDelete = (tagName: string) => {
  deleteSubscriptionTag(tagName);
  showToast(t('tags.tagDeleted', { name: tagName }), 'success');
};

const handleSubTagReorder = (newOrder: string[]) => {
  reorderSubscriptionTags(newOrder);
  showToast(t('tags.tagOrderUpdated'), 'success');
};

const handleProfileTagRename = (oldName: string, newName: string) => {
  renameProfileTag(oldName, newName);
  showToast(t('tags.tagRenamed', { oldName, newName }), 'success');
};

const handleProfileTagDelete = (tagName: string) => {
  deleteProfileTag(tagName);
  showToast(t('tags.tagDeleted', { name: tagName }), 'success');
};

const handleProfileTagReorder = (newOrder: string[]) => {
  reorderProfileTags(newOrder);
  showToast(t('tags.tagOrderUpdated'), 'success');
};

const handleApplyDetectedName = (subscriptionId: string | undefined, name: string) => {
  if (!subscriptionId) return;
  const target = String(name || '').trim();
  if (!target) return;
  const subscription = subscriptions.value.find((s) => s.id === subscriptionId);
  if (!subscription) return;
  updateSubscription({ ...subscription, name: target });
  const domain = inferAirportRootDomain(subscription.url);
  if (domain) rememberDomainName(domain, target);
  showToast(t('subscriptions.nameApplied', { name: target }), 'success');
};

// 节点预览处理函数
const handlePreviewSubscription = (subscriptionId: string) => {
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

const handlePreviewProfile = (profileId: string) => {
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

const handleViewLogs = (profileId: string) => {
  const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId || p.linkId === profileId);
  if (profile) {
    logProfileId.value = profile.id;
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
    <DashboardHeader
      :formatted-total-remaining-traffic="formattedTotalRemainingTraffic"
      @open-log="
        logProfileId = '';
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

    <div class="grid grid-cols-1 gap-4 items-start lg:grid-cols-3">
      <div class="space-y-4 lg:col-span-1 lg:sticky lg:top-[4.5rem]">
        <RightPanel
          :compact="true"
          :config="settings"
          :profiles="profiles"
          @qrcode="
            (url, title) => {
              qrCodeUrl = url;
              qrCodeTitle = title;
              qrCodeIsSubscription = true;
              showQRCodeModal = true;
            }
          "
        />
      </div>

      <div class="space-y-4 lg:col-span-2">
        <div
          class="grid grid-cols-3 items-center gap-1 rounded-md border border-line bg-surface p-1"
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
            class="min-w-0 inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-md border px-2 sm:px-3 py-2 text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap"
            role="tab"
            type="button"
            @click="setActiveTab(tab.id)"
          >
            <component :is="tab.icon" class="hidden sm:block h-4 w-4 shrink-0" stroke-width="1.75" />
            <span class="truncate">{{ tab.label }}</span>
            <span
              :class="[
                activeTab === tab.id
                  ? 'border-line-strong bg-surface text-fg'
                  : 'border-line bg-transparent text-fg-subtle',
              ]"
              class="shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-mono leading-none"
            >
              {{ tab.count }}
            </span>
          </button>
        </div>

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

  <ImportModal
    v-model:show="showBulkImportModal"
    mode="bulk"
    @import="(txt, tags) => handleBulkImport(txt, tags)"
    @files-imported="(nodes, tags) => addNodesFromBulk(nodes, tags)"
  />
  <ImportModal
    v-model:show="showSubBulkImportModal"
    mode="subscriptions"
    @import="(txt, tags) => handleSubscriptionBulkImport(txt, tags)"
  />
  <LogModal v-model:show="showLogModal" :filter-profile-id="logProfileId" :filter-profile-name="logProfileName" />
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
    v-model:editing-node="editingNode"
    v-model:show="showNodeModal"
    :is-new="isNewNode"
    :tags="manualNodeTags"
    @confirm="handleSaveNode"
    @input-url="handleNodeUrlInput"
  />
  <ManualNodeDedupModal
    v-model:show="showDedupModal"
    :plan="dedupPlan!"
    @confirm="
      applyDedupPlan(dedupPlan!);
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
    v-model:editing-subscription="editingSubscription"
    v-model:show="showSubModal"
    :is-new="isNewSubscription"
    @confirm="handleSaveSubscription"
  />

  <SettingsModal
    v-model:show="uiStore.isSettingsModalVisible"
    :export-backup="exportBackup"
    :import-backup="importBackup"
  />
  <ImportModal
    :add-nodes-from-bulk="addNodesFromBulk"
    :show="showSubscriptionImportModal"
    :tags="manualNodeTags"
    mode="nodes"
    @update:show="showSubscriptionImportModal = $event"
  />

  <NodePreviewModal
    :profile-id="previewProfileId"
    :profile-name="previewProfileName"
    :show="showNodePreviewModal"
    :subscription-id="previewSubscriptionId"
    :subscription-name="previewSubscriptionName"
    :subscription-url="previewSubscriptionUrl"
    @update:show="showNodePreviewModal = $event"
  />

  <QRCodeModal
    v-model:show="showQRCodeModal"
    :subscription="qrCodeIsSubscription"
    :title="qrCodeTitle"
    :url="qrCodeUrl"
  />

  <CopyLinkModal
    v-if="showCopyModal && showCopyModalProfile"
    v-model:show="showCopyModal"
    :profile="showCopyModalProfile"
    :token="settings?.profileToken"
  />
</template>
