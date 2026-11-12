<script setup>
    import { useBackdropDismiss } from '../../composables/useBackdropDismiss.js';
    import { useI18n } from '../../i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        profile: {
            type: Object,
            required: true,
        },
        isExpanded: {
            type: Boolean,
            default: false,
        },
    });

    const emit = defineEmits(['close', 'download', 'register-canvas']);

    const { handleBackdropPointerDown, handleBackdropClick } = useBackdropDismiss(() =>
        emit('close')
    );
</script>

<template>
    <Teleport to="body">
        <Transition name="qr-overlay">
            <div
                v-if="isExpanded"
                @pointerdown.capture="handleBackdropPointerDown"
                @click.self="handleBackdropClick"
                class="fixed inset-0 bg-black/75 flex items-center justify-center"
                :style="{ zIndex: 'var(--z-modal)' }"
                role="dialog"
                aria-modal="true"
            >
                <div
                    class="relative bg-white dark:bg-[#0c0c0e] rounded-md p-6 shadow-none max-w-sm w-full mx-4 transform transition-all border border-zinc-200 dark:border-zinc-800"
                    @click.stop
                >
                    <!-- Close Button -->
                    <button
                        @click="emit('close')"
                        class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                        :aria-label="t('common.close')"
                    >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>

                    <div class="flex flex-col items-center pt-2">
                        <h4 class="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                            {{ profile.name }}
                        </h4>
                        <p class="text-xs text-zinc-500 mb-5">
                            {{ t('public.scanToImport') }}
                        </p>

                        <div
                            class="bg-white p-3 rounded-md shadow-none border border-zinc-200 dark:border-zinc-800 w-64 h-64 flex items-center justify-center"
                        >
                            <canvas
                                :ref="
                                    (el) => {
                                        if (el) emit('register-canvas', profile.id, el);
                                    }
                                "
                                class="max-w-full h-auto rounded-sm"
                            ></canvas>
                        </div>

                        <button
                            @click="emit('download')"
                            class="mt-6 w-full flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-medium text-zinc-100 dark:text-zinc-900 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white rounded-md transition-colors shadow-none"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                />
                            </svg>
                            {{ t('public.downloadQr') }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
    .qr-overlay-enter-active .bg-white,
    .qr-overlay-leave-active .bg-white,
    .qr-overlay-enter-active .dark\:bg-gray-800,
    .qr-overlay-leave-active .dark\:bg-gray-800 {
        transition:
            transform 0.3s ease,
            opacity 0.3s ease;
    }

    .qr-overlay-enter-from {
        opacity: 0;
    }

    .qr-overlay-enter-from > div {
        transform: scale(0.9);
        opacity: 0;
    }

    .qr-overlay-leave-to {
        opacity: 0;
    }

    .qr-overlay-leave-to > div {
        transform: scale(0.9);
        opacity: 0;
    }
</style>
