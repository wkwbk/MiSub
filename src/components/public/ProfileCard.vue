<script setup>
    import { Download, Eye, Link2, QrCode } from 'lucide-vue-next';
    import QRCodeOverlay from './QRCodeOverlay.vue';
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
</script>

<template>
    <div
        class="group relative flex h-full flex-col rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#171717] dark:hover:bg-[#202020] p-5 transition-all duration-200 hover:border-zinc-400 dark:hover:border-zinc-700 shadow-[0_0_13px_rgba(0,0,0,0.11)] dark:shadow-[0_0_15px_rgba(0,0,0,0.45)] hover:shadow-[0_8px_22px_rgba(0,0,0,0.16)] dark:hover:shadow-[0_8px_26px_rgba(0,0,0,0.7)] hover:-translate-y-1 hover:z-10"
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
                class="rounded-md border border-zinc-200 dark:border-zinc-800 p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                :title="t('actions.showQrCode')"
                :class="{
                    'bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100':
                        isQrExpanded,
                }"
                :aria-label="t('actions.showQrCode')"
            >
                <QrCode class="w-4 h-4" />
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
                <Download class="w-3.5 h-3.5" />
                {{ t('public.quickImport') }}
            </button>

            <!-- Secondary Actions -->
            <button
                @click="emit('preview', profile)"
                class="rounded-md border border-zinc-200 dark:border-zinc-800 p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                :title="t('public.previewNodes')"
                :aria-label="t('public.previewNodes')"
            >
                <Eye class="w-4 h-4" />
            </button>

            <button
                @click="emit('copy-link', profile)"
                class="rounded-md border border-zinc-200 dark:border-zinc-800 p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                :title="t('actions.copyLink')"
                :aria-label="t('public.copySubscriptionLink')"
            >
                <Link2 class="w-4 h-4" />
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
