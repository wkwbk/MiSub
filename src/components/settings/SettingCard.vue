<script setup lang="ts">
import SectionHeader from './SectionHeader.vue';

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    tone?: string;
    noMargin?: boolean;
    danger?: boolean;
  }>(),
  {
    description: '',
    tone: 'indigo',
    noMargin: false,
    danger: false,
  },
);
</script>

<template>
  <section :class="danger ? 'border-red-900/50' : 'border-line'" class="rounded-lg border bg-surface p-4 sm:p-6">
    <SectionHeader :description="description" :no-margin="noMargin" :title="title" :tone="tone">
      <template v-if="$slots.icon" #icon>
        <slot name="icon" />
      </template>
      <template v-if="$slots.actions" #actions>
        <slot name="actions" />
      </template>
    </SectionHeader>
    <slot />
  </section>
</template>
