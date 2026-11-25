<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { Compass, LayoutGrid, LayoutPanelTop, LogOut, MessageSquare, Settings } from '@lucide/vue';
import ThemeToggle from '@/components/layout/ThemeToggle.vue';
import LoginEntryButton from '@/components/layout/LoginEntryButton.vue';
import ExternalRepoButton from '@/components/layout/ExternalRepoButton.vue';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher.vue';
import { useUIStore } from '@/stores/useUiStore.js';
import { useSessionStore } from '@/stores/useSessionStore.js';
import { useI18n } from '@/i18n/index.js';

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
const uiStore = useUIStore();
const sessionStore = useSessionStore();
const { layoutMode } = storeToRefs(uiStore);
const { t } = useI18n();
const isLegacyLayout = computed(() => layoutMode.value === 'legacy');
const layoutToggleLabel = computed(() =>
  isLegacyLayout.value ? t('actions.switchToModernLayout') : t('actions.switchToLegacyLayout'),
);
const showPublicFeedback = computed(
  () =>
    !props.isLoggedIn &&
    sessionStore.publicConfig?.enablePublicPage !== false &&
    (route.name === 'Home' || route.name === 'Explore'),
);
const canShowExplore = computed(() => props.showExplore);
const isExploreActive = computed(() => route.path === '/explore');
const exploreBtnClass = computed(() => {
  if (isExploreActive.value) {
    const base = ['nav-action-btn', props.roundedClass, 'nav-action-btn-active'];
    if (props.withFocusRing) base.push('nav-action-focus');
    return base;
  }
  return buildBtnClass('neutral');
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
      :aria-label="t('nav.explore')"
      :class="exploreBtnClass"
      :title="t('nav.explore')"
      to="/explore"
    >
      <Compass class="h-4 w-4" />
    </router-link>

    <button
      v-if="showPublicFeedback"
      :aria-label="t('nav.feedback')"
      :class="buildBtnClass('neutral')"
      :title="t('nav.feedback')"
      @click="handlePublicFeedback"
    >
      <MessageSquare class="h-4 w-4" />
    </button>

    <LanguageSwitcher />

    <ThemeToggle />

    <div v-if="showDivider" class="h-4 w-px bg-line mx-0.5"></div>

    <template v-if="isLoggedIn">
      <button
        v-if="showSettings"
        :aria-label="t('actions.openSettings')"
        :class="buildBtnClass('neutral')"
        :title="t('nav.settings')"
        @click="emit('openSettings')"
      >
        <Settings class="h-4 w-4" />
      </button>

      <button
        :aria-label="layoutToggleLabel"
        :aria-pressed="isLegacyLayout"
        :class="buildBtnClass('neutral')"
        :title="layoutToggleLabel"
        data-testid="layout-toggle-btn"
        @click="emit('toggleLayout')"
      >
        <LayoutGrid v-if="isLegacyLayout" class="h-4 w-4" />
        <LayoutPanelTop v-else class="h-4 w-4" />
      </button>

      <button
        :aria-label="t('actions.logout')"
        :class="buildBtnClass('danger')"
        :title="t('actions.logout')"
        @click="emit('logout')"
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
