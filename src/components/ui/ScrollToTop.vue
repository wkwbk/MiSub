<script setup>
    import { onMounted, onUnmounted, ref } from 'vue';
    import { ChevronUp } from '@lucide/vue';
    import { useI18n } from '@/i18n/index.js';

    const { t } = useI18n();

    const isVisible = ref(false);
    const scrollThreshold = 300;

    const handleScroll = () => {
        isVisible.value = window.scrollY > scrollThreshold;
    };

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth',
        });
    };

    onMounted(() => {
        window.addEventListener('scroll', handleScroll, { passive: true });
    });

    onUnmounted(() => {
        window.removeEventListener('scroll', handleScroll);
    });
</script>

<template>
    <Transition name="scroll-top">
        <button
            v-if="isVisible"
            @click="scrollToTop"
            class="popover-surface hidden md:inline-flex fixed z-50 md:bottom-8 md:right-8 p-2.5 text-fg rounded-md transition-colors duration-200 hover:bg-active"
            :aria-label="t('common.scrollToTop')"
        >
            <ChevronUp class="h-4 w-4" />
        </button>
    </Transition>
</template>

<style scoped>
    .scroll-top-enter-active,
    .scroll-top-leave-active {
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .scroll-top-enter-from,
    .scroll-top-leave-to {
        opacity: 0;
        transform: translateY(20px) scale(0.8);
    }

    @media (prefers-reduced-motion: reduce) {
        .scroll-top-enter-active,
        .scroll-top-leave-active {
            transition: opacity 0.2s ease;
        }

        .scroll-top-enter-from,
        .scroll-top-leave-to {
            transform: none;
        }
    }
</style>
