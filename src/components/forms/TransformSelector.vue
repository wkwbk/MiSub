<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { Braces, List } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import Select from '@/components/ui/Select.vue';
import TemplateVariablesModal from '@/components/forms/TemplateVariablesModal.vue';
import { getLocalizedTransformAssets } from '@/constants/transform-assets';
import { useDataStore } from '@/stores/useDataStore.js';
import { useI18n } from '@/i18n/index.js';

interface RuleTemplateRecord {
  id?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
}

interface TransformAsset {
  id?: string;
  name: string;
  url: string;
  group?: string;
  sourceType?: string;
  description?: string;
}

type SelectOptionNode = { value: string; label: string } | { label: string; options: Array<{ value: string; label: string }> };

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    type: string;
    placeholder?: string;
    allowEmpty?: boolean;
    forceCustom?: boolean;
    customPlaceholder?: string;
    excludeBuiltinAssets?: boolean;
    customTemplatesOnly?: boolean;
  }>(),
  {
    modelValue: '',
    placeholder: '',
    allowEmpty: true,
    forceCustom: false,
    // ⚠️ 默认值不能写成 t('...')：prop 的 default 在组件定义时就被求值，
    // 那时候 i18n 还没初始化，而且切换语言也不会重新求值。
    // 这里只留空字符串，真正的兜底文案交给下面的 resolvedCustomPlaceholder。
    customPlaceholder: '',
    excludeBuiltinAssets: false,
    customTemplatesOnly: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'select-asset': [asset: TransformAsset | null];
}>();
const dataStore = useDataStore();
const { ruleTemplates } = storeToRefs(dataStore) as { ruleTemplates: Ref<RuleTemplateRecord[]> };

const resolvedCustomPlaceholder = computed(() => props.customPlaceholder || t('transformSelector.customPlaceholder'));

const customTemplateAssets = computed<TransformAsset[]>(() => {
  if (props.excludeBuiltinAssets) return [];

  return (ruleTemplates.value || [])
    .filter((item) => item && item.enabled !== false && item.id)
    .map((item) => ({
      id: `custom:${item.id}`,
      name: item.name || t('transformSelector.unnamedTemplate'),
      url: `custom:${item.id}`,
      group: t('transformSelector.customTemplateGroup'),
      sourceType: 'custom-template',
      description: item.description || t('transformSelector.customTemplateDescription'),
    }));
});

const assets = computed<TransformAsset[]>(() => {
  if (props.customTemplatesOnly) return customTemplateAssets.value;

  // 在 computed 里解析模板名称，切换语言时下拉框即时更新。
  const builtinAndRemote = (getLocalizedTransformAssets(t) as (TransformAsset | null)[]).filter(
    (item): item is TransformAsset =>
      Boolean(item) && (!props.excludeBuiltinAssets || !String(item?.url || '').startsWith('builtin:')),
  );
  return [...customTemplateAssets.value, ...builtinAndRemote];
});

const missingCustomTemplateValue = computed(() => {
  const value = String(props.modelValue || '').trim();
  if (!props.customTemplatesOnly || !value.startsWith('custom:')) return '';
  return customTemplateAssets.value.some((item) => item.url === value) ? '' : value;
});

const groupedConfigs = computed<Record<string, TransformAsset[]>>(() => {
  if (props.type !== 'config') return {};

  const groups: Record<string, TransformAsset[]> = {};
  assets.value.forEach((item) => {
    const group = item.group || t('transformSelector.otherGroup');
    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
  });
  return groups;
});

const isCustom = ref(false);
const selectedUrl = ref('');
const showTemplateVariables = ref(false);

watch(
  () => props.modelValue,
  (newVal) => {
    if (props.forceCustom) {
      isCustom.value = true;
      selectedUrl.value = 'custom';
      emit('select-asset', null);
      return;
    }

    if (props.customTemplatesOnly) {
      const foundCustom = assets.value.find((item) => item.url === newVal);
      selectedUrl.value = foundCustom ? newVal : '';
      isCustom.value = false;
      emit('select-asset', foundCustom || null);
      return;
    }

    if (props.excludeBuiltinAssets && String(newVal || '').startsWith('builtin:')) {
      selectedUrl.value = '';
      isCustom.value = false;
      emit('select-asset', null);
      return;
    }

    if (isCustom.value && newVal !== '' && newVal !== selectedUrl.value) return;

    const found = assets.value.find((item) => item.url === newVal);
    if (found) {
      selectedUrl.value = newVal;
      isCustom.value = false;
      emit('select-asset', found);
    } else if (newVal && String(newVal).trim() !== '') {
      selectedUrl.value = 'custom';
      isCustom.value = true;
      emit('select-asset', null);
    } else {
      selectedUrl.value = '';
      isCustom.value = false;
      emit('select-asset', null);
    }
  },
  { immediate: true },
);

watch(
  () => props.forceCustom,
  (newVal) => {
    if (newVal) {
      isCustom.value = true;
      selectedUrl.value = 'custom';
      emit('select-asset', null);
    } else if (!props.modelValue) {
      isCustom.value = false;
      selectedUrl.value = '';
      emit('select-asset', null);
    }
  },
  { immediate: true },
);

const handleSelectChange = (val: string) => {
  if (props.forceCustom) return;

  if (val === 'custom' && !props.customTemplatesOnly) {
    isCustom.value = true;
    emit('select-asset', null);
    emit('update:modelValue', '');
    return;
  }

  isCustom.value = false;
  selectedUrl.value = val;
  emit('select-asset', assets.value.find((item) => item.url === val) || null);
  emit('update:modelValue', val);
};

const selectOptions = computed<SelectOptionNode[]>(() => {
  const opts: SelectOptionNode[] = [
    {
      value: '',
      label:
        props.placeholder ||
        (props.allowEmpty ? t('transformSelector.defaultGlobalOption') : t('transformSelector.pleaseSelect')),
    },
  ];

  for (const [groupName, items] of Object.entries(groupedConfigs.value || {})) {
    opts.push({
      label: groupName,
      options: items.map((item) => ({
        value: item.url,
        label: item.name,
      })),
    });
  }

  if (!props.customTemplatesOnly) {
    opts.push({
      value: 'custom',
      label: t('transformSelector.customInputOption'),
    });
  }

  return opts;
});

const handleCustomInput = (e: Event) => {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
};

const switchToSelect = () => {
  if (props.forceCustom) return;

  isCustom.value = false;
  selectedUrl.value = '';
  emit('select-asset', null);
  emit('update:modelValue', '');
};

const helperText = computed(() => {
  if (props.customTemplatesOnly) {
    return t('transformSelector.helperCustomTemplatesOnly');
  }
  if (props.excludeBuiltinAssets) {
    return t('transformSelector.helperExcludeBuiltin');
  }
  return t('transformSelector.helperDefault');
});
</script>

<template>
  <div>
    <div v-if="!isCustom">
      <Select :model-value="selectedUrl" :options="selectOptions" @update:model-value="handleSelectChange" />
    </div>

    <div v-else class="w-full">
      <div class="flex items-center gap-2">
        <div class="relative flex-grow">
          <input
            :aria-label="resolvedCustomPlaceholder"
            :placeholder="resolvedCustomPlaceholder"
            :value="modelValue"
            class="block h-9 w-full rounded-md border border-line bg-inset px-3 font-mono text-sm text-fg placeholder:text-fg-subtle shadow-none focus:border-line-strong focus-visible:outline-hidden"
            type="text"
            @input="handleCustomInput"
          />
        </div>
        <button
          v-if="!forceCustom"
          :aria-label="t('operators.backToList')"
          :title="t('operators.backToList')"
          class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-line bg-transparent text-fg-muted transition-colors hover:bg-hover hover:text-fg"
          type="button"
          @click="switchToSelect"
        >
          <List class="h-4 w-4" />
        </button>
      </div>
      <p
        v-if="modelValue"
        :title="t('transformSelector.currentCustomValue')"
        class="mt-1 truncate font-mono text-xs text-fg-muted"
      >
        {{ t('transformSelector.currentValue') }}: {{ modelValue }}
      </p>
    </div>

    <div v-if="missingCustomTemplateValue" class="callout-warning mt-2">
      <span>{{ t('transformSelector.missingTemplatePrefix') }}</span><code class="font-mono font-semibold">{{
        missingCustomTemplateValue
      }}</code
      ><span>{{ t('transformSelector.missingTemplateSuffix') }}</span>
    </div>

    <div v-if="type === 'config'" class="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
      <span class="leading-relaxed text-fg-muted">{{ helperText }}</span>
      <button
        v-if="!excludeBuiltinAssets"
        :aria-expanded="showTemplateVariables"
        class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
        data-testid="open-template-variables"
        type="button"
        @click="showTemplateVariables = true"
      >
        <Braces class="h-3.5 w-3.5" />
        <span>{{ t('transformSelector.templateVariablesTitle') }}</span>
      </button>
    </div>

    <TemplateVariablesModal v-model:show="showTemplateVariables" />
  </div>
</template>
