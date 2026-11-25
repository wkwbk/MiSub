<script setup>
import ImportModal from '@/components/modals/ImportModal.vue';

defineProps({
  show: Boolean,
});

const emit = defineEmits(['update:show', 'import', 'files-imported']);
</script>

<template>
  <ImportModal
    :show="show"
    mode="bulk"
    @files-imported="(nodes, tags) => emit('files-imported', nodes, tags)"
    @import="(text, tags) => emit('import', text, tags)"
    @update:show="emit('update:show', $event)"
  />
</template>
