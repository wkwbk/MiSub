<script setup>
import { Check, Copy, Info } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';

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

const handleRowClick = (node) => {
  if (props.selectionMode) {
    emit('toggle-select', node.url);
  }
};
</script>

<template>
  <div class="hidden lg:flex flex-1 overflow-hidden rounded-md border border-line bg-inset shadow-none">
    <div class="h-full overflow-y-auto w-full">
      <div class="w-full">
        <div class="w-full">
          <!-- 表头 -->
          <div class="sticky top-0 z-10 border-b border-line bg-surface">
            <div
              class="grid min-h-[2.75rem] grid-cols-12 gap-2 px-4 py-2 items-center text-[11px] font-medium text-fg-subtle uppercase tracking-wider"
            >
              <div v-if="selectionMode" class="col-span-1 flex justify-center text-fg-subtle">
                {{ t('nodePreview.columnPick') }}
              </div>
              <div :class="selectionMode ? 'col-span-3' : 'col-span-4'">
                {{ t('nodePreview.columnName') }}
              </div>
              <div class="col-span-3 hidden sm:block">
                {{ t('nodePreview.columnServer') }}
              </div>
              <div class="col-span-2 hidden md:block text-center">
                {{ t('nodePreview.columnPort') }}
              </div>
              <div class="col-span-1 hidden sm:block text-center">
                {{ t('nodePreview.columnType') }}
              </div>
              <div class="col-span-1 hidden sm:block text-center">
                {{ t('nodePreview.columnRegion') }}
              </div>
              <div class="col-span-1 text-center">
                {{ t('nodePreview.columnAction') }}
              </div>
            </div>
          </div>

          <!-- 数据行 -->
          <div class="bg-inset">
            <div
              v-for="(node, index) in nodes"
              :key="`${node.url}_${index}`"
              :class="{
                '!bg-active': selectionMode && selectedUrls.has(node.url),
                'cursor-pointer': selectionMode,
              }"
              class="group border-b last:border-b-0 border-line odd:bg-inset even:bg-surface/60 hover:bg-hover transition-colors"
              @click="handleRowClick(node)"
            >
              <div class="grid min-h-[3.25rem] grid-cols-12 gap-2 px-4 py-2.5 items-center">
                <!-- Checkbox (Selection Mode Only) -->
                <div v-if="selectionMode" class="col-span-1 flex justify-center">
                  <div
                    :class="
                      selectedUrls.has(node.url) ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong'
                    "
                    class="w-4 h-4 rounded-sm border flex items-center justify-center transition-colors"
                  >
                    <Check v-if="selectedUrls.has(node.url)" :stroke-width="2.5" class="w-3 h-3" />
                  </div>
                </div>

                <!-- 节点名称 -->
                <div :class="selectionMode ? 'col-span-3' : 'col-span-4'">
                  <span
                    :title="parseNodeInfo(node).name"
                    class="text-xs font-medium text-fg block overflow-hidden"
                    style="text-overflow: ellipsis; white-space: nowrap"
                  >
                    {{ parseNodeInfo(node).name }}
                  </span>
                </div>

                <!-- 服务器 (桌面端) -->
                <div class="col-span-3 hidden sm:block">
                  <span
                    :title="parseNodeInfo(node).server"
                    class="text-xs text-fg-subtle font-mono block overflow-hidden"
                    style="text-overflow: ellipsis; white-space: nowrap"
                  >
                    {{ parseNodeInfo(node).server }}
                  </span>
                </div>

                <!-- 端口 (桌面端) -->
                <div class="col-span-2 hidden md:block text-center">
                  <span class="text-xs text-fg-subtle font-mono block" style="min-width: 50px">
                    {{ parseNodeInfo(node).port }}
                  </span>
                </div>

                <!-- 类型 (桌面端) -->
                <div class="col-span-1 hidden sm:block flex justify-center">
                  <span
                    class="inline-flex items-center justify-center px-2 py-0.5 rounded-sm text-[10px] font-mono font-medium uppercase border border-line text-fg-muted"
                    style="min-width: 60px"
                  >
                    {{ parseNodeInfo(node).protocol }}
                  </span>
                </div>

                <!-- 地区 (桌面端) -->
                <div class="col-span-1 hidden sm:block flex justify-center">
                  <span
                    class="inline-flex items-center justify-center px-2 py-0.5 rounded-sm text-[10px] font-medium border border-line text-fg-muted"
                    style="min-width: 60px"
                  >
                    {{ parseNodeInfo(node).region }}
                  </span>
                </div>

                <!-- 操作 (所有设备) -->
                <div class="col-span-1 flex items-center justify-center gap-1">
                  <button
                    v-if="!selectionMode"
                    :aria-label="t('actions.viewDetail')"
                    :title="t('actions.viewDetail')"
                    class="inline-flex items-center justify-center w-7 h-7 rounded-md text-fg-subtle hover:text-fg hover:bg-hover transition-colors touch-target"
                    @click.stop="emit('detail', node)"
                  >
                    <Info class="w-3.5 h-3.5" />
                  </button>
                  <button
                    v-if="!selectionMode"
                    :aria-label="t('actions.copyNode')"
                    :class="{
                      'text-emerald-500': copiedNodeId === node.url,
                    }"
                    :title="t('actions.copyNode')"
                    class="inline-flex items-center justify-center w-7 h-7 rounded-md text-fg-subtle hover:text-fg hover:bg-hover transition-colors touch-target"
                    @click.stop="emit('copy', node, node.url)"
                  >
                    <Copy v-if="copiedNodeId !== node.url" class="w-3.5 h-3.5" />
                    <Check v-else class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
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
