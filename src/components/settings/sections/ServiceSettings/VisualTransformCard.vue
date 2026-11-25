<script setup lang="ts" generic="T extends { builtinTransform?: BuiltinTransformConfig }">
import { computed, ref, watch } from 'vue';
import * as yaml from 'js-yaml';
import type { BuiltinTransformConfig, CustomVisualRule } from '@misub/core/types.js';
import { Check, Code2, Copy, Plus, Sliders, Trash2 } from '@lucide/vue';
import Select from '@/components/ui/Select.vue';
import { API_ENDPOINTS } from '@/constants/api-endpoints.js';
import { useI18n } from '@/i18n/index.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';
import {
  DEFAULT_BUILTIN_TRANSFORM,
  detectVisualRulePreset,
  normalizeBuiltinTransform,
  normalizeCustomRule,
  VISUAL_RULE_CATEGORIES,
  VISUAL_RULE_PRESETS,
} from '@misub/core/domain/visual-rules-catalog.js';

const { t, locale } = useI18n();

const props = withDefaults(
  defineProps<{
    settings: T;
    section?: string; // 'rules' | 'advanced'
  }>(),
  {
    section: 'rules',
  },
);

const emit = defineEmits<{
  'update:settings': [value: T];
}>();

const bt = computed<BuiltinTransformConfig>(() =>
  normalizeBuiltinTransform(props.settings?.builtinTransform || DEFAULT_BUILTIN_TRANSFORM),
);

function updateBt(patch: Partial<BuiltinTransformConfig>): void {
  emit('update:settings', {
    ...props.settings,
    builtinTransform: {
      ...bt.value,
      ...patch,
    },
  });
}

const isZh = computed(() => String(locale?.value || 'zh-CN').startsWith('zh'));

// --- 1. 规则选择 ---
const presetOptions = computed(() => [
  { value: 'minimal', label: t('settings.visualPresetMinimal') },
  { value: 'balanced', label: t('settings.visualPresetBalanced') },
  { value: 'comprehensive', label: t('settings.visualPresetComprehensive') },
  { value: 'custom', label: t('settings.visualPresetCustom'), disabled: true },
]);

const currentPreset = computed({
  get: () => detectVisualRulePreset(bt.value.selectedRules),
  set: (preset: string) => {
    if (VISUAL_RULE_PRESETS[preset]) {
      updateBt({
        selectedRules: [...VISUAL_RULE_PRESETS[preset]],
        rulePreset: preset,
      });
    }
  },
});

function isRuleSelected(ruleId: string) {
  return Array.isArray(bt.value.selectedRules) && bt.value.selectedRules.includes(ruleId);
}

function toggleRule(ruleId: string) {
  const current: string[] = Array.isArray(bt.value.selectedRules) ? [...bt.value.selectedRules] : [];
  const idx = current.indexOf(ruleId);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push(ruleId);
  }
  updateBt({
    selectedRules: current,
    rulePreset: detectVisualRulePreset(current),
  });
}

function getCategoryLabel(cat: { labelZh: string; labelEn: string }) {
  return isZh.value ? cat.labelZh : cat.labelEn;
}

// --- 2. 自定义规则 ---
const customRuleMode = ref('form'); // 'form' | 'json'
const customRuleJsonText = ref('');
const customRuleJsonError = ref('');

const actionOptions = computed(() => [
  { value: 'proxy', label: t('settings.visualActionProxy') },
  { value: 'direct', label: t('settings.visualActionDirect') },
  { value: 'reject', label: t('settings.visualActionReject') },
]);

function syncJsonFromCustomRules() {
  customRuleJsonText.value = JSON.stringify(bt.value.customRules || [], null, 2);
  customRuleJsonError.value = '';
}

watch(customRuleMode, (mode) => {
  if (mode === 'json') {
    syncJsonFromCustomRules();
  }
});

function addCustomRule() {
  const nextRules: CustomVisualRule[] = [
    ...(bt.value.customRules || []),
    {
      name: '',
      action: 'proxy',
      domainSuffix: [],
      domainKeyword: [],
      ipCidr: [],
      srcIpCidr: [],
      ruleSet: [],
    },
  ];
  updateBt({ customRules: nextRules });
}

function removeCustomRule(index: number) {
  updateBt({
    customRules: (bt.value.customRules || []).filter((_, idx) => idx !== index),
  });
}

function updateCustomRule(index: number, patch: Partial<CustomVisualRule>) {
  const nextRules = (bt.value.customRules || []).map((rule, idx) =>
    idx === index ? { ...rule, ...patch } : rule,
  );
  updateBt({ customRules: nextRules });
}

function formatListField(list: unknown) {
  return Array.isArray(list) ? list.join(', ') : '';
}

function updateListField(
  index: number,
  key: 'domainSuffix' | 'domainKeyword' | 'ipCidr' | 'srcIpCidr',
  rawValue: string,
) {
  const nextList = String(rawValue || '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  updateCustomRule(index, { [key]: nextList } as Partial<CustomVisualRule>);
}

function handleCustomRuleJsonInput(event: Event) {
  const raw = (event.target as HTMLTextAreaElement).value;
  customRuleJsonText.value = raw;
  if (!raw.trim()) {
    updateBt({ customRules: [] });
    customRuleJsonError.value = '';
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      customRuleJsonError.value = t('settings.visualCustomRulesJsonArrayError');
      return;
    }
    const normalized = parsed
      .map(normalizeCustomRule)
      .filter((item): item is CustomVisualRule => Boolean(item));
    updateBt({ customRules: normalized });
    customRuleJsonError.value = '';
  } catch {
    customRuleJsonError.value = t('settings.visualCustomRulesJsonInvalid');
  }
}

// --- 3. Subconverter 外部配置链接 ---
const copiedSubconverterUrl = ref(false);

const subconverterConfigUrl = computed(() => {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://example.com';
  const params = new URLSearchParams();
  const preset = detectVisualRulePreset(bt.value.selectedRules);
  if (preset !== 'custom') {
    params.set('selectedRules', preset);
  } else {
    params.set('selectedRules', JSON.stringify(bt.value.selectedRules || []));
  }
  params.set('group_by_country', bt.value.groupByCountry ? 'true' : 'false');
  params.set('include_auto_select', bt.value.includeAutoSelect ? 'true' : 'false');

  const validCustom = (bt.value.customRules || []).filter((r) => r && String(r.name || '').trim());
  if (validCustom.length > 0) {
    params.set('customRules', JSON.stringify(validCustom));
  }
  return `${origin}${API_ENDPOINTS.SUBCONVERTER_CONFIG}?${params.toString()}`;
});

async function copySubconverterUrl() {
  const copied = await copyTextToClipboard(subconverterConfigUrl.value);
  if (copied) {
    copiedSubconverterUrl.value = true;
    setTimeout(() => {
      copiedSubconverterUrl.value = false;
    }, 2000);
  }
}

// --- 4. 基础配置设置 ---
type BaseConfigTarget = 'singbox' | 'clash' | 'surge';
const activeBaseConfigTarget = ref<BaseConfigTarget>('singbox');

const baseConfigTargetOptions = [
  { value: 'singbox', label: 'Sing-Box (JSON)' },
  { value: 'clash', label: 'Clash / Mihomo (YAML)' },
  { value: 'surge', label: 'Surge (INI)' },
];

const activeBaseConfigText = computed({
  get: () => bt.value.baseConfig?.[activeBaseConfigTarget.value] || '',
  set: (val: string) => {
    const baseConfig = bt.value.baseConfig || { singbox: '', clash: '', surge: '' };
    updateBt({
      baseConfig: {
        ...baseConfig,
        [activeBaseConfigTarget.value]: val,
      },
    });
  },
});

const baseConfigValidationError = computed(() => {
  const raw = String(activeBaseConfigText.value || '').trim();
  if (!raw) return '';
  if (activeBaseConfigTarget.value === 'singbox') {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return t('settings.visualBaseConfigMustBeObject');
      }
      return '';
    } catch {
      return t('settings.dnsOverrideInvalidJson');
    }
  }
  if (activeBaseConfigTarget.value === 'clash') {
    try {
      const parsed = yaml.load(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return t('settings.visualBaseConfigMustBeObject');
      }
      return '';
    } catch {
      return t('settings.dnsOverrideInvalidYaml');
    }
  }
  return '';
});

function clearActiveBaseConfig() {
  activeBaseConfigText.value = '';
}
</script>

<template>
  <!-- 模式 A：可视化规则勾选 + 自定义规则（嵌入在「分流规则」卡片内） -->
  <div v-if="section === 'rules'" class="space-y-5" data-testid="visual-rules-editor">
    <!-- 规则勾选网格 -->
    <div class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 class="text-xs font-semibold text-fg">{{ t('settings.visualRulesTitle') }}</h4>
          <p class="mt-0.5 text-xs text-fg-muted">{{ t('settings.visualRulesGridHint') }}</p>
        </div>
        <div class="w-28">
          <Select v-model="currentPreset" :options="presetOptions" size="sm" />
        </div>
      </div>

      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label
          v-for="cat in VISUAL_RULE_CATEGORIES"
          :key="cat.id"
          :class="
            isRuleSelected(cat.id)
              ? 'border-accent/60 bg-accent/10 text-fg'
              : 'border-line bg-inset text-fg-muted hover:border-line-strong hover:text-fg'
          "
          class="flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors select-none"
        >
          <input
            :checked="isRuleSelected(cat.id)"
            class="h-3.5 w-3.5 rounded border-line bg-surface accent-accent"
            type="checkbox"
            @change="toggleRule(cat.id)"
          />
          <span class="text-sm leading-none">{{ cat.emoji }}</span>
          <span class="truncate">{{ getCategoryLabel(cat) }}</span>
        </label>
      </div>
    </div>

    <!-- 自定义规则 -->
    <div class="border-t border-line pt-5 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 class="text-xs font-semibold text-fg">{{ t('settings.visualCustomRulesTitle') }}</h4>
          <p class="mt-0.5 text-xs text-fg-muted">{{ t('settings.visualCustomRulesDesc') }}</p>
        </div>
        <div class="flex rounded-md border border-line bg-inset p-0.5">
          <button
            :class="
              customRuleMode === 'form' ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:bg-hover hover:text-fg'
            "
            class="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors"
            type="button"
            @click="customRuleMode = 'form'"
          >
            <Sliders class="h-3 w-3" />
            {{ t('settings.visualModeForm') }}
          </button>
          <button
            :class="
              customRuleMode === 'json' ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:bg-hover hover:text-fg'
            "
            class="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors"
            type="button"
            @click="customRuleMode = 'json'"
          >
            <Code2 class="h-3 w-3" />
            {{ t('settings.visualModeJson') }}
          </button>
        </div>
      </div>

      <div v-if="customRuleMode === 'form'" class="space-y-3">
        <div
          v-if="!bt.customRules || bt.customRules.length === 0"
          class="flex items-center justify-between rounded-md border border-dashed border-line bg-inset px-4 py-3"
        >
          <p class="text-xs text-fg-muted">{{ t('settings.visualCustomRulesEmpty') }}</p>
          <button
            class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90"
            data-testid="add-custom-rule-btn"
            type="button"
            @click="addCustomRule"
          >
            <Plus class="h-3.5 w-3.5" />
            {{ t('settings.visualAddCustomRule') }}
          </button>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="(rule, index) in bt.customRules"
            :key="index"
            class="rounded-md border border-line bg-inset/40 p-4 space-y-3"
          >
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
              <div class="sm:col-span-6">
                <label class="mb-1 block text-xs font-medium text-fg-muted">
                  {{ t('settings.visualCustomRuleName') }}
                </label>
                <input
                  :placeholder="t('settings.visualCustomRuleNamePlaceholder')"
                  :value="rule.name"
                  class="block h-8 w-full rounded-md border border-line bg-inset px-3 text-xs text-fg shadow-none focus:border-line-strong"
                  type="text"
                  @input="updateCustomRule(index, { name: ($event.target as HTMLInputElement).value })"
                />
              </div>
              <div class="sm:col-span-4">
                <label class="mb-1 block text-xs font-medium text-fg-muted">
                  {{ t('settings.visualCustomRuleAction') }}
                </label>
                <Select
                  :model-value="rule.action"
                  :options="actionOptions"
                  size="sm"
                  @update:model-value="
                    updateCustomRule(index, { action: String($event) as CustomVisualRule['action'] })
                  "
                />
              </div>
              <div class="flex justify-end sm:col-span-2">
                <button
                  :aria-label="t('actions.delete')"
                  class="inline-flex h-8 items-center gap-1 rounded-md border border-line bg-transparent px-2.5 text-xs text-status-danger shadow-none transition-colors hover:bg-status-danger-bg hover:border-status-danger-border"
                  type="button"
                  @click="removeCustomRule(index)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                  <span>{{ t('actions.delete') }}</span>
                </button>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs font-medium text-fg-muted">
                  {{ t('settings.visualDomainSuffix') }}
                </label>
                <input
                  :value="formatListField(rule.domainSuffix)"
                  class="block h-8 w-full rounded-md border border-line bg-inset px-3 font-mono text-xs text-fg shadow-none focus:border-line-strong"
                  placeholder="example.com, internal.local"
                  type="text"
                  @input="updateListField(index, 'domainSuffix', ($event.target as HTMLInputElement).value)"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-fg-muted">
                  {{ t('settings.visualDomainKeyword') }}
                </label>
                <input
                  :value="formatListField(rule.domainKeyword)"
                  class="block h-8 w-full rounded-md border border-line bg-inset px-3 font-mono text-xs text-fg shadow-none focus:border-line-strong"
                  placeholder="openai, company"
                  type="text"
                  @input="updateListField(index, 'domainKeyword', ($event.target as HTMLInputElement).value)"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-fg-muted">
                  {{ t('settings.visualIpCidr') }}
                </label>
                <input
                  :value="formatListField(rule.ipCidr)"
                  class="block h-8 w-full rounded-md border border-line bg-inset px-3 font-mono text-xs text-fg shadow-none focus:border-line-strong"
                  placeholder="10.0.0.0/8, 192.168.1.0/24"
                  type="text"
                  @input="updateListField(index, 'ipCidr', ($event.target as HTMLInputElement).value)"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-fg-muted">
                  {{ t('settings.visualSrcIpCidr') }}
                </label>
                <input
                  :value="formatListField(rule.srcIpCidr)"
                  class="block h-8 w-full rounded-md border border-line bg-inset px-3 font-mono text-xs text-fg shadow-none focus:border-line-strong"
                  placeholder="192.168.1.100/32"
                  type="text"
                  @input="updateListField(index, 'srcIpCidr', ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>

          <button
            class="inline-flex items-center gap-1.5 rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            type="button"
            @click="addCustomRule"
          >
            <Plus class="h-3.5 w-3.5" />
            {{ t('settings.visualAddCustomRule') }}
          </button>
        </div>
      </div>

      <div v-else class="space-y-2">
        <textarea
          :placeholder="t('settings.visualCustomRulesJsonPlaceholder')"
          :value="customRuleJsonText"
          class="block min-h-[140px] w-full rounded-md border border-line bg-inset p-3 font-mono text-xs text-fg focus:border-line-strong"
          @input="handleCustomRuleJsonInput"
        />
        <p v-if="customRuleJsonError" class="text-xs text-status-danger">
          {{ customRuleJsonError }}
        </p>
      </div>
    </div>

    <!-- 导出为 Subconverter 外部配置链接（由上方可视化规则动态生成） -->
    <div class="border-t border-line pt-4 space-y-2">
      <div>
        <h4 class="text-xs font-semibold text-fg">{{ t('settings.visualSubconverterTitle') }}</h4>
        <p class="mt-0.5 text-xs text-fg-muted">{{ t('settings.visualSubconverterDesc') }}</p>
      </div>
      <div class="flex flex-col gap-2 sm:flex-row">
        <input
          :value="subconverterConfigUrl"
          class="block w-full rounded-md border border-line bg-inset px-3 py-2 font-mono text-xs text-fg-muted"
          data-testid="subconverter-config-url"
          readonly
          type="text"
        />
        <button
          class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-line bg-elevated-card px-3.5 py-2 text-xs font-medium text-fg transition-colors hover:bg-hover"
          data-testid="copy-subconverter-config-url"
          type="button"
          @click="copySubconverterUrl"
        >
          <Check v-if="copiedSubconverterUrl" class="h-3.5 w-3.5 text-status-success" />
          <Copy v-else class="h-3.5 w-3.5" />
          <span>{{
            copiedSubconverterUrl ? t('settings.visualCopied') : t('settings.visualCopySubconverterUrl')
          }}</span>
        </button>
      </div>
    </div>
  </div>

  <!-- 模式 B：折叠高级选项（仅基础配置覆写） -->
  <div v-else class="space-y-2.5" data-testid="visual-advanced-editor">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h4 class="text-xs font-semibold text-fg">{{ t('settings.visualBaseConfigTitle') }}</h4>
        <p class="mt-0.5 text-xs text-fg-muted">{{ t('settings.visualBaseConfigDesc') }}</p>
      </div>
      <div class="w-44">
        <Select v-model="activeBaseConfigTarget" :options="baseConfigTargetOptions" size="sm" />
      </div>
    </div>

    <textarea
      v-model="activeBaseConfigText"
      :placeholder="t('settings.visualBaseConfigPlaceholder')"
      class="block min-h-[130px] w-full rounded-md border border-line bg-inset p-3 font-mono text-xs text-fg focus:border-line-strong"
    />
    <div class="flex items-center justify-between gap-2">
      <p v-if="baseConfigValidationError" class="text-xs text-status-danger">
        {{ baseConfigValidationError }}
      </p>
      <p v-else class="text-xs text-fg-muted">
        {{ t('settings.visualBaseConfigHint') }}
      </p>
      <button
        v-if="activeBaseConfigText"
        class="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-transparent px-2.5 py-1 text-xs font-medium text-status-danger transition-colors hover:bg-status-danger-bg hover:border-status-danger-border"
        type="button"
        @click="clearActiveBaseConfig"
      >
        <Trash2 class="h-3 w-3" />
        {{ t('settings.visualBaseConfigClear') }}
      </button>
    </div>
  </div>
</template>
