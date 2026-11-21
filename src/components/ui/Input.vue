<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: '',
  },
  label: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    default: 'text',
  },
  error: {
    type: String,
    default: '',
  },
  id: {
    type: String,
    default: () => `input-${Math.random().toString(36).substr(2, 9)}`,
  },
  prefix: {
    type: String,
    default: '',
  },
  icon: {
    type: String,
    default: null,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  autocomplete: {
    type: String,
    default: 'off',
  },
  name: {
    type: String,
    default: undefined,
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
});

const emit = defineEmits(['update:modelValue']);

const updateValue = (event) => {
  emit('update:modelValue', event.target.value);
};

const hasIcon = computed(() => props.icon !== null);
const hasPrefix = computed(() => props.prefix !== '');

// 尺寸映射支持
const sizeMap = {
  sm: {
    input: 'h-8 py-1 text-xs rounded-md px-2.5',
    label: 'text-xs mb-1',
    icon: 'h-4 w-4',
  },
  md: {
    input: 'h-9 py-1.5 text-sm rounded-md px-3',
    label: 'text-xs mb-1.5',
    icon: 'h-4 w-4',
  },
  lg: {
    input: 'h-10 py-2 text-base rounded-md px-3.5',
    label: 'text-xs mb-1.5',
    icon: 'h-5 w-5',
  },
};

const currentSize = computed(() => sizeMap[props.size] || sizeMap.md);
</script>

<template>
  <div class="w-full">
    <label v-if="label" :class="currentSize.label" :for="id" class="block font-medium text-fg-muted">
      {{ label }}
    </label>
    <div class="relative group">
      <!-- Icon Slot/Prop -->
      <div
        v-if="hasIcon"
        class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-fg-subtle group-focus-within:text-fg-muted transition-colors"
      >
        <slot name="icon">
          <svg :class="currentSize.icon" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path :d="icon" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
          </svg>
        </slot>
      </div>

      <!-- Prefix Slot/Prop -->
      <div
        v-else-if="hasPrefix"
        class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-colors duration-200 text-fg-subtle"
      >
        <slot name="prefix">
          <span :class="props.size === 'sm' ? 'text-[10px]' : 'text-sm'" class="font-mono">{{ prefix }}</span>
        </slot>
      </div>

      <input
        :id="id"
        :autocomplete="autocomplete"
        :class="[
          currentSize.input,
          hasIcon || hasPrefix ? 'pl-9' : '',
          error ? 'border-red-500 focus:border-red-500' : '',
        ]"
        :disabled="disabled"
        :name="name"
        :placeholder="placeholder"
        :type="type"
        :value="modelValue"
        class="w-full bg-inset border border-line text-fg placeholder:text-fg-subtle hover:border-line-strong focus:border-line-strong focus-visible:outline-none transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-none"
        @input="updateValue"
      />
    </div>

    <p v-if="error" class="mt-1 text-xs text-red-400">
      {{ error }}
    </p>
  </div>
</template>
