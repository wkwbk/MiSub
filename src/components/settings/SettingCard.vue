<script setup>
import SectionHeader from './SectionHeader.vue';

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
  danger: {
    type: Boolean,
    default: false,
  },
});
</script>

<template>
  <section :class="danger ? 'border-red-900/50' : 'border-line'" class="rounded-lg border bg-surface p-6">
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
