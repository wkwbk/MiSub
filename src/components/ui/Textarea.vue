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
    :class="[
      invalid
        ? 'border-red-500/60 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500'
        : 'border-line hover:border-line-strong focus-within:border-line-strong',
      wrapperClass,
    ]"
    :style="attrs.style"
    class="relative overflow-hidden rounded-md border bg-inset transition-colors"
  >
    <slot name="overlay" />
    <textarea
      :class="[attrs.class, textareaClass]"
      :value="modelValue"
      class="misub-textarea-inner block w-full border-0 bg-transparent text-fg placeholder:text-fg-subtle shadow-none outline-none focus:outline-none focus-visible:ring-0"
      v-bind="textareaAttrs"
      @blur="emit('blur', $event)"
      @focus="emit('focus', $event)"
      @input="handleInput"
    ></textarea>
  </div>
</template>

<style scoped>
.misub-textarea-inner {
  border-radius: 0;
}
</style>
