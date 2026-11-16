<script setup>
    import { useI18n } from '@/i18n/index.js';

    defineProps({
        isNavigating: {
            type: Boolean,
            default: false,
        },
        progress: {
            type: Number,
            default: 0,
        },
        isFadingOut: {
            type: Boolean,
            default: false,
        },
        showSlowIndicator: {
            type: Boolean,
            default: false,
        },
    });

    const { t } = useI18n();
</script>

<template>
    <div
        v-if="isNavigating"
        class="fixed top-0 left-0 right-0 z-[100] h-[2px] pointer-events-none"
        aria-hidden="true"
    >
        <div
            class="h-full bg-zinc-900 dark:bg-zinc-100 transition-[width,opacity] duration-150 ease-out"
            :class="isFadingOut ? 'opacity-0' : 'opacity-100'"
            :style="{ width: `${progress}%` }"
        ></div>
    </div>

    <Transition name="fade">
        <div
            v-if="isNavigating && showSlowIndicator"
            class="fixed inset-0 z-40 flex items-center justify-center bg-zinc-50/40 dark:bg-[#131515]/50 backdrop-blur-[1px] pointer-events-none select-none"
            role="status"
            aria-live="polite"
        >
            <div
                class="flex items-center gap-2.5 px-4 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#171717]/95 shadow-sm"
            >
                <span
                    class="w-4 h-4 rounded-full border-2 border-zinc-200 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 animate-spin"
                ></span>
                <span class="text-xs font-mono text-zinc-700 dark:text-zinc-300">
                    {{ t('common.loading') }}
                </span>
            </div>
        </div>
    </Transition>
</template>
