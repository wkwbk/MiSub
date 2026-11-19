<script setup>
    import {
        computed,
        defineAsyncComponent,
        nextTick,
        onMounted,
        onUnmounted,
        ref,
        watch,
    } from 'vue';
    import { formatBytes } from '@/lib/utils.js';
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
    import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';
    import { inferAirportRootDomain } from '@/utils/airport-domain.js';
    import { rememberDomainName } from '@/utils/domain-name-memory.js';
    import { useStickyColumns } from '@/composables/useStickyColumn.js';
    // --- Component Imports ---
    import RightPanel from '@/components/profiles/RightPanel.vue';
    import ProfilePanel from '@/components/profiles/ProfilePanel.vue';
    import SubscriptionPanel from '@/components/subscriptions/SubscriptionPanel.vue';
    import ManualNodePanel from '@/components/nodes/ManualNodePanel.vue';
    import Modal from '@/components/forms/Modal.vue';
    import SubscriptionEditModal from '@/components/modals/SubscriptionEditModal.vue';
    import ManualNodeEditModal from '@/components/modals/ManualNodeEditModal.vue';
    import ManualNodeDedupModal from '@/components/modals/ManualNodeDedupModal.vue';
    import SkeletonLoader from '@/components/ui/SkeletonLoader.vue';
    import DashboardHeader from '@/components/features/Dashboard/DashboardHeader.vue';
    import SavePrompt from '@/components/ui/SavePrompt.vue';

    const isDev = import.meta.env.DEV;

    const SettingsModal = defineAsyncComponent(
        () => import('@/components/modals/SettingsModal.vue')
    );
    const BulkImportModal = defineAsyncComponent(
        () => import('@/components/modals/BulkImportModal.vue')
    );
    const SubscriptionBulkImportModal = defineAsyncComponent(
        () => import('@/components/modals/SubscriptionBulkImportModal.vue')
    );
    const ProfileModal = defineAsyncComponent(() => import('@/components/modals/ProfileModal.vue'));
    const SubscriptionImportModal = defineAsyncComponent(
        () => import('@/components/modals/SubscriptionImportModal.vue')
    );
    const LogModal = defineAsyncComponent(() => import('@/components/modals/LogModal.vue'));
    const NodePreviewModal = defineAsyncComponent(
        () => import('@/components/modals/NodePreview/NodePreviewModal.vue')
    );

    const BatchTagModal = defineAsyncComponent(
        () => import('@/components/modals/BatchTagModal.vue')
    );
    const TagManagementModal = defineAsyncComponent(
        () => import('@/components/modals/TagManagementModal.vue')
    );
    const QRCodeModal = defineAsyncComponent(() => import('@/components/modals/QRCodeModal.vue'));
    const CopyLinkModal = defineAsyncComponent(
        () => import('@/components/modals/CopyLinkModal.vue')
    );

    // --- 基礎 Props 和狀態 ---
    const props = defineProps({ data: Object });
    const { showToast } = useToastStore();
    const { t } = useI18n();
    const uiStore = useUIStore();
    const dataStore = useDataStore();
    const { settings, isDirty, isLoading } = storeToRefs(dataStore); // Use store refs
    const config = settings; // Compatibility alias for template
    const { clearDirty } = dataStore; // Don't destructure markDirty directly
    if (isDev) {
        console.debug('Dashboard: setup running');
    }

    const saveState = ref('idle');

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
    const manualNodeViewMode = ref('card');
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
        filteredSubscriptions: filteredSubscriptionList,
        filteredCount: filteredSubscriptionCount,
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
        deduplicateNodes,
        reorderManualNodes,
        activeTagFilters,
        setTagFilters,
        toggleTagFilter,
        batchUpdateTags,
        batchDeleteNodes,
        buildDedupPlan,
        applyDedupPlan,
        manualNodeTags,
        renameTag,
        deleteTag,
        reorderTags,
        pingResults,
        pingingNodes,
        pingNodeId,
        pingAllNodes,
    } = useManualNodes(markDirty);

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
        initializeProfiles,
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
        profilesTotalPages,
        paginatedProfiles,
        changeProfilesPage,
        copyProfileLink,
        copyClashLink,
        cleanupSubscriptions,
        cleanupNodes,
        cleanupAllSubscriptions,
        cleanupAllNodes,
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

    const { showModal: showSubBulkImportModal, handleSubscriptionBulkImport } =
        useSubscriptionBulkImport({
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

    const mainGridRef = ref(null);
    const leftColRef = ref(null);
    const rightColRef = ref(null);

    const { refreshStickyColumns, reobserveStickyColumns } = useStickyColumns(mainGridRef, [
        leftColRef,
        rightColRef,
    ]);

    watch([isLoading, mainGridRef], () => {
        nextTick(() => {
            reobserveStickyColumns();
            refreshStickyColumns();
        });
    });

    onMounted(() => {
        initializeState();
        window.addEventListener('beforeunload', handleBeforeUnload);
        const savedViewMode = readRawPreference('manualNodeViewMode');
        if (savedViewMode) {
            manualNodeViewMode.value = savedViewMode;
        }
        // 启动订阅自动更新定时器（每30分钟）
        startAutoUpdate();
    });

    onUnmounted(() => {
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
        }
    );

    const setViewMode = (mode) => {
        manualNodeViewMode.value = mode;
        writeRawPreference('manualNodeViewMode', mode);
    };

    // --- 其他 JS 逻辑 (省略) ---
    const handleDiscard = async () => {
        // 强制刷新数据，忽略缓存
        await dataStore.fetchData(true);
        isSortingSubs.value = false;
        isSortingNodes.value = false;
        isSortingProfiles.value = false;
        showToast(t('notices.discardedChanges'));
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
            return t('subscriptions.batchDeleteConfirmBody', { count: batchDeleteIds.value.length });
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
            :save-state="saveState"
            @save="handleSave"
            @discard="handleDiscard"
        />

        <!-- Main Grid -->
        <div ref="mainGridRef" class="grid grid-cols-1 gap-4 items-start xl:grid-cols-3">
            <div ref="leftColRef" class="space-y-4 xl:col-span-2">
                <!-- Subscription Panel -->
                <SubscriptionPanel
                    searchable
                    :search-query="subscriptionSearchQuery"
                    :filtered-count="filteredSubscriptionCount"
                    :is-refreshing="isRefreshingSubscriptions"
                    :refresh-error="subscriptionRefreshError"
                    :last-refresh-at="lastSubscriptionRefreshAt"
                    :subscriptions="subscriptions"
                    :tags="subscriptionTags"
                    :active-tag-filters="subscriptionTagFilters"
                    :is-sorting="isSortingSubs"
                    @update-search="(query) => (subscriptionSearchQuery = query)"
                    @set-tag-filters="setSubscriptionTagFilters"
                    @manage-tags="showSubTagManagementModal = true"
                    @add="handleAddSubscription"
                    @delete="handleDeleteSubscriptionWithCleanup"
                    @update-node-count="handleUpdateNodeCount"
                    @refresh-all="batchUpdateAllSubscriptions"
                    @edit="(id) => handleEditSubscription(subscriptions.find((s) => s.id === id))"
                    @applyDetectedName="handleApplyDetectedName"
                    @toggle-sort="isSortingSubs = !isSortingSubs"
                    @mark-dirty="markDirty"
                    @delete-all="showDeleteSubsModal = true"
                    @preview="handlePreviewSubscription"
                    @reorder="reorderSubscriptions"
                    @qrcode="(id) => handleQRCode(id, 'subscription')"
                    @import="showSubBulkImportModal = true"
                    @open-batch-tag-modal="(ids) => handleOpenBatchTagModal(ids, 'subscription')"
                    @batch-delete-subscriptions="(ids) => handleBatchDeleteRequest(ids, 'subscription')"
                />

                <!-- Manual Node Panel -->
                <ManualNodePanel
                    :manual-nodes="manualNodes"
                    :paginated-manual-nodes="paginatedManualNodes"
                    :current-page="manualNodesCurrentPage"
                    :total-pages="manualNodesTotalPages"
                    :is-sorting="isSortingNodes"
                    :search-term="searchTerm"
                    :view-mode="manualNodeViewMode"
                    :active-tag-filters="activeTagFilters"
                    :ping-results="pingResults"
                    :pinging-nodes="pingingNodes"
                    :tags="manualNodeTags"
                    :compact-grid="true"
                    @add="handleAddNode"
                    @delete="handleDeleteNodeWithCleanup"
                    @edit="(id) => handleEditNode(manualNodes.find((n) => n.id === id))"
                    @change-page="changeManualNodesPage"
                    @update:search-term="handleSearchTermUpdate"
                    @update:view-mode="setViewMode"
                    @toggle-sort="isSortingNodes = !isSortingNodes"
                    @mark-dirty="markDirty"
                    @auto-sort="handleAutoSortNodes"
                    @deduplicate="handleDeduplicateNodes"
                    @import="showSubscriptionImportModal = true"
                    @delete-all="showDeleteNodesModal = true"
                    @reorder="reorderManualNodes"
                    @set-tag-filters="setTagFilters"
                    @toggle-tag-filter="toggleTagFilter"
                    @batch-delete-nodes="handleBatchDeleteRequest"
                    @open-batch-tag-modal="handleOpenBatchTagModal"
                    @manage-tags="handleOpenNodeTagManagement"
                    @ping="pingNodeId"
                    @ping-all="pingAllNodes"
                />
            </div>

            <!-- Right Column -->
            <div ref="rightColRef" class="space-y-4 xl:col-span-1">
                <RightPanel
                    :config="config"
                    :profiles="profiles"
                    :compact="true"
                    @qrcode="
                        (url, title) => {
                            qrCodeUrl = url;
                            qrCodeTitle = title;
                            showQRCodeModal = true;
                        }
                    "
                />
                <ProfilePanel
                    :profiles="profiles"
                    :paginated-profiles="paginatedProfiles"
                    :tags="profileTags"
                    :active-tag-filters="profileTagFilters"
                    :current-page="profilesCurrentPage"
                    :total-pages="profilesTotalPages"
                    :search-query="profileSearchQuery"
                    :filtered-count="filteredProfiles.length"
                    searchable
                    :compact="true"
                    :is-sorting="isSortingProfiles"
                    @update-search="(query) => (profileSearchQuery = query)"
                    @set-tag-filters="setProfileTagFilters"
                    @manage-tags="showProfileTagManagementModal = true"
                    @change-page="changeProfilesPage"
                    @add="handleAddProfile"
                    @edit="handleEditProfile"
                    @delete="handleDeleteProfile"
                    @deleteAll="showDeleteProfilesModal = true"
                    @toggle="handleProfileToggle"
                    @open-copy="handleOpenCopy"
                    @copyLink="copyProfileLink"
                    @copyClashLink="copyClashLink"
                    @preview="handlePreviewProfile"
                    @viewLogs="handleViewLogs"
                    @reorder="reorderProfiles"
                    @qrcode="(id) => handleQRCode(id, 'profile')"
                    @toggle-sort="isSortingProfiles = !isSortingProfiles"
                    @open-batch-tag-modal="(ids) => handleOpenBatchTagModal(ids, 'profile')"
                    @batch-delete-profiles="(ids) => handleBatchDeleteRequest(ids, 'profile')"
                />
            </div>
        </div>
    </div>

    <BulkImportModal
        v-model:show="showBulkImportModal"
        @import="(txt, tags) => handleBulkImport(txt, tags)"
    />
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
        :profile="editingProfile"
        :is-new="isNewProfile"
        :all-subscriptions="subscriptions"
        :all-manual-nodes="manualNodes"
        @save="handleSaveProfile"
    />

    <ManualNodeEditModal
        v-model:show="showNodeModal"
        :is-new="isNewNode"
        :editing-node="editingNode"
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

    <BatchTagModal
        v-model:show="showBatchTagModal"
        :tags="batchTagCandidateTags"
        @confirm="handleBatchTagConfirm"
    />

    <TagManagementModal
        v-model:show="showNodeTagManagementModal"
        :tags="manualNodeTags"
        @rename="handleNodeTagRename"
        @delete="handleNodeTagDelete"
        @reorder="handleNodeTagReorder"
    />

    <TagManagementModal
        v-model:show="showSubTagManagementModal"
        :tags="subscriptionTags"
        @rename="handleSubTagRename"
        @delete="handleSubTagDelete"
        @reorder="handleSubTagReorder"
    />

    <TagManagementModal
        v-model:show="showProfileTagManagementModal"
        :tags="profileTags"
        @rename="handleProfileTagRename"
        @delete="handleProfileTagDelete"
        @reorder="handleProfileTagReorder"
    />

    <SubscriptionEditModal
        v-model:show="showSubModal"
        :is-new="isNewSubscription"
        :editing-subscription="editingSubscription"
        @confirm="handleSaveSubscription"
    />

    <SettingsModal
        v-model:show="uiStore.isSettingsModalVisible"
        :export-backup="exportBackup"
        :import-backup="importBackup"
    />
    <SubscriptionImportModal
        :show="showSubscriptionImportModal"
        @update:show="showSubscriptionImportModal = $event"
        :add-nodes-from-bulk="addNodesFromBulk"
        :tags="manualNodeTags"
    />

    <!-- Node preview modal -->
    <NodePreviewModal
        :show="showNodePreviewModal"
        :subscription-id="previewSubscriptionId"
        :subscription-name="previewSubscriptionName"
        :subscription-url="previewSubscriptionUrl"
        :profile-id="previewProfileId"
        :profile-name="previewProfileName"
        @update:show="showNodePreviewModal = $event"
    />

    <QRCodeModal v-model:show="showQRCodeModal" :url="qrCodeUrl" :title="qrCodeTitle" />

    <CopyLinkModal
        v-if="showCopyModal && showCopyModalProfile"
        v-model:show="showCopyModal"
        :profile="showCopyModalProfile"
        :token="settings?.profileToken"
    />
</template>

<style scoped>
    .slide-fade-enter-active,
    .slide-fade-leave-active {
        transition: all 0.3s ease-out;
    }

    .slide-fade-enter-from,
    .slide-fade-leave-to {
        transform: translateY(-20px);
        opacity: 0;
    }

    .cursor-move {
        cursor: move;
    }

    .slide-fade-sm-enter-active,
    .slide-fade-sm-leave-active {
        transition: all 0.2s ease-out;
    }

    .slide-fade-sm-enter-from,
    .slide-fade-sm-leave-to {
        transform: translateY(-10px);
        opacity: 0;
    }
</style>
