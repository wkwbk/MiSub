<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { Braces, Check, Copy } from '@lucide/vue';
import Modal from '@/components/ui/Modal.vue';
import { useI18n } from '@/i18n/index.js';
import { copyTextToClipboard } from '@/utils/clipboard.js';

interface TemplateVariableItem {
  key: string;
  example: string;
}

interface TemplateVariableGroup {
  id: string;
  wide: boolean;
  title: string;
  items: TemplateVariableItem[];
}

withDefaults(
  defineProps<{
    show?: boolean;
    zIndex?: string | number;
  }>(),
  {
    show: false,
    zIndex: 'var(--z-modal-popover)',
  },
);

const emit = defineEmits<{
  'update:show': [value: boolean];
}>();
const { t } = useI18n();

const copiedKey = ref('');
let copyTimer: ReturnType<typeof setTimeout> | null = null;

// 模板变量说明必须放在 computed 里求值，保证切换语言即时更新
const templateVariableGroups = computed<TemplateVariableGroup[]>(() => [
  {
    id: 'basic',
    wide: false,
    title: t('transformSelector.varGroupBasic'),
    items: [
      { key: '<%proxies%>', example: t('transformSelector.varProxies') },
      { key: '<%rules%>', example: t('transformSelector.varRules') },
      { key: '<%file_name%>', example: t('transformSelector.varFileName') },
      { key: '<%target_format%>', example: t('transformSelector.varTargetFormat') },
      { key: '<%node_count%>', example: t('transformSelector.varNodeCount') },
    ],
  },
  {
    id: 'strategy',
    wide: false,
    title: t('transformSelector.varGroupStrategy'),
    items: [
      {
        key: '<%primary_strategy_chain%>',
        example: t('transformSelector.varPrimaryStrategyChain'),
      },
      {
        key: '<%region_strategy_chain%>',
        example: t('transformSelector.varRegionStrategyChain'),
      },
      {
        key: '<%protocol_strategy_chain%>',
        example: t('transformSelector.varProtocolStrategyChain'),
      },
      {
        key: '<%all_strategy_groups%>',
        example: t('transformSelector.varAllStrategyGroups'),
      },
    ],
  },
  {
    id: 'detail',
    wide: true,
    title: t('transformSelector.varGroupDetail'),
    items: [
      {
        key: '<%region_group_names%>',
        example: t('transformSelector.varRegionGroupNames'),
      },
      {
        key: '<%region_group_counts%>',
        example: t('transformSelector.varRegionGroupCounts'),
      },
      {
        key: '<%region_group_list%>',
        example: t('transformSelector.varRegionGroupList'),
      },
      {
        key: '<%protocol_group_names%>',
        example: t('transformSelector.varProtocolGroupNames'),
      },
      {
        key: '<%protocol_group_counts%>',
        example: t('transformSelector.varProtocolGroupCounts'),
      },
      {
        key: '<%protocol_group_list%>',
        example: t('transformSelector.varProtocolGroupList'),
      },
    ],
  },
]);

async function copyVariable(variableKey: string): Promise<void> {
  const copied = await copyTextToClipboard(variableKey);
  if (!copied) return;
  copiedKey.value = variableKey;
  if (copyTimer !== null) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copiedKey.value = '';
  }, 1500);
}

onUnmounted(() => {
  if (copyTimer !== null) clearTimeout(copyTimer);
});
</script>

<template>
  <Modal :show="show" :z-index="zIndex" size="2xl" @update:show="emit('update:show', $event)">
    <template #title>
      <div class="flex items-center gap-2.5">
        <div class="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-inset text-fg-muted">
          <Braces class="h-3.5 w-3.5" />
        </div>
        <div>
          <h3 class="text-base font-semibold text-fg">
            {{ t('transformSelector.templateVariablesTitle') }}
          </h3>
          <p class="mt-0.5 text-xs text-fg-muted">
            {{ t('transformSelector.templateVariablesDesc') }}
          </p>
        </div>
      </div>
    </template>

    <template #body>
      <div class="grid gap-4 md:grid-cols-2">
        <div
          v-for="group in templateVariableGroups"
          :key="group.id"
          :class="group.wide ? 'md:col-span-2' : ''"
          class="rounded-md border border-line bg-inset p-4"
        >
          <h4 class="text-xs font-semibold uppercase tracking-wider text-fg-muted">
            {{ group.title }}
          </h4>
          <div :class="group.wide ? 'grid gap-2.5 sm:grid-cols-2' : 'space-y-2.5'" class="mt-3">
            <button
              v-for="item in group.items"
              :key="item.key"
              class="group flex w-full flex-col items-start rounded-md border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-line-strong hover:bg-hover"
              type="button"
              @click="copyVariable(item.key)"
            >
              <div class="flex w-full items-center justify-between gap-2">
                <code class="font-mono text-xs text-fg">{{ item.key }}</code>
                <span
                  v-if="copiedKey === item.key"
                  class="inline-flex items-center gap-1 text-xs font-medium text-emerald-400"
                >
                  <Check class="h-3 w-3" />
                  {{ t('transformSelector.variableCopied') }}
                </span>
                <Copy v-else class="h-3 w-3 shrink-0 text-fg-subtle transition-colors group-hover:text-fg" />
              </div>
              <p class="mt-1 text-xs leading-relaxed text-fg-subtle">
                {{ t('transformSelector.exampleLabel') }}: {{ item.example }}
              </p>
            </button>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <button
        class="rounded-md bg-accent px-4 py-2 text-xs font-semibold text-accent-fg transition-colors hover:opacity-90"
        type="button"
        @click="emit('update:show', false)"
      >
        {{ t('actions.close') }}
      </button>
    </template>
  </Modal>
</template>
