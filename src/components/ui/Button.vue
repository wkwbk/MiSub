<script setup>
import { computed } from 'vue';
import { Loader2 } from '@lucide/vue';

const props = defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'danger', 'ghost', 'outline'].includes(value),
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
  loading: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  icon: {
    type: String,
    default: null,
  },
  iconOnly: {
    type: Boolean,
    default: false,
  },
  type: {
    type: String,
    default: 'button',
  },
  ariaLabel: {
    type: String,
    // 默认 undefined：空字符串会渲染出 aria-label=""，
    // 反而覆盖按钮自身的文本内容，使读屏软件读不出按钮名。
    default: undefined,
  },
});

const emit = defineEmits(['click']);

const variantClasses = computed(() => {
  const variants = {
    primary: 'bg-accent hover:opacity-90 text-accent-fg border border-accent font-semibold shadow-none',
    secondary:
      'bg-transparent hover:bg-hover hover:border-line-strong text-fg-muted hover:text-fg border border-line shadow-none',
    danger:
      'bg-transparent hover:bg-red-500/10 text-red-500 dark:text-red-400 hover:text-red-400 dark:hover:text-red-300 border border-line hover:border-red-500/40 shadow-none',
    ghost: 'bg-transparent hover:bg-hover text-fg-muted hover:text-fg',
    outline: 'bg-transparent hover:bg-hover hover:border-line-strong text-fg border border-line shadow-none',
  };
  return variants[props.variant];
});

const sizeClasses = computed(() => {
  if (props.iconOnly) {
    const sizes = {
      sm: 'p-1.5',
      md: 'p-2',
      lg: 'p-3',
    };
    return sizes[props.size];
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-6 py-2.5 text-base gap-2',
  };
  return sizes[props.size];
});

const handleClick = (event) => {
  if (!props.disabled && !props.loading) {
    emit('click', event);
  }
};
</script>

<template>
  <button
    :aria-label="ariaLabel"
    :class="[variantClasses, sizeClasses]"
    :disabled="disabled || loading"
    :type="type"
    class="relative inline-flex items-center justify-center rounded-md font-medium tap-effect cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group tracking-normal transition-colors duration-200 focus-visible:outline-none"
    @click="handleClick"
  >
    <Loader2 v-if="loading" class="w-4 h-4 animate-spin relative z-10" />

    <svg v-else-if="icon" class="w-4 h-4 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path :d="icon" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" />
    </svg>

    <span v-if="!iconOnly" class="relative z-10">
      <slot />
    </span>
  </button>
</template>
