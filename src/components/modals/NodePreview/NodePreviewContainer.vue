/** * 节点预览主容器组件 * @author MiSub Team */

<script setup>
import { useI18n } from '@/i18n/index.js';
import { nextTick, onMounted, ref } from 'vue';

// 子组件
import NodePreviewHeader from '@/components/modals/NodePreview/NodePreviewHeader.vue';
import NodeFilterControls from './NodeFilterControls.vue';
import NodeListView from './NodeListView.vue';
import NodeCardView from './NodeCardView.vue';
import NodePagination from './NodePagination.vue';
import LoadingSpinner from './LoadingSpinner.vue';
import EmptyState from './EmptyState.vue'; // Composables
import { useNodePreview } from '@/composables/useNodePreview.js';
import { useBackdropDismiss } from '@/composables/useBackdropDismiss.js';
import { useScrollLock } from '@/composables/useScrollLock.js';
import { scrollToPaginationStart } from '@/utils/scroll.js';

const { t } = useI18n();

const props = defineProps({
  show: Boolean,
  subscriptionId: String,
  subscriptionName: String,
  subscriptionUrl: String,
  profileId: String,
  profileName: String,
});

const emit = defineEmits(['update:show']);

// 使用节点预览的composable
const {
  loading,
  error,
  allNodes,
  filteredNodes,
  protocolStats,
  regionStats,
  availableProtocols,
  availableRegions,
  currentPage,
  pageSize,
  totalPages,
  paginatedNodes,
  protocolFilter,
  regionFilter,
  searchQuery,
  viewMode,
  effectiveViewMode,
  title,
  loadNodes,
  resetFilters,
  copyNodeUrl,
  copiedNodeId,
  nextPage,
  prevPage,
  goToPage,
  updateViewMode,
} = useNodePreview(props);

const nodeListStartRef = ref(null);

const scrollListToStart = () => {
  nextTick(() => {
    scrollToPaginationStart(nodeListStartRef.value);
  });
};

const handleNextPage = () => {
  const prev = currentPage.value;
  nextPage();
  if (currentPage.value !== prev) {
    scrollListToStart();
  }
};

const handlePrevPage = () => {
  const prev = currentPage.value;
  prevPage();
  if (currentPage.value !== prev) {
    scrollListToStart();
  }
};

const handleGoToPage = (page) => {
  const prev = currentPage.value;
  goToPage(page);
  if (currentPage.value !== prev) {
    scrollListToStart();
  }
};

// 处理关闭
const handleClose = () => {
  emit('update:show', false);
};

const { handleBackdropPointerDown, handleBackdropClick } = useBackdropDismiss(handleClose);
useScrollLock(() => props.show);

// 自动加载数据
onMounted(() => {
  if (props.show) {
    loadNodes();
  }
});
</script>

<template>
  <!-- 主模态框 -->
  <div
    v-if="show"
    :style="{ zIndex: 'var(--z-modal)' }"
    aria-modal="true"
    class="fixed inset-0 overflow-y-auto overscroll-contain bg-black/75 backdrop-blur-sm"
    role="dialog"
    @pointerdown.capture="handleBackdropPointerDown"
    @click.self="handleBackdropClick"
  >
    <div class="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
      <div
        class="modal-surface relative transform overflow-hidden rounded-lg text-left text-fg transition-all sm:my-8 sm:w-full sm:max-w-6xl"
      >
        <!-- 头部 -->
        <NodePreviewHeader
          :filtered-nodes="filteredNodes.length"
          :title="title"
          :total-nodes="allNodes.length"
          @close="handleClose"
        />

        <!-- 主体内容 -->
        <div class="px-4 py-5 sm:p-6 sm:pt-4">
          <!-- 过滤控件 -->
          <NodeFilterControls
            :available-protocols="availableProtocols"
            :available-regions="availableRegions"
            :effective-view-mode="effectiveViewMode"
            :loading="loading"
            :protocol-filter="protocolFilter"
            :protocol-stats="protocolStats"
            :region-filter="regionFilter"
            :region-stats="regionStats"
            :search-query="searchQuery"
            :view-mode="viewMode"
            @refresh="loadNodes"
            @reset="resetFilters"
            @update:protocol-filter="(val) => (protocolFilter = val)"
            @update:region-filter="(val) => (regionFilter = val)"
            @update:search-query="(val) => (searchQuery = val)"
            @update:view-mode="updateViewMode"
          />

          <!-- 加载状态 -->
          <LoadingSpinner v-if="loading" />

          <!-- 错误状态 -->
          <div v-else-if="error" class="flex items-center justify-center h-64">
            <div class="text-center">
              <div class="text-red-500 text-lg font-medium mb-2">
                {{ t('nodePreview.loadFailed') }}
              </div>
              <p class="text-sm text-fg-subtle mb-4">{{ error }}</p>
              <button
                class="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm misub-radius-md transition-colors"
                @click="loadNodes"
              >
                {{ t('common.retry') }}
              </button>
            </div>
          </div>

          <!-- 无数据状态 -->
          <EmptyState
            v-else-if="paginatedNodes.length === 0 && !loading"
            :filtered-count="filteredNodes.length"
            :total-count="allNodes.length"
            @refresh="loadNodes"
            @reset="resetFilters"
          />

          <!-- 节点列表/卡片视图 -->
          <div v-else ref="nodeListStartRef" class="h-full flex flex-col">
            <!-- 简洁列表视图 (仅大屏桌面端) -->
            <NodeListView
              v-if="effectiveViewMode === 'list'"
              :copied-node-id="copiedNodeId"
              :nodes="paginatedNodes"
              @copy="copyNodeUrl"
            />

            <!-- 卡片视图 (移动端和平板端) -->
            <NodeCardView v-else :copied-node-id="copiedNodeId" :nodes="paginatedNodes" @copy="copyNodeUrl" />

            <!-- 分页控件 -->
            <NodePagination
              v-if="totalPages > 1"
              :current-page="currentPage"
              :page-size="pageSize"
              :total-items="filteredNodes.length"
              :total-pages="totalPages"
              @next="handleNextPage"
              @prev="handlePrevPage"
              @go-to-page="handleGoToPage"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
