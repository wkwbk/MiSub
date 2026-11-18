<script setup>
    import { defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue';
    import { useRoute } from 'vue-router';
    import { useDataStore } from '@/stores/useDataStore.js';
    import { useProfiles } from '@/composables/useProfiles.js';
    import { useSortingMode } from '@/composables/useSortingMode.js';
    import ProfilePanel from '@/components/profiles/ProfilePanel.vue';
    import Modal from '@/components/forms/Modal.vue';
    import BatchTagModal from '@/components/modals/BatchTagModal.vue';
    import { storeToRefs } from 'pinia';
    import { useManualNodes } from '@/composables/useManualNodes.js';
    import { useToastStore } from '@/stores/toast.js';
    import { useI18n } from '@/i18n/index.js';
    import { resolveProfileFocus } from '@/utils/dashboard-deeplink.js';

    const TagManagementModal = defineAsyncComponent(
        () => import('@/components/modals/TagManagementModal.vue')
    );

    const { t } = useI18n();
    const route = useRoute();

    const dataStore = useDataStore();
    const { markDirty } = dataStore;
    const { showToast } = useToastStore();
    const isProfileSorting = useSortingMode(dataStore);

    const profilesSectionRef = ref(null);
    const showTagManagementModal = ref(false);
    const showBatchTagModal = ref(false);
    const batchTagIds = ref([]);
    const showBatchDeleteModal = ref(false);
    const batchDeleteIds = ref([]);

    function applyFocusFromQuery() {
        if (!resolveProfileFocus(route.query?.focus)) return;
        nextTick(() => {
            profilesSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    onMounted(applyFocusFromQuery);
    watch(() => route.query.focus, applyFocusFromQuery);

    const {
        profiles,
        profileTags,
        activeTagFilters,
        setTagFilters,
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
        profilesTotalPages,
        paginatedProfiles,
        changeProfilesPage,
    } = useProfiles(markDirty);

    const { subscriptions } = storeToRefs(dataStore);
    const { manualNodes } = useManualNodes(markDirty);

    const toggleProfileSorting = () => {
        isProfileSorting.value = !isProfileSorting.value;
    };

    const handleTagRename = (oldName, newName) => {
        renameProfileTag(oldName, newName);
        showToast(t('tags.tagRenamed', { oldName, newName }), 'success');
    };

    const handleTagDelete = (tagName) => {
        deleteProfileTag(tagName);
        showToast(t('tags.tagDeleted', { name: tagName }), 'success');
    };

    const handleTagReorder = (newOrder) => {
        reorderProfileTags(newOrder);
        showToast(t('tags.tagOrderUpdated'), 'success');
    };

    const handleOpenBatchTagModal = (ids) => {
        batchTagIds.value = ids;
        showBatchTagModal.value = true;
    };

    const handleBatchTagConfirm = (payload) => {
        batchUpdateProfileTags(batchTagIds.value, payload);
        batchTagIds.value = [];
    };

    const handleBatchDeleteRequest = (ids) => {
        if (ids && ids.length > 0) {
            batchDeleteIds.value = ids;
            showBatchDeleteModal.value = true;
        }
    };

    const confirmBatchDelete = () => {
        batchDeleteProfiles(batchDeleteIds.value);
        batchDeleteIds.value = [];
        showBatchDeleteModal.value = false;
    };

    const NodePreviewModal = defineAsyncComponent(
        () => import('@/components/modals/NodePreview/NodePreviewModal.vue')
    );
    const showNodePreviewModal = ref(false);
    const previewProfileId = ref(null);
    const previewProfileName = ref('');

    const handlePreviewProfile = (profileId) => {
        const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
        if (profile) {
            previewProfileId.value = profileId;
            previewProfileName.value = profile.name;
            showNodePreviewModal.value = true;
        }
    };

    const ProfileModal = defineAsyncComponent(() => import('@/components/modals/ProfileModal.vue'));
    const LogModal = defineAsyncComponent(() => import('@/components/modals/LogModal.vue'));
    const CopyLinkModal = defineAsyncComponent(
        () => import('@/components/modals/CopyLinkModal.vue')
    );

    const showLogModal = ref(false);
    const logProfileName = ref('');

    const showCopyModal = ref(false);
    const showCopyModalProfile = ref(null);

    const handleOpenCopy = (profileId) => {
        const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
        if (profile) {
            showCopyModalProfile.value = profile;
            showCopyModal.value = true;
        }
    };

    const handleViewLogs = (profileId) => {
        const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
        if (profile) {
            logProfileName.value = profile.name;
            showLogModal.value = true;
        }
    };

    const QRCodeModal = defineAsyncComponent(() => import('@/components/modals/QRCodeModal.vue'));
    const showQRCodeModal = ref(false);
    const qrCodeUrl = ref('');
    const qrCodeTitle = ref('');
    const { settings } = storeToRefs(dataStore);

    const handleQRCode = (profileId) => {
        const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
        if (profile) {
            if (!settings.value.profileToken) {
                showToast(t('notices.noToken'), 'error');
                return;
            }
            const token = settings.value.profileToken;
            const baseUrl = window.location.origin;
            const idToUse = profile.customId || profile.id;
            qrCodeUrl.value = `${baseUrl}/${token}/${idToUse}`;
            qrCodeTitle.value = profile.name || t('profiles.qrCodeTitle');
            showQRCodeModal.value = true;
        }
    };
</script>

<template>
    <div class="w-full">
        <div ref="profilesSectionRef" data-testid="profiles-section">
            <ProfilePanel
                :profiles="profiles"
                :paginated-profiles="paginatedProfiles"
                :tags="profileTags"
                :active-tag-filters="activeTagFilters"
                :current-page="profilesCurrentPage"
                :search-query="profileSearchQuery"
                :filtered-count="filteredProfiles.length"
                searchable
                :total-pages="profilesTotalPages"
                :is-sorting="isProfileSorting"
                @add="handleAddProfile"
                @edit="handleEditProfile"
                @delete="handleDeleteProfile"
                @deleteAll="showDeleteProfilesModal = true"
                @toggle="handleProfileToggle"
                @openCopy="handleOpenCopy"
                @preview="handlePreviewProfile"
                @reorder="reorderProfiles"
                @toggle-sort="toggleProfileSorting"
                @change-page="changeProfilesPage"
                @viewLogs="handleViewLogs"
                @qrcode="handleQRCode"
                @update-search="profileSearchQuery = $event"
                @set-tag-filters="setTagFilters"
                @manage-tags="showTagManagementModal = true"
                @open-batch-tag-modal="handleOpenBatchTagModal"
                @batch-delete-profiles="handleBatchDeleteRequest"
            />
        </div>

        <BatchTagModal
            v-model:show="showBatchTagModal"
            :tags="profileTags"
            @confirm="handleBatchTagConfirm"
        />

        <Modal v-model:show="showBatchDeleteModal" @confirm="confirmBatchDelete">
            <template #title>
                <h3 class="text-lg font-bold text-red-500">
                    {{ t('profiles.batchDeleteConfirmTitle') }}
                </h3>
            </template>
            <template #body>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                    {{ t('profiles.batchDeleteConfirmBody', { count: batchDeleteIds.length }) }}
                </p>
            </template>
        </Modal>

        <TagManagementModal
            v-model:show="showTagManagementModal"
            :tags="profileTags"
            @rename="handleTagRename"
            @delete="handleTagDelete"
            @reorder="handleTagReorder"
        />

        <LogModal
            :show="showLogModal"
            @update:show="showLogModal = $event"
            :filter-profile-name="logProfileName"
        />

        <ProfileModal
            v-if="showProfileModal"
            v-model:show="showProfileModal"
            :profile="editingProfile"
            :is-new="isNewProfile"
            :all-subscriptions="subscriptions"
            :all-manual-nodes="manualNodes"
            @save="handleSaveProfile"
        />

        <Modal v-model:show="showDeleteProfilesModal" @confirm="handleDeleteAllProfiles">
            <template #title>
                <h3 class="text-lg font-bold text-red-500">
                    {{ t('profiles.deleteAllConfirmTitle') }}
                </h3>
            </template>
            <template #body>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ t('profiles.deleteAllConfirmBody') }}
                </p>
            </template>
        </Modal>

        <NodePreviewModal
            :show="showNodePreviewModal"
            :subscription-id="null"
            :subscription-name="''"
            :subscription-url="''"
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
    </div>
</template>
