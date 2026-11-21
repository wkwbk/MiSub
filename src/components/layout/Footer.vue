<script setup>
import { computed } from 'vue';
import { useVersionStore } from '@/stores/version';
import packageJson from '../../../package.json';

defineProps({
  hideBranding: {
    type: Boolean,
    default: false,
  },
  hasMobileNav: {
    type: Boolean,
    default: false,
  },
});

const versionStore = useVersionStore();
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
        class="px-2 py-0.5 rounded-md bg-transparent text-[10px] font-mono text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer border border-line hover:border-line-strong touch-target-min"
        @click="versionStore.openModal"
      >
        v{{ currentVersion }}
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
