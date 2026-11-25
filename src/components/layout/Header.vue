<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useUIStore } from '@/stores/useUiStore.js';
import { useSessionStore } from '@/stores/useSessionStore.js';
import BrandLogo from '@/components/layout/BrandLogo.vue';
import NavActionGroup from '@/components/layout/NavActionGroup.vue';
import { useI18n } from '@/i18n/index.js';

const route = useRoute();
const uiStore = useUIStore();
const sessionStore = useSessionStore();
const { t } = useI18n();

const shouldHideLoginButton = computed(() => {
  if (sessionStore.sessionState === 'loading') return true;
  if (route.path === '/login') return true;
  return Boolean(sessionStore.publicConfig?.hasCustomLoginPath);
});

const props = withDefaults(
  defineProps<{
    isLoggedIn?: boolean;
    hideBranding?: boolean;
  }>(),
  {
    isLoggedIn: false,
    hideBranding: false,
  },
);

const brandTarget = computed(() => {
  if (props.isLoggedIn) return '/dashboard';
  return sessionStore.publicConfig?.enablePublicPage !== false ? '/' : route.path;
});

const emit = defineEmits<{
  logout: [];
}>();
</script>

<template>
  <header
    class="app-nav-bar ios-fixed-header sticky top-0 z-50 bg-white/75 dark:bg-[#0e0e0e]/75 backdrop-blur-md border-b border-black/[0.08] dark:border-white/[0.09] transition-colors duration-200 shadow-none"
  >
    <div class="ios-status-overlay"></div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="safe-top-inset">
        <div class="flex justify-between items-center h-14">
          <BrandLogo v-if="!hideBranding" :icon-size="24" :to="brandTarget" text-size-class="text-base" />
          <router-link
            v-else
            :to="brandTarget"
            class="font-mono text-xs font-semibold tracking-widest uppercase text-fg-subtle hover:text-fg"
            >{{ t('app.home') }}</router-link
          >

          <NavActionGroup
            :hide-external-repo="hideBranding"
            :is-logged-in="isLoggedIn"
            :show-explore="false"
            :show-login-button="!shouldHideLoginButton"
            :show-settings="true"
            :with-focus-ring="true"
            rounded-class="rounded-md"
            @logout="emit('logout')"
            @open-settings="uiStore.show()"
            @toggle-layout="uiStore.toggleLayout()"
          />
        </div>
      </div>
    </div>
  </header>
</template>
