<script setup>
import { ChevronDown, X } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();

const updateParam = (key, value) => {
  const newParams = { ...props.modelValue };
  newParams[key] = { ...newParams[key], ...value };
  emit('update:modelValue', newParams);
};

const updateTemplate = (updates) => {
  const current = props.modelValue.template || { enabled: false, template: '', offset: 1 };
  updateParam('template', { ...current, ...updates });
};

const addRule = () => {
  const current = { ...(props.modelValue.regex || { enabled: true, rules: [] }) };
  current.rules = [...(current.rules || []), { pattern: '', replacement: '', flags: 'g' }];
  updateParam('regex', current);
};

const normalizeRuleFlags = (index) => {
  const current = { ...(props.modelValue.regex || { rules: [] }) };
  current.rules = [...(current.rules || [])];
  const rule = current.rules[index];
  if (!rule) return;
  current.rules[index] = { ...rule, flags: 'gi' };
  updateParam('regex', current);
};

const removeRule = (index) => {
  const current = { ...(props.modelValue.regex || { rules: [] }) };
  current.rules = [...current.rules];
  current.rules.splice(index, 1);
  updateParam('regex', current);
};

// 预设模板
const presetTemplates = [
  {
    nameKey: 'operators.templatePresetStandard',
    template: '{emoji}{region}-{protocol}-{index:2}',
  },
  { nameKey: 'operators.templatePresetRegex', template: '{emoji}{g1}-{g2}-{index:2}' },
  { nameKey: 'operators.templatePresetSimple', template: '{emoji}{regionZh} {index:2}' },
  { nameKey: 'operators.templatePresetName', template: '{name}' },
];

const applyPresetTemplate = (tpl) => {
  updateTemplate({ enabled: true, template: tpl });
};

// 预设正则
const presetRegexRules = [
  {
    nameKey: 'operators.regexPresetRegionProviderLine',
    pattern: '\\[(.*?)\\]-(.*?)-(.*)$',
    replacement: '',
  },
  {
    nameKey: 'operators.regexPresetExtractSuffix',
    pattern: '(.*?) -(.*?)$',
    replacement: '$1',
  },
];

const statusLabel = (enabled) => t(enabled ? 'operators.statusOn' : 'operators.statusOff');

const applyPresetRegex = (rule) => {
  const current = { ...(props.modelValue.regex || { enabled: true, rules: [] }) };
  current.enabled = true;
  current.rules = [...(current.rules || []), { ...rule, flags: 'gi' }];
  updateParam('regex', current);
};
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <label class="text-xs font-semibold text-fg-muted uppercase tracking-tight">{{
          t('operators.regexReplace')
        }}</label>
        <div class="flex items-center gap-2">
          <div class="relative group/presets">
            <button
              class="text-xs text-fg-muted font-medium hover:text-fg transition-colors flex items-center gap-0.5"
            >
              {{ t('operators.commonRegex') }}
              <ChevronDown class="h-2.5 w-2.5" />
            </button>
            <div
              class="absolute right-0 top-full mt-1 w-40 bg-surface border border-line rounded-md shadow-none opacity-0 invisible group-hover/presets:opacity-100 group-hover/presets:visible transition-all z-10 py-1"
            >
              <button
                v-for="rule in presetRegexRules"
                :key="rule.nameKey"
                class="w-full text-left px-3 py-1.5 text-xs text-fg-muted hover:bg-hover hover:text-fg transition-colors"
                @click="applyPresetRegex(rule)"
              >
                {{ t(rule.nameKey) }}
              </button>
            </div>
          </div>
          <button
            v-if="props.modelValue.regex?.enabled"
            class="rounded px-1.5 py-0.5 text-xs font-semibold text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            @click="addRule"
          >
            + {{ t('operators.addItem') }}
          </button>
          <button
            :class="[
              'rounded px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-hover hover:text-fg',
              props.modelValue.regex?.enabled ? 'text-fg' : 'text-fg-subtle',
            ]"
            @click="
              updateParam('regex', {
                ...props.modelValue.regex,
                enabled: !props.modelValue.regex?.enabled,
              })
            "
          >
            {{ statusLabel(props.modelValue.regex?.enabled) }}
          </button>
        </div>
      </div>

      <div v-if="props.modelValue.regex?.enabled" class="space-y-2">
        <div
          v-for="(rule, idx) in props.modelValue.regex.rules"
          :key="idx"
          class="flex flex-col gap-2 p-3 bg-transparent rounded-md border border-line relative group transition-all"
        >
          <button
            :aria-label="t('operators.removeRule')"
            class="absolute top-2 right-2 p-1 text-fg-subtle hover:text-red-400 transition-colors touch-target"
            @click="removeRule(idx)"
          >
            <X class="h-3 w-3" />
          </button>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 pr-6">
            <div class="space-y-1">
              <input
                :aria-label="t('operators.regexFindPlaceholder')"
                :placeholder="t('operators.regexFindPlaceholder')"
                :value="rule.pattern"
                class="w-full px-2 py-1.5 font-mono text-xs rounded-md bg-inset border border-line text-fg placeholder:text-fg-subtle outline-none focus:border-line-strong"
                @change="normalizeRuleFlags(idx)"
                @input="
                  (e) => {
                    rule.pattern = e.target.value;
                    updateParam('regex', props.modelValue.regex);
                  }
                "
              />
            </div>
            <div class="space-y-1">
              <input
                :aria-label="t('operators.regexReplacePlaceholder')"
                :placeholder="t('operators.regexReplacePlaceholder')"
                :value="rule.replacement"
                class="w-full px-2 py-1.5 font-mono text-xs rounded-md bg-inset border border-line text-fg placeholder:text-fg-subtle outline-none focus:border-line-strong"
                @change="normalizeRuleFlags(idx)"
                @input="
                  (e) => {
                    rule.replacement = e.target.value;
                    updateParam('regex', props.modelValue.regex);
                  }
                "
              />
            </div>
          </div>
        </div>
        <p class="px-1 text-xs text-fg-subtle">
          {{ t('operators.regexReplaceHint') }}
        </p>
        <div v-if="!props.modelValue.regex.rules?.length" class="text-center py-2 text-xs text-fg-subtle italic">
          {{ t('operators.renameEmptyRules') }}
        </div>
      </div>
    </div>

    <div class="space-y-3 pt-4 border-t border-line">
      <div class="flex items-center justify-between">
        <label class="text-xs font-semibold text-fg-muted uppercase tracking-tight">{{
          t('operators.templateRewrite')
        }}</label>
        <button
          :class="[
            'rounded px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-hover hover:text-fg',
            props.modelValue.template?.enabled ? 'text-fg' : 'text-fg-subtle',
          ]"
          @click="updateTemplate({ enabled: !props.modelValue.template?.enabled })"
        >
          {{ statusLabel(props.modelValue.template?.enabled) }}
        </button>
      </div>

      <div v-if="props.modelValue.template?.enabled" class="space-y-3">
        <div class="p-3 bg-transparent rounded-md border border-line">
          <div class="space-y-2">
            <input
              :aria-label="t('operators.templateRewrite')"
              :value="props.modelValue.template.template || ''"
              class="w-full px-3 py-2 font-mono text-xs rounded-md bg-inset border border-line text-fg placeholder:text-fg-subtle outline-none focus:border-line-strong"
              placeholder="{emoji}{region}-{index}"
              @input="(e) => updateTemplate({ template: e.target.value })"
            />
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="tag in [
                  '{name}',
                  '{protocol}',
                  '{regionZh}',
                  '{region}',
                  '{emoji}',
                  '{index}',
                  '{index:2}',
                  '{g1}',
                  '{g2}',
                  '{g3}',
                  '{server}',
                ]"
                :key="tag"
                class="font-mono text-xs bg-transparent text-fg-muted px-1.5 py-0.5 rounded-md border border-line hover:bg-hover hover:text-fg transition-colors touch-target-min"
                @click="
                  updateTemplate({
                    template: (props.modelValue.template.template || '') + tag,
                  })
                "
              >
                {{ tag }}
              </button>
            </div>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-xs text-fg-subtle">{{ t('operators.recommendedTemplates') }}</span>
              <button
                v-for="tpl in presetTemplates"
                :key="tpl.nameKey"
                class="text-xs px-2 py-0.5 rounded-md border border-line bg-transparent text-fg-muted hover:bg-hover hover:text-fg transition-colors touch-target-min"
                @click="applyPresetTemplate(tpl.template)"
              >
                {{ t(tpl.nameKey) }}
              </button>
            </div>
          </div>

          <div class="flex items-center gap-2 mt-3 pt-3 border-t border-line">
            <span class="text-xs text-fg-muted font-medium">{{ t('operators.startIndex') }}</span>
            <input
              :aria-label="t('operators.startIndex')"
              :value="props.modelValue.template.offset || 1"
              class="w-14 px-2 py-1 font-mono text-xs rounded-md bg-inset border border-line text-fg outline-none focus:border-line-strong"
              type="number"
              @input="(e) => updateTemplate({ offset: parseInt(e.target.value) || 1 })"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
