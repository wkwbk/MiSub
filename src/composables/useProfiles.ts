import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useDataStore, type MutationResult, type RecordConflictBannerModel } from '@/stores/useDataStore.js';
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
import { normalizeOptionalListenOverride, parseOptionalInteger } from '@misub/core/domain/multi-socks.js';
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
import { confirmAction } from '@/composables/useConfirm.js';
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
  portalMode?: 'inherit' | 'portal' | 'redirect' | 'raw';
  portalRedirectUrl?: string;
  portalNotice?: string;
  multiSocksEnabled?: boolean | null;
  multiSocksStartPort?: number | string | null;
  multiSocksListen?: '' | '127.0.0.1' | '0.0.0.0' | null;
  multiSocksUsername?: string;
  multiSocksPassword?: string;
  multiSocksMaxPorts?: number | string | null;
  sortIndex?: number;
  configVersion?: number;
  version?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
}

export interface ProfileConflictState extends RecordConflictBannerModel {
  current?: StoreProfileConfig;
}

export function useProfiles() {
  const { showToast } = useToastStore();
  const dataStore = useDataStore();
  const settingsStore = useSettingsStore();
  const { profiles } = storeToRefs(dataStore);

  const isNewProfile = ref(false);
  const editingProfile = ref<EditableProfile | null>(null);
  const openedShortLink = ref('');
  const profileConflict = ref<ProfileConflictState | null>(null);
  const showProfileModal = ref(false);
  const showDeleteProfilesModal = ref(false);

  watch(showProfileModal, (visible) => {
    if (!visible) {
      profileConflict.value = null;
      openedShortLink.value = '';
    }
  });

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

  async function renameProfileTag(oldName: string, newName: string): Promise<boolean> {
    const normalizedOld = normalizeTagName(oldName);
    const normalizedNew = normalizeTagName(newName);
    if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew) return false;

    const tagUpdates: Array<{ id: string; tags: string[] }> = [];
    profiles.value.forEach((profile) => {
      const { nextTags, changed: itemChanged } = renameTagInList(getItemTags(profile), normalizedOld, normalizedNew);
      if (itemChanged) {
        tagUpdates.push({ id: profile.id, tags: nextTags });
      }
    });

    if (tagUpdates.length > 0) {
      const res = await dataStore.batchUpdateProfileTagsRecord(tagUpdates);
      if (!res.ok) return false;
    }

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
    return true;
  }

  async function deleteProfileTag(tagName: string): Promise<boolean> {
    const normalized = normalizeTagName(tagName);
    if (!normalized) return false;

    const tagUpdates: Array<{ id: string; tags: string[] }> = [];
    profiles.value.forEach((profile) => {
      const { nextTags, changed: itemChanged } = removeTagFromList(getItemTags(profile), normalized);
      if (itemChanged) {
        tagUpdates.push({ id: profile.id, tags: nextTags });
      }
    });

    if (tagUpdates.length > 0) {
      const res = await dataStore.batchUpdateProfileTagsRecord(tagUpdates);
      if (!res.ok) return false;
    }

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
    return true;
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

  const isSavingProfile = ref(false);

  const handleProfileToggle = async (updatedProfile: Partial<StoreProfileConfig> & { id: string }): Promise<void> => {
    const existing = profiles.value.find((p) => p.id === updatedProfile.id);
    const patch: Partial<StoreProfileConfig> = {};
    if (updatedProfile.enabled !== undefined && (!existing || Boolean(existing.enabled) !== Boolean(updatedProfile.enabled))) {
      patch.enabled = Boolean(updatedProfile.enabled);
    }
    if (updatedProfile.isPublic !== undefined && (!existing || Boolean(existing.isPublic) !== Boolean(updatedProfile.isPublic))) {
      patch.isPublic = Boolean(updatedProfile.isPublic);
    }
    if (Object.keys(patch).length === 0) {
      patch.enabled = Boolean(updatedProfile.enabled);
      if (updatedProfile.isPublic !== undefined) {
        patch.isPublic = Boolean(updatedProfile.isPublic);
      }
    }
    await dataStore.patchProfile(updatedProfile.id, patch);
  };

  const handleAddProfile = (): void => {
    profileConflict.value = null;
    openedShortLink.value = '';
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

  const cloneProfileForEdit = (profile: StoreProfileConfig): EditableProfile => {
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
    return cloned;
  };

  const handleEditProfile = (profileId: string): void => {
    const profile = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
    if (profile) {
      profileConflict.value = null;
      isNewProfile.value = false;
      openedShortLink.value = String(profile.shortLink || '').trim();
      editingProfile.value = cloneProfileForEdit(profile);
      showProfileModal.value = true;
    }
  };

  const handleSaveProfile = async (
    profileData: EditableProfile | null | undefined,
    options: { force?: boolean } = {},
  ): Promise<boolean> => {
    if (isSavingProfile.value) return false;

    if (!profileData || !profileData.name) {
      showToast(t('profiles.nameRequired'), 'error');
      return false;
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
      return false;
    }

    const expectedConfigVersion = Math.max(
      1,
      Number(profileData.configVersion ?? existingProfile?.configVersion) || 1,
    );

    const normalizedProfile = ensureProfileLinkId({
      ...profileData,
      customId: aliasCheck.alias,
      tags: normalizeTagList(profileData.tags),
      prefixSettings: profileData.prefixSettings as StoreProfileConfig['prefixSettings'],
      multiSocksStartPort:
        profileData.multiSocksStartPort === undefined ? undefined : parseOptionalInteger(profileData.multiSocksStartPort),
      multiSocksMaxPorts:
        profileData.multiSocksMaxPorts === undefined ? undefined : parseOptionalInteger(profileData.multiSocksMaxPorts),
      multiSocksListen:
        profileData.multiSocksListen === undefined
          ? undefined
          : normalizeOptionalListenOverride(profileData.multiSocksListen),
    }) as StoreProfileConfig;

    const {
      id: _id,
      sortIndex: _sortIndex,
      downloadCount: _downloadCount,
      configVersion: _configVersion,
      version: _version,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...rawEditableFields
    } = normalizedProfile;

    const editableFields: Partial<StoreProfileConfig> = { ...rawEditableFields };
    if (!isNewProfile.value) {
      const formShortLink = String(editableFields.shortLink || '').trim();
      const latestStoreShortLink = String(existingProfile?.shortLink || '').trim();
      // 未改动弹窗打开时的短链快照，则不随 PATCH 提交，防止并发生成的 shortLink 被覆盖回空字符串
      if (formShortLink === openedShortLink.value || (existingProfile && formShortLink === latestStoreShortLink)) {
        delete editableFields.shortLink;
      }
    }

    isSavingProfile.value = true;
    try {
      let result: MutationResult<StoreProfileConfig>;
      if (isNewProfile.value) {
        result = await dataStore.createProfile({
          ...editableFields,
          id: generateProfileId(),
          isPublic: normalizedProfile.isPublic ?? false,
          subProfiles: normalizedProfile.subProfiles ?? [],
        });
      } else {
        result = await dataStore.updateProfileRecord(
          normalizedProfile.id!,
          editableFields,
          options.force
            ? { force: true }
            : {
                expectedConfigVersion,
                suppressConflictToast: true,
              },
        );
        if (!result.ok && result.conflict) {
          if (result.conflict.current) {
            dataStore.syncProfileFromServer(result.conflict.current);
          }
          const serverVer = Math.max(
            expectedConfigVersion + 1,
            Number(result.conflict.current?.configVersion) || expectedConfigVersion + 1,
          );
          profileConflict.value = {
            current: result.conflict.current,
            localVersion: expectedConfigVersion,
            serverVersion: serverVer,
            message: result.conflict.message,
          };
          showToast(t('store.recordConflictTitle'), 'warning');
          return false;
        }
      }

      if (result.ok) {
        profileConflict.value = null;
        showProfileModal.value = false;
        return true;
      }
      return false;
    } finally {
      isSavingProfile.value = false;
    }
  };

  const reloadProfileFromConflict = (): void => {
    const serverCurrent = profileConflict.value?.current;
    if (!serverCurrent) {
      profileConflict.value = null;
      return;
    }
    openedShortLink.value = String(serverCurrent.shortLink || '').trim();
    editingProfile.value = cloneProfileForEdit(serverCurrent);
    profileConflict.value = null;
    showToast(t('store.reloadedLatestRecord'), 'info');
  };

  const handleForceSaveProfile = async (profileData: EditableProfile | null | undefined): Promise<boolean> => {
    return await handleSaveProfile(profileData, { force: true });
  };

  const handleDeleteProfile = async (profileId: string): Promise<void> => {
    const target = profiles.value.find((p) => p.id === profileId || p.customId === profileId);
    const displayName = target?.name?.trim() || profileId;
    const confirmed = await confirmAction({
      title: t('profiles.deleteConfirmTitle'),
      message: t('profiles.deleteConfirmBody', { name: displayName }),
      confirmText: t('actions.delete'),
      variant: 'danger',
    });
    if (!confirmed) return;
    await dataStore.deleteProfileRecord(profileId);
  };

  const batchUpdateProfileTags = async (profileIds: string[], payload: TagBatchUpdatePayload): Promise<void> => {
    if (!profileIds || profileIds.length === 0) return;

    let mode: TagBatchMode = 'replace';
    let inputTags: unknown = payload;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      mode = payload.mode || 'append';
      inputTags = payload.tags;
    }

    const idsSet = new Set(profileIds);
    const tagUpdates: Array<{ id: string; tags: string[] }> = [];
    profiles.value.forEach((profile) => {
      if (!idsSet.has(profile.id) && !(profile.customId && idsSet.has(profile.customId))) return;
      const { nextTags, changed } = computeBatchUpdatedTags(getItemTags(profile), inputTags, mode);
      if (changed) {
        tagUpdates.push({ id: profile.id, tags: nextTags });
      }
    });

    if (tagUpdates.length > 0) {
      const res = await dataStore.batchUpdateProfileTagsRecord(tagUpdates);
      if (res.ok) {
        showToast(t('profiles.batchTagsUpdated', { count: tagUpdates.length }), 'success');
      }
    }
  };

  const batchDeleteProfiles = async (profileIds: string[]): Promise<void> => {
    if (!profileIds || profileIds.length === 0) return;

    const res = await dataStore.batchDeleteProfilesRecord({ ids: profileIds });
    if (res.ok) {
      showToast(t('profiles.deletedCount', { count: profileIds.length }), 'success');
    }
  };

  const handleDeleteAllProfiles = async (): Promise<void> => {
    const res = await dataStore.batchDeleteProfilesRecord({ all: true });
    if (res.ok) {
      showDeleteProfilesModal.value = false;
    }
  };

  const reorderProfiles = async (newOrder: StoreProfileConfig[]): Promise<void> => {
    if (!Array.isArray(newOrder)) return;
    await dataStore.reorderProfilesRecord(
      newOrder.map((p) => p.id),
      newOrder,
    );
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
    profilesCurrentPage,
    profilesPerPage,
    profilesTotalPages,
    paginatedProfiles,
    changeProfilesPage,
  };
}
