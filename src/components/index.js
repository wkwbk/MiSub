/**
 * MiSub Components 主导出文件
 * @author MiSub Team
 *
 * 统一导出所有组件，提供清晰的组件访问接口
 */

// 导出共享组件库
export * from '@/components/shared';

// 导出布局组件
export * from '@/components/layout';

// 导出功能组件
export * from '@/components/features';

// 导出UI组件
export * from '@/components/ui';

// 导出表单组件
export * from '@/components/forms';

// 导出模态框组件
export * from '@/components/modals';

// 导出节点组件
export * from '@/components/nodes';

// 导出订阅组件
export * from '@/components/subscriptions';

// 导出配置文件组件
export * from '@/components/profiles';

// 组件映射表，方便按需导入
export const ComponentMap = {
  // 布局组件
  Layout: {
    Header: () => import('@/components/layout/Header.vue'),
    Footer: () => import('@/components/layout/Footer.vue'),
    AdaptiveGrid: () => import('@/components/layout/AdaptiveGrid.vue'),
    DashboardSkeleton: () => import('@/components/layout/DashboardSkeleton.vue'),
  },

  // 功能组件
  Features: {
    Dashboard: () => import('@/components/features/Dashboard/Dashboard.vue'),
    DashboardContainer: () => import('@/components/features/Dashboard/DashboardContainer.vue'),
    SaveIndicator: () => import('@/components/features/Dashboard/SaveIndicator.vue'),
    Overview: () => import('@/components/features/Dashboard/Overview.vue'),
    ThemeToggle: () => import('@/components/features/ThemeToggle.vue'),
  },

  // UI组件
  UI: {
    Card: () => import('@/components/ui/Card.vue'),
    LoadingSpinner: () => import('@/components/ui/LoadingSpinner.vue'),
    EmptyState: () => import('@/components/ui/EmptyState.vue'),
    StatusIndicator: () => import('@/components/ui/StatusIndicator.vue'),
    FluidButton: () => import('./ui/FluidButton.vue'),
    ProgressiveDisclosure: () => import('@/components/ui/ProgressiveDisclosure.vue'),
    Toast: () => import('@/components/ui/Toast.vue'),
    SkeletonLoader: () => import('@/components/ui/SkeletonLoader.vue'),
    SkeletonCard: () => import('@/components/ui/SkeletonCard.vue'),
  },

  // 表单组件
  Forms: {
    Modal: () => import('@/components/forms/Modal.vue'),
    SmartSearch: () => import('@/components/forms/SmartSearch.vue'),
  },

  // 模态框组件
  Modals: {
    Login: () => import('@/components/modals/Login.vue'),
    SettingsModal: () => import('@/components/modals/SettingsModal.vue'),
    ProfileModal: () => import('@/components/modals/ProfileModal.vue'),
    BulkImportModal: () => import('@/components/modals/BulkImportModal.vue'),
    SubscriptionBulkImportModal: () => import('@/components/modals/SubscriptionBulkImportModal.vue'),
    SubscriptionImportModal: () => import('@/components/modals/SubscriptionImportModal.vue'),
    NodePreviewModal: () => import('@/components/modals/NodePreview/NodePreviewModal.vue'),
    NodePreviewContainer: () => import('@/components/modals/NodePreview/NodePreviewContainer.vue'),
    NodePreviewHeader: () => import('@/components/modals/NodePreview/NodePreviewHeader.vue'),
    NodeFilterControls: () => import('./modals/NodePreview/NodeFilterControls.vue'),
    NodeListView: () => import('./modals/NodePreview/NodeListView.vue'),
    NodeCardView: () => import('./modals/NodePreview/NodeCardView.vue'),
    NodePagination: () => import('./modals/NodePreview/NodePagination.vue'),
  },

  // 节点组件
  Nodes: {
    ManualNodeCard: () => import('@/components/nodes/ManualNodeCard.vue'),
    ManualNodeList: () => import('@/components/nodes/ManualNodeList.vue'),
    ManualNodePanel: () => import('@/components/nodes/ManualNodePanel.vue'),
  },

  // 订阅组件
  Subscriptions: {
    SubscriptionPanel: () => import('@/components/subscriptions/SubscriptionPanel.vue'),
  },

  // 配置文件组件
  Profiles: {
    ProfileCard: () => import('@/components/profiles/ProfileCard.vue'),
    ProfilePanel: () => import('@/components/profiles/ProfilePanel.vue'),
    RightPanel: () => import('@/components/profiles/RightPanel.vue'),
  },

  // 共享组件
  Shared: {
    FormModal: () => import('@/components/shared/FormModal.vue'),
    DataGrid: () => import('@/components/shared/DataGrid.vue'),
    FilterPanel: () => import('@/components/shared/FilterPanel.vue'),
    DragDropList: () => import('@/components/shared/DragDropList.vue'),
  },
};

// 默认导出所有组件映射
export default ComponentMap;
