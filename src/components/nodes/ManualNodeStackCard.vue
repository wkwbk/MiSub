<script setup>
import { computed, ref } from 'vue';
import { Check, ChevronDown, ChevronUp, Layers, Zap } from '@lucide/vue';
import ManualNodeCard from '@/components/nodes/ManualNodeCard.vue';
import { useI18n } from '@/i18n/index.js';

const props = defineProps({
  ip: {
    type: String,
    required: true,
  },
  info: {
    type: Object,
    default: null,
  },
  nodes: {
    type: Array,
    default: () => [],
  },
  inspectMap: {
    type: Object,
    default: () => ({}),
  },
  isSelectionMode: Boolean,
  selectedNodeIds: {
    type: Object,
    required: true,
  },
  pingResults: {
    type: Object,
    default: () => ({}),
  },
  pingingNodes: {
    type: Object,
    default: () => new Set(),
  },
});

const emit = defineEmits(['delete', 'edit', 'detail', 'toggle-select', 'filter-tag', 'ping', 'ping-group']);
const { t } = useI18n();

const isExpanded = ref(false);

const protocolSummary = computed(() => {
  const protocols = new Set();
  for (const node of props.nodes) {
    const info = props.inspectMap?.[node.id];
    const p = (info?.protocol || '').toUpperCase();
    if (p && p !== 'UNKNOWN') {
      protocols.add(p === 'HYSTERIA2' ? 'HY2' : p);
    }
  }
  return Array.from(protocols).slice(0, 4);
});

const bestPingResult = computed(() => {
  let best = null;
  for (const node of props.nodes) {
    const r = props.pingResults?.[node.id];
    if (r?.status === 'ok' && Number.isFinite(r.latency)) {
      if (!best || r.latency < best.latency) {
        best = r;
      }
    }
  }
  return best;
});

const isAnyPinging = computed(() => props.nodes.some((n) => props.pingingNodes?.has(n.id)));

const isAllSelected = computed(
  () => props.nodes.length > 0 && props.nodes.every((n) => props.selectedNodeIds?.has(n.id)),
);

const isSomeSelected = computed(
  () => !isAllSelected.value && props.nodes.some((n) => props.selectedNodeIds?.has(n.id)),
);

const toggleSelectStack = () => {
  if (!props.isSelectionMode) return;
  const selectAll = !isAllSelected.value;
  for (const node of props.nodes) {
    const currentlySelected = props.selectedNodeIds?.has(node.id);
    if (selectAll && !currentlySelected) {
      emit('toggle-select', node.id);
    } else if (!selectAll && currentlySelected) {
      emit('toggle-select', node.id);
    }
  }
};

const countryBadge = computed(() => {
  const info = props.info;
  if (!info) return null;
  if (info.isRelay) {
    return {
      text: t('manualNodes.badgeRelay'),
      title: `${info.country || 'CN'} · ${info.asn || ''} ${info.org || ''}`.trim(),
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
    };
  }
  if (info.countryCode) {
    return {
      text: `${info.flag ? `${info.flag} ` : ''}${info.countryCode}`,
      title: `${info.country || info.countryCode}${info.asn ? ` · ${info.asn}` : ''}${info.org ? ` (${info.org})` : ''}`,
      className: 'border-line bg-transparent text-fg-muted',
    };
  }
  return null;
});

const handleHeaderClick = () => {
  if (props.isSelectionMode) {
    toggleSelectStack();
  } else {
    isExpanded.value = !isExpanded.value;
  }
};
</script>

<template>
  <div
    :class="isExpanded ? 'col-span-full' : ''"
    class="relative transition-all duration-200"
    data-testid="manual-node-stack-card"
  >
    <!-- Stacked deck depth effect when collapsed -->
    <div
      v-if="!isExpanded"
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-2 -bottom-1.5 h-3 rounded-b-md border border-t-0 border-line bg-surface/70"
    ></div>
    <div
      v-if="!isExpanded && nodes.length > 2"
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-4 -bottom-2.5 h-2 rounded-b-md border border-t-0 border-line/70 bg-surface/40"
    ></div>

    <!-- Main Stack Card Container -->
    <div
      :class="[
        isSelectionMode && isAllSelected ? 'border-line-strong bg-active' : 'border-line bg-surface',
        isExpanded ? 'border-line-strong' : 'hover:-translate-y-0.5 hover:border-line-strong',
      ]"
      class="relative flex flex-col justify-between rounded-md border p-3 transition-all duration-200 min-h-[116px]"
    >
      <!-- Stack Header -->
      <div class="cursor-pointer" @click="handleHeaderClick">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <!-- Selection Checkbox -->
            <div v-if="isSelectionMode" class="shrink-0 mr-0.5">
              <div
                :class="
                  isAllSelected || isSomeSelected
                    ? 'bg-accent border-accent text-accent-fg'
                    : 'border-line-strong bg-transparent'
                "
                class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
              >
                <Check v-if="isAllSelected" class="h-3 w-3" stroke-width="3" />
                <span v-else-if="isSomeSelected" class="h-0.5 w-2 bg-current"></span>
              </div>
            </div>

            <!-- Stack Count Badge -->
            <span
              class="inline-flex shrink-0 items-center gap-1 rounded-md border border-line-strong bg-active px-1.5 py-0.5 text-[10px] font-mono font-semibold text-fg"
            >
              <Layers class="h-3 w-3 text-fg-muted" />
              {{ t('manualNodes.stackCount', { count: nodes.length }) }}
            </span>

            <!-- Country / Relay Badge -->
            <span
              v-if="countryBadge"
              :class="countryBadge.className"
              :title="countryBadge.title"
              class="inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none"
            >
              {{ countryBadge.text }}
            </span>

            <!-- Direct Badge -->
            <span
              v-if="info?.networkType === 'direct'"
              :title="`${t('manualNodes.badgeDirect')}${info.asn ? ` · ${info.asn}` : ''}`"
              class="inline-flex shrink-0 items-center rounded-md border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-emerald-500"
            >
              {{ t('manualNodes.badgeDirect') }}
            </span>
          </div>

          <!-- Best Ping Result -->
          <div
            v-if="bestPingResult"
            class="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-transparent px-2 py-0.5 text-[10px] font-mono text-fg-muted"
          >
            <span
              :class="bestPingResult.latency < 300 ? 'bg-emerald-500' : 'bg-amber-500'"
              class="h-1.5 w-1.5 rounded-full shrink-0"
            ></span>
            <span>{{ bestPingResult.latency }}ms</span>
          </div>
        </div>

        <!-- Middle Row: Primary Node Name + Preview -->
        <div class="my-1.5 min-w-0">
          <h4 :title="nodes[0]?.name || ip" class="truncate text-sm font-medium text-fg">
            {{ nodes[0]?.name || t('manualNodes.unnamed') }}
          </h4>
          <p v-if="!isExpanded && nodes.length > 1" class="mt-0.5 truncate text-[11px] text-fg-subtle">
            {{
              nodes
                .slice(1, 3)
                .map((n) => n.name || t('manualNodes.unnamed'))
                .join(' · ')
            }}
            <span v-if="nodes.length > 3"> +{{ nodes.length - 3 }}</span>
          </p>
        </div>

        <!-- Protocol Pills -->
        <div v-if="protocolSummary.length > 0" class="mb-2 flex flex-wrap items-center gap-1">
          <span
            v-for="proto in protocolSummary"
            :key="proto"
            class="rounded-sm border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-mono text-fg-muted"
          >
            {{ proto }}
          </span>
        </div>
      </div>

      <!-- Footer Row: IP + Actions -->
      <div class="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2">
        <div class="min-w-0 flex-1">
          <span :title="ip" class="block truncate font-mono text-xs text-fg-subtle">
            {{ ip }}
          </span>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <button
            v-if="!isSelectionMode"
            :aria-label="t('manualNodes.stackPingGroup')"
            :class="{ 'animate-pulse text-fg': isAnyPinging }"
            :disabled="isAnyPinging"
            :title="t('manualNodes.stackPingGroup')"
            class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
            type="button"
            @click.stop="
              emit(
                'ping-group',
                nodes.map((n) => n.id),
              )
            "
          >
            <Zap class="h-3.5 w-3.5" />
          </button>
          <button
            class="inline-flex items-center gap-1 rounded-md border border-line bg-transparent px-2 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg cursor-pointer"
            data-testid="stack-toggle-expand"
            type="button"
            @click.stop="isExpanded = !isExpanded"
          >
            <span>{{
              isExpanded ? t('manualNodes.stackCollapse') : t('manualNodes.stackExpand', { count: nodes.length })
            }}</span>
            <ChevronUp v-if="isExpanded" class="h-3.5 w-3.5" />
            <ChevronDown v-else class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <!-- Expanded Child Node Cards -->
      <div
        v-if="isExpanded"
        class="mt-3 grid grid-cols-1 gap-3 border-t border-line pt-3 md:grid-cols-2 xl:grid-cols-3"
        data-testid="stack-expanded-children"
      >
        <ManualNodeCard
          v-for="node in nodes"
          :key="node.id"
          :inspect-info="inspectMap[node.id]"
          :is-pinging="pingingNodes.has(node.id)"
          :is-selected="selectedNodeIds.has(node.id)"
          :is-selection-mode="isSelectionMode"
          :node="node"
          :ping-result="pingResults[node.id]"
          @delete="emit('delete', node.id)"
          @detail="emit('detail', node)"
          @edit="emit('edit', node.id)"
          @ping="emit('ping', node.id)"
          @toggle-select="emit('toggle-select', node.id)"
          @filter-tag="emit('filter-tag', $event)"
        />
      </div>
    </div>
  </div>
</template>
