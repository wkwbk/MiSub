<script setup>
    import { computed, useAttrs } from 'vue';

    defineOptions({
        inheritAttrs: false,
    });

    const props = defineProps({
        modelValue: {
            type: [String, Number],
            default: '',
        },
        invalid: {
            type: Boolean,
            default: false,
        },
        wrapperClass: {
            type: [String, Array, Object],
            default: '',
        },
        textareaClass: {
            type: [String, Array, Object],
            default: '',
        },
    });

    const emit = defineEmits(['update:modelValue', 'input', 'focus', 'blur']);
    const attrs = useAttrs();

    const textareaAttrs = computed(() => {
        const { class: _class, style: _style, ...rest } = attrs;
        return rest;
    });

    const handleInput = (event) => {
        emit('update:modelValue', event.target.value);
        emit('input', event);
    };
</script>

<template>
    <div
        class="relative overflow-hidden rounded-md border bg-[#131515] transition-colors"
        :class="[
            invalid
                ? 'border-red-500/60 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500'
                : 'border-zinc-800 focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500',
            wrapperClass,
        ]"
        :style="attrs.style"
    >
        <slot name="overlay" />
        <textarea
            v-bind="textareaAttrs"
            :value="modelValue"
            @input="handleInput"
            @focus="emit('focus', $event)"
            @blur="emit('blur', $event)"
            class="misub-textarea-inner block w-full border-0 bg-transparent text-zinc-100 placeholder-zinc-600 shadow-none outline-none focus:outline-none focus-visible:ring-0"
            :class="[attrs.class, textareaClass]"
        ></textarea>
    </div>
</template>

<style scoped>
    .misub-textarea-inner {
        border-radius: 0;
    }
</style>
