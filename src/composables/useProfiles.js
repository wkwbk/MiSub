import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useDataStore } from '@/stores/useDataStore';
import { useSettingsStore } from '@/stores/useSettingsStore.js';
import { useToastStore } from '@/stores/useToastStore.js';
import { generateProfileId } from '@misub/core/utils/id.js';
import {
  ensureProfileLinkId,
  generateProfileLinkId,
  normalizeProfileIdentifier,
} from '@misub/core/domain/profile-link.js';
import { PROFILE_ALIAS_MAX_LENGTH, validateSingleProfileAlias } from '@misub/core/domain/profile-alias.js';
import { useListPagination } from '@/composables/useListPagination.js';
import {
  collectTags,
  computeBatchUpdatedTags,
  getItemTags,
  matchesTagFilter,
  normalizeActiveTagFilters,
  normalizeTagList,
  normalizeTagName,
  removeTagFromList,
  renameTagInList,
  toggleTagFilterValue,
} from '@/utils/tags.js';
import { t } from '@/i18n/index.js';

export function useProfiles(markDirty) {
  const { showToast } = useToastStore();
  const dataStore = useDataStore();
  const settingsStore = useSettingsStore();
  const { profiles } = storeToRefs(dataStore);

  const isNewProfile = ref(false);
  const editingProfile = ref(null);
  const showProfileModal = ref(false);
  const showDeleteProfilesModal = ref(false);

  const searchQuery = ref('');
  const activeTagFilters = ref([]);

  const profileTags = computed(() => {
    const customOrder = settingsStore.config.profileTagOrder || [];
    return collectTags(profiles.value, customOrder);
  });

  function setTagFilters(filters) {
    activeTagFilters.value = normalizeActiveTagFilters(filters);
  }

  function toggleTagFilter(tag) {
    activeTagFilters.value = toggleTagFilterValue(activeTagFilters.value, tag);
  }

  function renameProfileTag(oldName, newName) {
    const normalizedOld = normalizeTagName(oldName);
    const normalizedNew = normalizeTagName(newName);
    if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew) return;

    let changed = false;
    profiles.value.forEach((profile, index) => {
      const { nextTags, changed: itemChanged } = renameTagInList(getItemTags(profile), normalizedOld, normalizedNew);
      if (itemChanged) {
        profiles.value[index] = {
          ...profile,
          tags: nextTags,
        };
        changed = true;
      }
    });

    const customOrder = settingsStore.config.profileTagOrder || [];
    if (customOrder.includes(normalizedOld)) {
      const nextOrder = normalizeTagList(customOrder.map((tag) => (tag === normalizedOld ? normalizedNew : tag)));
      settingsStore.updateConfig({ profileTagOrder: nextOrder });
      if (typeof dataStore.saveSettings === 'function') {
        dataStore.saveSettings({ profileTagOrder: nextOrder }, { silent: true, preferencesOnly: true }).catch(() => {});
      }
    }

    if (activeTagFilters.value.includes(normalizedOld)) {
      activeTagFilters.value = normalizeTagList(
        activeTagFilters.value.map((tag) => (tag === normalizedOld ? normalizedNew : tag)),
      );
    }

    if (changed) markDirty();
  }

  function deleteProfileTag(tagName) {
    const normalized = normalizeTagName(tagName);
    if (!normalized) return;

    let changed = false;
    profiles.value.forEach((profile, index) => {
      const { nextTags, changed: itemChanged } = removeTagFromList(getItemTags(profile), normalized);
      if (itemChanged) {
        profiles.value[index] = {
          ...profile,
          tags: nextTags,
        };
        changed = true;
      }
    });

    const customOrder = settingsStore.config.profileTagOrder || [];
    const nextOrder = customOrder.filter((tag) => tag !== normalized);
    if (nextOrder.length !== customOrder.length) {
      settingsStore.updateConfig({ profileTagOrder: nextOrder });
      if (typeof dataStore.saveSettings === 'function') {
        dataStore.saveSettings({ profileTagOrder: nextOrder }, { silent: true, preferencesOnly: true }).catch(() => {});
      }
    }

    if (activeTagFilters.value.includes(normalized)) {
      activeTagFilters.value = activeTagFilters.value.filter((tag) => tag !== normalized);
    }

    if (changed) markDirty();
  }

  function reorderProfileTags(newOrder) {
    const normalizedOrder = normalizeTagList(newOrder);
    settingsStore.updateConfig({ profileTagOrder: normalizedOrder });
    if (typeof dataStore.saveSettings === 'function') {
      dataStore
        .saveSettings({ profileTagOrder: normalizedOrder }, { silent: true, preferencesOnly: true })
        .catch(() => {});
    }
  }

  const filteredProfiles = computed(() => {
    const tagMatched = profiles.value.filter((profile) => matchesTagFilter(profile, activeTagFilters.value));

    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return tagMatched;

    return tagMatched.filter((profile) =>
      [profile.name, profile.description, profile.desc, profile.remark, profile.customId, ...getItemTags(profile)].some(
        (value) =>
          String(value || '')
            .toLowerCase()
            .includes(query),
      ),
    );
  });

  const {
    currentPage: profilesCurrentPage,
    itemsPerPage: profilesPerPage,
    totalPages: profilesTotalPages,
    paginatedItems: paginatedProfiles,
    changePage: changeProfilesPage,
  } = useListPagination(filteredProfiles, {
    storageKey: 'profilesPPS',
    resetDeps: [searchQuery, activeTagFilters],
  });

  const handleProfileToggle = (updatedProfile) => {
    const index = profiles.value.findIndex((p) => p.id === updatedProfile.id);
    if (index !== -1) {
      profiles.value[index].enabled = updatedProfile.enabled;
      if (updatedProfile.isPublic !== undefined) {
        profiles.value[index].isPublic = updatedProfile.isPublic;
      }
      markDirty();
    }
  };

  const handleAddProfile = () => {
    isNewProfile.value = true;
    editingProfile.value = {
      name: '',
      enabled: true,
      subscriptions: [],
      manualNodes: [],
      tags: [],
      customId: '',
      linkId: generateProfileLinkId(),
      transformConfigMode: 'global',
      transformConfig: '',
      ruleLevel: '',
      expiresAt: '',
      operators: [],
    };
    showProfileModal.value = true;
  };

  const handleEditProfile = (profileId) => {
    const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
    if (profile) {
      isNewProfile.value = false;
      editingProfile.value = JSON.parse(JSON.stringify(profile));
      editingProfile.value.tags = getItemTags(editingProfile.value);
      if (!editingProfile.value.transformConfigMode) {
        editingProfile.value.transformConfigMode = editingProfile.value.transformConfig ? 'preset' : 'global';
      }
      if (!editingProfile.value.ruleLevel && editingProfile.value.clashRuleLevel) {
        editingProfile.value.ruleLevel = editingProfile.value.clashRuleLevel;
      }
      editingProfile.value.expiresAt = profile.expiresAt || '';
      if (!Array.isArray(editingProfile.value.operators)) {
        editingProfile.value.operators = [];
      }
      showProfileModal.value = true;
    }
  };

  const handleSaveProfile = (profileData) => {
    if (!profileData || !profileData.name) {
      showToast(t('profiles.nameRequired'), 'error');
      return;
    }
    const existingProfile = profileData.id ? profiles.value.find((p) => p.id === profileData.id) : null;
    const prevAlias = normalizeProfileIdentifier(existingProfile?.customId);
    const nextAlias = normalizeProfileIdentifier(profileData.customId);
    const legacyExempt = Boolean(existingProfile && prevAlias && prevAlias === nextAlias);
    const aliasCheck = validateSingleProfileAlias(nextAlias, {
      currentProfileId: profileData.id || '',
      profiles: profiles.value,
      legacyExempt,
    });
    if (!aliasCheck.valid) {
      let errorMsg = aliasCheck.message;
      if (aliasCheck.code === 'duplicate') errorMsg = t('profiles.customIdExists', { id: aliasCheck.alias });
      else if (aliasCheck.code === 'too_long')
        errorMsg = t('profiles.customIdTooLong', { max: PROFILE_ALIAS_MAX_LENGTH });
      else if (aliasCheck.code === 'invalid_chars') errorMsg = t('profiles.customIdInvalidChars');
      else if (aliasCheck.code === 'reserved') errorMsg = t('profiles.customIdReserved', { id: aliasCheck.alias });
      showToast(errorMsg, 'error');
      return;
    }

    const normalizedProfile = ensureProfileLinkId({
      ...profileData,
      customId: aliasCheck.alias,
      tags: normalizeTagList(profileData.tags),
    });
    if (isNewProfile.value) {
      dataStore.addProfile({ ...normalizedProfile, id: generateProfileId() });
    } else {
      const index = profiles.value.findIndex((p) => p.id === normalizedProfile.id);
      if (index !== -1) {
        profiles.value[index] = normalizedProfile;
      }
    }
    markDirty();
    showProfileModal.value = false;
  };

  const handleDeleteProfile = (profileId) => {
    dataStore.removeProfile(profileId);
    markDirty();
  };

  const batchUpdateProfileTags = (profileIds, payload) => {
    if (!profileIds || profileIds.length === 0) return;

    let mode = 'replace';
    let inputTags = payload;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      mode = payload.mode || 'append';
      inputTags = payload.tags;
    }

    const idsSet = new Set(profileIds);
    let updatedCount = 0;
    profiles.value.forEach((profile, index) => {
      if (!idsSet.has(profile.id) && !idsSet.has(profile.customId)) return;
      const { nextTags, changed } = computeBatchUpdatedTags(getItemTags(profile), inputTags, mode);
      if (changed) {
        profiles.value[index] = {
          ...profile,
          tags: nextTags,
        };
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      markDirty();
      showToast(t('profiles.batchTagsUpdated', { count: updatedCount }), 'success');
    }
  };

  const batchDeleteProfiles = (profileIds) => {
    if (!profileIds || profileIds.length === 0) return;

    profileIds.forEach((id) => {
      dataStore.removeProfile(id);
    });

    markDirty();
    showToast(t('profiles.deletedCount', { count: profileIds.length }), 'success');
  };

  const handleDeleteAllProfiles = () => {
    profiles.value = [];
    markDirty();
    showDeleteProfilesModal.value = false;
  };

  const reorderProfiles = (newOrder) => {
    if (!Array.isArray(newOrder)) return;
    dataStore.overwriteProfiles(newOrder);
    markDirty();
  };

  return {
    profiles,
    profileTags,
    activeTagFilters,
    setTagFilters,
    toggleTagFilter,
    renameProfileTag,
    deleteProfileTag,
    reorderProfileTags,
    filteredProfiles,
    searchQuery,
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
    profilesCurrentPage,
    profilesPerPage,
    profilesTotalPages,
    paginatedProfiles,
    changeProfilesPage,
  };
}
