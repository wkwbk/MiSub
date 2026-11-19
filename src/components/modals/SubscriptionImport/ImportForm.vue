<script setup>
    import { useI18n } from '@/i18n/index.js';
    import { computed } from 'vue';

    const { t } = useI18n();

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
            class="block text-xs font-medium text-fg-muted mb-2"
        >
            {{ t('importNodes.subscriptionUrl') }}
        </label>
        <input
            id="subscription-url"
            v-model="urlModel"
            type="url"
            placeholder="https://example.com/subscription-link"
            class="w-full px-3 py-2 text-sm font-mono border border-line rounded-md bg-inset text-fg focus-visible:outline-hidden focus:border-line-strong disabled:opacity-50"
            @keyup.enter="emit('submit')"
            :disabled="isLoading"
        />
    </div>

    <div class="text-xs text-fg-subtle">
        <p>{{ t('importNodes.importHint') }}</p>
    </div>
</template>
