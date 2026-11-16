<script setup>
    import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
    import { useRoute, useRouter } from 'vue-router';
    import { useDataStore } from '@/stores/useDataStore.js';
    import { useSubscriptions } from '@/composables/useSubscriptions.js';
    import { useProfiles } from '@/composables/useProfiles.js';
    import { useSortingMode } from '@/composables/useSortingMode.js';
    import { useSubscriptionForms } from '@/composables/useSubscriptionForms.js';
    import { useSubscriptionBulkImport } from '@/composables/useSubscriptionBulkImport.js';
    import SubscriptionPanel from '@/components/subscriptions/SubscriptionPanel.vue';
    import Modal from '@/components/forms/Modal.vue';
    import SubscriptionEditModal from '@/components/modals/SubscriptionEditModal.vue';
    import { useToastStore } from '@/stores/toast.js';
    import { useI18n } from '@/i18n/index.js';
    import {
        matchesSubscriptionStatus,
        resolveSubscriptionStatusFilter,
    } from '@/utils/dashboard-deeplink.js';

    const GroupManagementModal = defineAsyncComponent(
        () => import('@/components/modals/GroupManagementModal.vue')
    );

    const dataStore = useDataStore();
    const { showToast } = useToastStore();
    const { markDirty } = dataStore;
    const { t } = useI18n();
    const route = useRoute();
    const router = useRouter();

    // State
    // State
    const isSortingSubs = useSortingMode(dataStore);
    const showDeleteSubsModal = ref(false);
    const showGroupManagementModal = ref(false);

    const {
        subscriptions,
        subscriptionGroups,
        activeGroupFilter,
        setGroupFilter,
        renameSubscriptionGroup,
        deleteSubscriptionGroup,
        filteredSubscriptions,
        searchQuery: subscriptionSearchQuery,
        addSubscription,
        updateSubscription,
        deleteSubscription,
        deleteAllSubscriptions,
        addSubscriptionsFromBulk,
        handleUpdateNodeCount,
        batchUpdateAllSubscriptions,
        reorderSubscriptions,
        isRefreshing,
        refreshError,
        lastRefreshAt,
    } = useSubscriptions(markDirty);

    const { cleanupSubscriptions, cleanupAllSubscriptions } = useProfiles(markDirty);

    // Composables
    const {
        showModal: showSubModal,
        isNew: isNewSubscription,
        editingSubscription,
        openAdd: handleAddSubscription,
        openEdit: handleEditSubscription,
        handleSave: handleSaveSubscription,
    } = useSubscriptionForms({ addSubscription, updateSubscription });

    const { showModal: showBulkImportModal, handleSubscriptionBulkImport } =
        useSubscriptionBulkImport({
            addSubscriptionsFromBulk,
            updateSubscription,
        });

    const openBulkImportModal = () => {
        showBulkImportModal.value = true;
    };

    const handleDeleteSubscriptionWithCleanup = (subId) => {
        deleteSubscription(subId);
        cleanupSubscriptions(subId);
    };

    const handleDeleteAllSubscriptionsWithCleanup = () => {
        deleteAllSubscriptions();
        cleanupAllSubscriptions();
        showDeleteSubsModal.value = false;
    };

    // Preview
    const NodePreviewModal = defineAsyncComponent(
        () => import('@/components/modals/NodePreview/NodePreviewModal.vue')
    );
    const showNodePreviewModal = ref(false);
    const previewSubscriptionId = ref(null);
    const previewSubscriptionName = ref('');
    const previewSubscriptionUrl = ref('');

    // 将当前显示组确认为一个机场身份，并统一显示组名；订阅源自身名称保持不变。
    const handleGroupRename = (oldName, newName) => {
        renameSubscriptionGroup(oldName, newName);
        showToast(t('manualNodes.groupRenamed'), 'success');
    };

    const handleGroupDelete = (groupName) => {
        deleteSubscriptionGroup(groupName);
        showToast(t('manualNodes.groupDeleted'), 'success');
    };

    // 应用识别到的机场名（来自订阅响应头 / 官网标题）
    const handleApplyDetectedName = (subscriptionId, name) => {
        const target = String(name || '').trim();
        if (!target) return;
        // useSubscriptions 的 updateSubscription 接收「完整订阅对象」而非 (id, patch)
        const targetSub = subscriptions.value.find((s) => s.id === subscriptionId);
        if (!targetSub) return;
        updateSubscription({
            ...targetSub,
            name: target,
        });
        showToast(t('subscriptions.nameApplied', { name: target }), 'success');
    };

    const handlePreviewSubscription = (subscriptionId) => {
        const subscription = subscriptions.value.find((s) => s.id === subscriptionId);
        if (subscription) {
            previewSubscriptionId.value = subscriptionId;
            previewSubscriptionName.value = subscription.name || t('subscriptions.unnamed');
            previewSubscriptionUrl.value = subscription.url;
            showNodePreviewModal.value = true;
        }
    };

    // Subscription Bulk Import Logic
    const SubscriptionBulkImportModal = defineAsyncComponent(
        () => import('@/components/modals/SubscriptionBulkImportModal.vue')
    );

    // QRCode
    const QRCodeModal = defineAsyncComponent(() => import('@/components/modals/QRCodeModal.vue'));
    const showQRCodeModal = ref(false);
    const qrCodeUrl = ref('');
    const qrCodeTitle = ref('');

    const handleQRCode = (id) => {
        const sub = subscriptions.value.find((s) => s.id === id);
        if (sub) {
            qrCodeUrl.value = sub.url;
            qrCodeTitle.value = sub.name || t('subscriptions.qrCodeTitle');
            showQRCodeModal.value = true;
        }
    };

    // --- Dashboard deep-link status filter (?status=error / expired / ...) ---
    // The dashboard health cards link here with a status. Previously the query
    // was dropped, so the user landed on an unfiltered list.
    const activeStatusFilter = ref('');
    const STATUS_FILTER_LABEL_KEYS = {
        disabled: 'subscriptions.filterStatusDisabled',
        error: 'subscriptions.filterStatusError',
        expired: 'subscriptions.filterStatusExpired',
        'low-traffic': 'subscriptions.filterStatusLowTraffic',
        'zero-nodes': 'subscriptions.filterStatusZeroNodes',
    };

    const statusFilterLabel = computed(() => {
        const key = STATUS_FILTER_LABEL_KEYS[activeStatusFilter.value];
        return key ? t(key) : '';
    });

    // Subscriptions matching the active status filter, before search/pagination.
    const statusFilteredSubscriptions = computed(() => {
        if (!activeStatusFilter.value) return subscriptions.value;
        return subscriptions.value.filter((sub) =>
            matchesSubscriptionStatus(sub, activeStatusFilter.value)
        );
    });

    function applyStatusFromQuery() {
        activeStatusFilter.value = resolveSubscriptionStatusFilter(route.query?.status) || '';
    }

    const clearStatusFilter = () => {
        activeStatusFilter.value = '';
        if (route.query?.status) {
            const nextQuery = { ...route.query };
            delete nextQuery.status;
            router.replace({ query: nextQuery });
        }
    };

    onMounted(applyStatusFromQuery);
    watch(() => route.query.status, applyStatusFromQuery);

    // `subscriptions` is the prop the panel renders; when a status filter is
    // active we narrow it so the list, the count and pagination all agree.
    const visibleSubscriptions = computed(() =>
        activeStatusFilter.value ? statusFilteredSubscriptions.value : subscriptions.value
    );
</script>

<template>
    <div class="w-full">
        <SubscriptionPanel
            :subscriptions="visibleSubscriptions"
            :groups="subscriptionGroups"
            :active-group-filter="activeGroupFilter"
            :search-query="subscriptionSearchQuery"
            :filtered-count="filteredSubscriptions.length"
            :status-filter="activeStatusFilter"
            :status-filter-label="statusFilterLabel"
            :is-refreshing="isRefreshing"
            :refresh-error="refreshError"
            :last-refresh-at="lastRefreshAt"
            :is-sorting="isSortingSubs"
            searchable
            @clear-status-filter="clearStatusFilter"
            @set-group-filter="setGroupFilter"
            @manage-groups="showGroupManagementModal = true"
            @add="handleAddSubscription"
            @delete="handleDeleteSubscriptionWithCleanup"
            @update-node-count="handleUpdateNodeCount"
            @refresh-all="batchUpdateAllSubscriptions"
            @edit="(id) => handleEditSubscription(subscriptions.find((s) => s.id === id))"
            @toggle-sort="isSortingSubs = !isSortingSubs"
            @mark-dirty="markDirty"
            @delete-all="showDeleteSubsModal = true"
            @preview="handlePreviewSubscription"
            @reorder="reorderSubscriptions"
            @import="openBulkImportModal"
            @qrcode="handleQRCode"
            @update-search="subscriptionSearchQuery = $event"
            @applyDetectedName="handleApplyDetectedName"
        />

        <GroupManagementModal
            v-model:show="showGroupManagementModal"
            :groups="subscriptionGroups"
            @rename="handleGroupRename"
            @delete="handleGroupDelete"
        />

        <!-- Dialogs -->
        <SubscriptionEditModal
            v-model:show="showSubModal"
            :is-new="isNewSubscription"
            :editing-subscription="editingSubscription"
            @confirm="handleSaveSubscription"
        />

        <Modal
            v-model:show="showDeleteSubsModal"
            @confirm="handleDeleteAllSubscriptionsWithCleanup"
        >
            <template #title
                ><h3 class="text-lg font-bold text-red-500">
                    {{ t('subscriptions.deleteAllConfirmTitle') }}
                </h3></template
            >
            <template #body
                ><p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ t('subscriptions.deleteAllConfirmBody') }}
                </p></template
            >
        </Modal>

        <SubscriptionBulkImportModal
            v-if="showBulkImportModal"
            :show="showBulkImportModal"
            @update:show="showBulkImportModal = $event"
            @import="(txt, groupName) => handleSubscriptionBulkImport(txt, groupName)"
        />

        <NodePreviewModal
            :show="showNodePreviewModal"
            :subscription-id="previewSubscriptionId"
            :subscription-name="previewSubscriptionName"
            :subscription-url="previewSubscriptionUrl"
            :profile-id="null"
            :profile-name="''"
            @update:show="showNodePreviewModal = $event"
        />

        <QRCodeModal v-model:show="showQRCodeModal" :url="qrCodeUrl" :title="qrCodeTitle" />
    </div>
</template>
