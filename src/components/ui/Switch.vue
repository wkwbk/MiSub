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
    :class="{ 'opacity-50 cursor-not-allowed': disabled }"
    class="relative inline-flex items-center cursor-pointer tap-effect select-none"
  >
    <input :checked="modelValue" :disabled="disabled" class="sr-only peer" type="checkbox" @change="toggle" />
    <div
      class="w-10 h-5 bg-inset border border-line-strong peer-focus-visible:outline-none rounded-md peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-fg-subtle after:rounded-sm after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5 peer-checked:after:bg-accent-fg peer-checked:bg-accent peer-checked:border-accent transition-all duration-200"
    ></div>
    <span v-if="label" class="ml-2.5 text-xs sm:text-sm font-medium text-fg-muted whitespace-nowrap shrink-0">
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
