<template>
  <div class="entrance-container">
    <component :is="activeComponent" v-bind="componentProps" />
  </div>
</template>

<script setup>
import { defineAsyncComponent, markRaw, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSessionStore } from '@/stores/session';
import { storeToRefs } from 'pinia';
import { isValidCustomLoginPath, resolveSafeLoginRedirect } from '@/utils/login-path.js';
import { readSessionPreference, writeSessionPreference } from '@/utils/session-preference.js';

const Login = defineAsyncComponent(() => import('@/views/LoginView.vue'));
const NotFound = defineAsyncComponent(() => import('@/views/NotFound.vue'));

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();
const { publicConfig } = storeToRefs(sessionStore);

const activeComponent = ref(null);
const componentProps = ref({});

onMounted(async () => {
  checkPath();
});

watch(
  () => route.path,
  () => {
    checkPath();
  },
);

watch(publicConfig, () => {
  checkPath();
});

watch(
  () => sessionStore.sessionState,
  () => {
    checkPath();
  },
);

function checkPath() {
  // 在 session 还在 loading 时，publicConfig 尚未从 API 加载，不做判断
  if (sessionStore.sessionState === 'loading') {
    activeComponent.value = null;
    return;
  }

  const config = publicConfig.value || {};
  const currentPath = route.path;

  // customLoginPath 不再由公开 API 返回；后端返回 hasCustomLoginPath 布尔值，
  // 并只在当前请求路径命中实际登录路径时返回 isLoginPath=true。
  const hasCustomPath = Boolean(config.hasCustomLoginPath) || isValidCustomLoginPath(config.customLoginPath);
  let isMatchedLoginPath = false;

  if (hasCustomPath) {
    // 启用了自定义登录路径时，/login 永远不允许打开登录页
    if (currentPath !== '/login') {
      if (config.isLoginPath) {
        writeSessionPreference('misub:login-path', currentPath);
        isMatchedLoginPath = true;
      } else {
        const knownCustomPath = isValidCustomLoginPath(config.customLoginPath)
          ? '/' + config.customLoginPath.trim().replace(/^\/+/, '')
          : readSessionPreference('misub:login-path') || '';
        isMatchedLoginPath = Boolean(
          knownCustomPath && knownCustomPath !== '/login' && currentPath === knownCustomPath,
        );
      }
    }
  } else {
    isMatchedLoginPath = currentPath === '/login';
  }

  if (isMatchedLoginPath) {
    if (sessionStore.sessionState === 'loggedIn') {
      activeComponent.value = null;
      const target = resolveSafeLoginRedirect(route.query.redirect, '/dashboard', [currentPath]);
      router.replace(target).catch(() => {});
      return;
    }
    // 匹配到配置的登录路径（自定义或默认 /login）
    activeComponent.value = markRaw(Login);
    componentProps.value = { login: sessionStore.login };
  } else {
    // 不匹配任何登录路径 → 显示 404
    activeComponent.value = markRaw(NotFound);
  }
}
</script>

<style scoped>
.entrance-container {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
