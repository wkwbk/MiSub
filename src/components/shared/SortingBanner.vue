<script setup>
    import { useI18n } from '@/i18n/index.js';

    defineProps({
        hint: {
            type: String,
            required: true,
        },
        bannerTestId: {
            type: String,
            default: undefined,
        },
        buttonTestId: {
            type: String,
            default: undefined,
        },
    });

    const emit = defineEmits(['finish']);
    const { t } = useI18n();
</script>

<template>
    <div
        :data-testid="bannerTestId"
        class="mb-4 flex items-center justify-between gap-3 rounded-md border border-sky-500/30 bg-sky-500/5 px-4 py-2.5 text-xs text-zinc-200"
    >
        <div class="flex min-w-0 flex-1 items-center gap-2">
            <span class="h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0"></span>
            <span>{{ hint }}</span>
        </div>
        <button
            type="button"
            :data-testid="buttonTestId"
            class="shrink-0 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/20 hover:text-sky-200 cursor-pointer"
            @click="emit('finish')"
        >
            {{ t('actions.finishSort') }}
        </button>
    </div>
</template>

