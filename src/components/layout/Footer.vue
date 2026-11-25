<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from '@/i18n/index.js';
import { useVersionStore } from '@/stores/useVersionStore.js';
import packageJson from '../../../package.json';

withDefaults(
  defineProps<{
    hideBranding?: boolean;
    hasMobileNav?: boolean;
  }>(),
  {
    hideBranding: false,
    hasMobileNav: false,
  },
);

const { t } = useI18n();
const versionStore = useVersionStore();
const { hasUpdate, latestRelease } = storeToRefs(versionStore);
const currentYear = computed(() => new Date().getFullYear());
const currentVersion = packageJson.version;
</script>

<template>
  <footer
    :class="{ 'footer-with-mobile-nav': hasMobileNav }"
    class="hidden md:block w-full text-center px-4 py-4 border-t border-line bg-canvas"
  >
    <div class="flex flex-col sm:flex-row items-center justify-center gap-2 text-xs text-fg-subtle">
      <p class="font-mono">
        <template v-if="!hideBranding">
          Copyright © {{ currentYear }}
          <a
            class="font-semibold text-fg-muted hover:text-fg hover:underline transition-colors"
            href="https://github.com/wkwbk/MiSub"
            rel="noopener noreferrer"
            target="_blank"
          >
            MiSUB </a
          >. All Rights Reserved.
        </template>
        <template v-else> Copyright © {{ currentYear }}. All Rights Reserved. </template>
      </p>
      <button
        :title="
          hasUpdate && latestRelease?.tag_name
            ? t('notices.updateAvailable', { version: latestRelease.tag_name })
            : undefined
        "
        class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-transparent text-xs font-mono text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer border border-line hover:border-line-strong touch-target-min"
        type="button"
        @click="versionStore.openModal"
      >
        <span v-if="hasUpdate" aria-hidden="true" class="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"></span>
        <span>v{{ currentVersion }}</span>
      </button>
    </div>
  </footer>
</template>

<style scoped>
@media (max-width: 767.98px) {
  .footer-with-mobile-nav {
    padding-bottom: calc(6rem + max(env(safe-area-inset-bottom, 0px), 12px));
  }
}
</style>
