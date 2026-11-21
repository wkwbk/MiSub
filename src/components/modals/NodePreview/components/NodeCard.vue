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
        class="flex items-center justify-between rounded-md border p-3.5 transition-colors duration-150"
        @click="handleCardClick(node)"
      >
        <!-- 左侧：图标与信息 -->
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <!-- Selection Checkbox -->
          <div v-if="selectionMode" class="flex-shrink-0">
            <div
              :class="selectedUrls.has(node.url) ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong'"
              class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
            >
              <Check v-if="selectedUrls.has(node.url)" :stroke-width="2.5" class="w-3 h-3" />
            </div>
          </div>

          <div class="flex flex-col min-w-0">
            <h4 class="truncate text-xs font-semibold text-fg mb-1">
              {{ parseNodeInfo(node).name }}
            </h4>
            <div class="flex items-center gap-2">
              <span
                class="text-[10px] font-mono px-1.5 py-0.5 rounded-sm uppercase border border-line bg-surface text-fg-muted"
              >
                {{ parseNodeInfo(node).protocol }}
              </span>
              <span class="truncate text-[11px] text-fg-subtle font-mono">
                {{ parseNodeInfo(node).server.split('.').slice(-2).join('.') }}:{{ parseNodeInfo(node).port }}
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
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="min-w-0 flex-1">
              <h4 class="text-sm font-semibold text-fg truncate">
                {{ parseNodeInfo(node).name }}
              </h4>
              <div class="flex flex-wrap gap-1.5 mt-2">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-mono font-medium uppercase border border-line bg-surface text-fg-muted"
                >
                  {{ parseNodeInfo(node).protocol }}
                </span>
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-medium border border-line bg-surface text-fg-muted"
                >
                  {{ parseNodeInfo(node).region || 'UNKNOWN' }}
                </span>
              </div>
            </div>
          </div>

          <!-- 客户端兼容性 -->
          <NodeClientBadges :url="node.url" class="mb-3" />

          <!-- 服务器信息 -->
          <div class="mt-auto pt-3 border-t border-line">
            <div class="flex items-center justify-between">
              <div class="min-w-0">
                <div class="text-[10px] text-fg-subtle mb-0.5 font-medium uppercase tracking-wider">Endpoint</div>
                <div class="text-xs font-mono text-fg-muted truncate">
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
