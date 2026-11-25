<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Braces, Plus } from '@lucide/vue';
import { useDataStore } from '@/stores/useDataStore.js';
import { useI18n } from '@/i18n/index.js';
import TemplateVariablesModal from '@/components/forms/TemplateVariablesModal.vue';
import Textarea from '@/components/ui/Textarea.vue';

interface RuleTemplateItem {
  id: string;
  name: string;
  description: string;
  type: string;
  content: string;
  enabled: boolean;
}

const emit = defineEmits<{
  saved: [templateId: string];
}>();

const { t } = useI18n();
const showTemplateVariables = ref(false);

const dataStore = useDataStore();

const DEFAULT_RULE_TEMPLATE_CONTENT = `[custom]
ruleset=🎯 全球直连,[]GEOIP,CN
ruleset=🎯 全球直连,[]GEOSITE,CN
ruleset=🎯 全球直连,[]DOMAIN-SUFFIX,local
ruleset=📲 电报消息,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Telegram.list
ruleset=🤖 AI 服务,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/OpenAi.list
ruleset=🎬 流媒体,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ProxyMedia.list
ruleset=🛑 广告拦截,https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/BanAD.list
ruleset=🐟 漏网之鱼,[]FINAL

custom_proxy_group=🚀 节点选择\`select\`[]♻️ 自动选择\`[]☑️ 手动切换\`[]DIRECT
custom_proxy_group=♻️ 自动选择\`url-test\`.*\`http://www.gstatic.com/generate_204\`300,,50
custom_proxy_group=☑️ 手动切换\`select\`.*
custom_proxy_group=📲 电报消息\`select\`[]🚀 节点选择\`[]♻️ 自动选择\`[]DIRECT
custom_proxy_group=🤖 AI 服务\`select\`[]🚀 节点选择\`[]♻️ 自动选择
custom_proxy_group=🎬 流媒体\`select\`[]🚀 节点选择\`[]♻️ 自动选择\`[]DIRECT
custom_proxy_group=🎯 全球直连\`select\`[]DIRECT\`[]🚀 节点选择
custom_proxy_group=🛑 广告拦截\`select\`[]REJECT\`[]DIRECT
custom_proxy_group=🐟 漏网之鱼\`select\`[]🚀 节点选择\`[]♻️ 自动选择\`[]DIRECT

enable_rule_generator=true
overwrite_original_rules=true`;

const blankTemplate = (): RuleTemplateItem => ({
  id: '',
  name: '',
  description: '',
  type: 'ini',
  content: DEFAULT_RULE_TEMPLATE_CONTENT,
  enabled: true,
});

const localTemplates = ref<RuleTemplateItem[]>([]);
const selectedId = ref('');
const selectedIndex = ref(-1);
const isSaving = ref(false);
const isLoading = ref(false);

const selectedTemplate = computed(() => {
  if (selectedIndex.value >= 0 && selectedIndex.value < localTemplates.value.length) {
    const byIndex = localTemplates.value[selectedIndex.value];
    if (byIndex && byIndex.id === selectedId.value) {
      return byIndex;
    }
  }
  return localTemplates.value.find((item) => item.id === selectedId.value) || null;
});
const selectedTemplateId = computed({
  get: () => selectedTemplate.value?.id || '',
  set: (value: string) => {
    if (!selectedTemplate.value) return;
    selectedTemplate.value.id = value;
    selectedId.value = value;
  },
});
const hasTemplates = computed(() => localTemplates.value.length > 0);

function cloneTemplates(items: unknown): RuleTemplateItem[] {
  return JSON.parse(JSON.stringify(Array.isArray(items) ? items : []));
}

function selectTemplateAt(index: number) {
  if (index >= 0 && index < localTemplates.value.length) {
    selectedIndex.value = index;
    selectedId.value = localTemplates.value[index].id;
  } else {
    selectedIndex.value = -1;
    selectedId.value = '';
  }
}

function syncFromStore() {
  localTemplates.value = cloneTemplates(dataStore.ruleTemplates);
  if (!localTemplates.value.length) {
    selectTemplateAt(-1);
    return;
  }
  const matchedIdx = selectedId.value ? localTemplates.value.findIndex((item) => item.id === selectedId.value) : -1;
  selectTemplateAt(matchedIdx >= 0 ? matchedIdx : 0);
}

watch(() => dataStore.ruleTemplates, syncFromStore, { immediate: true, deep: true });

function createTemplate() {
  const now = Date.now().toString(36);
  const template: RuleTemplateItem = {
    ...blankTemplate(),
    id: `custom-${now}`,
    name: t('settings.ruleTemplateDefaultName'),
  };
  localTemplates.value.unshift(template);
  selectTemplateAt(0);
  return template;
}

function duplicateTemplate(template: RuleTemplateItem) {
  if (!template) return;
  const copy = cloneTemplates([template])[0];
  copy.id = `${template.id || 'custom'}-copy-${Date.now().toString(36)}`;
  copy.name = `${template.name || t('settings.ruleTemplateDefaultName')} ${t('settings.ruleTemplateCopySuffix')}`;
  localTemplates.value.unshift(copy);
  selectTemplateAt(0);
}

function removeTemplate(template: RuleTemplateItem) {
  if (!template) return;
  localTemplates.value = localTemplates.value.filter((item) => item !== template);
  selectTemplateAt(localTemplates.value.length ? 0 : -1);
}

async function refreshTemplates() {
  isLoading.value = true;
  try {
    await dataStore.fetchRuleTemplates();
    syncFromStore();
  } finally {
    isLoading.value = false;
  }
}

async function saveTemplates() {
  isSaving.value = true;
  try {
    const saved = await dataStore.saveRuleTemplates(localTemplates.value);
    localTemplates.value = cloneTemplates(saved);
    const matchedIdx = localTemplates.value.findIndex((item) => item.id === selectedId.value);
    selectTemplateAt(matchedIdx >= 0 ? matchedIdx : localTemplates.value.length ? 0 : -1);
    const active = selectedTemplate.value && selectedTemplate.value.enabled !== false ? selectedTemplate.value : null;
    emit('saved', active?.id || '');
    return true;
  } catch {
    return false;
  } finally {
    isSaving.value = false;
  }
}

defineExpose({
  refreshTemplates,
  createTemplate,
  saveTemplates,
  isSaving,
  isLoading,
  hasTemplates,
  selectedId,
  localTemplates,
});
</script>

<template>
  <div class="w-full">
    <div v-if="!hasTemplates" class="rounded-md border border-dashed border-line bg-inset/70 px-6 py-12 text-center">
      <p class="text-xs font-medium text-fg-muted">
        {{ t('settings.ruleTemplatesEmpty') }}
      </p>
      <p class="mt-1 text-xs text-fg-subtle">
        {{ t('settings.ruleTemplatesEmptyHint') }}
      </p>
      <button
        class="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-fg transition hover:opacity-90"
        data-testid="empty-create-rule-template"
        type="button"
        @click="createTemplate"
      >
        <Plus class="h-3.5 w-3.5" />
        <span>{{ t('settings.ruleTemplatesNew') }}</span>
      </button>
    </div>

    <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      <div class="space-y-1.5">
        <button
          v-for="(template, index) in localTemplates"
          :key="index"
          :class="
            selectedTemplate === template
              ? 'border-line-strong bg-elevated-card text-fg'
              : 'border-line bg-transparent text-fg-muted hover:bg-hover hover:text-fg'
          "
          class="w-full rounded-md border px-3 py-2 text-left transition"
          type="button"
          @click="selectTemplateAt(index)"
        >
          <div class="truncate text-xs font-semibold">
            {{ template.name || t('settings.ruleTemplateUnnamed') }}
          </div>
          <div class="mt-1 truncate font-mono text-xs text-fg-subtle">custom:{{ template.id }}</div>
        </button>
      </div>

      <div v-if="selectedTemplate" class="space-y-4 lg:pl-6 lg:border-l lg:border-line">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-xs font-semibold uppercase tracking-wide text-fg-muted">{{
              t('settings.ruleTemplateName')
            }}</span>
            <input
              v-model="selectedTemplate.name"
              class="block w-full rounded-md border border-line bg-inset px-3 py-2 text-sm text-fg focus:border-line-strong focus:outline-hidden"
            />
          </label>
          <label class="block">
            <span class="mb-1 block text-xs font-semibold uppercase tracking-wide text-fg-muted">{{
              t('settings.ruleTemplateId')
            }}</span>
            <input
              v-model="selectedTemplateId"
              class="block w-full rounded-md border border-line bg-inset px-3 py-2 font-mono text-sm text-fg focus:border-line-strong focus:outline-hidden"
            />
          </label>
        </div>

        <label class="block">
          <span class="mb-1 block text-xs font-semibold uppercase tracking-wide text-fg-muted">{{
            t('settings.ruleTemplateDescription')
          }}</span>
          <input
            v-model="selectedTemplate.description"
            :placeholder="t('settings.ruleTemplateDescriptionPlaceholder')"
            class="block w-full rounded-md border border-line bg-inset px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-line-strong focus:outline-hidden"
          />
        </label>

        <div>
          <div class="mb-1 flex items-center justify-between gap-2">
            <span class="text-xs font-semibold uppercase tracking-wide text-fg-muted">{{
              t('settings.ruleTemplateContent')
            }}</span>
            <button
              class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
              type="button"
              @click="showTemplateVariables = true"
            >
              <Braces class="h-3.5 w-3.5" />
              <span>{{ t('transformSelector.templateVariablesTitle') }}</span>
            </button>
          </div>
          <Textarea
            v-model="selectedTemplate.content"
            class="px-3 py-2 font-mono text-xs leading-relaxed"
            rows="12"
            spellcheck="false"
            wrapperClass="focus-within:border-line-strong focus-within:ring-0"
          />
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <label class="flex items-center gap-2 text-xs font-medium text-fg-muted">
            <input
              v-model="selectedTemplate.enabled"
              class="h-4 w-4 rounded-sm border-line-strong bg-inset text-fg focus:ring-0"
              type="checkbox"
            />
            {{ t('settings.ruleTemplateEnabled') }}
          </label>
          <div class="flex gap-2">
            <button
              class="rounded-md border border-line bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg"
              type="button"
              @click="duplicateTemplate(selectedTemplate)"
            >
              {{ t('actions.copy') }}
            </button>
            <button
              class="rounded-md border border-red-900/60 bg-transparent px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/30"
              type="button"
              @click="removeTemplate(selectedTemplate)"
            >
              {{ t('actions.delete') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <TemplateVariablesModal v-model:show="showTemplateVariables" />
  </div>
</template>
