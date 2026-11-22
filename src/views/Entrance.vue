<template>
  <div class="entrance-container">
    <component :is="activeComponent" v-bind="componentProps" />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, markRaw, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSessionStore } from '@/stores/session';
import { resolveSafeLoginRedirect } from '@/utils/login-path.js';

const Login = defineAsyncComponent(() => import('@/views/LoginView.vue'));
const NotFound = defineAsyncComponent(() => import('@/views/NotFound.vue'));

const route = useRoute();
const router = useRouter();
const sessionStore = useSessionStore();

const isMatchedLoginPath = computed(() => {
  if (sessionStore.sessionState === 'loading') return false;

  const config = sessionStore.publicConfig || {};
  if (config.hasCustomLoginPath) {
    return (
      route.path !== '/login' &&
      config.isLoginPath === true &&
      (!sessionStore.verifiedLoginPath || route.path === sessionStore.verifiedLoginPath)
    );
  }
  return route.path === '/login';
});

watchEffect(() => {
  if (sessionStore.sessionState === 'loggedIn' && isMatchedLoginPath.value) {
    const target = resolveSafeLoginRedirect(route.query.redirect, '/dashboard', [route.path]);
    router.replace(target).catch(() => {});
  }
});

const activeComponent = computed(() => {
  if (sessionStore.sessionState === 'loading') return null;
  if (isMatchedLoginPath.value) {
    return sessionStore.sessionState === 'loggedIn' ? null : markRaw(Login);
  }
  return markRaw(NotFound);
});

const componentProps = computed(() =>
  isMatchedLoginPath.value
    ? {
        login: sessionStore.login,
        showBackHome: sessionStore.publicConfig?.enablePublicPage !== false,
      }
    : {},
);
</script>

<style scoped>
.entrance-container {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
