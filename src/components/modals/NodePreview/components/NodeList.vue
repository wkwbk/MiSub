<script setup lang="ts">
import { computed } from 'vue';
import type { NodeIR } from '@misub/core/types.js';
import { Check, Info, Loader2 } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import { useVirtualList } from '@/composables/useVirtualList.js';
import Switch from '@/components/ui/Switch.vue';

interface PreviewNodeItem {
  url: string;
  name?: string;
  protocol?: string;
  region?: string;
  server?: string;
  port?: number | string;
  enabled?: boolean;
  ir?: NodeIR;
  [key: string]: unknown;
}

interface ParsedNodeInfo {
  name?: string;
  server?: string;
  port?: number | string;
  protocol?: string;
  region?: string;
}

interface PingState {
  status: string;
  latency?: number;
  mode?: string;
}

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    nodes?: PreviewNodeItem[];
    parseNodeInfo: (node: PreviewNodeItem) => ParsedNodeInfo;
    getProtocolStyle: (protocol?: string) => string;
    selectionMode?: boolean;
    selectedUrls?: Set<string>;
    showNodeSwitch?: boolean;
    allowPing?: boolean;
    nodeEnabledMap?: Record<string, boolean>;
    nodePingMap?: Record<string, PingState>;
  }>(),
  {
    nodes: () => [],
    selectionMode: false,
    selectedUrls: () => new Set<string>(),
    showNodeSwitch: false,
    allowPing: false,
    nodeEnabledMap: () => ({}),
    nodePingMap: () => ({}),
  },
);

const emit = defineEmits<{
  detail: [node: PreviewNodeItem];
  'toggle-select': [url: string];
  'toggle-enabled': [node: PreviewNodeItem, enabled: boolean];
  ping: [node: PreviewNodeItem];
}>();

const rows = computed(() =>
  (props.nodes || []).map((node, index) => ({
    node,
    index,
    info: props.parseNodeInfo(node),
    ping: props.nodePingMap[node.url] || null,
    enabled: props.nodeEnabledMap[node.url] ?? node.enabled !== false,
  })),
);

const { containerRef, isVirtualized, visibleItems, topSpacerHeight, bottomSpacerHeight, handleScroll } = useVirtualList(
  {
    items: rows,
    itemHeight: 49,
    overscan: 10,
    threshold: 60,
  },
);

const formatPingClass = (ping: PingState | null) => {
  if (!ping) return 'border-line bg-surface text-fg-subtle hover:border-line-strong hover:bg-hover hover:text-fg';
  if (ping.status === 'ok') {
    if ((ping.latency ?? 0) < 200) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
    if ((ping.latency ?? 0) < 500) return 'border-amber-500/40 bg-amber-500/10 text-amber-400';
    return 'border-rose-500/40 bg-rose-500/10 text-rose-400';
  }
  if (ping.status === 'unsupported') return 'border-line text-fg-subtle opacity-70';
  if (ping.status === 'loading') return 'border-line-strong text-fg-muted';
  return 'border-red-500/40 bg-red-500/10 text-red-400';
};

const handleRowClick = (node: PreviewNodeItem) => {
  if (props.selectionMode) {
    emit('toggle-select', node.url);
  }
};

const getProtocolDot = (protocol?: string) => {
  switch (String(protocol || '').toLowerCase()) {
    case 'vless':
      return 'bg-sky-500';
    case 'hysteria2':
    case 'hy2':
      return 'bg-purple-500';
    case 'hysteria':
    case 'hy':
      return 'bg-fuchsia-500';
    case 'tuic':
      return 'bg-cyan-500';
    case 'trojan':
      return 'bg-red-500';
    case 'ssr':
      return 'bg-rose-500';
    case 'ss':
      return 'bg-amber-500';
    case 'vmess':
      return 'bg-emerald-500';
    case 'socks5':
    case 'socks':
      return 'bg-lime-500';
    case 'snell':
      return 'bg-indigo-500';
    case 'anytls':
      return 'bg-zinc-400';
    default:
      return 'bg-zinc-500';
  }
};
</script>

<template>
  <div class="hidden lg:flex flex-1 overflow-hidden rounded-md border border-line bg-inset shadow-none">
    <div ref="containerRef" class="h-full overflow-y-auto w-full" @scroll="handleScroll">
      <div class="w-full">
        <div class="w-full">
          <!-- 表头 -->
          <div class="sticky top-0 z-10 border-b border-line bg-surface">
            <div
              class="grid min-h-[2.75rem] grid-cols-12 gap-2 px-4 py-2 items-center text-xs font-medium text-fg-subtle uppercase tracking-wider"
            >
              <div v-if="selectionMode" class="col-span-1 flex justify-center text-fg-subtle">
                {{ t('nodePreview.columnPick') }}
              </div>
              <div :class="selectionMode ? 'col-span-3' : 'col-span-3'">
                {{ t('nodePreview.columnName') }}
              </div>
              <div :class="selectionMode ? 'col-span-3' : 'col-span-2'" class="hidden sm:block">
                {{ t('nodePreview.columnServer') }}
              </div>
              <div class="col-span-1 hidden md:block text-center">
                {{ t('nodePreview.columnPort') }}
              </div>
              <div class="col-span-1 hidden sm:block text-center">
                {{ t('nodePreview.columnType') }}
              </div>
              <div class="col-span-2 hidden sm:block text-center">
                {{ t('nodePreview.columnRegion') }}
              </div>
              <div :class="selectionMode ? 'col-span-1 text-center' : 'col-span-3 text-right pr-2'">
                {{ t('nodePreview.columnAction') }}
              </div>
            </div>
          </div>

          <!-- 数据行 -->
          <div class="bg-inset">
            <div
              v-if="isVirtualized && topSpacerHeight > 0"
              :style="{ height: `${topSpacerHeight}px` }"
              aria-hidden="true"
            ></div>
            <div
              v-for="row in visibleItems"
              :key="`${row.node.url}_${row.index}`"
              :class="{
                '!bg-active': selectionMode && selectedUrls.has(row.node.url),
                'cursor-pointer': selectionMode,
                'opacity-55': showNodeSwitch && !row.enabled,
              }"
              class="group border-b last:border-b-0 border-line odd:bg-inset even:bg-surface/60 hover:bg-hover transition-colors"
              @click="handleRowClick(row.node)"
            >
              <div class="grid min-h-[3rem] grid-cols-12 gap-2 px-4 py-2 items-center">
                <div v-if="selectionMode" class="col-span-1 flex justify-center">
                  <div
                    :class="
                      selectedUrls.has(row.node.url) ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong'
                    "
                    class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
                  >
                    <Check v-if="selectedUrls.has(row.node.url)" :stroke-width="2.5" class="w-3 h-3" />
                  </div>
                </div>

                <!-- 节点名称 -->
                <div :class="selectionMode ? 'col-span-3' : 'col-span-3'" class="min-w-0">
                  <span :title="row.info.name" class="block truncate text-xs font-medium text-fg">
                    {{ row.info.name }}
                  </span>
                </div>

                <!-- 服务器 (桌面端) -->
                <div :class="selectionMode ? 'col-span-3' : 'col-span-2'" class="hidden min-w-0 sm:block">
                  <span :title="row.info.server" class="block truncate font-mono text-xs text-fg-subtle">
                    {{ row.info.server }}
                  </span>
                </div>

                <!-- 端口 (桌面端) -->
                <div class="col-span-1 hidden md:block text-center">
                  <span class="block truncate font-mono text-xs text-fg-subtle">
                    {{ row.info.port }}
                  </span>
                </div>

                <!-- 类型 (桌面端) -->
                <div class="col-span-1 hidden sm:flex justify-center">
                  <span
                    class="inline-flex h-5 max-w-full items-center gap-1.5 rounded-md border border-line bg-transparent px-2 text-xs font-mono leading-none uppercase text-fg-muted"
                  >
                    <span :class="getProtocolDot(row.info.protocol)" class="h-1.5 w-1.5 shrink-0 rounded-full"></span>
                    <span class="truncate">{{ row.info.protocol }}</span>
                  </span>
                </div>

                <!-- 地区 (桌面端) -->
                <div class="col-span-2 hidden sm:flex justify-center">
                  <span
                    :title="row.info.region"
                    class="inline-flex h-5 max-w-full items-center rounded-md border border-line bg-transparent px-2 text-xs font-medium leading-none text-fg-muted"
                  >
                    <span class="truncate">{{ row.info.region }}</span>
                  </span>
                </div>

                <!-- 操作 (所有设备) -->
                <div
                  :class="selectionMode ? 'col-span-1 justify-center' : 'col-span-3 justify-end'"
                  class="flex items-center gap-1.5"
                >
                  <button
                    v-if="!selectionMode && allowPing"
                    :class="formatPingClass(row.ping)"
                    :title="t('nodePreview.testSingleNode')"
                    class="inline-flex h-7 min-w-[48px] shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-2 font-mono text-xs leading-none transition-colors"
                    type="button"
                    @click.stop="emit('ping', row.node)"
                  >
                    <Loader2 v-if="row.ping?.status === 'loading'" class="h-3 w-3 animate-spin" />
                    <span v-else-if="row.ping?.status === 'ok'">{{ row.ping.latency }}ms</span>
                    <span v-else-if="row.ping?.status === 'unsupported'">UDP</span>
                    <span v-else-if="row.ping?.status === 'timeout'">{{ t('nodePreview.pingTimeout') }}</span>
                    <span v-else-if="row.ping?.status === 'error'">{{ t('nodePreview.pingFailed') }}</span>
                    <span v-else>{{ t('nodePreview.pingAction') }}</span>
                  </button>
                  <button
                    v-if="!selectionMode"
                    :aria-label="t('actions.viewDetail')"
                    :title="t('actions.viewDetail')"
                    class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-fg-subtle hover:text-fg hover:bg-hover transition-colors"
                    type="button"
                    @click.stop="emit('detail', row.node)"
                  >
                    <Info class="w-3.5 h-3.5" />
                  </button>
                  <div v-if="!selectionMode && showNodeSwitch" class="flex h-7 shrink-0 items-center" @click.stop>
                    <Switch
                      :model-value="row.enabled"
                      size="sm"
                      @update:model-value="(val) => emit('toggle-enabled', row.node, val)"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div
              v-if="isVirtualized && bottomSpacerHeight > 0"
              :style="{ height: `${bottomSpacerHeight}px` }"
              aria-hidden="true"
            ></div>
          </div>

          <!-- 空状态 -->
          <div v-if="nodes.length === 0" class="py-12 text-center text-xs text-fg-subtle">
            {{ t('nodePreview.noNodes') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
