<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type {
  CustomVisualRule,
  CustomVisualRulesConfig,
  NormalizedCustomVisualRules,
  SmartPreset,
} from '@misub/core/types.js';
import { Code2, Plus, Sliders, Trash2 } from '@lucide/vue';
import Select from '@/components/ui/Select.vue';
import { useI18n } from '@/i18n/index.js';
import {
  normalizeCustomRule,
  normalizeCustomVisualRules,
  VISUAL_RULE_CATEGORIES,
} from '@misub/core/domain/visual-rules-catalog.js';

const { t, locale } = useI18n();

const props = withDefaults(
  defineProps<{
    smartPreset?: SmartPreset | string;
    customVisualRules?: Partial<CustomVisualRulesConfig> | null;
  }>(),
  {
    smartPreset: 'balanced',
    customVisualRules: null,
  },
);

const emit = defineEmits<{
  'update:customVisualRules': [value: CustomVisualRulesConfig];
}>();

const rootRef = ref<HTMLElement | null>(null);

const bt = computed<NormalizedCustomVisualRules>(() =>
  normalizeCustomVisualRules(props.customVisualRules, {
    smartPreset: props.smartPreset,
    allowEmptyName: true,
  }),
);

function updateBt(patch: Partial<CustomVisualRulesConfig>): void {
  emit('update:customVisualRules', {
    selectedRules: [...bt.value.selectedRules],
    customRules: [...bt.value.customRules],
    groupByCountry: bt.value.groupByCountry,
    includeAutoSelect: bt.value.includeAutoSelect,
    ...patch,
  });
}

const isZh = computed(() => String(locale?.value || 'zh-CN').startsWith('zh'));

// --- 1. 规则选择 ---
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
  });
}

function getCategoryLabel(cat: { labelZh: string; labelEn: string }) {
  return isZh.value ? cat.labelZh : cat.labelEn;
}

// --- 2. 自定义规则 ---
const customRuleMode = ref('form'); // 'form' | 'json'
const customRuleJsonText = ref('');
const customRuleJsonError = ref('');
const listInputDrafts = reactive<Record<string, string>>({});

type ListFieldKey = 'domainSuffix' | 'domainKeyword' | 'ipCidr' | 'srcIpCidr';

function draftKey(index: number, key: ListFieldKey): string {
  return `${index}:${key}`;
}

function clearAllListDrafts(): void {
  for (const k of Object.keys(listInputDrafts)) {
    delete listInputDrafts[k];
  }
}

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
  clearAllListDrafts();
  if (mode === 'json') {
    syncJsonFromCustomRules();
  }
});

async function addCustomRule() {
  customRuleMode.value = 'form';
  clearAllListDrafts();
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

  await nextTick();
  const nameInputs = rootRef.value?.querySelectorAll<HTMLInputElement>('[data-testid="custom-rule-name-input"]');
  const lastInput = nameInputs && nameInputs.length > 0 ? nameInputs[nameInputs.length - 1] : null;
  if (lastInput) {
    lastInput.focus();
    lastInput.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }
}

function removeCustomRule(index: number) {
  clearAllListDrafts();
  updateBt({
    customRules: (bt.value.customRules || []).filter((_, idx) => idx !== index),
  });
}

function updateCustomRule(index: number, patch: Partial<CustomVisualRule>) {
  const nextRules = (bt.value.customRules || []).map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule));
  updateBt({ customRules: nextRules });
}

function formatListField(list: unknown) {
  return Array.isArray(list) ? list.join(', ') : '';
}

function getListFieldValue(index: number, key: ListFieldKey, list: unknown): string {
  const k = draftKey(index, key);
  return k in listInputDrafts ? listInputDrafts[k] : formatListField(list);
}

function updateListField(index: number, key: ListFieldKey, rawValue: string) {
  listInputDrafts[draftKey(index, key)] = rawValue;
  const nextList = String(rawValue || '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  updateCustomRule(index, { [key]: nextList } as Partial<CustomVisualRule>);
}

function clearListFieldDraft(index: number, key: ListFieldKey) {
  delete listInputDrafts[draftKey(index, key)];
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
      .map((item) => normalizeCustomRule(item, { allowEmptyName: true }))
      .filter((item): item is CustomVisualRule => Boolean(item));
    updateBt({ customRules: normalized });
    customRuleJsonError.value = '';
  } catch {
    customRuleJsonError.value = t('settings.visualCustomRulesJsonInvalid');
  }
}
</script>

<template>
  <!-- 可视化规则勾选 + 自定义规则 -->
  <div ref="rootRef" class="space-y-5" data-testid="visual-rules-editor">
    <!-- 规则勾选网格 -->
    <div class="space-y-3">
      <div>
        <h4 class="text-xs font-semibold text-fg">{{ t('settings.visualRulesTitle') }}</h4>
        <p class="mt-0.5 text-xs text-fg-muted">{{ t('settings.visualRulesGridHint') }}</p>
      </div>

      <div class="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <label
          v-for="cat in VISUAL_RULE_CATEGORIES"
          :key="cat.id"
          :class="
            isRuleSelected(cat.id)
              ? 'border-accent/60 bg-accent/10 text-fg'
              : 'border-line bg-inset text-fg-muted hover:border-line-strong hover:text-fg'
          "
          class="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors select-none"
        >
          <input
            :checked="isRuleSelected(cat.id)"
            class="h-3.5 w-3.5 shrink-0 rounded border-line bg-surface accent-accent"
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
        <div class="flex shrink-0 gap-0.5 rounded-md border border-line bg-inset p-0.5">
          <button
            :class="
              customRuleMode === 'form'
                ? 'border-line-strong bg-active font-semibold text-fg'
                : 'border-transparent text-fg-muted hover:bg-hover hover:text-fg'
            "
            class="inline-flex min-h-8 shrink-0 whitespace-nowrap items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition-colors"
            type="button"
            @click="customRuleMode = 'form'"
          >
            <Sliders class="h-3 w-3 shrink-0" />
            {{ t('settings.visualModeForm') }}
          </button>
          <button
            :class="
              customRuleMode === 'json'
                ? 'border-line-strong bg-active font-semibold text-fg'
                : 'border-transparent text-fg-muted hover:bg-hover hover:text-fg'
            "
            class="inline-flex min-h-8 shrink-0 whitespace-nowrap items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium transition-colors"
            type="button"
            @click="customRuleMode = 'json'"
          >
            <Code2 class="h-3 w-3 shrink-0" />
            {{ t('settings.visualModeJson') }}
          </button>
        </div>
      </div>

      <div v-if="customRuleMode === 'form'" class="space-y-3">
        <div
          v-if="!bt.customRules || bt.customRules.length === 0"
          class="flex flex-col gap-3 rounded-md border border-dashed border-line bg-inset p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="text-xs text-fg-muted">{{ t('settings.visualCustomRulesEmpty') }}</p>
          <button
            class="inline-flex min-h-9 w-full shrink-0 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90 sm:w-auto"
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
            class="rounded-md border border-line bg-inset/40 p-3.5 sm:p-4 space-y-3"
            data-testid="custom-rule-card"
          >
            <div class="flex items-center justify-between gap-2 border-b border-line-subtle pb-2">
              <span class="font-mono text-xs font-semibold text-fg-muted">#{{ index + 1 }}</span>
              <button
                :aria-label="t('actions.delete')"
                class="inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-transparent px-2.5 text-xs text-status-danger shadow-none transition-colors hover:bg-status-danger-bg hover:border-status-danger-border"
                data-testid="remove-custom-rule-btn"
                type="button"
                @click="removeCustomRule(index)"
              >
                <Trash2 class="h-3.5 w-3.5" />
                <span>{{ t('actions.delete') }}</span>
              </button>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-start">
              <div class="sm:col-span-7">
                <label class="mb-1 block text-xs font-medium text-fg-muted">
                  {{ t('settings.visualCustomRuleName') }}
                </label>
                <input
                  :placeholder="t('settings.visualCustomRuleNamePlaceholder')"
                  :value="rule.name"
                  class="block h-9 w-full rounded-md border border-line bg-inset px-3 text-sm sm:text-xs text-fg shadow-none focus:border-line-strong"
                  data-testid="custom-rule-name-input"
                  type="text"
                  @input="updateCustomRule(index, { name: ($event.target as HTMLInputElement).value })"
                />
                <p
                  v-if="!String(rule.name || '').trim()"
                  class="mt-1 text-xs text-amber-500"
                  data-testid="custom-rule-name-hint"
                >
                  {{ t('settings.visualCustomRuleNameRequiredHint') }}
                </p>
              </div>
              <div class="sm:col-span-5">
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
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs font-medium text-fg-muted">
                  {{ t('settings.visualDomainSuffix') }}
                </label>
                <input
                  :value="getListFieldValue(index, 'domainSuffix', rule.domainSuffix)"
                  class="block h-9 w-full rounded-md border border-line bg-inset px-3 font-mono text-sm sm:text-xs text-fg shadow-none focus:border-line-strong"
                  data-testid="custom-rule-domain-suffix-input"
                  placeholder="example.com, internal.local"
                  type="text"
                  @blur="clearListFieldDraft(index, 'domainSuffix')"
                  @input="updateListField(index, 'domainSuffix', ($event.target as HTMLInputElement).value)"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-fg-muted">
                  {{ t('settings.visualDomainKeyword') }}
                </label>
                <input
                  :value="getListFieldValue(index, 'domainKeyword', rule.domainKeyword)"
                  class="block h-9 w-full rounded-md border border-line bg-inset px-3 font-mono text-sm sm:text-xs text-fg shadow-none focus:border-line-strong"
                  placeholder="openai, company"
                  type="text"
                  @blur="clearListFieldDraft(index, 'domainKeyword')"
                  @input="updateListField(index, 'domainKeyword', ($event.target as HTMLInputElement).value)"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-fg-muted">
                  {{ t('settings.visualIpCidr') }}
                </label>
                <input
                  :value="getListFieldValue(index, 'ipCidr', rule.ipCidr)"
                  class="block h-9 w-full rounded-md border border-line bg-inset px-3 font-mono text-sm sm:text-xs text-fg shadow-none focus:border-line-strong"
                  placeholder="10.0.0.0/8, 192.168.1.0/24"
                  type="text"
                  @blur="clearListFieldDraft(index, 'ipCidr')"
                  @input="updateListField(index, 'ipCidr', ($event.target as HTMLInputElement).value)"
                />
              </div>
              <div>
                <label class="mb-1 block text-xs font-medium text-fg-muted">
                  {{ t('settings.visualSrcIpCidr') }}
                </label>
                <input
                  :value="getListFieldValue(index, 'srcIpCidr', rule.srcIpCidr)"
                  class="block h-9 w-full rounded-md border border-line bg-inset px-3 font-mono text-sm sm:text-xs text-fg shadow-none focus:border-line-strong"
                  placeholder="192.168.1.100/32"
                  type="text"
                  @blur="clearListFieldDraft(index, 'srcIpCidr')"
                  @input="updateListField(index, 'srcIpCidr', ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>

          <button
            class="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg sm:w-auto"
            data-testid="add-custom-rule-btn"
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
          class="block min-h-[140px] w-full rounded-md border border-line bg-inset p-3 font-mono text-sm sm:text-xs text-fg focus:border-line-strong"
          @input="handleCustomRuleJsonInput"
        />
        <p v-if="customRuleJsonError" class="text-xs text-status-danger">
          {{ customRuleJsonError }}
        </p>
      </div>
    </div>
  </div>
</template>
