<script setup>
import { computed, ref, watch } from 'vue';
import { Check, GripVertical, Pencil, Tag, Trash2, X } from '@lucide/vue';
import Modal from '@/components/ui/Modal.vue';
import draggable from 'vuedraggable';
import { useI18n } from '@/i18n/index.js';
import { confirmAction } from '@/composables/useConfirm.js';
import { normalizeTagName } from '@/utils/tags.js';

const { t } = useI18n();

const props = defineProps({
  show: Boolean,
  tags: {
    type: Array,
    default: () => [],
  },
  allowReorder: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['close', 'rename', 'delete', 'reorder', 'update:show']);

const localTags = ref([]);
const editingIndex = ref(null);
const editingName = ref('');

const syncTags = () => {
  localTags.value = (props.tags || []).map((name) => ({ name }));
};

watch(
  () => [props.show, props.tags],
  ([visible]) => {
    if (visible) {
      syncTags();
    }
  },
  { deep: true },
);

const handleClose = () => {
  editingIndex.value = null;
  editingName.value = '';
  emit('update:show', false);
  emit('close');
};

const startEdit = (index) => {
  editingIndex.value = index;
  editingName.value = localTags.value[index].name;
};

const cancelEdit = () => {
  editingIndex.value = null;
  editingName.value = '';
};

const confirmEdit = () => {
  const newName = normalizeTagName(editingName.value);
  if (!newName || editingIndex.value === null) {
    cancelEdit();
    return;
  }

  const oldName = localTags.value[editingIndex.value]?.name;
  if (oldName && newName !== oldName) {
    emit('rename', oldName, newName);
    const merged = [];
    const seen = new Set();
    for (const item of localTags.value) {
      const target = item.name === oldName ? newName : item.name;
      if (!seen.has(target)) {
        seen.add(target);
        merged.push({ name: target });
      }
    }
    localTags.value = merged;
  }

  cancelEdit();
};

const handleDelete = async (tagName) => {
  const confirmed = await confirmAction({
    message: t('tags.deleteTagConfirm', { name: tagName }),
    variant: 'danger',
  });
  if (!confirmed) return;

  emit('delete', tagName);
  localTags.value = localTags.value.filter((item) => item.name !== tagName);
};

const handleDragEnd = () => {
  const newOrder = localTags.value.map((item) => item.name);
  emit('reorder', newOrder);
};

const isDraggable = computed(() => props.allowReorder && localTags.value.length > 1);
</script>

<template>
  <Modal :show="show" size="2xl" @update:show="(val) => !val && handleClose()">
    <template #title>
      <div class="flex items-center gap-2">
        <Tag class="h-4 w-4 text-fg-subtle" />
        <span class="text-base font-semibold text-fg">{{ t('tags.manage') }}</span>
      </div>
    </template>

    <template #body>
      <div class="space-y-3">
        <div v-if="localTags.length === 0" class="text-center py-8 text-fg-subtle">
          <Tag class="h-8 w-8 mx-auto mb-2 text-fg-subtle" />
          <p class="text-sm">{{ t('tags.noTags') }}</p>
        </div>

        <draggable
          v-else
          v-model="localTags"
          :disabled="!isDraggable"
          animation="200"
          class="space-y-2"
          handle=".drag-handle"
          item-key="name"
          @end="handleDragEnd"
        >
          <template #item="{ element, index }">
            <div
              :class="editingIndex === index ? 'border-line-strong' : 'hover:border-line-strong'"
              class="flex items-center gap-3 p-3 rounded-md border border-line bg-inset transition-colors"
            >
              <button
                v-if="isDraggable"
                :aria-label="t('common.dragToSort')"
                :title="t('common.dragToSort')"
                class="drag-handle cursor-move text-fg-muted hover:text-fg"
                type="button"
              >
                <GripVertical class="h-4 w-4" />
              </button>

              <div class="flex-1 min-w-0">
                <input
                  v-if="editingIndex === index"
                  v-model="editingName"
                  :aria-label="t('tags.renameTag')"
                  autofocus
                  class="w-full px-3 py-1.5 text-sm border border-line-strong rounded-md focus-visible:outline-none bg-surface text-fg"
                  type="text"
                  @keyup.enter="confirmEdit"
                  @keyup.esc="cancelEdit"
                />
                <div v-else class="flex items-center gap-2 min-w-0">
                  <span class="truncate text-sm font-medium text-fg">{{ element.name }}</span>
                </div>
              </div>

              <div class="flex items-center gap-1 shrink-0">
                <template v-if="editingIndex === index">
                  <button
                    :aria-label="t('actions.confirm')"
                    :title="t('actions.confirm')"
                    class="p-1.5 text-emerald-500 hover:bg-hover rounded-md transition-colors touch-target cursor-pointer"
                    type="button"
                    @click="confirmEdit"
                  >
                    <Check class="h-4 w-4" />
                  </button>
                  <button
                    :aria-label="t('actions.cancel')"
                    :title="t('actions.cancel')"
                    class="p-1.5 text-fg-subtle hover:bg-hover rounded-md transition-colors touch-target cursor-pointer"
                    type="button"
                    @click="cancelEdit"
                  >
                    <X class="h-4 w-4" />
                  </button>
                </template>
                <template v-else>
                  <button
                    :aria-label="t('tags.renameTag')"
                    :title="t('tags.renameTag')"
                    class="p-1.5 text-fg-subtle hover:text-fg hover:bg-hover rounded-md transition-colors touch-target cursor-pointer"
                    type="button"
                    @click="startEdit(index)"
                  >
                    <Pencil class="h-4 w-4" />
                  </button>
                  <button
                    :aria-label="t('actions.delete')"
                    :title="t('actions.delete')"
                    class="p-1.5 text-fg-subtle hover:text-red-500 hover:bg-hover rounded-md transition-colors touch-target cursor-pointer"
                    type="button"
                    @click="handleDelete(element.name)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </template>
              </div>
            </div>
          </template>
        </draggable>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end w-full">
        <button
          class="px-4 py-2 bg-accent hover:opacity-90 text-accent-fg font-semibold text-xs rounded-md transition-colors cursor-pointer"
          type="button"
          @click="handleClose"
        >
          {{ t('actions.confirm') }}
        </button>
      </div>
    </template>
  </Modal>
</template>
