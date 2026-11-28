<script setup lang="ts" generic="T extends Record<string, unknown>">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type {
  CustomVisualRulesConfig,
  NormalizedCustomVisualRules,
  RuleTemplate,
  SmartPreset,
  TransformMode,
} from '@misub/core/types.js';
import { ChevronDown, Info, Server, SlidersHorizontal, RotateCcw } from '@lucide/vue';
import { getActivePinia, storeToRefs } from 'pinia';
import TransformSelector from '@/components/forms/TransformSelector.vue';
import VisualTransformCard from '@/components/settings/sections/ServiceSettings/VisualTransformCard.vue';
import Select from '@/components/ui/Select.vue';
import Switch from '@/components/ui/Switch.vue';
import RuleTemplateModal from '@/components/modals/RuleTemplateModal.vue';
import { useDataStore } from '@/stores/useDataStore.js';
import { DEFAULT_SUBCONVERTER_BACKEND, SUBCONVERTER_BACKENDS } from '@/constants/subconverter-backends.js';
import { getLocalizedTransformAssetByUrl } from '@/constants/transform-assets.js';
import { testSubconverterBackend } from '@/lib/api.js';
import type { AppSettingsConfig, RuleTemplateItem } from '@/queries/useAppDataQueries.js';
import { useI18n } from '@/i18n/index.js';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';
import {
  detectVisualRulePreset,
  getSmartPresetRuleIds,
  normalizeCustomVisualRules,
} from '@misub/core/domain/visual-rules-catalog.js';
import { extractErrorMessage } from '@/utils/error-handler.js';

type EditorTransformMode = 'global' | TransformMode;
type ExternalFlagKey = 'sort' | 'tfo' | 'list';

interface BackendTestStatus {
  success: boolean;
  message: string;
  endpoint: string;
  elapsedMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function resolveValidSmartPreset(value: unknown): SmartPreset {
  return value === 'minimal' || value === 'balanced' || value === 'full' ? value : 'balanced';
}

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    scope: 'global' | 'profile';
    model: T;
    globalSettings?: Partial<AppSettingsConfig>;
  }>(),
  {
    globalSettings: () => ({}),
  },
);

const emit = defineEmits<{
  'update:model': [value: T];
}>();

function patchModel(patch: Record<string, unknown>): void {
  emit('update:model', {
    ...props.model,
    ...patch,
  } as T);
}

const isGlobalScope = computed(() => props.scope === 'global');

const activePinia = getActivePinia();
const dataStore = activePinia ? useDataStore() : null;
const ruleTemplates = dataStore
  ? (storeToRefs(dataStore).ruleTemplates as Ref<Array<RuleTemplateItem | RuleTemplate>>)
  : ref<Array<RuleTemplateItem | RuleTemplate>>([]);
const ruleTemplateCount = computed(() => (ruleTemplates.value || []).length);

onMounted(() => {
  if (activePinia) {
    void dataStore?.ensureRuleTemplatesLoaded?.();
  }
});

const externalRecord = computed<Record<string, unknown>>(() =>
  isRecord(props.model?.externalBackend) ? props.model.externalBackend : {},
);

const effectiveBackendUrl = computed(() => {
  if (isGlobalScope.value) {
    return String(externalRecord.value.url || DEFAULT_SUBCONVERTER_BACKEND);
  }
  return String(externalRecord.value.url ?? '');
});

function patchExternalBackend(patch: Record<string, unknown>): void {
  patchModel({
    externalBackend: {
      ...externalRecord.value,
      ...patch,
    },
  });
}

const globalSmartPreset = computed<SmartPreset>(() => resolveValidSmartPreset(props.globalSettings?.smartPreset));

const activeMode = computed<EditorTransformMode>({
  get() {
    const rawMode = props.model?.transformMode;
    if (!isGlobalScope.value && !rawMode) {
      return 'global';
    }
    if (rawMode === 'template' || rawMode === 'external') {
      return rawMode;
    }
    return 'smart';
  },
  set(nextMode) {
    if (nextMode === 'global' && !isGlobalScope.value) {
      patchModel({ transformMode: null });
      return;
    }

    if (nextMode === 'smart') {
      if (isGlobalScope.value) {
        patchModel({ transformMode: 'smart' });
        return;
      }
      const nextPreset = props.model?.smartPreset
        ? resolveValidSmartPreset(props.model.smartPreset)
        : globalSmartPreset.value;
      const hasRules = isRecord(props.model?.customVisualRules);
      patchModel({
        transformMode: 'smart',
        ...(props.model?.smartPreset ? {} : { smartPreset: nextPreset }),
        ...(!hasRules
          ? {
              customVisualRules: normalizeCustomVisualRules(props.globalSettings?.customVisualRules, {
                smartPreset: nextPreset,
                allowEmptyName: true,
              }),
            }
          : {}),
      });
      return;
    }

    if (nextMode === 'template') {
      patchModel({ transformMode: 'template' });
      return;
    }

    patchModel({ transformMode: 'external' });
  },
});

const modeTabs = computed<Array<{ value: EditorTransformMode; label: string }>>(() => {
  const items: Array<{ value: EditorTransformMode; label: string }> = [
    { value: 'smart', label: t('settings.transformModeSmart') },
    { value: 'template', label: t('settings.transformModeTemplate') },
    { value: 'external', label: t('settings.transformModeExternal') },
  ];
  if (!isGlobalScope.value) {
    return [{ value: 'global', label: t('profileModal.followGlobalSchemeShort') }, ...items];
  }
  return items;
});

const isGlobalSmartMode = computed(() => {
  const gMode = props.globalSettings?.transformMode;
  return gMode !== 'template' && gMode !== 'external';
});

const showProfileRelayOverride = computed(
  () =>
    !isGlobalScope.value &&
    (activeMode.value === 'smart' || (activeMode.value === 'global' && isGlobalSmartMode.value)),
);

const effectiveSmartPresetSetting = computed<SmartPreset>(() =>
  props.model?.smartPreset
    ? resolveValidSmartPreset(props.model.smartPreset)
    : !isGlobalScope.value
      ? globalSmartPreset.value
      : 'balanced',
);

const customVisualRules = computed<NormalizedCustomVisualRules>(() => {
  const raw = isRecord(props.model?.customVisualRules)
    ? props.model.customVisualRules
    : !isGlobalScope.value && isRecord(props.globalSettings?.customVisualRules)
      ? props.globalSettings.customVisualRules
      : undefined;
  return normalizeCustomVisualRules(raw, {
    smartPreset: effectiveSmartPresetSetting.value,
    allowEmptyName: true,
  });
});

const smartPreset = computed<string>({
  get() {
    const rawRules = isRecord(props.model?.customVisualRules)
      ? props.model.customVisualRules
      : !isGlobalScope.value && isRecord(props.globalSettings?.customVisualRules)
        ? props.globalSettings.customVisualRules
        : null;
    if (rawRules && Array.isArray(rawRules.selectedRules)) {
      return detectVisualRulePreset(customVisualRules.value.selectedRules);
    }
    return effectiveSmartPresetSetting.value;
  },
  set(preset) {
    if (preset === 'minimal' || preset === 'balanced' || preset === 'full') {
      patchModel({
        transformMode: 'smart',
        smartPreset: preset,
        customVisualRules: {
          ...customVisualRules.value,
          selectedRules: getSmartPresetRuleIds(preset),
        },
      });
    }
  },
});

const smartPresetOptions = computed(() => [
  { value: 'minimal', label: t('settings.transformPresetMinimalDesc') },
  { value: 'balanced', label: t('settings.transformPresetBalancedDesc') },
  { value: 'full', label: t('settings.transformPresetFullDesc') },
  { value: 'custom', label: t('settings.visualPresetCustom'), disabled: true },
]);

const triStateRelayOptions = computed(() => [
  { value: null, label: t('profileModal.followGlobal') },
  { value: true, label: t('profileModal.on') },
  { value: false, label: t('profileModal.off') },
]);

const showVisualCustomize = ref(
  smartPreset.value === 'custom' ||
    (Array.isArray(customVisualRules.value.customRules) && customVisualRules.value.customRules.length > 0),
);

watch(smartPreset, (nextPreset) => {
  if (nextPreset === 'custom') {
    showVisualCustomize.value = true;
  }
});

function patchCustomVisualRules(patch: Partial<CustomVisualRulesConfig>): void {
  const nextRules = {
    ...customVisualRules.value,
    ...patch,
  };
  const detected = detectVisualRulePreset(nextRules.selectedRules);
  patchModel({
    transformMode: 'smart',
    ...(detected === 'minimal' || detected === 'balanced' || detected === 'full'
      ? { smartPreset: detected }
      : { smartPreset: effectiveSmartPresetSetting.value }),
    customVisualRules: nextRules,
  });
}

function syncVisualRulesFromGlobal(): void {
  showVisualCustomize.value = true;
  const gPreset = globalSmartPreset.value;
  patchModel({
    transformMode: 'smart',
    smartPreset: gPreset,
    customVisualRules: normalizeCustomVisualRules(props.globalSettings?.customVisualRules, {
      smartPreset: gPreset,
      allowEmptyName: true,
    }),
  });
}

const showRelayTooltip = ref(false);
const relayTooltipRef = ref<HTMLElement | null>(null);

function handleRelayTooltipOutsideClick(event: Event): void {
  if (!showRelayTooltip.value) return;
  const target = event.target as Node | null;
  if (target && relayTooltipRef.value?.contains(target)) return;
  showRelayTooltip.value = false;
}

function handleRelayTooltipKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    showRelayTooltip.value = false;
  }
}

watch(showRelayTooltip, (open) => {
  if (typeof document === 'undefined') return;
  if (open) {
    document.addEventListener('pointerdown', handleRelayTooltipOutsideClick);
    document.addEventListener('keydown', handleRelayTooltipKeydown);
  } else {
    document.removeEventListener('pointerdown', handleRelayTooltipOutsideClick);
    document.removeEventListener('keydown', handleRelayTooltipKeydown);
  }
});

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return;
  document.removeEventListener('pointerdown', handleRelayTooltipOutsideClick);
  document.removeEventListener('keydown', handleRelayTooltipKeydown);
});

// 模板管理弹框
const showRuleTemplateModal = ref(false);
function handleRuleTemplatesSaved(savedTemplateId: string): void {
  if (activeMode.value !== 'template' || !savedTemplateId) return;
  const current = String(props.model?.templateConfig || '').trim();
  const stillExists = (ruleTemplates.value || []).some(
    (item) => item && item.enabled !== false && `custom:${item.id}` === current,
  );
  if (!current || (current.startsWith('custom:') && !stillExists)) {
    patchModel({ templateConfig: `custom:${savedTemplateId}` });
  }
}

// 仅在第三方模式下显示的 Subconverter 专属参数
const externalOnlyFlagOptions = computed<Array<{ key: ExternalFlagKey; label: string }>>(() => [
  { key: 'sort', label: t('settings.transformSort') },
  { key: 'tfo', label: 'TCP Fast Open' },
  { key: 'list', label: t('settings.transformList') },
]);

function buildDynamicSubconverterUrl(): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://example.com';
  const params = new URLSearchParams();
  const preset = detectVisualRulePreset(customVisualRules.value.selectedRules);
  if (preset !== 'custom') {
    params.set('selectedRules', preset);
  } else {
    params.set('selectedRules', JSON.stringify(customVisualRules.value.selectedRules || []));
  }
  params.set('group_by_country', customVisualRules.value.groupByCountry ? 'true' : 'false');
  params.set('include_auto_select', customVisualRules.value.includeAutoSelect ? 'true' : 'false');

  const validCustom = (customVisualRules.value.customRules || []).filter((r) => r && String(r.name || '').trim());
  if (validCustom.length > 0) {
    params.set('customRules', JSON.stringify(validCustom));
  }
  return `${origin}${API_ENDPOINTS.SUBCONVERTER_CONFIG}?${params.toString()}`;
}

function fillMisubSubconverterUrl(): void {
  patchExternalBackend({ templateUrl: buildDynamicSubconverterUrl() });
}

// 后端可用性测试
const backendTestStatus = ref<BackendTestStatus | null>(null);
const isTestingBackend = ref(false);
const backendTestToneClass = computed(() => {
  if (!backendTestStatus.value) return 'border-line bg-transparent text-fg-muted';
  return backendTestStatus.value.success
    ? 'border-status-success-border bg-transparent text-status-success'
    : 'border-status-danger-border bg-transparent text-status-danger';
});

watch(
  () => externalRecord.value.url,
  () => {
    backendTestStatus.value = null;
  },
);

async function handleTestBackend(): Promise<void> {
  if (isTestingBackend.value) return;
  isTestingBackend.value = true;
  backendTestStatus.value = null;
  const backend = String(externalRecord.value.url || DEFAULT_SUBCONVERTER_BACKEND);
  try {
    const result = await testSubconverterBackend(backend, 'clash');
    if (String(externalRecord.value.url || DEFAULT_SUBCONVERTER_BACKEND) !== backend) return;
    backendTestStatus.value = {
      success: Boolean(result?.success || ('available' in result && result.available)),
      message: result?.message || result?.error || t('settings.transformBackendTestFailed'),
      endpoint: 'endpoint' in result && typeof result.endpoint === 'string' ? result.endpoint : '',
      elapsedMs: 'elapsedMs' in result && typeof result.elapsedMs === 'number' ? result.elapsedMs : undefined,
    };
  } catch (error: unknown) {
    if (String(externalRecord.value.url || DEFAULT_SUBCONVERTER_BACKEND) === backend) {
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

// 订阅组「跟随全局」模式摘要
const globalSummaryLabel = computed(() => {
  const g = props.globalSettings || {};
  const gMode = String(g.transformMode || 'smart');
  if (gMode === 'external') {
    const gExt = (isRecord(g.externalBackend) ? g.externalBackend : {}) as Record<string, unknown>;
    const backend = String(gExt.url || DEFAULT_SUBCONVERTER_BACKEND);
    return t('profileModal.smartSummaryExternal', { value: backend });
  }

  if (gMode === 'template') {
    const cfgUrl = String(g.templateConfig || '');
    let label = t('profileModal.notSet');
    if (cfgUrl.startsWith('custom:')) {
      const tplId = cfgUrl.slice('custom:'.length);
      const foundTpl = (ruleTemplates.value || []).find((item) => item?.id === tplId);
      label = foundTpl?.name || cfgUrl;
    } else if (cfgUrl) {
      const asset = getLocalizedTransformAssetByUrl(cfgUrl, t) as { name?: string } | null;
      label = asset?.name || t('profileModal.customUrl');
    }
    return t('profileModal.smartSummaryTemplate', { value: label });
  }

  const gPreset = resolveValidSmartPreset(g.smartPreset);
  let presetKey: string = gPreset;
  if (isRecord(g.customVisualRules)) {
    const normalized = normalizeCustomVisualRules(g.customVisualRules, { smartPreset: gPreset });
    presetKey = detectVisualRulePreset(normalized.selectedRules);
  }
  const presetLabelMap: Record<string, string> = {
    minimal: t('settings.visualPresetMinimal'),
    balanced: t('settings.visualPresetBalanced'),
    full: t('settings.visualPresetFull'),
    custom: t('settings.visualPresetCustom'),
  };
  const baseLabel = presetLabelMap[presetKey] || presetKey;
  const summaryValue = g.enableRelay ? `${baseLabel} + ${t('settings.transformRelayBadge')}` : baseLabel;
  return t('profileModal.smartSummarySmart', { value: summaryValue });
});
</script>

<template>
  <div class="space-y-4">
    <!-- 顶层单排互斥模式选择 -->
    <div
      :class="
        isGlobalScope
          ? 'grid w-full grid-cols-3 sm:inline-flex sm:w-auto'
          : 'grid w-full grid-cols-2 sm:inline-flex sm:w-auto'
      "
      class="max-w-full gap-1 rounded-md border border-line bg-inset p-1"
      data-testid="transform-mode-tabs"
      role="tablist"
    >
      <button
        v-for="tab in modeTabs"
        :key="tab.value"
        :aria-selected="activeMode === tab.value"
        :class="
          activeMode === tab.value
            ? 'border-line-strong bg-active font-semibold text-fg'
            : 'border-transparent text-fg-muted hover:bg-hover hover:text-fg'
        "
        :data-testid="`mode-btn-${tab.value}`"
        class="flex min-h-9 items-center justify-center whitespace-nowrap rounded-md border px-2.5 sm:px-4 py-1.5 text-xs font-medium transition-colors"
        role="tab"
        type="button"
        @click="activeMode = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 1. 跟随全局（仅订阅组） -->
    <div
      v-if="activeMode === 'global' && !isGlobalScope"
      class="flex items-center gap-2 rounded-md bg-inset/60 px-3 py-2 text-xs text-fg-muted"
      data-testid="profile-follow-global-summary"
    >
      <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"></span>
      <span>{{ globalSummaryLabel }}</span>
    </div>

    <!-- 2. 智能分流（内置） -->
    <div v-if="activeMode === 'smart'" class="space-y-4" data-testid="smart-mode-panel">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-end">
        <div>
          <label class="mb-1.5 block text-xs font-medium uppercase tracking-wider text-fg-muted">
            {{ t('settings.transformSmartPresetLabel') }}
          </label>
          <Select
            v-model="smartPreset"
            :options="smartPresetOptions"
            data-testid="smart-preset-select"
            :size="isGlobalScope ? 'md' : 'sm'"
          />
        </div>
        <p class="text-xs leading-relaxed text-fg-muted">
          {{ t('settings.transformSmartHint') }}
        </p>
      </div>

      <!-- 智能分流功能开关区（全局） -->
      <div v-if="isGlobalScope" class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div class="setting-switch-card">
          <span class="truncate text-xs font-medium text-fg-muted">{{ t('settings.visualGroupByCountry') }}</span>
          <Switch
            :model-value="Boolean(customVisualRules.groupByCountry)"
            size="sm"
            @update:model-value="patchCustomVisualRules({ groupByCountry: Boolean($event) })"
          />
        </div>
        <div class="setting-switch-card">
          <span class="truncate text-xs font-medium text-fg-muted">{{ t('settings.visualIncludeAutoSelect') }}</span>
          <Switch
            :model-value="Boolean(customVisualRules.includeAutoSelect)"
            size="sm"
            @update:model-value="patchCustomVisualRules({ includeAutoSelect: Boolean($event) })"
          />
        </div>
        <div class="setting-switch-card">
          <div
            ref="relayTooltipRef"
            class="relative group flex min-w-0 items-center gap-1"
            @mouseleave="showRelayTooltip = false"
          >
            <span class="truncate text-xs font-medium text-fg-muted">{{
              t('settings.transformEnableRelayLabel')
            }}</span>
            <button
              :aria-expanded="showRelayTooltip"
              :aria-label="t('settings.transformEnableRelayDesc')"
              class="inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-fg-subtle transition-colors hover:text-fg focus-visible:text-fg focus-visible:outline-hidden"
              data-testid="relay-info-trigger"
              type="button"
              @click.stop="showRelayTooltip = !showRelayTooltip"
            >
              <Info class="h-3.5 w-3.5" />
            </button>
            <div
              :class="
                showRelayTooltip
                  ? 'opacity-100 visible pointer-events-auto'
                  : 'opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto'
              "
              class="popover-surface absolute left-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-4rem)] rounded-lg p-3 text-xs leading-relaxed text-fg-muted transition-opacity duration-150 sm:left-auto sm:right-0"
              data-testid="relay-info-tooltip"
              role="tooltip"
            >
              {{ t('settings.transformEnableRelayDesc') }}
            </div>
          </div>
          <Switch
            :model-value="Boolean(model?.enableRelay)"
            data-testid="toggle-enable-relay"
            size="sm"
            @update:model-value="patchModel({ enableRelay: Boolean($event) })"
          />
        </div>
      </div>
    </div>

    <!-- 订阅组三态链式中转覆写（跟随全局且全局为智能分流，或覆盖为智能分流时均可用） -->
    <div v-if="showProfileRelayOverride" class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0 space-y-0.5">
        <div
          ref="relayTooltipRef"
          class="relative group inline-flex max-w-full items-center gap-1"
          @mouseleave="showRelayTooltip = false"
        >
          <span class="text-xs font-medium text-fg">{{ t('settings.transformEnableRelayLabel') }}</span>
          <button
            :aria-expanded="showRelayTooltip"
            :aria-label="t('settings.transformEnableRelayDesc')"
            class="inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-fg-subtle transition-colors hover:text-fg focus-visible:text-fg focus-visible:outline-hidden"
            data-testid="relay-info-trigger"
            type="button"
            @click.stop="showRelayTooltip = !showRelayTooltip"
          >
            <Info class="h-3.5 w-3.5" />
          </button>
          <div
            :class="
              showRelayTooltip
                ? 'opacity-100 visible pointer-events-auto'
                : 'opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto'
            "
            class="popover-surface absolute left-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-4rem)] rounded-lg p-3 text-xs leading-relaxed text-fg-muted transition-opacity duration-150"
            data-testid="relay-info-tooltip"
            role="tooltip"
          >
            {{ t('settings.transformEnableRelayDesc') }}
          </div>
        </div>
        <div v-if="model?.enableRelay == null" class="flex items-center gap-1.5 pt-0.5 text-xs text-fg-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-zinc-400"></span>
          <span>
            {{
              t('profileModal.currentGlobal', {
                value: globalSettings?.enableRelay ? t('profileModal.on') : t('profileModal.off'),
              })
            }}
          </span>
        </div>
      </div>
      <div class="w-full shrink-0 sm:w-44">
        <Select
          :model-value="(model?.enableRelay as boolean | null | undefined) ?? null"
          :options="triStateRelayOptions"
          data-testid="profile-override-relay"
          size="sm"
          @update:model-value="patchModel({ enableRelay: ($event as boolean | null) ?? null })"
        />
      </div>
    </div>

    <!-- 折叠式可视化分类勾选与自定义规则 -->
    <div v-if="activeMode === 'smart'" class="border-t border-line pt-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <button
          class="flex items-center gap-2 rounded-md py-1 text-xs font-medium text-fg-muted transition-colors hover:text-fg"
          data-testid="toggle-visual-customize"
          type="button"
          @click="showVisualCustomize = !showVisualCustomize"
        >
          <ChevronDown :class="{ 'rotate-180': showVisualCustomize }" class="h-4 w-4 transition-transform" />
          <span>{{ t('settings.transformCustomizeRules') }}</span>
          <span
            v-if="
              smartPreset === 'custom' || (customVisualRules.customRules && customVisualRules.customRules.length > 0)
            "
            class="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent"
          >
            {{ customVisualRules.selectedRules.length }}
          </span>
        </button>

        <button
          v-if="!isGlobalScope"
          class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          data-testid="sync-global-visual-rules"
          type="button"
          @click="syncVisualRulesFromGlobal"
        >
          <RotateCcw class="h-3 w-3" />
          <span>{{ t('profileModal.syncGlobalVisualRules') }}</span>
        </button>
      </div>

      <div v-if="showVisualCustomize" class="mt-4">
        <VisualTransformCard
          :custom-visual-rules="customVisualRules"
          :smart-preset="effectiveSmartPresetSetting"
          @update:custom-visual-rules="patchCustomVisualRules($event)"
        />
      </div>
    </div>

    <!-- 3. 规则模板（内置本地渲染） -->
    <div v-if="activeMode === 'template'" class="space-y-2" data-testid="template-mode-panel">
      <div class="flex items-center justify-between gap-2">
        <label class="block text-xs font-medium uppercase tracking-wider text-fg-muted">
          {{ isGlobalScope ? t('settings.transformTemplateConfig') : t('profileModal.templateLabel') }}
        </label>
        <button
          class="inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          data-testid="open-rule-templates-modal"
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
        :allowEmpty="false"
        :custom-placeholder="t('settings.transformRemotePlaceholder')"
        :exclude-builtin-assets="false"
        :model-value="String(model?.templateConfig || '')"
        :placeholder="t('settings.transformPresetPlaceholder')"
        type="config"
        @update:model-value="patchModel({ templateConfig: String($event ?? '') })"
      />
      <p class="text-xs leading-relaxed text-fg-muted">
        {{ t('settings.transformTemplateUnifiedHint') }}
      </p>
    </div>

    <!-- 4. 第三方后端 (Subconverter) -->
    <div v-else-if="activeMode === 'external'" class="space-y-5" data-testid="external-backend-card">
      <!-- 全局第三方配置 -->
      <template v-if="isGlobalScope">
        <div>
          <div class="mb-1.5 flex items-center gap-2">
            <Server class="h-3.5 w-3.5 text-fg-muted" />
            <label class="block text-xs font-medium text-fg-muted">{{ t('settings.transformBackend') }}</label>
          </div>
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              :model-value="effectiveBackendUrl"
              :options="
                SUBCONVERTER_BACKENDS.map((backend) => ({
                  value: backend.value,
                  label: `${t(backend.labelKey)} · ${backend.description}`,
                }))
              "
              size="sm"
              trigger-class="font-mono"
              @update:model-value="patchExternalBackend({ url: String($event ?? '') })"
            />
            <input
              :aria-label="t('settings.transformCustomBackend')"
              :value="effectiveBackendUrl"
              class="block w-full rounded-md border border-line bg-inset px-3 py-2 text-xs font-mono text-fg focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong"
              placeholder="subapi.cmliussss.net"
              type="text"
              @input="patchExternalBackend({ url: ($event.target as HTMLInputElement).value })"
            />
          </div>
          <p class="mt-2 text-xs leading-relaxed text-fg-muted">
            {{ t('settings.transformBackendHint') }}
          </p>
          <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              :aria-busy="isTestingBackend"
              :disabled="isTestingBackend"
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
            class="mt-3 border-l-2 py-1 pl-3 text-xs leading-relaxed"
            data-testid="subconverter-backend-test-result"
          >
            <div class="flex items-center gap-2 font-medium">
              <span
                :class="backendTestStatus.success ? 'bg-emerald-500' : 'bg-red-500'"
                class="h-1.5 w-1.5 shrink-0 rounded-full"
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

        <div class="space-y-2 border-t border-line pt-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <label class="block text-xs font-medium text-fg-muted">
              {{ t('settings.transformTemplateConfig') }}
            </label>
            <button
              class="inline-flex items-center gap-1 rounded-md border border-line bg-inset px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
              data-testid="fill-misub-subconverter-url"
              type="button"
              @click="fillMisubSubconverterUrl"
            >
              {{ t('settings.transformFillMisubConfigUrl') }}
            </button>
          </div>
          <TransformSelector
            :allowEmpty="true"
            :custom-placeholder="t('settings.transformRemotePlaceholder')"
            :exclude-builtin-assets="true"
            :model-value="String(externalRecord.templateUrl || '')"
            :placeholder="t('settings.transformPresetPlaceholder')"
            type="config"
            @update:model-value="patchExternalBackend({ templateUrl: String($event ?? '') })"
          />
          <p class="text-xs leading-relaxed text-fg-muted">
            {{ t('settings.transformTemplateExternalHint') }}
          </p>
        </div>

        <div class="space-y-2.5 border-t border-line pt-4">
          <p class="text-xs font-medium text-fg-muted">{{ t('settings.transformExternalExtraFlags') }}</p>
          <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div v-for="flag in externalOnlyFlagOptions" :key="flag.key" class="setting-switch-card">
              <span :title="flag.label" class="truncate text-xs font-medium text-fg-muted">{{ flag.label }}</span>
              <Switch
                :model-value="Boolean(externalRecord[flag.key])"
                size="xs"
                @update:model-value="patchExternalBackend({ [flag.key]: Boolean($event) })"
              />
            </div>
          </div>
        </div>
      </template>

      <!-- 订阅组第三方配置 -->
      <template v-else>
        <div>
          <label class="mb-1.5 block text-xs font-medium text-fg-muted">{{ t('profileModal.backendOverride') }}</label>
          <input
            :placeholder="t('profileModal.backendPlaceholder')"
            :value="effectiveBackendUrl"
            class="block w-full rounded-md border border-line bg-inset px-3 py-2 font-mono text-xs text-fg placeholder:text-fg-subtle focus:border-line-strong focus-visible:outline-hidden"
            type="text"
            @input="patchExternalBackend({ url: ($event.target as HTMLInputElement).value })"
          />
          <p class="mt-1.5 text-xs leading-relaxed text-fg-subtle">
            {{ t('profileModal.backendHint') }}
          </p>
          <div v-if="!effectiveBackendUrl" class="mt-1.5 flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 rounded-full bg-zinc-400"></span>
            <span class="text-xs text-fg-muted">
              {{
                t('profileModal.currentGlobal', {
                  value: globalSettings?.externalBackend?.url || t('profileModal.notSet'),
                })
              }}
            </span>
          </div>
        </div>

        <div class="space-y-2 border-t border-line pt-4">
          <label class="block text-xs font-medium text-fg-muted">{{ t('profileModal.templateLabel') }}</label>
          <TransformSelector
            :allowEmpty="true"
            :custom-placeholder="t('profileModal.remoteTemplatePlaceholder')"
            :exclude-builtin-assets="true"
            :model-value="String(externalRecord.templateUrl || '')"
            :placeholder="t('profileModal.presetPlaceholder')"
            type="config"
            @update:model-value="patchExternalBackend({ templateUrl: String($event ?? '') })"
          />
          <p class="text-xs leading-relaxed text-fg-muted">
            {{ t('profileModal.externalEngineHint') }}
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-3">
          <div v-for="flag in externalOnlyFlagOptions" :key="flag.key" class="space-y-1.5">
            <label class="block text-xs font-medium uppercase text-fg-muted">{{ flag.label }}</label>
            <Select
              :model-value="(externalRecord[flag.key] as boolean | null | undefined) ?? null"
              :options="[
                { value: null, label: t('profileModal.followGlobal') },
                { value: true, label: t('profileModal.on') },
                { value: false, label: t('profileModal.off') },
              ]"
              size="sm"
              @update:model-value="patchExternalBackend({ [flag.key]: $event as boolean | null })"
            />
          </div>
        </div>
      </template>
    </div>

    <RuleTemplateModal
      v-if="showRuleTemplateModal"
      v-model:show="showRuleTemplateModal"
      @saved="handleRuleTemplatesSaved"
    />
  </div>
</template>
