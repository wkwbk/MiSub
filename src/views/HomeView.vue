<script setup>
import { computed, defineAsyncComponent, h, watchEffect } from 'vue';
import { useSessionStore } from '@/stores/session';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';

const PublicProfilesView = defineAsyncComponent(() => import('@/views/PublicProfilesView.vue'));

// 已登录等待重定向时的占位组件。
// 必须使用 render 函数而不是运行时模板字符串（{ template: '<div></div>' }）：
// 项目在懒加载 vuedraggable（UMD 内含 Vue 完整版）后会注册 runtime compiler，
// 运行时模板将经 new Function("Vue", code) 编译，在启用严格 CSP 的部署上
// 会被拦截并抛 EvalError: call to Function() blocked by CSP，
// 最终以「操作失败，请稍后重试」的错误提示弹出。
// 见 tests/unit/runtime-compiler-csp.test.js
const RedirectPlaceholder = { render: () => h('div') };

const sessionStore = useSessionStore();
const { sessionState, publicConfig } = storeToRefs(sessionStore);
const route = useRoute();
const router = useRouter();

const isExploreRoute = computed(() => route.path === '/explore');
const isPublicClosedForGuest = computed(
  () => sessionState.value === 'loggedOut' && publicConfig.value && !publicConfig.value.enablePublicPage,
);

// 1. 已登录访问根路径 / 时重定向到仪表盘 /dashboard
// 2. 公开页关闭且未登录时，交给服务端统一访问控制返回真实 404 或 302 跳转（避免前端再维护第二套 404）
watchEffect(() => {
  if (sessionState.value === 'loggedIn' && !isExploreRoute.value) {
    // 导航被中断/失败时不应冒泡为未处理的 Promise 拒绝（会触发全局错误提示）
    router.replace('/dashboard').catch(() => {});
    return;
  }

  if (isPublicClosedForGuest.value && typeof window !== 'undefined') {
    window.location.replace(route.fullPath || '/');
  }
});

const currentView = computed(() => {
  // 等待会话与公开配置加载完成，避免公开页关闭时短暂闪现
  if (sessionState.value === 'loading' || isPublicClosedForGuest.value) {
    return RedirectPlaceholder;
  }

  // 1. 明确的 /explore 路由：已登录管理员始终可预览，未登录仅在公开页开启时到达此处
  if (isExploreRoute.value) {
    return PublicProfilesView;
  }

  // 2. 根路径 /：已登录等待重定向到 /dashboard，未登录且公开页开启则展示公开页
  if (sessionState.value === 'loggedIn') {
    return RedirectPlaceholder;
  }

  return PublicProfilesView;
});
</script>

<template>
  <component :is="currentView" />
</template>
