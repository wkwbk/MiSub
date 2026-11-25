<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useUIStore } from '@/stores/useUiStore.js';
import { useSessionStore } from '@/stores/useSessionStore.js';
import { storeToRefs } from 'pinia';
import BrandLogo from '@/components/layout/BrandLogo.vue';
import NavActionGroup from '@/components/layout/NavActionGroup.vue';
import { MAIN_NAV_ITEMS } from '@/constants/navigation.js';
import { prefetchRoute } from '@/router/index.js';
import { useI18n } from '@/i18n/index.js';

const route = useRoute();
const uiStore = useUIStore();
const sessionStore = useSessionStore();
const { publicConfig } = storeToRefs(sessionStore);
const props = withDefaults(
  defineProps<{
    isLoggedIn?: boolean;
    pendingPath?: string | null;
  }>(),
  {
    isLoggedIn: false,
    pendingPath: null,
  },
);

const isPublicEnabled = computed(() => publicConfig.value?.enablePublicPage === true);
const showExploreEntry = computed(() => props.isLoggedIn || isPublicEnabled.value);
const hideBranding = computed(
  () => publicConfig.value?.customPage?.enabled === true && publicConfig.value?.customPage?.hideBranding === true,
);
const { t } = useI18n();

const emit = defineEmits<{
  logout: [];
}>();

const navItems = MAIN_NAV_ITEMS;

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/';
  if (path === '/dashboard') return route.path === '/dashboard';
  return route.path.startsWith(path);
}

function handleNavClick(event: MouseEvent, path: string): void {
  if (props.pendingPath === path || route.fullPath === path) {
    event.preventDefault();
  }
}
</script>

<template>
  <header
    :aria-label="t('nav.top')"
    class="app-nav-bar md:hidden sticky top-0 z-50 flex items-center justify-between px-4 h-14 w-full bg-white/75 dark:bg-[#0e0e0e]/75 backdrop-blur-md border-b border-black/[0.08] dark:border-white/[0.09] transition-colors duration-200 shadow-none"
  >
    <BrandLogo :icon-size="28" text-size-class="text-lg" to="/dashboard" />

    <NavActionGroup
      :hide-external-repo="hideBranding"
      :is-logged-in="isLoggedIn"
      :show-explore="showExploreEntry"
      :with-focus-ring="true"
      rounded-class="rounded-md"
      @logout="emit('logout')"
      @toggle-layout="uiStore.toggleLayout()"
    />
  </header>

  <header
    :aria-label="t('nav.main')"
    class="app-nav-bar hidden md:block sticky top-0 z-50 w-full bg-white/75 dark:bg-[#0e0e0e]/75 backdrop-blur-md border-b border-black/[0.08] dark:border-white/[0.09] transition-colors duration-200 shadow-none"
  >
    <div class="max-w-7xl mx-auto px-4 md:px-5 lg:px-8 h-14 flex items-center justify-between">
      <div class="shrink-0 pr-2 lg:pr-5">
        <BrandLogo :icon-size="28" text-size-class="text-lg" to="/dashboard" />
      </div>

      <nav
        :aria-label="t('nav.main')"
        class="nav-tab-shell min-w-0 flex items-center gap-0.5 md:gap-1 lg:gap-1.5 overflow-x-auto no-scrollbar"
      >
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :class="
            isActive(item.path)
              ? 'bg-active text-fg border-line-strong font-semibold'
              : 'text-fg-muted border-transparent hover:text-fg hover:bg-hover'
          "
          :to="item.path"
          class="relative inline-flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3 py-1.5 rounded-md text-xs lg:text-sm font-medium border transition-colors duration-200 whitespace-nowrap shrink-0 select-none"
          @click="handleNavClick($event, item.path)"
          @focus="prefetchRoute(item.path)"
          @mouseenter="prefetchRoute(item.path)"
        >
          <component :is="item.icon" class="relative z-10 h-4 w-4 shrink-0" />
          <span class="relative z-10 whitespace-nowrap">{{ t(item.key) }}</span>
        </router-link>
      </nav>

      <div class="flex items-center pl-2 lg:pl-5 ml-1 lg:ml-3 gap-1.5 lg:gap-2 shrink-0">
        <NavActionGroup
          :hide-external-repo="hideBranding"
          :is-logged-in="isLoggedIn"
          :show-divider="true"
          :show-explore="showExploreEntry"
          :with-focus-ring="true"
          rounded-class="rounded-md"
          @logout="emit('logout')"
          @toggle-layout="uiStore.toggleLayout()"
        />
      </div>
    </div>
  </header>

  <nav v-if="isLoggedIn" :aria-label="t('nav.bottom')" class="md:hidden mobile-nav-glass">
    <div class="mobile-nav-inner">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :class="isActive(item.path) ? 'nav-mobile-item-active' : 'nav-mobile-item-inactive'"
        :to="item.path"
        class="nav-mobile-item"
        @click="handleNavClick($event, item.path)"
        @touchstart.passive="prefetchRoute(item.path)"
      >
        <span class="nav-mobile-icon-wrap">
          <component
            :is="item.icon"
            :class="isActive(item.path) ? 'scale-110' : ''"
            class="w-5 h-5 transition-transform duration-300"
          />
        </span>

        <span class="text-[clamp(0.625rem,2.6vw,0.75rem)] font-medium tracking-tight leading-tight text-center">{{
          t(item.key)
        }}</span>
      </router-link>
    </div>
  </nav>
</template>
