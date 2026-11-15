<script setup>
    import { useI18n } from '../../../i18n/index.js';

    const { t } = useI18n();
    import { computed } from 'vue';

    const props = defineProps({
        subscriptionUrl: {
            type: String,
            default: '',
        },
        isLoading: {
            type: Boolean,
            default: false,
        },
    });

    const emit = defineEmits(['update:subscriptionUrl', 'submit']);

    const urlModel = computed({
        get: () => props.subscriptionUrl,
        set: (val) => emit('update:subscriptionUrl', val),
    });
</script>

<template>
    <div>
        <label
            for="subscription-url"
            class="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2"
        >
            {{ t('importNodes.subscriptionUrl') }}
        </label>
        <input
            id="subscription-url"
            v-model="urlModel"
            type="url"
            placeholder="https://example.com/subscription-link"
            class="w-full px-3 py-2 text-sm font-mono border border-zinc-300 dark:border-zinc-800 rounded-md bg-white dark:bg-[#131515] text-zinc-900 dark:text-zinc-100 focus-visible:outline-hidden focus:border-zinc-500 disabled:opacity-50"
            @keyup.enter="emit('submit')"
            :disabled="isLoading"
        />
    </div>

    <div class="text-xs text-zinc-500">
        <p>{{ t('importNodes.importHint') }}</p>
    </div>
</template>
