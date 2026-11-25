<script setup>
import ImportModal from '@/components/modals/ImportModal.vue';

defineProps({
  show: Boolean,
});

const emit = defineEmits(['update:show', 'import']);
</script>

<template>
  <ImportModal
    :show="show"
    mode="subscriptions"
    @import="(text, tags) => emit('import', text, tags)"
    @update:show="emit('update:show', $event)"
  />
</template>
