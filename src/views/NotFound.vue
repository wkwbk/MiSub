<template>
  <div class="not-found-container font-sans text-fg">
    <div class="relative z-10 border border-line bg-surface rounded-md p-10 max-w-lg w-[90%] text-center shadow-none">
      <div class="font-mono font-bold text-7xl text-fg mb-4">404</div>

      <h1 class="text-xl font-semibold mb-3 tracking-tight text-fg">
        {{ t('notFound.title') }}
      </h1>
      <p class="text-sm text-fg-muted mb-8 leading-relaxed">
        {{ t('notFound.description') }}<br />
        {{ t('notFound.loginHint') }}
      </p>

      <router-link
        class="inline-flex items-center justify-center px-6 py-2.5 text-xs font-semibold text-accent-fg bg-accent hover:opacity-90 rounded-md transition-colors shadow-none"
        to="/"
      >
        <ArrowLeft class="h-4 w-4 mr-2" />
        {{ t('actions.backToHome') }}
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { ArrowLeft } from '@lucide/vue';
import { useSessionStore } from '@/stores/session.js';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();
const sessionStore = useSessionStore();

const normalizedCustomPath = computed(() => {
  const raw = sessionStore.publicConfig?.customLoginPath;
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/^\/+/, '');
});

const hasCustomPath = computed(() => {
  const normalized = normalizedCustomPath.value;
  return normalized.length > 0 && normalized !== 'login';
});

const loginPath = computed(() => (hasCustomPath.value ? `/${normalizedCustomPath.value}` : '/login'));
</script>

<style scoped>
.not-found-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 1rem;
}
</style>
