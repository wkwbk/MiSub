<script setup>
    defineProps({
        title: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            default: '',
        },
        tone: {
            type: String,
            default: 'indigo',
        },
    });
</script>

<template>
    <div class="mb-5 flex items-start gap-3">
        <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-transparent text-zinc-300"
        >
            <slot name="icon" />
        </div>
        <div class="space-y-0.5">
            <h3 class="text-sm font-semibold text-zinc-100">{{ title }}</h3>
            <p v-if="description" class="text-xs text-zinc-400">
                {{ description }}
            </p>
        </div>
    </div>
</template>
