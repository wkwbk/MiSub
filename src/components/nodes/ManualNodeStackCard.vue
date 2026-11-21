<script setup>
import { computed, ref } from 'vue';
import { Check, ChevronRight, Layers, Loader2, X, Zap } from '@lucide/vue';
import ManualNodeCard from '@/components/nodes/ManualNodeCard.vue';
import Modal from '@/components/ui/Modal.vue';
import { getItemTags } from '@/utils/tags.js';
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

const showStackModal = ref(false);

const getProtocolMeta = (node) => {
  const raw = String(props.inspectMap?.[node.id]?.protocol || '').toLowerCase();
  switch (raw) {
    case 'vless':
      return { text: 'VLESS', dot: 'bg-sky-500' };
    case 'hysteria2':
    case 'hy2':
      return { text: 'HY2', dot: 'bg-purple-500' };
    case 'hysteria':
    case 'hy':
      return { text: 'HY', dot: 'bg-fuchsia-500' };
    case 'tuic':
      return { text: 'TUIC', dot: 'bg-cyan-500' };
    case 'trojan':
      return { text: 'TROJAN', dot: 'bg-red-500' };
    case 'vmess':
      return { text: 'VMESS', dot: 'bg-emerald-500' };
    case 'ss':
      return { text: 'SS', dot: 'bg-amber-500' };
    case 'ssr':
      return { text: 'SSR', dot: 'bg-rose-500' };
    case 'anytls':
      return { text: 'AnyTLS', dot: 'bg-zinc-400' };
    case 'socks5':
      return { text: 'SOCKS5', dot: 'bg-lime-500' };
    default:
      return { text: raw ? raw.toUpperCase() : 'NODE', dot: 'bg-zinc-500' };
  }
};

const previewNodes = computed(() =>
  props.nodes.slice(0, 3).map((node) => ({
    node,
    proto: getProtocolMeta(node),
    ping: props.pingResults?.[node.id] || null,
  })),
);

const overflowNodeCount = computed(() => Math.max(0, props.nodes.length - 3));

const stackTags = computed(() => {
  const seen = new Set();
  for (const node of props.nodes) {
    for (const tag of getItemTags(node)) {
      seen.add(tag);
      if (seen.size >= 2) break;
    }
    if (seen.size >= 2) break;
  }
  return Array.from(seen);
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
    const label = info.country && info.country !== info.countryCode ? info.country : info.countryCode;
    return {
      text: info.flag && label !== info.countryCode ? `${info.flag} ${label}` : label,
      title: `${info.country || info.countryCode}${info.asn ? ` · ${info.asn}` : ''}${info.org ? ` (${info.org})` : ''}`,
      className: 'border-line bg-transparent text-fg-muted',
    };
  }
  return null;
});

const handleCardClick = () => {
  if (props.isSelectionMode) {
    toggleSelectStack();
  } else {
    showStackModal.value = true;
  }
};

const handleEditFromModal = (nodeId) => {
  showStackModal.value = false;
  emit('edit', nodeId);
};

const handleDeleteFromModal = (nodeId) => {
  if (props.nodes.length <= 2) {
    showStackModal.value = false;
  }
  emit('delete', nodeId);
};
</script>

<template>
  <div class="relative pb-2" data-testid="manual-node-stack-card">
    <!-- Stacked deck layers underneath -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-2 bottom-0.5 h-3 rounded-b-md border border-t-0 border-line bg-surface/75 transition-colors"
    ></div>
    <div
      v-if="nodes.length > 2"
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-4 -bottom-0.5 h-2 rounded-b-md border border-t-0 border-line/65 bg-surface/40"
    ></div>

    <!-- Main Stack Card -->
    <div
      :class="
        isSelectionMode && isAllSelected
          ? 'border-line-strong bg-active'
          : 'border-line bg-surface hover:border-line-strong'
      "
      class="group relative flex h-full min-h-[144px] cursor-pointer flex-col justify-between rounded-md border p-3 transition-all duration-200 hover:-translate-y-0.5"
      @click="handleCardClick"
    >
      <!-- Top Row: Stack Count + Country/Relay + Direct + Tags + Best Latency -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <div v-if="isSelectionMode" class="mr-0.5 shrink-0">
            <div
              :class="
                isAllSelected || isSomeSelected
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-line-strong bg-transparent'
              "
              class="flex h-4 w-4 items-center justify-center rounded-sm border transition-colors"
            >
              <Check v-if="isAllSelected" class="h-3 w-3" stroke-width="3" />
              <span v-else-if="isSomeSelected" class="h-0.5 w-2 bg-current"></span>
            </div>
          </div>

          <span
            class="inline-flex shrink-0 items-center gap-1 rounded-md border border-line-strong bg-active px-1.5 py-0.5 text-[10px] font-mono font-semibold text-fg"
          >
            <Layers class="h-3 w-3 text-fg-muted" />
            {{ t('manualNodes.stackCount', { count: nodes.length }) }}
          </span>

          <span
            v-if="countryBadge"
            :class="countryBadge.className"
            :title="countryBadge.title"
            class="inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none"
          >
            {{ countryBadge.text }}
          </span>

          <span
            v-if="info?.networkType === 'direct'"
            :title="`${t('manualNodes.badgeDirect')}${info.asn ? ` · ${info.asn}` : ''}`"
            class="inline-flex shrink-0 items-center rounded-md border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-emerald-500"
          >
            {{ t('manualNodes.badgeDirect') }}
          </span>

          <span
            v-for="tag in stackTags"
            :key="tag"
            :title="tag"
            class="max-w-[72px] shrink-0 truncate rounded-md border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
            @click.stop="emit('filter-tag', tag)"
          >
            {{ tag }}
          </span>
        </div>

        <div
          v-if="bestPingResult"
          class="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-transparent px-2 py-0.5 text-[10px] font-mono text-fg-muted"
        >
          <span
            :class="bestPingResult.latency < 300 ? 'bg-emerald-500' : 'bg-amber-500'"
            class="h-1.5 w-1.5 shrink-0 rounded-full"
          ></span>
          <span>{{ bestPingResult.latency }}ms</span>
        </div>
      </div>

      <!-- Middle Section: Compact Preview List of Stacked Nodes -->
      <div class="my-2 space-y-1">
        <div
          v-for="{ node, proto, ping } in previewNodes"
          :key="node.id"
          class="flex items-center justify-between gap-2 rounded-sm bg-inset/60 px-2 py-1 text-xs"
        >
          <div class="flex min-w-0 items-center gap-1.5">
            <span :class="proto.dot" class="h-1.5 w-1.5 shrink-0 rounded-full"></span>
            <span class="shrink-0 font-mono text-[10px] text-fg-subtle">{{ proto.text }}</span>
            <span :title="node.name || t('manualNodes.unnamed')" class="truncate font-medium text-fg">
              {{ node.name || t('manualNodes.unnamed') }}
            </span>
          </div>
          <span
            v-if="ping && ping.status === 'ok'"
            :class="ping.latency < 300 ? 'text-emerald-500' : 'text-amber-500'"
            class="shrink-0 font-mono text-[10px]"
          >
            {{ ping.latency }}ms
          </span>
          <span v-else-if="ping && ping.status === 'unsupported'" class="shrink-0 font-mono text-[10px] text-fg-subtle">
            UDP
          </span>
        </div>
        <div v-if="overflowNodeCount > 0" class="px-2 text-[10px] font-mono text-fg-subtle">
          +{{ overflowNodeCount }} {{ t('manualNodes.stackMoreNodes') }}
        </div>
      </div>

      <!-- Bottom Row: Resolved IP + Quick Actions -->
      <div class="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2">
        <span :title="ip" class="min-w-0 flex-1 truncate font-mono text-xs text-fg-subtle">
          {{ ip }}
        </span>

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
            <Loader2 v-if="isAnyPinging" class="h-3.5 w-3.5 animate-spin" />
            <Zap v-else class="h-3.5 w-3.5" />
          </button>
          <button
            class="inline-flex items-center gap-0.5 rounded-md border border-line bg-transparent px-2 py-1 text-[11px] font-medium text-fg-muted transition-colors group-hover:border-line-strong group-hover:text-fg hover:bg-hover cursor-pointer"
            data-testid="stack-toggle-expand"
            type="button"
            @click.stop="showStackModal = true"
          >
            <span>{{ t('manualNodes.stackViewAll') }}</span>
            <ChevronRight class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Clean Modal View for All Nodes on This IP (Zero Grid Reflow!) -->
    <Modal v-model:show="showStackModal" body-class="px-5 py-4" size="4xl">
      <template #title>
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="inline-flex items-center gap-1 rounded-md border border-line-strong bg-active px-2 py-0.5 text-xs font-mono font-semibold text-fg"
              >
                <Layers class="h-3.5 w-3.5 text-fg-muted" />
                {{ t('manualNodes.stackCount', { count: nodes.length }) }}
              </span>
              <h3 class="truncate font-mono text-base font-semibold text-fg">
                {{ ip }}
              </h3>
              <span
                v-if="countryBadge"
                :class="countryBadge.className"
                class="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
              >
                {{ countryBadge.text }}
              </span>
              <span
                v-if="info?.networkType === 'direct'"
                class="inline-flex items-center rounded-md border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-500"
              >
                {{ t('manualNodes.badgeDirect') }}
              </span>
            </div>
            <p v-if="info?.asn || info?.org" class="mt-1 truncate text-xs text-fg-muted">
              {{ [info?.asn, info?.org].filter(Boolean).join(' · ') }}
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-1.5">
            <button
              :disabled="isAnyPinging"
              class="inline-flex items-center gap-1.5 rounded-md border border-line bg-transparent px-2.5 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg disabled:opacity-50"
              type="button"
              @click="
                emit(
                  'ping-group',
                  nodes.map((n) => n.id),
                )
              "
            >
              <Loader2 v-if="isAnyPinging" class="h-3.5 w-3.5 animate-spin text-emerald-500" />
              <Zap v-else class="h-3.5 w-3.5 text-emerald-500" />
              {{ t('manualNodes.stackPingGroup') }}
            </button>
            <button
              :aria-label="t('nodeDetail.close')"
              class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line hover:bg-hover hover:text-fg"
              type="button"
              @click="showStackModal = false"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>
      </template>

      <template #body>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="stack-expanded-children">
          <ManualNodeCard
            v-for="node in nodes"
            :key="node.id"
            :inspect-info="inspectMap[node.id]"
            :is-pinging="pingingNodes.has(node.id)"
            :is-selected="selectedNodeIds.has(node.id)"
            :is-selection-mode="isSelectionMode"
            :node="node"
            :ping-result="pingResults[node.id]"
            @delete="handleDeleteFromModal(node.id)"
            @detail="emit('detail', node)"
            @edit="handleEditFromModal(node.id)"
            @ping="emit('ping', node.id)"
            @toggle-select="emit('toggle-select', node.id)"
            @filter-tag="
              emit('filter-tag', $event);
              showStackModal = false;
            "
          />
        </div>
      </template>

      <template #footer>
        <button
          class="rounded-md border border-line bg-transparent px-4 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
          type="button"
          @click="showStackModal = false"
        >
          {{ t('nodeDetail.close') }}
        </button>
      </template>
    </Modal>
  </div>
</template>
