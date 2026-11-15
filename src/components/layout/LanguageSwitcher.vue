<script setup>
    import { computed } from 'vue';
    import { Languages } from 'lucide-vue-next';
    import { useI18n } from '../../i18n/index.js';

    const { locale, setLocale, t } = useI18n();

    const isZh = computed(() => locale.value === 'zh-CN');

    function toggleLocale() {
        setLocale(isZh.value ? 'en-US' : 'zh-CN');
    }
</script>

<template>
    <button
        @click="toggleLocale"
        class="nav-action-btn nav-action-btn-neutral rounded-md"
        :title="isZh ? t('common.switchToEnglish') : t('common.switchToChinese')"
        :aria-label="isZh ? t('common.switchToEnglish') : t('common.switchToChinese')"
    >
        <Languages class="h-4 w-4" />
    </button>
</template>
