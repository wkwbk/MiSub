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

    const TagManagementModal = defineAsyncComponent(
        () => import('@/components/modals/TagManagementModal.vue')
    );

    const dataStore = useDataStore();
    const { showToast } = useToastStore();
    const { markDirty } = dataStore;
    const { t } = useI18n();
    const route = useRoute();
    const router = useRouter();

    const isSortingSubs = useSortingMode(dataStore);
    const showDeleteSubsModal = ref(false);
    const showTagManagementModal = ref(false);

    const {
        subscriptions,
        subscriptionTags,
        activeTagFilters,
        setTagFilters,
        renameSubscriptionTag,
        deleteSubscriptionTag,
        reorderSubscriptionTags,
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

    const NodePreviewModal = defineAsyncComponent(
        () => import('@/components/modals/NodePreview/NodePreviewModal.vue')
    );
    const showNodePreviewModal = ref(false);
    const previewSubscriptionId = ref(null);
    const previewSubscriptionName = ref('');
    const previewSubscriptionUrl = ref('');

    const handleTagRename = (oldName, newName) => {
        renameSubscriptionTag(oldName, newName);
        showToast(t('tags.tagRenamed', { oldName, newName }), 'success');
    };

    const handleTagDelete = (tagName) => {
        deleteSubscriptionTag(tagName);
        showToast(t('tags.tagDeleted', { name: tagName }), 'success');
    };

    const handleTagReorder = (newOrder) => {
        reorderSubscriptionTags(newOrder);
        showToast(t('tags.tagOrderUpdated'), 'success');
    };

    const handleApplyDetectedName = (subscriptionId, name) => {
        const target = String(name || '').trim();
        if (!target) return;
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

    const SubscriptionBulkImportModal = defineAsyncComponent(
        () => import('@/components/modals/SubscriptionBulkImportModal.vue')
    );

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

    const visibleSubscriptions = computed(() =>
        activeStatusFilter.value ? statusFilteredSubscriptions.value : subscriptions.value
    );
</script>

<template>
    <div class="w-full">
        <SubscriptionPanel
            :subscriptions="visibleSubscriptions"
            :tags="subscriptionTags"
            :active-tag-filters="activeTagFilters"
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
            @set-tag-filters="setTagFilters"
            @manage-tags="showTagManagementModal = true"
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

        <TagManagementModal
            v-model:show="showTagManagementModal"
            :tags="subscriptionTags"
            @rename="handleTagRename"
            @delete="handleTagDelete"
            @reorder="handleTagReorder"
        />

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
            @import="(txt, tags) => handleSubscriptionBulkImport(txt, tags)"
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
