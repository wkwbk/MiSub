<script setup>
    const props = defineProps({
        modelValue: {
            type: Boolean,
            default: false,
        },
        label: {
            type: String,
            default: '',
        },
        disabled: {
            type: Boolean,
            default: false,
        },
    });

    const emit = defineEmits(['update:modelValue', 'change']);

    const toggle = () => {
        if (props.disabled) return;
        const newValue = !props.modelValue;
        emit('update:modelValue', newValue);
        emit('change', newValue);
    };
</script>

<template>
    <label
        class="relative inline-flex items-center cursor-pointer tap-effect select-none"
        :class="{ 'opacity-50 cursor-not-allowed': disabled }"
    >
        <input
            type="checkbox"
            class="sr-only peer"
            :checked="modelValue"
            :disabled="disabled"
            @change="toggle"
        />
        <div
            class="w-10 h-5 bg-zinc-200 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 peer-focus-visible:outline-none rounded-md peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:after:bg-zinc-400 after:rounded-sm after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5 peer-checked:after:bg-white dark:peer-checked:after:bg-zinc-900 peer-checked:bg-zinc-900 dark:peer-checked:bg-zinc-100 peer-checked:border-zinc-900 dark:peer-checked:border-zinc-100 transition-all duration-200"
        ></div>
        <span v-if="label" class="ml-3 text-sm font-medium text-zinc-300">
            {{ label }}
        </span>
    </label>
</template>

<style scoped>
    /* Optional: Add active press effect */
    .tap-effect:active .after {
        width: 24px;
    }
</style>
