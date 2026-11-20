import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useDataStore } from '@/stores/useDataStore';
import { useSettingsStore } from '@/stores/settings.js';
import { useToastStore } from '@/stores/toast';
import { generateProfileId } from '@/utils/id.js';
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
  const { profiles, settings } = storeToRefs(dataStore);

  /* Pagination setup */
  const isNewProfile = ref(false);
  const editingProfile = ref(null);
  const showProfileModal = ref(false);
  const showDeleteProfilesModal = ref(false);

  const profilesCurrentPage = ref(1);
  const profilesItemsPerPage = 6;

  const searchQuery = ref('');
  const activeTagFilters = ref([]);

  const profileTags = computed(() => {
    const customOrder = settingsStore.config.profileTagOrder || [];
    return collectTags(profiles.value, customOrder);
  });

  function setTagFilters(filters) {
    activeTagFilters.value = normalizeActiveTagFilters(filters);
    profilesCurrentPage.value = 1;
  }

  function toggleTagFilter(tag) {
    activeTagFilters.value = toggleTagFilterValue(activeTagFilters.value, tag);
    profilesCurrentPage.value = 1;
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
    }

    if (activeTagFilters.value.includes(normalized)) {
      activeTagFilters.value = activeTagFilters.value.filter((tag) => tag !== normalized);
    }

    if (changed) markDirty();
  }

  function reorderProfileTags(newOrder) {
    settingsStore.updateConfig({ profileTagOrder: normalizeTagList(newOrder) });
    markDirty();
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

  const profilesTotalPages = computed(() => Math.ceil(filteredProfiles.value.length / profilesItemsPerPage));
  const paginatedProfiles = computed(() => {
    const start = (profilesCurrentPage.value - 1) * profilesItemsPerPage;
    const end = start + profilesItemsPerPage;
    return filteredProfiles.value.slice(start, end);
  });

  watch([searchQuery, activeTagFilters], () => {
    profilesCurrentPage.value = 1;
  });

  function changeProfilesPage(page) {
    if (page < 1 || page > profilesTotalPages.value) return;
    profilesCurrentPage.value = page;
  }

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
    if (profileData.customId) {
      profileData.customId = profileData.customId.replace(/[^a-zA-Z0-9-_]/g, '');
      if (
        profileData.customId &&
        profiles.value.some((p) => p.id !== profileData.id && p.customId === profileData.customId)
      ) {
        showToast(t('profiles.customIdExists', { id: profileData.customId }), 'error');
        return;
      }
    }
    const normalizedProfile = {
      ...profileData,
      tags: normalizeTagList(profileData.tags),
    };
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

    if (paginatedProfiles.value.length === 0 && profilesCurrentPage.value > 1) {
      profilesCurrentPage.value--;
    }

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

  const copyProfileLink = (profileId) => {
    const token = settings.value?.profileToken;
    if (!token || token === 'auto' || !token.trim()) {
      showToast(t('profiles.fixedTokenRequired'), 'error');
      return;
    }
    const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
    if (!profile) return;
    const identifier = profile.customId || profile.id;
    const link = `${window.location.origin}/${token}/${identifier}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(link)
        .then(() => showToast(t('profiles.linkCopied'), 'success'))
        .catch(() => showToast(t('publicProfiles.copyFailedManual'), 'error'));
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = link;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        const successful = document.execCommand('copy');
        if (successful) {
          showToast(t('profiles.linkCopied'), 'success');
        } else {
          showToast(t('publicProfiles.copyFailedManual'), 'error');
        }
      } catch {
        showToast(t('publicProfiles.copyFailedManual'), 'error');
      }

      document.body.removeChild(textArea);
    }
  };

  const copyClashLink = (profileId) => {
    const token = settings.value?.profileToken;
    if (!token || token === 'auto' || !token.trim()) {
      showToast(t('profiles.fixedTokenRequired'), 'error');
      return;
    }
    const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
    if (!profile) return;
    const identifier = profile.customId || profile.id;
    const link = `${window.location.origin}/${token}/${identifier}?target=clash&builtin=1`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(link)
        .then(() => showToast(t('profiles.clashLinkCopied'), 'success'))
        .catch(() => showToast(t('publicProfiles.copyFailedManual'), 'error'));
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = link;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        const successful = document.execCommand('copy');
        if (successful) {
          showToast(t('profiles.clashLinkCopied'), 'success');
        } else {
          showToast(t('publicProfiles.copyFailedManual'), 'error');
        }
      } catch {
        showToast(t('publicProfiles.copyFailedManual'), 'error');
      }

      document.body.removeChild(textArea);
    }
  };

  const cleanupSubscriptions = (subId) => {
    profiles.value.forEach((p) => {
      p.subscriptions = p.subscriptions.filter((id) => id !== subId);
    });
  };

  const cleanupNodes = (nodeId) => {
    profiles.value.forEach((p) => {
      p.manualNodes = p.manualNodes.filter((id) => id !== nodeId);
    });
  };

  const cleanupAllSubscriptions = () => {
    profiles.value.forEach((p) => {
      p.subscriptions = [];
    });
  };

  const cleanupAllNodes = () => {
    profiles.value.forEach((p) => {
      p.manualNodes = [];
    });
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
    initializeProfiles: () => {},
    handleProfileToggle,
    handleAddProfile,
    handleEditProfile,
    handleSaveProfile,
    handleDeleteProfile,
    handleDeleteAllProfiles,
    batchUpdateProfileTags,
    batchDeleteProfiles,
    reorderProfiles,
    copyProfileLink,
    copyClashLink,
    cleanupSubscriptions,
    cleanupNodes,
    cleanupAllSubscriptions,
    cleanupAllNodes,
    profilesCurrentPage,
    profilesTotalPages,
    paginatedProfiles,
    changeProfilesPage,
  };
}
