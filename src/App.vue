<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { Globe } from '@lucide/vue';
import RouteErrorBoundary from '@/components/ui/RouteErrorBoundary.vue';
import RouteProgressBar from '@/components/ui/RouteProgressBar.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import { useRouteLoading } from '@/composables/useRouteLoading.js';
import { useRoute, useRouter } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import { useSessionStore } from '@/stores/session';
import { useToastStore } from '@/stores/toast';
import { useDataStore } from '@/stores/useDataStore';
import { useUIStore } from '@/stores/ui';
import { useVersionStore } from '@/stores/version';
import { storeToRefs } from 'pinia';
import NavBar from '@/components/layout/NavBar.vue';
import { useI18n } from '@/i18n/index.js';
import { COMMON_DASHBOARD_ROUTE_LOADERS, configureAuthGuard, translateRouteTitle } from '@/router/index.js';
import { scheduleIdlePrefetch } from '@/utils/prefetch.js';
import { readSessionPreference } from '@/utils/session-preference.js'; // Lazy components

// Lazy components
const Login = defineAsyncComponent(() => import('@/views/LoginView.vue'));
const NotFound = defineAsyncComponent(() => import('@/views/NotFound.vue'));
const Toast = defineAsyncComponent(() => import('@/components/ui/Toast.vue'));
const Footer = defineAsyncComponent(() => import('@/components/layout/Footer.vue'));
const Dashboard = defineAsyncComponent(() => import('@/components/dashboard/Dashboard.vue'));
const Header = defineAsyncComponent(() => import('@/components/layout/Header.vue'));
const SavePrompt = defineAsyncComponent(() => import('@/components/ui/SavePrompt.vue'));
const ScrollToTop = defineAsyncComponent(() => import('@/components/ui/ScrollToTop.vue'));
const VersionChangelogModal = defineAsyncComponent(() => import('@/components/modals/VersionChangelogModal.vue'));

const route = useRoute();
const router = useRouter();
const { isNavigating, progress, isFadingOut, showSlowIndicator, pendingPath } = useRouteLoading(router);
const isDiscarding = ref(false);
let cancelRoutePrefetch = () => {};
const { t, locale } = useI18n();
const themeStore = useThemeStore();
const { theme } = storeToRefs(themeStore);
const { initTheme } = themeStore;

const sessionStore = useSessionStore();
const { sessionState } = storeToRefs(sessionStore);
const { checkSession, login, logout } = sessionStore;

const toastStore = useToastStore();

const dataStore = useDataStore();
const { isDirty, saveState } = storeToRefs(dataStore);

const uiStore = useUIStore();
const { layoutMode } = storeToRefs(uiStore);

const versionStore = useVersionStore();
const {
  showModal: showVersionChangelogModal,
  showUpdateNotice,
  latestRelease: versionReleaseInfo,
  currentVersion,
} = storeToRefs(versionStore);

const isLoggedIn = computed(() => sessionState.value === 'loggedIn');
const isPublicRoute = computed(() => route.meta.isPublic);
const isSessionLoading = computed(() => sessionState.value === 'loading');
const loginPath = computed(() => {
  const rawPath = sessionStore.publicConfig?.customLoginPath;
  if (typeof rawPath === 'string' && rawPath.trim()) {
    const normalized = rawPath.trim().replace(/^\/+/, '');
    if (normalized && normalized !== 'login') return `/${normalized}`;
  }

  const rememberedPath = readSessionPreference('misub:login-path');
  if (rememberedPath && rememberedPath.startsWith('/')) return rememberedPath;
  return '/login';
});

configureAuthGuard(() => ({
  state: sessionState.value,
  loginPath: loginPath.value,
}));

const showModernNavBar = computed(() => isLoggedIn.value && layoutMode.value === 'modern');
const shouldHidePublicBranding = computed(() => {
  if (isLoggedIn.value || !isPublicRoute.value) return false;
  return (
    sessionStore.publicConfig?.customPage?.enabled === true &&
    sessionStore.publicConfig?.customPage?.hideBranding === true
  );
});
const shouldHidePublicHeader = computed(() => {
  if (isLoggedIn.value || !isPublicRoute.value) return false;
  return (
    sessionStore.publicConfig?.customPage?.enabled === true &&
    sessionStore.publicConfig?.customPage?.hideHeader === true
  );
});

const shouldHidePublicFooter = computed(() => {
  if (isLoggedIn.value || !isPublicRoute.value) return false;
  return (
    sessionStore.publicConfig?.customPage?.enabled === true &&
    sessionStore.publicConfig?.customPage?.hideFooter === true
  );
});

const showLegacyHeader = computed(() => {
  if (showModernNavBar.value) return false;
  if (isLoggedIn.value) return true;
  if (isSessionLoading.value || !isPublicRoute.value) return false;
  return !shouldHidePublicHeader.value;
});
const showPublicFooter = computed(() => {
  return !shouldHidePublicFooter.value;
});
const shouldShowFooter = computed(() => !isSessionLoading.value && (!isPublicRoute.value || showPublicFooter.value));

const shouldCenterMain = computed(
  () =>
    sessionState.value !== 'loggedIn' &&
    sessionState.value !== 'loading' &&
    (!isPublicRoute.value || route.name === 'Entrance'),
);

const showSavePrompt = computed(
  () => layoutMode.value === 'modern' && (isDirty.value || saveState.value === 'success'),
);

// 设置页自带吸底操作栏（内含回到顶部按钮），隐藏全局悬浮 ScrollToTop 以避免重叠
const isModernSettingsPage = computed(
  () => isLoggedIn.value && layoutMode.value === 'modern' && route.name === 'Settings',
);

// Determine which login component to show (Custom Path -> NotFound, else -> Login)
const loginComponent = computed(() => {
  const rawPath = sessionStore.publicConfig?.customLoginPath;
  const normalizedPath = rawPath && typeof rawPath === 'string' ? rawPath.trim().replace(/^\/+/, '') : '';
  // 只有当存在有效的自定义路径（非空且不等于默认 'login'）时才显示 NotFound
  return normalizedPath && normalizedPath !== 'login' ? NotFound : Login;
});

const isDefaultPassword = computed(() => {
  return (
    sessionStore.subscriptionConfig?.isDefaultPassword === true ||
    sessionStore.securityWarning?.type === 'default_admin_password'
  );
});
const defaultPasswordWarningMessage = computed(
  () => sessionStore.securityWarning?.message || t('notices.defaultPasswordWarning'),
);

onMounted(async () => {
  window.addEventListener('misub:unauthorized', handleUnauthorized);
  initTheme();
  await checkSession();
});

onUnmounted(() => {
  cancelRoutePrefetch();
  window.removeEventListener('misub:unauthorized', handleUnauthorized);
});

watch(
  () => [
    route.fullPath,
    sessionStore.publicConfig?.customPage?.enabled,
    sessionStore.publicConfig?.customPage?.hideBranding,
    // 切换语言时也要重算标题，否则会一直停在启动时的语言
    locale.value,
  ],
  () => {
    if (typeof document === 'undefined') return;
    const rawTitle = translateRouteTitle(route, t);
    document.title = shouldHidePublicBranding.value
      ? rawTitle || document.title || ''
      : rawTitle
        ? `${rawTitle} - MISUB`
        : 'MISUB';
  },
  { immediate: true },
);

watch(
  sessionState,
  async (newVal) => {
    if (newVal === 'loggedIn') {
      await dataStore.fetchData();
      cancelRoutePrefetch();
      cancelRoutePrefetch = scheduleIdlePrefetch(COMMON_DASHBOARD_ROUTE_LOADERS);

      try {
        await versionStore.checkVersion(false);
      } catch {
        // Non-blocking version check.
      }
    }
  },
  { immediate: true },
);

const handleVersionModalConfirm = () => {
  versionStore.closeModal();
};

const handleVersionModalSuppress = () => {
  versionStore.suppressUpdateModal();
};

const handleSave = async () => {
  await dataStore.saveData();
};
const handleDiscard = async () => {
  if (isDiscarding.value || saveState.value !== 'idle') return;
  isDiscarding.value = true;
  try {
    await dataStore.fetchData(true);
    toastStore.showToast(t('notices.discardedChanges'));
  } finally {
    isDiscarding.value = false;
  }
};

const redirectUnauthenticatedRoute = () => {
  if (sessionState.value !== 'loggedOut' || !route.meta?.requiresAuth) return;
  if (route.path === loginPath.value) return;
  router.replace({ path: loginPath.value, query: { redirect: route.fullPath } }).catch(() => {});
};

const handleUnauthorized = async () => {
  const changed = await sessionStore.handleUnauthorized();
  if (!changed) return;
  toastStore.showToast(t('settings.authFailedRelogin'), 'error');
  redirectUnauthenticatedRoute();
};

watch([sessionState, () => route.fullPath, loginPath], redirectUnauthenticatedRoute, {
  immediate: true,
});

const isCustomPageFullWidth = computed(() => {
  if (!isPublicRoute.value) return false;
  const cp = sessionStore.publicConfig?.customPage;
  return cp?.enabled === true && cp?.useDefaultLayout === false;
});
</script>

<template>
  <div :class="theme" class="min-h-screen flex flex-col text-fg transition-colors duration-200 bg-canvas">
    <RouteProgressBar
      :is-fading-out="isFadingOut"
      :is-navigating="isNavigating"
      :progress="progress"
      :show-slow-indicator="showSlowIndicator"
    />

    <!-- Navigation -->
    <NavBar v-if="showModernNavBar" :is-logged-in="true" :pending-path="pendingPath" @logout="logout" />
    <Header
      v-else-if="showLegacyHeader"
      :hide-branding="shouldHidePublicBranding"
      :is-logged-in="isLoggedIn"
      @logout="logout"
    />

    <main
      :class="[
        isCustomPageFullWidth
          ? 'grow w-full min-h-[100dvh]'
          : [
              'grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
              shouldCenterMain
                ? 'py-6 flex items-center justify-center'
                : [
                    isModernSettingsPage && !isDefaultPassword && !showUpdateNotice ? 'pt-0 md:pt-6' : 'pt-6',
                    showModernNavBar ? 'pb-[calc(6rem+max(env(safe-area-inset-bottom,0px),12px))] md:pb-6' : 'pb-6',
                  ],
            ],
        {
          'ios-header-padding': showLegacyHeader,
        },
      ]"
    >
      <div
        v-if="sessionState === 'loading'"
        aria-live="polite"
        class="flex flex-col items-center justify-center p-8 min-h-[60vh] select-none"
        role="status"
      >
        <div class="relative flex items-center justify-center mb-6">
          <!-- Track Ring -->
          <div class="w-12 h-12 rounded-full border border-zinc-200 dark:border-zinc-800"></div>
          <!-- Spinning Hairline Arc -->
          <div
            class="absolute inset-0 w-12 h-12 rounded-full border border-transparent border-t-zinc-900 dark:border-t-zinc-100 animate-spin"
          ></div>
          <!-- Centered Brand Glyph -->
          <div class="absolute inset-0 flex items-center justify-center text-zinc-400 dark:text-zinc-500">
            <Globe class="w-5 h-5" stroke-width="1.75" />
          </div>
        </div>
        <div class="flex flex-col items-center gap-1.5">
          <span class="font-display font-semibold tracking-tight text-sm text-zinc-900 dark:text-zinc-100">
            MiSub
          </span>
          <span class="text-xs font-mono text-zinc-400 dark:text-zinc-500">
            {{ t('common.loading') }}
          </span>
        </div>
      </div>

      <template v-else-if="isLoggedIn">
        <!-- Security Banner -->
        <div v-if="isDefaultPassword" class="mb-4 px-4 py-3 bg-surface text-fg rounded-md border border-line">
          <div class="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div class="flex items-center gap-2.5">
              <span class="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"></span>
              <p class="text-xs sm:text-sm font-medium text-fg">
                {{ defaultPasswordWarningMessage }}
              </p>
            </div>
          </div>
        </div>

        <div
          v-if="showUpdateNotice && versionReleaseInfo"
          class="mb-4 rounded-md border border-line bg-surface px-4 py-3 text-fg"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="space-y-1">
              <p class="text-sm font-semibold text-fg flex items-center gap-2 font-mono">
                <span class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
                {{
                  t('notices.updateAvailable', {
                    version: versionReleaseInfo.tag_name,
                  })
                }}
              </p>
              <p class="text-xs sm:text-sm text-zinc-400 font-mono">
                {{ t('notices.currentVersion', { version: currentVersion }) }}
              </p>
              <a
                v-if="versionReleaseInfo.html_url"
                :href="versionReleaseInfo.html_url"
                class="inline-flex items-center gap-2 text-xs sm:text-sm font-mono font-medium text-zinc-200 underline decoration-zinc-600 underline-offset-4 hover:text-white"
                rel="noopener noreferrer"
                target="_blank"
              >
                {{ t('actions.viewReleaseNotes') }}
              </a>
            </div>
            <button
              class="rounded-md border border-zinc-800 bg-transparent px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
              @click="showUpdateNotice = false"
            >
              {{ t('actions.gotIt') }}
            </button>
          </div>
        </div>

        <SavePrompt
          :is-dirty="showSavePrompt"
          :is-discarding="isDiscarding"
          :save-state="saveState"
          @discard="handleDiscard"
          @save="handleSave"
        />

        <router-view v-if="layoutMode === 'modern'" v-slot="{ Component, route: currentRoute }">
          <RouteErrorBoundary :reset-key="currentRoute.fullPath">
            <transition mode="out-in" name="route-fade">
              <component :is="Component" v-if="Component" :key="currentRoute.path" />
            </transition>
          </RouteErrorBoundary>
        </router-view>

        <Dashboard v-else />
      </template>

      <!-- PUBLIC ROUTE VIEW (Not logged in, but isPublic) -->
      <template v-else-if="isPublicRoute">
        <router-view v-slot="{ Component, route: currentRoute }">
          <RouteErrorBoundary :reset-key="currentRoute.fullPath">
            <transition mode="out-in" name="route-fade">
              <component :is="Component" v-if="Component" :key="currentRoute.path" />
            </transition>
          </RouteErrorBoundary>
        </router-view>
      </template>

      <!-- LOGIN VIEW (Not logged in, not public) -->
      <template v-else>
        <component :is="loginComponent" :login="login" />
      </template>
    </main>

    <Toast />
    <ConfirmDialog />
    <VersionChangelogModal
      :current-version="currentVersion"
      :release="versionReleaseInfo || {}"
      :show="showVersionChangelogModal"
      @confirm="handleVersionModalConfirm"
      @suppress="handleVersionModalSuppress"
      @update:show="versionStore.closeModal"
    />
    <Footer v-if="shouldShowFooter" :has-mobile-nav="showModernNavBar" :hide-branding="shouldHidePublicBranding" />
    <ScrollToTop v-if="(isLoggedIn || isPublicRoute) && !isModernSettingsPage" />
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.route-fade-enter-active {
  transition:
    opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.route-fade-leave-active {
  transition:
    opacity 0.14s ease-in,
    transform 0.14s ease-in;
}

.route-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.route-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}

/* iOS Specific Padding for Fixed Header */
@supports (-webkit-touch-callout: none) {
  .ios-header-padding {
    padding-top: calc(env(safe-area-inset-top, 0px) + 80px) !important;
  }
}
</style>
