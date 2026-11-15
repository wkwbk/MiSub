<script setup>
    import { computed } from 'vue';

    const props = defineProps({
        status: {
            type: String,
            required: true,
            validator: (value) =>
                ['idle', 'loading', 'success', 'error', 'warning'].includes(value),
        },
        message: {
            type: String,
            default: '',
        },
        size: {
            type: String,
            default: 'md',
            validator: (value) => ['sm', 'md', 'lg'].includes(value),
        },
    });

    const statusConfig = computed(() => {
        const configs = {
            idle: {
                dot: 'bg-zinc-500',
            },
            loading: {
                dot: 'bg-sky-500 animate-pulse',
            },
            success: {
                dot: 'bg-emerald-500',
            },
            error: {
                dot: 'bg-red-500',
            },
            warning: {
                dot: 'bg-amber-500',
            },
        };
        return configs[props.status] || configs.idle;
    });

    const sizeClasses = computed(() => {
        const sizes = {
            sm: {
                container: 'px-2 py-0.5 text-xs',
            },
            md: {
                container: 'px-2.5 py-1 text-xs',
            },
            lg: {
                container: 'px-3 py-1.5 text-sm',
            },
        };
        return sizes[props.size];
    });
</script>

<template>
    <div
        class="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-transparent text-zinc-300 font-medium transition-colors"
        :class="[sizeClasses.container]"
        role="status"
        aria-live="polite"
    >
        <span
            class="h-1.5 w-1.5 rounded-full shrink-0"
            :class="[statusConfig.dot]"
            aria-hidden="true"
        ></span>
        <span v-if="message">{{ message }}</span>
        <slot v-else />
    </div>
</template>
