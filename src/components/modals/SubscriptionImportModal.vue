<script setup>
import ImportModal from '@/components/modals/ImportModal.vue';

defineProps({
  show: Boolean,
  addNodesFromBulk: {
    type: Function,
    default: null,
  },
  tags: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['update:show']);
</script>

<template>
  <ImportModal
    :add-nodes-from-bulk="addNodesFromBulk"
    :show="show"
    :tags="tags"
    mode="nodes"
    @update:show="emit('update:show', $event)"
  />
</template>
