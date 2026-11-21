<script setup>
import { computed } from 'vue';
import { Check, Copy, Info, Pencil, Trash2, Zap } from '@lucide/vue';
import { extractHostAndPort } from '@/lib/utils.js';
import { getItemTags } from '@/utils/tags.js';
import { useToastStore } from '@/stores/toast.js';
import { useI18n } from '@/i18n/index.js';
import NodeClientBadges from '@/components/nodes/NodeClientBadges.vue';
import { copyTextToClipboard } from '@/utils/clipboard.js';

const props = defineProps({
  node: {
    type: Object,
    required: true,
  },
  isSelectionMode: Boolean,
  isSelected: Boolean,
  pingResult: Object,
  isPinging: Boolean,
});

const emit = defineEmits(['delete', 'edit', 'detail', 'toggle-select', 'filter-tag', 'ping']);
const { showToast } = useToastStore();
const { t } = useI18n();

const nodeTags = computed(() => getItemTags(props.node));
const visibleTags = computed(() => nodeTags.value.slice(0, 2));
const overflowCount = computed(() => Math.max(0, nodeTags.value.length - 2));

const getProtocol = (url) => {
  try {
    if (!url) return 'unknown';
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.startsWith('anytls://')) return 'anytls';
    if (lowerUrl.startsWith('hysteria2://') || lowerUrl.startsWith('hy2://')) return 'hysteria2';
    if (lowerUrl.startsWith('hysteria://') || lowerUrl.startsWith('hy://')) return 'hysteria';
    if (lowerUrl.startsWith('ssr://')) return 'ssr';
    if (lowerUrl.startsWith('tuic://')) return 'tuic';
    if (lowerUrl.startsWith('ss://')) return 'ss';
    if (lowerUrl.startsWith('vmess://')) return 'vmess';
    if (lowerUrl.startsWith('vless://')) return 'vless';
    if (lowerUrl.startsWith('trojan://')) return 'trojan';
    if (lowerUrl.startsWith('socks5://') || lowerUrl.startsWith('socks://')) return 'socks5';
    if (lowerUrl.startsWith('snell://')) return 'snell';
    if (
      lowerUrl.startsWith('naive+https://') ||
      lowerUrl.startsWith('naive+http://') ||
      lowerUrl.startsWith('naive+quic://')
    )
      return 'naive';
    if (lowerUrl.startsWith('http')) return 'http';
  } catch {
    return 'unknown';
  }
  return 'unknown';
};

const protocol = computed(() => getProtocol(props.node.url));
const hostAndPort = computed(() => extractHostAndPort(props.node.url));

const protocolStyle = computed(() => {
  const p = protocol.value;
  switch (p) {
    case 'anytls':
      return { text: 'AnyTLS', dot: 'bg-zinc-400' };
    case 'vless':
      return { text: 'VLESS', dot: 'bg-sky-500' };
    case 'hysteria2':
      return { text: 'HY2', dot: 'bg-purple-500' };
    case 'hysteria':
      return { text: 'Hysteria', dot: 'bg-fuchsia-500' };
    case 'tuic':
      return { text: 'TUIC', dot: 'bg-cyan-500' };
    case 'trojan':
      return { text: 'TROJAN', dot: 'bg-red-500' };
    case 'ssr':
      return { text: 'SSR', dot: 'bg-rose-500' };
    case 'ss':
      return { text: 'SS', dot: 'bg-amber-500' };
    case 'vmess':
      return { text: 'VMESS', dot: 'bg-emerald-500' };
    case 'socks5':
      return { text: 'SOCKS5', dot: 'bg-lime-500' };
    case 'http':
      return { text: 'HTTP', dot: 'bg-emerald-500' };
    case 'snell':
      return { text: 'SNELL', dot: 'bg-indigo-500' };
    case 'naive':
      return { text: 'NAIVE', dot: 'bg-pink-500' };
    default:
      return { text: 'LINK', dot: 'bg-zinc-500' };
  }
});

const copyToClipboard = async (text) => {
  const copied = await copyTextToClipboard(text);
  showToast(copied ? t('notices.copied') : t('notices.copyFailed'), copied ? 'success' : 'error');
};
</script>

<template>
  <div
    :class="[
      isSelectionMode && isSelected ? 'border-line-strong bg-active' : 'border-line bg-surface',
      {
        'opacity-50': !node.enabled && !isSelectionMode,
        'cursor-pointer': isSelectionMode,
      },
    ]"
    class="group relative flex flex-col justify-between rounded-md border p-3 hover:-translate-y-0.5 hover:z-10 transition-all duration-200 min-h-[96px]"
    @click="isSelectionMode ? emit('toggle-select') : null"
  >
    <!-- Top Row: Badges (Protocol & Tags) + Ping Result Badge -->
    <div class="flex items-center justify-between gap-2">
      <!-- Left Badges -->
      <div class="flex items-center gap-1.5 min-w-0 overflow-hidden">
        <!-- Selection Checkbox -->
        <div v-if="isSelectionMode" class="shrink-0 mr-0.5">
          <div
            :class="isSelected ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong bg-transparent'"
            class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
          >
            <Check v-if="isSelected" class="h-3 w-3" stroke-width="3" />
          </div>
        </div>

        <!-- Protocol Badge -->
        <div
          class="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line bg-transparent px-2 py-0.5 text-[10px] font-mono text-fg-muted"
        >
          <span :class="protocolStyle.dot" class="h-1.5 w-1.5 rounded-full shrink-0"></span>
          {{ protocolStyle.text }}
        </div>

        <!-- Tag Badges -->
        <div
          v-for="tag in visibleTags"
          :key="tag"
          :title="tag"
          class="max-w-[96px] sm:max-w-[110px] shrink-0 truncate rounded-md border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg cursor-pointer"
          data-testid="manual-node-tag-badge"
          @click.stop="emit('filter-tag', tag)"
        >
          {{ tag }}
        </div>
        <span
          v-if="overflowCount > 0"
          :title="nodeTags.join(', ')"
          class="shrink-0 rounded-md border border-line bg-transparent px-1.5 py-0.5 text-[10px] font-mono text-fg-subtle"
        >
          +{{ overflowCount }}
        </span>
      </div>

      <!-- Right: Ping Result Badge -->
      <div
        v-if="pingResult"
        :title="
          pingResult.message ||
          (pingResult.status === 'ok' ? t('manualNodes.connectivityOk') : t('manualNodes.connectivityFailed'))
        "
        class="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-transparent px-2 py-0.5 text-[10px] font-mono text-fg-muted"
      >
        <span
          :class="{
            'bg-emerald-500': pingResult.status === 'ok' && pingResult.latency < 300,
            'bg-amber-500': pingResult.status === 'ok' && pingResult.latency >= 300,
            'bg-red-500': pingResult.status === 'error' || pingResult.status === 'timeout',
            'bg-sky-500 animate-pulse': pingResult.status === 'loading',
          }"
          class="h-1.5 w-1.5 rounded-full shrink-0"
        ></span>
        <span v-if="pingResult.status === 'loading'">{{ t('manualNodes.pinging') }}</span>
        <span v-else-if="pingResult.status === 'ok'">{{ pingResult.latency }}ms</span>
        <span v-else>{{ t('manualNodes.unreachable') }}</span>
      </div>
    </div>

    <!-- Middle Row: Node Name -->
    <div class="my-1.5 min-w-0">
      <h4
        :title="node.name || t('manualNodes.unnamed')"
        class="truncate text-sm font-medium text-fg transition-colors"
      >
        {{ node.name || t('manualNodes.unnamed') }}
      </h4>
    </div>

    <!-- Client Compatibility Row -->
    <NodeClientBadges :url="node.url" class="mb-2" compact />

    <!-- Bottom Row: Endpoint (Host:Port) + Quick Actions -->
    <div class="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2">
      <div class="min-w-0 flex-1">
        <span
          v-if="hostAndPort.host"
          :title="`${hostAndPort.host}:${hostAndPort.port || ''}`"
          class="block truncate font-mono text-xs text-fg-subtle"
        >
          {{ hostAndPort.host }}:{{ hostAndPort.port || 'N/A' }}
        </span>
        <span v-else class="text-xs font-mono text-fg-subtle">-</span>
      </div>

      <div
        v-if="!isSelectionMode"
        class="flex shrink-0 items-center gap-0.5 transition-opacity duration-150 md:opacity-55 md:group-hover:opacity-100 md:focus-within:opacity-100"
      >
        <button
          :aria-label="t('actions.ping')"
          :class="{ 'animate-pulse text-fg': isPinging }"
          :disabled="isPinging"
          :title="t('actions.ping')"
          class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
          @click.stop="emit('ping')"
        >
          <Zap class="h-3.5 w-3.5" />
        </button>
        <button
          :aria-label="t('actions.viewDetail')"
          :title="t('actions.viewDetail')"
          class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
          @click.stop="emit('detail')"
        >
          <Info class="h-3.5 w-3.5" />
        </button>
        <button
          :aria-label="t('actions.copyLink')"
          :title="t('actions.copyLink')"
          class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
          @click.stop="copyToClipboard(node.url)"
        >
          <Copy class="h-3.5 w-3.5" />
        </button>
        <button
          :aria-label="t('actions.edit')"
          :title="t('actions.edit')"
          class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-line-strong hover:bg-hover hover:text-fg"
          @click.stop="emit('edit')"
        >
          <Pencil class="h-3.5 w-3.5" />
        </button>
        <button
          :aria-label="t('actions.delete')"
          :title="t('actions.delete')"
          class="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:border-red-900/60 hover:bg-red-950/40 hover:text-red-400"
          @click.stop="emit('delete')"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
