<script setup lang="ts">
import { computed } from 'vue';
import type { NodeIR } from '@misub/core/types.js';
import { Check, Info, Loader2 } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import NodeClientBadges from '@/components/nodes/NodeClientBadges.vue';
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

const formatPingClass = (ping: PingState | null) => {
  if (!ping) return 'border-line text-fg-subtle hover:border-line-strong hover:text-fg';
  if (ping.status === 'ok') {
    if ((ping.latency ?? 0) < 200) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
    if ((ping.latency ?? 0) < 500) return 'border-amber-500/40 bg-amber-500/10 text-amber-400';
    return 'border-rose-500/40 bg-rose-500/10 text-rose-400';
  }
  if (ping.status === 'unsupported') return 'border-line text-fg-subtle opacity-70';
  if (ping.status === 'loading') return 'border-line-strong text-fg-muted';
  return 'border-red-500/40 bg-red-500/10 text-red-400';
};

const handleCardClick = (node: PreviewNodeItem) => {
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
  <div class="min-h-0 flex-1 overflow-y-auto">
    <!-- 移动端 Mini List-Card 视图 -->
    <div class="block space-y-2 lg:hidden">
      <div
        v-for="row in rows"
        :key="`${row.node.url}_${row.index}`"
        :class="[
          selectionMode && selectedUrls.has(row.node.url)
            ? 'border-line-strong bg-active cursor-pointer'
            : ['border-line bg-inset hover:bg-hover hover:border-line-strong', selectionMode ? 'cursor-pointer' : ''],
          showNodeSwitch && !row.enabled ? 'opacity-55' : '',
        ]"
        class="flex items-center justify-between gap-2 rounded-md border p-3 transition-colors duration-150"
        @click="handleCardClick(row.node)"
      >
        <!-- 左侧：图标与信息 -->
        <div class="flex items-center gap-2.5 flex-1 min-w-0">
          <div v-if="selectionMode" class="flex-shrink-0">
            <div
              :class="selectedUrls.has(row.node.url) ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong'"
              class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
            >
              <Check v-if="selectedUrls.has(row.node.url)" :stroke-width="2.5" class="w-3 h-3" />
            </div>
          </div>

          <div class="flex flex-col min-w-0 flex-1">
            <h4 :title="row.info.name" class="truncate text-xs font-semibold text-fg mb-1.5">
              {{ row.info.name }}
            </h4>
            <div class="flex items-center gap-1.5 min-w-0">
              <span
                class="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-xs font-mono leading-none uppercase text-fg-muted"
              >
                <span :class="getProtocolDot(row.info.protocol)" class="h-1.5 w-1.5 shrink-0 rounded-full"></span>
                {{ row.info.protocol }}
              </span>
              <span
                v-if="row.info.region"
                class="inline-flex h-5 max-w-[84px] shrink-0 items-center rounded-md border border-line bg-surface px-2 text-xs font-medium leading-none text-fg-muted"
              >
                <span class="truncate">{{ row.info.region }}</span>
              </span>
              <span
                :title="`${row.info.server}:${row.info.port}`"
                class="min-w-0 flex-1 truncate text-xs text-fg-subtle font-mono"
              >
                {{ row.info.server }}:{{ row.info.port }}
              </span>
            </div>
            <NodeClientBadges :url="row.node.url" class="mt-1.5" compact />
          </div>
        </div>

        <!-- 右侧：操作按钮 -->
        <div v-if="!selectionMode" class="flex shrink-0 items-center gap-1.5">
          <button
            v-if="allowPing"
            :class="formatPingClass(row.ping)"
            :title="t('nodePreview.testSingleNode')"
            class="inline-flex h-7 min-w-[44px] items-center justify-center rounded-md border px-1.5 font-mono text-xs transition-colors"
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
            :aria-label="t('actions.viewDetail')"
            :title="t('actions.viewDetail')"
            class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-line bg-surface text-fg-subtle hover:text-fg hover:bg-hover transition-colors"
            @click.stop="emit('detail', row.node)"
          >
            <Info class="w-3.5 h-3.5" />
          </button>
          <div v-if="showNodeSwitch" @click.stop>
            <Switch
              :model-value="row.enabled"
              size="sm"
              @update:model-value="(val) => emit('toggle-enabled', row.node, val)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 桌面端 Grid 卡片视图 -->
    <div class="hidden gap-3 lg:grid lg:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="row in rows"
        :key="`${row.node.url}_${row.index}`"
        :class="[
          selectionMode && selectedUrls.has(row.node.url)
            ? 'border-line-strong bg-active cursor-pointer'
            : ['bg-inset border-line hover:border-line-strong', selectionMode ? 'cursor-pointer' : ''],
          showNodeSwitch && !row.enabled ? 'opacity-55' : '',
        ]"
        class="relative rounded-md border p-4 group transition-colors duration-150 shadow-none"
        @click="handleCardClick(row.node)"
      >
        <div v-if="selectionMode" class="absolute top-4 right-4">
          <div
            :class="selectedUrls.has(row.node.url) ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong'"
            class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
          >
            <Check v-if="selectedUrls.has(row.node.url)" :stroke-width="2.5" class="w-3 h-3" />
          </div>
        </div>

        <div class="flex flex-col h-full">
          <!-- 节点名称和协议标签 -->
          <div class="flex items-start justify-between gap-3 mb-2.5">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 mb-2 overflow-hidden">
                <span
                  class="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-xs font-mono leading-none uppercase text-fg-muted"
                >
                  <span :class="getProtocolDot(row.info.protocol)" class="h-1.5 w-1.5 shrink-0 rounded-full"></span>
                  {{ row.info.protocol }}
                </span>
                <span
                  :title="row.info.region || 'UNKNOWN'"
                  class="inline-flex h-5 max-w-[120px] shrink-0 items-center rounded-md border border-line bg-surface px-2 text-xs font-medium leading-none text-fg-muted"
                >
                  <span class="truncate">{{ row.info.region || 'UNKNOWN' }}</span>
                </span>
              </div>
              <h4 :title="row.info.name" class="text-sm font-semibold text-fg truncate">
                {{ row.info.name }}
              </h4>
            </div>
          </div>

          <!-- 客户端兼容性 -->
          <NodeClientBadges :url="row.node.url" class="mb-3" compact />

          <!-- 服务器信息 -->
          <div class="mt-auto pt-2.5 border-t border-line">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div :title="`${row.info.server}:${row.info.port}`" class="text-xs font-mono text-fg-subtle truncate">
                  {{ row.info.server }}:{{ row.info.port }}
                </div>
              </div>

              <!-- 操作按钮 -->
              <div v-if="!selectionMode" class="flex shrink-0 items-center gap-1.5">
                <button
                  v-if="allowPing"
                  :class="formatPingClass(row.ping)"
                  :title="t('nodePreview.testSingleNode')"
                  class="inline-flex h-7 min-w-[44px] items-center justify-center rounded-md border px-1.5 font-mono text-xs transition-colors"
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
                  :aria-label="t('actions.viewDetail')"
                  :title="t('actions.viewDetail')"
                  class="p-1.5 rounded-md border border-line bg-surface text-fg-subtle hover:text-fg hover:bg-hover transition-colors"
                  @click.stop="emit('detail', row.node)"
                >
                  <Info class="w-3.5 h-3.5" />
                </button>
                <div v-if="showNodeSwitch" @click.stop>
                  <Switch
                    :model-value="row.enabled"
                    size="sm"
                    @update:model-value="(val) => emit('toggle-enabled', row.node, val)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
