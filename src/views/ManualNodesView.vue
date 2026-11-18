<script setup>
    import { defineAsyncComponent, ref } from 'vue';
    import { useDataStore } from '@/stores/useDataStore.js';
    import { useManualNodes } from '@/composables/useManualNodes.js';
    import { useSortingMode } from '@/composables/useSortingMode.js';
    import { useNodeForms } from '@/composables/useNodeForms.js';
    import { useToastStore } from '@/stores/toast.js';
    import ManualNodePanel from '@/components/nodes/ManualNodePanel.vue';
    import Modal from '@/components/forms/Modal.vue';
    import ManualNodeEditModal from '@/components/modals/ManualNodeEditModal.vue';
    import ManualNodeDedupModal from '@/components/modals/ManualNodeDedupModal.vue';
    import SubscriptionImportModal from '@/components/modals/SubscriptionImportModal.vue';
    import BatchTagModal from '@/components/modals/BatchTagModal.vue';
    import { useI18n } from '@/i18n/index.js';
    import { readRawPreference, writeRawPreference } from '@/utils/local-preference.js';

    const TagManagementModal = defineAsyncComponent(
        () => import('@/components/modals/TagManagementModal.vue')
    );

    const dataStore = useDataStore();
    const { showToast } = useToastStore();
    const { markDirty } = dataStore;
    const { t } = useI18n();

    const isSortingNodes = useSortingMode(dataStore);
    const manualNodeViewMode = ref(readRawPreference('manualNodeViewMode') || 'card');
    const showDeleteNodesModal = ref(false);
    const showBatchDeleteModal = ref(false);
    const batchDeleteIds = ref([]);
    const showSubscriptionImportModal = ref(false);
    const showDedupModal = ref(false);
    const dedupPlan = ref(null);
    const showBatchTagModal = ref(false);
    const batchTagIds = ref([]);
    const showTagManagementModal = ref(false);

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
        buildDedupPlan,
        applyDedupPlan,
        reorderManualNodes,
        manualNodeTags,
        renameTag,
        deleteTag,
        reorderTags,
        activeTagFilters,
        setTagFilters,
        toggleTagFilter,
        batchUpdateTags,
        batchDeleteNodes,
        manualNodesPerPage,
        pingResults,
        pingingNodes,
        pingNodeId,
        pingAllNodes,
        sortNodesByLatency,
    } = useManualNodes(markDirty);

    const handleSearchTermUpdate = (val) => {
        searchTerm.value = val;
    };

    const {
        showModal: showNodeModal,
        isNew: isNewNode,
        editingNode,
        openAdd: handleAddNode,
        openEdit: handleEditNode,
        handleUrlInput: handleNodeUrlInput,
        handleSave: handleSaveNode,
    } = useNodeForms({ addNode, updateNode });

    const setViewMode = (mode) => {
        manualNodeViewMode.value = mode;
        writeRawPreference('manualNodeViewMode', mode);
    };

    const handleDeleteNodeWithCleanup = (nodeId) => {
        deleteNode(nodeId);
    };

    const handleDeleteAllNodesWithCleanup = () => {
        deleteAllNodes();
        showDeleteNodesModal.value = false;
    };

    const handleAutoSortNodes = () => {
        autoSortNodes();
        showToast(t('manualNodes.sortedByRegion'), 'success');
    };

    const handleSortByLatency = () => {
        const ok = sortNodesByLatency();
        showToast(
            ok ? t('manualNodes.sortByLatencyDone') : t('manualNodes.sortByLatencyNoData'),
            ok ? 'success' : 'warning'
        );
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

    const handleOpenBatchTagModal = (ids) => {
        batchTagIds.value = ids;
        showBatchTagModal.value = true;
    };

    const handleBatchTagConfirm = (payload) => {
        batchUpdateTags(batchTagIds.value, payload);
        batchTagIds.value = [];
    };

    const handleBatchDeleteRequest = (ids) => {
        if (ids && ids.length > 0) {
            batchDeleteIds.value = ids;
            showBatchDeleteModal.value = true;
        }
    };

    const confirmBatchDelete = () => {
        batchDeleteNodes(batchDeleteIds.value);
        batchDeleteIds.value = [];
        showBatchDeleteModal.value = false;
    };

    const handleOpenTagManagement = () => {
        showTagManagementModal.value = true;
    };

    const handleTagRename = (oldName, newName) => {
        renameTag(oldName, newName);
        showToast(t('tags.tagRenamed', { oldName, newName }), 'success');
    };

    const handleTagDelete = (tagName) => {
        deleteTag(tagName);
        showToast(t('tags.tagDeleted', { name: tagName }), 'success');
    };

    const handleTagReorder = (newOrder) => {
        reorderTags(newOrder);
        showToast(t('tags.tagOrderUpdated'), 'success');
    };
</script>

<template>
    <div class="w-full">
        <ManualNodePanel
            :manual-nodes="manualNodes"
            :paginated-manual-nodes="paginatedManualNodes"
            :current-page="manualNodesCurrentPage"
            :total-pages="manualNodesTotalPages"
            :is-sorting="isSortingNodes"
            :search-term="searchTerm"
            :view-mode="manualNodeViewMode"
            :tags="manualNodeTags"
            :active-tag-filters="activeTagFilters"
            :items-per-page="manualNodesPerPage"
            @update:items-per-page="(val) => (manualNodesPerPage = val)"
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
            @manage-tags="handleOpenTagManagement"
            :ping-results="pingResults"
            :pinging-nodes="pingingNodes"
            @ping="pingNodeId"
            @ping-all="pingAllNodes"
            @sort-by-latency="handleSortByLatency"
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
            :tags="manualNodeTags"
            @confirm="handleBatchTagConfirm"
        />

        <TagManagementModal
            v-model:show="showTagManagementModal"
            :tags="manualNodeTags"
            @rename="handleTagRename"
            @delete="handleTagDelete"
            @reorder="handleTagReorder"
        />

        <Modal v-model:show="showDeleteNodesModal" @confirm="handleDeleteAllNodesWithCleanup">
            <template #title>
                <h3 class="text-lg font-bold text-red-500">
                    {{ t('manualNodes.deleteAllConfirmTitle') }}
                </h3>
            </template>
            <template #body>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ t('manualNodes.deleteAllConfirmBody') }}
                </p>
            </template>
        </Modal>

        <Modal v-model:show="showBatchDeleteModal" @confirm="confirmBatchDelete">
            <template #title>
                <h3 class="text-lg font-bold text-red-500">
                    {{ t('manualNodes.batchDeleteConfirmTitle') }}
                </h3>
            </template>
            <template #body>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                    {{ t('manualNodes.batchDeleteConfirmBody', { count: batchDeleteIds.length }) }}
                </p>
            </template>
        </Modal>

        <SubscriptionImportModal
            :show="showSubscriptionImportModal"
            @update:show="showSubscriptionImportModal = $event"
            :add-nodes-from-bulk="addNodesFromBulk"
            :tags="manualNodeTags"
        />
    </div>
</template>
