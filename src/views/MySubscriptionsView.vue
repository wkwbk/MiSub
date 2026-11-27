<script setup lang="ts">
import { defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { ManualNodeItem, ProfileConfig, SubscriptionItem } from '@misub/core/types.js';
import { useRoute } from 'vue-router';
import { useDataStore } from '@/stores/useDataStore.js';
import { useProfiles } from '@/composables/useProfiles.js';
import { useSortingMode } from '@/composables/useSortingMode.js';
import ProfilePanel from '@/components/profiles/ProfilePanel.vue';
import Modal from '@/components/ui/Modal.vue';
import BatchTagModal from '@/components/modals/BatchTagModal.vue';
import { storeToRefs } from 'pinia';
import { useManualNodes, type TagBatchMode } from '@/composables/useManualNodes.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { useI18n } from '@/i18n/index.js';
import { resolveProfileFocus } from '@/utils/dashboard-deeplink.js';
import { getProfileShareIdentifier } from '@misub/core/domain/profile-link.js';
import { scheduleIdlePrefetch } from '@/utils/prefetch.js';

const loadTagManagementModal = () => import('@/components/modals/TagManagementModal.vue');
const loadNodePreviewModal = () => import('@/components/modals/NodePreview/NodePreviewModal.vue');
const loadProfileModal = () => import('@/components/modals/ProfileModal.vue');
const loadLogModal = () => import('@/components/modals/LogModal.vue');
const loadCopyLinkModal = () => import('@/components/modals/CopyLinkModal.vue');
const loadQRCodeModal = () => import('@/components/modals/QRCodeModal.vue');

const TagManagementModal = defineAsyncComponent(loadTagManagementModal);

const { t } = useI18n();
const route = useRoute();

const dataStore = useDataStore();
const { showToast } = useToastStore();
const isProfileSorting = useSortingMode();

const profilesSectionRef = ref<HTMLDivElement | null>(null);
const showTagManagementModal = ref(false);
const showBatchTagModal = ref(false);
const batchTagIds = ref<string[]>([]);
const showBatchDeleteModal = ref(false);
const batchDeleteIds = ref<string[]>([]);

function applyFocusFromQuery() {
  if (!resolveProfileFocus(route.query?.focus)) return;
  nextTick(() => {
    profilesSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

let cancelModalPrefetch = () => {};

onMounted(() => {
  applyFocusFromQuery();
  cancelModalPrefetch = scheduleIdlePrefetch([
    loadProfileModal,
    loadCopyLinkModal,
    loadQRCodeModal,
    loadLogModal,
    loadTagManagementModal,
    loadNodePreviewModal,
  ]);
});

onUnmounted(() => {
  cancelModalPrefetch();
});
watch(() => route.query.focus, applyFocusFromQuery);

const {
  profiles: rawProfiles,
  profileTags,
  activeTagFilters,
  setTagFilters,
  renameProfileTag,
  deleteProfileTag,
  reorderProfileTags,
  editingProfile,
  isNewProfile,
  isSavingProfile,
  profileConflict,
  showProfileModal,
  showDeleteProfilesModal,
  handleProfileToggle,
  handleAddProfile,
  handleEditProfile,
  handleSaveProfile,
  reloadProfileFromConflict,
  handleForceSaveProfile,
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
} = useProfiles();
const profiles = rawProfiles as unknown as Ref<ProfileConfig[]>;

const { subscriptions: rawSubscriptions } = storeToRefs(dataStore);
const subscriptions = rawSubscriptions as unknown as Ref<SubscriptionItem[]>;
const { manualNodes: rawManualNodes } = useManualNodes();
const manualNodes = rawManualNodes as unknown as Ref<ManualNodeItem[]>;

const toggleProfileSorting = () => {
  isProfileSorting.value = !isProfileSorting.value;
};

const handleTagRename = (oldName: string, newName: string) => {
  renameProfileTag(oldName, newName);
  showToast(t('tags.tagRenamed', { oldName, newName }), 'success');
};

const handleTagDelete = (tagName: string) => {
  deleteProfileTag(tagName);
  showToast(t('tags.tagDeleted', { name: tagName }), 'success');
};

const handleTagReorder = (newOrder: string[]) => {
  reorderProfileTags(newOrder);
  showToast(t('tags.tagOrderUpdated'), 'success');
};

const handleOpenBatchTagModal = (ids: string[]) => {
  batchTagIds.value = ids;
  showBatchTagModal.value = true;
};

const handleBatchTagConfirm = (payload: { tags: string[]; mode: TagBatchMode }) => {
  batchUpdateProfileTags(batchTagIds.value, payload);
  batchTagIds.value = [];
};

const handleBatchDeleteRequest = (ids: string[]) => {
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

const NodePreviewModal = defineAsyncComponent(loadNodePreviewModal);
const showNodePreviewModal = ref(false);
const previewProfileId = ref<string | null>(null);
const previewProfileName = ref('');

const handlePreviewProfile = (profileId: string) => {
  const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
  if (profile) {
    previewProfileId.value = profileId;
    previewProfileName.value = profile.name;
    showNodePreviewModal.value = true;
  }
};

const ProfileModal = defineAsyncComponent(loadProfileModal);
const LogModal = defineAsyncComponent(loadLogModal);
const CopyLinkModal = defineAsyncComponent(loadCopyLinkModal);

const showLogModal = ref(false);
const logProfileName = ref('');
const logProfileId = ref('');

const showCopyModal = ref(false);
const showCopyModalProfile = ref<ProfileConfig | null>(null);

const handleOpenCopy = (profileId: string) => {
  const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId || p.linkId === profileId);
  if (profile) {
    showCopyModalProfile.value = profile;
    showCopyModal.value = true;
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

const QRCodeModal = defineAsyncComponent(loadQRCodeModal);
const showQRCodeModal = ref(false);
const qrCodeUrl = ref('');
const qrCodeTitle = ref('');
const { settings } = storeToRefs(dataStore);

const handleQRCode = (profileId: string) => {
  const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId || p.linkId === profileId);
  if (profile) {
    const token = (settings.value.profileToken || '').trim().replace(/^\/+|\/+$/g, '') || 'sub';
    const baseUrl = window.location.origin;
    const idToUse = getProfileShareIdentifier(profile);
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
        :active-tag-filters="activeTagFilters"
        :current-page="profilesCurrentPage"
        :filtered-count="filteredProfiles.length"
        :is-sorting="isProfileSorting"
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
        @openCopy="handleOpenCopy"
        @preview="handlePreviewProfile"
        @qrcode="handleQRCode"
        @reorder="reorderProfiles"
        @toggle="handleProfileToggle"
        @viewLogs="handleViewLogs"
        @toggle-sort="toggleProfileSorting"
        @change-page="changeProfilesPage"
        @update:items-per-page="(val) => (profilesPerPage = val)"
        @update-search="profileSearchQuery = $event"
        @set-tag-filters="setTagFilters"
        @manage-tags="showTagManagementModal = true"
        @open-batch-tag-modal="handleOpenBatchTagModal"
        @batch-delete-profiles="handleBatchDeleteRequest"
      />
    </div>

    <BatchTagModal v-model:show="showBatchTagModal" :tags="profileTags" @confirm="handleBatchTagConfirm" />

    <Modal v-model:show="showBatchDeleteModal" @confirm="confirmBatchDelete">
      <template #title>
        <h3 class="text-lg font-bold text-red-500">
          {{ t('profiles.batchDeleteConfirmTitle') }}
        </h3>
      </template>
      <template #body>
        <p class="text-sm text-fg-muted">
          {{ t('profiles.batchDeleteConfirmBody', { count: batchDeleteIds.length }) }}
        </p>
      </template>
    </Modal>

    <TagManagementModal
      v-model:show="showTagManagementModal"
      :tags="profileTags"
      @delete="handleTagDelete"
      @rename="handleTagRename"
      @reorder="handleTagReorder"
    />

    <LogModal
      :filter-profile-id="logProfileId"
      :filter-profile-name="logProfileName"
      :show="showLogModal"
      @update:show="showLogModal = $event"
    />

    <ProfileModal
      v-if="showProfileModal"
      v-model:show="showProfileModal"
      :all-manual-nodes="manualNodes"
      :all-subscriptions="subscriptions"
      :conflict="profileConflict"
      :is-new="isNewProfile"
      :is-saving="isSavingProfile"
      :profile="editingProfile"
      @force-save-conflict="handleForceSaveProfile"
      @reload-conflict="reloadProfileFromConflict"
      @save="handleSaveProfile"
    />

    <Modal v-model:show="showDeleteProfilesModal" @confirm="handleDeleteAllProfiles">
      <template #title>
        <h3 class="text-lg font-bold text-red-500">
          {{ t('profiles.deleteAllConfirmTitle') }}
        </h3>
      </template>
      <template #body>
        <p class="text-sm text-fg-subtle">
          {{ t('profiles.deleteAllConfirmBody') }}
        </p>
      </template>
    </Modal>

    <NodePreviewModal
      :profile-id="previewProfileId"
      :profile-name="previewProfileName"
      :show="showNodePreviewModal"
      :subscription-id="null"
      :subscription-name="''"
      :subscription-url="''"
      @update:show="showNodePreviewModal = $event"
    />

    <QRCodeModal v-model:show="showQRCodeModal" :subscription="true" :title="qrCodeTitle" :url="qrCodeUrl" />

    <CopyLinkModal
      v-if="showCopyModal && showCopyModalProfile"
      v-model:show="showCopyModal"
      :profile="showCopyModalProfile"
      :token="settings?.profileToken"
    />
  </div>
</template>
