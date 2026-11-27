<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { BuiltinTransformConfig, RuleTemplate } from '@misub/core/types.js';
import type { EditableProfile } from '@/composables/useProfiles.js';
import type { AppSettingsConfig } from '@/queries/useAppDataQueries.js';
import { ChevronDown, Globe, Network, RotateCcw, SlidersHorizontal } from '@lucide/vue';
import { getActivePinia, storeToRefs } from 'pinia';
import TransformSelector from '@/components/forms/TransformSelector.vue';
import VisualTransformCard from '@/components/settings/sections/ServiceSettings/VisualTransformCard.vue';
import RuleTemplateModal from '@/components/modals/RuleTemplateModal.vue';
import DatePicker from '@/components/ui/DatePicker.vue';
import Input from '@/components/ui/Input.vue';
import ConfirmPopover from '@/components/ui/ConfirmPopover.vue';
import Select from '@/components/ui/Select.vue';
import TagInput from '@/components/ui/TagInput.vue';
import Textarea from '@/components/ui/Textarea.vue';
import OperatorChain from '@/components/operators/OperatorChain.vue';
import { useDataStore } from '@/stores/useDataStore.js';
import { useToastStore, type ToastType } from '@/stores/useToastStore.js';
import { getLocalizedTransformAssetByUrl } from '@/constants/transform-assets';
import { useI18n } from '@/i18n/index.js';
import { DEFAULT_BUILTIN_TRANSFORM, normalizeBuiltinTransform } from '@misub/core/domain/visual-rules-catalog.js';
import {
  getProfileShareIdentifier,
  normalizeProfileIdentifier,
  rotateProfileLinkId,
} from '@misub/core/domain/profile-link.js';
import { PROFILE_ALIAS_MAX_LENGTH, validateSingleProfileAlias } from '@misub/core/domain/profile-alias.js';
import { normalizeSubPath } from '@misub/core/domain/reserved-paths.js';
import { isValidHttpUrlString } from '@misub/core/utils/url-validators.js';

interface ToggleOption {
  label: string;
  value: boolean | null;
}

interface ProfileFormUiText {
  prefixTitle?: string;
  manualPrefixLabel?: string;
  manualPrefixToggle?: string;
  subscriptionPrefixToggle?: string;
  enable?: string;
  disable?: string;
  [key: string]: string | undefined;
}

type ProfileGlobalSettings = Partial<AppSettingsConfig>;

type SubconverterFlagKey = 'udp' | 'emoji' | 'scv' | 'sort' | 'tfo' | 'list';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    localProfile: EditableProfile;
    showAdvanced?: boolean;
    showPortal?: boolean;
    showMultiSocks?: boolean;
    uiText: ProfileFormUiText;
    prefixToggleOptions?: ToggleOption[];
    tagPrefixToggleOptions?: ToggleOption[];
    globalSettings?: ProfileGlobalSettings;
    profileTags?: string[];
    originalCustomId?: string;
  }>(),
  {
    showAdvanced: false,
    showPortal: false,
    showMultiSocks: false,
    prefixToggleOptions: () => [],
    tagPrefixToggleOptions: () => [],
    globalSettings: () => ({}),
    profileTags: () => [],
    originalCustomId: '',
  },
);

const emit = defineEmits<{
  'toggle-advanced': [];
  'toggle-portal': [];
  'toggle-multi-socks': [];
  'update:localProfile': [value: EditableProfile];
}>();

const updateLocalProfile = (patch: Partial<EditableProfile>) => {
  emit('update:localProfile', {
    ...props.localProfile,
    ...patch,
  });
};

const updatePrefixSettings = (patch: NonNullable<EditableProfile['prefixSettings']>) => {
  updateLocalProfile({
    prefixSettings: {
      ...props.localProfile.prefixSettings,
      ...patch,
    },
  });
};

const updateSubconverter = (patch: Partial<NonNullable<EditableProfile['subconverter']>>) => {
  updateLocalProfile({
    subconverter: {
      ...props.localProfile.subconverter,
      ...patch,
    },
  });
};

const updateSubconverterOption = (key: SubconverterFlagKey, value: boolean | null) => {
  updateSubconverter({
    options: {
      ...props.localProfile.subconverter?.options,
      [key]: value,
    },
  });
};

const visualSettingsModel = computed<EditableProfile & { builtinTransform?: BuiltinTransformConfig }>({
  get: () => props.localProfile as EditableProfile & { builtinTransform?: BuiltinTransformConfig },
  set: (value) => {
    emit('update:localProfile', value);
  },
});

const activePinia = getActivePinia();
const dataStore = activePinia ? useDataStore() : null;
const ruleTemplates = dataStore
  ? (storeToRefs(dataStore).ruleTemplates as Ref<RuleTemplate[]>)
  : ref<RuleTemplate[]>([]);

onMounted(() => {
  void dataStore?.ensureRuleTemplatesLoaded?.();
});
const ruleTemplateCount = computed(() => (ruleTemplates.value || []).length);
const toastStore = activePinia ? useToastStore() : null;
const showToast = (msg: string, type: ToastType = 'info') => toastStore?.showToast?.(msg, type);

const customIdError = computed(() => {
  const currentAlias = normalizeProfileIdentifier(props.localProfile?.customId);
  if (!currentAlias) return '';
  const origAlias = normalizeProfileIdentifier(props.originalCustomId);
  const legacyExempt = Boolean(props.localProfile?.id && origAlias && origAlias === currentAlias);
  const check = validateSingleProfileAlias(currentAlias, {
    currentProfileId: props.localProfile?.id || '',
    profiles: dataStore?.profiles || [],
    legacyExempt,
  });
  if (check.valid) return '';
  if (check.code === 'duplicate') return t('profiles.customIdExists', { id: check.alias });
  if (check.code === 'too_long') return t('profiles.customIdTooLong', { max: PROFILE_ALIAS_MAX_LENGTH });
  if (check.code === 'invalid_chars') return t('profiles.customIdInvalidChars');
  if (check.code === 'reserved') return t('profiles.customIdReserved', { id: check.alias });
  return check.message || '';
});

const activeShareSuffix = computed(() => {
  const subPath = normalizeSubPath(props.globalSettings?.profileToken || '', 'sub');
  const identifier =
    getProfileShareIdentifier({
      id: props.localProfile?.id,
      customId: props.localProfile?.customId,
      linkId: props.localProfile?.linkId,
    }) || 'link-id';
  return `/${subPath}/${identifier}`;
});

const handleResetProfileLink = () => {
  const rotated = rotateProfileLinkId({
    id: props.localProfile?.id,
    customId: props.localProfile?.customId,
    linkId: props.localProfile?.linkId,
  });
  updateLocalProfile({
    linkId: rotated.linkId,
    customId: '',
  });
  showToast(t('profiles.linkResetPendingSave'), 'info');
};

const globalEngineLabel = computed(() => {
  const mode = props.globalSettings?.subconverter?.engineMode || 'builtin';
  return mode === 'external' ? t('profileModal.externalBackend') : t('profileModal.builtinEngine');
});

const isGlobalBuiltinAuto = computed(() => {
  const mode = props.globalSettings?.transformConfigMode || 'builtin';
  return mode === 'builtin' && !props.globalSettings?.builtinTransform?.visualRulesEnabled;
});

const globalConfigLabel = computed(() => {
  const mode = props.globalSettings?.transformConfigMode || 'builtin';
  if (mode === 'builtin') {
    return props.globalSettings?.builtinTransform?.visualRulesEnabled
      ? t('profileModal.visualRulesOption')
      : t('profileModal.builtinAutoRoute');
  }
  const url = props.globalSettings?.transformConfig || '';
  if (url.startsWith('custom:')) {
    const templateId = url.slice('custom:'.length);
    const tpl = (ruleTemplates.value || []).find((item) => item?.id === templateId);
    if (tpl?.name) return tpl.name;
  }
  const asset = getLocalizedTransformAssetByUrl(url, t) as { name?: string } | null;
  return asset?.name ? asset.name : url ? t('profileModal.customUrl') : t('profileModal.notSet');
});

const engineOptions = computed(() => [
  { value: 'builtin', label: t('profileModal.builtinScriptEngine') },
  { value: 'external', label: t('profileModal.externalBackendConvert') },
]);

const flagOptions = computed<Array<{ key: SubconverterFlagKey; label: string }>>(() => [
  { key: 'udp', label: t('profileModal.udpForward') },
  { key: 'emoji', label: t('profileModal.emojiSwitch') },
  { key: 'scv', label: t('profileModal.skipCert') },
  { key: 'sort', label: t('profileModal.nodeSort') },
  { key: 'tfo', label: 'TCP Fast Open' },
  { key: 'list', label: t('profileModal.outputList') },
]);

const expiryPresets = computed(() => [
  { label: t('profileModal.expiresPreset7d'), days: 7 },
  { label: t('profileModal.expiresPreset30d'), days: 30 },
  { label: t('profileModal.expiresPreset90d'), days: 90 },
  { label: t('profileModal.expiresPreset1y'), years: 1 },
]);

const selectedTransformAsset = ref<{ id?: string; name?: string; url?: string } | null>(null);
const showRuleTemplateModal = ref(false);

const isExternalEngine = computed(() => {
  const localMode = props.localProfile?.subconverter?.engineMode || '';
  if (localMode === 'external') return true;
  if (localMode === 'builtin') return false;
  return (props.globalSettings?.subconverter?.engineMode || 'builtin') === 'external';
});

function createInitialVisualTransformFromGlobal(): BuiltinTransformConfig {
  const source =
    props.globalSettings?.builtinTransform && typeof props.globalSettings.builtinTransform === 'object'
      ? props.globalSettings.builtinTransform
      : DEFAULT_BUILTIN_TRANSFORM;
  const normalized = normalizeBuiltinTransform(source);
  return {
    ...normalized,
    visualRulesEnabled: true,
    selectedRules: [...normalized.selectedRules],
    customRules: JSON.parse(JSON.stringify(normalized.customRules || [])),
  };
}

const ruleSourceSelection = computed({
  get: () => {
    const mode = props.localProfile?.transformConfigMode || 'global';
    if (mode === 'global') return 'global';
    if (mode === 'visual') return 'visual';
    if (mode === 'builtin') {
      const bt = props.localProfile?.builtinTransform as BuiltinTransformConfig | undefined;
      return bt?.visualRulesEnabled ? 'visual' : 'builtin';
    }
    // 兼容历史保存的 preset / custom / custom_template，全部统一归入「规则模板」
    return 'preset';
  },
  set: (val: string) => {
    const currentBuiltin =
      props.localProfile.builtinTransform && typeof props.localProfile.builtinTransform === 'object'
        ? (props.localProfile.builtinTransform as BuiltinTransformConfig)
        : null;

    if (val === 'global') {
      updateLocalProfile({
        transformConfigMode: 'global',
        ...(currentBuiltin ? { builtinTransform: { ...currentBuiltin, visualRulesEnabled: false } } : {}),
      });
      return;
    }
    if (val === 'visual') {
      const nextBuiltin = currentBuiltin
        ? { ...normalizeBuiltinTransform(currentBuiltin), visualRulesEnabled: true }
        : createInitialVisualTransformFromGlobal();
      updateLocalProfile({
        transformConfigMode: 'builtin',
        builtinTransform: nextBuiltin,
      });
      return;
    }
    if (val === 'builtin') {
      updateLocalProfile({
        transformConfigMode: 'builtin',
        ...(currentBuiltin ? { builtinTransform: { ...currentBuiltin, visualRulesEnabled: false } } : {}),
      });
      return;
    }
    updateLocalProfile({
      transformConfigMode: 'preset',
      ...(currentBuiltin ? { builtinTransform: { ...currentBuiltin, visualRulesEnabled: false } } : {}),
    });
  },
});

const isVisualMode = computed(() => ruleSourceSelection.value === 'visual' && !isExternalEngine.value);
const isTemplateMode = computed(() => ruleSourceSelection.value === 'preset');
const showRuleLevelSelector = computed(
  () =>
    !isExternalEngine.value &&
    (ruleSourceSelection.value === 'builtin' || (ruleSourceSelection.value === 'global' && isGlobalBuiltinAuto.value)),
);

function syncVisualRulesFromGlobal() {
  updateLocalProfile({ builtinTransform: createInitialVisualTransformFromGlobal() });
}

function handleRuleTemplatesSaved(savedTemplateId: string) {
  if (!isTemplateMode.value || !savedTemplateId) return;
  const current = String(props.localProfile.transformConfig || '').trim();
  const stillExists = (ruleTemplates.value || []).some(
    (item) => item && item.enabled !== false && `custom:${item.id}` === current,
  );
  if (!current || (current.startsWith('custom:') && !stillExists)) {
    updateLocalProfile({ transformConfig: `custom:${savedTemplateId}` });
  }
}

const globalPortalModeLabel = computed(() => {
  const mode = props.globalSettings?.subPortalMode || 'portal';
  if (mode === 'redirect') return t('profileModal.portalModeRedirect');
  if (mode === 'raw') return t('profileModal.portalModeRaw');
  return t('profileModal.portalModePortal');
});

const globalMultiSocksStartPort = computed(() => {
  const raw = Number(props.globalSettings?.defaultMultiSocksStartPort);
  return Number.isInteger(raw) && raw >= 1024 && raw <= 60000 ? raw : 42001;
});

const globalMultiSocksListen = computed(() =>
  props.globalSettings?.defaultMultiSocksListen === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
);

const globalMultiSocksLabel = computed(() =>
  props.globalSettings?.defaultMultiSocksEnabled ? t('profileModal.on') : t('profileModal.off'),
);

const portalRedirectUrlError = computed(() => {
  const val = String(props.localProfile?.portalRedirectUrl || '').trim();
  if (!val) return '';
  return isValidHttpUrlString(val) ? '' : t('profileModal.invalidHttpUrl');
});

const multiSocksStartPortError = computed(() => {
  const raw = props.localProfile?.multiSocksStartPort;
  if (raw === '' || raw === null || raw === undefined) return '';
  const num = Number(raw);
  return Number.isInteger(num) && num >= 1024 && num <= 60000 ? '' : t('profileModal.invalidPortRange');
});

const multiSocksMaxPortsError = computed(() => {
  const raw = props.localProfile?.multiSocksMaxPorts;
  if (raw === '' || raw === null || raw === undefined) return '';
  const num = Number(raw);
  return Number.isInteger(num) && num >= 1 && num <= 65535 ? '' : t('profileModal.invalidMaxPortsRange');
});

const effectiveStartPortPreview = computed(() => {
  const raw = props.localProfile?.multiSocksStartPort;
  if (raw !== '' && raw !== null && raw !== undefined) {
    const num = Number(raw);
    if (Number.isInteger(num) && num >= 1024 && num <= 60000) return num;
  }
  return globalMultiSocksStartPort.value;
});

const effectiveListenPreview = computed(() =>
  props.localProfile?.multiSocksListen === '127.0.0.1' || props.localProfile?.multiSocksListen === '0.0.0.0'
    ? props.localProfile.multiSocksListen
    : globalMultiSocksListen.value,
);

const effectiveMaxPortsPreview = computed(() => {
  const raw = props.localProfile?.multiSocksMaxPorts;
  if (raw !== '' && raw !== null && raw !== undefined) {
    const num = Number(raw);
    if (Number.isInteger(num) && num >= 1 && num <= 65535) return num;
  }
  return 300;
});

const effectiveMultiSocksEnabledPreview = computed(() => {
  if (typeof props.localProfile?.multiSocksEnabled === 'boolean') {
    return props.localProfile.multiSocksEnabled;
  }
  return Boolean(props.globalSettings?.defaultMultiSocksEnabled);
});

const subscriptionBasePreviewUrl = computed(() => {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://your-domain';
  return `${origin}${activeShareSuffix.value}`;
});

const subscriptionOverridePreviewUrl = computed(() => {
  return `${subscriptionBasePreviewUrl.value}?mode=multi-socks&startPort=${effectiveStartPortPreview.value}&listen=${effectiveListenPreview.value}`;
});

const enforceExternalSchemeConstraints = () => {
  const enabled = isExternalEngine.value;
  if (!enabled) return;

  const patch: Partial<EditableProfile> = {};
  if (
    props.localProfile.transformConfigMode === 'builtin' ||
    props.localProfile.transformConfigMode === 'visual' ||
    props.localProfile.transformConfigMode === 'custom_template'
  ) {
    patch.transformConfigMode = 'preset';
  }
  const currentBuiltin =
    props.localProfile.builtinTransform && typeof props.localProfile.builtinTransform === 'object'
      ? (props.localProfile.builtinTransform as BuiltinTransformConfig)
      : null;
  if (currentBuiltin?.visualRulesEnabled) {
    patch.builtinTransform = { ...currentBuiltin, visualRulesEnabled: false };
  }

  if (/^(builtin|custom):/.test(String(props.localProfile.transformConfig || ''))) {
    patch.transformConfig = '';
    selectedTransformAsset.value = null;
  }

  if (Object.keys(patch).length > 0) {
    updateLocalProfile(patch);
  }
};

watch(
  () => [
    isExternalEngine.value,
    props.localProfile,
    props.localProfile?.transformConfigMode,
    props.localProfile?.transformConfig,
    props.localProfile?.subconverter?.engineMode,
  ],
  enforceExternalSchemeConstraints,
  { immediate: true },
);
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div>
      <Input
        id="profile-name"
        :model-value="localProfile.name"
        :label="t('profiles.nameLabel')"
        :placeholder="t('profiles.namePlaceholder')"
        @update:model-value="updateLocalProfile({ name: String($event ?? '') })"
      />
    </div>
    <div>
      <Input
        id="profile-custom-id"
        :model-value="localProfile.customId"
        :error="customIdError"
        :label="t('profiles.customIdLabel')"
        :placeholder="t('profiles.customIdPlaceholder')"
        @update:model-value="updateLocalProfile({ customId: String($event ?? '') })"
      >
        <template #suffix>
          <ConfirmPopover
            :confirm-text="t('profiles.resetLinkConfirmAction')"
            :description="t('profiles.resetLinkConfirmDesc')"
            :title="t('profiles.resetLinkConfirmTitle')"
            @confirm="handleResetProfileLink"
          >
            <template #trigger="{ toggle }">
              <button
                :aria-label="t('profiles.resetLinkTitle')"
                :title="t('profiles.resetLinkTitle')"
                class="flex h-6 w-6 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg transition-colors"
                data-testid="reset-profile-link-btn"
                type="button"
                @click.stop="toggle"
              >
                <RotateCcw class="h-3.5 w-3.5" />
              </button>
            </template>
          </ConfirmPopover>
        </template>
      </Input>
      <p class="text-xs text-fg-subtle mt-1">
        {{ t('profiles.customIdHint') }}
        <span class="font-mono text-fg-muted ml-1">({{ activeShareSuffix }})</span>
      </p>
    </div>
  </div>

  <div class="mt-4">
    <label class="block text-xs font-medium text-fg-muted mb-1.5">
      {{ t('profiles.tagsLabel') }}
    </label>
    <TagInput
      :model-value="localProfile.tags"
      :placeholder="t('profiles.tagsPlaceholder')"
      :suggestions="profileTags"
      @update:model-value="updateLocalProfile({ tags: $event })"
    />
  </div>

  <div class="bg-transparent rounded-md p-4 border border-line mt-4">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center">
        <input
          id="profile-is-public"
          :checked="Boolean(localProfile.isPublic)"
          class="h-4 w-4 rounded-sm border-line-strong bg-inset text-fg focus:ring-0"
          type="checkbox"
          @change="updateLocalProfile({ isPublic: ($event.target as HTMLInputElement).checked })"
        />
        <label class="ml-2 block text-xs font-medium text-fg" for="profile-is-public">
          {{ t('profiles.publicDisplay') }}
        </label>
      </div>
      <span
        v-if="localProfile.isPublic"
        class="inline-flex items-center gap-1.5 text-xs text-fg-muted border border-line bg-transparent px-2 py-0.5 rounded-md"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
        <span>{{ t('profiles.publicVisible') }}</span>
      </span>
    </div>

    <div v-if="localProfile.isPublic" class="animate-fade-in-down space-y-3">
      <Textarea
        id="profile-description"
        :model-value="localProfile.description"
        :placeholder="t('profiles.descriptionPlaceholder')"
        class="px-3 py-2 text-xs text-fg placeholder:text-fg-subtle"
        rows="2"
        wrapperClass="focus-within:border-line-strong focus-within:ring-0"
        @update:model-value="updateLocalProfile({ description: String($event ?? '') })"
      />
      <div v-if="globalSettings?.shortLink?.enabled || localProfile.shortLink">
        <Input
          id="profile-short-link"
          :model-value="localProfile.shortLink"
          :label="t('profiles.shortLinkLabel')"
          :placeholder="t('profiles.shortLinkPlaceholder')"
          @update:model-value="updateLocalProfile({ shortLink: String($event ?? '') })"
        />
        <p class="text-xs text-fg-subtle mt-1">
          {{ t('profiles.shortLinkHint') }}
        </p>
      </div>
    </div>
    <div v-else class="text-xs text-fg-subtle">
      {{ t('profiles.publicDisplayHint') }}
    </div>
  </div>

  <div class="rounded-md border border-line bg-transparent mt-4 overflow-hidden">
    <button
      :aria-expanded="showAdvanced"
      class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-hover/40 focus-visible:outline-hidden"
      type="button"
      @click="emit('toggle-advanced')"
    >
      <div class="flex min-w-0 items-center gap-2.5">
        <SlidersHorizontal class="h-3.5 w-3.5 shrink-0 text-fg-muted" />
        <span class="text-xs font-medium text-fg shrink-0">{{ t('profiles.advancedTitle') }}</span>
        <span class="hidden sm:inline truncate text-xs text-fg-subtle">{{ t('profiles.advancedDesc') }}</span>
      </div>
      <ChevronDown
        :class="{ 'rotate-180 text-fg': showAdvanced }"
        class="h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200"
      />
    </button>

    <div v-show="showAdvanced" class="border-t border-line p-4 space-y-6 animate-fade-in-down">
      <!-- === 区块 A：渲染核心配置 (Core Logic) === -->
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-fg">
            {{ t('profileModal.coreConfig') }}
          </h3>
          <span class="text-xs text-fg-subtle">{{ t('profileModal.coreConfigDesc') }}</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-transparent p-4 border border-line rounded-md shadow-none">
          <!-- 引擎选择 -->
          <div class="space-y-1.5">
            <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.engineLabel') }}</label>
            <Select
              :model-value="localProfile.subconverter?.engineMode ?? ''"
              :options="[{ value: '', label: t('profileModal.followGlobalConfig') }, ...engineOptions]"
              size="sm"
              @update:model-value="updateSubconverter({ engineMode: ($event as '' | 'builtin' | 'external') ?? '' })"
            />
            <div v-if="(localProfile.subconverter?.engineMode ?? '') === ''" class="flex items-center gap-1.5 mt-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
              <span class="text-xs text-fg-muted">
                {{ t('profileModal.currentGlobal', { value: globalEngineLabel }) }}
              </span>
            </div>
          </div>

          <!-- 方案选择（与设置页三合一对齐：跟随全局 / 内置自动分流 / 内置可视化规则 / 规则模板） -->
          <div class="space-y-1.5">
            <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.schemeLabel') }}</label>
            <Select
              v-model="ruleSourceSelection"
              :options="[
                { value: 'global', label: t('profileModal.followGlobalScheme') },
                {
                  value: 'builtin',
                  label: t('profileModal.builtinAutoRoute'),
                  disabled: isExternalEngine,
                },
                {
                  value: 'visual',
                  label: t('profileModal.visualRulesOption'),
                  disabled: isExternalEngine,
                },
                {
                  value: 'preset',
                  label: t('profileModal.templateUnified'),
                },
              ]"
              size="sm"
            />
            <p v-if="isExternalEngine" class="mt-1 text-xs leading-relaxed text-fg-muted">
              {{ t('profileModal.externalEngineHint') }}
            </p>
            <div v-if="ruleSourceSelection === 'global'" class="flex items-center gap-1.5 mt-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
              <span class="text-xs text-fg-muted">
                {{ t('profileModal.currentGlobal', { value: globalConfigLabel }) }}
              </span>
            </div>
          </div>

          <!-- 引擎为第三方时的 URL 输入 -->
          <div v-if="isExternalEngine" class="sm:col-span-2 animate-fade-in-down border-t border-line pt-3">
            <label class="block text-xs font-medium text-fg-muted mb-1.5">{{
              t('profileModal.backendOverride')
            }}</label>
            <input
              :value="localProfile.subconverter?.backend ?? ''"
              :placeholder="t('profileModal.backendPlaceholder')"
              class="block w-full px-3 py-2 bg-inset border border-line rounded-md font-mono text-xs text-fg placeholder:text-fg-subtle focus:border-line-strong focus-visible:outline-hidden"
              type="text"
              @input="updateSubconverter({ backend: ($event.target as HTMLInputElement).value })"
            />
            <p class="mt-1.5 text-xs leading-relaxed text-fg-subtle">
              {{ t('profileModal.backendHint') }}
            </p>
            <div v-if="!localProfile.subconverter?.backend" class="flex items-center gap-1.5 mt-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
              <span class="text-xs text-fg-muted">
                {{
                  t('profileModal.currentGlobal', {
                    value: globalSettings?.subconverter?.defaultBackend || t('profileModal.notSet'),
                  })
                }}
              </span>
            </div>
          </div>

          <!-- 内置自动分流：紧跟规则方案展示「分流粒度」 -->
          <div v-if="showRuleLevelSelector" class="sm:col-span-2 animate-fade-in-down border-t border-line pt-3">
            <label class="block text-xs font-medium text-fg-muted mb-1.5">{{ t('profileModal.ruleLevelLabel') }}</label>
            <Select
              :model-value="localProfile.ruleLevel ?? ''"
              :options="[
                { value: '', label: t('profileModal.followGlobalLevel') },
                { value: 'base', label: t('profileModal.ruleBase') },
                { value: 'std', label: t('profileModal.ruleStandard') },
                { value: 'full', label: t('profileModal.ruleFull') },
                { value: 'relay', label: t('profileModal.ruleRelay') },
              ]"
              size="sm"
              @update:model-value="updateLocalProfile({ ruleLevel: String($event ?? '') })"
            />
          </div>

          <!-- 内置可视化规则：复用 VisualTransformCard (section="rules") -->
          <div v-if="isVisualMode" class="sm:col-span-2 animate-fade-in-down border-t border-line pt-4 space-y-3">
            <div class="flex items-center justify-end">
              <button
                class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                data-testid="sync-global-visual-rules"
                type="button"
                @click="syncVisualRulesFromGlobal"
              >
                <RotateCcw class="h-3 w-3" />
                <span>{{ t('profileModal.syncGlobalVisualRules') }}</span>
              </button>
            </div>
            <VisualTransformCard v-model:settings="visualSettingsModel" section="rules" />
          </div>

          <!-- 规则模板：统一支持预设 / 自定义模板 / 远程 URL，与设置页一致 -->
          <div v-if="isTemplateMode" class="sm:col-span-2 animate-fade-in-down border-t border-line pt-3">
            <div class="mb-1.5 flex items-center justify-between gap-2">
              <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.templateLabel') }}</label>
              <button
                v-if="!isExternalEngine"
                class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                type="button"
                @click="showRuleTemplateModal = true"
              >
                <SlidersHorizontal class="h-3 w-3" />
                <span>{{
                  ruleTemplateCount > 0
                    ? t('settings.ruleTemplatesManageWithCount', { count: ruleTemplateCount })
                    : t('settings.ruleTemplatesManage')
                }}</span>
              </button>
            </div>
            <TransformSelector
              :model-value="localProfile.transformConfig"
              :allowEmpty="false"
              :custom-placeholder="t('profileModal.remoteTemplatePlaceholder')"
              :custom-templates-only="false"
              :exclude-builtin-assets="isExternalEngine"
              :force-custom="false"
              :placeholder="t('profileModal.presetPlaceholder')"
              type="config"
              @select-asset="selectedTransformAsset = $event"
              @update:model-value="updateLocalProfile({ transformConfig: String($event ?? '') })"
            />
            <RuleTemplateModal
              v-if="showRuleTemplateModal"
              v-model:show="showRuleTemplateModal"
              @saved="handleRuleTemplatesSaved"
            />
          </div>
        </div>
      </div>

      <!-- === 区块 B：参数微调与后处理 (Parameter Tuning) === -->
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-fg">
            {{ t('profileModal.tuningTitle') }}
          </h3>
          <span class="text-xs text-fg-subtle">{{ t('profileModal.tuningDesc') }}</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-transparent p-4 border border-line rounded-md shadow-none">
          <!-- 到期时间 -->
          <div>
            <label class="block text-xs font-medium text-fg-muted mb-1.5">{{ t('profileModal.expiresLabel') }}</label>
            <DatePicker
              :model-value="localProfile.expiresAt"
              :aria-label="t('profileModal.expiresLabel')"
              :placeholder="t('profileModal.expiresPlaceholder')"
              :presets="expiryPresets"
              size="sm"
              @update:model-value="updateLocalProfile({ expiresAt: $event })"
            />
          </div>

          <!-- 最小拉取间隔（分钟） -->
          <div>
            <label class="block text-xs font-medium text-fg-muted mb-1.5">{{
              t('profileModal.fetchMinIntervalLabel')
            }}</label>
            <input
              :value="localProfile.fetchMinInterval ?? ''"
              :placeholder="t('profileModal.fetchMinIntervalPlaceholder')"
              class="block h-8 w-full px-2.5 bg-inset border border-line rounded-md font-mono text-xs text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-line-strong focus-visible:outline-hidden transition-colors duration-200"
              max="1440"
              min="0"
              type="number"
              @input="updateLocalProfile({ fetchMinInterval: ($event.target as HTMLInputElement).value })"
            />
          </div>

          <!-- 超频处理方式 -->
          <div>
            <label class="block text-xs font-medium text-fg-muted mb-1.5">{{
              t('profileModal.fetchLimitModeLabel')
            }}</label>
            <Select
              :model-value="localProfile.fetchLimitMode ?? ''"
              :options="[
                { value: '', label: t('profileModal.followGlobal') },
                { value: 'cache', label: t('profileModal.fetchLimitCache') },
                { value: 'strict', label: t('profileModal.fetchLimitStrict') },
              ]"
              size="sm"
              @update:model-value="updateLocalProfile({ fetchLimitMode: ($event as '' | 'cache' | 'strict') ?? '' })"
            />
          </div>

          <!-- 节点前缀设置 (合并) -->
          <div class="sm:col-span-2 space-y-3 pt-3 border-t border-line">
            <label class="block text-xs font-semibold text-fg-muted uppercase tracking-wider">{{
              t('profileModal.nodeNameVisibility')
            }}</label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- 手动节点文本前缀 -->
              <Input
                :model-value="localProfile.prefixSettings?.manualNodePrefix ?? ''"
                :label="t('profileModal.manualPrefixText')"
                :placeholder="t('profileModal.followGlobalEmpty')"
                size="sm"
                @update:model-value="updatePrefixSettings({ manualNodePrefix: String($event ?? '') })"
              />

              <!-- {{ t('profileModal.manualNodeDisplay') }}开关 -->
              <div class="space-y-1">
                <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.manualNodeDisplay') }}</label>
                <Select
                  :model-value="localProfile.prefixSettings?.enableManualNodes ?? null"
                  :options="prefixToggleOptions"
                  size="sm"
                  @update:model-value="updatePrefixSettings({ enableManualNodes: $event as boolean | null })"
                />
              </div>

              <!-- 机场订阅展示开关 (自动机场名) -->
              <div class="space-y-1">
                <label class="block text-xs font-medium text-fg-muted">{{
                  t('profileModal.subscriptionPrefix')
                }}</label>
                <Select
                  :model-value="localProfile.prefixSettings?.enableSubscriptions ?? null"
                  :options="prefixToggleOptions"
                  size="sm"
                  @update:model-value="updatePrefixSettings({ enableSubscriptions: $event as boolean | null })"
                />
              </div>

              <!-- 首个标签前缀开关 -->
              <div class="space-y-1">
                <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.tagPrefix') }}</label>
                <Select
                  :model-value="localProfile.prefixSettings?.prependTagName ?? null"
                  :options="tagPrefixToggleOptions"
                  size="sm"
                  @update:model-value="updatePrefixSettings({ prependTagName: $event as boolean | null })"
                />
              </div>
            </div>
          </div>

          <!-- 第三方开关 (仅第三方引擎显示) -->
          <div v-if="isExternalEngine" class="sm:col-span-2 animate-fade-in-down mt-2">
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div
                v-for="flag in flagOptions"
                :key="flag.key"
                class="flex flex-col gap-1.5 p-2 bg-transparent rounded-md border border-line"
              >
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-semibold text-fg-muted uppercase">{{ flag.label }}</span>
                </div>
                <Select
                  :model-value="localProfile.subconverter?.options?.[flag.key] ?? null"
                  :options="[
                    { value: null, label: t('profileModal.followGlobal') },
                    { value: true, label: t('profileModal.on') },
                    { value: false, label: t('profileModal.off') },
                  ]"
                  size="xs"
                  @update:model-value="updateSubconverterOption(flag.key, $event as boolean | null)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- === 区块 C：处理管道 (Process Workflow) === -->
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-fg">
            {{ t('profileModal.pipelineTitle') }}
          </h3>
          <span class="text-xs text-fg-subtle">{{ t('profileModal.pipelineDesc') }}</span>
        </div>

        <OperatorChain
          :model-value="localProfile.operators || []"
          @update:model-value="updateLocalProfile({ operators: $event })"
        />
      </div>
    </div>
  </div>

  <!-- === 浏览器访问与门户配置折叠区 === -->
  <div class="rounded-md border border-line bg-transparent mt-4 overflow-hidden">
    <button
      :aria-expanded="showPortal"
      class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-hover/40 focus-visible:outline-hidden"
      data-testid="toggle-portal-btn"
      type="button"
      @click="emit('toggle-portal')"
    >
      <div class="flex min-w-0 items-center gap-2.5">
        <Globe class="h-3.5 w-3.5 shrink-0 text-fg-muted" />
        <span class="text-xs font-medium text-fg shrink-0">{{ t('profileModal.portalSectionTitle') }}</span>
        <span class="hidden sm:inline truncate text-xs text-fg-subtle">{{
          t('profileModal.portalSectionDesc')
        }}</span>
      </div>
      <ChevronDown
        :class="{ 'rotate-180 text-fg': showPortal }"
        class="h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200"
      />
    </button>

    <div v-show="showPortal" class="border-t border-line p-4 space-y-4 animate-fade-in-down">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- 浏览器打开行为 -->
        <div class="space-y-1.5">
          <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.portalModeLabel') }}</label>
          <Select
            :model-value="localProfile.portalMode ?? 'inherit'"
            :options="[
              { value: 'inherit', label: t('profileModal.portalModeInherit') },
              { value: 'portal', label: t('profileModal.portalModePortal') },
              { value: 'redirect', label: t('profileModal.portalModeRedirect') },
              { value: 'raw', label: t('profileModal.portalModeRaw') },
            ]"
            size="sm"
            @update:model-value="
              updateLocalProfile({ portalMode: ($event as 'inherit' | 'portal' | 'redirect' | 'raw') ?? 'inherit' })
            "
          />
          <div v-if="(localProfile.portalMode ?? 'inherit') === 'inherit'" class="flex items-center gap-1.5 mt-1">
            <span class="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
            <span class="text-xs text-fg-muted">
              {{ t('profileModal.currentGlobal', { value: globalPortalModeLabel }) }}
            </span>
          </div>
        </div>

        <!-- 自定义跳转网址 -->
        <div>
          <Input
            id="profile-portal-redirect-url"
            :error="portalRedirectUrlError"
            :label="t('profileModal.portalRedirectUrlLabel')"
            :model-value="localProfile.portalRedirectUrl ?? ''"
            :placeholder="t('profileModal.portalRedirectUrlPlaceholder')"
            size="sm"
            type="url"
            @update:model-value="updateLocalProfile({ portalRedirectUrl: String($event ?? '') })"
          />
        </div>

        <!-- 单订阅组专属公告 -->
        <div class="sm:col-span-2">
          <label class="block text-xs font-medium text-fg-muted mb-1.5" for="profile-portal-notice">
            {{ t('profileModal.portalNoticeLabel') }}
          </label>
          <Textarea
            id="profile-portal-notice"
            :model-value="localProfile.portalNotice ?? ''"
            :placeholder="t('profileModal.portalNoticePlaceholder')"
            class="px-3 py-2 text-xs text-fg placeholder:text-fg-subtle"
            rows="2"
            @update:model-value="updateLocalProfile({ portalNotice: String($event ?? '') })"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- === Mihomo 多端口 SOCKS5 出站折叠配置区 === -->
  <div class="rounded-md border border-line bg-transparent mt-3 overflow-hidden">
    <button
      :aria-expanded="showMultiSocks"
      class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-hover/40 focus-visible:outline-hidden"
      data-testid="toggle-multisocks-btn"
      type="button"
      @click="emit('toggle-multi-socks')"
    >
      <div class="flex min-w-0 items-center gap-2.5">
        <Network class="h-3.5 w-3.5 shrink-0 text-fg-muted" />
        <span class="text-xs font-medium text-fg shrink-0">{{ t('profileModal.multiSocksSectionTitle') }}</span>
        <span class="hidden sm:inline truncate text-xs text-fg-subtle">{{
          t('profileModal.multiSocksSectionDesc')
        }}</span>
      </div>
      <ChevronDown
        :class="{ 'rotate-180 text-fg': showMultiSocks }"
        class="h-4 w-4 shrink-0 text-fg-muted transition-transform duration-200"
      />
    </button>

    <div v-show="showMultiSocks" class="border-t border-line p-4 space-y-4 animate-fade-in-down">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- 多端口 SOCKS5 开关 -->
        <div class="space-y-1.5">
          <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.multiSocksEnabledLabel') }}</label>
          <Select
            :model-value="localProfile.multiSocksEnabled ?? null"
            :options="[
              { value: null, label: t('profileModal.followGlobal') },
              { value: true, label: t('profileModal.on') },
              { value: false, label: t('profileModal.off') },
            ]"
            size="sm"
            @update:model-value="updateLocalProfile({ multiSocksEnabled: ($event as boolean | null) ?? null })"
          />
          <div
            v-if="localProfile.multiSocksEnabled === null || localProfile.multiSocksEnabled === undefined"
            class="flex items-center gap-1.5 mt-1"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
            <span class="text-xs text-fg-muted">
              {{ t('profileModal.currentGlobal', { value: globalMultiSocksLabel }) }}
            </span>
          </div>
        </div>

        <!-- 监听地址 -->
        <div class="space-y-1.5">
          <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.multiSocksListenLabel') }}</label>
          <Select
            :model-value="localProfile.multiSocksListen ?? ''"
            :options="[
              { value: '', label: t('profileModal.multiSocksListenInherit', { listen: globalMultiSocksListen }) },
              { value: '127.0.0.1', label: '127.0.0.1' },
              { value: '0.0.0.0', label: '0.0.0.0' },
            ]"
            size="sm"
            @update:model-value="
              updateLocalProfile({ multiSocksListen: ($event as '' | '127.0.0.1' | '0.0.0.0') ?? '' })
            "
          />
        </div>

        <!-- 起始端口 -->
        <div>
          <Input
            id="profile-multisocks-start-port"
            :error="multiSocksStartPortError"
            :label="t('profileModal.multiSocksStartPortLabel')"
            :model-value="localProfile.multiSocksStartPort ?? ''"
            :placeholder="t('profileModal.multiSocksStartPortPlaceholder', { port: globalMultiSocksStartPort })"
            size="sm"
            type="number"
            @update:model-value="updateLocalProfile({ multiSocksStartPort: String($event ?? '') })"
          />
        </div>

        <!-- 最大端口数 -->
        <div>
          <Input
            id="profile-multisocks-max-ports"
            :error="multiSocksMaxPortsError"
            :label="t('profileModal.multiSocksMaxPortsLabel')"
            :model-value="localProfile.multiSocksMaxPorts ?? ''"
            :placeholder="t('profileModal.multiSocksMaxPortsPlaceholder')"
            size="sm"
            type="number"
            @update:model-value="updateLocalProfile({ multiSocksMaxPorts: String($event ?? '') })"
          />
        </div>

        <!-- 可选鉴权账号密码 -->
        <div>
          <Input
            id="profile-multisocks-username"
            :label="t('profileModal.multiSocksUsernameLabel')"
            :model-value="localProfile.multiSocksUsername ?? ''"
            :placeholder="t('profileModal.multiSocksUsernamePlaceholder')"
            size="sm"
            @update:model-value="updateLocalProfile({ multiSocksUsername: String($event ?? '') })"
          />
        </div>
        <div>
          <Input
            id="profile-multisocks-password"
            :label="t('profileModal.multiSocksPasswordLabel')"
            :model-value="localProfile.multiSocksPassword ?? ''"
            :placeholder="t('profileModal.multiSocksPasswordPlaceholder')"
            size="sm"
            type="text"
            @update:model-value="updateLocalProfile({ multiSocksPassword: String($event ?? '') })"
          />
        </div>
      </div>

      <!-- 实时订阅地址与多端口参数预览 -->
      <div class="rounded-md border border-line bg-inset/60 p-3 space-y-1.5">
        <p class="text-xs font-medium text-fg">{{ t('profileModal.subscriptionPreviewLabel') }}</p>
        <p class="font-mono text-xs text-fg-muted break-all">{{ subscriptionBasePreviewUrl }}</p>
        <p v-if="effectiveMultiSocksEnabledPreview" class="text-xs text-emerald-500 dark:text-emerald-400">
          {{
            t('profileModal.subscriptionPreviewMultiSocksHint', {
              listen: effectiveListenPreview,
              start: effectiveStartPortPreview,
              max: effectiveMaxPortsPreview,
            })
          }}
        </p>
        <p class="font-mono text-xs text-fg-subtle break-all">
          {{ t('profileModal.subscriptionPreviewTempOverrideHint', { url: subscriptionOverridePreviewUrl }) }}
        </p>
      </div>
    </div>
  </div>
</template>
