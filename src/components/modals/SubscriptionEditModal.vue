<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SubscriptionItem } from '@misub/core/types.js';
import type { EditableSubscriptionForm } from '@/composables/useSubscriptionForms.js';
import type { StoreMisubItem } from '@/queries/useAppDataQueries.js';
import { Link2 } from '@lucide/vue';
import { useToastStore } from '@/stores/useToastStore.js';
import { useI18n } from '@/i18n/index.js';
import Modal from '@/components/ui/Modal.vue';
import RecordConflictBanner from '@/components/ui/RecordConflictBanner.vue';
import type { RecordConflictBannerModel } from '@/stores/useDataStore.js';
import EditForm from '@/components/modals/SubscriptionEditModal/EditForm.vue';
import RuleSection from '@/components/modals/SubscriptionEditModal/RuleSection.vue';
import AdvancedOptions from '@/components/modals/SubscriptionEditModal/AdvancedOptions.vue';

interface RuleTagOption {
  label: string;
  pattern: string;
  icon?: string;
}

interface RuleItem extends RuleTagOption {
  type: string;
}

type EditableSubscriptionModel = EditableSubscriptionForm | StoreMisubItem | SubscriptionItem;

const props = withDefaults(
  defineProps<{
    show?: boolean;
    isNew?: boolean;
    isSaving?: boolean;
    editingSubscription?: EditableSubscriptionModel | null;
    conflict?: RecordConflictBannerModel | null;
  }>(),
  {
    show: false,
    isNew: false,
    isSaving: false,
    editingSubscription: null,
    conflict: null,
  },
);

const emit = defineEmits<{
  'update:show': [value: boolean];
  'update:editingSubscription': [value: EditableSubscriptionModel];
  confirm: [];
  'reload-conflict': [];
  'force-save-conflict': [];
}>();

const editingSubscriptionModel = computed<EditableSubscriptionModel | null>({
  get: () => props.editingSubscription,
  set: (value) => {
    if (value) {
      emit('update:editingSubscription', value);
    }
  },
});

const updateEditingSubscription = (patch: Partial<EditableSubscriptionModel>) => {
  if (!props.editingSubscription) return;
  emit('update:editingSubscription', {
    ...props.editingSubscription,
    ...patch,
  } as EditableSubscriptionModel);
};
const { showToast } = useToastStore();
const { t } = useI18n();

// === 可视化规则编辑器 ===
const isAdvancedMode = ref(false);
const isRuleExpanded = ref(false); // 折叠状态
const ruleMode = ref('exclude');
const customKeyword = ref('');

// 预设标签
const presetRegions = computed<RuleTagOption[]>(() => [
  { label: t('subscriptions.presets.regions.hk'), pattern: '(香港|HK|Hong Kong)', icon: '🇭🇰' },
  { label: t('subscriptions.presets.regions.tw'), pattern: '(台湾|TW|Taiwan)', icon: '🇨🇳' },
  { label: t('subscriptions.presets.regions.jp'), pattern: '(日本|JP|Japan)', icon: '🇯🇵' },
  { label: t('subscriptions.presets.regions.sg'), pattern: '(新加坡|SG|Singapore)', icon: '🇸🇬' },
  { label: t('subscriptions.presets.regions.us'), pattern: '(美国|US|USA)', icon: '🇺🇸' },
  { label: t('subscriptions.presets.regions.kr'), pattern: '(韩国|KR|Korea)', icon: '🇰🇷' },
  { label: t('subscriptions.presets.regions.de'), pattern: '(德国|DE|Germany)', icon: '🇩🇪' },
  { label: t('subscriptions.presets.regions.uk'), pattern: '(英国|UK|Britain)', icon: '🇬🇧' },
]);

const presetProtocols: RuleTagOption[] = [
  { label: 'SS', pattern: 'proto:ss' },
  { label: 'VMess', pattern: 'proto:vmess' },
  { label: 'VLESS', pattern: 'proto:vless' },
  { label: 'Trojan', pattern: 'proto:trojan' },
  { label: 'Hysteria2', pattern: 'proto:hysteria2,hy2' },
];

const presetKeywords = computed<RuleTagOption[]>(() => [
  { label: t('subscriptions.presets.keywords.official'), pattern: '官网' },
  { label: t('subscriptions.presets.keywords.expire'), pattern: '过期' },
  { label: t('subscriptions.presets.keywords.remaining'), pattern: '(剩余|流量)' },
  { label: t('subscriptions.presets.keywords.multiplier'), pattern: '倍率' },
  { label: t('subscriptions.presets.keywords.test'), pattern: '测试' },
  { label: t('subscriptions.presets.keywords.maintenance'), pattern: '维护' },
  { label: 'GB', pattern: 'GB' },
  { label: '2026', pattern: '2026' },
]);

// 规则池：分别管理保留规则和剔除规则
const keepRules = ref<RuleItem[]>([]);
const excludeRules = ref<RuleItem[]>([]);

// 活跃规则列表（根据当前 tab 切换）
const currentRulePool = computed(() => {
  return ruleMode.value === 'keep' ? keepRules.value : excludeRules.value;
});

// 选中规则总集（兼容外部组件与计数）
const selectedRules = computed(() => {
  return [...keepRules.value, ...excludeRules.value];
});

// 检查标签在当前激活模式中是否已选中
const isSelected = (pattern: string) => {
  return currentRulePool.value.some((rule) => rule.pattern === pattern);
};

// 检查标签在另一个模式中是否已选中
const isOtherSelected = (pattern: string) => {
  const otherPool = ruleMode.value === 'keep' ? excludeRules.value : keepRules.value;
  return otherPool.some((rule) => rule.pattern === pattern);
};

// 辅助函数：根据 pattern 转换为规范规则对象
const createRuleItem = (tag: RuleTagOption, type: string): RuleItem => {
  const normalizedPattern =
    type === 'protocol' && !String(tag.pattern).toLowerCase().startsWith('proto:')
      ? `proto:${String(tag.pattern).toLowerCase()}`
      : tag.pattern;
  return {
    ...tag,
    pattern: normalizedPattern,
    type,
  };
};

// 切换标签选择
const toggleTag = (tag: RuleTagOption, type: string) => {
  const pool = currentRulePool.value;
  const otherPool = ruleMode.value === 'keep' ? excludeRules.value : keepRules.value;

  const index = pool.findIndex((rule) => rule.pattern === tag.pattern);
  if (index !== -1) {
    pool.splice(index, 1);
  } else {
    // 如果已在另一个规则池中，将其从另一个池移除，避免同一标签同时存在
    const otherIdx = otherPool.findIndex((rule) => rule.pattern === tag.pattern);
    if (otherIdx !== -1) {
      otherPool.splice(otherIdx, 1);
    }
    pool.push(createRuleItem(tag, type));
  }
  syncToText();
};

// 添加自定义关键字
const addCustomKeyword = () => {
  const keyword = customKeyword.value.trim();
  if (!keyword) return;

  const pool = currentRulePool.value;
  if (pool.some((rule) => rule.pattern === keyword || rule.label === keyword)) {
    showToast(t('subscriptions.duplicateKeyword'), 'warning');
    return;
  }

  // 如果在另一个池中存在，先移除
  const otherPool = ruleMode.value === 'keep' ? excludeRules.value : keepRules.value;
  const otherIdx = otherPool.findIndex((rule) => rule.pattern === keyword || rule.label === keyword);
  if (otherIdx !== -1) {
    otherPool.splice(otherIdx, 1);
  }

  pool.push({
    label: keyword,
    pattern: keyword,
    type: 'custom',
  });
  customKeyword.value = '';
  syncToText();
};

// 移除规则
const removeKeepRule = (index: number) => {
  keepRules.value.splice(index, 1);
  syncToText();
};

const removeExcludeRule = (index: number) => {
  excludeRules.value.splice(index, 1);
  syncToText();
};

const removeRule = (index: number, targetPool: string | null = null) => {
  if (targetPool === 'keep') {
    removeKeepRule(index);
  } else if (targetPool === 'exclude') {
    removeExcludeRule(index);
  } else {
    currentRulePool.value.splice(index, 1);
    syncToText();
  }
};

// 将可视化选择同步到文本格式（保留与剔除同时支持）
const lastSyncedExclude = ref<string | null>(null);

const syncToText = () => {
  if (!props.editingSubscription) return;

  const exPatterns = excludeRules.value.map((r) => r.pattern);
  const kpPatterns = keepRules.value.map((r) => r.pattern);

  let nextExclude = '';
  if (exPatterns.length === 0 && kpPatterns.length === 0) {
    nextExclude = '';
  } else if (kpPatterns.length === 0) {
    nextExclude = exPatterns.join('\n');
  } else if (exPatterns.length === 0) {
    nextExclude = kpPatterns.map((p) => `keep:${p}`).join('\n');
  } else {
    // 两者并存：使用标准 --- 分隔线
    nextExclude = [...exPatterns, '---', ...kpPatterns.map((p) => `keep:${p}`)].join('\n');
  }

  lastSyncedExclude.value = nextExclude;
  updateEditingSubscription({ exclude: nextExclude });
};

const resolvePreset = (pattern: string): RuleItem => {
  const protocolPreset = presetProtocols.find((p) => p.pattern.toLowerCase() === pattern.toLowerCase());
  if (protocolPreset) {
    return { ...protocolPreset, type: 'protocol' };
  }

  const allPresets = [...presetRegions.value, ...presetProtocols, ...presetKeywords.value];
  const preset = allPresets.find((p) => p.pattern === pattern);
  if (preset) {
    const type = presetRegions.value.includes(preset) ? 'region' : presetProtocols.includes(preset) ? 'protocol' : 'keyword';
    return { ...preset, type };
  }

  return {
    label: pattern,
    pattern: pattern,
    type: 'custom',
  };
};

// 从文本解析到可视化状态
const parseFromText = () => {
  keepRules.value = [];
  excludeRules.value = [];

  if (!props.editingSubscription?.exclude) {
    return;
  }

  const text = props.editingSubscription.exclude;
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return;

  const dividerIndex = lines.findIndex((line) => line === '---');
  const hasDivider = dividerIndex !== -1;

  const rawExcludePatterns: string[] = [];
  const rawKeepPatterns: string[] = [];

  lines.forEach((line, index) => {
    if (line === '---') return;

    if (hasDivider) {
      if (index < dividerIndex) {
        if (line.toLowerCase().startsWith('keep:')) {
          rawKeepPatterns.push(line.substring(5).trim());
        } else {
          rawExcludePatterns.push(line);
        }
      } else {
        if (line.toLowerCase().startsWith('keep:')) {
          rawKeepPatterns.push(line.substring(5).trim());
        } else {
          rawKeepPatterns.push(line);
        }
      }
    } else {
      if (line.toLowerCase().startsWith('keep:')) {
        rawKeepPatterns.push(line.substring(5).trim());
      } else {
        rawExcludePatterns.push(line);
      }
    }
  });

  rawKeepPatterns.filter(Boolean).forEach((pattern) => {
    keepRules.value.push(resolvePreset(pattern));
  });

  rawExcludePatterns.filter(Boolean).forEach((pattern) => {
    excludeRules.value.push(resolvePreset(pattern));
  });

  if (keepRules.value.length > 0 && excludeRules.value.length === 0) {
    ruleMode.value = 'keep';
  } else if (excludeRules.value.length > 0 && keepRules.value.length === 0) {
    ruleMode.value = 'exclude';
  }
};

// 监听弹窗显示或编辑订阅变化，解析现有规则
watch(
  [() => props.show, () => props.editingSubscription],
  ([showVal, subVal]) => {
    if (!showVal || !subVal) {
      lastSyncedExclude.value = null;
      return;
    }
    if (lastSyncedExclude.value !== null && (subVal.exclude ?? '') === lastSyncedExclude.value) {
      return;
    }
    lastSyncedExclude.value = null;
    parseFromText();
  },
  { immediate: true },
);

// === 高级模式相关 ===
const excludeRuleState = computed(() => {
  const text = props.editingSubscription?.exclude ?? '';
  const rawLines = text.split('\n');
  const lines = rawLines.map((line) => line.trim());
  const hasContent = lines.some((line) => line);
  const dividerIndex = lines.findIndex((line) => line === '---');
  const hasDivider = dividerIndex !== -1;

  let tagKey = 'unset';
  if (hasContent) {
    const hasExclude = lines.some((l) => l && l !== '---' && !l.toLowerCase().startsWith('keep:'));
    const hasKeep =
      lines.some((l) => l && l.toLowerCase().startsWith('keep:')) ||
      (hasDivider && lines.slice(dividerIndex + 1).some((l) => l));

    if (hasDivider || (hasExclude && hasKeep)) tagKey = 'mixed';
    else if (hasKeep) tagKey = 'keepOnly';
    else tagKey = 'exclude';
  }

  const tagClassMap: Record<string, string> = {
    unset: 'border border-line bg-transparent text-fg-muted',
    exclude: 'border border-line bg-transparent text-fg-muted',
    keepOnly: 'border border-line bg-transparent text-fg-muted',
    mixed: 'border border-line bg-transparent text-fg-muted',
  };

  const errors: Array<{ line: number; message: string }> = [];
  rawLines.forEach((rawLine, index) => {
    let line = rawLine.trim();
    if (!line) return;
    if (line === '---') return;

    if (line.toLowerCase().startsWith('keep:')) {
      line = line.substring('keep:'.length).trim();
      if (!line) {
        errors.push({ line: index + 1, message: t('subscriptions.keepEmptyError') });
        return;
      }
    }

    if (line.toLowerCase().startsWith('proto:')) {
      const protocols = line
        .substring('proto:'.length)
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      if (protocols.length === 0) {
        errors.push({ line: index + 1, message: t('subscriptions.protoEmptyError') });
      }
      return;
    }

    try {
      new RegExp(line);
    } catch (e) {
      errors.push({ line: index + 1, message: t('subscriptions.regexInvalid') });
    }
  });

  return {
    tagKey,
    tag: t(`subscriptions.ruleTag.${tagKey}`),
    tagClass: tagClassMap[tagKey] || tagClassMap.unset,
    errors,
    errorsText: errors
      .map((item) => t('subscriptions.ruleLineError', { line: item.line, message: item.message }))
      .join('；'),
  };
});

const handleConfirm = () => {
  if (isAdvancedMode.value && excludeRuleState.value.errors.length > 0) {
    showToast(t('subscriptions.ruleErrorFixFirst'), 'error');
    return;
  }
  emit('confirm');
};

// 切换到高级模式
const switchToAdvanced = () => {
  isAdvancedMode.value = true;
};

// 切换到可视化模式
const switchToVisual = () => {
  isAdvancedMode.value = false;
  parseFromText();
};
</script>

<template>
  <Modal
    v-if="editingSubscription"
    :close-on-confirm="false"
    :confirm-button-title="t('subscriptions.fixRulesFirst')"
    :confirm-disabled="Boolean(isSaving) || (isAdvancedMode && excludeRuleState.errors.length > 0)"
    :confirm-loading="Boolean(isSaving)"
    :show="show"
    size="2xl"
    @confirm="handleConfirm"
    @update:show="emit('update:show', $event)"
  >
    <template #title>
      <div class="flex items-center gap-3">
        <Link2 class="h-5 w-5 text-fg-muted shrink-0" />
        <div>
          <h3 class="text-base font-semibold text-fg">
            {{ isNew ? t('subscriptions.addTitle') : t('subscriptions.editTitle') }}
          </h3>
          <p class="mt-0.5 text-xs text-fg-muted">
            {{ t('subscriptions.modalDescription') }}
          </p>
        </div>
      </div>
    </template>
    <template #body>
      <div v-if="editingSubscriptionModel" class="space-y-4">
        <RecordConflictBanner
          :conflict="conflict"
          :is-saving="isSaving"
          @force-save="emit('force-save-conflict')"
          @reload="emit('reload-conflict')"
        />
        <EditForm v-model:editing-subscription="editingSubscriptionModel" />

        <RuleSection
          v-model:editing-subscription="editingSubscriptionModel"
          :add-custom-keyword="addCustomKeyword"
          :custom-keyword="customKeyword"
          :exclude-rule-state="excludeRuleState"
          :exclude-rules="excludeRules"
          :is-advanced-mode="isAdvancedMode"
          :is-other-selected="isOtherSelected"
          :is-rule-expanded="isRuleExpanded"
          :is-selected="isSelected"
          :keep-rules="keepRules"
          :preset-keywords="presetKeywords"
          :preset-protocols="presetProtocols"
          :preset-regions="presetRegions"
          :remove-exclude-rule="removeExcludeRule"
          :remove-keep-rule="removeKeepRule"
          :remove-rule="removeRule"
          :rule-mode="ruleMode"
          :selected-rules="selectedRules"
          :switch-to-advanced="switchToAdvanced"
          :switch-to-visual="switchToVisual"
          :toggle-tag="toggleTag"
          @toggle-expand="isRuleExpanded = !isRuleExpanded"
          @update:rule-mode="ruleMode = $event"
          @update:custom-keyword="customKeyword = $event"
        />

        <AdvancedOptions v-model:editing-subscription="editingSubscriptionModel" />
      </div>
    </template>
  </Modal>
</template>
