<script setup>
    import { useI18n } from '../../../i18n/index.js';

    const { t } = useI18n();
    const props = defineProps({
        isLoading: {
            type: Boolean,
            default: false,
        },
        parseStatus: {
            type: String,
            default: '',
        },
        errorMessage: {
            type: String,
            default: '',
        },
        successMessage: {
            type: String,
            default: '',
        },
    });
</script>

<template>
    <div v-if="isLoading || parseStatus || errorMessage || successMessage" class="space-y-2">
        <!-- 加载状态 -->
        <div
            v-if="isLoading"
            class="flex items-center space-x-2 text-xs text-zinc-600 dark:text-zinc-300"
        >
            <div class="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-zinc-500"></div>
            <span>{{ parseStatus || t('importNodes.processing') }}</span>
        </div>

        <!-- 成功信息 -->
        <div
            v-if="successMessage"
            class="flex items-center space-x-2 text-xs text-zinc-700 dark:text-zinc-300"
        >
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
            <span>{{ successMessage }}</span>
        </div>

        <!-- 错误信息 -->
        <div
            v-if="errorMessage"
            class="flex items-center space-x-2 text-xs text-red-500"
        >
            <span class="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0"></span>
            <span>{{ errorMessage }}</span>
        </div>
    </div>
</template>
