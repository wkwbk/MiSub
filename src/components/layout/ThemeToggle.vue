<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Moon, Sun } from '@lucide/vue';
import { useThemeStore } from '@/stores/useThemeStore.js';
import { useI18n } from '@/i18n/index.js';

const store = useThemeStore();
const { theme } = storeToRefs(store);
const { toggleTheme } = store;
const { t } = useI18n();
</script>

<template>
  <button
    :aria-label="theme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')"
    :aria-pressed="theme === 'dark'"
    :title="theme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')"
    class="nav-action-btn nav-action-btn-neutral rounded-md"
    @click="toggleTheme"
  >
    <div v-if="theme === 'dark'" key="dark-icon" class="transition-opacity duration-300">
      <Sun class="h-4 w-4" />
    </div>
    <div v-else key="light-icon" class="transition-opacity duration-300">
      <Moon class="h-4 w-4" />
    </div>
  </button>
</template>
