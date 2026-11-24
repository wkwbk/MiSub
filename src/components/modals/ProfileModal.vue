<script setup>
import { computed, ref, watch } from 'vue';
import { Folder } from '@lucide/vue';
import Modal from '@/components/ui/Modal.vue';
import ProfileForm from '@/components/modals/ProfileModal/ProfileForm.vue';
import SubscriptionSelector from '@/components/modals/ProfileModal/SubscriptionSelector.vue';
import SubProfileSelector from '@/components/modals/ProfileModal/SubProfileSelector.vue';
import NodeSelector from '@/components/modals/ProfileModal/NodeSelector.vue';
import { useDataStore } from '@/stores/useDataStore.js';
import { useSettingsStore } from '@/stores/settings.js';
import { useI18n } from '@/i18n/index.js';
import { collectTags, getItemTags, matchesTagFilter, normalizeTagList } from '@/utils/tags.js';
import { ensureProfileLinkId, generateProfileLinkId } from '@shared/profile-link.js';
import { getProfileSubscriptionId } from '@shared/profile-subscription-ref.js';
import { normalizeBuiltinTransform } from '@shared/visual-rules-catalog.js';

const { t } = useI18n();
const dataStore = useDataStore();
const settingsStore = useSettingsStore();

const props = defineProps({
  show: Boolean,
  profile: Object,
  isNew: Boolean,
  allSubscriptions: Array,
  allManualNodes: Array,
});

const emit = defineEmits(['update:show', 'save']);

const localProfile = ref({});
const subscriptionSearchTerm = ref('');
const subProfileSearchTerm = ref('');
const nodeSearchTerm = ref('');
const activeResourceTab = ref('manualNodes');
const activeSubscriptionTagFilters = ref([]);
const activeManualNodeTagFilters = ref([]);
const activeSubProfileTagFilters = ref([]);
const showAdvanced = ref(false);
const uiText = computed(() => ({
  prefixTitle: t('profileModal.nodeNameVisibility'),
  manualPrefixLabel: t('profileModal.manualPrefixText'),
  manualPrefixToggle: t('profileModal.manualNodeDisplay'),
  subscriptionPrefixToggle: t('profileModal.subscriptionPrefix'),
  enable: t('profiles.optionEnabled'),
  disable: t('profiles.optionDisabled'),
}));
const prefixToggleOptions = [
  { label: t('profiles.globalDefault'), value: null },
  { label: t('profiles.optionEnabled'), value: true },
  { label: t('profiles.optionDisabled'), value: false },
];

const tagPrefixToggleOptions = [
  { label: t('profiles.globalDefault'), value: null },
  { label: t('profiles.optionEnabled'), value: true },
  { label: t('profiles.optionDisabled'), value: false },
];

const countryCodeMap = {
  hk: ['🇭🇰', '香港'],
  tw: ['🇨🇳', '台湾', '臺灣'],
  sg: ['🇸🇬', '新加坡', '狮城'],
  jp: ['🇯🇵', '日本'],
  us: ['🇺🇸', '美国', '美國'],
  kr: ['🇰🇷', '韩国', '韓國'],
  gb: ['🇬🇧', '英国', '英國'],
  de: ['🇩🇪', '德国', '德國'],
  fr: ['🇫🇷', '法国', '法國'],
  ca: ['🇨🇦', '加拿大'],
  au: ['🇦🇺', '澳大利亚', '澳洲', '澳大利亞'],
  cn: ['🇨🇳', '中国', '大陸', '内地'],
  my: ['🇲🇾', '马来西亚', '馬來西亞'],
  th: ['🇹🇭', '泰国', '泰國'],
  vn: ['🇻🇳', '越南'],
  ph: ['🇵🇭', '菲律宾', '菲律賓'],
  id: ['🇮🇩', '印度尼西亚', '印尼'],
  in: ['🇮🇳', '印度'],
  pk: ['🇵🇰', '巴基斯坦'],
  bd: ['🇧🇩', '孟加拉国', '孟加拉國'],
  ae: ['🇦🇪', '阿联酋', '阿聯酋'],
  sa: ['🇸🇦', '沙特阿拉伯'],
  tr: ['🇹🇷', '土耳其'],
  ru: ['🇷🇺', '俄罗斯', '俄羅斯'],
  br: ['🇧🇷', '巴西'],
  mx: ['🇲🇽', '墨西哥'],
  ar: ['🇦🇷', '阿根廷'],
  cl: ['🇨🇱', '智利'],
  za: ['🇿🇦', '南非'],
  eg: ['🇪🇬', '埃及'],
  ng: ['🇳🇬', '尼日利亚', '尼日利亞'],
  ke: ['🇰🇪', '肯尼亚', '肯尼亞'],
  il: ['🇮🇱', '以色列'],
  ir: ['🇮🇷', '伊朗'],
  iq: ['🇮🇶', '伊拉克'],
  ua: ['🇺🇦', '乌克兰', '烏克蘭'],
  pl: ['🇵🇱', '波兰', '波蘭'],
  cz: ['🇨🇿', '捷克'],
  hu: ['🇭🇺', '匈牙利'],
  ro: ['🇷🇴', '罗马尼亚', '羅馬尼亞'],
  gr: ['🇬🇷', '希腊', '希臘'],
  pt: ['🇵🇹', '葡萄牙'],
  es: ['🇪🇸', '西班牙'],
  it: ['🇮🇹', '意大利'],
  nl: ['🇳🇱', '荷兰', '荷蘭'],
  be: ['🇧🇪', '比利时', '比利時'],
  se: ['🇸🇪', '瑞典'],
  no: ['🇳🇴', '挪威'],
  dk: ['🇩🇰', '丹麦', '丹麥'],
  fi: ['🇫🇮', '芬兰', '芬蘭'],
  ch: ['🇨🇭', '瑞士'],
  at: ['🇦🇹', '奥地利', '奧地利'],
  ie: ['🇮🇪', '爱尔兰', '愛爾蘭'],
  nz: ['🇳🇿', '新西兰', '紐西蘭'],
};

const allProfileTags = computed(() =>
  collectTags(dataStore.profiles || [], settingsStore.config.profileTagOrder || []),
);

const manualNodeTags = computed(() =>
  collectTags(props.allManualNodes || [], settingsStore.config.manualNodeTagOrder || []),
);

const selectableSubscriptions = computed(() => {
  return (props.allSubscriptions || []).filter((sub) => sub.enabled && sub.url && /^https?:\/\//.test(sub.url));
});

const subscriptionTags = computed(() => {
  return collectTags(selectableSubscriptions.value, settingsStore.config.subscriptionTagOrder || []);
});

const filteredSubscriptions = computed(() => {
  let validSubs = selectableSubscriptions.value.filter((sub) =>
    matchesTagFilter(sub, activeSubscriptionTagFilters.value),
  );

  if (!subscriptionSearchTerm.value) {
    return validSubs;
  }
  const lowerCaseSearchTerm = subscriptionSearchTerm.value.toLowerCase();
  const alternativeTerms = countryCodeMap[lowerCaseSearchTerm] || [];

  return validSubs.filter((sub) => {
    const subNameLower = sub.name ? sub.name.toLowerCase() : '';
    if (subNameLower.includes(lowerCaseSearchTerm)) return true;

    const tags = getItemTags(sub);
    if (tags.some((tag) => tag.toLowerCase().includes(lowerCaseSearchTerm))) return true;

    for (const altTerm of alternativeTerms) {
      if (subNameLower.includes(altTerm.toLowerCase())) {
        return true;
      }
    }
    return false;
  });
});

const selectableSubProfiles = computed(() => {
  const currentId = localProfile.value?.id || props.profile?.id;
  return (dataStore.profiles || []).filter((p) => {
    if (!p) return false;
    if (currentId && (p.id === currentId || p.customId === currentId)) {
      return false;
    }
    return p.enabled !== false;
  });
});

const subProfileTags = computed(() =>
  collectTags(selectableSubProfiles.value, settingsStore.config.profileTagOrder || []),
);

const filteredSubProfiles = computed(() => {
  const list = selectableSubProfiles.value.filter((p) => matchesTagFilter(p, activeSubProfileTagFilters.value));
  if (!subProfileSearchTerm.value) {
    return list;
  }
  const lowerCaseSearchTerm = subProfileSearchTerm.value.toLowerCase();
  const alternativeTerms = countryCodeMap[lowerCaseSearchTerm] || [];

  return list.filter((p) => {
    const pNameLower = p.name ? p.name.toLowerCase() : '';
    const pDescLower = p.description ? p.description.toLowerCase() : '';
    const pIdLower = p.customId ? p.customId.toLowerCase() : '';

    if (
      pNameLower.includes(lowerCaseSearchTerm) ||
      pDescLower.includes(lowerCaseSearchTerm) ||
      pIdLower.includes(lowerCaseSearchTerm)
    ) {
      return true;
    }

    const tags = getItemTags(p);
    if (tags.some((tag) => tag.toLowerCase().includes(lowerCaseSearchTerm))) return true;

    for (const altTerm of alternativeTerms) {
      if (pNameLower.includes(altTerm.toLowerCase())) {
        return true;
      }
    }
    return false;
  });
});

const filteredManualNodes = computed(() => {
  const nodes = (props.allManualNodes || []).filter((node) => matchesTagFilter(node, activeManualNodeTagFilters.value));

  if (!nodeSearchTerm.value) {
    return nodes;
  }
  const lowerCaseSearchTerm = nodeSearchTerm.value.toLowerCase();
  const alternativeTerms = countryCodeMap[lowerCaseSearchTerm] || [];

  return nodes.filter((node) => {
    const nodeNameLower = node.name ? node.name.toLowerCase() : '';
    if (nodeNameLower.includes(lowerCaseSearchTerm)) return true;

    const tags = getItemTags(node);
    if (tags.some((tag) => tag.toLowerCase().includes(lowerCaseSearchTerm))) return true;

    for (const altTerm of alternativeTerms) {
      if (nodeNameLower.includes(altTerm.toLowerCase())) {
        return true;
      }
    }
    return false;
  });
});

watch(
  () => props.profile,
  (newProfile) => {
    if (newProfile) {
      const profileCopy = JSON.parse(JSON.stringify(newProfile));
      profileCopy.tags = getItemTags(profileCopy);
      if (profileCopy.expiresAt) {
        try {
          profileCopy.expiresAt = new Date(profileCopy.expiresAt).toISOString().split('T')[0];
        } catch (e) {
          console.error('Error parsing expiresAt date:', e);
          profileCopy.expiresAt = '';
        }
      }
      if (!profileCopy.prefixSettings || typeof profileCopy.prefixSettings !== 'object') {
        profileCopy.prefixSettings = {};
      }
      profileCopy.prefixSettings.enableManualNodes = profileCopy.prefixSettings.enableManualNodes ?? null;
      profileCopy.prefixSettings.enableSubscriptions = profileCopy.prefixSettings.enableSubscriptions ?? null;
      profileCopy.prefixSettings.manualNodePrefix = profileCopy.prefixSettings.manualNodePrefix ?? '';
      profileCopy.prefixSettings.prependTagName = profileCopy.prefixSettings.prependTagName ?? null;

      if (Object.prototype.hasOwnProperty.call(profileCopy.prefixSettings, 'enableNodeEmoji')) {
        delete profileCopy.prefixSettings.enableNodeEmoji;
      }

      if (!profileCopy.subconverter || typeof profileCopy.subconverter !== 'object') {
        profileCopy.subconverter = {
          engineMode: '',
          backend: '',
          options: {
            udp: null,
            emoji: null,
            scv: null,
            sort: null,
            tfo: null,
            list: null,
          },
        };
      } else {
        profileCopy.subconverter.options = profileCopy.subconverter.options || {};
        const fields = ['udp', 'emoji', 'scv', 'sort', 'tfo', 'list'];
        fields.forEach((f) => {
          if (profileCopy.subconverter.options[f] === undefined) {
            profileCopy.subconverter.options[f] = null;
          }
        });
      }

      profileCopy.operators = Array.isArray(profileCopy.operators) ? profileCopy.operators : [];
      if (!profileCopy.transformConfigMode) {
        profileCopy.transformConfigMode = profileCopy.transformConfig ? 'preset' : 'global';
      }
      if (profileCopy.ruleLevel === undefined || profileCopy.ruleLevel === null) {
        profileCopy.ruleLevel = '';
      }
      if (profileCopy.builtinTransform && typeof profileCopy.builtinTransform === 'object') {
        profileCopy.builtinTransform = normalizeBuiltinTransform(profileCopy.builtinTransform);
      }

      profileCopy.subProfiles = Array.isArray(profileCopy.subProfiles) ? profileCopy.subProfiles : [];
      profileCopy.shortLink = typeof profileCopy.shortLink === 'string' ? profileCopy.shortLink : '';
      profileCopy.fetchMinInterval =
        profileCopy.fetchMinInterval === undefined || profileCopy.fetchMinInterval === null
          ? ''
          : String(profileCopy.fetchMinInterval);
      profileCopy.fetchLimitMode =
        profileCopy.fetchLimitMode === 'strict' || profileCopy.fetchLimitMode === 'cache'
          ? profileCopy.fetchLimitMode
          : '';

      localProfile.value = ensureProfileLinkId(profileCopy);
    } else {
      localProfile.value = {
        name: '',
        enabled: true,
        subscriptions: [],
        subProfiles: [],
        manualNodes: [],
        tags: [],
        customId: '',
        linkId: generateProfileLinkId(),
        shortLink: '',
        expiresAt: '',
        fetchMinInterval: '',
        fetchLimitMode: '',
        isPublic: true,
        description: '',
        transformConfigMode: 'global',
        transformConfig: '',
        ruleLevel: '',
        prefixSettings: {
          enableManualNodes: null,
          enableSubscriptions: null,
          manualNodePrefix: '',
          prependTagName: null,
        },
        operators: [],
      };
    }
  },
  { deep: true, immediate: true },
);

const handleConfirm = () => {
  const profileToSave = JSON.parse(JSON.stringify(localProfile.value));
  profileToSave.tags = normalizeTagList(profileToSave.tags);
  if (profileToSave.expiresAt) {
    try {
      const date = new Date(profileToSave.expiresAt);
      date.setHours(23, 59, 59, 999);
      profileToSave.expiresAt = date.toISOString();
    } catch (e) {
      console.error('Error processing expiresAt date:', e);
      profileToSave.expiresAt = '';
    }
  }
  const rawFetchInterval = profileToSave.fetchMinInterval;
  if (rawFetchInterval === '' || rawFetchInterval === null || rawFetchInterval === undefined) {
    delete profileToSave.fetchMinInterval;
  } else {
    const parsed = Number.parseInt(String(rawFetchInterval), 10);
    if (Number.isNaN(parsed)) {
      delete profileToSave.fetchMinInterval;
    } else {
      profileToSave.fetchMinInterval = Math.min(1440, Math.max(0, parsed));
    }
  }
  if (profileToSave.fetchLimitMode !== 'strict' && profileToSave.fetchLimitMode !== 'cache') {
    delete profileToSave.fetchLimitMode;
  }
  const isVisualMode =
    profileToSave.transformConfigMode === 'visual' ||
    (profileToSave.transformConfigMode === 'builtin' && Boolean(profileToSave.builtinTransform?.visualRulesEnabled));
  if (isVisualMode) {
    const normalizedBt = normalizeBuiltinTransform(profileToSave.builtinTransform || {});
    profileToSave.transformConfigMode = 'builtin';
    profileToSave.builtinTransform = {
      visualRulesEnabled: true,
      rulePreset: normalizedBt.rulePreset,
      selectedRules: normalizedBt.selectedRules,
      customRules: normalizedBt.customRules,
    };
  } else {
    delete profileToSave.builtinTransform;
  }
  emit('save', profileToSave);
};

const toggleSelection = (listName, id) => {
  const list = localProfile.value[listName];
  if (listName === 'subscriptions') {
    const index = list.findIndex((item) => getProfileSubscriptionId(item) === id);
    if (index > -1) {
      list.splice(index, 1);
    } else {
      list.push(id);
    }
    return;
  }
  const index = list.indexOf(id);
  if (index > -1) {
    list.splice(index, 1);
  } else {
    list.push(id);
  }
};

const handleSelectAll = (listName, sourceArray) => {
  if (listName === 'subscriptions') {
    const currentList = Array.isArray(localProfile.value[listName]) ? localProfile.value[listName] : [];
    const existingIds = new Set(currentList.map(getProfileSubscriptionId).filter(Boolean));
    const nextList = [...currentList];
    sourceArray.forEach((item) => {
      if (item?.id && !existingIds.has(item.id)) {
        existingIds.add(item.id);
        nextList.push(item.id);
      }
    });
    localProfile.value[listName] = nextList;
    return;
  }
  const currentSelection = new Set(localProfile.value[listName]);
  sourceArray.forEach((item) => currentSelection.add(item.id));
  localProfile.value[listName] = Array.from(currentSelection);
};

const handleDeselectAll = (listName, sourceArray) => {
  const sourceIdSet = new Set(sourceArray.map((item) => item.id));
  if (listName === 'subscriptions') {
    localProfile.value[listName] = localProfile.value[listName].filter(
      (entry) => !sourceIdSet.has(getProfileSubscriptionId(entry)),
    );
    return;
  }
  localProfile.value[listName] = localProfile.value[listName].filter((id) => !sourceIdSet.has(id));
};

const updateSelectedIds = (listName, newIds) => {
  localProfile.value[listName] = newIds;
};
</script>

<template>
  <Modal
    :close-on-confirm="false"
    :show="show"
    size="7xl"
    @confirm="handleConfirm"
    @update:show="emit('update:show', $event)"
  >
    <template #title>
      <div class="flex items-center gap-3">
        <Folder class="h-5 w-5 text-fg-muted shrink-0" />
        <div>
          <h3 class="text-base font-semibold text-fg">
            {{ isNew ? t('profiles.addTitle') : t('profiles.editTitle') }}
          </h3>
          <p class="mt-0.5 text-xs text-fg-muted">
            {{ t('profiles.modalDescription') }}
          </p>
        </div>
      </div>
    </template>
    <template #body>
      <div v-if="localProfile" class="space-y-6">
        <ProfileForm
          :global-settings="dataStore.settings"
          :local-profile="localProfile"
          :original-custom-id="props.profile?.customId || ''"
          :prefix-toggle-options="prefixToggleOptions"
          :profile-tags="allProfileTags"
          :show-advanced="showAdvanced"
          :tag-prefix-toggle-options="tagPrefixToggleOptions"
          :ui-text="uiText"
          @toggle-advanced="showAdvanced = !showAdvanced"
        />

        <!-- 资源选择区（节点 / 订阅 / 订阅组） -->
        <div class="space-y-4">
          <div class="border-b border-line">
            <nav aria-label="Tabs" class="-mb-px flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar">
              <button
                :class="[
                  activeResourceTab === 'manualNodes'
                    ? 'text-fg font-semibold'
                    : 'text-fg-muted hover:text-fg font-medium',
                  'relative whitespace-nowrap pb-2.5 pt-1.5 px-3 !rounded-t-md !rounded-b-none text-xs flex items-center gap-1.5 transition-colors cursor-pointer',
                ]"
                type="button"
                @click="activeResourceTab = 'manualNodes'"
              >
                <span>{{ t('profileModal.tabManualNodes') }}</span>
                <span
                  v-if="localProfile.manualNodes?.length"
                  :class="
                    activeResourceTab === 'manualNodes' ? 'border-line-strong text-fg' : 'border-line text-fg-muted'
                  "
                  class="px-1.5 py-0.5 rounded-full font-mono text-xs leading-none border bg-transparent font-semibold"
                >
                  {{ localProfile.manualNodes.length }}
                </span>
                <span
                  v-if="activeResourceTab === 'manualNodes'"
                  class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"
                ></span>
              </button>

              <button
                :class="[
                  activeResourceTab === 'subscriptions'
                    ? 'text-fg font-semibold'
                    : 'text-fg-muted hover:text-fg font-medium',
                  'relative whitespace-nowrap pb-2.5 pt-1.5 px-3 !rounded-t-md !rounded-b-none text-xs flex items-center gap-1.5 transition-colors cursor-pointer',
                ]"
                type="button"
                @click="activeResourceTab = 'subscriptions'"
              >
                <span>{{ t('profileModal.tabSubscriptions') }}</span>
                <span
                  v-if="localProfile.subscriptions?.length"
                  :class="
                    activeResourceTab === 'subscriptions' ? 'border-line-strong text-fg' : 'border-line text-fg-muted'
                  "
                  class="px-1.5 py-0.5 rounded-full font-mono text-xs leading-none border bg-transparent font-semibold"
                >
                  {{ localProfile.subscriptions.length }}
                </span>
                <span
                  v-if="activeResourceTab === 'subscriptions'"
                  class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"
                ></span>
              </button>

              <button
                :class="[
                  activeResourceTab === 'subProfiles'
                    ? 'text-fg font-semibold'
                    : 'text-fg-muted hover:text-fg font-medium',
                  'relative whitespace-nowrap pb-2.5 pt-1.5 px-3 !rounded-t-md !rounded-b-none text-xs flex items-center gap-1.5 transition-colors cursor-pointer',
                ]"
                type="button"
                @click="activeResourceTab = 'subProfiles'"
              >
                <span>{{ t('profileModal.tabSubProfiles') }}</span>
                <span
                  v-if="localProfile.subProfiles?.length"
                  :class="
                    activeResourceTab === 'subProfiles' ? 'border-line-strong text-fg' : 'border-line text-fg-muted'
                  "
                  class="px-1.5 py-0.5 rounded-full font-mono text-xs leading-none border bg-transparent font-semibold"
                >
                  {{ localProfile.subProfiles.length }}
                </span>
                <span
                  v-if="activeResourceTab === 'subProfiles'"
                  class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"
                ></span>
              </button>

              <button
                :class="[
                  activeResourceTab === 'all' ? 'text-fg font-semibold' : 'text-fg-muted hover:text-fg font-medium',
                  'relative whitespace-nowrap pb-2.5 pt-1.5 px-3 !rounded-t-md !rounded-b-none text-xs flex items-center gap-1.5 transition-colors cursor-pointer',
                ]"
                type="button"
                @click="activeResourceTab = 'all'"
              >
                <span>{{ t('profileModal.tabAll') }}</span>
                <span v-if="activeResourceTab === 'all'" class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"></span>
              </button>
            </nav>
          </div>

          <div :class="activeResourceTab === 'all' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : ''">
            <div v-show="activeResourceTab === 'manualNodes' || activeResourceTab === 'all'">
              <NodeSelector
                :active-tag-filters="activeManualNodeTagFilters"
                :filtered-nodes="filteredManualNodes"
                :nodes="allManualNodes"
                :search-term="nodeSearchTerm"
                :selected-ids="localProfile.manualNodes || []"
                :tags="manualNodeTags"
                @update:search-term="nodeSearchTerm = $event"
                @update:tag-filters="activeManualNodeTagFilters = $event"
                @update:selected-ids="updateSelectedIds('manualNodes', $event)"
                @toggle-selection="toggleSelection('manualNodes', $event)"
                @select-all="handleSelectAll('manualNodes', filteredManualNodes)"
                @deselect-all="handleDeselectAll('manualNodes', filteredManualNodes)"
              />
            </div>

            <div v-show="activeResourceTab === 'subscriptions' || activeResourceTab === 'all'">
              <SubscriptionSelector
                :active-tag-filters="activeSubscriptionTagFilters"
                :filtered-subscriptions="filteredSubscriptions"
                :search-term="subscriptionSearchTerm"
                :selected-ids="localProfile.subscriptions || []"
                :subscriptions="selectableSubscriptions"
                :tags="subscriptionTags"
                @update:search-term="subscriptionSearchTerm = $event"
                @update:tag-filters="activeSubscriptionTagFilters = $event"
                @update:selected-ids="updateSelectedIds('subscriptions', $event)"
                @toggle-selection="toggleSelection('subscriptions', $event)"
                @select-all="handleSelectAll('subscriptions', filteredSubscriptions)"
                @deselect-all="handleDeselectAll('subscriptions', filteredSubscriptions)"
              />
            </div>

            <div v-show="activeResourceTab === 'subProfiles' || activeResourceTab === 'all'">
              <SubProfileSelector
                :active-tag-filters="activeSubProfileTagFilters"
                :all-profiles="dataStore.profiles || []"
                :filtered-profiles="filteredSubProfiles"
                :profiles="selectableSubProfiles"
                :search-term="subProfileSearchTerm"
                :selected-ids="localProfile.subProfiles || []"
                :tags="subProfileTags"
                :target-profile-id="localProfile.id || props.profile?.id || ''"
                @update:search-term="subProfileSearchTerm = $event"
                @update:tag-filters="activeSubProfileTagFilters = $event"
                @update:selected-ids="updateSelectedIds('subProfiles', $event)"
                @toggle-selection="toggleSelection('subProfiles', $event)"
                @select-all="handleSelectAll('subProfiles', $event)"
                @deselect-all="handleDeselectAll('subProfiles', filteredSubProfiles)"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </Modal>
</template>
