<script setup>
import { computed, ref, watch } from 'vue';
import { ChevronDown, RotateCcw, SlidersHorizontal } from '@lucide/vue';
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
import { useToastStore } from '@/stores/useToastStore.js';
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

const { t } = useI18n();

const props = defineProps({
  localProfile: {
    type: Object,
    required: true,
  },
  showAdvanced: {
    type: Boolean,
    default: false,
  },
  uiText: {
    type: Object,
    required: true,
  },
  prefixToggleOptions: {
    type: Array,
    default: () => [],
  },
  tagPrefixToggleOptions: {
    type: Array,
    default: () => [],
  },
  globalSettings: {
    type: Object,
    default: () => ({}),
  },
  profileTags: {
    type: Array,
    default: () => [],
  },
  originalCustomId: {
    type: String,
    default: '',
  },
});

const activePinia = getActivePinia();
const dataStore = activePinia ? useDataStore() : null;
const ruleTemplates = activePinia ? storeToRefs(dataStore).ruleTemplates : ref([]);
const ruleTemplateCount = computed(() => (ruleTemplates.value || []).length);
const toastStore = activePinia ? useToastStore() : null;
const showToast = (msg, type) => toastStore?.showToast?.(msg, type);

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
  const subPath = normalizeSubPath(props.globalSettings?.profileToken, 'sub');
  const identifier = getProfileShareIdentifier(props.localProfile) || 'link-id';
  return `/${subPath}/${identifier}`;
});

const handleResetProfileLink = () => {
  const rotated = rotateProfileLinkId(props.localProfile);
  props.localProfile.linkId = rotated.linkId;
  props.localProfile.customId = '';
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
  const asset = getLocalizedTransformAssetByUrl(url, t);
  return asset ? asset.name : url ? t('profileModal.customUrl') : t('profileModal.notSet');
});

const engineOptions = computed(() => [
  { value: 'builtin', label: t('profileModal.builtinScriptEngine') },
  { value: 'external', label: t('profileModal.externalBackendConvert') },
]);

const flagOptions = computed(() => [
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

const selectedTransformAsset = ref(null);
const showRuleTemplateModal = ref(false);

const isExternalEngine = computed(() => {
  const localMode = props.localProfile?.subconverter?.engineMode || '';
  if (localMode === 'external') return true;
  if (localMode === 'builtin') return false;
  return (props.globalSettings?.subconverter?.engineMode || 'builtin') === 'external';
});

function createInitialVisualTransformFromGlobal() {
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
      return props.localProfile?.builtinTransform?.visualRulesEnabled ? 'visual' : 'builtin';
    }
    // 兼容历史保存的 preset / custom / custom_template，全部统一归入「规则模板」
    return 'preset';
  },
  set: (val) => {
    if (val === 'global') {
      props.localProfile.transformConfigMode = 'global';
      if (props.localProfile.builtinTransform && typeof props.localProfile.builtinTransform === 'object') {
        props.localProfile.builtinTransform.visualRulesEnabled = false;
      }
      return;
    }
    if (val === 'visual') {
      props.localProfile.transformConfigMode = 'builtin';
      if (!props.localProfile.builtinTransform || typeof props.localProfile.builtinTransform !== 'object') {
        props.localProfile.builtinTransform = createInitialVisualTransformFromGlobal();
      } else {
        Object.assign(
          props.localProfile.builtinTransform,
          normalizeBuiltinTransform(props.localProfile.builtinTransform),
        );
        props.localProfile.builtinTransform.visualRulesEnabled = true;
      }
      return;
    }
    if (val === 'builtin') {
      props.localProfile.transformConfigMode = 'builtin';
      if (props.localProfile.builtinTransform && typeof props.localProfile.builtinTransform === 'object') {
        props.localProfile.builtinTransform.visualRulesEnabled = false;
      }
      return;
    }
    props.localProfile.transformConfigMode = 'preset';
    if (props.localProfile.builtinTransform && typeof props.localProfile.builtinTransform === 'object') {
      props.localProfile.builtinTransform.visualRulesEnabled = false;
    }
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
  props.localProfile.builtinTransform = createInitialVisualTransformFromGlobal();
}

function handleRuleTemplatesSaved(savedTemplateId) {
  if (!isTemplateMode.value || !savedTemplateId) return;
  const current = String(props.localProfile.transformConfig || '').trim();
  const stillExists = (ruleTemplates.value || []).some(
    (item) => item && item.enabled !== false && `custom:${item.id}` === current,
  );
  if (!current || (current.startsWith('custom:') && !stillExists)) {
    props.localProfile.transformConfig = `custom:${savedTemplateId}`;
  }
}

const emit = defineEmits(['toggle-advanced']);

const enforceExternalSchemeConstraints = () => {
  const enabled = isExternalEngine.value;
  if (!enabled) return;

  if (
    props.localProfile.transformConfigMode === 'builtin' ||
    props.localProfile.transformConfigMode === 'visual' ||
    props.localProfile.transformConfigMode === 'custom_template'
  ) {
    props.localProfile.transformConfigMode = 'preset';
  }
  if (props.localProfile.builtinTransform && typeof props.localProfile.builtinTransform === 'object') {
    props.localProfile.builtinTransform.visualRulesEnabled = false;
  }

  if (/^(builtin|custom):/.test(String(props.localProfile.transformConfig || ''))) {
    props.localProfile.transformConfig = '';
    selectedTransformAsset.value = null;
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
        v-model="localProfile.name"
        :label="t('profiles.nameLabel')"
        :placeholder="t('profiles.namePlaceholder')"
      />
    </div>
    <div>
      <Input
        id="profile-custom-id"
        v-model="localProfile.customId"
        :error="customIdError"
        :label="t('profiles.customIdLabel')"
        :placeholder="t('profiles.customIdPlaceholder')"
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
    <TagInput v-model="localProfile.tags" :placeholder="t('profiles.tagsPlaceholder')" :suggestions="profileTags" />
  </div>

  <div class="bg-transparent rounded-md p-4 border border-line mt-4">
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center">
        <input
          id="profile-is-public"
          v-model="localProfile.isPublic"
          class="h-4 w-4 rounded-sm border-line-strong bg-inset text-fg focus:ring-0"
          type="checkbox"
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
        v-model="localProfile.description"
        :placeholder="t('profiles.descriptionPlaceholder')"
        class="px-3 py-2 text-xs text-fg placeholder:text-fg-subtle"
        rows="2"
        wrapperClass="focus-within:border-line-strong focus-within:ring-0"
      />
      <div v-if="globalSettings?.shortLink?.enabled || localProfile.shortLink">
        <Input
          id="profile-short-link"
          v-model="localProfile.shortLink"
          :label="t('profiles.shortLinkLabel')"
          :placeholder="t('profiles.shortLinkPlaceholder')"
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
              v-model="localProfile.subconverter.engineMode"
              :options="[{ value: '', label: t('profileModal.followGlobalConfig') }, ...engineOptions]"
              size="sm"
            />
            <div v-if="localProfile.subconverter.engineMode === ''" class="flex items-center gap-1.5 mt-1.5">
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
              v-model="localProfile.subconverter.backend"
              :placeholder="t('profileModal.backendPlaceholder')"
              class="block w-full px-3 py-2 bg-inset border border-line rounded-md font-mono text-xs text-fg placeholder:text-fg-subtle focus:border-line-strong focus-visible:outline-hidden"
              type="text"
            />
            <p class="mt-1.5 text-xs leading-relaxed text-fg-subtle">
              {{ t('profileModal.backendHint') }}
            </p>
            <div v-if="!localProfile.subconverter.backend" class="flex items-center gap-1.5 mt-1.5">
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
              v-model="localProfile.ruleLevel"
              :options="[
                { value: '', label: t('profileModal.followGlobalLevel') },
                { value: 'base', label: t('profileModal.ruleBase') },
                { value: 'std', label: t('profileModal.ruleStandard') },
                { value: 'full', label: t('profileModal.ruleFull') },
                { value: 'relay', label: t('profileModal.ruleRelay') },
              ]"
              size="sm"
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
            <VisualTransformCard :settings="localProfile" section="rules" />
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
              v-model="localProfile.transformConfig"
              :allowEmpty="false"
              :custom-placeholder="t('profileModal.remoteTemplatePlaceholder')"
              :custom-templates-only="false"
              :exclude-builtin-assets="isExternalEngine"
              :force-custom="false"
              :placeholder="t('profileModal.presetPlaceholder')"
              type="config"
              @select-asset="selectedTransformAsset = $event"
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
              v-model="localProfile.expiresAt"
              :aria-label="t('profileModal.expiresLabel')"
              :placeholder="t('profileModal.expiresPlaceholder')"
              :presets="expiryPresets"
              size="sm"
            />
          </div>

          <!-- 最小拉取间隔（分钟） -->
          <div>
            <label class="block text-xs font-medium text-fg-muted mb-1.5">{{
              t('profileModal.fetchMinIntervalLabel')
            }}</label>
            <input
              v-model="localProfile.fetchMinInterval"
              :placeholder="t('profileModal.fetchMinIntervalPlaceholder')"
              class="block h-8 w-full px-2.5 bg-inset border border-line rounded-md font-mono text-xs text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-line-strong focus-visible:outline-hidden transition-colors duration-200"
              max="1440"
              min="0"
              type="number"
            />
          </div>

          <!-- 超频处理方式 -->
          <div>
            <label class="block text-xs font-medium text-fg-muted mb-1.5">{{
              t('profileModal.fetchLimitModeLabel')
            }}</label>
            <Select
              v-model="localProfile.fetchLimitMode"
              :options="[
                { value: '', label: t('profileModal.followGlobal') },
                { value: 'cache', label: t('profileModal.fetchLimitCache') },
                { value: 'strict', label: t('profileModal.fetchLimitStrict') },
              ]"
              size="sm"
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
                v-model="localProfile.prefixSettings.manualNodePrefix"
                :label="t('profileModal.manualPrefixText')"
                :placeholder="t('profileModal.followGlobalEmpty')"
                size="sm"
              />

              <!-- {{ t('profileModal.manualNodeDisplay') }}开关 -->
              <div class="space-y-1">
                <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.manualNodeDisplay') }}</label>
                <Select
                  v-model="localProfile.prefixSettings.enableManualNodes"
                  :options="prefixToggleOptions"
                  size="sm"
                />
              </div>

              <!-- 机场订阅展示开关 (自动机场名) -->
              <div class="space-y-1">
                <label class="block text-xs font-medium text-fg-muted">{{
                  t('profileModal.subscriptionPrefix')
                }}</label>
                <Select
                  v-model="localProfile.prefixSettings.enableSubscriptions"
                  :options="prefixToggleOptions"
                  size="sm"
                />
              </div>

              <!-- 首个标签前缀开关 -->
              <div class="space-y-1">
                <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.tagPrefix') }}</label>
                <Select
                  v-model="localProfile.prefixSettings.prependTagName"
                  :options="tagPrefixToggleOptions"
                  size="sm"
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
                  v-model="localProfile.subconverter.options[flag.key]"
                  :options="[
                    { value: null, label: t('profileModal.followGlobal') },
                    { value: true, label: t('profileModal.on') },
                    { value: false, label: t('profileModal.off') },
                  ]"
                  size="xs"
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

        <OperatorChain v-model="localProfile.operators" />
      </div>
    </div>
  </div>
</template>
