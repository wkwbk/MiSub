<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { BuiltinTransformConfig, RuleTemplate, SubconverterConfig, SubconverterOptions } from '@misub/core/types.js';
import { ChevronDown, Cpu, FileText, Info, RotateCcw, Server, SlidersHorizontal, X } from '@lucide/vue';
import { getActivePinia, storeToRefs } from 'pinia';
import TransformSelector from '@/components/forms/TransformSelector.vue';
import VisualTransformCard from '@/components/settings/sections/ServiceSettings/VisualTransformCard.vue';
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import SettingCard from '@/components/settings/SettingCard.vue';
import RuleTemplateModal from '@/components/modals/RuleTemplateModal.vue';
import { useDataStore } from '@/stores/useDataStore.js';
import { DEFAULT_SUBCONVERTER_BACKEND, SUBCONVERTER_BACKENDS } from '@/constants/subconverter-backends.js';
import { testSubconverterBackend } from '@/lib/api.js';
import type { AppSettingsConfig, RuleTemplateItem } from '@/queries/useAppDataQueries.js';
import { useI18n } from '@/i18n/index.js';
import { DEFAULT_BUILTIN_TRANSFORM, normalizeBuiltinTransform } from '@misub/core/domain/visual-rules-catalog.js';
import { extractErrorMessage } from '@/utils/error-handler.js';

interface BackendTestStatus {
  success: boolean;
  message: string;
  endpoint: string;
  elapsedMs?: number;
}

interface EngineSettingsSnapshot {
  builtinSkipCertVerify?: boolean;
  builtinEnableUdp?: boolean;
  transformConfigMode?: string;
  transformConfig?: string;
}

const { t } = useI18n();

const props = defineProps<{
  settings: AppSettingsConfig;
}>();

const emit = defineEmits<{
  'update:settings': [value: AppSettingsConfig];
}>();

const settingsModel = computed<AppSettingsConfig>({
  get: () => props.settings,
  set: (val: AppSettingsConfig) => emit('update:settings', val),
});

const patchSettings = (patch: Partial<AppSettingsConfig>): void => {
  emit('update:settings', {
    ...props.settings,
    ...patch,
  });
};

const defaultSubconverterOptions: SubconverterOptions = {
  udp: true,
  emoji: true,
  scv: true,
  tfo: false,
  sort: false,
  list: false,
};

const builtinTransform = computed<BuiltinTransformConfig>(() =>
  normalizeBuiltinTransform(props.settings?.builtinTransform || DEFAULT_BUILTIN_TRANSFORM),
);

const patchBuiltinTransform = (patch: Partial<BuiltinTransformConfig>): void => {
  patchSettings({
    builtinTransform: {
      ...builtinTransform.value,
      ...patch,
    },
  });
};

const subconverter = computed<SubconverterConfig>(() => ({
  engineMode: props.settings?.subconverter?.engineMode || 'builtin',
  defaultBackend: props.settings?.subconverter?.defaultBackend || DEFAULT_SUBCONVERTER_BACKEND,
  defaultOptions: {
    ...defaultSubconverterOptions,
    ...props.settings?.subconverter?.defaultOptions,
  },
}));

const patchSubconverter = (patch: Partial<SubconverterConfig>): void => {
  patchSettings({
    subconverter: {
      ...subconverter.value,
      ...patch,
    },
  });
};

const patchSubconverterOption = (key: keyof SubconverterOptions, value: boolean): void => {
  patchSubconverter({
    defaultOptions: {
      ...subconverter.value.defaultOptions,
      [key]: value,
    },
  });
};

const showAdvancedDrawer = ref(false);
const hasBaseConfigOverride = computed(() => {
  const base = builtinTransform.value.baseConfig || {};
  return Boolean(
    String(base.singbox || '').trim() || String(base.clash || '').trim() || String(base.surge || '').trim(),
  );
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
      return builtinTransform.value.visualRulesEnabled ? 'visual' : 'builtin';
    }
    // 兼容历史保存的 preset / custom / custom_template，全部统一归入「规则模板」
    return 'preset';
  },
  set: (val: string) => {
    if (val === 'visual') {
      patchSettings({
        transformConfigMode: 'builtin',
        builtinTransform: {
          ...builtinTransform.value,
          visualRulesEnabled: true,
        },
      });
    } else if (val === 'builtin') {
      patchSettings({
        transformConfigMode: 'builtin',
        builtinTransform: {
          ...builtinTransform.value,
          visualRulesEnabled: false,
        },
      });
    } else {
      patchSettings({
        transformConfigMode: 'preset',
        builtinTransform: {
          ...builtinTransform.value,
          visualRulesEnabled: false,
        },
      });
    }
  },
});

const isBuiltinEngine = computed(
  () => subconverter.value.engineMode === 'builtin' || subconverter.value.engineMode === '',
);
const isExternalEngine = computed(() => subconverter.value.engineMode === 'external');
const isVisualMode = computed(() => ruleSourceSelection.value === 'visual' && isBuiltinEngine.value);
const isTemplateMode = computed(() => ruleSourceSelection.value === 'preset');

const selectedAsset = ref<{
  id?: string | number;
  name?: string;
  url?: string;
  group?: string;
  sourceType?: string;
  description?: string;
} | null>(null);
const showRuleTemplateModal = ref(false);
const activePinia = getActivePinia();
const ruleTemplates = activePinia
  ? (storeToRefs(useDataStore()).ruleTemplates as Ref<Array<RuleTemplateItem | RuleTemplate>>)
  : ref<Array<RuleTemplateItem | RuleTemplate>>([]);
const ruleTemplateCount = computed(() => (ruleTemplates.value || []).length);

function handleRuleTemplatesSaved(savedTemplateId: string) {
  if (!isTemplateMode.value || !savedTemplateId) return;
  const current = String(props.settings.transformConfig || '').trim();
  const stillExists = (ruleTemplates.value || []).some(
    (item) => item && item.enabled !== false && `custom:${item.id}` === current,
  );
  if (!current || (current.startsWith('custom:') && !stillExists)) {
    patchSettings({ transformConfig: `custom:${savedTemplateId}` });
  }
}

const flagOptions = computed<Array<{ key: keyof SubconverterOptions; label: string }>>(() => [
  { key: 'udp', label: t('settings.transformUdp') },
  { key: 'emoji', label: t('settings.transformEmoji') },
  { key: 'scv', label: t('settings.transformSkipCert') },
  { key: 'sort', label: t('settings.transformSort') },
  { key: 'tfo', label: 'TCP Fast Open' },
  { key: 'list', label: t('settings.transformList') },
]);

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

const backendTestStatus = ref<BackendTestStatus | null>(null);
const isTestingBackend = ref(false);
const previousEngineSettings = ref<EngineSettingsSnapshot | null>(null);
const restoreEngineSnapshot = ref<EngineSettingsSnapshot | null>(null);
const showEngineChangeWarning = ref(false);
const engineChangeNoticeDismissed = ref(false);
const backendTestToneClass = computed(() => {
  if (!backendTestStatus.value) return 'border-line bg-transparent text-fg-muted';
  return backendTestStatus.value.success
    ? 'border-status-success-border bg-transparent text-status-success'
    : 'border-status-danger-border bg-transparent text-status-danger';
});

async function handleTestBackend() {
  if (isTestingBackend.value) return;
  isTestingBackend.value = true;
  backendTestStatus.value = null;
  const backend = subconverter.value.defaultBackend || '';
  try {
    const result = await testSubconverterBackend(backend, 'clash');
    if (subconverter.value.defaultBackend !== backend) return;
    backendTestStatus.value = {
      success: Boolean(result?.success || ('available' in result && result.available)),
      message: result?.message || result?.error || t('settings.transformBackendTestFailed'),
      endpoint: 'endpoint' in result && typeof result.endpoint === 'string' ? result.endpoint : '',
      elapsedMs: 'elapsedMs' in result && typeof result.elapsedMs === 'number' ? result.elapsedMs : undefined,
    };
  } catch (error: unknown) {
    if (subconverter.value.defaultBackend === backend) {
      backendTestStatus.value = {
        success: false,
        message: extractErrorMessage(error, t('settings.transformBackendTestFailed')),
        endpoint: '',
      };
    }
  } finally {
    isTestingBackend.value = false;
  }
}

function switchToBuiltinEngine() {
  const nextSubconverter: SubconverterConfig = {
    ...subconverter.value,
    engineMode: 'builtin',
  };
  showEngineChangeWarning.value = false;
  if (!restoreEngineSnapshot.value) {
    patchSettings({ subconverter: nextSubconverter });
    return;
  }
  const snapshot = restoreEngineSnapshot.value;
  selectedAsset.value = null;
  previousEngineSettings.value = null;
  restoreEngineSnapshot.value = null;
  patchSettings({
    ...snapshot,
    subconverter: nextSubconverter,
  });
}

function restorePreviousEngineSettings() {
  switchToBuiltinEngine();
}

watch(
  () => subconverter.value.defaultBackend,
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

      const patch: Partial<AppSettingsConfig> = {
        builtinSkipCertVerify: false,
        builtinEnableUdp: false,
      };
      if (
        props.settings.transformConfigMode === 'builtin' ||
        props.settings.transformConfigMode === 'custom_template'
      ) {
        patch.transformConfigMode = 'preset';
      }
      if (/^(builtin|custom):/.test(String(props.settings.transformConfig || ''))) {
        patch.transformConfig = '';
        selectedAsset.value = null;
      }
      patchSettings(patch);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="space-y-4">
    <SettingCard
      :description="t('settings.transformRulesDesc')"
      :title="t('settings.transformRulesTitle')"
      tone="purple"
    >
      <template #icon>
        <FileText class="h-4 w-4" />
      </template>
      <template #actions>
        <div class="flex max-w-full rounded-md border border-line bg-inset p-0.5 shrink-0">
          <button
            :class="
              isBuiltinEngine ? 'bg-accent text-accent-fg shadow-none' : 'text-fg-muted hover:bg-hover hover:text-fg'
            "
            class="whitespace-nowrap rounded-md px-3 sm:px-4 py-1.5 text-xs font-semibold transition-colors"
            type="button"
            @click="switchToBuiltinEngine"
          >
            {{ t('settings.transformBuiltinEngine') }}
          </button>
          <button
            :class="
              isExternalEngine ? 'bg-accent text-accent-fg shadow-none' : 'text-fg-muted hover:bg-hover hover:text-fg'
            "
            class="whitespace-nowrap rounded-md px-3 sm:px-4 py-1.5 text-xs font-semibold transition-colors"
            type="button"
            @click="patchSubconverter({ engineMode: 'external' })"
          >
            {{ t('settings.transformExternalEngine') }}
          </button>
        </div>
      </template>

      <div
        v-if="showEngineChangeWarning"
        class="mb-6 flex flex-col gap-3 rounded-md border border-line bg-inset px-3.5 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
        data-testid="engine-change-notice"
      >
        <div class="flex min-w-0 items-center gap-2.5 text-fg-muted">
          <Info class="h-3.5 w-3.5 shrink-0 text-status-warning" />
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
            :model-value="settings.ruleLevel"
            :options="[
              { value: 'base', label: t('settings.transformRuleBase') },
              { value: 'std', label: t('settings.transformRuleStd') },
              { value: 'full', label: t('settings.transformRuleFull') },
              { value: 'relay', label: t('settings.transformRuleRelay') },
            ]"
            @update:model-value="patchSettings({ ruleLevel: String($event) })"
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
            :allowEmpty="false"
            :custom-placeholder="t('settings.transformRemotePlaceholder')"
            :custom-templates-only="false"
            :exclude-builtin-assets="isExternalEngine"
            :force-custom="false"
            :model-value="settings.transformConfig"
            :placeholder="t('settings.transformPresetPlaceholder')"
            type="config"
            @select-asset="selectedAsset = $event"
            @update:model-value="patchSettings({ transformConfig: String($event ?? '') })"
          />
        </div>
      </div>

      <!-- 仅在选择「内置可视化规则」时原地展开，不占其余模式空间 -->
      <div v-if="isVisualMode" class="mt-6 border-t border-line pt-5">
        <VisualTransformCard v-model:settings="settingsModel" section="rules" />
      </div>
    </SettingCard>

    <!-- 内置引擎参数 -->
    <SettingCard
      v-if="isBuiltinEngine"
      :description="t('settings.transformBuiltinParamsDesc')"
      :title="t('settings.transformBuiltinParams')"
      data-testid="builtin-engine-params"
    >
      <template #icon>
        <Cpu class="h-4 w-4" />
      </template>

      <div class="space-y-5">
        <!-- 统一开关网格 -->
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <div class="setting-switch-card">
            <span class="text-xs font-medium text-fg-muted">{{ t('settings.transformBuiltinSkipCert') }}</span>
            <Switch
              :model-value="Boolean(settings.builtinSkipCertVerify)"
              size="sm"
              @update:model-value="patchSettings({ builtinSkipCertVerify: Boolean($event) })"
            />
          </div>

          <div class="setting-switch-card">
            <span class="text-xs font-medium text-fg-muted">{{ t('settings.transformBuiltinUdp') }}</span>
            <Switch
              :model-value="Boolean(settings.builtinEnableUdp)"
              size="sm"
              @update:model-value="patchSettings({ builtinEnableUdp: Boolean($event) })"
            />
          </div>

          <div class="setting-switch-card">
            <span class="text-xs font-medium text-fg-muted">{{ t('settings.visualGroupByCountry') }}</span>
            <Switch
              :model-value="Boolean(builtinTransform.groupByCountry)"
              size="sm"
              @update:model-value="patchBuiltinTransform({ groupByCountry: Boolean($event) })"
            />
          </div>

          <div class="setting-switch-card">
            <span class="text-xs font-medium text-fg-muted">{{ t('settings.visualIncludeAutoSelect') }}</span>
            <Switch
              :model-value="Boolean(builtinTransform.includeAutoSelect)"
              size="sm"
              @update:model-value="patchBuiltinTransform({ includeAutoSelect: Boolean($event) })"
            />
          </div>

          <div class="setting-switch-card">
            <span class="text-xs font-medium text-fg-muted">{{ t('settings.visualEnableClashApi') }}</span>
            <Switch
              :model-value="Boolean(builtinTransform.enableClashApi)"
              size="sm"
              @update:model-value="patchBuiltinTransform({ enableClashApi: Boolean($event) })"
            />
          </div>
        </div>

        <!-- Clash API 详细输入（仅开启时展开） -->
        <div
          v-if="builtinTransform.enableClashApi"
          class="grid grid-cols-1 gap-4 rounded-md border border-line bg-inset/40 p-4 md:grid-cols-2"
        >
          <div>
            <label class="mb-1.5 block text-xs font-medium text-fg-muted">
              {{ t('settings.visualExternalController') }}
            </label>
            <input
              :value="builtinTransform.externalController"
              class="block w-full rounded-md border border-line bg-inset px-3 py-2 font-mono text-xs text-fg shadow-none focus:border-line-strong"
              placeholder="0.0.0.0:9090"
              type="text"
              @input="patchBuiltinTransform({ externalController: ($event.target as HTMLInputElement).value })"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-xs font-medium text-fg-muted">
              {{ t('settings.visualExternalUiUrl') }}
            </label>
            <input
              :placeholder="t('settings.visualExternalUiUrlPlaceholder')"
              :value="builtinTransform.externalUiDownloadUrl"
              class="block w-full rounded-md border border-line bg-inset px-3 py-2 font-mono text-xs text-fg shadow-none focus:border-line-strong"
              type="text"
              @input="patchBuiltinTransform({ externalUiDownloadUrl: ($event.target as HTMLInputElement).value })"
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
                class="rounded bg-accent/15 px-1.5 py-0.5 text-xs font-semibold text-accent"
              >
                {{ t('settings.dnsOverrideActive') }}
              </span>
            </span>
            <ChevronDown :class="{ 'rotate-180': showAdvancedDrawer }" class="h-4 w-4 transition-transform" />
          </button>

          <div v-if="showAdvancedDrawer" class="mt-4">
            <VisualTransformCard v-model:settings="settingsModel" section="advanced" />
          </div>
        </div>
      </div>
    </SettingCard>

    <!-- 第三方后端参数 -->
    <SettingCard
      v-if="isExternalEngine"
      :description="t('settings.transformExternalParamsDesc')"
      :title="t('settings.transformExternalParams')"
      data-testid="external-backend-card"
    >
      <template #icon>
        <Server class="h-4 w-4" />
      </template>

      <div class="space-y-6">
        <div>
          <label class="mb-1.5 block text-xs font-medium text-fg-muted">{{ t('settings.transformBackend') }}</label>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              :model-value="subconverter.defaultBackend"
              :options="
                SUBCONVERTER_BACKENDS.map((backend) => ({
                  value: backend.value,
                  label: `${t(backend.labelKey)} · ${backend.description}`,
                }))
              "
              size="sm"
              trigger-class="font-mono"
              @update:model-value="patchSubconverter({ defaultBackend: String($event ?? '') })"
            />
            <input
              :aria-label="t('settings.transformCustomBackend')"
              :value="subconverter.defaultBackend"
              class="block w-full rounded-md border border-line bg-inset px-3 py-2 text-xs font-mono text-fg focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong"
              placeholder="subapi.cmliussss.net"
              type="text"
              @input="patchSubconverter({ defaultBackend: ($event.target as HTMLInputElement).value })"
            />
          </div>
          <p class="mt-2 text-xs leading-relaxed text-fg-muted">
            {{ t('settings.transformBackendHint') }}
          </p>
          <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              :aria-busy="isTestingBackend"
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
          <div v-for="flag in flagOptions" :key="flag.key" class="setting-switch-card">
            <span :title="flag.label" class="truncate text-xs font-medium text-fg-muted">{{ flag.label }}</span>
            <Switch
              :model-value="Boolean(subconverter.defaultOptions?.[flag.key])"
              size="xs"
              @update:model-value="patchSubconverterOption(flag.key, Boolean($event))"
            />
          </div>
        </div>
      </div>
    </SettingCard>

    <RuleTemplateModal
      v-if="showRuleTemplateModal"
      v-model:show="showRuleTemplateModal"
      @saved="handleRuleTemplatesSaved"
    />
  </div>
</template>
