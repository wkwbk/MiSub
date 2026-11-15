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
        noMargin: {
            type: Boolean,
            default: false,
        },
    });
</script>

<template>
    <div
        class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        :class="noMargin ? 'mb-0' : 'mb-6'"
    >
        <div class="space-y-1.5 min-w-0">
            <div class="flex items-center gap-2">
                <span v-if="$slots.icon" class="text-zinc-400 shrink-0 flex items-center">
                    <slot name="icon" />
                </span>
                <h3 class="text-sm font-semibold text-zinc-100">{{ title }}</h3>
            </div>
            <p v-if="description" class="text-xs text-zinc-400 leading-relaxed">
                {{ description }}
            </p>
        </div>
        <div v-if="$slots.actions" class="shrink-0 flex items-center gap-2 sm:self-start">
            <slot name="actions" />
        </div>
    </div>
</template>
