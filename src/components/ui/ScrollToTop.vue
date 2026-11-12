<script setup>
    import { ref, onMounted, onUnmounted } from 'vue';
    import { useI18n } from '../../i18n/index.js';

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
            class="fixed z-50 bottom-24 md:bottom-8 right-4 md:right-8 p-2.5 bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 rounded-md shadow-none transition-colors duration-150 hover:bg-zinc-800 dark:hover:bg-white border border-zinc-800 dark:border-zinc-200"
            :aria-label="t('common.scrollToTop')"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
            >
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
            </svg>
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
