<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { SubscriptionItem } from '@misub/core/types.js';
import { useRoute, useRouter } from 'vue-router';
import { useDataStore } from '@/stores/useDataStore.js';
import { useSubscriptions } from '@/composables/useSubscriptions.js';
import { useSortingMode } from '@/composables/useSortingMode.js';
import { useSubscriptionForms } from '@/composables/useSubscriptionForms.js';
import type { TagBatchMode } from '@/composables/useManualNodes.js';
import { useSubscriptionBulkImport } from '@/composables/useSubscriptionBulkImport.js';
import SubscriptionPanel from '@/components/subscriptions/SubscriptionPanel.vue';
import Modal from '@/components/ui/Modal.vue';
import SubscriptionEditModal from '@/components/modals/SubscriptionEditModal.vue';
import BatchTagModal from '@/components/modals/BatchTagModal.vue';
import { useToastStore } from '@/stores/useToastStore.js';
import { useI18n } from '@/i18n/index.js';
import { matchesSubscriptionStatus, resolveSubscriptionStatusFilter } from '@/utils/dashboard-deeplink.js';
import { scheduleIdlePrefetch } from '@/utils/prefetch.js';

const loadTagManagementModal = () => import('@/components/modals/TagManagementModal.vue');
const loadNodePreviewModal = () => import('@/components/modals/NodePreview/NodePreviewModal.vue');
const loadImportModal = () => import('@/components/modals/ImportModal.vue');
const loadQRCodeModal = () => import('@/components/modals/QRCodeModal.vue');

const TagManagementModal = defineAsyncComponent(loadTagManagementModal);

const dataStore = useDataStore();
const { showToast } = useToastStore();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const isSortingSubs = useSortingMode();
const showDeleteSubsModal = ref(false);
const showBatchDeleteModal = ref(false);
const batchDeleteIds = ref<string[]>([]);
const showBatchTagModal = ref(false);
const batchTagIds = ref<string[]>([]);
const showTagManagementModal = ref(false);

const {
  subscriptions: rawSubscriptions,
  subscriptionTags,
  activeTagFilters,
  setTagFilters,
  renameSubscriptionTag,
  deleteSubscriptionTag,
  reorderSubscriptionTags,
  filteredSubscriptions,
  searchQuery: subscriptionSearchQuery,
  subscriptionsCurrentPage,
  subscriptionsPerPage,
  changeSubscriptionsPage,
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
  reorderSubscriptions,
  isRefreshing,
  refreshError,
  lastRefreshAt,
} = useSubscriptions();
const subscriptions = rawSubscriptions as unknown as Ref<SubscriptionItem[]>;

const {
  showModal: showSubModal,
  isNew: isNewSubscription,
  editingSubscription,
  conflictState: subscriptionConflict,
  openAdd: handleAddSubscription,
  openEdit: handleEditSubscription,
  isSaving: isSavingSub,
  handleSave: handleSaveSubscription,
  reloadFromConflict: reloadSubscriptionConflict,
  forceSaveFromConflict: forceSaveSubscriptionConflict,
} = useSubscriptionForms({ addSubscription, updateSubscription });

const { showModal: showBulkImportModal, handleSubscriptionBulkImport } = useSubscriptionBulkImport({
  addSubscriptionsFromBulk,
  updateSubscription,
});

const openBulkImportModal = () => {
  showBulkImportModal.value = true;
};

const handleDeleteSubscriptionWithCleanup = (subId: string) => {
  deleteSubscription(subId);
};

const handleToggleSubscription = ({ id, enabled }: { id: string; enabled: boolean }) => {
  void toggleSubscription(id, enabled);
};

const handleDeleteAllSubscriptionsWithCleanup = () => {
  deleteAllSubscriptions();
  showDeleteSubsModal.value = false;
};

const handleOpenBatchTagModal = (ids: string[]) => {
  batchTagIds.value = ids;
  showBatchTagModal.value = true;
};

const handleBatchTagConfirm = (payload: { tags: string[]; mode: TagBatchMode }) => {
  batchUpdateSubscriptionTags(batchTagIds.value, payload);
  batchTagIds.value = [];
};

const handleBatchDeleteRequest = (ids: string[]) => {
  if (ids && ids.length > 0) {
    batchDeleteIds.value = ids;
    showBatchDeleteModal.value = true;
  }
};

const confirmBatchDelete = () => {
  batchDeleteSubscriptions(batchDeleteIds.value);
  batchDeleteIds.value = [];
  showBatchDeleteModal.value = false;
};

const NodePreviewModal = defineAsyncComponent(loadNodePreviewModal);
const showNodePreviewModal = ref(false);
const previewSubscriptionId = ref<string | null>(null);
const previewSubscriptionName = ref('');
const previewSubscriptionUrl = ref('');

const handleTagRename = (oldName: string, newName: string) => {
  renameSubscriptionTag(oldName, newName);
  showToast(t('tags.tagRenamed', { oldName, newName }), 'success');
};

const handleTagDelete = (tagName: string) => {
  deleteSubscriptionTag(tagName);
  showToast(t('tags.tagDeleted', { name: tagName }), 'success');
};

const handleTagReorder = (newOrder: string[]) => {
  reorderSubscriptionTags(newOrder);
  showToast(t('tags.tagOrderUpdated'), 'success');
};

const handleApplyDetectedName = async (subscriptionId: string | undefined, name: string) => {
  if (!subscriptionId) return;
  const target = String(name || '').trim();
  if (!target) return;
  const targetSub = subscriptions.value.find((s) => s.id === subscriptionId);
  if (!targetSub) return;
  const res = await dataStore.patchSubscription(subscriptionId, { name: target });
  if (res.ok) {
    showToast(t('subscriptions.nameApplied', { name: target }), 'success');
  }
};

const handlePreviewSubscription = (subscriptionId: string) => {
  const subscription = subscriptions.value.find((s) => s.id === subscriptionId);
  if (subscription) {
    previewSubscriptionId.value = subscriptionId;
    previewSubscriptionName.value = subscription.name || t('subscriptions.unnamed');
    previewSubscriptionUrl.value = subscription.url;
    showNodePreviewModal.value = true;
  }
};

const ImportModal = defineAsyncComponent(loadImportModal);

const QRCodeModal = defineAsyncComponent(loadQRCodeModal);
const showQRCodeModal = ref(false);
const qrCodeUrl = ref('');
const qrCodeTitle = ref('');

const handleQRCode = (id: string) => {
  const sub = subscriptions.value.find((s) => s.id === id);
  if (sub) {
    qrCodeUrl.value = sub.url;
    qrCodeTitle.value = sub.name || t('subscriptions.qrCodeTitle');
    showQRCodeModal.value = true;
  }
};

const activeStatusFilter = ref('');
const STATUS_FILTER_LABEL_KEYS: Record<string, string> = {
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
  return subscriptions.value.filter((sub) => matchesSubscriptionStatus(sub, activeStatusFilter.value));
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

let cancelModalPrefetch = () => {};

onMounted(() => {
  applyStatusFromQuery();
  cancelModalPrefetch = scheduleIdlePrefetch([
    loadImportModal,
    loadQRCodeModal,
    loadTagManagementModal,
    loadNodePreviewModal,
  ]);
});

onUnmounted(() => {
  cancelModalPrefetch();
});
watch(() => route.query.status, applyStatusFromQuery);

const visibleSubscriptions = computed(() =>
  activeStatusFilter.value ? statusFilteredSubscriptions.value : subscriptions.value,
);
</script>

<template>
  <div class="w-full">
    <SubscriptionPanel
      :active-tag-filters="activeTagFilters"
      :current-page="subscriptionsCurrentPage"
      :filtered-count="activeStatusFilter ? undefined : filteredSubscriptions.length"
      :is-refreshing="isRefreshing"
      :is-sorting="isSortingSubs"
      :items-per-page="subscriptionsPerPage"
      :last-refresh-at="lastRefreshAt"
      :refresh-error="refreshError"
      :search-query="subscriptionSearchQuery"
      :status-filter="activeStatusFilter"
      :status-filter-label="statusFilterLabel"
      :subscriptions="visibleSubscriptions"
      :tags="subscriptionTags"
      searchable
      @add="handleAddSubscription"
      @applyDetectedName="handleApplyDetectedName"
      @change-page="changeSubscriptionsPage"
      @delete="handleDeleteSubscriptionWithCleanup"
      @edit="(id) => handleEditSubscription(subscriptions.find((s) => s.id === id))"
      @import="openBulkImportModal"
      @preview="handlePreviewSubscription"
      @qrcode="handleQRCode"
      @reorder="reorderSubscriptions"
      @toggle="handleToggleSubscription"
      @update:items-per-page="(val) => (subscriptionsPerPage = val)"
      @clear-status-filter="clearStatusFilter"
      @set-tag-filters="setTagFilters"
      @manage-tags="showTagManagementModal = true"
      @update-node-count="handleUpdateNodeCount"
      @refresh-all="batchUpdateAllSubscriptions"
      @toggle-sort="isSortingSubs = !isSortingSubs"
      @delete-all="showDeleteSubsModal = true"
      @update-search="subscriptionSearchQuery = $event"
      @open-batch-tag-modal="handleOpenBatchTagModal"
      @batch-delete-subscriptions="handleBatchDeleteRequest"
    />

    <BatchTagModal v-model:show="showBatchTagModal" :tags="subscriptionTags" @confirm="handleBatchTagConfirm" />

    <Modal v-model:show="showBatchDeleteModal" @confirm="confirmBatchDelete">
      <template #title>
        <h3 class="text-lg font-bold text-red-500">
          {{ t('subscriptions.batchDeleteConfirmTitle') }}
        </h3>
      </template>
      <template #body>
        <p class="text-sm text-fg-muted">
          {{ t('subscriptions.batchDeleteConfirmBody', { count: batchDeleteIds.length }) }}
        </p>
      </template>
    </Modal>

    <TagManagementModal
      v-model:show="showTagManagementModal"
      :tags="subscriptionTags"
      @delete="handleTagDelete"
      @rename="handleTagRename"
      @reorder="handleTagReorder"
    />

    <SubscriptionEditModal
      v-model:editing-subscription="editingSubscription"
      v-model:show="showSubModal"
      :conflict="subscriptionConflict"
      :is-new="isNewSubscription"
      :is-saving="isSavingSub"
      @confirm="handleSaveSubscription"
      @force-save-conflict="forceSaveSubscriptionConflict"
      @reload-conflict="reloadSubscriptionConflict"
    />

    <Modal v-model:show="showDeleteSubsModal" @confirm="handleDeleteAllSubscriptionsWithCleanup">
      <template #title
        ><h3 class="text-lg font-bold text-red-500">
          {{ t('subscriptions.deleteAllConfirmTitle') }}
        </h3></template
      >
      <template #body
        ><p class="text-sm text-fg-subtle">
          {{ t('subscriptions.deleteAllConfirmBody') }}
        </p></template
      >
    </Modal>

    <ImportModal
      v-if="showBulkImportModal"
      :show="showBulkImportModal"
      mode="subscriptions"
      @import="(txt, tags) => handleSubscriptionBulkImport(txt, tags)"
      @update:show="showBulkImportModal = $event"
    />

    <NodePreviewModal
      :profile-id="null"
      :profile-name="''"
      :show="showNodePreviewModal"
      :subscription-id="previewSubscriptionId"
      :subscription-name="previewSubscriptionName"
      :subscription-url="previewSubscriptionUrl"
      @update:show="showNodePreviewModal = $event"
    />

    <QRCodeModal v-model:show="showQRCodeModal" :title="qrCodeTitle" :url="qrCodeUrl" />
  </div>
</template>
