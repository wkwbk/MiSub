<script setup>
    import { defineAsyncComponent, onMounted, onUnmounted, watch, computed, ref } from 'vue';
    import RouteErrorBoundary from './components/ui/RouteErrorBoundary.vue';
    import ConfirmDialog from './components/ui/ConfirmDialog.vue';
    import { useRoute, useRouter } from 'vue-router';
    import { useThemeStore } from './stores/theme';
    import { useSessionStore } from './stores/session';
    import { useToastStore } from './stores/toast';
    import { useDataStore } from './stores/useDataStore';
    import { useUIStore } from './stores/ui';
    import { useVersionStore } from './stores/version';
    import { storeToRefs } from 'pinia';
    import NavBar from './components/layout/NavBar.vue';
    import { detectLegacyD1 } from './lib/api.js';
    import { useI18n } from './i18n/index.js';
    import { configureAuthGuard, translateRouteTitle } from './router/index.js';
    import { readSessionPreference } from './utils/session-preference.js';

    // Lazy components
    const Login = defineAsyncComponent(() => import('./components/modals/Login.vue'));
    const NotFound = defineAsyncComponent(() => import('./views/NotFound.vue'));
    const Toast = defineAsyncComponent(() => import('./components/ui/Toast.vue'));
    const Footer = defineAsyncComponent(() => import('./components/layout/Footer.vue'));
    const Dashboard = defineAsyncComponent(
        () => import('./components/features/Dashboard/Dashboard.vue')
    );
    const Header = defineAsyncComponent(() => import('./components/layout/Header.vue'));
    const SavePrompt = defineAsyncComponent(() => import('./components/ui/SavePrompt.vue'));
    const ScrollToTop = defineAsyncComponent(() => import('./components/ui/ScrollToTop.vue'));
    const LegacyD1MigrationModal = defineAsyncComponent(
        () => import('./components/modals/LegacyD1MigrationModal.vue')
    );
    const VersionChangelogModal = defineAsyncComponent(
        () => import('./components/modals/VersionChangelogModal.vue')
    );

    const route = useRoute();
    const router = useRouter();
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
    const shouldShowFooter = computed(
        () => !isSessionLoading.value && (!isPublicRoute.value || showPublicFooter.value)
    );

    const shouldCenterMain = computed(
        () =>
            sessionState.value !== 'loggedIn' &&
            sessionState.value !== 'loading' &&
            !isPublicRoute.value
    );

    const showSavePrompt = computed(
        () => layoutMode.value === 'modern' && (isDirty.value || saveState.value === 'success')
    );

    const showLegacyD1MigrationModal = ref(false);
    const legacyD1Details = ref({ hasLegacySubscriptions: false, hasLegacyProfiles: false });
    const pendingVersionModal = ref(false);

    // Determine which login component to show (Custom Path -> NotFound, else -> Login)
    const loginComponent = computed(() => {
        const rawPath = sessionStore.publicConfig?.customLoginPath;
        const normalizedPath =
            rawPath && typeof rawPath === 'string' ? rawPath.trim().replace(/^\/+/, '') : '';
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
        () => sessionStore.securityWarning?.message || t('notices.defaultPasswordWarning')
    );

    onMounted(async () => {
        window.addEventListener('misub:unauthorized', handleUnauthorized);
        initTheme();
        await checkSession();
    });

    onUnmounted(() => {
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
        { immediate: true }
    );

    watch(
        sessionState,
        async (newVal) => {
            if (newVal === 'loggedIn') {
                await dataStore.fetchData();

                try {
                    const result = await detectLegacyD1();
                    if (result?.success && result.data?.hasLegacyData) {
                        legacyD1Details.value = result.data;
                        showLegacyD1MigrationModal.value = true;
                    }
                } catch {
                    // Non-blocking legacy check.
                }

                try {
                    await versionStore.checkVersion(showLegacyD1MigrationModal.value);
                } catch {
                    // Non-blocking version check.
                }
            }
        },
        { immediate: true }
    );

    const handleLegacyD1MigrationSuccess = async () => {
        showLegacyD1MigrationModal.value = false;
        await dataStore.fetchData(true);
        if (pendingVersionModal.value) {
            versionStore.openModal();
        }
    };

    const handleLegacyD1MigrationClose = (value) => {
        showLegacyD1MigrationModal.value = value;
        if (!value && pendingVersionModal.value) {
            versionStore.openModal();
        }
    };

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
        await dataStore.fetchData(true);
        toastStore.showToast(t('notices.discardedChanges'));
    };

    const redirectUnauthenticatedRoute = () => {
        if (sessionState.value !== 'loggedOut' || !route.meta?.requiresAuth) return;
        if (route.path === loginPath.value) return;
        router
            .replace({ path: loginPath.value, query: { redirect: route.fullPath } })
            .catch(() => {});
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
    <div
        :class="theme"
        class="min-h-screen flex flex-col text-zinc-900 dark:text-zinc-200 transition-colors duration-300 bg-zinc-50 dark:bg-[#131515]"
    >
        <!-- Navigation -->
        <NavBar v-if="showModernNavBar" :is-logged-in="true" @logout="logout" />
        <Header
            v-else-if="showLegacyHeader"
            :is-logged-in="isLoggedIn"
            :hide-branding="shouldHidePublicBranding"
            @logout="logout"
        />

        <main
            :class="[
                isCustomPageFullWidth
                    ? 'grow w-full min-h-[100dvh]'
                    : 'grow w-full py-6 pb-24 md:pb-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
                {
                    'flex items-center justify-center': shouldCenterMain,
                    'ios-header-padding': showLegacyHeader,
                },
            ]"
        >
            <div
                v-if="sessionState === 'loading'"
                class="flex flex-col items-center justify-center p-8 min-h-[60vh] select-none"
                role="status"
                aria-live="polite"
            >
                <div class="relative flex items-center justify-center mb-6">
                    <!-- Track Ring -->
                    <div
                        class="w-12 h-12 rounded-full border border-zinc-200 dark:border-zinc-800"
                    ></div>
                    <!-- Spinning Hairline Arc -->
                    <div
                        class="absolute inset-0 w-12 h-12 rounded-full border border-transparent border-t-zinc-900 dark:border-t-zinc-100 animate-spin"
                    ></div>
                    <!-- Centered Brand Glyph -->
                    <div
                        class="absolute inset-0 flex items-center justify-center text-zinc-400 dark:text-zinc-500"
                    >
                        <svg
                            class="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.75"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M3.6 9h16.8M3.6 15h16.8" />
                            <path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
                        </svg>
                    </div>
                </div>
                <div class="flex flex-col items-center gap-1.5">
                    <span
                        class="font-display font-semibold tracking-tight text-sm text-zinc-900 dark:text-zinc-100"
                    >
                        MiSub
                    </span>
                    <span class="text-xs font-mono text-zinc-400 dark:text-zinc-500">
                        {{ t('common.loading') }}
                    </span>
                </div>
            </div>

            <template v-else-if="isLoggedIn">
                <!-- Security Banner -->
                <div
                    v-if="isDefaultPassword"
                    class="mb-4 px-4 py-3 bg-[#171717] text-zinc-200 rounded-md border border-zinc-800 shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)]"
                >
                    <div class="mx-auto flex max-w-7xl items-center justify-between gap-3">
                        <div class="flex items-center gap-2.5">
                            <span class="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"></span>
                            <p class="text-xs sm:text-sm font-medium text-zinc-200">
                                {{ defaultPasswordWarningMessage }}
                            </p>
                        </div>
                    </div>
                </div>

                <div
                    v-if="showUpdateNotice && versionReleaseInfo"
                    class="mb-4 rounded-md border border-zinc-800 bg-[#171717] px-4 py-3 text-zinc-200 shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)]"
                >
                    <div class="flex items-start justify-between gap-4">
                        <div class="space-y-1">
                            <p class="text-sm font-semibold text-zinc-100 flex items-center gap-2 font-mono">
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
                                target="_blank"
                                rel="noopener noreferrer"
                                class="inline-flex items-center gap-2 text-xs sm:text-sm font-mono font-medium text-zinc-200 underline decoration-zinc-600 underline-offset-4 hover:text-white"
                            >
                                {{ t('actions.viewReleaseNotes') }}
                            </a>
                        </div>
                        <button
                            @click="showUpdateNotice = false"
                            class="rounded-md border border-zinc-800 bg-transparent px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
                        >
                            {{ t('actions.gotIt') }}
                        </button>
                    </div>
                </div>

                <SavePrompt
                    :is-dirty="showSavePrompt"
                    :save-state="saveState"
                    @save="handleSave"
                    @discard="handleDiscard"
                />

                <router-view v-if="layoutMode === 'modern'" v-slot="{ Component }">
                    <transition name="fade" mode="out-in">
                        <RouteErrorBoundary :reset-key="route.fullPath">
                            <component :is="Component" />
                        </RouteErrorBoundary>
                    </transition>
                </router-view>

                <Dashboard v-else />
            </template>

            <!-- PUBLIC ROUTE VIEW (Not logged in, but isPublic) -->
            <template v-else-if="isPublicRoute">
                <router-view v-slot="{ Component }">
                    <transition name="fade" mode="out-in">
                        <RouteErrorBoundary :reset-key="route.fullPath">
                            <component :is="Component" />
                        </RouteErrorBoundary>
                    </transition>
                </router-view>
            </template>

            <!-- LOGIN VIEW (Not logged in, not public) -->
            <template v-else>
                <component :is="loginComponent" :login="login" />
            </template>
        </main>

        <Toast />
        <ConfirmDialog />
        <LegacyD1MigrationModal
            :show="showLegacyD1MigrationModal"
            :details="legacyD1Details"
            @update:show="handleLegacyD1MigrationClose"
            @success="handleLegacyD1MigrationSuccess"
        />
        <VersionChangelogModal
            :show="showVersionChangelogModal"
            :release="versionReleaseInfo || {}"
            :current-version="currentVersion"
            @update:show="versionStore.closeModal"
            @confirm="handleVersionModalConfirm"
            @suppress="handleVersionModalSuppress"
        />
        <Footer v-if="shouldShowFooter" :hide-branding="shouldHidePublicBranding" />
        <ScrollToTop v-if="isLoggedIn || isPublicRoute" />
    </div>
</template>

<style>
    :root {
        --safe-top: env(safe-area-inset-top, 0px);
        --safe-bottom: env(safe-area-inset-bottom, 0px);
    }

    .ios-content-offset {
        padding-top: calc(var(--safe-top));
    }

    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.2s ease;
    }

    .fade-enter-from,
    .fade-leave-to {
        opacity: 0;
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
