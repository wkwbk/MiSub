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
        'toggle-qr',
        'preview',
        'copy-link',
        'download-qr',
        'register-canvas',
    ]);

    // Icon Paths
    const ICONS = {
        import: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
        qr: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z',
        preview:
            'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
        link: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
    };
</script>

<template>
    <div
        class="group relative flex h-full flex-col rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#171717] p-5 transition-all duration-200 hover:border-zinc-400 dark:hover:border-zinc-700 shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)] hover:shadow-[0_0_18px_rgba(0,0,0,0.16)] dark:hover:shadow-[0_0_20px_rgba(0,0,0,0.65)]"
    >
        <!-- Header: Title & QR Toggle -->
        <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2.5 min-w-0">
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                <h3
                    class="text-base font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1"
                    :title="profile.name"
                >
                    {{ profile.name }}
                </h3>
            </div>

            <!-- QR Toggle (Small Top Right) -->
            <button
                @click.stop="emit('toggle-qr', profile)"
                class="rounded-md border border-zinc-200 dark:border-zinc-800 p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                :title="t('actions.showQrCode')"
                :class="{
                    'bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100':
                        isQrExpanded,
                }"
                :aria-label="t('actions.showQrCode')"
            >
                <BaseIcon :path="ICONS.qr" className="w-4 h-4" />
            </button>
        </div>

        <!-- Body: Description -->
        <div class="flex-1 mb-5">
            <p class="text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed line-clamp-3">
                {{ profile.description || t('public.noDescription') }}
            </p>
        </div>

        <!-- Footer: Action Bar -->
        <div
            class="mt-auto pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2"
        >
            <!-- Primary Action: Import -->
            <button
                @click="emit('quick-import', profile)"
                class="flex flex-1 items-center justify-center gap-2 rounded-md bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white px-4 py-2 text-xs font-medium text-zinc-100 dark:text-zinc-900 transition-colors shadow-none"
                :aria-label="t('public.quickImportSubscription')"
            >
                <BaseIcon :path="ICONS.import" className="w-3.5 h-3.5" />
                {{ t('public.quickImport') }}
            </button>

            <!-- Secondary Actions -->
            <button
                @click="emit('preview', profile)"
                class="rounded-md border border-zinc-200 dark:border-zinc-800 p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                :title="t('public.previewNodes')"
                :aria-label="t('public.previewNodes')"
            >
                <BaseIcon :path="ICONS.preview" className="w-4 h-4" />
            </button>

            <button
                @click="emit('copy-link', profile)"
                class="rounded-md border border-zinc-200 dark:border-zinc-800 p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                :title="t('actions.copyLink')"
                :aria-label="t('public.copySubscriptionLink')"
            >
                <BaseIcon :path="ICONS.link" className="w-4 h-4" />
            </button>
        </div>

        <QRCodeOverlay
            :profile="profile"
            :is-expanded="isQrExpanded"
            @close="emit('toggle-qr', profile)"
            @download="emit('download-qr', profile)"
            @register-canvas="(id, el) => emit('register-canvas', id, el)"
        />
    </div>
</template>
