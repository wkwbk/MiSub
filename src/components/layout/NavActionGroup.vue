<script setup>
    import { computed } from 'vue';
    import { useRoute } from 'vue-router';
    import { Compass, MessageSquare, Settings, LayoutGrid, LogOut } from 'lucide-vue-next';
    import ThemeToggle from '../features/ThemeToggle.vue';
    import LoginEntryButton from './LoginEntryButton.vue';
    import ExternalRepoButton from './ExternalRepoButton.vue';
    import LanguageSwitcher from './LanguageSwitcher.vue';
    import { useI18n } from '../../i18n/index.js';

    const props = defineProps({
        isLoggedIn: {
            type: Boolean,
            default: false,
        },
        showExplore: {
            type: Boolean,
            default: false,
        },
        showSettings: {
            type: Boolean,
            default: false,
        },
        showLoginButton: {
            type: Boolean,
            default: true,
        },
        roundedClass: {
            type: String,
            default: 'misub-radius-md',
        },
        withFocusRing: {
            type: Boolean,
            default: false,
        },
        showDivider: {
            type: Boolean,
            default: false,
        },
        hideExternalRepo: {
            type: Boolean,
            default: false,
        },
    });

    const emit = defineEmits(['openSettings', 'toggleLayout', 'logout']);
    const route = useRoute();
    const { t } = useI18n();
    const showPublicFeedback = computed(
        () => !props.isLoggedIn && (route.name === 'Home' || route.name === 'Explore')
    );
    const canShowExplore = computed(() => props.showExplore);
    const isExploreActive = computed(() => route.path === '/explore');
    const exploreBtnClass = computed(() => {
        const classes = buildBtnClass('neutral');
        if (isExploreActive.value) {
            classes.push(
                'bg-zinc-900',
                'text-zinc-100',
                'dark:bg-zinc-100',
                'dark:text-zinc-900',
                'border',
                'border-zinc-700',
                'dark:border-zinc-300'
            );
        }
        return classes;
    });

    function handlePublicFeedback() {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('open-guestbook'));
        }
    }

    function buildBtnClass(type) {
        const base = ['nav-action-btn', props.roundedClass];

        if (type === 'danger') {
            base.push('nav-action-btn-danger');
            if (props.withFocusRing) base.push('nav-action-focus-danger');
        } else {
            base.push('nav-action-btn-neutral');
            if (props.withFocusRing) base.push('nav-action-focus');
        }

        return base;
    }
</script>

<template>
    <div class="flex items-center gap-1 sm:gap-1.5">
        <router-link
            v-if="canShowExplore"
            to="/explore"
            :class="exploreBtnClass"
            :title="t('nav.explore')"
            :aria-label="t('nav.explore')"
        >
            <Compass class="h-4 w-4" />
        </router-link>

        <button
            v-if="showPublicFeedback"
            @click="handlePublicFeedback"
            :class="buildBtnClass('neutral')"
            :title="t('nav.feedback')"
            :aria-label="t('nav.feedback')"
        >
            <MessageSquare class="h-4 w-4" />
        </button>

        <LanguageSwitcher />

        <ThemeToggle />

        <div v-if="showDivider" class="h-4 w-px bg-zinc-200 dark:bg-white/10 mx-0.5"></div>

        <template v-if="isLoggedIn">
            <button
                v-if="showSettings"
                @click="emit('openSettings')"
                :class="buildBtnClass('neutral')"
                :title="t('nav.settings')"
                :aria-label="t('actions.openSettings')"
            >
                <Settings class="h-4 w-4" />
            </button>

            <button
                @click="emit('toggleLayout')"
                :class="buildBtnClass('neutral')"
                :title="t('actions.toggleLayout')"
                :aria-label="t('actions.toggleLayout')"
            >
                <LayoutGrid class="h-4 w-4" />
            </button>

            <button
                @click="emit('logout')"
                :class="buildBtnClass('danger')"
                :title="t('actions.logout')"
                :aria-label="t('actions.logout')"
            >
                <LogOut class="h-4 w-4" />
            </button>
        </template>

        <template v-else>
            <ExternalRepoButton v-if="!hideExternalRepo" :class-name="buildBtnClass('neutral')" />

            <LoginEntryButton v-if="showLoginButton" />
        </template>
    </div>
</template>
