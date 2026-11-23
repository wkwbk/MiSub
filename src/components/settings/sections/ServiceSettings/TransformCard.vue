<script setup>
import { computed, ref, watch } from 'vue';
import { ChevronDown, Cpu, FileText, Info, RotateCcw, Server, SlidersHorizontal, X } from '@lucide/vue';
import { getActivePinia, storeToRefs } from 'pinia';
import TransformSelector from '@/components/forms/TransformSelector.vue';
import VisualTransformCard from '@/components/settings/sections/ServiceSettings/VisualTransformCard.vue';
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import SectionHeader from '@/components/settings/SectionHeader.vue';
import RuleTemplateModal from '@/components/modals/RuleTemplateModal.vue';
import { useDataStore } from '@/stores/useDataStore.js';
import { DEFAULT_SUBCONVERTER_BACKEND, SUBCONVERTER_BACKENDS } from '@/constants/subconverter-backends.js';
import { testSubconverterBackend } from '@/lib/api.js';
import { useI18n } from '@/i18n/index.js';
import { DEFAULT_BUILTIN_TRANSFORM, normalizeBuiltinTransform } from '@shared/visual-rules-catalog.js';

const { t } = useI18n();

const props = defineProps({
  settings: {
    type: Object,
    required: true,
  },
});

if (!props.settings.builtinTransform || typeof props.settings.builtinTransform !== 'object') {
  props.settings.builtinTransform = normalizeBuiltinTransform(DEFAULT_BUILTIN_TRANSFORM);
} else {
  Object.assign(props.settings.builtinTransform, normalizeBuiltinTransform(props.settings.builtinTransform));
}

const showAdvancedDrawer = ref(false);
const hasBaseConfigOverride = computed(() => {
  const base = props.settings.builtinTransform?.baseConfig || {};
  return Boolean(String(base.singbox || '').trim() || String(base.clash || '').trim() || String(base.surge || '').trim());
});

const modeOptions = computed(() => [
  { value: 'builtin', label: t('settings.transformBuiltinAuto') },
  { value: 'visual', label: t('settings.transformVisualRulesOption') },
  { value: 'preset', label: t('settings.transformTemplateUnified') },
]);

const ruleSourceSelection = computed({
  get: () => {
    const mode = props.settings.transformConfigMode || 'builtin';
    if (mode === 'builtin') {
      return props.settings.builtinTransform?.visualRulesEnabled ? 'visual' : 'builtin';
    }
    // 兼容历史保存的 preset / custom / custom_template，全部统一归入「规则模板」
    return 'preset';
  },
  set: (val) => {
    if (!props.settings.builtinTransform) {
      props.settings.builtinTransform = normalizeBuiltinTransform(DEFAULT_BUILTIN_TRANSFORM);
    }
    if (val === 'visual') {
      props.settings.transformConfigMode = 'builtin';
      props.settings.builtinTransform.visualRulesEnabled = true;
    } else if (val === 'builtin') {
      props.settings.transformConfigMode = 'builtin';
      props.settings.builtinTransform.visualRulesEnabled = false;
    } else {
      props.settings.transformConfigMode = 'preset';
      props.settings.builtinTransform.visualRulesEnabled = false;
    }
  },
});

const isVisualMode = computed(() => ruleSourceSelection.value === 'visual' && isBuiltinEngine.value);
const isTemplateMode = computed(() => ruleSourceSelection.value === 'preset');

const selectedAsset = ref(null);
const showRuleTemplateModal = ref(false);
const activePinia = getActivePinia();
const ruleTemplates = activePinia ? storeToRefs(useDataStore()).ruleTemplates : ref([]);
const ruleTemplateCount = computed(() => (ruleTemplates.value || []).length);
const isCustomTemplateMode = computed(() => props.settings.transformConfigMode === 'custom_template');

function handleRuleTemplatesSaved(savedTemplateId) {
  if (!isTemplateMode.value || !savedTemplateId) return;
  const current = String(props.settings.transformConfig || '').trim();
  const stillExists = (ruleTemplates.value || []).some(
    (item) => item && item.enabled !== false && `custom:${item.id}` === current,
  );
  if (!current || (current.startsWith('custom:') && !stillExists)) {
    props.settings.transformConfig = `custom:${savedTemplateId}`;
  }
}

const flagOptions = computed(() => [
  { key: 'udp', label: t('settings.transformUdp') },
  { key: 'emoji', label: t('settings.transformEmoji') },
  { key: 'scv', label: t('settings.transformSkipCert') },
  { key: 'sort', label: t('settings.transformSort') },
  { key: 'tfo', label: 'TCP Fast Open' },
  { key: 'list', label: t('settings.transformList') },
]);

if (!props.settings.subconverter) {
  props.settings.subconverter = {
    defaultBackend: DEFAULT_SUBCONVERTER_BACKEND,
    defaultOptions: {
      udp: true,
      emoji: true,
      scv: true,
      tfo: false,
      sort: false,
      list: false,
    },
  };
} else if (!props.settings.subconverter.defaultOptions) {
  props.settings.subconverter.defaultOptions = {
    udp: true,
    emoji: true,
    scv: true,
    tfo: false,
    sort: false,
    list: false,
  };
}

const isBuiltinMode = computed(() => props.settings.transformConfigMode === 'builtin');

const modeHint = computed(() => {
  if (isVisualMode.value) {
    return t('settings.transformVisualHint');
  }
  if (isBuiltinMode.value) {
    return t('settings.transformBuiltinHint');
  }
  return isExternalEngine.value
    ? t('settings.transformTemplateExternalHint')
    : t('settings.transformTemplateUnifiedHint');
});

const isBuiltinEngine = computed(
  () => props.settings.subconverter.engineMode === 'builtin' || props.settings.subconverter.engineMode === '',
);
const isExternalEngine = computed(() => props.settings.subconverter.engineMode === 'external');
const backendTestStatus = ref(null);
const isTestingBackend = ref(false);
const previousEngineSettings = ref(null);
const restoreEngineSnapshot = ref(null);
const showEngineChangeWarning = ref(false);
const engineChangeNoticeDismissed = ref(false);
const backendTestToneClass = computed(() => {
  if (!backendTestStatus.value) return 'border-line bg-transparent text-fg-muted';
  return backendTestStatus.value.success
    ? 'border-line bg-transparent text-emerald-400'
    : 'border-line bg-transparent text-red-400';
});

async function handleTestBackend() {
  if (isTestingBackend.value) return;
  isTestingBackend.value = true;
  backendTestStatus.value = null;
  const backend = props.settings.subconverter.defaultBackend;
  try {
    const result = await testSubconverterBackend(backend, 'clash');
    if (props.settings.subconverter.defaultBackend !== backend) return;
    backendTestStatus.value = {
      success: Boolean(result?.success || result?.available),
      message: result?.message || result?.error || t('settings.transformBackendTestFailed'),
      endpoint: result?.endpoint || '',
      elapsedMs: result?.elapsedMs,
    };
  } catch (error) {
    if (props.settings.subconverter.defaultBackend === backend) {
      backendTestStatus.value = {
        success: false,
        message: error?.message || t('settings.transformBackendTestFailed'),
        endpoint: '',
      };
    }
  } finally {
    isTestingBackend.value = false;
  }
}

function switchToBuiltinEngine() {
  props.settings.subconverter.engineMode = 'builtin';
  showEngineChangeWarning.value = false;
  if (!restoreEngineSnapshot.value) return;
  Object.assign(props.settings, restoreEngineSnapshot.value);
  props.settings.subconverter.engineMode = 'builtin';
  selectedAsset.value = null;
  previousEngineSettings.value = null;
  restoreEngineSnapshot.value = null;
}

function restorePreviousEngineSettings() {
  switchToBuiltinEngine();
}

watch(
  () => props.settings.subconverter.defaultBackend,
  () => {
    backendTestStatus.value = null;
  },
);

watch(
  isExternalEngine,
  (enabled, wasEnabled) => {
    if (enabled === wasEnabled) return;
    if (enabled) {
      if (wasEnabled === false) {
        previousEngineSettings.value = {
          builtinSkipCertVerify: props.settings.builtinSkipCertVerify,
          builtinEnableUdp: props.settings.builtinEnableUdp,
          transformConfigMode: props.settings.transformConfigMode,
          transformConfig: props.settings.transformConfig,
        };
        restoreEngineSnapshot.value = {
          builtinSkipCertVerify: props.settings.builtinSkipCertVerify,
          builtinEnableUdp: props.settings.builtinEnableUdp,
          transformConfigMode: props.settings.transformConfigMode,
          transformConfig: props.settings.transformConfig,
        };
        showEngineChangeWarning.value = !engineChangeNoticeDismissed.value;
      }
      props.settings.builtinSkipCertVerify = false;
      props.settings.builtinEnableUdp = false;
      if (
        props.settings.transformConfigMode === 'builtin' ||
        props.settings.transformConfigMode === 'custom_template'
      ) {
        props.settings.transformConfigMode = 'preset';
      }
      if (/^(builtin|custom):/.test(String(props.settings.transformConfig || ''))) {
        props.settings.transformConfig = '';
        selectedAsset.value = null;
      }
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-lg border border-line bg-surface p-6">
      <SectionHeader
        :description="t('settings.transformRulesDesc')"
        :title="t('settings.transformRulesTitle')"
        tone="purple"
      >
        <template #icon>
          <FileText class="h-4 w-4" />
        </template>
        <template #actions>
          <div class="flex rounded-md border border-line bg-inset p-0.5 shrink-0">
            <button
              :class="
                isBuiltinEngine ? 'bg-accent text-accent-fg shadow-none' : 'text-fg-muted hover:bg-hover hover:text-fg'
              "
              class="rounded-md px-4 py-1.5 text-xs font-semibold transition-colors"
              type="button"
              @click="switchToBuiltinEngine"
            >
              {{ t('settings.transformBuiltinEngine') }}
            </button>
            <button
              :class="
                isExternalEngine ? 'bg-accent text-accent-fg shadow-none' : 'text-fg-muted hover:bg-hover hover:text-fg'
              "
              class="rounded-md px-4 py-1.5 text-xs font-semibold transition-colors"
              type="button"
              @click="settings.subconverter.engineMode = 'external'"
            >
              {{ t('settings.transformExternalEngine') }}
            </button>
          </div>
        </template>
      </SectionHeader>

      <div
        v-if="showEngineChangeWarning"
        class="mb-6 flex flex-col gap-3 rounded-md border border-line bg-inset px-3.5 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
        data-testid="engine-change-notice"
      >
        <div class="flex min-w-0 items-center gap-2.5 text-fg-muted">
          <Info class="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <p class="leading-relaxed">
            {{ t('settings.transformEngineChangeNotice') }}
          </p>
        </div>
        <div class="flex shrink-0 items-center justify-end gap-2">
          <button
            class="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-elevated-card px-2.5 text-xs font-medium text-fg transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
            data-testid="restore-engine-settings"
            type="button"
            @click="
              restorePreviousEngineSettings();
              engineChangeNoticeDismissed = true;
            "
          >
            <RotateCcw class="h-3 w-3 text-fg-muted" />
            <span>{{ t('settings.transformRestoreEngineSettings') }}</span>
          </button>
          <button
            :aria-label="t('actions.dismiss')"
            :title="t('actions.dismiss')"
            class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-transparent text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
            data-testid="dismiss-engine-change-notice"
            type="button"
            @click="
              engineChangeNoticeDismissed = true;
              showEngineChangeWarning = false;
            "
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <div class="mb-1.5 flex min-h-6 items-center">
            <label class="block text-xs font-medium uppercase tracking-wider text-fg-muted">
              {{ t('settings.transformRuleSource') }}
            </label>
          </div>
          <Select
            v-model="ruleSourceSelection"
            :options="
              modeOptions.map((option) => ({
                value: option.value,
                label: option.label,
                disabled: (option.value === 'builtin' || option.value === 'visual') && isExternalEngine,
              }))
            "
          />
          <p class="mt-2 text-xs leading-relaxed text-fg-muted">
            {{ modeHint }}
          </p>
        </div>

        <!-- 选「内置自动分流」时，右侧直接展示「2. 分流粒度」 -->
        <div v-if="ruleSourceSelection === 'builtin' && isBuiltinEngine">
          <div class="mb-1.5 flex min-h-6 items-center">
            <label class="block text-xs font-medium uppercase tracking-wider text-fg-muted">
              {{ t('settings.transformRuleLevelStep') }}
            </label>
          </div>
          <Select
            v-model="settings.ruleLevel"
            :options="[
              { value: 'base', label: t('settings.transformRuleBase') },
              { value: 'std', label: t('settings.transformRuleStd') },
              { value: 'full', label: t('settings.transformRuleFull') },
              { value: 'relay', label: t('settings.transformRuleRelay') },
            ]"
          />
        </div>

        <!-- 仅在「规则模板」模式下显示「2. 选择模板」 -->
        <div v-else-if="isTemplateMode">
          <div class="mb-1.5 flex min-h-6 items-center justify-between gap-2">
            <label class="block text-xs font-medium uppercase tracking-wider text-fg-muted">
              {{ t('settings.transformTemplateConfig') }}
            </label>
            <button
              v-if="!isExternalEngine"
              class="inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
              data-testid="open-rule-templates-modal"
              type="button"
              @click="showRuleTemplateModal = true"
            >
              <SlidersHorizontal class="h-3 w-3" />
              <span>{{
                ruleTemplateCount > 0
                  ? t('settings.ruleTemplatesManageWithCount', {
                      count: ruleTemplateCount,
                    })
                  : t('settings.ruleTemplatesManage')
              }}</span>
            </button>
          </div>
          <TransformSelector
            v-model="settings.transformConfig"
            :allowEmpty="false"
            :custom-placeholder="t('settings.transformRemotePlaceholder')"
            :custom-templates-only="false"
            :exclude-builtin-assets="isExternalEngine"
            :force-custom="false"
            :placeholder="t('settings.transformPresetPlaceholder')"
            type="config"
            @select-asset="selectedAsset = $event"
          />
        </div>
      </div>

      <!-- 仅在选择「内置可视化规则」时原地展开，不占其余模式空间 -->
      <div v-if="isVisualMode" class="mt-6 border-t border-line pt-5">
        <VisualTransformCard :settings="settings" section="rules" />
      </div>
    </section>

    <!-- 内置引擎参数 -->
    <section
      v-if="isBuiltinEngine"
      class="rounded-lg border border-line bg-surface p-6"
      data-testid="builtin-engine-params"
    >
      <SectionHeader
        :description="t('settings.transformBuiltinParamsDesc')"
        :title="t('settings.transformBuiltinParams')"
      >
        <template #icon>
          <Cpu class="h-4 w-4" />
        </template>
      </SectionHeader>

      <div class="space-y-5">
        <!-- 统一开关网格 -->
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <div class="flex items-center justify-between rounded-md border border-line bg-inset px-3.5 py-2.5">
            <span class="text-xs font-medium text-fg-muted">{{ t('settings.transformBuiltinSkipCert') }}</span>
            <Switch v-model="settings.builtinSkipCertVerify" size="sm" />
          </div>

          <div class="flex items-center justify-between rounded-md border border-line bg-inset px-3.5 py-2.5">
            <span class="text-xs font-medium text-fg-muted">{{ t('settings.transformBuiltinUdp') }}</span>
            <Switch v-model="settings.builtinEnableUdp" size="sm" />
          </div>

          <div class="flex items-center justify-between rounded-md border border-line bg-inset px-3.5 py-2.5">
            <span class="text-xs font-medium text-fg-muted">{{ t('settings.visualGroupByCountry') }}</span>
            <Switch v-model="settings.builtinTransform.groupByCountry" size="sm" />
          </div>

          <div class="flex items-center justify-between rounded-md border border-line bg-inset px-3.5 py-2.5">
            <span class="text-xs font-medium text-fg-muted">{{ t('settings.visualIncludeAutoSelect') }}</span>
            <Switch v-model="settings.builtinTransform.includeAutoSelect" size="sm" />
          </div>

          <div class="flex items-center justify-between rounded-md border border-line bg-inset px-3.5 py-2.5">
            <span class="text-xs font-medium text-fg-muted">{{ t('settings.visualEnableClashApi') }}</span>
            <Switch v-model="settings.builtinTransform.enableClashApi" size="sm" />
          </div>
        </div>

        <!-- Clash API 详细输入（仅开启时展开） -->
        <div
          v-if="settings.builtinTransform.enableClashApi"
          class="grid grid-cols-1 gap-4 rounded-md border border-line bg-inset p-4 md:grid-cols-2"
        >
          <div>
            <label class="mb-1.5 block text-xs font-medium text-fg-muted">
              {{ t('settings.visualExternalController') }}
            </label>
            <input
              v-model="settings.builtinTransform.externalController"
              class="block w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs text-fg focus:border-line-strong"
              placeholder="0.0.0.0:9090"
              type="text"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-medium text-fg-muted">
              {{ t('settings.visualExternalUiUrl') }}
            </label>
            <input
              v-model="settings.builtinTransform.externalUiDownloadUrl"
              :placeholder="t('settings.visualExternalUiUrlPlaceholder')"
              class="block w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs text-fg focus:border-line-strong"
              type="text"
            />
          </div>
        </div>

        <!-- 默认折叠的高级选项：基础配置覆写 & Subconverter 外部配置 -->
        <div class="border-t border-line pt-3">
          <button
            class="flex w-full items-center justify-between rounded-md py-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg"
            data-testid="toggle-advanced-transform-drawer"
            type="button"
            @click="showAdvancedDrawer = !showAdvancedDrawer"
          >
            <span class="inline-flex items-center gap-2">
              <span>{{ t('settings.visualAdvancedDrawerTitle') }}</span>
              <span
                v-if="hasBaseConfigOverride"
                class="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent"
              >
                {{ t('settings.dnsOverrideActive') }}
              </span>
            </span>
            <ChevronDown
              :class="{ 'rotate-180': showAdvancedDrawer }"
              class="h-4 w-4 transition-transform"
            />
          </button>

          <div v-if="showAdvancedDrawer" class="mt-4">
            <VisualTransformCard :settings="settings" section="advanced" />
          </div>
        </div>
      </div>
    </section>

    <!-- 第三方后端参数 -->
    <section
      v-if="isExternalEngine"
      class="rounded-lg border border-line bg-surface p-6"
      data-testid="external-backend-card"
    >
      <SectionHeader
        :description="t('settings.transformExternalParamsDesc')"
        :title="t('settings.transformExternalParams')"
      >
        <template #icon>
          <Server class="h-4 w-4" />
        </template>
        <template #actions>
          <span
            class="inline-flex items-center gap-1.5 rounded-md border border-line bg-inset px-2 py-0.5 font-mono text-[10px] text-fg-muted"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            subconverter
          </span>
        </template>
      </SectionHeader>

      <div class="space-y-6">
        <div>
          <label class="mb-1.5 block text-xs font-medium text-fg-muted">{{ t('settings.transformBackend') }}</label>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              v-model="settings.subconverter.defaultBackend"
              :options="
                SUBCONVERTER_BACKENDS.map((backend) => ({
                  value: backend.value,
                  label: `${t(backend.labelKey)} · ${backend.description}`,
                }))
              "
              size="sm"
              trigger-class="font-mono"
            />
            <input
              v-model="settings.subconverter.defaultBackend"
              :aria-label="t('settings.transformCustomBackend')"
              class="block w-full rounded-md border border-line bg-inset px-3 py-2 text-xs font-mono text-fg focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong"
              placeholder="subapi.cmliussss.net"
              type="text"
            />
          </div>
          <p class="mt-2 text-xs leading-relaxed text-fg-muted">
            {{ t('settings.transformBackendHint') }}
          </p>
          <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              :aria-busy="String(isTestingBackend)"
              :disabled="!isExternalEngine || isTestingBackend"
              class="inline-flex items-center justify-center rounded-md border border-line bg-transparent px-3.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="test-subconverter-backend"
              type="button"
              @click="handleTestBackend"
            >
              {{ isTestingBackend ? t('settings.transformTesting') : t('settings.transformTestBackend') }}
            </button>
            <p class="text-xs leading-relaxed text-fg-muted">
              {{ t('settings.transformTestBackendHint') }}
            </p>
          </div>
          <div
            v-if="backendTestStatus"
            :class="backendTestToneClass"
            class="mt-3 pl-3 border-l-2 py-1 text-xs leading-relaxed"
            data-testid="subconverter-backend-test-result"
          >
            <div class="font-medium flex items-center gap-2">
              <span
                :class="backendTestStatus.success ? 'bg-emerald-500' : 'bg-red-500'"
                class="h-1.5 w-1.5 rounded-full shrink-0"
              ></span>
              {{ backendTestStatus.message }}
            </div>
            <div v-if="backendTestStatus.endpoint" class="mt-1 font-mono text-fg-subtle">
              {{
                t('settings.transformProbeEndpoint', {
                  endpoint: backendTestStatus.endpoint,
                })
              }}<span v-if="backendTestStatus.elapsedMs"> · {{ backendTestStatus.elapsedMs }}ms</span>
            </div>
          </div>
        </div>

        <div class="pt-4 border-t border-line grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="flag in flagOptions"
            :key="flag.key"
            class="flex items-center justify-between rounded-md border border-line bg-inset px-3.5 py-2.5"
          >
            <span :title="flag.label" class="truncate text-xs font-medium text-fg-muted">{{ flag.label }}</span>
            <Switch v-model="settings.subconverter.defaultOptions[flag.key]" size="xs" />
          </div>
        </div>
      </div>
    </section>

    <RuleTemplateModal
      v-if="showRuleTemplateModal"
      v-model:show="showRuleTemplateModal"
      @saved="handleRuleTemplatesSaved"
    />
  </div>
</template>
