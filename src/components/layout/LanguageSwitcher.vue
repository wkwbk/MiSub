<script setup lang="ts">
import { computed } from 'vue';
import { Languages } from '@lucide/vue';
import { useI18n } from '@/i18n/index.js';

const { locale, setLocale, t } = useI18n();

const isZh = computed(() => locale.value === 'zh-CN');

function toggleLocale(): void {
  setLocale(isZh.value ? 'en-US' : 'zh-CN');
}
</script>

<template>
  <button
    :aria-label="isZh ? t('common.switchToEnglish') : t('common.switchToChinese')"
    :title="isZh ? t('common.switchToEnglish') : t('common.switchToChinese')"
    class="nav-action-btn nav-action-btn-neutral rounded-md"
    @click="toggleLocale"
  >
    <Languages class="h-4 w-4" />
  </button>
</template>
