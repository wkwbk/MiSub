<script setup>
    import { computed } from 'vue';
    import { useUIStore } from '../../stores/ui.js';
    import { useSessionStore } from '../../stores/session.js';
    import BrandLogo from './BrandLogo.vue';
    import NavActionGroup from './NavActionGroup.vue';
    import { useI18n } from '../../i18n/index.js';

    const uiStore = useUIStore();
    const sessionStore = useSessionStore();
    const { t } = useI18n();

    const shouldHideLoginButton = computed(() => {
        if (sessionStore.sessionState === 'loading') {
            return true;
        }

        const rawPath = sessionStore.publicConfig?.customLoginPath;
        if (!rawPath || typeof rawPath !== 'string') {
            return false;
        }

        const normalizedPath = rawPath.trim().replace(/^\/+/, '');
        if (!normalizedPath || normalizedPath === 'login') {
            return false;
        }

        return true;
    });

    const props = defineProps({
        isLoggedIn: Boolean,
        hideBranding: {
            type: Boolean,
            default: false,
        },
    });

    const emit = defineEmits(['logout']);
</script>

<template>
    <header
        class="app-nav-bar ios-fixed-header bg-[#09090b] sticky top-0 z-50 border-b border-zinc-800 shadow-none"
    >
        <div class="ios-status-overlay"></div>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="safe-top-inset">
                <div class="flex justify-between items-center h-14">
                    <BrandLogo
                        v-if="!hideBranding"
                        :to="isLoggedIn ? '/dashboard' : '/'"
                        text-size-class="text-base"
                        :icon-size="24"
                    />
                    <router-link
                        v-else
                        :to="isLoggedIn ? '/dashboard' : '/'"
                        class="font-mono text-xs font-semibold tracking-widest uppercase text-zinc-400 hover:text-zinc-100"
                        >{{ t('app.home') }}</router-link
                    >

                    <NavActionGroup
                        :is-logged-in="isLoggedIn"
                        :show-explore="false"
                        :show-settings="true"
                        :show-login-button="!shouldHideLoginButton"
                        :hide-external-repo="hideBranding"
                        :with-focus-ring="true"
                        rounded-class="rounded-md"
                        @open-settings="uiStore.show()"
                        @toggle-layout="uiStore.toggleLayout()"
                        @logout="emit('logout')"
                    />
                </div>
            </div>
        </div>
    </header>
</template>
