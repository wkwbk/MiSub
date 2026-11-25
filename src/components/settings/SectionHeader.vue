<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    tone?: string;
    noMargin?: boolean;
  }>(),
  {
    description: '',
    tone: 'indigo',
    noMargin: false,
  },
);
</script>

<template>
  <div :class="noMargin ? 'mb-0' : 'mb-6'" class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="space-y-1.5 min-w-0">
      <div class="flex items-center gap-2">
        <span v-if="$slots.icon" class="text-fg-muted shrink-0 flex items-center">
          <slot name="icon" />
        </span>
        <h3 class="text-sm font-semibold text-fg">{{ title }}</h3>
      </div>
      <p v-if="description" class="text-xs text-fg-muted leading-relaxed">
        {{ description }}
      </p>
    </div>
    <div v-if="$slots.actions" class="shrink-0 flex items-center gap-2 sm:self-start">
      <slot name="actions" />
    </div>
  </div>
</template>
