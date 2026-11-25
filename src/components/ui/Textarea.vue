<script setup lang="ts">
import { computed, useAttrs, type StyleValue } from 'vue';

defineOptions({
  inheritAttrs: false,
});

withDefaults(
  defineProps<{
    modelValue?: string | number;
    invalid?: boolean;
    wrapperClass?: string | unknown[] | Record<string, unknown>;
    textareaClass?: string | unknown[] | Record<string, unknown>;
  }>(),
  {
    modelValue: '',
    invalid: false,
    wrapperClass: '',
    textareaClass: '',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  input: [event: Event];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();
const attrs = useAttrs();

const wrapperStyle = computed(() => attrs.style as StyleValue | undefined);
const textareaAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});

const handleInput = (event: Event): void => {
  const target = event.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);
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
    :style="wrapperStyle"
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
