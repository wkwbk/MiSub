<script setup>
import { computed, ref, watch } from 'vue';
import { Layers } from '@lucide/vue';
import Modal from '@/components/ui/Modal.vue';
import TagInput from '@/components/ui/TagInput.vue';
import LineNumberTextarea from '@/components/ui/LineNumberTextarea.vue';
import { useDataStore } from '@/stores/useDataStore.js';
import { extractSubscriptionTagNames } from '@/composables/useSubscriptionBulkImport.js';
import { normalizeTagList } from '@/utils/tags.js';
import { useI18n } from '@/i18n/index.js';

const { t } = useI18n();
const dataStore = useDataStore();

const props = defineProps({
  show: Boolean,
});

const emit = defineEmits(['update:show', 'import']);

const importText = ref('');
const selectedTags = ref([]);

const subscriptionTagNames = computed(() => extractSubscriptionTagNames(dataStore.subscriptions || []));

watch(
  () => props.show,
  (visible) => {
    if (!visible) {
      importText.value = '';
      selectedTags.value = [];
    }
  },
);

const handleConfirm = () => {
  if (!importText.value.trim()) return;
  emit('import', importText.value, normalizeTagList(selectedTags.value));
  importText.value = '';
  selectedTags.value = [];
  emit('update:show', false);
};
</script>

<template>
  <Modal
    :close-on-confirm="false"
    :confirm-disabled="!importText.trim()"
    :show="show"
    size="2xl"
    @confirm="handleConfirm"
    @update:show="emit('update:show', $event)"
  >
    <template #title>
      <div class="flex items-center gap-3">
        <Layers class="h-5 w-5 text-fg-muted shrink-0" />
        <div>
          <h3 class="text-base font-semibold text-fg">
            {{ t('subscriptionBulkImport.title') }}
          </h3>
          <p class="mt-0.5 text-xs text-fg-muted">
            {{ t('subscriptionBulkImport.description') }}
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <button
        class="px-4 py-2 border border-line bg-transparent hover:bg-hover text-fg-muted hover:text-fg font-medium text-xs rounded-md transition-colors"
        @click="emit('update:show', false)"
      >
        {{ t('actions.cancel') }}
      </button>
      <button
        :disabled="!importText.trim()"
        class="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none text-accent-fg font-semibold text-xs rounded-md transition-colors"
        @click="handleConfirm"
      >
        {{ t('actions.confirm') }}
      </button>
    </template>

    <template #body>
      <div class="space-y-5">
        <div class="relative">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-semibold text-fg-muted mb-1">
              {{ t('subscriptionBulkImport.tagsLabel') }}
            </label>
            <TagInput
              v-model="selectedTags"
              :placeholder="t('subscriptionBulkImport.tagsPlaceholder')"
              :suggestions="subscriptionTagNames"
            />
          </div>
        </div>

        <div class="relative group space-y-1.5">
          <LineNumberTextarea
            v-model="importText"
            :rows="8"
            placeholder="https://example.com/api/v1/client/subscribe?token=...&#10;http://sub.example.com/link/..."
          />
          <p class="text-xs text-fg-subtle">
            {{ t('subscriptionBulkImport.helper') }}
          </p>
        </div>
      </div>
    </template>
  </Modal>
</template>
