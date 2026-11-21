<script setup>
import { Check, Copy, Info } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';
import NodeClientBadges from '@/components/nodes/NodeClientBadges.vue';

const { t } = useI18n();
const props = defineProps({
  nodes: {
    type: Array,
    default: () => [],
  },
  copiedNodeId: {
    type: String,
    default: '',
  },
  parseNodeInfo: {
    type: Function,
    required: true,
  },
  getProtocolStyle: {
    type: Function,
    required: true,
  },
  // [New] Selection Mode Props
  selectionMode: {
    type: Boolean,
    default: false,
  },
  selectedUrls: {
    type: Set,
    default: () => new Set(),
  },
});

const emit = defineEmits(['copy', 'detail', 'toggle-select']);

const handleCardClick = (node) => {
  if (props.selectionMode) {
    emit('toggle-select', node.url);
  }
};

const getProtocolDot = (protocol) => {
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
        v-for="(node, index) in nodes"
        :key="`${node.url}_${index}`"
        :class="
          selectionMode && selectedUrls.has(node.url)
            ? 'border-line-strong bg-active cursor-pointer'
            : ['border-line bg-inset hover:bg-hover hover:border-line-strong', selectionMode ? 'cursor-pointer' : '']
        "
        class="flex items-center justify-between gap-2 rounded-md border p-3 transition-colors duration-150"
        @click="handleCardClick(node)"
      >
        <!-- 左侧：图标与信息 -->
        <div class="flex items-center gap-2.5 flex-1 min-w-0">
          <!-- Selection Checkbox -->
          <div v-if="selectionMode" class="flex-shrink-0">
            <div
              :class="selectedUrls.has(node.url) ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong'"
              class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
            >
              <Check v-if="selectedUrls.has(node.url)" :stroke-width="2.5" class="w-3 h-3" />
            </div>
          </div>

          <div class="flex flex-col min-w-0 flex-1">
            <h4 :title="parseNodeInfo(node).name" class="truncate text-xs font-semibold text-fg mb-1.5">
              {{ parseNodeInfo(node).name }}
            </h4>
            <div class="flex items-center gap-1.5 min-w-0">
              <span
                class="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[10px] font-mono leading-none uppercase text-fg-muted"
              >
                <span :class="getProtocolDot(parseNodeInfo(node).protocol)" class="h-1.5 w-1.5 shrink-0 rounded-full"></span>
                {{ parseNodeInfo(node).protocol }}
              </span>
              <span
                v-if="parseNodeInfo(node).region"
                class="inline-flex h-5 max-w-[84px] shrink-0 items-center rounded-md border border-line bg-surface px-2 text-[10px] font-medium leading-none text-fg-muted"
              >
                <span class="truncate">{{ parseNodeInfo(node).region }}</span>
              </span>
              <span
                :title="`${parseNodeInfo(node).server}:${parseNodeInfo(node).port}`"
                class="min-w-0 flex-1 truncate text-[11px] text-fg-subtle font-mono"
              >
                {{ parseNodeInfo(node).server }}:{{ parseNodeInfo(node).port }}
              </span>
            </div>
            <NodeClientBadges :url="node.url" class="mt-1.5" compact />
          </div>
        </div>

        <!-- 右侧：操作按钮 -->
        <div v-if="!selectionMode" class="flex shrink-0 items-center gap-1.5">
          <button
            :aria-label="t('actions.viewDetail')"
            :title="t('actions.viewDetail')"
            class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-line bg-surface text-fg-subtle hover:text-fg hover:bg-hover transition-colors"
            @click.stop="emit('detail', node)"
          >
            <Info class="w-3.5 h-3.5" />
          </button>
          <button
            :aria-label="t('actions.copyNode')"
            :class="{
              'text-emerald-500 border-emerald-500/40': copiedNodeId === node.url,
            }"
            :title="t('actions.copyNode')"
            class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-line bg-surface text-fg-subtle hover:text-fg hover:bg-hover transition-colors"
            @click.stop="emit('copy', node, node.url)"
          >
            <Copy v-if="copiedNodeId !== node.url" class="w-3.5 h-3.5" />
            <Check v-else class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- 桌面端 Grid 卡片视图 -->
    <div class="hidden gap-3 lg:grid lg:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="(node, index) in nodes"
        :key="`${node.url}_${index}`"
        :class="
          selectionMode && selectedUrls.has(node.url)
            ? 'border-line-strong bg-active cursor-pointer'
            : ['bg-inset border-line hover:border-line-strong', selectionMode ? 'cursor-pointer' : '']
        "
        class="relative rounded-md border p-4 group transition-colors duration-150 shadow-none"
        @click="handleCardClick(node)"
      >
        <!-- Selection Badge -->
        <div v-if="selectionMode" class="absolute top-4 right-4">
          <div
            :class="selectedUrls.has(node.url) ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong'"
            class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
          >
            <Check v-if="selectedUrls.has(node.url)" :stroke-width="2.5" class="w-3 h-3" />
          </div>
        </div>

        <div class="flex flex-col h-full">
          <!-- 节点名称和协议标签 -->
          <div class="flex items-start justify-between gap-3 mb-2.5">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 mb-2 overflow-hidden">
                <span
                  class="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[10px] font-mono leading-none uppercase text-fg-muted"
                >
                  <span :class="getProtocolDot(parseNodeInfo(node).protocol)" class="h-1.5 w-1.5 shrink-0 rounded-full"></span>
                  {{ parseNodeInfo(node).protocol }}
                </span>
                <span
                  :title="parseNodeInfo(node).region || 'UNKNOWN'"
                  class="inline-flex h-5 max-w-[120px] shrink-0 items-center rounded-md border border-line bg-surface px-2 text-[10px] font-medium leading-none text-fg-muted"
                >
                  <span class="truncate">{{ parseNodeInfo(node).region || 'UNKNOWN' }}</span>
                </span>
              </div>
              <h4 :title="parseNodeInfo(node).name" class="text-sm font-semibold text-fg truncate">
                {{ parseNodeInfo(node).name }}
              </h4>
            </div>
          </div>

          <!-- 客户端兼容性 -->
          <NodeClientBadges :url="node.url" class="mb-3" compact />

          <!-- 服务器信息 -->
          <div class="mt-auto pt-2.5 border-t border-line">
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div
                  :title="`${parseNodeInfo(node).server}:${parseNodeInfo(node).port}`"
                  class="text-xs font-mono text-fg-subtle truncate"
                >
                  {{ parseNodeInfo(node).server }}:{{ parseNodeInfo(node).port }}
                </div>
              </div>

              <!-- 操作按钮 -->
              <div v-if="!selectionMode" class="flex shrink-0 items-center gap-1.5">
                <button
                  :aria-label="t('actions.viewDetail')"
                  :title="t('actions.viewDetail')"
                  class="p-1.5 rounded-md border border-line bg-surface text-fg-subtle hover:text-fg hover:bg-hover transition-colors"
                  @click.stop="emit('detail', node)"
                >
                  <Info class="w-3.5 h-3.5" />
                </button>
                <button
                  :aria-label="t('actions.copyNode')"
                  :class="{
                    'text-emerald-500 border-emerald-500/40': copiedNodeId === node.url,
                  }"
                  :title="t('actions.copyNode')"
                  class="p-1.5 rounded-md border border-line bg-surface text-fg-subtle hover:text-fg hover:bg-hover transition-colors"
                  @click.stop="emit('copy', node, node.url)"
                >
                  <Copy v-if="copiedNodeId !== node.url" class="w-3.5 h-3.5" />
                  <Check v-else class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
