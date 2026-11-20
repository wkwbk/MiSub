/** * 节点预览头部组件 * @author MiSub Team */

<script setup>
import { X } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();
defineProps({
  title: {
    type: String,
    required: true,
  },
  totalNodes: {
    type: Number,
    default: 0,
  },
  filteredNodes: {
    type: Number,
    default: 0,
  },
});

defineEmits(['close']);
</script>

<template>
  <!-- 头部 -->
  <div class="flex items-center justify-between px-6 py-4 border-b border-line">
    <h3 class="text-lg font-medium leading-6 text-fg">
      {{ title }}
    </h3>

    <!-- 节点统计 -->
    <div class="flex items-center space-x-4">
      <div class="text-sm text-fg-subtle">
        <span v-if="filteredNodes === totalNodes">{{ t('nodePreview.totalNodes', { count: totalNodes }) }}</span>
        <span v-else>{{ t('nodePreview.filteredOfTotal', { filtered: filteredNodes, total: totalNodes }) }}</span>
      </div>

      <!-- 关闭按钮 -->
      <button
        class="misub-radius-md bg-surface text-fg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-line-strong p-2"
        @click="$emit('close')"
      >
        <span class="sr-only">{{ t('common.close') }}</span>
        <X class="h-5 w-5" />
      </button>
    </div>
  </div>
</template>
