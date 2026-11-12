<script setup>
    import QRCodeOverlay from './QRCodeOverlay.vue';
    import BaseIcon from '../ui/BaseIcon.vue';
    import { useI18n } from '../../i18n/index.js';

    const { t } = useI18n();

    const props = defineProps({
        profile: {
            type: Object,
            required: true,
        },
        isQrExpanded: {
            type: Boolean,
            default: false,
        },
    });

    const emit = defineEmits([
        'quick-import',
        'preview',
        'copy-link',
        'toggle-qr',
        'download-qr',
        'register-canvas',
    ]);

    const ICONS = {
        import: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
        preview:
            'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
        link: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
        qr: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z',
    };
</script>

<template>
    <div class="relative w-full">
        <!-- Main Card Content -->
        <div
            class="relative bg-white dark:bg-[#171717] rounded-md p-6 lg:p-8 shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)] border border-zinc-200 dark:border-zinc-800"
        >
            <div class="flex flex-col lg:flex-row items-center gap-6 lg:gap-10">
                <!-- 1. Brand / Header Column -->
                <div
                    class="flex-shrink-0 flex flex-col items-center lg:items-start text-center lg:text-left space-y-2.5"
                >
                    <div
                        class="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
                    >
                        <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                        <span>{{ t('public.featured') }}</span>
                    </div>

                    <div>
                        <h3
                            class="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight"
                        >
                            {{ profile.name }}
                        </h3>
                    </div>
                </div>

                <!-- 2. Description Column (Middle) -->
                <div
                    class="flex-1 border-t lg:border-t-0 lg:border-l border-zinc-200 dark:border-zinc-800 pt-5 lg:pt-0 lg:pl-10 w-full lg:w-auto text-center lg:text-left"
                >
                    <p
                        class="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed max-w-2xl mx-auto lg:mx-0"
                    >
                        {{ profile.description || t('public.heroDescription') }}
                    </p>
                </div>

                <!-- 3. Action Column (Right) -->
                <div class="flex-shrink-0 w-full lg:w-auto flex flex-col gap-2.5 min-w-[200px]">
                    <button
                        @click="emit('quick-import', profile)"
                        class="group flex w-full items-center justify-center rounded-md bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white px-5 py-2.5 text-xs font-medium text-zinc-100 dark:text-zinc-900 transition-colors shadow-none"
                    >
                        <BaseIcon :path="ICONS.import" className="mr-2 w-4 h-4" />
                        {{ t('public.quickImport') }}
                    </button>

                    <div class="grid grid-cols-2 gap-2">
                        <button
                            @click="emit('preview', profile)"
                            class="flex items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900"
                        >
                            <BaseIcon :path="ICONS.preview" className="w-3.5 h-3.5 mr-1.5" />
                            {{ t('public.preview') }}
                        </button>
                        <button
                            @click="emit('copy-link', profile)"
                            class="flex items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-800 bg-transparent px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900"
                        >
                            <BaseIcon :path="ICONS.link" className="w-3.5 h-3.5 mr-1.5" />
                            {{ t('actions.copy') }}
                        </button>
                    </div>

                    <button
                        @click="emit('toggle-qr', profile)"
                        class="mt-1 flex items-center justify-center gap-1.5 cursor-pointer text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors w-full bg-transparent border-0"
                    >
                        <BaseIcon :path="ICONS.qr" className="w-3.5 h-3.5" />
                        <span>{{
                            isQrExpanded ? t('actions.hideQrCode') : t('actions.showQrCode')
                        }}</span>
                    </button>
                </div>
            </div>

            <QRCodeOverlay
                :profile="profile"
                :is-expanded="isQrExpanded"
                @close="emit('toggle-qr', profile)"
                @download="emit('download-qr', profile)"
                @register-canvas="(id, el) => emit('register-canvas', id, el)"
            />
        </div>
    </div>
</template>
