/**
 * 模态框组件模块
 * @author MiSub Team
 */

// 导入主模态框组件
export { default as Login } from '@/components/modals/Login.vue';
export { default as SettingsModal } from '@/components/modals/SettingsModal.vue';
export { default as ProfileModal } from '@/components/modals/ProfileModal.vue';
export { default as BulkImportModal } from '@/components/modals/BulkImportModal.vue';
export { default as SubscriptionBulkImportModal } from '@/components/modals/SubscriptionBulkImportModal.vue';
export { default as SubscriptionImportModal } from '@/components/modals/SubscriptionImportModal.vue';

// 导入NodePreview相关组件
export { default as NodePreviewModal } from '@/components/modals/NodePreview/NodePreviewModal.vue';
export { default as NodePreviewContainer } from '@/components/modals/NodePreview/NodePreviewContainer.vue';
export { default as NodePreviewHeader } from '@/components/modals/NodePreview/NodePreviewHeader.vue';
export { default as NodeFilterControls } from './NodePreview/NodeFilterControls.vue';
export { default as NodeListView } from './NodePreview/NodeListView.vue';
export { default as NodeCardView } from './NodePreview/NodeCardView.vue';
export { default as NodePagination } from './NodePreview/NodePagination.vue';

// 导入composable
export { useNodePreview } from '@/composables/useNodePreview.js';

// 组件列表
export const ModalComponents = {
    // 通用模态框
    Login,
    SettingsModal,
    ProfileModal,
    BulkImportModal,
    SubscriptionBulkImportModal,
    SubscriptionImportModal,

    // 节点预览相关
    NodePreviewModal,
    NodePreviewContainer,
    NodePreviewHeader,
    NodeFilterControls,
    NodeListView,
    NodeCardView,
    NodePagination,

    // Composables
    useNodePreview,
};

// NodePreview子模块
export const NodePreviewComponents = {
    NodePreviewModal,
    NodePreviewContainer,
    NodePreviewHeader,
    NodeFilterControls,
    NodeListView,
    NodeCardView,
    NodePagination,
    useNodePreview,
};

// 默认导出
export default ModalComponents;
