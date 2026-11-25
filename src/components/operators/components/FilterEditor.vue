<script setup lang="ts">
import { computed } from 'vue';
import { X } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import type { OperatorFilterParams, RegexRuleObject } from '@misub/core/types.js';

type NormalizedFilterParams = {
  include: { enabled: boolean; rules: RegexRuleObject[] };
  exclude: { enabled: boolean; rules: RegexRuleObject[] };
  protocols: { enabled: boolean; values: string[] };
  regions: { enabled: boolean; values: string[] };
};

type RuleSectionKey = 'include' | 'exclude';
type ValueSectionKey = 'protocols' | 'regions';

const props = withDefaults(
  defineProps<{
    modelValue?: OperatorFilterParams;
  }>(),
  {
    modelValue: () => ({}),
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: OperatorFilterParams];
}>();
const { t, locale } = useI18n();

const params = computed<NormalizedFilterParams>({
  get: () => {
    const rawInclude = props.modelValue.include;
    const rawExclude = props.modelValue.exclude;
    return {
      include: {
        enabled: false,
        ...rawInclude,
        rules: (Array.isArray(rawInclude?.rules) ? rawInclude.rules : []) as RegexRuleObject[],
      },
      exclude: {
        enabled: false,
        ...rawExclude,
        rules: (Array.isArray(rawExclude?.rules) ? rawExclude.rules : []) as RegexRuleObject[],
      },
      protocols: { enabled: false, values: [], ...props.modelValue.protocols },
      regions: { enabled: false, values: [], ...props.modelValue.regions },
    };
  },
  set: (val: NormalizedFilterParams) => emit('update:modelValue', val),
});

const updateParam = <K extends keyof NormalizedFilterParams>(key: K, value: NormalizedFilterParams[K]): void => {
  const newParams: NormalizedFilterParams = { ...params.value, [key]: value };
  emit('update:modelValue', newParams);
};

const addRule = (type: RuleSectionKey): void => {
  const current = { ...params.value[type] };
  current.rules = [...(current.rules || []), { pattern: '', flags: 'i' }];
  updateParam(type, current);
};

const normalizeRuleFlags = (type: RuleSectionKey, index: number): void => {
  const current = { ...params.value[type] };
  current.rules = [...(current.rules || [])];
  const rule = current.rules[index];
  if (!rule) return;
  current.rules[index] = { ...rule, flags: 'i' };
  updateParam(type, current);
};

const removeRule = (type: RuleSectionKey, index: number): void => {
  const current = { ...params.value[type] };
  current.rules = [...current.rules];
  current.rules.splice(index, 1);
  updateParam(type, current);
};

const commonProtocols = ['vless', 'vmess', 'trojan', 'ss', 'hysteria2', 'socks'];
const commonRegions = ['香港', '美国', '日本', '新加坡', '台湾', '韩国', '英国', '德国'];
const regionLabels: Record<string, string> = {
  香港: 'Hong Kong',
  美国: 'United States',
  日本: 'Japan',
  新加坡: 'Singapore',
  台湾: 'Taiwan',
  韩国: 'South Korea',
  英国: 'United Kingdom',
  德国: 'Germany',
};
const statusLabel = (enabled: boolean): string => t(enabled ? 'operators.statusOn' : 'operators.statusOff');
const regionLabel = (region: string): string =>
  t('operators.regionLabel', { region: locale.value === 'en-US' ? regionLabels[region] || region : region });

const toggleValue = (type: ValueSectionKey, value: string): void => {
  const current = { ...params.value[type] };
  const values = new Set(current.values || []);
  if (values.has(value)) {
    values.delete(value);
  } else {
    values.add(value);
  }
  current.values = Array.from(values);
  updateParam(type, current);
};
</script>

<template>
  <div class="space-y-5">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-xs font-semibold text-fg-muted uppercase tracking-tight">{{
            t('operators.protocolLimit')
          }}</label>
          <button
            :class="[
              'rounded px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-hover hover:text-fg',
              params.protocols.enabled ? 'text-fg' : 'text-fg-subtle',
            ]"
            @click="
              updateParam('protocols', {
                ...params.protocols,
                enabled: !params.protocols.enabled,
              })
            "
          >
            {{ statusLabel(params.protocols.enabled) }}
          </button>
        </div>
        <div
          v-if="params.protocols.enabled"
          class="flex flex-wrap gap-1.5 p-2 bg-transparent rounded-md border border-line"
        >
          <button
            v-for="p in commonProtocols"
            :key="p"
            :class="[
              'px-2 py-1 rounded-md font-mono text-xs font-semibold uppercase transition-all',
              params.protocols.values?.includes(p)
                ? 'bg-accent text-accent-fg'
                : 'bg-transparent text-fg-muted border border-line hover:bg-hover hover:text-fg',
            ]"
            @click="toggleValue('protocols', p)"
          >
            {{ p }}
          </button>
        </div>
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-xs font-semibold text-fg-muted uppercase tracking-tight">{{
            t('operators.regionLimit')
          }}</label>
          <button
            :class="[
              'rounded px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-hover hover:text-fg',
              params.regions.enabled ? 'text-fg' : 'text-fg-subtle',
            ]"
            @click="
              updateParam('regions', {
                ...params.regions,
                enabled: !params.regions.enabled,
              })
            "
          >
            {{ statusLabel(params.regions.enabled) }}
          </button>
        </div>
        <div
          v-if="params.regions.enabled"
          class="flex flex-wrap gap-1.5 p-2 bg-transparent rounded-md border border-line"
        >
          <button
            v-for="r in commonRegions"
            :key="r"
            :class="[
              'px-2 py-1 rounded-md text-xs font-semibold transition-all',
              params.regions.values?.includes(r)
                ? 'bg-accent text-accent-fg'
                : 'bg-transparent text-fg-muted border border-line hover:bg-hover hover:text-fg',
            ]"
            @click="toggleValue('regions', r)"
          >
            {{ regionLabel(r) }}
          </button>
        </div>
      </div>
    </div>

    <div v-for="type in (['include', 'exclude'] as const)" :key="type" class="space-y-2">
      <div class="flex items-center justify-between">
        <label class="text-xs font-semibold text-fg-muted uppercase tracking-tight">
          {{ t(type === 'include' ? 'operators.includeRegex' : 'operators.excludeRegex') }}
        </label>
        <div class="flex items-center gap-2">
          <button
            v-if="params[type].enabled"
            class="rounded px-1.5 py-0.5 text-xs font-semibold text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            @click="addRule(type)"
          >
            + {{ t('operators.add') }}
          </button>
          <button
            :class="[
              'rounded px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-hover hover:text-fg',
              params[type].enabled ? 'text-fg' : 'text-fg-subtle',
            ]"
            @click="updateParam(type, { ...params[type], enabled: !params[type].enabled })"
          >
            {{ statusLabel(params[type].enabled) }}
          </button>
        </div>
      </div>

      <div v-if="params[type].enabled" class="space-y-1.5">
        <div v-for="(rule, idx) in params[type].rules" :key="idx" class="flex items-center gap-2 group">
          <input
            v-model="rule.pattern"
            :aria-label="t('operators.regexPlaceholder')"
            :placeholder="t('operators.regexPlaceholder')"
            class="flex-1 px-3 py-1.5 font-mono text-xs rounded-md bg-inset border border-line text-fg placeholder:text-fg-subtle focus:border-line-strong transition-all outline-none"
            @input="normalizeRuleFlags(type, idx)"
          />
          <button
            :aria-label="t('operators.removeRule')"
            class="p-1.5 text-fg-subtle hover:text-red-400 touch-target"
            @click="removeRule(type, idx)"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
        <p class="text-xs text-fg-subtle px-1">
          {{ t('operators.regexFlagsHint') }}
        </p>
        <div v-if="!params[type].rules?.length" class="text-center py-2 text-xs text-fg-subtle italic">
          {{ t('operators.filterEmptyRules') }}
        </div>
      </div>
    </div>
  </div>
</template>
