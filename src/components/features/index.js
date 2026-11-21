/**
 * 功能组件模块
 * @author MiSub Team
 */

// 导出Dashboard相关组件
export { default as Dashboard } from '@/components/features/Dashboard/Dashboard.vue';

// 导出其他功能组件
export { default as ThemeToggle } from '@/components/features/ThemeToggle.vue';

// 组件列表
export const FeatureComponents = {
  // Dashboard组件
  Dashboard,

  // 其他功能组件
  ThemeToggle,
};

// 默认导出
export default FeatureComponents;
