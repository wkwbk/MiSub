import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useDataStore } from '@/stores/useDataStore.js';
import { useSettingsStore } from '@/stores/useSettingsStore.js';
import { useToastStore } from '@/stores/useToastStore.js';
import type { StoreProfileConfig } from '@/queries/useAppDataQueries.js';
import type { TagBatchMode, TagBatchUpdatePayload } from '@/composables/useManualNodes.js';
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

export interface EditableProfile {
  id?: string;
  name?: string;
  description?: string;
  desc?: string;
  remark?: string;
  customId?: string;
  linkId?: string;
  shortLink?: string;
  enabled?: boolean;
  isPublic?: boolean;
  downloadCount?: number;
  subscriptions?: StoreProfileConfig['subscriptions'];
  manualNodes?: string[];
  subProfiles?: string[];
  tags?: string[];
  transformConfigMode?: string;
  transformConfig?: string;
  ruleLevel?: string;
  clashRuleLevel?: string;
  target?: string;
  prefixSettings?: {
    enableManualNodes?: boolean | null;
    enableSubscriptions?: boolean | null;
    manualNodePrefix?: string;
    subscriptionPrefix?: string;
    prependTagName?: boolean | null;
    [key: string]: unknown;
  };
  subconverter?: StoreProfileConfig['subconverter'];
  operators?: StoreProfileConfig['operators'];
  nodeTransform?: StoreProfileConfig['nodeTransform'];
  nodeTransformPresetId?: string;
  expiresAt?: string | null;
  fetchMinInterval?: string | number;
  fetchLimitMode?: '' | 'cache' | 'strict';
  sortIndex?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
}

export function useProfiles(markDirty: () => void) {
  const { showToast } = useToastStore();
  const dataStore = useDataStore();
  const settingsStore = useSettingsStore();
  const { profiles } = storeToRefs(dataStore);

  const isNewProfile = ref(false);
  const editingProfile = ref<EditableProfile | null>(null);
  const showProfileModal = ref(false);
  const showDeleteProfilesModal = ref(false);

  const searchQuery = ref('');
  const activeTagFilters = ref<string[]>([]);

  const profileTags = computed<string[]>(() => {
    const customOrder = settingsStore.config.profileTagOrder || [];
    return collectTags(profiles.value, customOrder);
  });

  function setTagFilters(filters: unknown): void {
    activeTagFilters.value = normalizeActiveTagFilters(filters);
  }

  function toggleTagFilter(tag: string | null | undefined): void {
    activeTagFilters.value = toggleTagFilterValue(activeTagFilters.value, tag);
  }

  function renameProfileTag(oldName: string, newName: string): void {
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

  function deleteProfileTag(tagName: string): void {
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

  function reorderProfileTags(newOrder: string[]): void {
    const normalizedOrder = normalizeTagList(newOrder);
    settingsStore.updateConfig({ profileTagOrder: normalizedOrder });
    if (typeof dataStore.saveSettings === 'function') {
      dataStore
        .saveSettings({ profileTagOrder: normalizedOrder }, { silent: true, preferencesOnly: true })
        .catch(() => {});
    }
  }

  const filteredProfiles = computed<StoreProfileConfig[]>(() => {
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

  const handleProfileToggle = (updatedProfile: Partial<StoreProfileConfig> & { id: string }): void => {
    const index = profiles.value.findIndex((p) => p.id === updatedProfile.id);
    if (index !== -1) {
      profiles.value[index].enabled = Boolean(updatedProfile.enabled);
      if (updatedProfile.isPublic !== undefined) {
        profiles.value[index].isPublic = updatedProfile.isPublic;
      }
      markDirty();
    }
  };

  const handleAddProfile = (): void => {
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

  const handleEditProfile = (profileId: string): void => {
    const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
    if (profile) {
      isNewProfile.value = false;
      const cloned = JSON.parse(JSON.stringify(profile)) as EditableProfile;
      cloned.tags = getItemTags(cloned);
      if (!cloned.transformConfigMode) {
        cloned.transformConfigMode = cloned.transformConfig ? 'preset' : 'global';
      }
      if (!cloned.ruleLevel && cloned.clashRuleLevel) {
        cloned.ruleLevel = cloned.clashRuleLevel;
      }
      cloned.expiresAt = profile.expiresAt || '';
      if (!Array.isArray(cloned.operators)) {
        cloned.operators = [];
      }
      editingProfile.value = cloned;
      showProfileModal.value = true;
    }
  };

  const handleSaveProfile = (profileData: EditableProfile | null | undefined): void => {
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
      let errorMsg = aliasCheck.message || t('profiles.customIdInvalidChars');
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
      prefixSettings: profileData.prefixSettings as StoreProfileConfig['prefixSettings'],
    }) as StoreProfileConfig;
    if (isNewProfile.value) {
      dataStore.addProfile({
        ...normalizedProfile,
        id: generateProfileId(),
        isPublic: normalizedProfile.isPublic ?? false,
        downloadCount: normalizedProfile.downloadCount ?? 0,
        subProfiles: normalizedProfile.subProfiles ?? [],
      });
    } else {
      const index = profiles.value.findIndex((p) => p.id === normalizedProfile.id);
      if (index !== -1) {
        profiles.value[index] = {
          ...profiles.value[index],
          ...normalizedProfile,
        };
      }
    }
    markDirty();
    showProfileModal.value = false;
  };

  const handleDeleteProfile = (profileId: string): void => {
    dataStore.removeProfile(profileId);
    markDirty();
  };

  const batchUpdateProfileTags = (profileIds: string[], payload: TagBatchUpdatePayload): void => {
    if (!profileIds || profileIds.length === 0) return;

    let mode: TagBatchMode = 'replace';
    let inputTags: unknown = payload;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      mode = payload.mode || 'append';
      inputTags = payload.tags;
    }

    const idsSet = new Set(profileIds);
    let updatedCount = 0;
    profiles.value.forEach((profile, index) => {
      if (!idsSet.has(profile.id) && !(profile.customId && idsSet.has(profile.customId))) return;
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

  const batchDeleteProfiles = (profileIds: string[]): void => {
    if (!profileIds || profileIds.length === 0) return;

    profileIds.forEach((id) => {
      dataStore.removeProfile(id);
    });

    markDirty();
    showToast(t('profiles.deletedCount', { count: profileIds.length }), 'success');
  };

  const handleDeleteAllProfiles = (): void => {
    profiles.value = [];
    markDirty();
    showDeleteProfilesModal.value = false;
  };

  const reorderProfiles = (newOrder: StoreProfileConfig[]): void => {
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
