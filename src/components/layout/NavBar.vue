<script setup>
    import { computed } from 'vue';
    import { useRoute } from 'vue-router';
    import { useUIStore } from '../../stores/ui.js';
    import { useSessionStore } from '../../stores/session.js';
    import { storeToRefs } from 'pinia';
    import BaseIcon from '../ui/BaseIcon.vue';
    import BrandLogo from './BrandLogo.vue';
    import NavActionGroup from './NavActionGroup.vue';
    import { MAIN_NAV_ITEMS } from '../../constants/navigation.js';
    import { useI18n } from '../../i18n/index.js';

    const route = useRoute();
    const uiStore = useUIStore();
    const sessionStore = useSessionStore();
    const { publicConfig } = storeToRefs(sessionStore);
    const isPublicEnabled = computed(() => publicConfig.value?.enablePublicPage === true);
    const hideBranding = computed(
        () =>
            publicConfig.value?.customPage?.enabled === true &&
            publicConfig.value?.customPage?.hideBranding === true
    );
    const { t } = useI18n();

    defineProps({
        isLoggedIn: Boolean,
    });

    const emit = defineEmits(['logout']);

    const navItems = MAIN_NAV_ITEMS;

    function isActive(path) {
        if (path === '/') return route.path === '/';
        if (path === '/dashboard') return route.path === '/dashboard';
        return route.path.startsWith(path);
    }
</script>

<template>
    <header
        :aria-label="t('nav.top')"
        class="app-nav-bar md:hidden sticky top-0 z-50 flex items-center justify-between px-4 py-2.5 w-full bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 transition-colors duration-200 shadow-none"
    >
        <BrandLogo to="/dashboard" text-size-class="text-lg" :icon-size="32" />

        <NavActionGroup
            :is-logged-in="isLoggedIn"
            :show-explore="isPublicEnabled"
            :hide-external-repo="hideBranding"
            :with-focus-ring="true"
            rounded-class="rounded-md"
            @toggle-layout="uiStore.toggleLayout()"
            @logout="emit('logout')"
        />
    </header>

    <header
        :aria-label="t('nav.main')"
        class="app-nav-bar hidden md:block sticky top-0 z-50 w-full bg-white/80 dark:bg-[#09090b]/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 transition-colors duration-200 shadow-none"
    >
        <div
            class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 md:h-[64px] flex items-center justify-between"
        >
            <div class="shrink-0 pr-5">
                <BrandLogo to="/dashboard" text-size-class="text-lg" :icon-size="32" />
            </div>

            <nav :aria-label="t('nav.main')" class="nav-tab-shell">
                <router-link
                    v-for="item in navItems"
                    :key="item.path"
                    :to="item.path"
                    class="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors duration-150"
                    :class="
                        isActive(item.path)
                            ? 'bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 font-semibold'
                            : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-900/60'
                    "
                >
                    <BaseIcon
                        :path="item.iconPath"
                        className="relative z-10 h-4 w-4 shrink-0"
                    />
                    <span class="relative z-10">{{ t(item.key) }}</span>
                </router-link>
            </nav>

            <div class="flex items-center pl-5 ml-3 gap-2">
                <NavActionGroup
                    :is-logged-in="isLoggedIn"
                    :show-explore="isPublicEnabled"
                    :hide-external-repo="hideBranding"
                    :with-focus-ring="true"
                    :show-divider="true"
                    rounded-class="rounded-md"
                    @toggle-layout="uiStore.toggleLayout()"
                    @logout="emit('logout')"
                />
            </div>
        </div>
    </header>

    <nav v-if="isLoggedIn" :aria-label="t('nav.bottom')" class="md:hidden mobile-nav-glass">
        <div class="mobile-nav-inner">
            <router-link
                v-for="item in navItems"
                :key="item.path"
                :to="item.path"
                class="nav-mobile-item"
                :class="isActive(item.path) ? 'nav-mobile-item-active' : 'nav-mobile-item-inactive'"
            >
                <span class="nav-mobile-icon-wrap">
                    <BaseIcon
                        :path="item.iconPath"
                        className="w-5 h-5 transition-transform duration-300"
                        :class="isActive(item.path) ? 'scale-110' : ''"
                    />
                </span>

                <span
                    class="text-[clamp(0.625rem,2.6vw,0.75rem)] font-medium tracking-tight leading-tight text-center"
                    >{{ t(item.key) }}</span
                >
            </router-link>
        </div>
    </nav>
</template>
