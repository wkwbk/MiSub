<script setup>
import { computed, ref } from 'vue';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Filter,
  PauseCircle,
  PenLine,
  PlayCircle,
  Plus,
  X,
  Zap,
} from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import FilterEditor from '@/components/operators/components/FilterEditor.vue';
import RenameEditor from '@/components/operators/components/RenameEditor.vue';
import SortEditor from '@/components/operators/components/SortEditor.vue';
import DedupEditor from '@/components/operators/components/DedupEditor.vue';
import Input from '@/components/ui/Input.vue';
import Textarea from '@/components/ui/Textarea.vue';

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [],
  },
  legacyData: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();

// Migration Logic
const canMigrate = computed(() => {
  return props.modelValue.length === 0 && props.legacyData && props.legacyData.enabled;
});

const migrateFromLegacy = () => {
  if (!props.legacyData) return;
  const config = props.legacyData;
  const ops = [];

  // 1. Filter
  const filter = config.filter;
  if (
    filter &&
    (filter.include?.enabled ||
      filter.exclude?.enabled ||
      filter.protocols?.enabled ||
      filter.regions?.enabled ||
      filter.script?.enabled ||
      filter.useless?.enabled)
  ) {
    ops.push({
      id: crypto.randomUUID(),
      type: 'filter',
      enabled: true,
      params: JSON.parse(JSON.stringify(filter)),
    });
  }

  // 2. Rename (Regex)
  const regex = config.rename?.regex;
  if (regex?.enabled && regex.rules?.length > 0) {
    ops.push({
      id: crypto.randomUUID(),
      type: 'rename',
      enabled: true,
      params: { regex: JSON.parse(JSON.stringify(regex)) },
    });
  }

  // 3. Rename (Template)
  const template = config.rename?.template;
  if (template?.enabled) {
    ops.push({
      id: crypto.randomUUID(),
      type: 'rename',
      enabled: true,
      params: {
        template: {
          enabled: true,
          template: template.template || '{emoji}{region}-{protocol}-{index}',
          offset: template.indexStart || 1,
        },
      },
    });
  }

  // 4. Script Rename
  const renameScript = config.rename?.script;
  if (renameScript?.enabled && renameScript.expression) {
    ops.push({
      id: crypto.randomUUID(),
      type: 'script',
      enabled: true,
      params: {
        code: `return ($nodes) => { return $nodes.map(n => { n.name = (${renameScript.expression})(n.name, n); return n; }); }`,
      },
    });
  }

  // 5. Dedup
  const dedup = config.dedup;
  if (dedup?.enabled) {
    ops.push({
      id: crypto.randomUUID(),
      type: 'dedup',
      enabled: true,
      params: JSON.parse(JSON.stringify(dedup)),
    });
  }

  // 6. Sort
  const sort = config.sort;
  if (sort?.enabled && sort.keys?.length > 0) {
    ops.push({
      id: crypto.randomUUID(),
      type: 'sort',
      enabled: true,
      params: JSON.parse(JSON.stringify(sort)),
    });
  }

  emit('update:modelValue', ops);
};

// Track which operator is expanded
const expandedIndex = ref(props.modelValue.length > 0 ? props.modelValue.length - 1 : null);

const toggleExpand = (index) => {
  expandedIndex.value = expandedIndex.value === index ? null : index;
};

const addOperator = (type) => {
  const newOp = {
    id: Math.random().toString(36).substring(2, 11),
    type,
    enabled: true,
    params: getInitialParams(type),
  };
  const newList = [...props.modelValue, newOp];
  emit('update:modelValue', newList);
  // Auto expand new operator
  expandedIndex.value = newList.length - 1;
};

const getInitialParams = (type) => {
  switch (type) {
    case 'filter':
      return {
        include: { enabled: false, rules: [] },
        exclude: { enabled: false, rules: [] },
        protocols: { enabled: false, values: [] },
        regions: { enabled: false, values: [] },
      };
    case 'rename':
      return {
        regex: { enabled: false, rules: [] },
        template: { enabled: false, template: '' },
      };
    case 'script':
      return { code: '', url: '' };
    case 'sort':
      return {
        keys: [
          {
            key: 'region',
            order: 'asc',
            customOrder: ['香港', '台湾', '日本', '新加坡', '美国', '韩国', '英国', '德国', '法国', '加拿大'],
          },
        ],
      };
    case 'dedup':
      return { mode: 'serverPort', includeProtocol: true, prefer: { protocolOrder: [] } };
    default:
      return {};
  }
};

const removeOperator = (index) => {
  const newList = [...props.modelValue];
  newList.splice(index, 1);
  emit('update:modelValue', newList);
  if (expandedIndex.value === index) expandedIndex.value = null;
};

const moveOperator = (event, index, direction) => {
  event.stopPropagation();
  const newList = [...props.modelValue];
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= newList.length) return;
  [newList[index], newList[newIndex]] = [newList[newIndex], newList[index]];
  emit('update:modelValue', newList);
  if (expandedIndex.value === index) expandedIndex.value = newIndex;
  else if (expandedIndex.value === newIndex) expandedIndex.value = index;
};

const isOperatorEnabled = (op) => op?.enabled !== false;

const toggleOperator = (event, index) => {
  event.stopPropagation();
  const newList = [...props.modelValue];
  newList[index] = { ...newList[index], enabled: !isOperatorEnabled(newList[index]) };
  emit('update:modelValue', newList);
};

const operatorLabel = (type) => t(`operators.${type}`);
const operatorTypes = ['filter', 'rename', 'script', 'sort', 'dedup'];

const OPERATOR_ICONS = {
  filter: Filter,
  rename: PenLine,
  script: Code2,
  sort: ArrowUpDown,
  dedup: Copy,
};

const getOperatorIcon = (type) => OPERATOR_ICONS[type] || Filter;

const updateOperatorParams = (index, params) => {
  const newList = [...props.modelValue];
  newList[index] = { ...newList[index], params };
  emit('update:modelValue', newList);
};
</script>

<template>
  <div class="space-y-4">
    <!-- Migration Suggestion Card -->
    <div v-if="canMigrate" class="group relative mb-6 overflow-hidden rounded-md border border-line bg-transparent p-4">
      <div class="relative z-10 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div
            class="w-9 h-9 rounded-md border border-line bg-transparent text-fg-muted flex items-center justify-center shrink-0"
          >
            <Zap class="h-4 w-4" />
          </div>
          <div>
            <h4 class="text-xs font-semibold text-fg">
              {{ t('operators.legacyConfigFound') }}
            </h4>
            <p class="mt-0.5 text-xs text-fg-muted">
              {{ t('operators.legacyConfigDesc') }}
            </p>
          </div>
        </div>
        <button
          class="whitespace-nowrap rounded-md border border-accent bg-accent px-4 py-1.5 text-xs font-semibold text-accent-fg shadow-none transition-colors hover:opacity-90"
          @click="migrateFromLegacy"
        >
          {{ t('operators.migrateNow') }}
        </button>
      </div>
    </div>

    <div
      v-if="modelValue.length === 0 && !canMigrate"
      class="rounded-md border border-line bg-transparent py-10 text-center"
    >
      <div
        class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-line bg-transparent text-fg-muted"
      >
        <Plus class="h-5 w-5" />
      </div>
      <h3 class="text-xs font-semibold text-fg">
        {{ t('operators.emptyTitle') }}
      </h3>
      <p class="mt-1 text-xs text-fg-subtle">{{ t('operators.emptyDesc') }}</p>
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="(op, index) in modelValue"
        :key="op.id || index"
        :class="[
          'group overflow-hidden rounded-md border bg-transparent transition-colors',
          expandedIndex === index ? 'border-line-strong' : 'border-line hover:border-line-strong',
          !isOperatorEnabled(op) && 'opacity-60 grayscale-[0.5]',
        ]"
      >
        <!-- Compact Header -->
        <div class="cursor-pointer select-none p-3 hover:bg-hover" @click="toggleExpand(index)">
          <div class="flex items-start justify-between gap-3 sm:items-center">
            <div class="flex items-center gap-3 min-w-0">
              <div
                :class="[
                  'w-8 h-8 flex items-center justify-center rounded-md border shadow-none transition-colors',
                  expandedIndex === index
                    ? 'bg-accent border-accent text-accent-fg'
                    : 'bg-transparent border-line text-fg-muted',
                ]"
              >
                <component :is="getOperatorIcon(op.type)" class="h-4 w-4" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h4 class="font-semibold text-xs text-fg">
                    {{ operatorLabel(op.type) }}
                  </h4>
                  <span
                    v-if="!isOperatorEnabled(op)"
                    class="rounded-md border border-line bg-transparent px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle"
                    >{{ t('operators.paused') }}</span
                  >
                </div>
                <p class="mt-1 text-[11px] text-fg-subtle sm:hidden">
                  {{ isOperatorEnabled(op) ? t('operators.enabled') : t('operators.disabled') }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <div
                class="flex items-center gap-1 pr-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              >
                <button
                  :disabled="index === 0"
                  class="rounded-md p-1 text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-30"
                  @click="(e) => moveOperator(e, index, -1)"
                >
                  <ChevronUp class="h-4 w-4" />
                </button>
                <button
                  :disabled="index === modelValue.length - 1"
                  class="rounded-md p-1 text-fg-muted hover:bg-hover hover:text-fg disabled:opacity-30"
                  @click="(e) => moveOperator(e, index, 1)"
                >
                  <ChevronDown class="h-4 w-4" />
                </button>
                <button
                  :aria-label="isOperatorEnabled(op) ? t('operators.paused') : t('operators.enabled')"
                  :class="
                    isOperatorEnabled(op)
                      ? 'text-fg-muted hover:bg-hover hover:text-amber-400'
                      : 'text-fg-muted hover:bg-hover hover:text-emerald-400'
                  "
                  :title="isOperatorEnabled(op) ? t('operators.paused') : t('operators.enabled')"
                  class="rounded-md p-1 transition-colors"
                  type="button"
                  @click="(e) => toggleOperator(e, index)"
                >
                  <PauseCircle v-if="isOperatorEnabled(op)" class="h-4 w-4" />
                  <PlayCircle v-else class="h-4 w-4" />
                </button>
                <button
                  class="rounded-md p-1 text-fg-muted hover:bg-red-950/40 hover:text-red-400"
                  @click="
                    (e) => {
                      e.stopPropagation();
                      removeOperator(index);
                    }
                  "
                >
                  <X class="h-4 w-4" />
                </button>
              </div>
              <ChevronDown
                :class="{ 'rotate-180 text-fg': expandedIndex === index }"
                class="h-4 w-4 text-fg-muted transition-transform duration-300"
              />
            </div>
          </div>
        </div>

        <!-- Collapsible Content -->
        <transition
          enter-active-class="transition-[max-height,opacity] duration-300 ease-out"
          enter-from-class="max-h-0 opacity-0"
          enter-to-class="max-h-[800px] opacity-100"
          leave-active-class="transition-[max-height,opacity] duration-200 ease-in"
          leave-from-class="max-h-[800px] opacity-100"
          leave-to-class="max-h-0 opacity-0"
        >
          <div v-show="expandedIndex === index" class="border-t border-line">
            <div class="p-4 sm:p-5">
              <FilterEditor
                v-if="op.type === 'filter'"
                :modelValue="op.params"
                @update:modelValue="(val) => updateOperatorParams(index, val)"
              />
              <RenameEditor
                v-else-if="op.type === 'rename'"
                :modelValue="op.params"
                @update:modelValue="(val) => updateOperatorParams(index, val)"
              />
              <SortEditor
                v-else-if="op.type === 'sort'"
                :modelValue="op.params"
                @update:modelValue="(val) => updateOperatorParams(index, val)"
              />
              <DedupEditor
                v-else-if="op.type === 'dedup'"
                :modelValue="op.params"
                @update:modelValue="(val) => updateOperatorParams(index, val)"
              />

              <div v-else-if="op.type === 'script'" class="space-y-4">
                <Input
                  :label="t('operators.scriptUrlLabel')"
                  :modelValue="op.params.url"
                  :placeholder="t('operators.scriptUrlPlaceholder')"
                  @update:modelValue="(val) => updateOperatorParams(index, { ...op.params, url: val })"
                />
                <Textarea
                  :modelValue="op.params.code"
                  class="h-64 p-3 font-mono text-xs resize-none"
                  placeholder="function operator($proxies, $context) { ... }"
                  @update:modelValue="
                    (val) =>
                      updateOperatorParams(index, {
                        ...op.params,
                        code: val,
                      })
                  "
                />
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- Add Control (Segmented Style) -->
    <div class="pt-4">
      <div class="grid grid-cols-2 gap-1.5 rounded-md border border-line bg-inset p-1 sm:inline-flex sm:flex-wrap">
        <button
          v-for="type in operatorTypes"
          :key="type"
          class="rounded-md px-3.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg whitespace-nowrap"
          @click="addOperator(type)"
        >
          + {{ operatorLabel(type) }}
        </button>
      </div>
    </div>
  </div>
</template>
