<script setup>
import { computed } from 'vue';
import { LogIn } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';

const props = defineProps({
  to: {
    type: String,
    default: '',
  },
});

const { t } = useI18n();

const loginPath = computed(() => props.to || '/login');
</script>

<template>
  <router-link
    :aria-label="t('actions.login')"
    :title="t('actions.login')"
    :to="loginPath"
    class="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-semibold text-accent-fg bg-accent hover:opacity-90 rounded-md transition-colors"
  >
    <LogIn class="h-4 w-4" />
    <span>{{ t('actions.login') }}</span>
  </router-link>
</template>
